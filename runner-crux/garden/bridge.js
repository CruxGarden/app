// garden/bridge.js — the Runner's handle on Crux Garden.
//
// The page runs in the Workshop preview, on its own origin, so everything it
// needs from the app goes over postMessage and the app answers as the person:
//   garden.workspace()            what this Cruxspace can run
//   garden.status()               what is running, across every member Crux
//   garden.start(names)           start these services and what they need
//   garden.stop(names)            stop these
//   garden.task(name)             run a task and report pass or fail
//   garden.log(tail)              one log across the workspace, tagged by service
//   garden.read(path) / write     the Runner's own files (workspace.json)
// The app checks that every Crux named belongs to this Cruxspace; the page
// cannot widen that. Opened outside Crux Garden it fails honestly.
(function () {
  if (window.garden) return;
  var framed = window.parent !== window;
  var pending = new Map();
  var seq = 0;

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || typeof d.type !== 'string') return;
    if (!d.type.endsWith(':res') || !pending.has(d.id)) return;
    var entry = pending.get(d.id);
    pending.delete(d.id);
    clearTimeout(entry.timer);
    if (d.error) entry.reject(new Error(d.error));
    else entry.resolve(d.value);
  });

  function ask(type, payload, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!framed)
        return reject(new Error('Open this in Crux Garden — it runs the workspace for the page.'));
      var id = 'r' + ++seq + '-' + Math.random().toString(36).slice(2);
      var timer = setTimeout(function () {
        pending.delete(id);
        reject(new Error(type + ' timed out'));
      }, timeoutMs || 30000);
      pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      window.parent.postMessage(Object.assign({ type: type, id: id }, payload), '*');
    });
  }

  function askRetrying(type, payload, timeoutMs, tries) {
    return ask(type, payload, timeoutMs).catch(function (err) {
      if (!tries || !/timed out/.test(err.message)) throw err;
      return askRetrying(type, payload, timeoutMs, tries - 1);
    });
  }

  window.garden = {
    inGarden: framed,
    workspace: function () {
      return askRetrying('crux:runner:workspace', {}, 30000, 2);
    },
    status: function () {
      return askRetrying('crux:runner:status', {}, 60000, 2);
    },
    start: function (names) {
      // Pulling images and waiting for health takes as long as it takes.
      return ask('crux:runner:start', { names: names }, 20 * 60 * 1000);
    },
    stop: function (names) {
      return ask('crux:runner:stop', { names: names }, 5 * 60 * 1000);
    },
    log: function (tail) {
      return askRetrying('crux:runner:log', { tail: tail || 200 }, 60000, 2);
    },
    read: function (path) {
      return askRetrying('crux:runner:read', { path: path }, 8000, 3);
    },
    write: function (path, text) {
      return ask('crux:runner:write', { path: path, text: text });
    },
  };
})();
