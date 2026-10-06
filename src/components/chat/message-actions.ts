/**
 * What a message's actions do, apart from how they look (EF05) — kept free of
 * React so the behaviour is tested without a DOM.
 */

export type CopyOutcome = 'copied' | 'failed';

/** Copy a message as it was written: the markdown source, not the rendered page. */
export async function copyMessageText(
  content: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.clipboard,
): Promise<CopyOutcome> {
  if (!clipboard) return 'failed';
  try {
    await clipboard.writeText(content);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** The action's accessible name in each state: it is also the confirmation. */
export function copyLabel(state: 'idle' | CopyOutcome): string {
  return state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : 'Copy message';
}

/** The share action's name says what pressing it will do (CR06). */
export function shareToggleLabel(excluded: boolean): string {
  return excluded ? 'Include in shared conversation' : 'Leave out of shared conversation';
}
