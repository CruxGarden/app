import { describe, it, expect } from 'vitest';
import { pickDownload, detectMacArch, archFromRenderer } from './site';

const assets = [
  { name: 'Crux Garden-1.0.0-arm64.dmg', browser_download_url: 'https://x/arm64.dmg', size: 10 },
  { name: 'Crux Garden-1.0.0-x64.dmg', browser_download_url: 'https://x/x64.dmg', size: 11 },
  { name: 'Crux Garden-1.0.0-arm64-mac.zip', browser_download_url: 'https://x/arm64.zip' },
  { name: 'latest-mac.yml', browser_download_url: 'https://x/latest-mac.yml' },
];

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
