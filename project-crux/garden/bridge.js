// garden/bridge.js — the project bench's handle on Crux Garden.
//
// The page runs in the Workshop preview, on its own origin, so everything it
// needs from the app goes over postMessage and the app answers as the person:
//   garden.choose()                 the folder picker; choosing is the approval
//   garden.readProject(folder)      its scripts, and whether it is installed
//   garden.state()                  what is running for this Crux
//   garden.start(options)           run a script
//   garden.stop()                   stop it, and its children
//   garden.read(path) / write       the Crux's own files (project.json)
// A page opened outside Crux Garden gets an honest failure, not a hang.
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
        return reject(new Error('Open this in Crux Garden — it runs the project for the page.'));
      var id = 'p' + ++seq + '-' + Math.random().toString(36).slice(2);
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
    choose: function () {
      // A dialog waits on a person, so it waits as long as one might.
      return ask('crux:project:choose', {}, 10 * 60 * 1000);
    },
    readProject: function (folder) {
      return askRetrying('crux:project:read', { folder: folder }, 10000, 3);
    },
    state: function () {
      return askRetrying('crux:project:state', {}, 10000, 3);
    },
    start: function (options) {
      return ask('crux:project:start', options || {}, 60000);
    },
    stop: function () {
      return ask('crux:project:stop', {}, 60000);
    },
    read: function (path) {
      return askRetrying('crux:project:read-file', { path: path }, 8000, 3);
    },
    write: function (path, text) {
      return ask('crux:project:write', { path: path, text: text });
    },
  };
})();
