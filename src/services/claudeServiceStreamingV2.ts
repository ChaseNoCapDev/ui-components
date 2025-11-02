import { apolloClient } from '@/lib/apollo-client';
import { createLogger } from '@/utils/logger';
import gql from 'graphql-tag';

const logger = createLogger('claudeServiceStreamingV2');

// GraphQL operations for streaming-only Claude interface
const EXECUTE_STREAMING = gql`
  mutation ExecuteStreaming($input: ClaudeStreamInput!) {
    executeStreaming(input: $input) {
      sessionId
      accepted
      error
    }
  }
`;

const CLAUDE_STREAM_EVENTS = gql`
  subscription ClaudeStreamEvents($sessionId: String!) {
    claudeStreamEvents(sessionId: $sessionId) {
      type
      sessionId
      timestamp
      data
    }
  }
`;

export interface ClaudeStreamInput {
  prompt: string;
  sessionId?: string;
  workingDirectory?: string;
  claudeSessionId?: string;
}

export interface ClaudeStreamResult {
  sessionId: string;
  accepted: boolean;
  error?: string;
}

export interface ClaudeStreamEvent {
  type: 'INIT' | 'TEXT' | 'TOOL' | 'RESULT' | 'ERROR' | 'COMPLETE' | 'RAW';
  sessionId: string;
  timestamp: string;
  data: any;
}

export class ClaudeServiceStreamingV2 {
  /**
   * Execute a Claude command with streaming - THE ONLY WAY
   */
  async executeStreaming(input: ClaudeStreamInput): Promise<ClaudeStreamResult> {
    try {
      logger.info('[executeStreaming] Executing command', {
        sessionId: input.sessionId,
        hasClaudeSessionId: !!input.claudeSessionId,
        promptPreview: input.prompt.substring(0, 50)
      });

      const { data } = await apolloClient.mutate({
        mutation: EXECUTE_STREAMING,
        variables: { input }
      });

      const result = data.executeStreaming;
      
      if (!result.accepted) {
        logger.error('[executeStreaming] Command not accepted', {
          error: result.error,
          sessionId: result.sessionId
        });
      } else {
        logger.info('[executeStreaming] Command accepted', {
          sessionId: result.sessionId
        });
      }

      return result;
    } catch (error) {
      logger.error('[executeStreaming] Failed to execute', { error });
      throw error;
    }
  }

  /**
   * Subscribe to streaming events for a session
   */
  subscribeToStreamEvents(
    sessionId: string, 
    onEvent: (event: ClaudeStreamEvent) => void
  ): () => void {
    logger.info('[subscribeToStreamEvents] Setting up subscription', { sessionId });

    const observable = apolloClient.subscribe({
      query: CLAUDE_STREAM_EVENTS,
      variables: { sessionId }
    });

    const subscription = observable.subscribe({
      next: ({ data }) => {
        const event = data.claudeStreamEvents;
        logger.debug('[subscribeToStreamEvents] Received event', {
          type: event.type,
          sessionId: event.sessionId,
          timestamp: event.timestamp
        });
        onEvent(event);
      },
      error: (error) => {
        logger.error('[subscribeToStreamEvents] Subscription error', { error, sessionId });
      },
      complete: () => {
        logger.info('[subscribeToStreamEvents] Subscription completed', { sessionId });
      }
    });

    // Return unsubscribe function
    return () => {
      logger.info('[subscribeToStreamEvents] Unsubscribing', { sessionId });
      subscription.unsubscribe();
    };
  }

  /**
   * Execute and stream - convenience method that combines execute and subscribe
   */
  async executeAndStream(
    input: ClaudeStreamInput,
    onEvent: (event: ClaudeStreamEvent) => void
  ): Promise<{ sessionId: string; unsubscribe: () => void }> {
    // First execute the command
    const result = await this.executeStreaming(input);
    
    if (!result.accepted) {
      throw new Error(result.error || 'Command not accepted');
    }

    // Then subscribe to events
    const unsubscribe = this.subscribeToStreamEvents(result.sessionId, onEvent);

    return {
      sessionId: result.sessionId,
      unsubscribe
    };
  }
}

// Export singleton instance
export const claudeStreamingV2 = new ClaudeServiceStreamingV2();