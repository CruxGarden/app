import { describe, it, expect } from 'vitest';
import {
  pickDownload,
  detectMacArch,
  archFromRenderer,
  detectPlatform,
  classifyAsset,
} from './site';

const assets = [
  { name: 'Crux Garden-1.0.0-arm64.dmg', browser_download_url: 'https://x/arm64.dmg', size: 10 },
  { name: 'Crux Garden-1.0.0-x64.dmg', browser_download_url: 'https://x/x64.dmg', size: 11 },
  { name: 'Crux Garden-1.0.0-arm64-mac.zip', browser_download_url: 'https://x/arm64.zip' },
  { name: 'latest-mac.yml', browser_download_url: 'https://x/latest-mac.yml' },
  { name: 'Crux Garden-1.0.0-win-x64.exe', browser_download_url: 'https://x/win.exe', size: 20 },
  { name: 'Crux Garden-1.0.0-win-x64.exe.blockmap', browser_download_url: 'https://x/win.map' },
  {
    name: 'Crux Garden-1.0.0-linux-x86_64.AppImage',
    browser_download_url: 'https://x/app.AppImage',
    size: 30,
  },
  {
    name: 'Crux Garden-1.0.0-linux-amd64.deb',
    browser_download_url: 'https://x/app.deb',
    size: 31,
  },
  { name: 'latest-linux.yml', browser_download_url: 'https://x/latest-linux.yml' },
];
const LINUX_FF = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

// Real UA strings. Note every Mac browser says "Intel Mac OS X" and carries "AppleWebKit".
const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const FIREFOX_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:128.0) Gecko/20100101 Firefox/128.0';
const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const hints = (architecture: string) => ({
  getHighEntropyValues: async () => ({ architecture }),
});
const M2 = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)';
const IRIS = 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 640, OpenGL 4.1)';

describe('site: download picking', () => {
  it('picks the DMG for the arch and lists the others', () => {
    const d = pickDownload('v1.0.0', assets, 'x64')!;
    expect(d).toMatchObject({
      version: '1.0.0',
      arch: 'x64',
      url: 'https://x/x64.dmg',
      size: 11,
      detected: true,
    });
    expect(d.all.map((a) => a.arch)).toEqual(['arm64', 'x64']);
    expect(pickDownload('v1.0.0', assets, 'arm64')!.url).toBe('https://x/arm64.dmg');
  });

  it('marks the pick as undetected when the arch is unknown or missing from the release', () => {
    const unknown = pickDownload('v1.0.0', assets, 'unknown')!;
    expect(unknown).toMatchObject({ arch: 'arm64', detected: false });
    expect(unknown.all).toHaveLength(2);
    expect(pickDownload('v1.0.0', [assets[0]!], 'x64')!).toMatchObject({
      arch: 'arm64',
      detected: false,
    });
  });

  it('falls back to null when there is no DMG', () => {
    expect(pickDownload('v1.0.0', [assets[3]!], 'arm64')).toBeNull();
  });
});

