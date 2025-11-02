import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';
import { StreamingMessage } from '../StreamingMessage';
import { StreamingIndicator } from '../StreamingIndicator';
import { useStreamingMessage } from '../../../hooks/useStreamingMessage';
import { renderHook, act } from '@testing-library/react-hooks';

describe('Streaming Components', () => {
  describe('StreamingMessage', () => {
    it('renders content correctly', () => {
      render(
        <StreamingMessage 
          content="Hello, world!" 
          isStreaming={false}
        />
      );
      
      expect(screen.getByText('Hello, world!')).toBeInTheDocument();
    });

    it('shows streaming indicator when streaming', () => {
      render(
        <StreamingMessage 
          content="Streaming..." 
          isStreaming={true}
          tokenCount={42}
        />
      );
      
      expect(screen.getByText('Streaming')).toBeInTheDocument();
      expect(screen.getByText('(42 tokens)')).toBeInTheDocument();
    });

    it('shows blinking cursor when streaming', () => {
      const { container } = render(
        <StreamingMessage 
          content="Loading" 
          isStreaming={true}
        />
      );
      
      const cursor = container.querySelector('.animate-pulse');
      expect(cursor).toBeInTheDocument();
    });
  });

  describe('StreamingIndicator', () => {
    it('shows live status when streaming', () => {
      render(
        <StreamingIndicator
          isStreaming={true}
          messageCount={5}
          tokenCount={100}
        />
      );
      
      expect(screen.getByText('Live')).toBeInTheDocument();
      expect(screen.getByText('5 messages')).toBeInTheDocument();
      expect(screen.getByText('100 tokens')).toBeInTheDocument();
    });

    it('shows complete status when not streaming', () => {
      render(
        <StreamingIndicator
          isStreaming={false}
          messageCount={10}
          tokenCount={200}
          lastActivity={new Date()}
        />
      );
      
      expect(screen.getByText('Complete')).toBeInTheDocument();
    });
  });

  describe('useStreamingMessage hook', () => {
    it('initializes with correct default state', () => {
      const { result } = renderHook(() => useStreamingMessage());
      
      expect(result.current.content).toBe('');
      expect(result.current.isStreaming).toBe(false);
      expect(result.current.tokenCount).toBe(0);
      expect(result.current.messageCount).toBe(0);
    });

    it('starts streaming correctly', () => {
      const { result } = renderHook(() => useStreamingMessage());
      
      act(() => {
        result.current.startStreaming();
      });
      
      expect(result.current.isStreaming).toBe(true);
      expect(result.current.lastHeartbeat).toBeTruthy();
    });

    it('processes STDOUT messages', () => {
      const { result } = renderHook(() => useStreamingMessage());
      
      act(() => {
        result.current.startStreaming();
        result.current.processMessage({
          sessionId: 'test',
          type: 'STDOUT',
          content: 'Hello ',
          timestamp: new Date().toISOString(),
          isFinal: false
        });
        result.current.processMessage({
          sessionId: 'test',
          type: 'STDOUT',
          content: 'world!',
          timestamp: new Date().toISOString(),
          isFinal: false
        });
      });
      
      waitFor(() => {
        expect(result.current.content).toBe('Hello world!');
        expect(result.current.messageCount).toBe(2);
      });
    });

    it('handles FINAL message and calls onComplete', () => {
      const onComplete = jest.fn();
      const { result } = renderHook(() => useStreamingMessage({ onComplete }));
      
      act(() => {
        result.current.startStreaming();
        result.current.processMessage({
          sessionId: 'test',
          type: 'STDOUT',
          content: 'Processing complete',
          timestamp: new Date().toISOString(),
          isFinal: false
        });
        result.current.processMessage({
          sessionId: 'test',
          type: 'FINAL',
          content: '.',
          timestamp: new Date().toISOString(),
          isFinal: true,
          tokens: 50
        });
      });
      
      waitFor(() => {
        expect(result.current.isStreaming).toBe(false);
        expect(onComplete).toHaveBeenCalledWith('Processing complete.', 0);
      });
    });

    it('updates token count from PROGRESS messages', () => {
      const { result } = renderHook(() => useStreamingMessage());
      
      act(() => {
        result.current.startStreaming();
        result.current.processMessage({
          sessionId: 'test',
          type: 'PROGRESS',
          content: '',
          timestamp: new Date().toISOString(),
          isFinal: false,
          tokens: 25
        });
      });
      
      expect(result.current.tokenCount).toBe(25);
    });

    it('handles heartbeat messages', () => {
      const { result } = renderHook(() => useStreamingMessage());
      
      act(() => {
        result.current.startStreaming();
      });
      
      const initialHeartbeat = result.current.lastHeartbeat;
      
      // Wait a bit
      setTimeout(() => {
        act(() => {
          result.current.processMessage({
            sessionId: 'test',
            type: 'HEARTBEAT',
            content: '',
            timestamp: new Date().toISOString(),
            isFinal: false
          });
        });
        
        expect(result.current.lastHeartbeat?.getTime()).toBeGreaterThan(
          initialHeartbeat?.getTime() || 0
        );
      }, 100);
    });

    it('handles errors correctly', () => {
      const onError = jest.fn();
      const { result } = renderHook(() => useStreamingMessage({ onError }));
      
      act(() => {
        result.current.startStreaming();
        result.current.processMessage({
          sessionId: 'test',
          type: 'STDERR',
          content: 'Error occurred',
          timestamp: new Date().toISOString(),
          isFinal: false
        });
      });
      
      expect(onError).toHaveBeenCalledWith(new Error('Error occurred'));
    });
  });
});