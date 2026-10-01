/* global window, parent, crypto, setTimeout, clearTimeout */
// Runs inside the tool preview. Garden binds requests to this frame's project.
const requests = new Map();
let origin;
let onFlush = async () => {};
function send(body) {
  const id = crypto.randomUUID();
  parent.postMessage({ type: 'crux:app', id, ...body }, origin || '*');
  return id;
}
window.addEventListener('message', (event) => {
  if (event.source !== parent || (origin && event.origin !== origin)) return;
  const message = event.data;
  if (message?.type === 'crux:app:result' && requests.has(message.id)) {
    origin = event.origin;
    const pending = requests.get(message.id);
    clearTimeout(pending.timer);
    requests.delete(message.id);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.result);
  } else if (message?.type === 'crux:app:flush' && origin === event.origin) {
    onFlush().then(
      () => send({ op: 'flushed', flushId: message.id }),
      (error) => send({ op: 'flushed', flushId: message.id, error: error.message }),
    );
  }
});
export function request(body) {
  if (parent === window) return Promise.reject(new Error('Open this editor inside Crux Garden.'));
  return new Promise((resolve, reject) => {
    const id = send(body);
    const timer = setTimeout(() => {
      requests.delete(id);
      reject(new Error('Garden did not confirm the action. Your draft is still here.'));
    }, 15000);
    requests.set(id, { resolve, reject, timer });
  });
}
export function dirty(value) {
  send({ op: 'dirty', dirty: value });
}
export function flushWith(callback) {
  onFlush = callback;
}