describe('site: every platform gets its own primary download', () => {
  it('detects the desktop OS from the UA and refuses to guess on phones', () => {
    expect(detectPlatform({ userAgent: CHROME_MAC })).toBe('mac');
    expect(detectPlatform({ userAgent: SAFARI_MAC })).toBe('mac');
    expect(detectPlatform({ userAgent: CHROME_WIN })).toBe('windows');
    expect(detectPlatform({ userAgent: LINUX_FF })).toBe('linux');
    expect(detectPlatform({ userAgent: ANDROID })).toBe('unknown');
    expect(detectPlatform({ userAgent: IPHONE })).toBe('unknown');
    expect(detectPlatform(undefined)).toBe('unknown');
  });

  it('classifies installers by name and ignores manifests, zips and blockmaps', () => {
    const kinds = assets.map((a) => classifyAsset(a)?.kind ?? null);
    expect(kinds).toEqual(['dmg', 'dmg', null, null, 'exe', null, 'AppImage', 'deb', null]);
    expect(classifyAsset(assets[6]!)).toMatchObject({ platform: 'linux', label: 'Linux AppImage' });
  });

  it('Windows gets the installer, Linux the AppImage, both marked detected', () => {
    const win = pickDownload('v1.0.0', assets, 'unknown', 'windows')!;
    expect(win).toMatchObject({
      platform: 'windows',
      kind: 'exe',
      url: 'https://x/win.exe',
      detected: true,
    });
    const linux = pickDownload('v1.0.0', assets, 'unknown', 'linux')!;
    expect(linux).toMatchObject({
      platform: 'linux',
      kind: 'AppImage',
      url: 'https://x/app.AppImage',
      detected: true,
    });
    // the .deb is still on offer
    expect(linux.options.filter((o) => o.platform === 'linux').map((o) => o.kind)).toEqual([
      'AppImage',
      'deb',
    ]);
  });

  it('an unknown platform, or one the release lacks, falls back to the Apple silicon DMG undetected', () => {
    expect(pickDownload('v1.0.0', assets, 'unknown', 'unknown')!).toMatchObject({
      platform: 'mac',
      arch: 'arm64',
      detected: false,
    });
    const macOnly = assets.slice(0, 4);
    expect(pickDownload('v1.0.0', macOnly, 'unknown', 'windows')!).toMatchObject({
      platform: 'mac',
      detected: false,
    });
    // every installer is listed so the page can offer them all
    expect(pickDownload('v1.0.0', assets, 'unknown', 'unknown')!.options).toHaveLength(5);
  });
});

describe('site: Mac architecture detection', () => {
  const noWebgl = () => null;

  it('trusts the high-entropy Client Hint on Chromium', async () => {
    expect(
      await detectMacArch({ userAgent: CHROME_MAC, userAgentData: hints('arm') }, noWebgl),
    ).toBe('arm64');
    expect(
      await detectMacArch({ userAgent: CHROME_MAC, userAgentData: hints('x86') }, noWebgl),
    ).toBe('x64');
  });

  it('falls back to the WebGL renderer when hints are absent or refused', async () => {
    expect(await detectMacArch({ userAgent: FIREFOX_MAC }, () => IRIS)).toBe('x64');
    expect(await detectMacArch({ userAgent: FIREFOX_MAC }, () => M2)).toBe('arm64');
    const refused = {
      getHighEntropyValues: async () => {
        throw new Error('NotAllowedError');
      },
    };
    expect(await detectMacArch({ userAgent: CHROME_MAC, userAgentData: refused }, () => M2)).toBe(
      'arm64',
    );
  });

  it('is unknown on Safari (renderer is "Apple GPU" on every Mac) and on non-Macs', async () => {
    expect(await detectMacArch({ userAgent: SAFARI_MAC }, () => 'Apple GPU')).toBe('unknown');
    expect(await detectMacArch({ userAgent: SAFARI_MAC }, noWebgl)).toBe('unknown');
    expect(
      await detectMacArch({ userAgent: CHROME_WIN, userAgentData: hints('x86') }, () => IRIS),
    ).toBe('unknown');
    expect(await detectMacArch(undefined, noWebgl)).toBe('unknown');
  });

  it('never infers Intel from the UA string alone', async () => {
    // "Intel Mac OS X" is what Apple silicon Macs send too
    expect(await detectMacArch({ userAgent: CHROME_MAC }, noWebgl)).toBe('unknown');
  });

  it('reads renderer strings', () => {
    expect(archFromRenderer('AMD Radeon Pro 5500M OpenGL Engine')).toBe('x64');
    expect(archFromRenderer('Apple M1 Pro')).toBe('arm64');
    expect(archFromRenderer('Apple GPU')).toBe('unknown');
    expect(archFromRenderer(null)).toBe('unknown');
  });
});
