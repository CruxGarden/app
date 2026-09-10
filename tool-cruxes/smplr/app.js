// SPDX-License-Identifier: MIT
import { Sampler, Sequencer } from './vendor/engine.js';
import { $, message, download, openProject } from './shared/session.js';
import { PADS } from './shared/model.js';
$('#app').innerHTML =
  '<section class="card"><div class="actions"><button id="play" class="primary">Play pattern</button><button id="stop">Stop</button><label>Tempo<input id="bpm" type="number" min="40" max="240" aria-label="Tempo"></label><label>Volume<input id="volume" type="range" min="0" max="100" aria-label="Volume"></label><span id="playing" role="status">Silent</span><meter id="meter" min="0" max="1" value="0" aria-label="Audio level"></meter></div><p>Four acoustic samples. Sixteen steps. Make a little room for rhythm.</p><div id="steps"></div></section><div class="actions"><button id="clear">Clear pattern</button><button id="export">Export pattern JSON</button></div><p>Tap a sample name to audition it. Changes stop playback; press Play to hear the new pattern. Samples are included in this Crux and work offline.</p>';
const style = document.createElement('style');
style.textContent =
  '#steps{display:grid;gap:14px;margin:30px 0}.track{display:grid;grid-template-columns:100px repeat(16,minmax(24px,1fr));gap:6px}.step{padding:0;height:55px;border-radius:5px}.step:nth-child(4n+2){border-left:3px solid #acc4d5}.step[aria-pressed=true]{background:#dba773;color:#21170c;border-color:#e6bb8f}.pad{text-transform:capitalize}#meter{width:100px}.track .active{outline:2px solid white}@media(max-width:800px){#steps{overflow:auto}.track{min-width:800px}}';
document.head.append(style);
let session, context, sampler, sequencer, analyser, animation;
function stop() {
  sequencer?.stop();
  sampler?.stop();
  if (context?.state === 'running') void context.suspend();
  $('#playing').textContent = 'Silent';
  cancelAnimationFrame(animation);
  $('#meter').value = 0;
}
async function ready() {
  if (!context) {
    context = new AudioContext();
    await context.suspend();
    analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.connect(context.destination);
    sampler = Sampler(context, {
      detune: 0,
      decayTime: 0.1,
      lpfCutoffHz: 20000,
      buffers: Object.fromEntries(
        PADS.map((p) => [p, new URL(`samples/${p}.wav`, location.href).href]),
      ),
      destination: analyser,
    });
  }
  await sampler.ready;
  sampler.output.volume = session.doc.volume;
  await context.resume();
}
function meter() {
  if (context?.state !== 'running') return;
  const samples = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(samples);
  const peak = Math.max(...samples.map(Math.abs));
  $('#meter').value = peak;
  $('#meter').dataset.peak = String(peak);
  animation = requestAnimationFrame(meter);
}
try {
  session = await openProject(
    'smplr',
    (doc) => {
      stop();
      $('#bpm').value = doc.bpm;
      $('#volume').value = doc.volume;
      $('#steps').replaceChildren();
      for (const pad of PADS) {
        const row = document.createElement('div');
        row.className = 'track';
        const trigger = document.createElement('button');
        trigger.className = 'pad';
        trigger.textContent = pad;
        trigger.setAttribute('aria-label', `Play ${pad}`);
        trigger.onclick = async () => {
          try {
            await ready();
            sampler.start({ note: pad, velocity: 100 });
            $('#playing').textContent = 'Sample';
            meter();
          } catch (e) {
            message(e);
          }
        };
        row.append(trigger);
        doc.pattern[pad].forEach((on, i) => {
          const step = document.createElement('button');
          step.className = 'step';
          step.textContent = String(i + 1);
          step.setAttribute('aria-label', `${pad} step ${i + 1}`);
          step.setAttribute('aria-pressed', String(on));
          step.onclick = () =>
            void session
              .update((d) => {
                d.pattern[pad][i] = !d.pattern[pad][i];
              })
              .catch(message);
          row.append(step);
        });
        $('#steps').append(row);
      }
    },
    stop,
  );
} catch (e) {
  message(e);
}
$('#play').onclick = async () => {
  try {
    stop();
    await session.save();
    await ready();
    const doc = session.doc;
    sequencer = Sequencer(context, { bpm: doc.bpm, loop: true, loopEnd: '2:1' });
    sequencer.addTrack(
      sampler,
      PADS.flatMap((p) =>
        doc.pattern[p].flatMap((on, i) => (on ? [{ note: p, at: i * 120, velocity: 100 }] : [])),
      ),
    );
    sequencer.start();
    $('#playing').textContent = 'Playing through smplr';
    meter();
  } catch (e) {
    message(e);
  }
};
$('#stop').onclick = stop;
$('#bpm').onchange = (e) =>
  void session
    .update((d) => {
      d.bpm = Number(e.target.value);
    })
    .catch(message);
$('#volume').onchange = (e) =>
  void session
    .update((d) => {
      d.volume = Number(e.target.value);
    })
    .catch(message);
$('#clear').onclick = () =>
  void session
    .update((d) => {
      for (const pad of PADS) d.pattern[pad].fill(false);
    })
    .catch(message);
$('#export').onclick = async () => {
  try {
    await session.save();
    download(
      new Blob([JSON.stringify(session.doc, null, 2)], { type: 'application/json' }),
      'rhythm.json',
    );
  } catch (e) {
    message(e);
  }
};
window.addEventListener('pagehide', () => {
  sampler?.dispose();
  void context?.close();
});
