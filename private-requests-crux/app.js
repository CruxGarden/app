/* Private Requests UI. Auth is the published SDK's scoped visitor session. */
(async function () {
  const $ = (id) => document.getElementById(id);
  const form = $('request-form');
  const subject = form.elements.subject;
  const details = form.elements.details;
  let visitor = null;
  let dirty = false;
  let busy = false;
  let generation = 0;
  let refreshSignIn = false;
  const say = (message, error = false) => {
    $('status').textContent = message;
    $('status').className = error ? 'error' : '';
  };
  function failure(error, operation) {
    const message = error instanceof Error ? error.message : 'The request could not complete.';
    say(message + ' Your unsaved text is still here. Refresh or try again when ready.', true);
    // Useful context without request contents, email, credentials or a stack trace.
    $('error-details').textContent =
      'Action: ' +
      operation +
      '\nBackend: ' +
      (window.crux?.auth ? 'Published API' : 'Workspace preview') +
      '\nTime: ' +
      new Date().toISOString();
    $('diagnostics').hidden = false;
  }
  async function run(operation, work) {
    if (busy) return;
    const epoch = generation;
    busy = true;
    document.querySelectorAll('button, input, textarea').forEach((el) => {
      el.disabled = true;
    });
    form.setAttribute('aria-busy', 'true');
    $('diagnostics').hidden = true;
    $('error-details').hidden = true;
    try {
      await work();
    } catch (error) {
      if (epoch === generation) failure(error, operation);
    } finally {
      busy = false;
      document.querySelectorAll('button, input, textarea').forEach((el) => {
        el.disabled = false;
      });
      form.removeAttribute('aria-busy');
      if (refreshSignIn) {
        refreshSignIn = false;
        void run('Refresh sign-in', () => refresh());
      }
    }
  }
  const call = (body) => crux.fn('requests', body);
  function clearPrivateView() {
    subject.value = '';
    details.value = '';
    dirty = false;
    $('inbox').replaceChildren();
    $('owner').hidden = true;
    form.hidden = true;
  }
  function renderInbox(records) {
    $('inbox').replaceChildren();
    $('empty').hidden = records.length > 0;
    for (const record of records) {
      const article = document.createElement('article');
      const heading = document.createElement('h3');
      heading.textContent = record.subject;
      const text = document.createElement('p');
      text.className = 'request-details';
      text.textContent = record.details;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Delete handled request';
      remove.className = 'secondary';
      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.textContent = 'Confirm delete';
      confirm.hidden = true;
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Keep request';
      cancel.className = 'secondary';
      cancel.hidden = true;
      remove.onclick = () => {
        remove.hidden = true;
        confirm.hidden = false;
        cancel.hidden = false;
        confirm.focus();
      };
      cancel.onclick = () => {
        remove.hidden = false;
        confirm.hidden = true;
        cancel.hidden = true;
        remove.focus();
      };
      confirm.onclick = () =>
        run('Delete request', async () => {
          await call({ action: 'remove', visitorId: record.visitorId });
          say('Request deleted.');
          if (record.visitorId === visitor?.id && !dirty) {
            subject.value = '';
            details.value = '';
          }
          await refresh(false);
        });
      const actions = document.createElement('div');
      actions.className = 'actions';
      actions.append(remove, confirm, cancel);
      article.append(heading, text, actions);
      $('inbox').append(article);
    }
  }
  async function refresh(fill = true) {
    const epoch = generation;
    const profile = await call({ action: 'profile' });
    if (epoch !== generation) return;
    const next = profile.visitor;
    if (visitor?.id !== next?.id) clearPrivateView();
    visitor = next;
    const hosted = !!crux.auth?.isHosted();
    $('identity').textContent = crux.auth
      ? visitor
        ? 'Signed in. Your request is private to you and the creator.'
        : 'Sign in to send a private request.'
      : 'Workspace preview · you are the local owner. Published customers sign in separately.';
    $('auth').hidden = !!visitor;
    $('email-form').hidden = hosted || !!visitor;
    $('hosted').hidden = !hosted || !!visitor;
    $('logout').hidden = !crux.auth || hosted || !visitor;
    form.hidden = !visitor;
    $('owner').hidden = !visitor?.isOwner;
    if (!visitor) return;
    const response = await call({ action: 'list' });
    if (epoch !== generation) return;
    const own = response.requests.find((r) => r.visitorId === visitor.id);
    if (fill && !dirty) {
      subject.value = own?.subject || '';
      details.value = own?.details || '';
    }
    if (visitor.isOwner) renderInbox(response.requests);
  }
  form.addEventListener('input', () => {
    dirty = true;
  });
  form.onsubmit = (event) => {
    event.preventDefault();
    const epoch = generation;
    const draft = { action: 'save', subject: subject.value, details: details.value };
    void run('Save request', async () => {
      const result = await call(draft);
      if (epoch !== generation) return;
      dirty = false;
      subject.value = result.request.subject;
      details.value = result.request.details;
      say('Request saved. Only you and the creator can read it.');
      try {
        await refresh(false);
      } catch {
        say('Request saved. The inbox could not refresh; use Refresh requests to check it.');
      }
    });
  };
  $('email-form').onsubmit = (event) => {
    event.preventDefault();
    void run('Send sign-in code', async () => {
      await crux.auth.requestCode($('email').value.trim());
      $('code-form').hidden = false;
      say('Check your email for a sign-in code.');
    });
  };
  $('code-form').onsubmit = (event) => {
    event.preventDefault();
    void run('Sign in', async () => {
      await crux.auth.login($('email').value.trim(), $('code').value.trim());
      $('code').value = '';
      $('code-form').hidden = true;
      await refresh();
      say('Signed in.');
    });
  };
  $('logout').onclick = () =>
    run('Sign out', async () => {
      await crux.auth.logout();
      generation++;
      visitor = null;
      clearPrivateView();
      await refresh();
      say('Signed out. Private details have been cleared from this page.');
    });
  $('refresh').onclick = () =>
    run('Refresh requests', async () => {
      await refresh();
      say('Requests refreshed. Unsaved edits are kept.');
    });
  $('diagnostics').onclick = () => {
    $('error-details').hidden = !$('error-details').hidden;
  };
  window.addEventListener('crux:authchange', () => {
    // A parent session switch must immediately hide data while the new identity resolves.
    generation++;
    visitor = null;
    clearPrivateView();
    if (busy) refreshSignIn = true;
    else void run('Refresh sign-in', () => refresh());
  });
  if (!window.crux?.fn) {
    say('Open this project in Workshop or publish it with the current API.', true);
    return;
  }
  await crux.whenReady();
  await run('Open requests', () => refresh());
})();
