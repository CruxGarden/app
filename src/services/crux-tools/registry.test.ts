import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseManifest } from './manifest';
import { toolManifests, toolManifest, nativeAppTypes, toolInfos, toolRoutes } from './registry';
import { loadTemplate } from '@/templates';
import { TOOL_INFO } from '@/lib/tool-info';
import { nativeAppType, isLocalCreationTool } from '@/services/embedded-app';
import { routeFile } from '@/services/file-routing';

describe('crux-tool.json manifests (ADR 0050)', () => {
  it('every tool folder with a manifest is registered, and every manifest points at a real folder', () => {
    const tools = toolManifests();
    expect(tools.length).toBeGreaterThanOrEqual(38);
    for (const m of tools) {
      const folder = join(process.cwd(), `${m.id.replace(/-app$/, '')}-crux`);
      expect(existsSync(folder), `${m.id} → ${folder}`).toBe(true);
      expect(existsSync(join(folder, 'crux-tool.json'))).toBe(true);
      if (m.host) expect(m.host).toMatch(/^garden\//);
    }
    // Menu order is total: no two tools share a slot.
    const orders = tools.map((m) => m.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('the app-type map, provenance and drop routes are views over the manifests', () => {
    for (const m of toolManifests()) {
      expect(nativeAppTypes()[m.id]).toBe(m.app);
      expect(nativeAppType({ meta: { template: m.id } })).toBe(m.app);
      expect(TOOL_INFO[m.id]).toEqual(m.toolInfo);
      expect(toolInfos()[m.id]).toEqual(m.toolInfo);
      expect(isLocalCreationTool({ meta: { template: m.id } })).toBe(!m.share);
      for (const r of m.routes)
        for (const ext of r.extensions) {
          const route = routeFile(`anything${ext}`);
          expect(route?.templateId, `${ext} → ${m.id}`).toBe(m.id);
          expect(route?.folder).toBe(r.folder);
          expect(route?.tool).toBe(m.name);
        }
    }
    // Case-insensitive, and the fallback still wins for what no tool claims.
    expect(routeFile('SHOT.PNG')?.templateId).toBe('minipaint-app');
    expect(routeFile('page.html')?.templateId).toBe('blank');
    expect(routeFile('clip.MP4')?.templateId).toBe('opencut-app');
  });

  it('a template definition is assembled from the manifest and the module files', async () => {
    const m = toolManifest('kan-app')!;
    const def = (await loadTemplate('kan-app'))!;
    expect(def.greeting).toBe(m.greeting);
    expect(def.context).toBe(m.context);
    expect((def.meta?.settings as { entryFile: string }).entryFile).toBe(m.entryFile);
    expect(def.meta?.toolInfo).toEqual(m.toolInfo);
    expect(def.layout?.panes).toContain('workshop');
    const seed = def.files.find((f) => f.path === m.document!.path);
    expect(seed && JSON.parse(seed.content)).toEqual(m.document!.seed);
    expect(def.files.some((f) => f.path === 'runtime/index.html')).toBe(true);
  }, 60_000);

  it('rejects a manifest that would let a tool escape its Crux or lie about itself', () => {
    const good = toolManifest('hextris-app')!;
    expect(() => parseManifest({ ...good, version: 2 })).toThrow(/version/);
    expect(() => parseManifest({ ...good, id: 'Bad Id' })).toThrow(/id/);
    expect(() => parseManifest({ ...good, entryFile: '../index.html' })).toThrow(/entryFile/);
    expect(() =>
      parseManifest({ ...good, toolInfo: { ...good.toolInfo, detailsPath: '../../etc' } }),
    ).toThrow(/detailsPath/);
    expect(() =>
      parseManifest({ ...good, toolInfo: { ...good.toolInfo, upstream: 'http://x' } }),
    ).toThrow(/upstream/);
    expect(() =>
      parseManifest({ ...good, routes: [{ extensions: ['png'], folder: 'x' }] }),
    ).toThrow(/ext/);
    expect(parseManifest({ ...good, routes: undefined }).routes).toEqual([]);
  });
});
