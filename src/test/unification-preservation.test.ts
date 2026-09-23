import {
  toolFunctionProfile,
  toolFunctionIds,
  preservedFunction,
  preservedEvent,
  preservedSchedule,
} from './fixtures/unification/tool-function-profile';
import frozen from './fixtures/unification/tool-package-v1.json';
import { installedTool, installedToolPackage } from '../services/crux-tools/installed';
import { functionFiles } from '../services/crux-functions';
import { getServices, initServices } from '../services';
import { describe, expect, it } from 'vitest';
import { getSqliteClient, setSqliteClient } from '../services/sqlite/client';
import { createTestSqliteClient } from './sqlite-client';
import { legacyIds, seedLegacyProfile } from './fixtures/unification/legacy-profile';
import ledger from './fixtures/unification/settings-ledger.json';
import { SettingsKey, isSecretSettingKey } from '../lib/constants';
import { exportGarden, importGarden } from '../services/garden-io';
import { clearAllSettings, initSettings } from '../services/settings';
import { listCruxspaces } from '../services/cruxspaces';
import { parseSynthPatch } from '../audio/synth-patch';
import { listWorkspaceLayouts } from '../services/workspace-layouts';

describe('unification preservation baseline', () => {
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

  it('round-trips the complete legacy profile through current recovery export into a fresh database', async () => {
    const fixture = toolFunctionProfile();
    const source = getSqliteClient();
    await seedLegacyProfile(source, fixture);
    const before: Record<string, unknown[]> = {};
    for (const table of Object.keys(fixture.tables))
      before[table] = await source.all(`SELECT * FROM ${table} ORDER BY 1`);
    const exported = await exportGarden();
    const destination = await createTestSqliteClient();
    setSqliteClient(destination);
    clearAllSettings();
    await importGarden({ data: exported.blob });
    // Existing recovery deliberately invalidates an open review; its content,
    // candidate and ancestry remain available for a fresh review on this host.
    before.task_merges = (before.task_merges as Record<string, unknown>[]).map((row) => ({
      ...row,
      phase: row.phase === 'review' ? 'cancelled' : row.phase,
    }));
    for (const [table, rows] of Object.entries(before))
      expect(await destination.all(`SELECT * FROM ${table} ORDER BY 1`), table).toEqual(rows);
    for (const blob of fixture.blobs)
      expect([...(await destination.blobRead(blob.fingerprint))]).toEqual(blob.bytes);
    await initSettings();
    const spaces = await listCruxspaces();
    expect(spaces.filter((space) => space.cruxIds.includes(legacyIds.shared))).toHaveLength(2);
    expect(spaces.find((space) => space.id === legacyIds.spaceA)!.cruxIds).not.toContain(
      legacyIds.private,
    );
    expect(listWorkspaceLayouts().map((layout) => layout.name)).toEqual(['Read and make']);
    const stored = await destination.get<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [SettingsKey.SynthPatch],
    );
    expect(parseSynthPatch(JSON.parse(stored!.value))).toMatchObject({
      name: 'My quiet room',
      space: 0.81,
    });
    await initServices('local');
    const tool = installedTool(frozen.manifest.id)!;
    expect(tool).toMatchObject({
      cruxId: toolFunctionIds.tool,
      publishedCruxId: toolFunctionIds.publishedTool,
    });
    const packageFiles = await getServices().artifact.findByResource('crux', tool.cruxId);
    expect(packageFiles).toHaveLength(1); // Immutable tool stays one content entity.
    const unpacked = (await installedToolPackage(tool))!;
    expect(unpacked.manifest).toMatchObject(frozen.manifest);
    for (const file of frozen.files) {
      const content = await unpacked.files.find((entry) => entry.path === file.path)!.read();
      expect([...content], file.path).toEqual([...Buffer.from(file.base64, 'base64')]);
    }
    const legacy = installedTool('legacy-preservation-tool')!;
    expect(await installedToolPackage(legacy)).toBeNull(); // Old per-file install still readable.
    const legacyFiles = await getServices().artifact.findByResource('crux', legacy.cruxId);
    expect(legacyFiles).toHaveLength(frozen.files.length);
    for (const file of frozen.files) {
      const artifact = legacyFiles.find((entry) => entry.meta?.path === file.path)!;
      expect(
        [
          ...new Uint8Array(
            await (await getServices().artifact.downloadBlob(artifact.id)).arrayBuffer(),
          ),
        ],
        file.path,
      ).toEqual([...Buffer.from(file.base64, 'base64')]);
    }
    const functions = await getServices().artifact.findByResource('crux', legacyIds.shared);
    expect(functionFiles(functions)).toEqual([
      { name: 'hello', path: 'functions/hello.js', kind: 'http' },
      { name: 'on-fixture', path: 'functions/on-fixture.js', kind: 'event', event: 'fixture' },
      { name: 'tick', path: 'functions/tick.js', kind: 'http' },
    ]);
    for (const [path, expected] of Object.entries({
      'functions/hello.js': preservedFunction,
      'functions/on-fixture.js': preservedEvent,
      'functions/tick.js': preservedSchedule,
    })) {
      const file = functions.find((entry) => entry.meta?.path === path)!;
      expect(await getServices().artifact.readContent(file.id)).toBe(expected);
    }
    expect(await getServices().store.get(legacyIds.shared, 'guestbook')).toEqual({
      text: 'A retained visitor entry',
    });
    expect(
      await getServices().store.get(legacyIds.shared, 'guestbook', toolFunctionIds.visitorA),
    ).toEqual({ text: 'Private visitor 1' });
    expect(
      await getServices().store.get(legacyIds.shared, 'guestbook', toolFunctionIds.visitorB),
    ).toEqual({ text: 'Private visitor 2' });
    // Recovery is intentionally whole-installation: selective export must be
    // tested separately, never inferred from this all-records preservation test.
  });
});
