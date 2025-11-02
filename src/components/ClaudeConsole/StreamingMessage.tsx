import React, { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface StreamingMessageProps {
  content: string;
  isStreaming: boolean;
  tokenCount?: number;
  className?: string;
}

export const StreamingMessage: React.FC<StreamingMessageProps> = ({
  content,
  isStreaming,
  tokenCount,
  className = ''
}) => {
  const [displayContent, setDisplayContent] = useState('');
  const [showCursor, setShowCursor] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  // Smooth content update with minimal flicker
  useEffect(() => {
    setDisplayContent(content);
  }, [content]);

  // Blinking cursor effect
  useEffect(() => {
    if (!isStreaming) {
      setShowCursor(false);
      return;
    }

    const interval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 500);

    return () => clearInterval(interval);
  }, [isStreaming]);

  // Auto-scroll to show new content
  useEffect(() => {
    if (contentRef.current && isStreaming) {
      const element = contentRef.current;
      const parent = element.parentElement;
      if (parent) {
        const isNearBottom = parent.scrollHeight - parent.scrollTop - parent.clientHeight < 100;
        if (isNearBottom) {
          parent.scrollTop = parent.scrollHeight;
        }
      }
    }
  }, [displayContent, isStreaming]);

  return (
    <div className={`relative ${className}`}>
      <div ref={contentRef}>
        <pre className="whitespace-pre-wrap font-mono text-sm">
          {displayContent}
          {isStreaming && showCursor && (
            <span className="inline-block w-2 h-4 bg-current animate-pulse ml-0.5" />
          )}
        </pre>
      </div>
      
      {isStreaming && (
        <div className="absolute top-0 right-0 flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Streaming</span>
          {tokenCount !== undefined && tokenCount > 0 && (
            <span className="text-gray-400">({tokenCount} tokens)</span>
          )}
        </div>
      )}
    </div>
  );
};