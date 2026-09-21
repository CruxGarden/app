// The Runner board. Everything here is read from the Cruxspace: the Stack
// Crux's services, and each service a Project Crux runs from source. The
// Cruxes own what is running, so anything started elsewhere shows up here.
(function () {
  var $ = function (id) {
    return document.getElementById(id);
  };
  var state = { workspace: null, status: null, busy: false, timer: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function say(text, tone) {
    var out = $('output');
    out.textContent = text;
    out.className = 'output' + (tone ? ' ' + tone : '');
  }

  function busy(is) {
    state.busy = is;
    ['start-all', 'stop-all', 'refresh', 'show-log'].forEach(function (id) {
      if ($(id)) $(id).disabled = is;
    });
    document.querySelectorAll('[data-act]').forEach(function (b) {
      b.disabled = is;
    });
  }

  function stateOf(name) {
    var running = (state.status && state.status.services) || [];
    for (var i = 0; i < running.length; i++) if (running[i].name === name) return running[i];
    return null;
  }

  // ── The board ─────────────────────────────────────────────────────────
  function renderHeader() {
    var w = state.workspace;
    $('workspace-name').textContent = (w && w.name) || 'Workspace';
    var services = (w && w.services) || [];
    var fromSource = services.filter(function (s) {
      return s.from === 'source';
    }).length;
    $('about').textContent = services.length
      ? services.length +
        ' service' +
        (services.length === 1 ? '' : 's') +
        (fromSource ? ', ' + fromSource + ' of them from source' : ', all from the Stack')
      : 'Nothing in this Cruxspace can run yet. Add a Stack Crux or a Project Crux.';

    var notes = (w && w.notes) || [];
    $('notes').hidden = notes.length === 0;
    if (notes.length)
      $('notes').innerHTML =
        '<strong>Worth knowing.</strong><ul>' +
        notes
          .map(function (n) {
            return '<li>' + esc(n) + '</li>';
          })
          .join('') +
        '</ul>';

    var runner = (state.status && state.status.runner) || null;
    var el = $('runner');
    if (runner) {
      el.className = 'runner ok';
      el.textContent = runner.program + ' — ' + runner.version;
    } else {
      el.className = 'runner missing';
      el.innerHTML =
        'No container runner on this machine. Services from source still run; the Stack needs <a href="https://www.docker.com/products/docker-desktop/" target="_blank" rel="noreferrer">Docker Desktop</a> or Podman.';
    }
  }

  function row(s) {
    var live = stateOf(s.name);
    var status = live ? live.state + (live.health ? ' · ' + live.health : '') : 'not running';
    var cls = live && /run/i.test(live.state) ? 'up' : live ? 'exited' : 'down';
    var links = (s.ports || [])
      .map(function (p) {
        var port = (live && live.port) || p.host;
        return (
          '<a href="http://localhost:' +
          esc(String(port)) +
          '" target="_blank" rel="noreferrer">' +
          esc(String(port)) +
          '</a>'
        );
      })
      .join(' ');
    var facts = [
      s.image ? esc(s.image) : '',
      links ? 'ports ' + links : '',
      s.dependsOn && s.dependsOn.length ? 'needs ' + esc(s.dependsOn.join(', ')) : '',
    ].filter(Boolean);

    return (
      '<article class="service ' +
      cls +
      '">' +
      '<h3>' +
      esc(s.name) +
      ' <span class="from ' +
      esc(s.from) +
      '">' +
      (s.from === 'source' ? 'from source' : 'from stack') +
      '</span> <span class="status">' +
      esc(status) +
      '</span></h3>' +
      (s.about ? '<p class="about">' + esc(s.about) + '</p>' : '') +
      (s.fellBack
        ? '<p class="fell-back">Running from the Stack: ' + esc(s.fellBack) + '.</p>'
        : '') +
      '<p class="facts">' +
      facts.join(' · ') +
      '</p>' +
      '<p class="actions">' +
      '<button type="button" data-act="start" data-name="' +
      esc(s.name) +
      '">Start</button>' +
      '<button type="button" data-act="stop" data-name="' +
      esc(s.name) +
      '">Stop</button>' +
      '</p>' +
      '</article>'
    );
  }

  function renderServices() {
    var all = (state.workspace && state.workspace.services) || [];
    var services = all.filter(function (s) {
      return !s.task;
    });
    var tasks = all.filter(function (s) {
      return s.task;
    });

    $('services').innerHTML = services.length
      ? services.map(row).join('')
      : '<p class="empty">Nothing to run yet.</p>';
    $('tasks').innerHTML = tasks.length
      ? tasks.map(row).join('')
      : '<p class="empty">No tasks in this workspace.</p>';

    var picker = $('log-service');
    picker.innerHTML =
      '<option value="">every service</option>' +
      all
        .map(function (s) {
          return '<option value="' + esc(s.name) + '">' + esc(s.name) + '</option>';
        })
        .join('');

    document.querySelectorAll('[data-act]').forEach(function (button) {
      button.addEventListener('click', function () {
        var name = button.getAttribute('data-name');
        act(button.getAttribute('data-act'), [name]);
      });
    });
  }

  // ── One log, in the order it happened ─────────────────────────────────
  function showLog() {
    if (state.busy) return;
    var only = $('log-service').value;
    busy(true);
    $('log').textContent = 'Reading…';
    garden
      .log(300)
      .then(function (lines) {
        var wanted = (lines || []).filter(function (l) {
          return !only || l.service === only;
        });
        $('log').textContent = wanted.length
          ? wanted
              .map(function (l) {
                return l.service + ' | ' + l.text;
              })
              .join('\n')
          : 'Nothing has been said yet.';
        $('log').scrollTop = $('log').scrollHeight;
      })
      .catch(function (error) {
        $('log').textContent = String((error && error.message) || error);
      })
      .then(function () {
        busy(false);
      });
  }

  // ── Doing things ──────────────────────────────────────────────────────
  function act(what, names) {
    if (state.busy) return;
    busy(true);
    say(
      what === 'start'
        ? 'Starting ' + names.join(', ') + ' and what it needs…'
        : 'Stopping ' + names.join(', ') + '…',
    );
    (what === 'start' ? garden.start(names) : garden.stop(names))
      .then(function (answer) {
        var lines = (answer && answer.lines) || [];
        say(lines.length ? lines.join('\n') : 'Done.', answer && answer.ok ? 'ok' : 'warn');
        return refresh();
      })
      .catch(function (error) {
        say(String((error && error.message) || error), 'warn');
      })
      .then(function () {
        busy(false);
      });
  }

  function everything() {
    var all = ((state.workspace && state.workspace.services) || [])
      .filter(function (s) {
        return !s.task;
      })
      .map(function (s) {
        return s.name;
      });
    return all;
  }

  function refresh() {
    return garden
      .workspace()
      .then(function (w) {
        state.workspace = w;
        return garden.status();
      })
      .then(function (status) {
        state.status = status;
        renderHeader();
        renderServices();
      })
      .catch(function (error) {
        say(String((error && error.message) || error), 'warn');
      });
  }

  // ── Start ─────────────────────────────────────────────────────────────
  if (!window.garden || !garden.inGarden) {
    say('Open this in Crux Garden — it runs the workspace for the page.', 'warn');
    return;
  }

  $('start-all').addEventListener('click', function () {
    act('start', everything());
  });
  $('stop-all').addEventListener('click', function () {
    act('stop', everything());
  });
  $('show-log').addEventListener('click', showLog);
  $('refresh').addEventListener('click', function () {
    refresh().then(function () {
      say('Read the Cruxspace again.');
    });
  });

  refresh();
  // The Cruxes own what is running, so the board watches rather than assumes.
  state.timer = setInterval(function () {
    if (!state.busy) void refresh();
  }, 5000);
})();
