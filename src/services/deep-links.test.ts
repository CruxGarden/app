import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deepLinkUrl,
  resetDeepLinksForTests,
  subscribeDeepLinks,
  type DeepLink,
} from './deep-links';

const TOOL = '0b6a1c7e-2f4d-4c1a-9e3b-5d8f7a6c4b21';
const install: DeepLink = { kind: 'install', type: 'tool', cruxId: TOOL };
const billing: DeepLink = { kind: 'billing-return', status: 'success', sessionId: 'cs_test_a1' };

/** A fake bridge that behaves like preload + main: it delivers to every listener. */
function installBridge() {
  const listeners = new Set<(link: unknown) => void>();
  const subscribe = vi.fn((callback: (link: unknown) => void) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  });
  vi.stubGlobal('window', { electronAPI: { deepLinks: { subscribe } } });
  return { subscribe, emit: (link: unknown) => listeners.forEach((listen) => listen(link)) };
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

afterEach(() => {
  resetDeepLinksForTests();
  vi.unstubAllGlobals();
});

describe('subscribeDeepLinks', () => {
  it('is a no-op without the DeepLinks capability', () => {
    vi.stubGlobal('window', { electronAPI: {} });
    const handler = vi.fn();
    const stop = subscribeDeepLinks(handler);
    expect(typeof stop).toBe('function');
    stop();
    expect(handler).not.toHaveBeenCalled();
  });

  it('subscribes to the bridge once and fans out by kind', () => {
    const bridge = installBridge();
    const all = vi.fn();
    const onlyBilling = vi.fn();
    subscribeDeepLinks(all);
    subscribeDeepLinks(onlyBilling, { kinds: ['billing-return'] });
    expect(bridge.subscribe).toHaveBeenCalledTimes(1);
    bridge.emit(install);
    bridge.emit(billing);
    expect(all.mock.calls.map(([link]) => link)).toEqual([install, billing]);
    expect(onlyBilling.mock.calls.map(([link]) => link)).toEqual([billing]);
  });

  it('holds a link no handler wants until one subscribes', async () => {
    const bridge = installBridge();
    subscribeDeepLinks(vi.fn(), { kinds: ['install'] });
    bridge.emit(billing);
    const late = vi.fn();
    subscribeDeepLinks(late, { kinds: ['billing-return'] });
    expect(late).not.toHaveBeenCalled();
    await flush();
    expect(late).toHaveBeenCalledWith(billing);
    // Claimed once: a second billing subscriber does not get it again.
    const another = vi.fn();
    subscribeDeepLinks(another, { kinds: ['billing-return'] });
    await flush();
    expect(another).not.toHaveBeenCalled();
  });

  it('hands a claimed link on when the claimer unsubscribes at once (StrictMode)', async () => {
    const bridge = installBridge();
    subscribeDeepLinks(vi.fn(), { kinds: ['billing-return'] });
    bridge.emit(install);
    const first = vi.fn();
    const stop = subscribeDeepLinks(first, { kinds: ['install'] });
    stop();
    const second = vi.fn();
    subscribeDeepLinks(second, { kinds: ['install'] });
    await flush();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(install);
  });

  it('drops payloads that are not exactly a deep link', () => {
    const bridge = installBridge();
    const handler = vi.fn();
    subscribeDeepLinks(handler);
    bridge.emit({ kind: 'install', type: 'tool', cruxId: '../../etc/passwd' });
    bridge.emit({ ...install, url: 'https://evil.example' });
    bridge.emit('crux-garden://open/crux/' + TOOL);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('deepLinkUrl', () => {
  it('builds the website install link', () => {
    expect(deepLinkUrl({ kind: 'install', type: 'mood', cruxId: TOOL })).toBe(
      `crux-garden://install/mood/${TOOL}`,
    );
  });
  it('refuses an id the parser would refuse', () => {
    expect(() => deepLinkUrl({ kind: 'open-crux', cruxId: 'x/../y' })).toThrow();
  });
});
