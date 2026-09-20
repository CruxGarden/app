// The media bench. Everything it does goes through garden/bridge.js, which
// asks Crux Garden to run the real programs inside this Crux's folder.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var state = { files: [], chosen: null, about: null, recipes: [], tools: [], busy: false };

  var VIDEO = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'];
  var AUDIO = ['.wav', '.mp3', '.m4a', '.flac', '.ogg', '.opus', '.aac'];
  var IMAGE = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tif', '.tiff', '.avif', '.heic'];
  var DOC = ['.md', '.markdown', '.docx', '.odt', '.rtf', '.html', '.htm', '.tex', '.epub', '.txt'];

  // The recipes the bench ships with. A Crux's own recipes (data/project.json)
  // are added to these, and may replace one by using the same id.
  var BUILT_IN = [
    { id: 'to-mp4', name: 'To MP4 (H.264)', tool: 'ffmpeg', accepts: VIDEO, out: 'exports/{name}.mp4',
      args: ['-y', '-i', '{in}', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', '{out}'] },
    { id: 'to-webm', name: 'To WebM (VP9)', tool: 'ffmpeg', accepts: VIDEO, out: 'exports/{name}.webm',
      args: ['-y', '-i', '{in}', '-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '{out}'] },
    { id: 'to-gif', name: 'To GIF (480 wide)', tool: 'ffmpeg', accepts: VIDEO, out: 'exports/{name}.gif',
      args: ['-y', '-i', '{in}', '-vf', 'fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse', '{out}'] },
    { id: 'small', name: 'Smaller (720 wide)', tool: 'ffmpeg', accepts: VIDEO, out: 'exports/{name}-720.mp4',
      args: ['-y', '-i', '{in}', '-vf', 'scale=720:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '{out}'] },
    { id: 'first-10', name: 'First ten seconds', tool: 'ffmpeg', accepts: VIDEO, out: 'exports/{name}-10s.mp4',
      args: ['-y', '-i', '{in}', '-t', '10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '{out}'] },
    { id: 'frames', name: 'Extract frames (2 a second)', tool: 'ffmpeg', accepts: VIDEO, out: 'exports/{name}-frames/f%04d.png',
      args: ['-y', '-i', '{in}', '-vf', 'fps=2', '{out}'] },
    { id: 'poster', name: 'Poster frame', tool: 'ffmpeg', accepts: VIDEO, out: 'exports/{name}-poster.jpg',
      args: ['-y', '-i', '{in}', '-ss', '00:00:01', '-frames:v', '1', '-q:v', '3', '{out}'] },
    { id: 'strip-audio', name: 'Without sound', tool: 'ffmpeg', accepts: VIDEO, out: 'exports/{name}-silent.mp4',
      args: ['-y', '-i', '{in}', '-an', '-c:v', 'copy', '{out}'] },
    { id: 'pull-audio', name: 'Take the audio out', tool: 'ffmpeg', accepts: VIDEO, out: 'exports/{name}.m4a',
      args: ['-y', '-i', '{in}', '-vn', '-c:a', 'aac', '-b:a', '192k', '{out}'] },

    { id: 'to-m4a', name: 'To M4A', tool: 'ffmpeg', accepts: AUDIO, out: 'exports/{name}.m4a',
      args: ['-y', '-i', '{in}', '-c:a', 'aac', '-b:a', '192k', '{out}'] },
    { id: 'to-mp3', name: 'To MP3', tool: 'ffmpeg', accepts: AUDIO, out: 'exports/{name}.mp3',
      args: ['-y', '-i', '{in}', '-c:a', 'libmp3lame', '-q:a', '2', '{out}'] },
    { id: 'normalise', name: 'Even out the loudness', tool: 'ffmpeg', accepts: AUDIO, out: 'exports/{name}-level.m4a',
      args: ['-y', '-i', '{in}', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '{out}'] },
    { id: 'mono', name: 'To mono', tool: 'ffmpeg', accepts: AUDIO, out: 'exports/{name}-mono.m4a',
      args: ['-y', '-i', '{in}', '-ac', '1', '-c:a', 'aac', '-b:a', '128k', '{out}'] },

    { id: 'to-jpg', name: 'To JPEG (quality 85)', tool: 'magick', accepts: IMAGE, out: 'exports/{name}.jpg',
      args: ['{in}', '-quality', '85', '{out}'] },
    { id: 'to-png', name: 'To PNG', tool: 'magick', accepts: IMAGE, out: 'exports/{name}.png', args: ['{in}', '{out}'] },
    { id: 'to-webp', name: 'To WebP', tool: 'magick', accepts: IMAGE, out: 'exports/{name}.webp',
      args: ['{in}', '-quality', '82', '{out}'] },
    { id: 'resize-1200', name: 'Resize to 1200 wide', tool: 'magick', accepts: IMAGE, out: 'exports/{name}-1200.jpg',
      args: ['{in}', '-resize', '1200x', '-quality', '85', '{out}'] },
    { id: 'thumb', name: 'Square thumbnail (512)', tool: 'magick', accepts: IMAGE, out: 'exports/{name}-thumb.jpg',
      args: ['{in}', '-resize', '512x512^', '-gravity', 'center', '-extent', '512x512', '-quality', '85', '{out}'] },
    { id: 'flatten', name: 'On a white background', tool: 'magick', accepts: IMAGE, out: 'exports/{name}-flat.jpg',
      args: ['{in}', '-background', 'white', '-alpha', 'remove', '-alpha', 'off', '-quality', '90', '{out}'] },
    { id: 'grayscale', name: 'Grey', tool: 'magick', accepts: IMAGE, out: 'exports/{name}-grey.jpg',
      args: ['{in}', '-colorspace', 'Gray', '-quality', '88', '{out}'] },
    { id: 'favicon', name: 'Favicon (.ico, four sizes)', tool: 'magick', accepts: IMAGE, out: 'exports/favicon.ico',
      args: ['{in}', '-define', 'icon:auto-resize=16,32,48,64', '{out}'] },

    { id: 'to-docx', name: 'To Word (.docx)', tool: 'pandoc', accepts: DOC, out: 'exports/{name}.docx', args: ['{in}', '-o', '{out}'] },
    { id: 'to-md', name: 'To Markdown', tool: 'pandoc', accepts: DOC, out: 'exports/{name}.md', args: ['{in}', '-o', '{out}'] },
    { id: 'to-html', name: 'To a standalone page', tool: 'pandoc', accepts: DOC, out: 'exports/{name}.html', args: ['{in}', '--standalone', '-o', '{out}'] },
    { id: 'to-epub', name: 'To EPUB', tool: 'pandoc', accepts: DOC, out: 'exports/{name}.epub', args: ['{in}', '--standalone', '-o', '{out}'] },
    { id: 'to-txt', name: 'To plain text', tool: 'pandoc', accepts: DOC, out: 'exports/{name}.txt', args: ['{in}', '-o', '{out}'] },
  ];

  function ext(path) {
    var m = /\.[A-Za-z0-9]+$/.exec(path);
    return m ? m[0].toLowerCase() : '';
  }
  function baseName(path) {
    return path.split('/').pop().replace(/\.[^.]+$/, '');
  }
  function kindOf(path) {
    var e = ext(path);
    if (VIDEO.indexOf(e) >= 0) return 'video';
    if (AUDIO.indexOf(e) >= 0) return 'audio';
    if (IMAGE.indexOf(e) >= 0) return 'image';
    if (DOC.indexOf(e) >= 0) return 'document';
    return 'other';
  }
  function bytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function have(tool) {
    var t = state.tools.filter(function (x) { return x.tool === tool; })[0];
    return !!(t && t.path);
  }
  function say(text, tone) {
    var out = $('output');
    out.textContent = text;
    out.className = 'output' + (tone ? ' ' + tone : '');
    remember('lastSaid', JSON.stringify({ text: text, tone: tone || '' }));
  }

  // The preview reloads when the tools write into the Crux, so what the bench
  // is doing survives in sessionStorage: a run in flight is picked up again
  // and finished by watching for its output.
  function remember(key, value) {
    try {
      if (value === null) sessionStorage.removeItem('media:' + key);
      else sessionStorage.setItem('media:' + key, value);
    } catch (e) {
      /* a private window is allowed to refuse */
    }
  }
  function recall(key) {
    try {
      return sessionStorage.getItem('media:' + key);
    } catch (e) {
      return null;
    }
  }

  // ── The tools this machine has ────────────────────────────────────────
  function renderTools() {
    var names = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', magick: 'ImageMagick' };
    $('tools').innerHTML = state.tools
      .map(function (t) {
        var cls = t.path ? 'tool-chip ok' : 'tool-chip missing';
        var where = t.path ? t.source : 'not here';
        var title = t.version || (t.path ? t.path : 'not on this machine');
        return (
          '<span class="' + cls + '" title="' + esc(title) + '">' +
          esc(names[t.tool] || t.tool) +
          ' <span class="where">' + esc(where) + '</span></span>'
        );
      })
      .join('');
    if (!state.tools.length) $('tools').textContent = 'No tools — open this bench in Crux Garden.';
  }

  function loadTools(refresh) {
    return garden.tools(refresh).then(
      function (list) {
        state.tools = list || [];
        renderTools();
      },
      function (err) {
        $('tools').textContent = err.message;
      },
    );
  }

  // ── The files in this crux ────────────────────────────────────────────
  function renderFiles() {
    var groups = { video: [], audio: [], image: [], document: [], other: [] };
    state.files.forEach(function (f) { groups[kindOf(f.path)].push(f); });
    var order = ['video', 'audio', 'image', 'document', 'other'];
    var label = { video: 'Video', audio: 'Audio', image: 'Pictures', document: 'Documents', other: 'Other' };
    var html = '';
    order.forEach(function (k) {
      if (!groups[k].length) return;
      html += '<li class="group">' + label[k] + '</li>';
      groups[k].forEach(function (f) {
        html +=
          '<li><button type="button" data-path="' + esc(f.path) + '"' +
          (state.chosen === f.path ? ' aria-current="true"' : '') + '>' +
          '<span class="path">' + esc(f.path) + '</span>' +
          '<span class="size">' + esc(bytes(f.bytes)) + '</span></button></li>';
      });
    });
    $('files').innerHTML = html;
    $('files-empty').hidden = state.files.length > 0;
    $('files-count').textContent = state.files.length ? state.files.length + ' files' : '';
  }

  /** The watcher brings a new output in a moment after the tool wrote it. */
  function loadFilesUntil(path, tries) {
    return loadFiles().then(function () {
      var there = state.files.some(function (f) { return f.path === path; });
      if (there || !tries) return;
      return new Promise(function (r) { setTimeout(r, 700); }).then(function () {
        return loadFilesUntil(path, tries - 1);
      });
    });
  }

  function loadFiles() {
    return garden.files().then(
      function (list) {
        state.files = (list || []).filter(function (f) { return kindOf(f.path) !== 'other' || /^exports\//.test(f.path); });
        renderFiles();
      },
      function (err) { say(err.message, 'bad'); },
    );
  }

  // ── Recipes ───────────────────────────────────────────────────────────
  function loadRecipes() {
    return garden.read('data/project.json').then(
      function (text) {
        var own = [];
        try {
          var doc = JSON.parse(text || '{}');
          if (Array.isArray(doc.recipes)) own = doc.recipes;
        } catch (e) {
          /* a malformed file must not take the bench down */
        }
        var byId = {};
        BUILT_IN.concat(own).forEach(function (r) { if (r && r.id) byId[r.id] = r; });
        state.recipes = Object.keys(byId).map(function (k) { return byId[k]; });
      },
      function () { state.recipes = BUILT_IN.slice(); },
    );
  }

  function recipesFor(path) {
    var e = ext(path);
    return state.recipes.filter(function (r) {
      return Array.isArray(r.accepts) && r.accepts.indexOf(e) >= 0 && have(r.tool);
    });
  }

  function fill(template, path, outPath) {
    return String(template)
      .replace(/\{in\}/g, path)
      .replace(/\{name\}/g, baseName(path))
      .replace(/\{out\}/g, outPath || '');
  }

  function renderRecipes() {
    var select = $('recipe');
    var path = state.chosen;
    if (!path) {
      select.innerHTML = '';
      select.disabled = true;
      $('run').disabled = true;
      $('command').hidden = true;
      return;
    }
    var fits = recipesFor(path);
    var missing = state.recipes.filter(function (r) {
      return Array.isArray(r.accepts) && r.accepts.indexOf(ext(path)) >= 0 && !have(r.tool);
    });
    select.innerHTML = fits
      .map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>'; })
      .join('');
    select.disabled = fits.length === 0;
    $('run').disabled = fits.length === 0 || state.busy;
    if (!fits.length) {
      $('command').hidden = false;
      $('command').textContent = missing.length
        ? 'Nothing to run: ' + missing.length + ' recipe(s) for this kind need ' +
          (missing[0].tool === 'magick' ? 'ImageMagick' : missing[0].tool) + ', which is not on this machine.'
        : 'No recipe fits ' + ext(path) + ' — use “Run something else”, or ask the collaborator.';
      return;
    }
    showCommand();
  }

  function chosenRecipe() {
    var id = $('recipe').value;
    return state.recipes.filter(function (r) { return r.id === id; })[0] || null;
  }

  function showCommand() {
    var r = chosenRecipe();
    if (!r || !state.chosen) { $('command').hidden = true; return; }
    var out = fill(r.out || 'exports/{name}', state.chosen);
    var args = (r.args || []).map(function (a) { return fill(a, state.chosen, out); });
    $('command').hidden = false;
    $('command').textContent = (r.tool === 'magick' ? 'magick ' : r.tool + ' ') + args.join(' ');
  }

  // ── Running ───────────────────────────────────────────────────────────
  function setBusy(busy) {
    state.busy = busy;
    $('run').disabled = busy || !chosenRecipe();
    $('custom-run').disabled = busy;
    $('progress-wrap').hidden = !busy;
    if (!busy) $('progress-bar').style.width = '0%';
  }

  function appendLog(line) {
    return garden.read('log.md').then(
      function (text) {
        var head = text && text.trim() ? text : '# Runs\n\nWhat this bench has done, newest last.\n';
        return garden.write('log.md', head.replace(/\s*$/, '') + '\n' + line + '\n');
      },
      function () { return garden.write('log.md', '# Runs\n\n' + line + '\n'); },
    );
  }

  function runRecipe() {
    var r = chosenRecipe();
    var path = state.chosen;
    if (!r || !path) return;
    var out = fill(r.out || 'exports/{name}', path);
    var args = (r.args || []).map(function (a) { return fill(a, path, out); });
    setBusy(true);
    say('Running ' + r.name + '…');
    remember('pending', JSON.stringify({ name: r.name, out: out, path: path, at: Date.now() }));
    var started = Date.now();
    garden.run(r.tool, args).then(
      function (res) {
        setBusy(false);
        remember('pending', null);
        var secs = ((res.ms || Date.now() - started) / 1000).toFixed(1);
        if (res.code === 0) {
          say(r.name + ' → ' + out + '  (' + secs + ' s)' + (res.stdout ? '\n\n' + res.stdout : ''), 'good');
          appendLog('- `' + out + '` — ' + r.name + ' from `' + path + '` (' + r.tool + ', ' + secs + ' s)');
          loadFilesUntil(out, 14);
        } else {
          say(r.name + ' failed (exit ' + res.code + ')\n\n' + (res.stderrTail || ''), 'bad');
        }
      },
      function (err) {
        setBusy(false);
        remember('pending', null);
        say(err.message, 'bad');
      },
    );
  }

  function runCustom() {
    var tool = $('custom-tool').value;
    var raw = $('custom-args').value.trim();
    if (!raw) return;
    // Split on spaces, keeping quoted runs together — filters have commas and colons,
    // and a drawn caption has spaces.
    var args = (raw.match(/"[^"]*"|'[^']*'|\S+/g) || []).map(function (a) {
      return a.replace(/^["']|["']$/g, '');
    });
    setBusy(true);
    say('Running ' + tool + '…');
    garden.run(tool, args).then(
      function (res) {
        setBusy(false);
        var secs = ((res.ms || 0) / 1000).toFixed(1);
        var body = (res.stdout || '') + (res.stdout && res.stderrTail ? '\n' : '') + (res.code === 0 ? '' : res.stderrTail || '');
        if (res.code === 0) {
          say(tool + ' done (' + secs + ' s)' + (body ? '\n\n' + body : ''), 'good');
          appendLog('- ' + tool + ' `' + args.join(' ') + '` (' + secs + ' s)');
          loadFilesUntil(args[args.length - 1], 14);
        } else {
          say(tool + ' failed (exit ' + res.code + ')\n\n' + body, 'bad');
        }
      },
      function (err) { setBusy(false); say(err.message, 'bad'); },
    );
  }

  // ── Choosing a file ───────────────────────────────────────────────────
  function choose(path) {
    state.chosen = path;
    remember('chosen', path);
    state.about = null;
    renderFiles();
    $('chosen-name').textContent = path;
    $('chosen-kind').textContent = kindOf(path);
    $('about').hidden = true;
    $('about').innerHTML = '';
    renderRecipes();
    say('');
    garden.probe(path).then(
      function (info) {
        if (state.chosen !== path) return;
        if (!info) {
          say('Could not read ' + path + ' — ' + (have('magick') ? 'the tool answered nothing' : 'ImageMagick is not on this machine') + '.');
          return;
        }
        state.about = info;
        var rows = [];
        if (info.format) {
          var f = info.format;
          if (f.format_long_name) rows.push(['Format', f.format_long_name]);
          if (f.duration) rows.push(['Length', Number(f.duration).toFixed(1) + ' s']);
          if (f.bit_rate) rows.push(['Bit rate', Math.round(Number(f.bit_rate) / 1000) + ' kbps']);
          (info.streams || []).forEach(function (s) {
            if (s.codec_type === 'video')
              rows.push(['Video', s.codec_name + ' ' + s.width + '×' + s.height + (s.r_frame_rate ? ' @ ' + s.r_frame_rate.replace('/1', '') : '')]);
            if (s.codec_type === 'audio')
              rows.push(['Audio', s.codec_name + ' ' + (s.channels || '?') + 'ch ' + (s.sample_rate ? s.sample_rate + ' Hz' : '')]);
          });
        } else if (info.width) {
          rows.push(['Picture', info.format + ' ' + info.width + '×' + info.height]);
          if (info.colorspace) rows.push(['Colour', String(info.colorspace)]);
          if (info.bytes) rows.push(['Size', bytes(Number(info.bytes))]);
        }
        if (!rows.length) return;
        $('about').innerHTML = rows
          .map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; })
          .join('');
        $('about').hidden = false;
      },
      function (err) {
        // A file the probes cannot read still has recipes; say why once.
        if (state.chosen === path) say('Could not read ' + path + ': ' + err.message);
      },
    );
  }

  // ── Wiring ────────────────────────────────────────────────────────────
  $('files').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-path]');
    if (b) choose(b.dataset.path);
  });
  $('recipe').addEventListener('change', showCommand);
  $('run').addEventListener('click', runRecipe);
  $('custom-run').addEventListener('click', runCustom);
  $('custom-args').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') runCustom();
  });
  $('look-again').addEventListener('click', function () {
    loadTools(true).then(renderRecipes);
    loadFiles();
  });
  garden.onProgress(function (p) {
    $('progress-wrap').hidden = false;
    $('progress-bar').style.width = Math.round((p || 0) * 100) + '%';
  });

  /** The last line of the log, so a reload still says what the bench made. */
  function showLastRun() {
    garden.read('log.md').then(function (text) {
      var lines = String(text || '')
        .split('\n')
        .filter(function (l) { return l.indexOf('- ') === 0; });
      if (!lines.length || state.busy) return;
      if ($('output').textContent) return;
      $('output').textContent = 'Last run: ' + lines[lines.length - 1].replace(/^- /, '');
      $('output').className = 'output';
    }, function () { /* no log yet */ });
  }

  /** A run that was in flight when the preview reloaded: watch for its output. */
  function resumePending() {
    var raw = recall('pending');
    if (!raw) return false;
    var p;
    try {
      p = JSON.parse(raw);
    } catch (e) {
      remember('pending', null);
      return false;
    }
    if (!p || !p.out || Date.now() - (p.at || 0) > 20 * 60 * 1000) {
      remember('pending', null);
      return false;
    }
    setBusy(true);
    $('output').textContent = 'Running ' + p.name + '…';
    $('output').className = 'output';
    var tries = 240;
    (function watch() {
      loadFiles().then(function () {
        var there = state.files.some(function (f) { return f.path === p.out; });
        if (there) {
          remember('pending', null);
          setBusy(false);
          say(p.name + ' → ' + p.out, 'good');
          return;
        }
        if (--tries <= 0) {
          remember('pending', null);
          setBusy(false);
          say(p.name + ' did not finish — nothing arrived at ' + p.out + '.', 'bad');
          return;
        }
        setTimeout(watch, 500);
      });
    })();
    return true;
  }

  if (!garden.inGarden) {
    $('tools').textContent = 'Open this bench in Crux Garden — it runs the tools for the page.';
    $('files-empty').textContent = 'Open this bench in Crux Garden to see the Crux’s files.';
  } else {
    Promise.all([loadTools(false), loadRecipes()]).then(function () {
      loadFiles().then(function () {
        var last = recall('chosen');
        var stillThere = state.files.some(function (f) { return f.path === last; });
        if (stillThere) choose(last);
        else if (state.files.length) choose(state.files[0].path);
        if (!resumePending()) {
          showLastRun();
          var said = recall('lastSaid');
          if (said && !state.busy) {
            try {
              var s = JSON.parse(said);
              if (s.text) {
                $('output').textContent = s.text;
                $('output').className = 'output' + (s.tone ? ' ' + s.tone : '');
              }
            } catch (e) {
              /* nothing to restore */
            }
          }
        }
      });
    });
  }
})();
