import { beforeEach, expect, it } from 'vitest';
import { localApiFixture } from '@/test/local-api-fixture';
import { getServices, initServices } from '@/services';
import { readMoodCrux, saveMoodCrux } from '@/services/mood-library';
import { flushSettings } from '@/services/settings';
import { hashContent } from '@/services/sqlite/helpers';
import { composeMoodPalette, setThemeOverrides } from './active';
import { applyMood, captureCurrentMood, exportMoodPackage, importMoodPackage } from './packages';

const native = localApiFixture({ project: true });
beforeEach(async () => {
  await initServices();
});

it('retains graph RGBA, type and motion through native Mood save, portable import and restart', async () => {
  const tokens = {
    graphLane1: 'rgba(255, 0, 0, 0.5)',
    graphLane2: 'rgba(0, 0, 255, 0.75)',
    graphLane3: 'rgba(150, 40, 80, 0.35)',
    graphLane4: 'rgba(80, 150, 40, 0.45)',
    graphLane5: 'rgba(40, 80, 150, 0.55)',
    graphLane6: 'rgba(150, 80, 40, 0.85)',
    graphLink: 'rgba(255, 255, 0, 0.6)',
    graphMergeLink: 'rgba(0, 255, 255, 0.65)',
    graphTransferLink: 'rgba(255, 0, 255, 0.7)',
    graphInactive: 'rgba(0, 255, 0, 0.25)',
    graphLabelSize: '1rem',
    panel: '#102030',
    text: 'rgba(220, 230, 240, 0.9)',
    textMuted: 'rgba(140, 150, 160, 0.55)',
    focusRing: 'rgba(255, 255, 255, 0.8)',
    focusRingWidth: '3px',
    fontBody: 'monospace',
    fontWeightBody: '600',
    motionDurationBase: '900ms',
    motionDurationSlow: '1500ms',
    motionScale: '0',
  };
  setThemeOverrides('Dark', tokens);
  const captured = captureCurrentMood({ name: 'Graph identity' });
  expect(captured.theme.overrides).toMatchObject(tokens);
  const saved = await saveMoodCrux(captured);
  const savedHead = await native().client.fileContent!.head(saved.id);
  expect(savedHead).not.toBeNull();
  expect((await readMoodCrux(saved.id)).pkg.theme.overrides).toMatchObject(tokens);

  const archive = await exportMoodPackage(saved, (fp) => native().client.blobRead(fp));
  const imported = await importMoodPackage(await archive.arrayBuffer(), async (bytes) => {
    const fingerprint = await hashContent(bytes);
    await native().client.blobWrite(fingerprint, bytes);
    return fingerprint;
  });
  expect(imported!.theme.overrides).toMatchObject(tokens);
  const garden = await getServices().crux.create({ title: 'Recipient Garden', kind: 'garden' });
  const recipient = await saveMoodCrux(imported!, undefined, garden.id);
  expect(recipient.id).not.toBe(saved.id);
  await flushSettings();
  await native().restart();
  await initServices();

  const restored = (await readMoodCrux(recipient.id)).pkg;
  expect(restored.theme.overrides).toMatchObject(tokens);
  expect(await native().client.gardenMembership!.parents(recipient.id)).toEqual([
    expect.objectContaining({ id: garden.id }),
  ]);
  expect(await native().client.fileContent!.head(saved.id)).toEqual(savedHead);
  expect((await readMoodCrux(saved.id)).pkg.theme.overrides).toMatchObject(tokens);
  setThemeOverrides('Dark', { graphLane1: '#ffffff', motionScale: '1' });
  await applyMood(restored, { sound: false });
  expect(composeMoodPalette('Dark')).toMatchObject(tokens);
  await flushSettings();
  await native().restart();
  await initServices();
  expect(composeMoodPalette('Dark')).toMatchObject(tokens);
});
