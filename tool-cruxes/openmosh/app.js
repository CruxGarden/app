// SPDX-License-Identifier: MIT
import { $, button, labeled, message, download, openProject } from './shared/session.js';
import { EFFECTS } from './shared/model.js';
const shaders = await fetch('vendor/effects.json').then((r) => r.json());
$('#app').innerHTML =
  '<div class="split"><aside><div class="card"><h2>Source image</h2><input id="import" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Import image"><p>Six OpenMosh effects. Keep your original image and change the treatment.</p></div><div class="card"><h2>Add an effect</h2><select id="effect" aria-label="Effect"></select><button id="add">Add effect</button></div><div id="effects"></div></aside><section><div class="viewport"><canvas id="canvas" width="960" height="640"></canvas></div><div class="actions" style="margin-top:16px"><button id="export" class="primary">Export PNG</button><label>Effect time<input id="time" type="range" min="0" max="30" step="0.1" value="0"></label><span id="dimensions" class="muted"></span></div></section></div>';
for (const [key, def] of Object.entries(EFFECTS)) {
  const o = document.createElement('option');
  o.value = key;
  o.textContent = def.name;
  $('#effect').append(o);
}
const canvas = $('#canvas');
const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, alpha: true });
if (!gl) throw new Error('This effects workspace needs WebGL 2.');
function compile(type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const programs = new Map();
function program(name) {
  if (programs.has(name)) return programs.get(name);
  const p = gl.createProgram();
  const vert = compile(gl.VERTEX_SHADER, shaders.vertex),
    frag = compile(gl.FRAGMENT_SHADER, shaders[name]);
  gl.attachShader(p, vert);
  gl.attachShader(p, frag);
  gl.linkProgram(p);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const uniforms = {};
  for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
    const info = gl.getActiveUniform(p, i);
    uniforms[info.name] = { location: gl.getUniformLocation(p, info.name), type: info.type };
  }
  const result = { p, uniforms };
  programs.set(name, result);
  return result;
}
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const buffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
  gl.STATIC_DRAW,
);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
let source = null,
  sourcePath = null,
  targets = [],
  generation = 0;
function texture() {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
async function renderImage(doc) {
  const mine = ++generation;
  if (sourcePath !== doc.source) {
    const image = new Image();
    image.src = doc.source ? 'data/' + doc.source : 'assets/demo.png';
    await image.decode();
    if (mine !== generation) return;
    const scale = Math.min(1, 1400 / image.width, 1000 / image.height);
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    if (source) gl.deleteTexture(source);
    for (const t of targets) {
      gl.deleteTexture(t.texture);
      gl.deleteFramebuffer(t.framebuffer);
    }
    targets = [];
    source = texture();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    for (let i = 0; i < 2; i++) {
      const tex = texture();
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        canvas.width,
        canvas.height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('Image buffer could not be created.');
      targets.push({ texture: tex, framebuffer });
    }
    sourcePath = doc.source;
    $('#dimensions').textContent = `${canvas.width} × ${canvas.height} output · original preserved`;
  }
  if (!source) return;
  const chain = doc.effects.length ? doc.effects : [{ kind: 'passthrough', values: {} }];
  let input = source;
  chain.forEach((effect, i) => {
    const out = i === chain.length - 1 ? null : targets[i % 2];
    gl.bindFramebuffer(gl.FRAMEBUFFER, out?.framebuffer || null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const { p, uniforms } = program(effect.kind);
    gl.useProgram(p);
    gl.bindVertexArray(vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    const values = {
      u_texture: 0,
      u_flipY: 1,
      u_time: doc.time,
      ...Object.fromEntries(Object.entries(effect.values).map(([k, v]) => ['u_' + k, v])),
    };
    for (const [key, value] of Object.entries(values)) {
      const u = uniforms[key];
      if (u) {
        if (u.type === gl.INT || u.type === gl.SAMPLER_2D) gl.uniform1i(u.location, value);
        else gl.uniform1f(u.location, value);
      }
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (out) input = out.texture;
  });
  canvas.dataset.rendered = String(generation);
}
sourcePath = undefined;
const outputName = document.createElement('input');
outputName.value = 'Album artwork';
outputName.maxLength = 120;
outputName.setAttribute('aria-label', 'Output name');
const outputStatus = document.createElement('span');
outputStatus.setAttribute('role', 'status');
const outputActions = document.createElement('div');
outputActions.className = 'actions';
outputActions.style.marginTop = '16px';
outputActions.append(outputName);
$('#canvas').parentElement.parentElement.append(outputActions);
button(
  'Save output for Cruxspace',
  async () => {
    await session.save();
    await renderImage(session.doc);
    outputStatus.textContent = 'Saving output…';
    try {
      await session.call({
        op: 'save-output',
        content: canvas.toDataURL('image/png'),
        label: outputName.value,
      });
      outputStatus.textContent = 'Output ready in this Crux’s Cruxspaces';
    } catch (error) {
      outputStatus.textContent = '';
      throw error;
    }
  },
  outputActions,
);
outputActions.append(outputStatus);
let session;
try {
  session = await openProject('openmosh', async (doc) => {
    $('#time').value = doc.time;
    $('#effects').replaceChildren();
    doc.effects.forEach((effect, index) => {
      const box = document.createElement('div');
      box.className = 'card';
      const h = document.createElement('h2');
      h.textContent = EFFECTS[effect.kind].name;
      box.append(h);
      for (const [key, [min, max]] of Object.entries(EFFECTS[effect.kind].params)) {
        const input = document.createElement('input');
        input.type = 'range';
        input.min = min;
        input.max = max;
        input.step = max <= 1 ? 0.01 : 1;
        input.value = effect.values[key];
        input.setAttribute('aria-label', `${EFFECTS[effect.kind].name} ${key}`);
        input.onchange = () =>
          void session
            .update((d) => {
              d.effects[index].values[key] = Number(input.value);
            })
            .catch(message);
        labeled(key, input, box);
      }
      button(
        'Remove',
        () =>
          session.update((d) => {
            d.effects.splice(index, 1);
          }),
        box,
      );
      $('#effects').append(box);
    });
    await renderImage(doc);
  });
} catch (e) {
  message(e);
}
$('#add').onclick = () =>
  void session
    .update((doc) => {
      const kind = $('#effect').value;
      doc.effects.push({
        kind,
        values: Object.fromEntries(
          Object.entries(EFFECTS[kind].params).map(([key, v]) => [key, v[2]]),
        ),
      });
    })
    .catch(message);
$('#time').onchange = (e) =>
  void session
    .update((d) => {
      d.time = Number(e.target.value);
    })
    .catch(message);
$('#import').onchange = async (e) => {
  try {
    const source = await session.importImage(e.target.files[0]);
    await session.update((d) => {
      d.source = source;
    });
    await session.save();
  } catch (error) {
    message(error);
  } finally {
    e.target.value = '';
  }
};
$('#export').onclick = async () => {
  try {
    await session.save();
    await renderImage(session.doc);
    canvas.toBlob(
      (blob) =>
        blob ? download(blob, 'openmosh-image.png') : message(new Error('PNG export failed.')),
      'image/png',
    );
  } catch (e) {
    message(e);
  }
};
