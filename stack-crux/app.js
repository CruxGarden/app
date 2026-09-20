// The stack bench. Everything on this page is built from the Crux's own
// compose.yaml — the services, what each one is (the comment above it in the
// file), the ports it publishes and what it waits for. Bring any compose file
// and the bench describes it; nothing here knows about Postgres or Redis.
(function () {
  var $ = function (id) {
    return document.getElementById(id);
  };
  var state = { runner: null, reading: null, running: [], busy: false, lines: [] };

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

  function append(line) {
    state.lines.push(line);
    if (state.lines.length > 400) state.lines = state.lines.slice(-300);
    var out = $('output');
    out.textContent = state.lines.join('\n');
    out.scrollTop = out.scrollHeight;
  }

  function busy(is) {
    state.busy = is;
    ['up', 'stop', 'down', 'pull', 'refresh', 'logs'].forEach(function (id) {
      if ($(id)) $(id).disabled = is;
    });
    document.querySelectorAll('[data-service-action]').forEach(function (b) {
      b.disabled = is;
    });
  }

  // ── What the file says ────────────────────────────────────────────────
  function renderRunner() {
    var el = $('runner');
    if (!state.runner) {
      el.className = 'runner missing';
      el.innerHTML =
        'No container runner on this machine. Install <a href="https://www.docker.com/products/docker-desktop/" target="_blank" rel="noreferrer">Docker Desktop</a> or Podman, then press Refresh. Everything else in this Crux still works.';
      return;
    }
    el.className = 'runner ok';
    el.textContent = state.runner.program + ' — ' + state.runner.version;
  }

  function renderRefusals() {
    var box = $('refusals');
    var refusals = (state.reading && state.reading.refusals) || [];
    // "There is no compose.yaml" is a description, not a danger; it is said
    // in the services area instead.
    refusals = refusals.filter(function (r) {
      return !/^There is no /.test(r);
    });
    box.hidden = refusals.length === 0;
    if (!refusals.length) return;
    box.innerHTML =
      '<strong>This stack will not start.</strong><ul>' +
      refusals
        .map(function (r) {
          return '<li>' + esc(r) + '</li>';
        })
        .join('') +
      '</ul><p>Edit <code>compose.yaml</code> to remove these, and the bench will start it.</p>';
  }

  function stateOf(name) {
    for (var i = 0; i < state.running.length; i++)
      if (state.running[i].service === name) return state.running[i];
    return null;
  }

  function renderServices() {
    var services = (state.reading && state.reading.services) || [];
    var box = $('services');
    if (!services.length) {
      box.innerHTML =
        '<p class="empty">No services yet. Put a <code>compose.yaml</code> in this Crux — or ask the collaborator for one — and press Refresh.</p>';
      return;
    }
    box.innerHTML = services
      .map(function (s) {
        var live = stateOf(s.name);
        var oneShot = s.restart === 'no';
        var status = live
          ? live.state + (live.health ? ' · ' + live.health : '')
          : oneShot
            ? 'runs once'
            : 'not running';
        var cls = live && /run/i.test(live.state) ? 'up' : live ? 'exited' : 'down';
        var links = s.ports
          .map(function (p) {
            var url = 'http://localhost:' + p.host;
            return (
              '<a href="' +
              esc(url) +
              '" target="_blank" rel="noreferrer">' +
              esc(String(p.host)) +
              (p.container && p.container !== p.host ? '→' + esc(String(p.container)) : '') +
              '</a>'
            );
          })
          .join(' ');
        var waits = s.dependsOn.length ? 'waits for ' + esc(s.dependsOn.join(', ')) : '';
        var facts = [
          s.image ? esc(s.image) : '',
          links ? 'ports ' + links : '',
          waits,
          s.healthcheck ? 'has a healthcheck' : '',
          s.volumes.length ? s.volumes.length + ' volume' + (s.volumes.length > 1 ? 's' : '') : '',
          s.envKeys.length ? s.envKeys.length + ' settings' : '',
        ].filter(Boolean);
        return (
          '<article class="service ' +
          cls +
          '">' +
          '<h3>' +
          esc(s.name) +
          ' <span class="status">' +
          esc(status) +
          '</span></h3>' +
          (s.about ? '<p class="about">' + esc(s.about) + '</p>' : '') +
          '<p class="facts">' +
          facts.join(' · ') +
          '</p>' +
          '<p class="actions">' +
          '<button type="button" data-service-action="start" data-service="' +
          esc(s.name) +
          '">Start</button>' +
          '<button type="button" data-service-action="stop" data-service="' +
          esc(s.name) +
          '">Stop</button>' +
          '<button type="button" data-service-action="logs" data-service="' +
          esc(s.name) +
          '">Logs</button>' +
          '</p>' +
          '</article>'
        );
      })
      .join('');

    box.querySelectorAll('[data-service-action]').forEach(function (button) {
      button.addEventListener('click', function () {
        var name = button.getAttribute('data-service');
        var action = button.getAttribute('data-service-action');
        if (action === 'logs') return showLogs(name);
        run(action === 'start' ? 'up' : 'stop', { service: name });
      });
    });

    var select = $('log-service');
    select.innerHTML =
      '<option value="">every service</option>' +
      services
        .map(function (s) {
          return '<option value="' + esc(s.name) + '">' + esc(s.name) + '</option>';
        })
        .join('');
  }

  function renderTitle() {
    var services = (state.reading && state.reading.services) || [];
    var withPorts = services.filter(function (s) {
      return s.ports.length;
    }).length;
    $('about').textContent = services.length
      ? services.length +
        ' service' +
        (services.length === 1 ? '' : 's') +
        ' in this Crux' +
        (withPorts ? ', ' + withPorts + ' of them reachable on this machine' : '') +
        '.'
      : 'This Crux has no stack yet.';
  }

  // ── Doing things ──────────────────────────────────────────────────────
  function run(verb, opts) {
    if (state.busy) return;
    busy(true);
    state.lines = [];
    say(
      verb === 'up'
        ? 'Starting. The first run downloads the images, which takes a while.'
        : verb === 'pull'
          ? 'Fetching images…'
          : 'Working…',
    );
    garden
      .compose(verb, opts || {})
      .then(function (answer) {
        if (answer && answer.code !== 0)
          append('(the runner finished with code ' + answer.code + ')');
        return refresh(false);
      })
      .catch(function (error) {
        append(String((error && error.message) || error));
      })
      .then(function () {
        busy(false);
      });
  }

  function showLogs(service) {
    if (state.busy) return;
    busy(true);
    state.lines = [];
    say('Reading the logs…');
    garden
      .compose('logs', { service: service || undefined, tail: 200 })
      .then(function (answer) {
        var text = (answer && answer.output) || '';
        $('output').textContent = text.trim() || 'Nothing in the logs yet.';
      })
      .catch(function (error) {
        say(String((error && error.message) || error), 'warn');
      })
      .then(function () {
        busy(false);
      });
  }

  function refresh(loud) {
    return garden
      .runner()
      .then(function (runner) {
        state.runner = runner;
        renderRunner();
        return garden.inspect();
      })
      .then(function (reading) {
        state.reading = reading;
        renderTitle();
        renderRefusals();
        // `ps` needs a runner; without one the file still describes itself.
        return state.runner
          ? garden.services().catch(function () {
              return [];
            })
          : [];
      })
      .then(function (running) {
        state.running = running || [];
        renderServices();
        if (loud)
          say(
            'Read ' +
              ((state.reading && state.reading.services) || []).length +
              ' service(s) from compose.yaml.',
          );
      })
      .catch(function (error) {
        say(String((error && error.message) || error), 'warn');
      });
  }

  // ── Start ─────────────────────────────────────────────────────────────
  if (!window.garden || !garden.inGarden) {
    say('Open this bench in Crux Garden — it runs the stack for the page.', 'warn');
    return;
  }

  garden.onOutput(function (line) {
    append(line);
  });

  $('up').addEventListener('click', function () {
    run('up');
  });
  $('stop').addEventListener('click', function () {
    run('stop');
  });
  $('down').addEventListener('click', function () {
    run('down');
  });
  $('pull').addEventListener('click', function () {
    run('pull');
  });
  $('refresh').addEventListener('click', function () {
    refresh(true);
  });
  $('logs').addEventListener('click', function () {
    showLogs($('log-service').value);
  });

  refresh(false);
})();
