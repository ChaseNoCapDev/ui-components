import { gql } from '@apollo/client';

// New subscription for streaming command output
export const STREAMING_COMMAND_OUTPUT_SUBSCRIPTION = gql`
  subscription OnStreamingCommandOutput($sessionId: ID!) {
    streamingCommandOutput(sessionId: $sessionId) {
      sessionId
      type
      content
      timestamp
      isFinal
      tokens
    }
  }
`;

// Types for streaming messages
export interface StreamingCommandOutput {
  sessionId: string;
  type: 'STDOUT' | 'STDERR' | 'SYSTEM' | 'PROGRESS' | 'FINAL' | 'HEARTBEAT';
  content: string;
  timestamp: string;
  isFinal: boolean;
  tokens?: number;
}

// Streaming state management
export interface StreamingState {
  isStreaming: boolean;
  buffer: string;
  lastHeartbeat: Date;
  messageCount: number;
  tokenCount: number;
}