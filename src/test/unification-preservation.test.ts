import frozen from './fixtures/unification/tool-package-v1.json';
import ledger from './fixtures/unification/settings-ledger.json';
import { localApiFixture } from './local-api-fixture';
import { createLocalApiTestClient } from './local-api-client';
import { installedTool, installedToolPackage } from '../services/crux-tools/installed';
import { installToolFile } from '../services/crux-tools/files';
import { functionFiles } from '../services/crux-functions';
import { getServices, initServices } from '../services';
import { beforeEach, describe, expect, it } from 'vitest';
import { setSqliteClient } from '../services/sqlite/client';
import { SettingsKey, isSecretSettingKey } from '../lib/constants';
import { exportGarden, importGarden } from '../services/garden-io';
import { clearAllSettings, initSettings } from '../services/settings';
import { useGardenContext } from '../stores/gardenContext';
import { createCruxspace, getCruxspace } from '../services/cruxspaces';
import { parseSynthPatch, synthPreset } from '../audio/synth-patch';
import { listWorkspaceLayouts } from '../services/workspace-layouts';
import { hashContent } from '../services/sqlite/helpers';
import { allWorkspaces, closeWorkspace } from '../stores/workspaceRegistry';
import { growthHostFor } from '../services/growth';

const native = localApiFixture();
beforeEach(async () => {
  clearAllSettings();
  await initServices();
  await initSettings();
});
async function closeWorkspaces() {
  for (const w of allWorkspaces()) await closeWorkspace(w.id, { stop: true, documents: 'discard' });
}

