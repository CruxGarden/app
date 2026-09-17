const { test, before } = require('node:test');
const assert = require('node:assert/strict');
let gd, addNativeObject, validateResourceFile, prepareObjectEdits;
before(async () => {
  ({ addNativeObject, validateResourceFile } = await import('./creation.mjs'));
  ({ prepareObjectEdits } = await import('./objects.mjs'));
  gd = await require('../Binaries/embuild/GDevelop.js/libGD.js')();
  gd.JsPlatform.get().addNewExtension(
    require('../Extensions/3D/JsExtension.js').createExtension((x) => x, gd),
  );
});
test('native GLB resource binds to an editable 3D Model; duplicate and unknown creation preserve objects', () => {
  const project = gd.ProjectHelper.createNewGDJSProject();
  try {
    const layout = project.insertNewLayout('Play', 0);
    layout.getVariables().insertNew('PersonNote', 0).setString('Keep my level');
    const resource = new gd.Model3DResource();
    resource.setName('SproutModel');
    resource.setFile('garden:media-fixture/sprout.glb');
    project.getResourcesManager().addResource(resource);
    resource.delete();
    const command = {
      op: 'add-object',
      scene: 'Play',
      name: 'Sprout',
      type: 'Scene3D::Model3DObject',
    };
    assert.equal(addNativeObject(gd, project, command).type, command.type);
    const object = layout.getObjects().getObject('Sprout');
    prepareObjectEdits(gd, project, layout, {
      op: 'edit-properties',
      scene: 'Play',
      expectedState: 'a'.repeat(64),
      scope: 'scene',
      object: 'Sprout',
      updates: [
        { name: 'modelResourceName', value: 'SproutModel' },
        { name: 'width', value: 96 },
        { name: 'height', value: 96 },
        { name: 'depth', value: 144 },
      ],
    }).apply();
    assert.equal(
      gd.asModel3DConfiguration(object.getConfiguration()).getModelResourceName(),
      'SproutModel',
    );
    assert.equal(layout.getVariables().get('PersonNote').getString(), 'Keep my level');
    assert.throws(() => addNativeObject(gd, project, command), /already exists/);
    assert.throws(
      () => addNativeObject(gd, project, { ...command, name: 'Bad', type: 'Unknown::Type' }),
      /Unknown/,
    );
    assert.equal(layout.getObjects().getObjectsCount(), 1);
    assert.equal(
      addNativeObject(gd, project, { ...command, name: 'Score', type: 'TextObject::Text' }).type,
      'TextObject::Text',
    );
  } finally {
    project.delete();
  }
});
test('model resources reject text renamed to GLB and truncated GLB bytes', () => {
  assert.throws(
    () =>
      validateResourceFile('model3D', new TextEncoder().encode('not a model'), 'model/gltf-binary'),
    /GLB/,
  );
  const bytes = new Uint8Array(20);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, 100, true);
  assert.throws(() => validateResourceFile('model3D', bytes, 'application/octet-stream'), /GLB/);
  view.setUint32(8, 20, true);
  validateResourceFile('model3D', bytes, 'application/octet-stream');
});
