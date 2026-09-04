import { describe, it, expect } from 'vitest';
import { pickDownload, detectMacArch } from './site';

const assets = [
  { name: 'Crux Garden-1.0.0-arm64.dmg', browser_download_url: 'https://x/arm64.dmg', size: 10 },
  { name: 'Crux Garden-1.0.0-x64.dmg', browser_download_url: 'https://x/x64.dmg', size: 11 },
  { name: 'Crux Garden-1.0.0-arm64-mac.zip', browser_download_url: 'https://x/arm64.zip' },
  { name: 'latest-mac.yml', browser_download_url: 'https://x/latest-mac.yml' },
];

describe('site: download picking', () => {
  it('picks the DMG for the arch and lists the others', () => {
    const d = pickDownload('v1.0.0', assets, 'x64')!;
    expect(d).toMatchObject({ version: '1.0.0', arch: 'x64', url: 'https://x/x64.dmg', size: 11 });
    expect(d.all.map((a) => a.arch)).toEqual(['arm64', 'x64']);
    expect(pickDownload('v1.0.0', assets, 'arm64')!.url).toBe('https://x/arm64.dmg');
  });

  it('falls back to whatever DMG exists, and to null when none', () => {
    expect(pickDownload('v1.0.0', [assets[0]!], 'x64')!.arch).toBe('arm64');
    expect(pickDownload('v1.0.0', [assets[3]!], 'arm64')).toBeNull();
  });

  it('detects Intel only when the UA says Intel and the platform does not contradict it', () => {
    expect(detectMacArch({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' })).toBe(
      'x64',
    );
    expect(
      detectMacArch({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        userAgentData: { architecture: 'arm' },
      } as never),
    ).toBe('arm64');
    expect(detectMacArch({ userAgent: 'something else' })).toBe('arm64');
  });
});
