import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from './model.js';
const doc = () => ({
  version: 1,
  app: 'piskel',
  project: {
    modelVersion: 2,
    piskel: {
      name: 'Sprite',
      description: '',
      width: 32,
      height: 32,
      fps: 8,
      layers: [
        {
          name: 'Art',
          opacity: 1,
          frameCount: 2,
          chunks: [
            {
              layout: [[0], [1]],
              base64PNG: {
                __cruxBinary: {
                  path: 'assets/' + 'a'.repeat(64) + '.bin',
                  kind: 'buffer',
                  type: 'image/png',
                  size: 50,
                },
              },
            },
          ],
        },
      ],
    },
  },
});
test('validates sprite sheets and rejects missing or duplicate animation frames', () => {
  validateProject(doc());
  const missing = doc();
  missing.project.piskel.layers[0].chunks[0].layout = [[0]];
  assert.throws(() => validateProject(missing), /missing/);
  const duplicate = doc();
  duplicate.project.piskel.layers[0].chunks[0].layout = [[0], [0]];
  assert.throws(() => validateProject(duplicate), /repeated/);
  const wrong = doc();
  wrong.project.piskel.layers[0].chunks[0].base64PNG.__cruxBinary.path = '../image.png';
  assert.throws(() => validateProject(wrong), /sprite sheet/);
});
test('bounds decoded animation pixels before loading', () => {
  const large = doc();
  large.project.piskel.width = 4096;
  large.project.piskel.height = 4096;
  large.project.piskel.layers.push(structuredClone(large.project.piskel.layers[0]));
  assert.throws(() => validateProject(large), /64 million/);
});
