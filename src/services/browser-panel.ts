import { create } from 'zustand';
import { can, Capability } from '@/lib/platform';
import type { BrowserPanelAction, BrowserPanelState } from '../../electron/src/bridge';
import { getSetting, setSetting } from './settings';

export const useBrowserPanels = create<{ states: Record<string, BrowserPanelState> }>(() => ({
  states: {},
}));
let listening = false;
const key = (id: string) => `cruxgarden:browser:${id}`;
export function browserAddress(raw: string): string {
  const text = raw.trim();
  const value =
    /^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[^/]+:\d+(\/|$)/.test(text) ? text : `https://${text}`;
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    value.length > 8192
  )
    throw new Error('Enter an HTTP or HTTPS address without embedded credentials.');
  return url.href;
}
function receive(state: BrowserPanelState) {
  useBrowserPanels.setState((s) => ({ states: { ...s.states, [state.id]: state } }));
  if (state.url && /^https?:\/\//.test(state.url)) setSetting(key(state.id), state.url);
}
export function browserControls() {
  if (!can(Capability.WebBrowser) || !window.electronAPI?.browser)
    throw new Error('The WWW browser is available in the desktop app.');
  const api = window.electronAPI.browser;
  if (!listening) {
    listening = true;
    api.onChange(receive);
  }
  return api;
}
export async function controlBrowser(id: string, action: BrowserPanelAction, url?: string) {
  const state = await browserControls().action(
    id,
    action,
    action === 'navigate' ? browserAddress(url ?? '') : undefined,
  );
  receive(state);
  return state;
}
export async function restoreBrowser(id: string, signal?: AbortSignal) {
  const current = await controlBrowser(id, 'state');
  if (signal?.aborted) return;
  const saved = getSetting(key(id));
  if (!current.url && saved) await controlBrowser(id, 'navigate', saved);
}
