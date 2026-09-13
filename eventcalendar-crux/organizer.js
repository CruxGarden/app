// The organizer around EventCalendar (vkurko/calendar, MIT): the actual calendar
// component with every view and its drag-and-drop editing, plus the one thing
// the component leaves to its host, an event form. The event list is plain
// data (title, start, end as local wall-clock strings, all-day, colour, notes);
// inside a Crux the Garden bridge keeps it, standalone the browser does.
/* global EventCalendar */
(function () {
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) =>
    d instanceof Date && !Number.isNaN(d.getTime())
      ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
      : '';
  const text = (title) =>
    typeof title === 'string'
      ? title
      : title && typeof title.html === 'string'
        ? title.html.replace(/<[^>]+>/g, '')
        : String(title ?? '');
  const project = { name: 'Calendar', view: 'dayGridMonth', date: '', events: [] };
  let ec = null;
  let listeners = [];
  let hydrating = false;
  const notify = () => listeners.forEach((fn) => fn());

  const toCalendar = (e) => ({
    id: e.id,
    title: e.title,
    start: e.start,
    end: e.end || undefined,
    allDay: e.allDay,
    backgroundColor: e.color || undefined,
    extendedProps: { notes: e.notes || '' },
  });
  const fromCalendar = (ev) => ({
    id: String(ev.id),
    title: text(ev.title),
    start: iso(ev.start),
    end: iso(ev.end),
    allDay: !!ev.allDay,
    color: ev.backgroundColor || '',
    notes: (ev.extendedProps && ev.extendedProps.notes) || '',
  });
  function commit() {
    if (!ec || hydrating) return;
    project.events = ec
      .getEvents()
      .map(fromCalendar)
      .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
    notify();
  }

  /* The event form: the calendar's own selection or a clicked event fills it; Save, Delete or Cancel. */
  const dialog = document.getElementById('event-dialog');
  const form = document.getElementById('event-form');
  function ask(draft, existing) {
    document.getElementById('event-dialog-title').textContent = existing
      ? 'Edit event'
      : 'New event';
    document.getElementById('event-delete').hidden = !existing;
    form.elements.title.value = draft.title;
    form.elements.allDay.checked = draft.allDay;
    form.elements.start.value = draft.start.slice(0, 16);
    form.elements.end.value = draft.end.slice(0, 16);
    form.elements.color.value = draft.color || '#2f6f4e';
    form.elements.notes.value = draft.notes || '';
    return new Promise((resolve) => {
      dialog.onclose = () => {
        const action = dialog.returnValue;
        dialog.returnValue = '';
        if (action === 'save')
          resolve({
            action,
            event: {
              id: draft.id,
              title: form.elements.title.value.trim(),
              allDay: form.elements.allDay.checked,
              start: form.elements.start.value ? form.elements.start.value + ':00' : draft.start,
              end: form.elements.end.value ? form.elements.end.value + ':00' : '',
              color: form.elements.color.value,
              notes: form.elements.notes.value.trim(),
            },
          });
        else resolve({ action });
      };
      dialog.showModal();
      form.elements.title.focus();
    });
  }

  function create() {
    if (ec) EventCalendar.destroy(ec);
    hydrating = true;
    ec = EventCalendar.create(document.getElementById('ec'), {
      view: project.view,
      date: project.date || undefined,
      headerToolbar: {
        start: 'title',
        center: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
        end: 'today prev,next',
      },
      buttonText: {
        dayGridMonth: 'Month',
        timeGridWeek: 'Week',
        timeGridDay: 'Day',
        listWeek: 'List',
        today: 'Today',
      },
      editable: true,
      selectable: true,
      nowIndicator: true,
      dayMaxEvents: true,
      height: '100%',
      events: project.events.map(toCalendar),
      select: async (info) => {
        const answer = await ask(
          {
            id: '',
            title: '',
            allDay: info.allDay,
            start: iso(info.start),
            end: iso(info.end),
            color: '',
            notes: '',
          },
          false,
        );
        ec.unselect();
        if (answer.action !== 'save' || !answer.event.title) return;
        answer.event.id = crypto.randomUUID().slice(0, 8);
        ec.addEvent(toCalendar(answer.event));
        commit();
      },
      eventClick: async (info) => {
        const current = fromCalendar(info.event);
        const answer = await ask(current, true);
        if (answer.action === 'delete') ec.removeEventById(current.id);
        else if (answer.action === 'save' && answer.event.title)
          ec.updateEvent(toCalendar(answer.event));
        else return;
        commit();
      },
      eventDrop: () => commit(),
      eventResize: () => commit(),
      datesSet: () => {
        const view = ec ? ec.getView().type : project.view;
        const date = ec ? iso(ec.getOption('date')).slice(0, 10) : project.date;
        if (hydrating || (view === project.view && date === project.date)) return;
        project.view = view;
        project.date = date;
        notify();
      },
    });
    hydrating = false;
  }

  window.organizer = {
    /** Replace the whole calendar with a saved project (missing parts take defaults). */
    load(saved) {
      project.name = (saved && saved.name) || 'Calendar';
      project.view = (saved && saved.view) || 'dayGridMonth';
      project.date = (saved && saved.date) || '';
      project.events = ((saved && saved.events) || []).map((e) => ({ ...e }));
      create();
    },
    snapshot: () => JSON.parse(JSON.stringify(project)),
    onChange(fn) {
      listeners.push(fn);
    },
    setName(name) {
      project.name = name;
      notify();
    },
    addEvent(event) {
      const e = {
        id: crypto.randomUUID().slice(0, 8),
        title: '',
        start: '',
        end: '',
        allDay: false,
        color: '',
        notes: '',
        ...event,
      };
      // Without an end the component would guess one; give it the plain reading: a day, or an hour.
      if (!e.end && e.start) {
        const [date, time] = e.start.split('T');
        const [y, m, d] = date.split('-').map(Number);
        const [hh, mm] = (time || '00:00:00').split(':').map(Number);
        const until = e.allDay ? new Date(y, m - 1, d + 1, 0, 0, 0) : new Date(y, m - 1, d, hh + 1, mm, 0);
        e.end = iso(until);
      }
      ec.addEvent(toCalendar(e));
      ec.gotoDate(e.start);
      commit();
      return e.id;
    },
    removeEvent(id) {
      if (!ec.getEventById(id)) return false;
      ec.removeEventById(id);
      commit();
      return true;
    },
    ready: () => !!ec,
  };

  // Standalone (not inside a Crux): the browser keeps the calendar.
  if (parent === window) {
    const KEY = 'eventcalendar.project';
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch (e) {
      saved = null;
    }
    window.organizer.load(saved);
    window.organizer.onChange(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(project));
      } catch (e) {
        /* storage unavailable: the session still works */
      }
    });
  }
})();
