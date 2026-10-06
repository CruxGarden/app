import { parseDeepLink, type DeepLink } from './deep-link-grammar';

/** Links waiting for a renderer; a burst beyond this keeps the newest. */
const QUEUE_LIMIT = 8;

/**
 * Main-process holding area for `crux-garden://` links (ADR 0085).
 *
 * macOS can deliver a link before the app is ready, and every platform can
 * deliver one before the renderer has subscribed (or while it reloads).
 * Links are parsed on arrival, refused ones are logged and dropped, and
 * accepted ones wait here until a listener says it is ready. A delivery that
 * fails (window gone, document replaced) puts the link back.
 */
export class DeepLinkInbox {
  private queue: DeepLink[] = [];
  private deliver: ((link: DeepLink) => boolean) | null = null;

  constructor(private readonly log: (message: string) => void = () => {}) {}

  /** Parse one raw link; returns the accepted payload, or null when refused. */
  receive(raw: unknown): DeepLink | null {
    const parsed = parseDeepLink(raw);
    if (!parsed.ok) {
      // The reason and length only: a refused link is untrusted input.
      const length = typeof raw === 'string' ? raw.length : 0;
      this.log(`deep link refused (${parsed.reason}, ${length} chars)`);
      return null;
    }
    this.log(`deep link accepted: ${parsed.link.kind}`);
    if (this.deliver && this.tryDeliver(parsed.link)) return parsed.link;
    const key = JSON.stringify(parsed.link);
    if (!this.queue.some((link) => JSON.stringify(link) === key)) {
      this.queue.push(parsed.link);
      if (this.queue.length > QUEUE_LIMIT) this.queue.splice(0, this.queue.length - QUEUE_LIMIT);
    }
    return parsed.link;
  }

  /** A renderer is listening: deliver what waited, in arrival order. */
  listen(deliver: (link: DeepLink) => boolean): void {
    this.deliver = deliver;
    while (this.queue.length && this.deliver === deliver) {
      const link = this.queue.shift()!;
      if (!this.tryDeliver(link)) {
        this.queue.unshift(link);
        break;
      }
    }
  }

  /** The listening document went away (navigation, reload, window closed). */
  detach(): void {
    this.deliver = null;
  }

  pending(): DeepLink[] {
    return [...this.queue];
  }

  private tryDeliver(link: DeepLink): boolean {
    let delivered: boolean;
    try {
      delivered = !!this.deliver?.(link);
    } catch {
      delivered = false;
    }
    if (!delivered) this.deliver = null;
    return delivered;
  }
}
