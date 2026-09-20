// garden/bridge.js — the bench's handle on Crux Garden.
//
// The page runs in the Workshop preview, on its own origin, so everything it
// needs from the app goes over postMessage and the app answers as the person:
//   garden.files()                     what is in this crux (path, bytes, kind)
//   garden.probe(path)                 what a media file is
//   garden.run(tool, args)             ffmpeg | ffprobe | magick, inside the folder
//   garden.tools()                     which binaries this machine has
//   garden.read(path) / write(path, t) the crux's own files (recipes, the log)
//   garden.onProgress(cb)              a running conversion's progress, 0..1
// A page opened outside Crux Garden gets an honest failure, not a hang.
(function () {
  if (window.garden) return;
  var framed = window.parent !== window;
  var pending = new Map();
  var progressHandlers = [];
  var seq = 0;

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || typeof d.type !== 'string') return;
    if (d.type === 'crux:media:progress') {
      progressHandlers.forEach(function (cb) {
        try {
          cb(d.progress, d.tool);
        } catch (err) {
          /* a listener's own fault */
        }
      });
      return;
    }
    if (!d.type.endsWith(':res') || !pending.has(d.id)) return;
    var entry = pending.get(d.id);
    pending.delete(d.id);
    clearTimeout(entry.timer);
    if (d.error) entry.reject(new Error(d.error));
    else entry.resolve(d.value);
  });

  // A reply can be lost when the Workshop reloads the preview under the page
  // (the tools write into the Crux, and the app notices). Reads are safe to
  // ask again, so they are; a run is asked once and watched for instead.
  function askRetrying(type, payload, timeoutMs, tries) {
    return ask(type, payload, timeoutMs).catch(function (err) {
      if (!tries || !/timed out/.test(err.message)) throw err;
      return askRetrying(type, payload, timeoutMs, tries - 1);
    });
  }

  function ask(type, payload, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!framed)
        return reject(new Error('Open this bench in Crux Garden — it runs the tools for the page.'));
      var id = 'm' + ++seq + '-' + Math.random().toString(36).slice(2);
      var timer = setTimeout(function () {
        pending.delete(id);
        reject(new Error(type + ' timed out'));
      }, timeoutMs || 30000);
      pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      window.parent.postMessage(Object.assign({ type: type, id: id }, payload), '*');
    });
  }

  window.garden = {
    inGarden: framed,
    files: function () {
      return askRetrying('crux:media:files', {}, 8000, 3);
    },
    probe: function (path) {
      return askRetrying('crux:media:probe', { path: path }, 12000, 3);
    },
    run: function (tool, args) {
      // A conversion may be long; the host bounds it too.
      return ask('crux:media:run', { tool: tool, args: args }, 15 * 60 * 1000);
    },
    tools: function (refresh) {
      return askRetrying('crux:media:tools', { refresh: !!refresh }, 8000, 3);
    },
    read: function (path) {
      return askRetrying('crux:media:read', { path: path }, 8000, 3);
    },
    write: function (path, text) {
      return ask('crux:media:write', { path: path, text: text });
    },
    onProgress: function (cb) {
      progressHandlers.push(cb);
      return function () {
        progressHandlers = progressHandlers.filter(function (h) {
          return h !== cb;
        });
      };
    },
  };
})();
