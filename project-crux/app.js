// The project bench: run the checkout you are working on. The folder is
// chosen once and remembered in project.json; the scripts come from its
// package.json; the settings can come from a Stack Crux beside this one.
(function () {
  var $ = function (id) {
    return document.getElementById(id);
  };
  var state = { doc: null, info: null, run: null, busy: false, timer: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function say(text, tone) {
    var el = $('status');
    el.textContent = text;
    el.className = 'status' + (tone ? ' ' + tone : '');
  }

  function busy(is) {
    state.busy = is;
    ['choose', 'start', 'stop'].forEach(function (id) {
      if ($(id)) $(id).disabled = is;
    });
  }

  // ── The Crux's own record of how this project runs ────────────────────
  function doc() {
    if (!state.doc)
      state.doc = { version: 1, app: 'project', folder: '', script: '', args: [], port: null };
    return state.doc;
  }

  function saveDoc() {
    return garden.write('project.json', JSON.stringify(doc(), null, 2) + '\n');
  }

  function loadDoc() {
    return garden
      .read('project.json')
      .then(function (text) {
        try {
          state.doc = JSON.parse(text || '{}');
        } catch (e) {
          state.doc = null;
        }
      })
      .catch(function () {
        state.doc = null;
      });
  }

  // ── What the folder offers ────────────────────────────────────────────
  function renderProject() {
    var info = state.info;
    $('folder').textContent = info ? info.folder : doc().folder || '';
    $('setup').hidden = !info;
    if (!info) {
      $('about').textContent = doc().folder
        ? 'That folder is not available. Choose it again.'
        : 'Choose the folder you are working in.';
      return;
    }
    $('project-name').textContent = info.name || 'Project';
    $('about').textContent =
      info.scripts.length +
      ' script' +
      (info.scripts.length === 1 ? '' : 's') +
      (info.packageManager !== 'unknown' ? ' · installed with ' + info.packageManager : '') +
      (info.installed ? '' : ' · dependencies are not installed yet');

    var select = $('script');
    select.innerHTML = info.scripts
      .map(function (name) {
        return '<option value="' + esc(name) + '">' + esc(name) + '</option>';
      })
      .join('');
    // Keep what this Crux chose before, or reach for the obvious one.
    var wanted =
      doc().script ||
      ['dev', 'start', 'serve'].filter(function (name) {
        return info.scripts.indexOf(name) >= 0;
      })[0];
    if (wanted && info.scripts.indexOf(wanted) >= 0) select.value = wanted;
    if (doc().port) $('port').value = doc().port;
    if (doc().args && doc().args.length) $('args').value = doc().args.join(' ');
    if (doc().envFile) $('env-file').value = doc().envFile;
  }

  function choose() {
    busy(true);
    say('Waiting for you to pick a folder…');
    garden
      .choose()
      .then(function (info) {
        if (!info) return say('');
        state.info = info;
        doc().folder = info.folder;
        renderProject();
        say('');
        return saveDoc();
      })
      .catch(function (error) {
        say(String((error && error.message) || error), 'crashed');
      })
      .then(function () {
        busy(false);
      });
  }

  // ── Running it ────────────────────────────────────────────────────────
  function settingsFrom(file) {
    if (!file) return Promise.resolve({});
    // A Stack Crux writes connections.env; anything of that shape works.
    return garden
      .read(file)
      .then(function (text) {
        var env = {};
        String(text || '')
          .split('\n')
          .forEach(function (line) {
            var m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
            if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
          });
        return env;
      })
      .catch(function () {
        return {};
      });
  }

  function start() {
    if (!state.info) return;
    var script = $('script').value;
    var port = parseInt($('port').value, 10);
    var args = $('args')
      .value.split(/\s+/)
      .filter(function (a) {
        return a.length;
      });
    var envFile = $('env-file').value.trim();

    doc().script = script;
    doc().args = args;
    doc().port = isFinite(port) ? port : null;
    doc().envFile = envFile || undefined;

    busy(true);
    say('Starting…');
    $('log').textContent = '';
    settingsFrom(envFile)
      .then(function (env) {
        return garden.start({
          folder: state.info.folder,
          script: script,
          args: args,
          port: isFinite(port) ? port : undefined,
          env: env,
        });
      })
      .then(function (run) {
        state.run = run;
        renderRun();
        watch();
        return saveDoc();
      })
      .catch(function (error) {
        say(String((error && error.message) || error), 'crashed');
      })
      .then(function () {
        busy(false);
      });
  }

  function stop() {
    busy(true);
    say('Stopping…');
    garden
      .stop()
      .then(function () {
        return garden.state();
      })
      .then(function (run) {
        state.run = run;
        renderRun();
      })
      .catch(function (error) {
        say(String((error && error.message) || error), 'crashed');
      })
      .then(function () {
        busy(false);
      });
  }

  function renderRun() {
    var run = state.run || { status: 'idle', log: '' };
    var words = {
      idle: 'not running',
      starting: 'starting…',
      running: 'running',
      stopped: 'stopped',
      crashed: 'it stopped badly',
    };
    say(
      words[run.status] +
        (run.script ? ' · ' + run.script : '') +
        (run.port ? ' · port ' + run.port : '') +
        (run.status === 'crashed' && run.exit !== undefined ? ' · exit ' + run.exit : ''),
      run.status === 'running' ? 'running' : run.status === 'crashed' ? 'crashed' : '',
    );
    var log = $('log');
    var atEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 20;
    log.textContent = run.log || 'Nothing yet.';
    if (atEnd) log.scrollTop = log.scrollHeight;

    var open = $('open');
    open.hidden = !(run.status === 'running' && run.port);
    open.onclick = function () {
      window.open('http://localhost:' + run.port, '_blank', 'noreferrer');
    };
  }

  // While something is running, keep the log and the state current.
  function watch() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(function () {
      garden
        .state()
        .then(function (run) {
          state.run = run;
          renderRun();
          if (run.status !== 'running' && run.status !== 'starting') {
            clearInterval(state.timer);
            state.timer = null;
          }
        })
        .catch(function () {
          /* the preview reloads; the next tick tries again */
        });
    }, 1500);
  }

  // ── Start ─────────────────────────────────────────────────────────────
  if (!window.garden || !garden.inGarden) {
    say('Open this in Crux Garden — it runs the project for the page.', 'crashed');
    return;
  }

  $('choose').addEventListener('click', choose);
  $('start').addEventListener('click', start);
  $('stop').addEventListener('click', stop);

  loadDoc()
    .then(function () {
      return doc().folder ? garden.readProject(doc().folder) : null;
    })
    .then(function (info) {
      state.info = info;
      renderProject();
      return garden.state();
    })
    .then(function (run) {
      state.run = run;
      renderRun();
      if (run && (run.status === 'running' || run.status === 'starting')) watch();
    })
    .catch(function (error) {
      say(String((error && error.message) || error), 'crashed');
    });
})();
