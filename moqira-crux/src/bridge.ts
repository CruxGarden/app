export type Entry = { path: string; fingerprint: string };
export type Document = { content: string; fingerprint: string };
let sequence = 0;
export function request<T>(op: string, fields: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    if (window.parent === window)
      return reject(new Error('Open this mockup app inside Crux Garden.'));
    const id = `mockup app-${++sequence}`;
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', receive);
      reject(new Error('Garden has not confirmed the save. Keep this draft open and retry.'));
    }, 60000);
    function receive(event: MessageEvent) {
      if (
        event.source !== window.parent ||
        event.data?.type !== 'crux:app:result' ||
        event.data.id !== id
      )
        return;
      window.clearTimeout(timer);
      window.removeEventListener('message', receive);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    }
    window.addEventListener('message', receive);
    // A narrow protocol, containing mockup app data only. Never sends credentials.
    window.parent.postMessage({ type: 'crux:app', id, op, ...fields }, '*');
  });
}
export function resolveNotePath(from: string, link: string): string | null {
  if (/^[a-z]+:/i.test(link) || link.startsWith('/')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(link.split('#')[0]!);
  } catch {
    return null;
  }
  if (!decoded) return from;
  const parts = from.split('/').slice(0, -1);
  for (const part of decoded.split('/')) {
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}
