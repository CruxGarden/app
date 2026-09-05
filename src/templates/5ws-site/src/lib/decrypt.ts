/**
 * The reveal as a decrypt: `This was ▮▮▮▮▮▮▮` resolves to the name, left to
 * right. No fanfare, no colour change — the resolve is the reward. Pure
 * helpers; the island paces them.
 */

export const BLOCK = '▮';

/** Units of the name that resolve — everything but whitespace, which stays a space. */
export function letterCount(text: string): number {
  return Array.from(text).filter((u) => !/\s/.test(u)).length;
}

/** The name with its first `resolved` letters shown and the rest as blocks; spaces stay spaces. */
export function maskName(text: string, resolved: number): string {
  let left = Math.max(0, resolved);
  return Array.from(text)
    .map((u) => {
      if (/\s/.test(u)) return u;
      if (left > 0) {
        left -= 1;
        return u;
      }
      return BLOCK;
    })
    .join('');
}

/**
 * Delay before each of `count` letters resolves, spread across `durationMs`
 * after an initial `delayMs` (a lost round lingers half a second on the
 * blocks before it lets go). The first entry carries the initial delay.
 */
export function decryptSchedule(count: number, durationMs: number, delayMs = 0): number[] {
  if (count <= 0) return [];
  const step = durationMs / count;
  return Array.from({ length: count }, (_, i) => Math.round(i === 0 ? delayMs + step : step));
}

export interface WhoParts {
  before: string;
  name: string;
  after: string;
}

/**
 * Where the name sits in the reveal's first line, so only the name is
 * encrypted: "This was Hypatia of Alexandria, c. 355–415." → before "This was ",
 * name "Hypatia", after " of Alexandria, c. 355–415.". When the line does not
 * carry the shelf's name, everything after "This was " is the secret.
 */
export function splitWho(who: string, name: string): WhoParts {
  const line = who.trim();
  const needle = name.trim();
  if (needle) {
    const at = line.toLowerCase().indexOf(needle.toLowerCase());
    if (at >= 0) {
      return {
        before: line.slice(0, at),
        name: line.slice(at, at + needle.length),
        after: line.slice(at + needle.length),
      };
    }
  }
  const lead = /^this was\s+/i.exec(line);
  if (lead) {
    const rest = line.slice(lead[0].length);
    const tail = /[.!]$/.test(rest) ? rest.slice(-1) : '';
    return { before: lead[0], name: rest.slice(0, rest.length - tail.length), after: tail };
  }
  return { before: '', name: line, after: '' };
}
