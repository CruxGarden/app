/**
 * The words of an error, for a person: Electron wraps a main-process throw as
 * "Error invoking remote method 'x': Error: <message>", and that prefix is
 * nothing anyone can act on.
 */
export function plainError(err: unknown, fallback = 'Something went wrong.'): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const message = raw
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^(?:Error|TypeError|RangeError):\s*/, '')
    .trim();
  return message || fallback;
}
