import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// @ts-expect-error build helper is native ESM
import { readEdition } from './edition.mjs';
describe('public wireframe edition', () => {
  it('keeps selected interactions and removes excluded designs and links', () => {
    const root = mkdtempSync(join(tmpdir(), 'moqira-edition-'));
    try {
      mkdirSync(join(root, 'mockups'));
      writeFileSync(
        join(root, 'mockups/publish.json'),
        JSON.stringify({ title: 'Shared', wireframes: ['one', 'two'] }),
      );
      writeFileSync(
        join(root, 'mockups/project.json'),
        JSON.stringify({
          name: 'PRIVATE PROJECT TITLE',
          appearance: { accentColor: '#f00', private: 'PRIVATE APPEARANCE FIELD' },
          private: 'PRIVATE TOP LEVEL',
          wireframes: [
            {
              id: 'one',
              name: 'Public',
              notes: 'PRIVATE FRAME FIELD',
              nodes: [
                {
                  id: 'button',
                  kind: 'button',
                  text: 'Continue',
                  links: {
                    whole: { kind: 'wireframe', wireframeId: 'two' },
                    secret: { kind: 'wireframe', wireframeId: 'private' },
                    invalid: { kind: 'url', url: 'javascript:alert(1)' },
                    website: { kind: 'url', url: 'https://example.com' },
                    back: { kind: 'back' },
                  },
                },
              ],
            },
            { id: 'two', name: 'Second', nodes: [] },
            { id: 'private', name: 'PRIVATE SENTINEL', nodes: [] },
          ],
        }),
      );
      const result = readEdition(root);
      expect(result.name).toBe('Shared');
      expect(result.wireframes).toHaveLength(2);
      expect(result.wireframes[0].nodes[0].links).toEqual({
        whole: { kind: 'wireframe', wireframeId: 'two' },
        website: { kind: 'url', url: 'https://example.com' },
        back: { kind: 'back' },
      });
      expect(JSON.stringify(result)).not.toContain('PRIVATE');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