describe('native installation preservation', () => {
  it('accounts for every declared setting without treating secrets as portable content', () => {
    const exact = ledger.entries.flatMap((entry) => (entry.key ? [entry.key] : []));
    expect(new Set(exact).size).toBe(exact.length);
    for (const key of Object.values(SettingsKey)) {
      const entry = ledger.entries.find((entry) => entry.key === key);
      expect(entry, key).toBeDefined();
      expect(entry!.preservation.length).toBeGreaterThan(0);
      if (isSecretSettingKey(key)) expect(entry!.group).toBe('secrets');
    }
  });

  it('restores tools, Functions, visitor data, layouts and typed Mood assets into a fresh native installation and restarts', async () => {
    const source = native().client;
    const services = getServices();
    const work = await services.crux.create({ title: 'Shared creation — café 🌱' });
    const privateWork = await services.crux.create({ title: 'Private sibling' });
    const studio = await createCruxspace({
      name: 'Studio',
      brief: 'Shared work',
      cruxIds: [work.id],
    });
    const library = await createCruxspace({
      name: 'Library',
      brief: 'Private work',
      cruxIds: [privateWork.id],
    });
    await services.crux.update(work.id, {
      meta: { messages: [{ role: 'user', content: 'Keep the conversation' }] },
    });
    const functions = {
      'functions/hello.js':
        'export default async (req, ctx) => ctx.json(await ctx.store.get("guestbook"));\n',
      'functions/on-fixture.js':
        'export const match = "fixture:*";\nexport default async (req, ctx) => ctx.store.set("last-fixture", ctx.event.data, "public");\n',
      'functions/tick.js':
        'export const schedule = "every 10m";\nexport default async (req, ctx) => ctx.log("fixture schedule");\n',
    };
    for (const [path, content] of Object.entries(functions))
      await services.artifact.create({ resourceId: work.id, content, meta: { path } });
    const binary = Uint8Array.from([0, 255, 128, 13, 10, 0, 42]);
    await services.artifact.upload({
      resourceId: privateWork.id,
      blob: new File([binary], 'private.bin'),
      meta: { path: 'private.bin' },
    });
    const visitors = [crypto.randomUUID(), crypto.randomUUID()];
    await services.store.set(work.id, 'guestbook', { text: 'A retained visitor entry' });
    for (const [index, visitor] of visitors.entries())
      await services.store.set(
        work.id,
        'guestbook',
        { text: `Private visitor ${index + 1}` },
        'protected',
        visitor,
      );
    const tool = await installToolFile(new Blob([Buffer.from(frozen.archiveBase64, 'base64')]));
    const blobs = new Map<string, Uint8Array>();
    async function asset(label: string) {
      const bytes = new TextEncoder().encode(`Retained ${label} — café`);
      const fingerprint = await hashContent(bytes);
      await source.blobWrite(fingerprint, bytes);
      blobs.set(fingerprint, bytes);
      return fingerprint;
    }
    const portrait = { avatarFingerprint: await asset('historical author') };
    await services.crux.update(work.id, {
      meta: {
        authorSnapshots: { old: portrait },
        personaSnapshots: {
          old: {
            thumbnailFingerprint: await asset('historical dark portrait'),
            thumbnailFingerprintLight: await asset('historical light portrait'),
          },
        },
      },
    });
    const settings: Record<string, unknown> = {
      [SettingsKey.SynthPatch]: { ...synthPreset('glow'), name: 'My quiet room', space: 0.81 },
      [SettingsKey.WorkspaceLayouts]: [
        {
          name: 'Read and make',
          layout: {
            direction: 'row',
            first: 'collaboration',
            second: 'workshop',
            splitPercentage: 35,
          },
        },
      ],
      [SettingsKey.BackgroundImage]: await asset('background'),
      [SettingsKey.MoodCover]: await asset('cover'),
      [SettingsKey.Persona]: {
        name: 'Companion',
        systemPrompt: 'Preserve this instruction.',
        thumbnailFingerprint: await asset('current dark portrait'),
        thumbnailFingerprintLight: await asset('current light portrait'),
      },
      [SettingsKey.SoundTrack]: {
        fingerprint: await asset('music'),
        name: 'Ambient track',
        type: 'audio/wav',
      },
      [SettingsKey.MoodAssets]: [{ fingerprint: await asset('font'), name: 'Font', kind: 'font' }],
      [SettingsKey.MoodThemeDark]: {
        accent: '#446688',
        paneBackground: 'asset:' + (await asset('dark token')),
      },
      [SettingsKey.MoodThemeLight]: { paneBackground: 'asset:' + (await asset('light token')) },
      [SettingsKey.MoodUserPresets]: [
        {
          name: 'Retained theme',
          section: 'Dark',
          overrides: { paneBackground: 'asset:' + (await asset('preset token')) },
        },
      ],
      [SettingsKey.MoodPackages]: [
        {
          format: 'crux-mood',
          version: 1,
          id: 'retained-mood',
          name: 'Retained Mood',
          created: '2026-09-20T12:00:00.000Z',
          cover: await asset('package cover'),
          background: { type: 'image', image: await asset('package background') },
          persona: {
            name: 'Package companion',
            thumbnailFingerprint: await asset('package portrait'),
          },
          assets: [
            { fingerprint: await asset('package asset'), name: 'Package file', kind: 'image' },
          ],
          theme: {
            format: 'crux-mood-theme',
            version: 1,
            name: 'Package theme',
            section: 'Dark',
            overrides: { paneBackground: 'asset:' + (await asset('package token')) },
          },
          sound: {
            track: {
              fingerprint: await asset('package track'),
              name: 'Package sound',
              type: 'audio/wav',
            },
          },
        },
      ],
    };
    for (const [key, value] of Object.entries(settings))
      await source.settings!.put(key, typeof value === 'string' ? value : JSON.stringify(value));
    const checkpoint = await (
      await growthHostFor(work.id)
    ).snapshot({ label: 'Preserved work', requestedBy: 'person' });
    const archive = await exportGarden();
    await closeWorkspaces();
    const destination = await createLocalApiTestClient();
    setSqliteClient(destination.client);
    useGardenContext.getState().initialize(await destination.client.enterLocalGarden!());
    clearAllSettings();
    try {
      await initServices();
      const discarded = await getServices().crux.create({ title: 'Destination before restore' });
      await importGarden({ data: archive.blob });
      await destination.restart();
      useGardenContext.getState().initialize(await destination.client.enterLocalGarden!());
      await initSettings();
      const restored = getServices();
      await expect(restored.crux.findById(discarded.id)).rejects.toThrow();
      expect(await getCruxspace(studio.id)).toMatchObject({ name: 'Studio', cruxIds: [work.id] });
      expect(await getCruxspace(library.id)).toMatchObject({
        name: 'Library',
        cruxIds: [privateWork.id],
      });
      expect((await restored.crux.findById(work.id)).meta).toMatchObject({
        authorSnapshots: { old: portrait },
      });
      expect((await restored.crux.findById(checkpoint.id)).meta).toMatchObject({
        messages: [{ role: 'user', content: 'Keep the conversation' }],
      });
      for (const [fp, bytes] of blobs) expect(await destination.client.blobRead(fp)).toEqual(bytes);
      for (const [key, value] of Object.entries(settings)) {
        const row = await destination.client.get<{ value: string }>(
          'SELECT value FROM settings WHERE key = ?',
          [key],
        );
        expect(row?.value, key).toBe(typeof value === 'string' ? value : JSON.stringify(value));
      }
      expect(listWorkspaceLayouts().map((layout) => layout.name)).toEqual(['Read and make']);
      const patch = await destination.client.get<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        [SettingsKey.SynthPatch],
      );
      expect(parseSynthPatch(JSON.parse(patch!.value))).toMatchObject({
        name: 'My quiet room',
        space: 0.81,
      });
      const installed = installedTool(tool.id)!;
      expect(installed).toMatchObject({
        cruxId: tool.cruxId,
        publishedCruxId: tool.publishedCruxId,
      });
      const unpacked = (await installedToolPackage(installed))!;
      for (const file of frozen.files)
        expect(await unpacked.files.find((entry) => entry.path === file.path)!.read()).toEqual(
          new Uint8Array(Buffer.from(file.base64, 'base64')),
        );
      const files = await restored.artifact.findByResource('crux', work.id);
      expect(functionFiles(files)).toEqual([
        { name: 'hello', path: 'functions/hello.js', kind: 'http' },
        { name: 'on-fixture', path: 'functions/on-fixture.js', kind: 'event', event: 'fixture' },
        { name: 'tick', path: 'functions/tick.js', kind: 'http' },
      ]);
      for (const [path, content] of Object.entries(functions))
        expect(await restored.artifact.readContent(files.find((f) => f.meta?.path === path)!)).toBe(
          content,
        );
      const privateFile = (await restored.artifact.findByResource('crux', privateWork.id))[0]!;
      expect(
        new Uint8Array(await (await restored.artifact.downloadBlob(privateFile)).arrayBuffer()),
      ).toEqual(binary);
      expect(await restored.store.get(work.id, 'guestbook')).toEqual({
        text: 'A retained visitor entry',
      });
      for (const [index, visitor] of visitors.entries())
        expect(await restored.store.get(work.id, 'guestbook', visitor)).toEqual({
          text: `Private visitor ${index + 1}`,
        });
    } finally {
      await closeWorkspaces();
      await destination.client.close();
      setSqliteClient(source);
      useGardenContext.getState().initialize(await source.enterLocalGarden!());
      clearAllSettings();
      await initSettings();
    }
  });
});
