import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Send, Terminal, Loader2, Trash2, Save, FolderOpen, Plus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { claudeStreamingV2, ClaudeStreamEvent } from '@/services/claudeServiceStreamingV2';
import { claudeSessionManager, Session, ConsoleMessage } from '@/services/claudeSessionManager';
import { Markdown } from '@/components/Markdown';
import { cn } from '@/lib/utils';
import { useSubscription } from '@apollo/client';
import { PREWARM_STATUS_SUBSCRIPTION } from '@/graphql/claude-prewarm';

export const ClaudeConsoleV2: React.FC = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [showSessionManager, setShowSessionManager] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<Date>(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Pre-warm status subscription
  const { data: preWarmData } = useSubscription(PREWARM_STATUS_SUBSCRIPTION);
  const preWarmStatus = preWarmData?.preWarmStatus;

  // UI heartbeat logging
  useEffect(() => {
    const heartbeatInterval = setInterval(() => {
      const now = new Date();
      console.log('[UI Heartbeat]', {
        timestamp: now.toISOString(),
        currentSessionId: currentSession?.id,
        isProcessing,
        messageCount: messages.length,
        streamingEnabled: true, // V2 is always streaming
        lastActivity: lastHeartbeat.toISOString()
      });
      setLastHeartbeat(now);
    }, 30000); // Every 30 seconds

    return () => clearInterval(heartbeatInterval);
  }, [currentSession, isProcessing, messages.length, lastHeartbeat]);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (currentSession) {
      saveCurrentSession();
    }
  }, [messages]);

  const showError = (title: string, message: string) => {
    toast({
      variant: 'destructive',
      title,
      description: message,
    });
  };

  const showInfo = (title: string, message: string) => {
    toast({
      title,
      description: message,
    });
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const loadSessions = async () => {
    try {
      const loadedSessions = await claudeSessionManager.getSessions();
      setSessions(loadedSessions);
    } catch (error) {
      showError('Failed to load sessions', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const createNewSession = async () => {
    const session: Session = {
      id: crypto.randomUUID(),
      name: `Session ${new Date().toLocaleTimeString()}`,
      createdAt: new Date(),
      lastAccessed: new Date(),
      messages: []
    };

    await claudeSessionManager.saveSession(session);
    setCurrentSession(session);
    setMessages([]);
    await loadSessions();
    setShowSessionManager(false);
    showInfo('New session created', session.name);
  };

  const saveCurrentSession = async () => {
    if (!currentSession) return;

    const updatedSession: Session = {
      ...currentSession,
      lastAccessed: new Date(),
      messages,
      metadata: {
        ...currentSession.metadata,
        totalCostUsd: messages.reduce((sum, msg) => sum + (msg.metadata?.costUsd || 0), 0)
      }
    };

    await claudeSessionManager.saveSession(updatedSession);
    setSessions(prev => 
      prev.map(s => s.id === updatedSession.id ? updatedSession : s)
    );
  };

  const handleSubmit = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage: ConsoleMessage = {
      id: crypto.randomUUID(),
      type: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      // Create a placeholder for the assistant's response
      const assistantMessageId = crypto.randomUUID();
      const assistantMessage: ConsoleMessage = {
        id: assistantMessageId,
        type: 'assistant',
        content: '',
        timestamp: new Date(),
        metadata: {
          sessionId: currentSession?.id
        }
      };
      setMessages(prev => [...prev, assistantMessage]);

      let fullContent = '';
      let claudeSessionId: string | undefined;

      // Execute and stream the response
      const { sessionId, unsubscribe } = await claudeStreamingV2.executeAndStream(
        {
          prompt: userMessage.content,
          sessionId: currentSession?.id,
          claudeSessionId: currentSession?.metadata?.claudeSessionId
        },
        (event: ClaudeStreamEvent) => {
          console.log('[ClaudeConsoleV2] Stream event:', event);

          switch (event.type) {
            case 'INIT':
              // Update Claude session ID
              claudeSessionId = event.data.claudeSessionId;
              if (currentSession && claudeSessionId) {
                setCurrentSession(prev => prev ? {
                  ...prev,
                  metadata: { ...prev.metadata, claudeSessionId }
                } : null);
              }
              break;

            case 'TEXT':
              // Append text content
              fullContent += event.data.content;
              setMessages(prev => prev.map(msg => 
                msg.id === assistantMessageId 
                  ? { ...msg, content: fullContent }
                  : msg
              ));
              break;

            case 'TOOL':
              // Show tool usage (optional)
              console.log('[ClaudeConsoleV2] Tool used:', event.data);
              break;

            case 'RESULT':
              // Final result - update metadata
              setMessages(prev => prev.map(msg => 
                msg.id === assistantMessageId 
                  ? { 
                      ...msg, 
                      metadata: {
                        ...msg.metadata,
                        duration: event.data.duration,
                        costUsd: event.data.cost,
                        claudeSessionId: event.data.claudeSessionId
                      }
                    }
                  : msg
              ));
              break;

            case 'ERROR':
              // Handle error
              showError('Claude Error', event.data.error);
              setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));
              break;

            case 'COMPLETE':
              // Session complete
              console.log('[ClaudeConsoleV2] Session completed', {
                exitCode: event.data.exitCode,
                duration: event.data.duration,
                claudeSessionId: event.data.claudeSessionId
              });
              
              // Clean up and focus input
              unsubscribe();
              setIsProcessing(false);
              
              // Focus the input box after completion
              setTimeout(() => {
                if (inputRef.current) {
                  inputRef.current.focus();
                  console.log('[ClaudeConsoleV2] Input box focused after completion');
                }
              }, 100);
              break;

            case 'RAW':
              // Log raw data for debugging
              console.log('[ClaudeConsoleV2] Raw event:', event.data);
              break;
          }
        }
      );

      // Update session ID if new
      if (!currentSession || currentSession.id !== sessionId) {
        const newSession: Session = {
          id: sessionId,
          name: currentSession?.name || `Session ${new Date().toLocaleTimeString()}`,
          createdAt: currentSession?.createdAt || new Date(),
          lastAccessed: new Date(),
          messages: [],
          metadata: { claudeSessionId }
        };
        setCurrentSession(newSession);
        
        // Update session list
        setSessions(prev => {
          const existing = prev.findIndex(s => s.id === sessionId);
          if (existing >= 0) {
            return prev.map((s, i) => i === existing ? newSession : s);
          } else {
            return [...prev, newSession];
          }
        });
      }

    } catch (error) {
      console.error('[ClaudeConsoleV2] Error:', error);
      showError('Failed to execute command', error instanceof Error ? error.message : 'Unknown error');
      setIsProcessing(false);
      
      // Remove the placeholder message on error
      setMessages(prev => prev.slice(0, -1));
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            <CardTitle>Claude Console v2 (Streaming Only)</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {preWarmStatus && (
              <div className={cn(
                "text-xs px-2 py-1 rounded",
                preWarmStatus.status === 'READY' ? 'bg-green-100 text-green-800' : 
                preWarmStatus.status === 'WARMING' ? 'bg-yellow-100 text-yellow-800' : 
                'bg-gray-100 text-gray-800'
              )}>
                {preWarmStatus.status === 'READY' ? '⚡ Ready for fast response' :
                 preWarmStatus.status === 'WARMING' ? '🔥 Warming up...' :
                 '💤 Idle'}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSessionManager(!showSessionManager)}
            >
              <FolderOpen className="h-4 w-4 mr-1" />
              Sessions
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={createNewSession}
            >
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {showSessionManager && (
          <div className="border-b p-4 space-y-2 max-h-48 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Sessions</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSessionManager(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {sessions.map(session => (
              <div
                key={session.id}
                className={cn(
                  "flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-100",
                  currentSession?.id === session.id && "bg-blue-50"
                )}
                onClick={() => {
                  setCurrentSession(session);
                  setMessages(session.messages);
                  setShowSessionManager(false);
                }}
              >
                <div>
                  <div className="font-medium text-sm">{session.name}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(session.lastAccessed).toLocaleString()}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await claudeSessionManager.deleteSession(session.id);
                    await loadSessions();
                    if (currentSession?.id === session.id) {
                      setCurrentSession(null);
                      setMessages([]);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4 min-h-0">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.type === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg p-3",
                    message.type === 'user'
                      ? 'bg-blue-500 text-white'
                      : message.type === 'system'
                      ? 'bg-gray-100 text-gray-700'
                      : 'bg-gray-100 text-gray-900'
                  )}
                >
                  {message.type === 'assistant' ? (
                    <Markdown content={message.content} />
                  ) : (
                    <pre className="whitespace-pre-wrap font-mono text-sm">
                      {message.content}
                    </pre>
                  )}
                  {message.metadata && (
                    <div className="mt-2 text-xs opacity-70">
                      {message.metadata.duration && 
                        `Duration: ${(message.metadata.duration / 1000).toFixed(2)}s`}
                      {message.metadata.costUsd && 
                        ` • Cost: $${message.metadata.costUsd.toFixed(4)}`}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isProcessing && messages[messages.length - 1]?.content === '' && (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Claude is thinking...</span>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={isProcessing}
              className="flex-1"
              autoFocus
            />
            <Button type="submit" disabled={isProcessing || !input.trim()}>
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
};