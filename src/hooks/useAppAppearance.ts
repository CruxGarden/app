import { useEffect } from 'react';
import { appAppearanceSnapshot, setAppearanceChoice } from '@/services/app-appearance';
import { isPreviewOrigin } from './useStoreProxy';

/** Opt-in appearance only; never inject CSS or disclose a Mood to arbitrary previews. */
export function useAppAppearance(cruxId: string | null, enabled: boolean) {
  useEffect(() => {
    if (!cruxId || !enabled) return;
    const peers = new Map<MessageEventSource, string>();
    let live = true;
    let revision = 0;
    let scheduled = 0;
    function valid(source: MessageEventSource, origin: string) {
      return [...document.querySelectorAll<HTMLIFrameElement>('iframe[data-crux-id]')].some(
        (frame) =>
          frame.contentWindow === source &&
          frame.dataset.cruxId === cruxId &&
          new URL(frame.src, location.href).origin === origin,
      );
    }
    async function send() {
      const current = ++revision;
      const appearance = await appAppearanceSnapshot(cruxId!);
      if (!live || current !== revision) return;
      for (const [source, origin] of peers) {
        if (!valid(source, origin)) {
          peers.delete(source);
          continue;
        }
        source.postMessage(
          { type: 'crux:appearance:update', appearance },
          { targetOrigin: origin },
        );
      }
    }
    function schedule() {
      cancelAnimationFrame(scheduled);
      scheduled = requestAnimationFrame(() => void send());
    }
    function receive(event: MessageEvent) {
      if (
        event.data?.type !== 'crux:appearance' ||
        !event.source ||
        !isPreviewOrigin(event.origin) ||
        !valid(event.source, event.origin)
      )
        return;
      if (event.data.op !== 'get' && event.data.op !== 'set') return;
      peers.set(event.source, event.origin);
      if (event.data.op === 'set') {
        void setAppearanceChoice(cruxId!, event.data.choice)
          .then(schedule)
          .catch((error) => {
            event.source?.postMessage(
              { type: 'crux:appearance:error', error: error.message },
              { targetOrigin: event.origin },
            );
          });
      } else schedule();
    }
    window.addEventListener('message', receive);
    document.addEventListener('palette-change', schedule);
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    return () => {
      live = false;
      cancelAnimationFrame(scheduled);
      observer.disconnect();
      window.removeEventListener('message', receive);
      document.removeEventListener('palette-change', schedule);
    };
  }, [cruxId, enabled]);
}
