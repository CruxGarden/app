import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the pinned native history codec. Only the image encoding/decoding boundary
// is stubbed; the actual buffer allocation, metadata and PNG byte transfer run unchanged.
function codec() {
  const root = {
    pskl: {
      model: { piskel: {} },
      rendering: {},
      utils: { serialization: { arraybuffer: {} } },
      app: { piskelController: { getFPS: () => 6 } },
    },
  };
  const encoded = [];
  const frames = [{ getWidth: () => 32, getHeight: () => 32 }];
  const context = vm.createContext({
    ...root,
    Constants: { MODEL_VERSION: 2 },
    $: { namespace: (path) => path.split('.').reduce((o, k) => (o[k] ??= {}), root) },
    Image: class {
      set src(value) {
        encoded.push(value);
        this.onload();
      }
    },
  });
  root.pskl.rendering.FramesheetRenderer = function () {
    this.renderAsCanvas = () => ({ toDataURL: () => 'data:image/png;base64,YWJjZA==' });
  };
  root.pskl.utils.FrameUtils = { createFramesFromSpritesheet: () => frames };
  for (const file of [
    'model/piskel/Descriptor.js',
    'model/Layer.js',
    'model/Piskel.js',
    'utils/serialization/arraybuffer/ArrayBufferSerializer.js',
    'utils/serialization/arraybuffer/ArrayBufferDeserializer.js',
  ])
    vm.runInContext(readFileSync(new URL('../js/' + file, import.meta.url), 'utf8'), context);
  return { pskl: root.pskl, encoded, frames };
}
for (const hidden of [[], [0, 2, 12]])
  test(`native history preserves PNG bytes, description and hidden indices ${JSON.stringify(hidden)}`, () => {
    const { pskl, encoded, frames } = codec();
    const project = new pskl.model.Piskel(
      32,
      32,
      6,
      new pskl.model.piskel.Descriptor('Seed', 'Manual description'),
    );
    project.hiddenFrames = hidden;
    project.addLayer(pskl.model.Layer.fromFrames('Art', frames));
    let restored;
    const binary = pskl.utils.serialization.arraybuffer.ArrayBufferSerializer.serialize(project);
    pskl.utils.serialization.arraybuffer.ArrayBufferDeserializer.deserialize(
      binary,
      (value) => (restored = value),
    );
    assert.deepEqual(encoded, ['data:image/png;base64,YWJjZA==']);
    assert.equal(restored.getDescriptor().description, 'Manual description');
    assert.deepEqual(Array.from(restored.hiddenFrames), hidden);
  });
