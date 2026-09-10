// SPDX-License-Identifier: MIT
import {
  Application,
  Entity,
  Color,
  StandardMaterial,
  FILLMODE_NONE,
  RESOLUTION_AUTO,
} from './vendor/engine.js';
import { $, button, labeled, message, download, openProject } from './shared/session.js';
import { SHAPES } from './shared/model.js';
$('#app').innerHTML =
  '<div class="split"><aside><div class="card"><h2>Add to your world</h2><div class="actions" id="add-shapes"></div></div><div class="card"><h2>Objects</h2><div id="objects" class="stack"></div></div><div class="card" id="properties"></div></aside><section><div class="viewport" style="height:560px;min-height:0"><canvas id="scene" style="width:100%;height:100%;max-height:none"></canvas></div><div class="actions" style="margin-top:16px"><label>Background<input id="background" type="color" aria-label="Scene background"></label><label>Animate<input id="animate" type="checkbox" aria-label="Animate scene"></label><button id="front">Front view</button><button id="isometric">Isometric view</button><button id="export">Export scene JSON</button></div><p>A small scene built with the PlayCanvas engine. Change its objects here, or ask the agent to build on it. Customize app opens the actual source in a Task.</p></section></div>';
const canvas = $('#scene');
let engine;
try {
  engine = new Application(canvas, { graphicsDeviceOptions: { antialias: true, alpha: false } });
} catch (e) {
  message(e);
  throw e;
}
engine.setCanvasFillMode(FILLMODE_NONE);
engine.setCanvasResolution(RESOLUTION_AUTO);
engine.scene.ambientLight = new Color(0.35, 0.4, 0.5);
const camera = new Entity('Workshop camera');
camera.addComponent('camera', { clearColor: new Color(0.1, 0.16, 0.24), fov: 45 });
camera.setPosition(7, 5, 9);
camera.lookAt(0, 1, 0);
engine.root.addChild(camera);
const light = new Entity('Workshop light');
light.addComponent('light', {
  type: 'directional',
  color: new Color(1, 0.9, 0.78),
  intensity: 2,
  castShadows: true,
  shadowDistance: 20,
  shadowResolution: 2048,
  shadowBias: 0.2,
  normalOffsetBias: 0.1,
});
light.setEulerAngles(45, 30, 0);
engine.root.addChild(light);
const ground = new Entity('Ground');
ground.addComponent('render', { type: 'plane' });
ground.setLocalScale(30, 1, 30);
const groundMaterial = new StandardMaterial();
groundMaterial.diffuse = new Color(0.14, 0.2, 0.25);
groundMaterial.update();
ground.render.material = groundMaterial;
engine.root.addChild(ground);
let sceneDoc,
  session,
  selected = 'center',
  nodes = [],
  elapsed = 0;
