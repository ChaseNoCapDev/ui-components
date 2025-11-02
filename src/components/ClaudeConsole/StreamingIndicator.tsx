import React from 'react';
import { Zap, Circle } from 'lucide-react';

interface StreamingIndicatorProps {
  isStreaming: boolean;
  messageCount: number;
  tokenCount: number;
  lastActivity?: Date;
}

export const StreamingIndicator: React.FC<StreamingIndicatorProps> = ({
  isStreaming,
  messageCount,
  tokenCount,
  lastActivity
}) => {
  const timeSinceActivity = lastActivity 
    ? Math.floor((Date.now() - lastActivity.getTime()) / 1000)
    : 0;

  return (
    <div className="flex items-center space-x-3 text-xs">
      {isStreaming ? (
        <>
          <div className="flex items-center space-x-1">
            <Circle className="h-2 w-2 fill-green-500 text-green-500 animate-pulse" />
            <span className="text-green-600 dark:text-green-400">Live</span>
          </div>
          <div className="flex items-center space-x-1 text-gray-500 dark:text-gray-400">
            <Zap className="h-3 w-3" />
            <span>{messageCount} messages</span>
          </div>
          {tokenCount > 0 && (
            <span className="text-gray-500 dark:text-gray-400">
              {tokenCount} tokens
            </span>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center space-x-1">
            <Circle className="h-2 w-2 fill-gray-400 text-gray-400" />
            <span className="text-gray-500 dark:text-gray-400">Complete</span>
          </div>
          {lastActivity && timeSinceActivity < 60 && (
            <span className="text-gray-400 dark:text-gray-500">
              {timeSinceActivity}s ago
            </span>
          )}
        </>
      )}
    </div>
  );
};