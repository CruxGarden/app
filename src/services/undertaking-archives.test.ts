import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import JSZip from 'jszip';
import catalog from '@/data/cruxspace-templates.json';

// These shipped assets are authored through the actual API, not assembled by the web-only
// test database. An old bundled format otherwise passes importer unit tests but
// fails when someone starts an undertaking in the desktop app.
for (const template of catalog) {
  it(`${template.id} ships complete current-format starter and worked-example archives`, async () => {
    for (const edition of ['starter', 'example']) {
      const zip = await JSZip.loadAsync(
        readFileSync(`public/cruxspace-templates/${template.id}-${edition}.cruxspace`),
      );
      const collection = JSON.parse(await zip.file('cruxspace.json')!.async('text'));
      expect(collection.unavailable).toEqual([]);
      expect(collection.members).toHaveLength(2);
      for (const member of collection.members) {
        const envelope = JSON.parse(
          await zip.file(`${member.archive}manifest.json`)!.async('text'),
        );
        expect(envelope).toMatchObject({
          archiveVersion: 3,
          purpose: 'private-backup',
          graphVersion: 2,
          payloadVersion: 1,
        });
        const graphBytes = await zip.file(`${member.archive}graph.json`)!.async('uint8array');
        expect(createHash('sha256').update(graphBytes).digest('hex')).toBe(
          envelope.graphFingerprint,
        );
        const graph = JSON.parse(new TextDecoder().decode(graphBytes));
        expect(graph.selection.roots).toEqual([member.id]);
        expect(
          graph.cruxes.filter((node: { kind: string }) => node.kind === 'snapshot').length,
        ).toBeGreaterThanOrEqual(edition === 'example' ? 3 : 1);
        expect(graph.fingerprints.length).toBeGreaterThan(0);
        for (const fingerprint of graph.fingerprints) {
          const bytes = await zip
            .file(`${member.archive}content/${fingerprint}`)!
            .async('uint8array');
          expect(createHash('sha256').update(bytes).digest('hex')).toBe(fingerprint);
        }
        for (const node of graph.cruxes) {
          expect(node.meta).not.toHaveProperty('projectFolder');
          expect(node.meta).not.toHaveProperty('turnJob');
          expect(node).not.toHaveProperty('visibility');
        }
      }
    }
  });
}