engine.autoRender = false;
engine.on('update', (dt) => {
  if (!sceneDoc) return;
  if (sceneDoc.animate && !document.hidden) {
    elapsed += dt;
    for (const [i, node] of nodes.entries()) {
      const o = sceneDoc.objects[i];
      node.setEulerAngles(o.rotation[0], o.rotation[1] + elapsed * 15, o.rotation[2]);
    }
    engine.renderNextFrame = true;
  }
});
const resize = new ResizeObserver(() => {
  const box = canvas.parentElement.getBoundingClientRect();
  engine.resizeCanvas(Math.max(1, box.width), Math.max(1, box.height));
  engine.renderNextFrame = true;
});
resize.observe(canvas.parentElement);
engine.start();
const stop = () => {
  engine.timeScale = 0;
};
window.addEventListener('focus', () => {
  engine.timeScale = 1;
  engine.renderNextFrame = true;
});
function drawProperties(doc) {
  const root = $('#properties');
  root.replaceChildren();
  const object = doc.objects.find((o) => o.id === selected);
  if (!object) {
    root.textContent = 'Select an object to edit it.';
    return;
  }
  const name = document.createElement('input');
  name.value = object.name;
  name.maxLength = 120;
  name.setAttribute('aria-label', 'Object name');
  name.onchange = () =>
    void session
      .update((d) => {
        d.objects.find((o) => o.id === selected).name = name.value;
      })
      .catch(message);
  labeled('Name', name, root);
  const color = document.createElement('input');
  color.type = 'color';
  color.value = object.color;
  color.setAttribute('aria-label', 'Object color');
  color.onchange = () =>
    void session
      .update((d) => {
        d.objects.find((o) => o.id === selected).color = color.value;
      })
      .catch(message);
  labeled('Color', color, root);
  for (const key of ['position', 'rotation', 'scale']) {
    const heading = document.createElement('h2');
    heading.textContent = key;
    root.append(heading);
    for (let i = 0; i < 3; i++) {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 0.1;
      input.min = key === 'scale' ? 0.1 : -360;
      input.max = key === 'scale' ? 20 : 360;
      input.value = object[key][i];
      input.style.width = '100px';
      input.setAttribute('aria-label', `${key} ${'XYZ'[i]}`);
      input.onchange = () =>
        void session
          .update((d) => {
            d.objects.find((o) => o.id === selected)[key][i] = Number(input.value);
          })
          .catch(message);
      labeled('XYZ'[i], input, root);
    }
  }
  button(
    'Remove object',
    () =>
      session.update((d) => {
        d.objects = d.objects.filter((o) => o.id !== selected);
        selected = d.objects[0]?.id;
      }),
    root,
  );
}
try {
  session = await openProject(
    'playcanvas',
    (doc) => {
      sceneDoc = doc;
      elapsed = 0;
      for (const n of nodes) {
        const material = n.findComponent('render')?.material;
        n.destroy();
        material?.destroy();
      }
      nodes = [];
      camera.camera.clearColor = new Color().fromString(doc.background);
      $('#background').value = doc.background;
      $('#animate').checked = doc.animate;
      $('#objects').replaceChildren();
      for (const object of doc.objects) {
        const root = new Entity(object.name);
        root.setPosition(...object.position);
        root.setEulerAngles(...object.rotation);
        const visual = new Entity(object.name + ' visual');
        visual.addComponent('render', { type: object.shape });
        visual.setLocalScale(...object.scale);
        const material = new StandardMaterial();
        material.diffuse = new Color().fromString(object.color);
        material.update();
        visual.render.material = material;
        root.addChild(visual);
        engine.root.addChild(root);
        nodes.push(root);
        const b = button(
          object.name,
          () => {
            selected = object.id;
            drawProperties(session.doc);
          },
          $('#objects'),
        );
        b.dataset.objectId = object.id;
      }
      drawProperties(doc);
      engine.renderNextFrame = true;
      canvas.dataset.objectCount = String(nodes.length);
      // Read-only inspection for verification and agents customizing this local app.
      window.sceneWorkshop = {
        engine,
        inspect: () =>
          nodes.map((n, i) => ({
            id: sceneDoc.objects[i].id,
            name: n.name,
            position: n.getPosition().toArray(),
            bounds: n
              .findComponent('render')
              .meshInstances.map((m) => ({
                center: m.aabb.center.toArray(),
                halfExtents: m.aabb.halfExtents.toArray(),
              })),
          })),
      };
    },
    stop,
  );
} catch (e) {
  message(e);
}
for (const shape of SHAPES)
  button(
    'Add ' + shape,
    () =>
      session.update((d) => {
        const id = crypto.randomUUID();
        selected = id;
        d.objects.push({
          id,
          name: shape + ' ' + (d.objects.length + 1),
          shape,
          color: '#99d9c6',
          position: [(d.objects.length % 5) - 2, 1, 2],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        });
      }),
    $('#add-shapes'),
  );
$('#background').onchange = (e) =>
  void session
    .update((d) => {
      d.background = e.target.value;
    })
    .catch(message);
$('#animate').onchange = (e) => {
  engine.timeScale = 1;
  void session
    .update((d) => {
      d.animate = e.target.checked;
    })
    .catch(message);
};
$('#front').onclick = () => {
  camera.setPosition(0, 3, 11);
  camera.lookAt(0, 1, 0);
  engine.renderNextFrame = true;
};
$('#isometric').onclick = () => {
  camera.setPosition(7, 5, 9);
  camera.lookAt(0, 1, 0);
  engine.renderNextFrame = true;
};
$('#export').onclick = async () => {
  try {
    await session.save();
    download(
      new Blob([JSON.stringify(session.doc, null, 2)], { type: 'application/json' }),
      'scene.json',
    );
  } catch (e) {
    message(e);
  }
};
window.addEventListener('pagehide', () => {
  resize.disconnect();
  engine.destroy();
});
