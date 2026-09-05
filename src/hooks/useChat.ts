import { useCallback } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { useShallow } from 'zustand/react/shallow';
import { submitTurn, stopTurn, steerTurn } from '@/services/turns';
import { isJobActive } from '@/services/turn-jobs';

/**
 * The Collaboration pane's view of the current crux's turns.
 *
 * A turn is a Background Turn job (services/turns, B3): the engine loop runs
 * in the service, tracked by the store, so this hook only reads state and
 * forwards intent. Sending while a job runs QUEUES the message; `steer` stops
 * the job and sends the message at once.
 */
export function useChat() {
  const { crux, messages, isStreaming, streamingContent, turnJob, turnQueue } = useCruxStore(
    useShallow((s) => ({
      crux: s.crux,
      messages: s.messages,
      isStreaming: s.isStreaming,
      streamingContent: s.streamingContent,
      turnJob: s.turnJob,
      turnQueue: s.turnQueue,
    })),
  );

  const send = useCallback(
    (content: string) => {
      if (!crux) return;
      void submitTurn(content).catch((err) => console.error('Turn failed to start:', err));
    },
    [crux],
  );

  const steer = useCallback(
    (content: string) => {
      if (!crux) return;
      void steerTurn(content).catch((err) => console.error('Steer failed:', err));
    },
    [crux],
  );

  const stop = useCallback(() => {
    if (crux) stopTurn('stopped');
  }, [crux]);

  return {
    messages,
    isStreaming,
    streamingContent,
    job: turnJob,
    isJobRunning: isJobActive(turnJob),
    queue: turnQueue,
    send,
    steer,
    stop,
  };
}
