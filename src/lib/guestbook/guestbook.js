/*
 * Crux Garden guestbook — a block for a published site. Visitors leave a
 * note; the notes live in this Crux's own Crux Store under the public key
 * "guestbook" ({ entries: [{ name, message, at }] }), so a fork of the site
 * carries its own book and Crux Garden runs no other backend for it.
 *
 * Three ways to the store, tried in this order (the 5Ws board's pattern):
 *   1. the API directly, when the publish injection told the page which
 *      crux it is (window.crux.publish) — writes need the visitor's sign-in
 *      by email code, done here on the page;
 *   2. window.crux.store, where a host injected the SDK (a web preview);
 *   3. the host frame (the Workshop preview): the SDK's own crux:store:*
 *      postMessage protocol, answered by the author's local store.
 * A page opened on its own with none of these shows the book read-only.
 *
 * Put <section data-guestbook></section> where the book should appear and
 * load this file after it (the Share pane's "Add a guestbook" does both).
 */
(function () {
  'use strict';
  var KEY = 'guestbook';
  var CAP = 200;
  var NAME_MAX = 40;
  var MESSAGE_MAX = 500;
  var TOKEN_KEY = 'crux:guestbook:token';
  var NAME_KEY = 'crux:guestbook:name';

  // ── Where the store is ────────────────────────────────────────────────────

  function apiConfig() {
    var pub = window.crux && window.crux.publish;
    var fromHost = /^([^.]+)\.publish\./.exec(location.hostname);
    var cruxId = (pub && pub.cruxId) || (fromHost && fromHost[1]) || null;
    var apiBase = ((pub && pub.apiBase) || 'https://api.crux.garden').replace(/\/$/, '');
    return cruxId ? { cruxId: cruxId, apiBase: apiBase } : null;
  }

  function apiStore(cfg, token) {
    var url = function (key) {
      return (
        cfg.apiBase + '/store/' + encodeURIComponent(cfg.cruxId) + '/' + encodeURIComponent(key)
      );
    };
    var headers = function (json) {
      var h = { Accept: 'application/json' };
      if (json) h['Content-Type'] = 'application/json';
      if (token) h.Authorization = 'Bearer ' + token;
      return h;
    };
    return {
      via: 'api',
      needsSignIn: !token,
      get: function (key) {
        return fetch(url(key), { headers: headers(false) })
          .then(function (r) {
            return r.ok ? r.json() : null;
          })
          .then(function (d) {
            return d && d.value !== undefined ? d.value : null;
          })
          .catch(function () {
            return null;
          });
      },
      set: function (key, value) {
        return fetch(url(key), {
          method: 'PUT',
          headers: headers(true),
          body: JSON.stringify({ value: value, mode: 'public' }),
        }).then(function (r) {
          if (r.ok) return;
          return r
            .json()
            .catch(function () {
              return {};
            })
            .then(function (d) {
              throw new Error(
                r.status === 401
                  ? 'Your sign-in has expired.'
                  : (d && d.message) || 'The store did not take that (' + r.status + ').',
              );
            });
        });
      },
    };
  }

  function sdkStore(sdk) {
    return {
      via: 'sdk',
      needsSignIn: false,
      get: function (key) {
        return sdk.get(key);
      },
      set: function (key, value) {
        return sdk.set(key, value, { mode: 'public' });
      },
    };
  }

  function hostStore() {
    function call(type, payload) {
      return new Promise(function (resolve) {
        var id = Math.random().toString(36).slice(2);
        var timer = setTimeout(function () {
          window.removeEventListener('message', onMessage);
          resolve(null);
        }, 5000);
        function onMessage(e) {
          if (e.data && e.data.id === id && e.data.type === type + ':res') {
            clearTimeout(timer);
            window.removeEventListener('message', onMessage);
            resolve(e.data.value !== undefined ? e.data.value : null);
          }
        }
        window.addEventListener('message', onMessage);
        var msg = { type: type, id: id };
        for (var k in payload) msg[k] = payload[k];
        window.parent.postMessage(msg, '*');
      });
    }
    return {
      via: 'host',
      needsSignIn: false,
      get: function (key) {
        return call('crux:store:get', { key: key });
      },
      set: function (key, value) {
        window.parent.postMessage(
          { type: 'crux:store:set', key: key, value: value, mode: 'public' },
          '*',
        );
        return Promise.resolve();
      },
    };
  }

  function storeFor(token) {
    var cfg = apiConfig();
    if (cfg) return apiStore(cfg, token);
    if (window.crux && window.crux.store) return sdkStore(window.crux.store);
    if (window.parent && window.parent !== window) return hostStore();
    return null;
  }

  // ── Sign-in (the API's email-code flow) ───────────────────────────────────

  function call(url, init) {
    var headers = { Accept: 'application/json' };
    if (init.body) headers['Content-Type'] = 'application/json';
    if (init.token) headers.Authorization = 'Bearer ' + init.token;
    return fetch(url, { method: init.method || 'GET', headers: headers, body: init.body }).then(
      function (r) {
        return r.text().then(function (text) {
          var data;
          try {
            data = text ? JSON.parse(text) : null;
          } catch {
            data = null;
          }
          if (!r.ok) {
            var msg = (data && data.message) || 'Request failed (' + r.status + ')';
            throw new Error(Array.isArray(msg) ? msg.join('; ') : String(msg));
          }
          return data;
        });
      },
    );
  }

  function requestCode(cfg, email) {
    return call(cfg.apiBase + '/auth/code', {
      method: 'POST',
      body: JSON.stringify({ email: email }),
    });
  }

  function signIn(cfg, email, code) {
    return call(cfg.apiBase + '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email, code: code }),
    }).then(function (data) {
      if (!data || !data.accessToken) throw new Error('No token came back.');
      return data.accessToken;
    });
  }

  function profileName(cfg, token) {
    return call(cfg.apiBase + '/auth/profile', { token: token })
      .then(function (data) {
        return (data && data.author && data.author.username) || '';
      })
      .catch(function () {
        return '';
      });
  }

  // ── The book ──────────────────────────────────────────────────────────────

  function normalize(raw) {
    var list = raw && typeof raw === 'object' && Array.isArray(raw.entries) ? raw.entries : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || typeof e !== 'object') continue;
      var name = typeof e.name === 'string' ? e.name.trim().slice(0, NAME_MAX) : '';
      var message = typeof e.message === 'string' ? e.message.trim().slice(0, MESSAGE_MAX) : '';
      if (!name || !message) continue;
      out.push({ name: name, message: message, at: String(e.at || '') });
    }
    out.sort(function (a, b) {
      return b.at.localeCompare(a.at);
    });
    return out.slice(0, CAP);
  }

  function readBook(store) {
    return store.get(KEY).then(normalize, function () {
      return [];
    });
  }

  function sign(store, name, message) {
    var entry = { name: name, message: message, at: new Date().toISOString() };
    return readBook(store).then(function (entries) {
      var next = [entry].concat(entries).slice(0, CAP);
      return store.set(KEY, { entries: next }).then(function () {
        return next;
      });
    });
  }

  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // ── The block ─────────────────────────────────────────────────────────────

  var CSS =
    '.crux-guestbook{font:inherit;color:inherit;max-width:40rem;margin:2rem auto;padding:0 1rem}' +
    '.crux-guestbook h2{font-size:1.25em;margin:0 0 .75em}' +
    '.crux-guestbook form{display:grid;gap:.5rem;margin-bottom:1.5rem}' +
    '.crux-guestbook label{display:grid;gap:.25rem;font-size:.9em}' +
    '.crux-guestbook input,.crux-guestbook textarea{font:inherit;color:inherit;background:transparent;border:1px solid currentColor;border-radius:.375rem;padding:.5rem;opacity:.9}' +
    '.crux-guestbook textarea{min-height:5rem;resize:vertical}' +
    '.crux-guestbook button{font:inherit;color:inherit;background:transparent;border:1px solid currentColor;border-radius:.375rem;padding:.5rem 1rem;cursor:pointer;justify-self:start}' +
    '.crux-guestbook button:disabled{opacity:.5;cursor:default}' +
    '.crux-guestbook .crux-guestbook-row{display:flex;gap:.5rem;flex-wrap:wrap;align-items:end}' +
    '.crux-guestbook .crux-guestbook-row label{flex:1 1 12rem}' +
    '.crux-guestbook [role=status]{font-size:.9em;opacity:.8;min-height:1.2em}' +
    '.crux-guestbook ol{list-style:none;margin:0;padding:0;display:grid;gap:1rem}' +
    '.crux-guestbook li{border-top:1px solid currentColor;padding-top:.75rem;opacity:.95}' +
    '.crux-guestbook li p{margin:.25rem 0 0;white-space:pre-wrap}' +
    '.crux-guestbook li small{opacity:.7}' +
    '.crux-guestbook .crux-guestbook-empty{opacity:.7}';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) {
      node.appendChild(c);
    });
    return node;
  }

  function field(labelText, input) {
    return el('label', {}, [el('span', { text: labelText }), input]);
  }

  function mount(root) {
    if (!document.getElementById('crux-guestbook-style')) {
      document.head.appendChild(el('style', { id: 'crux-guestbook-style', text: CSS }));
    }
    root.className = (root.className ? root.className + ' ' : '') + 'crux-guestbook';
    root.setAttribute('aria-label', 'Guestbook');
    root.innerHTML = '';

    var token = null;
    try {
      token = sessionStorage.getItem(TOKEN_KEY);
    } catch {
      token = null;
    }
    var store = storeFor(token);
    var cfg = apiConfig();

    var heading = el('h2', { text: root.getAttribute('data-guestbook') || 'Guestbook' });
    var status = el('div', { role: 'status' });
    var list = el('ol', { 'aria-label': 'Guestbook entries' });
    var form = el('form');
    root.appendChild(heading);
    root.appendChild(form);
    root.appendChild(status);
    root.appendChild(list);

    function say(text) {
      status.textContent = text;
    }

    function render(entries) {
      list.innerHTML = '';
      if (!entries.length) {
        list.appendChild(
          el('li', { class: 'crux-guestbook-empty', text: 'No one has signed yet.' }),
        );
        return;
      }
      entries.forEach(function (e) {
        list.appendChild(
          el('li', {}, [
            el('strong', { text: e.name }),
            el('span', { text: ' ' }),
            el('small', { text: when(e.at) }),
            el('p', { text: e.message }),
          ]),
        );
      });
    }

    // A fresh form each time: the old one's submit listener goes with it.
    function freshForm() {
      var next = el('form');
      root.replaceChild(next, form);
      form = next;
      return next;
    }

    function signInForm() {
      var form = freshForm();
      var email = el('input', {
        type: 'email',
        name: 'email',
        autocomplete: 'email',
        required: '',
      });
      var code = el('input', {
        type: 'text',
        name: 'code',
        inputmode: 'numeric',
        autocomplete: 'one-time-code',
      });
      var send = el('button', { type: 'button', text: 'Send code' });
      var enter = el('button', { type: 'submit', text: 'Sign in' });
      enter.disabled = true;
      form.appendChild(el('p', { text: 'Sign in with your email to sign the guestbook.' }));
      form.appendChild(el('div', { class: 'crux-guestbook-row' }, [field('Email', email), send]));
      form.appendChild(el('div', { class: 'crux-guestbook-row' }, [field('Code', code), enter]));
      send.addEventListener('click', function () {
        if (!email.value) return say('Enter your email first.');
        send.disabled = true;
        say('Sending a code…');
        requestCode(cfg, email.value).then(
          function () {
            say('Check your email for the code.');
            enter.disabled = false;
            code.focus();
          },
          function (err) {
            send.disabled = false;
            say(err.message);
          },
        );
      });
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        enter.disabled = true;
        say('Signing in…');
        signIn(cfg, email.value, code.value).then(
          function (t) {
            token = t;
            try {
              sessionStorage.setItem(TOKEN_KEY, t);
            } catch {
              /* a private window keeps it for this page only */
            }
            store = storeFor(token);
            profileName(cfg, token).then(function (name) {
              if (name) {
                try {
                  sessionStorage.setItem(NAME_KEY, name);
                } catch {
                  /* same */
                }
              }
              say('');
              entryForm();
            });
          },
          function (err) {
            enter.disabled = false;
            say(err.message);
          },
        );
      });
    }

    function entryForm() {
      var form = freshForm();
      var remembered;
      try {
        remembered = sessionStorage.getItem(NAME_KEY) || '';
      } catch {
        remembered = '';
      }
      var name = el('input', {
        type: 'text',
        name: 'name',
        maxlength: String(NAME_MAX),
        required: '',
        autocomplete: 'name',
      });
      name.value = remembered;
      var message = el('textarea', {
        name: 'message',
        maxlength: String(MESSAGE_MAX),
        required: '',
      });
      var submit = el('button', { type: 'submit', text: 'Sign the guestbook' });
      form.appendChild(field('Name', name));
      form.appendChild(field('Message', message));
      form.appendChild(submit);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var n = name.value.trim();
        var m = message.value.trim();
        if (!n || !m) return say('A name and a message, please.');
        submit.disabled = true;
        say('Signing…');
        sign(store, n, m).then(
          function (entries) {
            render(entries);
            message.value = '';
            submit.disabled = false;
            say('Thank you, ' + n + '.');
            try {
              sessionStorage.setItem(NAME_KEY, n);
            } catch {
              /* same */
            }
          },
          function (err) {
            submit.disabled = false;
            say(err.message || 'That did not go through.');
            if (/expired/.test(String(err.message))) {
              token = null;
              try {
                sessionStorage.removeItem(TOKEN_KEY);
              } catch {
                /* same */
              }
              store = storeFor(null);
              signInForm();
            }
          },
        );
      });
    }

    if (!store) {
      form.innerHTML = '';
      say('This guestbook opens once the site is shared.');
      render([]);
      return;
    }
    if (store.needsSignIn) signInForm();
    else entryForm();
    readBook(store).then(render);
  }

  function boot() {
    var roots = document.querySelectorAll('[data-guestbook]');
    if (!roots.length) {
      var made = document.createElement('section');
      made.setAttribute('data-guestbook', '');
      document.body.appendChild(made);
      roots = [made];
    }
    for (var i = 0; i < roots.length; i++) mount(roots[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
