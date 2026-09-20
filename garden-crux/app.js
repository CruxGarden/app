// A garden with people — the page. Everything goes through the crux's functions:
//   crux.fn('whoami')                        me, my role, and the garden's card
//   crux.fn('members') / ('shelf') / ('posts') the people, the shared cruxes, the notes
//   crux.fn('invite', {authorId, username, displayName, role})   owner or editor
//   crux.fn('accept') · crux.fn('leave') · crux.fn('remove', {authorId})
//   crux.fn('share', {cruxId, title, url}) · crux.fn('unshare', {cruxId})
//   crux.fn('post', {text})
// The directory (who can be invited) is Crux Garden's: crux.directory(q) asks the host, which asks the API as the signed-in person.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var me = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function note(text) { $('invite-note').textContent = text || ''; }

  function renderMembers(list) {
    var ul = $('members'); ul.innerHTML = '';
    $('people-count').textContent = list.length ? '· ' + list.filter(function (m) { return m.status === 'active'; }).length : '';
    list.forEach(function (m) {
      var li = document.createElement('li');
      li.className = m.status === 'invited' ? 'invited' : '';
      li.dataset.author = m.authorId;
      li.innerHTML = '<span>@' + esc(m.username) + (m.displayName && m.displayName !== m.username ? ' <span class="muted">' + esc(m.displayName) + '</span>' : '') + '</span>' +
        '<span class="role ' + esc(m.role) + '">' + esc(m.role) + '</span>' +
        (m.status === 'invited' ? '<span class="muted">invited</span>' : '') +
        (me && me.role === 'owner' && m.role !== 'owner' ? ' <button class="small" data-remove="' + esc(m.authorId) + '">Remove</button>' : '') +
        (me && me.authorId === m.authorId && m.role !== 'owner' && m.status === 'active' ? ' <button class="small" data-leave="1">Leave</button>' : '');
      ul.appendChild(li);
    });
  }
  function renderShelf(list) {
    var ul = $('cruxes'); ul.innerHTML = '';
    $('shelf-empty').hidden = list.length > 0;
    $('shelf-count').textContent = list.length ? '· ' + list.length : '';
    list.forEach(function (c) {
      var li = document.createElement('li');
      li.dataset.crux = c.cruxId;
      li.innerHTML = '<a href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.title) + '</a>' +
        '<span class="muted">by @' + esc(c.authorUsername) + '</span>' +
        (me && (me.role === 'owner' || me.role === 'editor' || me.authorId === c.addedBy) ? ' <button class="small" data-unshare="' + esc(c.cruxId) + '">Take off</button>' : '');
      ul.appendChild(li);
    });
  }
  function renderPosts(list) {
    var ol = $('posts'); ol.innerHTML = '';
    list.forEach(function (p) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="muted">@' + esc(p.username) + '</span> <span>' + esc(p.text) + '</span>';
      ol.appendChild(li);
    });
  }

  function refresh() {
    var v = crux.visitor || {};
    return crux.fn('whoami', { username: v.username, displayName: v.name }).then(function (w) {
      me = w.me;
      var card = w.garden || { name: document.title || 'A garden', description: '' };
      $('garden-name').textContent = card.name;
      document.title = card.name;
      $('garden-description').textContent = card.description || '';
      $('setup-form').hidden = !(me && me.role === 'owner');
      if (me && me.role === 'owner' && !w.garden) $('setup-name').placeholder = 'name this garden';
      $('me').textContent = me ? 'You are ' + (me.username ? '@' + me.username + ', ' : '') + me.role + (me.status === 'invited' ? ' (invited — accept below)' : '') : 'Sign in to take part.';
      var canInvite = me && me.status === 'active' && (me.role === 'owner' || me.role === 'editor');
      var active = me && me.status === 'active';
      $('invite-form').hidden = !canInvite;
      $('share-form').hidden = !active;
      $('post-form').hidden = !active;
      $('accept').hidden = !(me && me.status === 'invited');
      return Promise.all([crux.fn('members'), crux.fn('shelf'), crux.fn('posts')]);
    }).then(function (r) { renderMembers(r[0]); renderShelf(r[1]); renderPosts(r[2]); }, function (e) { $('me').textContent = e.message; });
  }

  // The directory: the host (Crux Garden) asks the API as the signed-in person; the page never holds a token.
  var picked = null, timer = null;
  $('invite-q').addEventListener('input', function () {
    picked = null; $('invite-button').disabled = true;
    var q = $('invite-q').value.trim().replace(/^@/, '');
    clearTimeout(timer);
    if (!q) { $('invite-suggestions').className = 'suggest'; return; }
    timer = setTimeout(function () {
      crux.directory(q).then(function (list) {
        var ul = $('invite-suggestions'); ul.innerHTML = '';
        list.forEach(function (a) {
          var li = document.createElement('li');
          li.textContent = '@' + a.username + (a.displayName && a.displayName !== a.username ? ' — ' + a.displayName : '');
          li.addEventListener('click', function () {
            picked = a; $('invite-q').value = '@' + a.username; $('invite-button').disabled = false; ul.className = 'suggest';
          });
          ul.appendChild(li);
        });
        ul.className = list.length ? 'suggest open' : 'suggest';
      }, function (e) { note(e.message); });
    }, 200);
  });
  $('invite-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!picked) return;
    crux.fn('invite', { authorId: picked.authorId, username: picked.username, displayName: picked.displayName, role: $('invite-role').value })
      .then(function (r) { note('Invited @' + r.username + ' as ' + r.role + '.'); $('invite-q').value = ''; picked = null; $('invite-button').disabled = true; return refresh(); }, function (e) { note(e.message); });
  });
  $('accept').addEventListener('click', function () {
    var v = crux.visitor || {};
    crux.fn('accept', { username: v.username, displayName: v.name }).then(refresh, function (e) { note(e.message); });
  });
  $('setup-form').addEventListener('submit', function (e) {
    e.preventDefault();
    crux.fn('setup', { name: $('setup-name').value, description: $('setup-description').value }).then(refresh, function (err) { note(err.message); });
  });
  $('members').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var call = b.dataset.leave ? crux.fn('leave') : crux.fn('remove', { authorId: b.dataset.remove });
    call.then(refresh, function (err) { note(err.message); });
  });
  $('share-form').addEventListener('submit', function (e) {
    e.preventDefault();
    crux.fn('share', { cruxId: $('share-id').value.trim(), title: $('share-title').value.trim(), url: $('share-url').value.trim() })
      .then(function () { $('share-form').reset(); return refresh(); }, function (err) { note(err.message); });
  });
  $('cruxes').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-unshare]'); if (!b) return;
    crux.fn('unshare', { cruxId: b.dataset.unshare }).then(refresh, function (err) { note(err.message); });
  });
  $('post-form').addEventListener('submit', function (e) {
    e.preventDefault();
    crux.fn('post', { text: $('post-text').value }).then(function () { $('post-form').reset(); return refresh(); }, function (err) { note(err.message); });
  });
  crux.on('*', function (data, ev) { if (/^garden:/.test(ev.name)) refresh(); });
  (crux.whenReady ? crux.whenReady() : Promise.resolve()).then(refresh, refresh);
})();
