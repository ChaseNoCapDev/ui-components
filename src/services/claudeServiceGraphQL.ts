import { apolloClient } from '@/lib/apollo-client';
import { createLogger } from '@/utils/logger';
import {
  GENERATE_COMMIT_MESSAGES,
  GENERATE_BATCH_COMMIT_MESSAGES,
  GENERATE_EXECUTIVE_SUMMARY,
  GET_AGENT_RUNS,
  GET_AGENT_RUN_STATISTICS,
  RETRY_AGENT_RUN,
  RETRY_BATCH_AGENT_RUNS,
  EXECUTE_CLAUDE_COMMAND,
  COMMAND_OUTPUT_SUBSCRIPTION,
  AGENT_RUN_PROGRESS_SUBSCRIPTION,
} from '@/graphql/claude-operations';
import { STREAMING_COMMAND_OUTPUT_SUBSCRIPTION } from '@/graphql/claude-streaming';

const logger = createLogger('claudeServiceGraphQL');

export interface CommitMessageResult {
  messages: string[];
  reasoning?: string;
}

export interface BatchCommitMessageResult {
  repository: string;
  message: string;
  reasoning?: string;
}

export interface ExecutiveSummaryResult {
  summary: string;
  highlights: string[];
  recommendations: string[];
}

export interface AgentRun {
  id: string;
  sessionId: string;
  status: string;
  input: string;
  output?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  toolCalls: any[];
  duration?: number;
}

class ClaudeServiceGraphQL {
  /**
   * Generate commit messages for changes
   */
  async generateCommitMessages(changes: string): Promise<CommitMessageResult> {
    try {
      const { data } = await apolloClient.mutate({
        mutation: GENERATE_COMMIT_MESSAGES,
        variables: { changes }
      });

      return data.generateCommitMessages;
    } catch (error) {
      logger.error('Failed to generate commit messages', { error });
      throw error;
    }
  }

  /**
   * Generate batch commit messages
   */
  async generateBatchCommitMessages(
    repositories: Array<{ path: string; changes: string }>
  ): Promise<BatchCommitMessageResult[]> {
    try {
      const { data } = await apolloClient.mutate({
        mutation: GENERATE_BATCH_COMMIT_MESSAGES,
        variables: { repositories }
      });

      return data.generateBatchCommitMessages;
    } catch (error) {
      logger.error('Failed to generate batch commit messages', { error });
      throw error;
    }
  }

  /**
   * Generate executive summary
   */
  async generateExecutiveSummary(
    repositories: Array<{ path: string; name: string; changes: string; commitCount: number }>
  ): Promise<ExecutiveSummaryResult> {
    try {
      const { data } = await apolloClient.mutate({
        mutation: GENERATE_EXECUTIVE_SUMMARY,
        variables: { repositories }
      });

      return data.generateExecutiveSummary;
    } catch (error) {
      logger.error('Failed to generate executive summary', { error });
      throw error;
    }
  }

