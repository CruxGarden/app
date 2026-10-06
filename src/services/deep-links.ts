/**
 * `crux-garden://` deep links in the renderer (ADR 0085).
 *
 * Main parses and validates every link, queues it until this document listens,
 * and delivers it on the `deep-link` channel. This module holds the one bridge
 * subscription per document and fans links out to handlers. A link that
 * arrives while no handler wants its kind waits here (bounded) until one
 * subscribes, so the billing handler and the install handler can mount in any
 * order without losing a link that launched the app.
 *
 * Handlers decide what a link means; none may act silently: an install opens
 * the confirmation, an open-crux focuses an existing local Crux, a billing
 * return refreshes plan status.
 *
 * `deepLinkUrl` builds links and has no desktop dependency, so the public
 * website can import it for "Open in Crux Garden".
 */
import { Capability, can } from '@/lib/platform';
import { isDeepLink, type DeepLink, type DeepLinkKind } from '../../electron/src/deep-link-grammar';

export {
  DEEP_LINK_SCHEME,
  deepLinkUrl,
  isDeepLink,
  parseDeepLink,
} from '../../electron/src/deep-link-grammar';
export type { DeepLink, DeepLinkKind } from '../../electron/src/deep-link-grammar';

export type DeepLinkHandler = (link: DeepLink) => void;

interface Subscriber {
  handler: DeepLinkHandler;
  kinds: ReadonlySet<DeepLinkKind> | null;
  active: boolean;
}

const BUFFER_LIMIT = 8;
const subscribers = new Set<Subscriber>();
let buffered: DeepLink[] = [];
let bridgeUnsubscribe: (() => void) | null = null;

const wants = (subscriber: Subscriber, link: DeepLink) =>
  !subscriber.kinds || subscriber.kinds.has(link.kind);

function call(subscriber: Subscriber, link: DeepLink) {
  try {
    subscriber.handler(link);
  } catch (error) {
    console.error('[deep-links] handler failed', error);
  }
}

function hold(link: DeepLink) {
  buffered.push(link);
  if (buffered.length > BUFFER_LIMIT) buffered = buffered.slice(-BUFFER_LIMIT);
}

function dispatch(link: unknown) {
  // Main already validated it; check again at this trust boundary anyway.
  if (!isDeepLink(link)) return;
  const targets = [...subscribers].filter((subscriber) => wants(subscriber, link));
  if (!targets.length) {
    hold(link);
    return;
  }
  for (const subscriber of targets) call(subscriber, link);
}

/**
 * Receive deep links. `kinds` limits which links this handler takes, and which
 * buffered links it claims on subscribing; omit it to receive every kind.
 * Returns an unsubscribe function. A no-op without `Capability.DeepLinks`.
 */
export function subscribeDeepLinks(
  handler: DeepLinkHandler,
  options: { kinds?: readonly DeepLinkKind[] } = {},
): () => void {
  if (!can(Capability.DeepLinks)) return () => {};
  const bridge = window.electronAPI?.deepLinks;
  if (!bridge) return () => {};
  const subscriber: Subscriber = {
    handler,
    kinds: options.kinds ? new Set(options.kinds) : null,
    active: true,
  };
  subscribers.add(subscriber);
  // One bridge subscription for the document's lifetime: main delivers its
  // queue to whoever says "listening", so it must never be said twice.
  bridgeUnsubscribe ??= bridge.subscribe(dispatch);
  const claimed = buffered.filter((link) => wants(subscriber, link));
  if (claimed.length) {
    buffered = buffered.filter((link) => !wants(subscriber, link));
    // After the caller's effect finishes; an unsubscribe in between (React
    // StrictMode's mount-unmount-mount) hands the link on instead of losing it.
    queueMicrotask(() => {
      for (const link of claimed) {
        if (subscriber.active) call(subscriber, link);
        else dispatch(link);
      }
    });
  }
  return () => {
    subscriber.active = false;
    subscribers.delete(subscriber);
  };
}

/** Tests only: forget subscribers, buffered links and the bridge subscription. */
export function resetDeepLinksForTests() {
  bridgeUnsubscribe?.();
  bridgeUnsubscribe = null;
  subscribers.clear();
  buffered = [];
}
