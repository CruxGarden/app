import { describe, it, expect, beforeEach } from 'vitest';
import {
  addAsset,
  getAssets,
  removeAsset,
  kindOf,
  assetRef,
  isAssetRef,
  refFingerprint,
  cssValueFor,
} from './assets';
import { captureCurrentMood, packageAssets } from './packages';
import { tokenKind } from './token-groups';
import { initServices } from '@/services';
import { setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { setThemeOverrides } from './active';

describe('mood assets', () => {
  beforeEach(async () => {
    await initServices();
    setSetting(SettingsKey.MoodAssets, '');
    setSetting(SettingsKey.MoodCover, '');
    setThemeOverrides('Dark', {});
  });

  it('classifies files and indexes them', () => {
    expect(kindOf('image/png')).toBe('image');
    expect(kindOf('audio/mpeg')).toBe('audio');
    expect(kindOf('', 'Inter.woff2')).toBe('font');
    expect(kindOf('application/pdf')).toBe('other');
    addAsset({ fingerprint: 'f1', name: 'paper.png', type: 'image/png', size: 10 });
    addAsset({ fingerprint: 'f1', name: 'paper-v2.png', type: 'image/png', size: 12 });
    expect(getAssets()).toHaveLength(1);
    expect(getAssets()[0]?.name).toBe('paper-v2.png');
    removeAsset('f1');
    expect(getAssets()).toEqual([]);
  });

  it('asset refs are recognised and unresolved until a URL exists', () => {
    expect(isAssetRef('asset:abc')).toBe(true);
    expect(isAssetRef('asset:')).toBe(false);
    expect(refFingerprint(assetRef('abc'))).toBe('abc');
    expect(cssValueFor('#fff')).toBe('#fff');
    expect(cssValueFor('asset:abc')).toBeNull();
  });

  it('texture and font-face tokens are asset-kind; a Mood carries its assets and refs', () => {
    expect(tokenKind('workspaceTexture')).toBe('asset');
    expect(tokenKind('paneWorkshopTexture')).toBe('asset');
    expect(tokenKind('fontFaceBody')).toBe('asset');
    expect(tokenKind('workspaceTextureBlend')).toBe('text');
    expect(tokenKind('grainOpacity')).toBe('number');
    addAsset({ fingerprint: 'tex1', name: 'linen.png', type: 'image/png', size: 1 });
    setThemeOverrides('Dark', {
      paneWorkshopTexture: 'asset:tex1',
      fontFaceDisplay: 'asset:font1',
    });
    setSetting(SettingsKey.MoodCover, 'cover1');
    const pkg = captureCurrentMood({ name: 'Textured' });
    expect(pkg.cover).toBe('cover1');
    expect(pkg.assets?.map((a) => a.fingerprint)).toEqual(['tex1']);
    expect(packageAssets(pkg)).toEqual(expect.arrayContaining(['tex1', 'font1', 'cover1']));
  });
});
