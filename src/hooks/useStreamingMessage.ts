import { useState, useCallback, useRef, useEffect } from 'react';
import { StreamingCommandOutput, StreamingState } from '../graphql/claude-streaming';
import { features } from '../config/features';

interface UseStreamingMessageOptions {
  onComplete?: (finalContent: string, totalTokens: number) => void;
  onError?: (error: Error) => void;
  smoothUpdates?: boolean;
}

export function useStreamingMessage(options: UseStreamingMessageOptions = {}) {
  const [content, setContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);
  
  const bufferRef = useRef<string>('');
  const updateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const { smoothUpdates = features.SMOOTH_STREAMING_UPDATES } = options;

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
      if (heartbeatTimerRef.current) {
        clearTimeout(heartbeatTimerRef.current);
      }
    };
  }, []);

  // Smooth content updates
  const updateContent = useCallback((newContent: string) => {
    if (smoothUpdates) {
      bufferRef.current = newContent;
      
      // Debounce updates for smoother display
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
      
      updateTimerRef.current = setTimeout(() => {
        setContent(bufferRef.current);
      }, 50); // Update every 50ms for smooth display
    } else {
      setContent(newContent);
    }
  }, [smoothUpdates]);

  // Start streaming
  const startStreaming = useCallback(() => {
    setIsStreaming(true);
    setContent('');
    setTokenCount(0);
    setMessageCount(0);
    setLastHeartbeat(new Date());
    bufferRef.current = '';
    
    // Start heartbeat monitor
    heartbeatTimerRef.current = setInterval(() => {
      if (lastHeartbeat) {
        const timeSinceHeartbeat = Date.now() - lastHeartbeat.getTime();
        if (timeSinceHeartbeat > features.STREAMING_HEARTBEAT_TIMEOUT) {
          console.warn('Streaming heartbeat timeout');
          if (options.onError) {
            options.onError(new Error('Streaming connection timeout'));
          }
          stopStreaming();
        }
      }
    }, 5000); // Check every 5 seconds
  }, [lastHeartbeat, options]);

  // Process streaming message
  const processMessage = useCallback((message: StreamingCommandOutput) => {
    if (!isStreaming) return;

    setMessageCount(prev => prev + 1);

    switch (message.type) {
      case 'STDOUT':
      case 'SYSTEM':
        updateContent((bufferRef.current || '') + message.content);
        break;
        
      case 'PROGRESS':
        if (message.tokens) {
          setTokenCount(message.tokens);
        }
        break;
        
      case 'HEARTBEAT':
        setLastHeartbeat(new Date());
        break;
        
      case 'FINAL':
        const finalContent = (bufferRef.current || '') + message.content;
        updateContent(finalContent);
        stopStreaming();
        if (options.onComplete) {
          options.onComplete(finalContent, tokenCount);
        }
        break;
        
      case 'STDERR':
        if (options.onError) {
          options.onError(new Error(message.content));
        }
        break;
    }
    
    // Update heartbeat on any message
    setLastHeartbeat(new Date());
  }, [isStreaming, tokenCount, updateContent, options]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    setIsStreaming(false);
    
    // Clear any pending updates
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
      setContent(bufferRef.current); // Ensure final content is set
    }
    
    // Clear heartbeat monitor
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  // Get current state
  const getState = useCallback((): StreamingState => ({
    isStreaming,
    buffer: content,
    lastHeartbeat: lastHeartbeat || new Date(),
    messageCount,
    tokenCount
  }), [isStreaming, content, lastHeartbeat, messageCount, tokenCount]);

  return {
    content,
    isStreaming,
    tokenCount,
    messageCount,
    lastHeartbeat,
    startStreaming,
    processMessage,
    stopStreaming,
    getState
  };
}