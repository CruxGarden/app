/** Narrow binding to the real app's model, selection, save and Undo callbacks. */
import { useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import type { NativeMoqira } from './commands';

let current: NativeMoqira | undefined;
const sessionId = crypto.randomUUID();
let revision = 0;
let previous = '';
export function useGardenTools(native: NativeMoqira) {
  useLayoutEffect(() => {
    current = native;
    return () => {
      if (current === native) current = undefined;
    };
  });
}
export function readNativeMoqira(): NativeMoqira {
  if (!current) throw Error('Moqira is still opening. Try again when the project appears.');
  return current;
}
export function nativeStateToken() {
  const native = readNativeMoqira();
  const signature = JSON.stringify([
    native.project,
    native.selectedIds,
    native.interactive,
    native.canUndo,
    native.canRedo,
  ]);
  if (signature !== previous) {
    previous = signature;
    revision++;
  }
  return `${sessionId}:${revision}`;
}
export async function actNative(action: () => void) {
  flushSync(action);
  await Promise.resolve();
  flushSync(() => {});
}
export async function settleNative() {
  await actNative(() => {});
  const active = document.activeElement;
  if (
    readNativeMoqira().busy ||
    (active?.closest('.app-shell') && active.matches('input, textarea, [contenteditable="true"]'))
  ) {
    throw Error('Finish or cancel the current Moqira edit before using App Tools.');
  }
}
