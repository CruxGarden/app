import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { launchApp } from '../launch';
import { enterGarden, createCrux, storedCrux } from '../multi-crux-helpers';
import { openPanel, showPane, hidePane } from '../panel-helpers';
import { writeFirstFile } from '../journeys/journey-helpers';

/**
 * V1-TESTING-GUIDE § 24 · Settings: Agents — an exported project carries no
 * connection credentials. Connecting, scoping and tokens are journeys/09,
 * garden-mcp and agent-host specs.
 */
test.describe('guide 24 · Agents', () => {
  test('MCP-08 — a Crux with agent access enabled exports without its token or mcp.json', async () => {
    test.setTimeout(150_000);
    const { app, page, dir } = await launchApp();
    try {
      await enterGarden(page);
      const id = await createCrux(page, 'Agent study');
      await writeFirstFile(page, 'index.html', '<h1>Study</h1>');
      const settings = await showPane(page, 'Settings');
      await settings
        .getByRole('switch', { name: 'Agent access for Agent study', exact: true })
        .click();
      const folder = (await storedCrux(page, id)).projectFolder as string;
      const configPath = join(folder, '.crux', 'mcp.json');
      await expect.poll(() => existsSync(configPath), { timeout: 30_000 }).toBe(true);
      const { token } = JSON.parse(readFileSync(configPath, 'utf8')) as { token: string };
      expect(token.length).toBeGreaterThan(8);
      await hidePane(page, 'Settings');

      const exportPane = await openPanel(page, 'export', 'Toggle export');
      const filename = join(dir, 'agent-study.crux');
      await app.evaluate(({ session }, filename) => {
        session.defaultSession.once('will-download', (_event: Event, item: DownloadItem) =>
          item.setSavePath(filename),
        );
      }, filename);
      await exportPane.getByRole('button', { name: 'Export Crux', exact: true }).click();
      await expect.poll(() => existsSync(filename), { timeout: 60_000 }).toBe(true);
      const zip = await JSZip.loadAsync(readFileSync(filename));
      const names = Object.keys(zip.files);
      expect(names.some((n) => /(^|\/)\.crux\/mcp\.json$/.test(n))).toBe(false);
      // No entry carries the token, in any file the archive holds.
      for (const name of names) {
        const entry = zip.file(name);
        if (!entry) continue;
        const text = await entry.async('string');
        expect(text.includes(token), name).toBe(false);
      }
    } finally {
      await app.close();
    }
  });
});
