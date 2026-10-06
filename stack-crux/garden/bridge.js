// garden/bridge.js — the stack bench's handle on Crux Garden.
//
// The page runs in the Workshop preview, on its own origin, so everything it
// needs from the app goes over postMessage and the app answers as the person:
//   garden.runner()             what this machine runs stacks with, or null
//   garden.inspect()            the compose file: services, and any refusal
//   garden.resolve(profiles)    what Compose resolves it to: real ports and env
//   garden.override(wishes)     this machine's ports and settings, merged over
//   garden.compose(verb, opts)  up | down | ps | logs | pull | stop | start
//   garden.services()           what is running right now
//   garden.read(path) / write   the Crux's own files (compose.yaml, stack.json)
//   garden.onOutput(cb)         lines from a run in flight
// A page opened outside Crux Garden gets an honest failure, not a hang.
(function () {
  if (window.garden) return;
  var framed = window.parent !== window;
  var pending = new Map();
  var outputHandlers = [];
  var seq = 0;

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || typeof d.type !== 'string') return;
    if (d.type === 'crux:stack:output') {
      outputHandlers.forEach(function (cb) {
        try {
          cb(d.line, d.verb);
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

  function ask(type, payload, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!framed)
        return reject(
          new Error('Open this bench in Crux Garden — it runs the stack for the page.'),
        );
      var id = 's' + ++seq + '-' + Math.random().toString(36).slice(2);
      var timer = setTimeout(function () {
        pending.delete(id);
        reject(new Error(type + ' timed out'));
      }, timeoutMs || 30000);
      pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      window.parent.postMessage(Object.assign({ type: type, id: id }, payload), '*');
    });
  }

  // A reply can be lost when the Workshop reloads the preview under the page.
  // Asking again is safe for anything that only reads.
  function askRetrying(type, payload, timeoutMs, tries) {
    return ask(type, payload, timeoutMs).catch(function (err) {
      if (!tries || !/timed out/.test(err.message)) throw err;
      return askRetrying(type, payload, timeoutMs, tries - 1);
    });
  }

  window.garden = {
    inGarden: framed,
    runner: function (refresh) {
      return askRetrying('crux:stack:runner', { refresh: !!refresh }, 15000, 2);
    },
    inspect: function () {
      return askRetrying('crux:stack:inspect', {}, 10000, 3);
    },
    services: function () {
      return askRetrying('crux:stack:services', {}, 30000, 2);
    },
    resolve: function (profiles) {
      return askRetrying('crux:stack:resolve', { profiles: profiles || [] }, 30000, 2);
    },
    override: function (wishes) {
      return ask('crux:stack:override', { wishes: wishes }, 15000);
    },
    freePort: function (from) {
      return askRetrying('crux:stack:free-port', { from: from }, 15000, 2);
    },
    compose: function (verb, opts) {
      // Pulling images is slow; the host bounds it too.
      return ask('crux:stack:compose', Object.assign({ verb: verb }, opts || {}), 20 * 60 * 1000);
    },
    read: function (path) {
      return askRetrying('crux:stack:read', { path: path }, 8000, 3);
    },
    write: function (path, text) {
      return ask('crux:stack:write', { path: path, text: text });
    },
    onOutput: function (cb) {
      outputHandlers.push(cb);
      return function () {
        outputHandlers = outputHandlers.filter(function (h) {
          return h !== cb;
        });
      };
    },
  };
})();
