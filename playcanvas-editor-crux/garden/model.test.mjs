import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from './model.js';
const root = '11111111-1111-4111-8111-111111111111';
const child = '22222222-2222-4222-8222-222222222222';
const entity = (id, parent, children) => ({
    resource_id: id,
    parent,
    children,
    components: { render: { type: 'box' } },
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1]
});
const project = () => ({
    version: 1,
    app: 'playcanvas-editor',
    project: {
        name: 'Scene',
        settings: {},
        assets: {},
        scene: { settings: {}, entities: { [root]: entity(root, null, [child]), [child]: entity(child, root, []) } }
    }
});
test('accepts native hierarchy and rejects missing, contradictory and cyclic references', () => {
    validateProject(project());
    const missing = project();
    delete missing.project.scene.entities[child];
    assert.throws(() => validateProject(missing), /child/);
    const badParent = project();
    badParent.project.scene.entities[child].parent = child;
    assert.throws(() => validateProject(badParent), /child|Parent/);
    const orphan = project();
    orphan.project.scene.entities[root].children = [];
    assert.throws(() => validateProject(orphan), /Parent/);
    const extraRoot = project();
    extraRoot.project.scene.entities[child].parent = null;
    extraRoot.project.scene.entities[root].children = [];
    assert.throws(() => validateProject(extraRoot), /one root/);
    const nonfinite = project();
    nonfinite.project.scene.entities[child].position[0] = Infinity;
    assert.throws(() => validateProject(nonfinite), /entity/);
});
test('requires complete snapshots and restricts content references to fingerprinted originals', () => {
    assert.throws(() => validateProject({ version: 1, app: 'playcanvas-editor', project: {} }), /Missing/);
    const doc = project();
    doc.project['file-1'] = {
        __cruxBinary: { path: 'assets/' + 'a'.repeat(64) + '.bin', type: 'image/png', kind: 'buffer', size: 4 }
    };
    validateProject(doc);
    doc.project['file-1'].__cruxBinary.path = '../outside.png';
    assert.throws(() => validateProject(doc), /reference/);
    assert.throws(() => validateProject({ version: 1, app: 'another-app', project: null }), /Invalid/);
});