  /**
   * Get agent runs
   */
  async getAgentRuns(options?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<AgentRun[]> {
    try {
      const { data } = await apolloClient.query({
        query: GET_AGENT_RUNS,
        variables: options,
        fetchPolicy: 'network-only'
      });

      return data.agentRuns;
    } catch (error) {
      logger.error('Failed to get agent runs', { error });
      throw error;
    }
  }

  /**
   * Get agent run statistics
   */
  async getAgentRunStatistics(): Promise<any> {
    try {
      const { data } = await apolloClient.query({
        query: GET_AGENT_RUN_STATISTICS,
        fetchPolicy: 'network-only'
      });

      return data.agentRunStatistics;
    } catch (error) {
      logger.error('Failed to get agent run statistics', { error });
      throw error;
    }
  }

  /**
   * Retry a failed agent run
   */
  async retryAgentRun(runId: string): Promise<any> {
    try {
      const { data } = await apolloClient.mutate({
        mutation: RETRY_AGENT_RUN,
        variables: { runId }
      });

      return data.retryAgentRun;
    } catch (error) {
      logger.error('Failed to retry agent run', { error, runId });
      throw error;
    }
  }

  /**
   * Retry multiple agent runs
   */
  async retryBatchAgentRuns(runIds: string[]): Promise<any[]> {
    try {
      const { data } = await apolloClient.mutate({
        mutation: RETRY_BATCH_AGENT_RUNS,
        variables: { runIds }
      });

      return data.retryBatchAgentRuns;
    } catch (error) {
      logger.error('Failed to retry batch agent runs', { error });
      throw error;
    }
  }

  /**
   * Execute Claude command
   */
  async executeCommand(
    sessionId: string | null, 
    prompt: string, 
    workingDirectory?: string,
    options?: { stream?: boolean }
  ): Promise<any> {
    try {
      if (!apolloClient) {
        throw new Error('Apollo Client is not initialized');
      }

      logger.info('Executing Claude command', { sessionId, prompt, workingDirectory, options });

      const { data } = await apolloClient.mutate({
        mutation: EXECUTE_CLAUDE_COMMAND,
        variables: { 
          input: {
            prompt,
            sessionId: sessionId && sessionId !== 'default' ? sessionId : undefined,
            workingDirectory,
            options: {
              stream: options?.stream ?? true // Default to streaming
            }
          }
        }
      });

      logger.info('Claude command executed successfully', { data });
      return data.executeCommand;
    } catch (error) {
      logger.error('Failed to execute Claude command', { error, sessionId, prompt });
      throw error;
    }
  }

  /**
   * Subscribe to command output
   */
  subscribeToCommandOutput(sessionId: string, onData: (data: any) => void): () => void {
    const subscription = apolloClient.subscribe({
      query: COMMAND_OUTPUT_SUBSCRIPTION,
      variables: { sessionId }
    }).subscribe({
      next: ({ data }) => {
        if (data?.commandOutput) {
          onData(data.commandOutput);
        }
      },
      error: (error) => {
        logger.error('Command output subscription error', { error, sessionId });
      }
    });

    // Return unsubscribe function
    return () => subscription.unsubscribe();
  }

  /**
   * Subscribe to agent run progress
   */
  subscribeToAgentRunProgress(runId: string, onProgress: (progress: any) => void): () => void {
    const subscription = apolloClient.subscribe({
      query: AGENT_RUN_PROGRESS_SUBSCRIPTION,
      variables: { runId }
    }).subscribe({
      next: ({ data }) => {
        if (data?.agentRunProgress) {
          onProgress(data.agentRunProgress);
        }
      },
      error: (error) => {
        logger.error('Agent run progress subscription error', { error, runId });
      }
    });

    // Return unsubscribe function
    return () => subscription.unsubscribe();
  }

  /**
   * Subscribe to streaming command output (new real-time streaming)
   */
  subscribeToStreamingOutput(sessionId: string, onData: (data: any) => void): () => void {
    console.log('[claudeServiceGraphQL] subscribeToStreamingOutput called', {
      sessionId,
      timestamp: new Date().toISOString(),
      hasApolloClient: !!apolloClient
    });
    
    const subscription = apolloClient.subscribe({
      query: STREAMING_COMMAND_OUTPUT_SUBSCRIPTION,
      variables: { sessionId }
    }).subscribe({
      next: ({ data }) => {
        console.log('[claudeServiceGraphQL] Subscription data received', {
          sessionId,
          hasData: !!data,
          hasStreamingCommandOutput: !!data?.streamingCommandOutput,
          type: data?.streamingCommandOutput?.type,
          timestamp: new Date().toISOString()
        });
        
        if (data?.streamingCommandOutput) {
          onData(data.streamingCommandOutput);
        }
      },
      error: (error) => {
        console.error('[claudeServiceGraphQL] Subscription error', {
          sessionId,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
        logger.error('Streaming command output subscription error', { error, sessionId });
      },
      complete: () => {
        console.log('[claudeServiceGraphQL] Subscription completed', {
          sessionId,
          timestamp: new Date().toISOString()
        });
      }
    });

    console.log('[claudeServiceGraphQL] Subscription created', {
      sessionId,
      subscriptionClosed: subscription.closed,
      timestamp: new Date().toISOString()
    });

    // Return unsubscribe function
    return () => {
      console.log('[claudeServiceGraphQL] Unsubscribing', {
        sessionId,
        timestamp: new Date().toISOString()
      });
      subscription.unsubscribe();
    };
  }
}

// Export singleton instance
export const claudeServiceGraphQL = new ClaudeServiceGraphQL();