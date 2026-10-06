import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Did the last session end badly? (EF04, ADR 0008: local only, nothing sent.)
 * A marker file is written under userData when a session starts and removed
 * when it quits cleanly; finding one at the next start means the app crashed,
 * was killed or lost power. A renderer crash the app survived is noted in the
 * same file, so it is offered once on the next launch too. The marker holds a
 * time, a version and a kind — never content.
 */
export type CrashKind = 'unclean-exit' | 'renderer';

export interface PreviousCrash {
  kind: CrashKind;
  /** ISO time the crashed session started (or the renderer went). */
  at: string | null;
  version: string | null;
}

interface MarkerData {
  startedAt?: string;
  version?: string;
  /** Set when the session ended cleanly but its renderer had crashed. */
  clean?: boolean;
  rendererCrashedAt?: string;
}

export class SessionMarker {
  readonly file: string;
  private data: MarkerData = {};
  private started = false;

  constructor(
    userData: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.file = path.join(userData, 'session-marker.json');
  }

  private read(): MarkerData | null {
    let raw: string;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch {
      return null; // no marker: the last session quit cleanly (or there was none)
    }
    try {
      const value = JSON.parse(raw);
      return value && typeof value === 'object' ? (value as MarkerData) : {};
    } catch {
      return {}; // a torn write is itself evidence of an unclean end
    }
  }

  private write(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data));
    } catch {
      /* Without a marker the next launch simply reports nothing. */
    }
  }

  /** Start this session; answers how the previous one ended. Call once, after the instance lock. */
  begin(version: string): PreviousCrash | null {
    const previous = this.read();
    let crash: PreviousCrash | null = null;
    if (previous) {
      const text = (value: unknown) => (typeof value === 'string' ? value : null);
      if (previous.clean)
        crash = previous.rendererCrashedAt
          ? {
              kind: 'renderer',
              at: text(previous.rendererCrashedAt),
              version: text(previous.version),
            }
          : null;
      else
        crash = {
          kind: 'unclean-exit',
          at: text(previous.startedAt),
          version: text(previous.version),
        };
    }
    this.data = { startedAt: this.now().toISOString(), version };
    this.started = true;
    this.write();
    return crash;
  }

  /** The renderer went down and the app carried on: worth offering a report next time. */
  noteRendererCrash(): void {
    if (!this.started) return;
    this.data.rendererCrashedAt = this.now().toISOString();
    this.write();
  }

  /** A clean quit. Nothing remains unless a renderer crash is still to be offered. */
  end(): void {
    if (!this.started) return;
    this.started = false;
    if (this.data.rendererCrashedAt) {
      this.data.clean = true;
      this.write();
      return;
    }
    try {
      fs.rmSync(this.file, { force: true });
    } catch {
      /* Worst case: one notice too many on the next launch. */
    }
  }
}

/** Renderer exits that are not crashes: a normal exit, or one the app itself asked for. */
export function isRendererCrash(reason: string | undefined): boolean {
  return !!reason && reason !== 'clean-exit' && reason !== 'killed';
}
