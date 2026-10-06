import { useEffect, type RefObject } from 'react';
import { listenForPublishedCalls } from '@/services/published-relay';

/** Own the relay with the exact frame that received the session handshake. */
export function useStoreApiProxy(
  cruxId: string,
  origin: string | undefined,
  frame: RefObject<HTMLIFrameElement | null>,
) {
  useEffect(() => {
    if (!origin) return;
    return listenForPublishedCalls(cruxId, origin, () => frame.current?.contentWindow ?? null);
  }, [cruxId, origin, frame]);
}
