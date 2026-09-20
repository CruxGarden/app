// The stack bench. Everything on this page is built from the Crux's own
// compose.yaml — the services, what each one is (the comment above it in the
// file), the ports it publishes and what it waits for. Bring any compose file
// and the bench describes it; nothing here knows about Postgres or Redis.
(function () {
  var $ = function (id) {
    return document.getElementById(id);
  };
  var state = {
    runner: null,
    reading: null,
    running: [],
    busy: false,
    lines: [],
    // Profiles the person has switched on for this machine, kept in the
    // browser: which optional parts you run is yours, not the stack's.
    on: [],
  };

  function recallProfiles() {
    try {
      state.on = JSON.parse(sessionStorage.getItem('stack:profiles') || '[]') || [];
    } catch (e) {
      state.on = [];
    }
  }
  function rememberProfiles() {
    try {
      sessionStorage.setItem('stack:profiles', JSON.stringify(state.on));
    } catch (e) {
      /* a private window may refuse */
    }
  }

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
    var services = ((state.reading && state.reading.services) || []).filter(function (s) {
      // A service in a profile stays out of the way until it is switched on.
      return (
        !s.profiles.length ||
        s.profiles.some(function (p) {
          return state.on.indexOf(p) >= 0;
        })
      );
    });
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

  // ── Overrides: what this machine does differently ─────────────────────
  function renderProfiles() {
    var all = (state.reading && state.reading.profiles) || [];
    var box = $('profiles');
    if (!all.length) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML =
      '<h3>Optional parts</h3>' +
      all
        .map(function (name) {
          var on = state.on.indexOf(name) >= 0;
          return (
            '<label class="profile"><input type="checkbox" data-profile="' +
            esc(name) +
            '"' +
            (on ? ' checked' : '') +
            '> ' +
            esc(name) +
            '</label>'
          );
        })
        .join('');
    box.querySelectorAll('[data-profile]').forEach(function (input) {
      input.addEventListener('change', function () {
        var name = input.getAttribute('data-profile');
        state.on = input.checked
          ? state.on.concat([name])
          : state.on.filter(function (x) {
              return x !== name;
            });
        rememberProfiles();
        renderServices();
      });
    });
  }

  function renderSettings() {
    var vars = (state.reading && state.reading.variables) || [];
    var box = $('settings');
    if (!vars.length) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML =
      '<h3>Settings</h3>' +
      '<table class="settings-table"><tbody>' +
      vars
        .map(function (v) {
          var where = v.fromEnv ? 'set here' : v.fallback !== undefined ? 'default' : 'not set';
          return (
            '<tr><th>' +
            esc(v.name) +
            '</th><td><input data-setting="' +
            esc(v.name) +
            '" placeholder="' +
            esc(v.fallback === undefined ? '' : v.fallback) +
            '"></td><td class="where">' +
            esc(where) +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table>' +
      '<p class="hint">Blank keeps the default. A value is written to <code>.env</code>, which ' +
      'travels with the Crux — a password belongs in the Crux\u2019s secrets instead, and is handed ' +
      'to Compose at start without ever being written down.</p>' +
      '<p><button id="save-settings" type="button">Save settings</button></p>';
    $('save-settings').addEventListener('click', saveSettings);
  }

  function saveSettings() {
    var inputs = $('settings').querySelectorAll('[data-setting]');
    var lines = [];
    for (var i = 0; i < inputs.length; i++) {
      var value = inputs[i].value.trim();
      if (value) lines.push(inputs[i].getAttribute('data-setting') + '=' + value);
    }
    busy(true);
    say('Saving settings…');
    garden
      .read('.env')
      .then(function (existing) {
        // Keep anything already there that the compose file does not name.
        var keep = String(existing || '')
          .split('\n')
          .filter(function (line) {
            var name = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
            if (!name) return line.trim().length > 0 && line.trim()[0] === '#';
            return !lines.some(function (l) {
              return l.split('=')[0] === name[1];
            });
          });
        return garden.write('.env', keep.concat(lines).join('\n').trim() + '\n');
      })
      .then(function () {
        say('Saved to .env. Start the stack again to use them.', 'ok');
        return refresh(false);
      })
      .catch(function (error) {
        say(String((error && error.message) || error), 'warn');
      })
      .then(function () {
        busy(false);
      });
  }

  function renderFiles() {
    var files = (state.reading && state.reading.files) || [];
    var hasOverride = files.some(function (f) {
      return f.indexOf('override') >= 0;
    });
    $('files-note').textContent = files.length
      ? 'Compose reads ' + files.join(', then ') + '.'
      : '';
    $('add-override').hidden = hasOverride || !files.length;
  }

  function addOverride() {
    busy(true);
    garden
      .write(
        'compose.override.yaml',
        [
          '# Yours, merged over compose.yaml by Compose itself.',
          '# Anything here wins, and the rest of the stack is untouched.',
          '#',
          '# services:',
          '#   postgres:',
          '#     ports:',
          '#       - "55432:5432"',
          '',
        ].join('\n'),
      )
      .then(function () {
        say(
          'Wrote compose.override.yaml. Edit it in Artifacts; it is checked like the stack.',
          'ok',
        );
        return refresh(false);
      })
      .catch(function (error) {
        say(String((error && error.message) || error), 'warn');
      })
      .then(function () {
        busy(false);
      });
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
    opts = opts || {};
    if (state.on.length) opts.profiles = state.on;
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
        renderProfiles();
        renderSettings();
        renderFiles();
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
  $('add-override').addEventListener('click', addOverride);
  recallProfiles();
  $('logs').addEventListener('click', function () {
    showLogs($('log-service').value);
  });

  refresh(false);
})();
