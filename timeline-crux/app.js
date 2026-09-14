// The smallest editor around TimelineJS: a list of events with their dates,
// text and media, rebuilt into the timeline as you type. TimelineJS (upstream's
// build) draws the timeline; this file only keeps the JSON and the form in step.
(function () {
  'use strict';
  const state = {
    name: 'Timeline',
    timeline: { title: { text: { headline: '', text: '' } }, events: [] },
  };
  let rebuildTimer;
  let counter = 0;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const scriptPath = new URL('runtime/js/', document.baseURI).href;

  const uid = (headline) => {
    const base = String(headline || 'event')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    const taken = new Set(state.timeline.events.map((e) => e.unique_id));
    let id = base || 'event';
    while (taken.has(id)) id = `${base || 'event'}-${++counter}`;
    return id;
  };
  const clean = (value) => {
    // Drop empty strings and empty objects so the JSON stays what TimelineJS expects
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        const c = clean(v);
        if (c === '' || c === undefined || c === null) continue;
        if (c && typeof c === 'object' && !Array.isArray(c) && !Object.keys(c).length) continue;
        out[k] = c;
      }
      return out;
    }
    return typeof value === 'string' ? value.trim() : value;
  };

  function rebuild() {
    clearTimeout(rebuildTimer);
    const container = $('#timeline-embed');
    container.innerHTML = '';
    const data = JSON.parse(JSON.stringify(clean(state.timeline)));
    if (!data.events || !data.events.length) {
      container.innerHTML = '<p class="empty">Add an event to see the timeline.</p>';
      return;
    }
    try {
      window.timeline = new TL.Timeline('timeline-embed', data, {
        script_path: scriptPath,
        font: 'default',
        language: 'en',
        hash_bookmark: false,
        ga_measurement_id: null,
      });
    } catch (error) {
      container.innerHTML = `<p class="empty">${String(error.message || error)}</p>`;
    }
    $('#info').textContent = `${data.events.length} event${data.events.length === 1 ? '' : 's'}`;
    document.title = state.name;
  }
  const scheduleRebuild = () => {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(rebuild, 400);
  };
  const changed = () => {
    scheduleRebuild();
    document.dispatchEvent(new CustomEvent('timeline:change'));
  };

  const dateFields = (label, key, event) => {
    const d = event[key] || {};
    return (
      `<label>${label}<div class="dates">` +
      `<input type="number" data-key="${key}" data-part="year" placeholder="Year" value="${d.year ?? ''}" />` +
      `<input type="number" data-key="${key}" data-part="month" placeholder="Month" min="1" max="12" value="${d.month ?? ''}" />` +
      `<input type="number" data-key="${key}" data-part="day" placeholder="Day" min="1" max="31" value="${d.day ?? ''}" />` +
      `</div></label>`
    );
  };
  const escape = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function renderEditor() {
    $('#timeline-name').value = state.name;
    $('#title-headline').value = state.timeline.title?.text?.headline ?? '';
    $('#title-text').value = state.timeline.title?.text?.text ?? '';
    const list = $('#events');
    list.innerHTML = '';
    state.timeline.events.forEach((event, index) => {
      const li = document.createElement('li');
      li.className = 'event';
      li.dataset.id = event.unique_id;
      li.innerHTML =
        `<header><span>Event ${index + 1}</span><button type="button" class="remove" aria-label="Remove event ${index + 1}">Remove</button></header>` +
        `<label>Headline <input data-field="headline" maxlength="300" value="${escape(event.text?.headline)}" /></label>` +
        dateFields('Start', 'start_date', event) +
        dateFields('End (optional)', 'end_date', event) +
        `<label>Text <textarea data-field="text" rows="3">${escape(event.text?.text)}</textarea></label>` +
        `<label>Media URL <input data-field="media-url" maxlength="2000" value="${escape(event.media?.url)}" placeholder="An image, a video, a page" /></label>` +
        `<label>Caption <input data-field="media-caption" maxlength="500" value="${escape(event.media?.caption)}" /></label>` +
        `<label>Group <input data-field="group" maxlength="120" value="${escape(event.group)}" placeholder="A lane on the timeline" /></label>`;
      list.append(li);
    });
  }

  function readEvent(li) {
    const event = state.timeline.events.find((e) => e.unique_id === li.dataset.id);
    if (!event) return;
    event.text = event.text || {};
    event.text.headline = $('[data-field=headline]', li).value;
    event.text.text = $('[data-field=text]', li).value;
    for (const key of ['start_date', 'end_date']) {
      const date = {};
      for (const part of ['year', 'month', 'day']) {
        const v = $(`[data-key=${key}][data-part=${part}]`, li).value.trim();
        if (v !== '') date[part] = Number(v);
      }
      if (date.year === undefined) delete event[key];
      else event[key] = date;
    }
    const url = $('[data-field=media-url]', li).value.trim();
    const caption = $('[data-field=media-caption]', li).value.trim();
    if (url) event.media = { ...(event.media || {}), url, caption };
    else delete event.media;
    const group = $('[data-field=group]', li).value.trim();
    if (group) event.group = group;
    else delete event.group;
  }

  document.addEventListener('input', (e) => {
    const target = e.target;
    if (target.id === 'timeline-name') {
      state.name = target.value.trim() || 'Timeline';
      document.title = state.name;
      document.dispatchEvent(new CustomEvent('timeline:change'));
      return;
    }
    if (target.id === 'title-headline' || target.id === 'title-text') {
      state.timeline.title = state.timeline.title || {};
      state.timeline.title.text = state.timeline.title.text || {};
      state.timeline.title.text[target.id === 'title-headline' ? 'headline' : 'text'] = target.value;
      changed();
      return;
    }
    const li = target.closest('#events .event');
    if (li) {
      readEvent(li);
      changed();
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target.id === 'add-event') {
      const year = new Date().getFullYear();
      state.timeline.events.push({
        unique_id: uid('new-event'),
        start_date: { year },
        text: { headline: 'New event', text: '' },
      });
      renderEditor();
      changed();
      const last = $('#events .event:last-child [data-field=headline]');
      if (last) last.select();
    } else if (e.target.classList.contains('remove')) {
      const li = e.target.closest('.event');
      state.timeline.events = state.timeline.events.filter((ev) => ev.unique_id !== li.dataset.id);
      renderEditor();
      changed();
    }
  });

  window.timelineApp = {
    get: () => ({ name: state.name, timeline: JSON.parse(JSON.stringify(clean(state.timeline))) }),
    set: ({ name, timeline }) => {
      if (typeof name === 'string' && name.trim()) state.name = name.trim();
      if (timeline && typeof timeline === 'object') {
        state.timeline = JSON.parse(JSON.stringify(timeline));
        state.timeline.events = Array.isArray(state.timeline.events) ? state.timeline.events : [];
        for (const event of state.timeline.events) if (!event.unique_id) event.unique_id = uid(event.text?.headline);
      }
      renderEditor();
      rebuild();
    },
    upsert: (events) => {
      for (const incoming of events) {
        const event = JSON.parse(JSON.stringify(incoming));
        const index = event.unique_id ? state.timeline.events.findIndex((e) => e.unique_id === event.unique_id) : -1;
        if (index >= 0) state.timeline.events[index] = event;
        else {
          if (!event.unique_id) event.unique_id = uid(event.text?.headline);
          state.timeline.events.push(event);
        }
      }
      renderEditor();
      rebuild();
    },
    remove: (ids) => {
      const before = state.timeline.events.length;
      state.timeline.events = state.timeline.events.filter((e) => !ids.includes(e.unique_id));
      renderEditor();
      rebuild();
      return before - state.timeline.events.length;
    },
    setName: (name) => {
      state.name = name;
      $('#timeline-name').value = name;
      document.title = name;
    },
  };
  renderEditor();
})();
