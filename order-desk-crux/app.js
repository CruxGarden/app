// Order Desk — the page. Everything stateful goes through the crux's functions:
//   crux.fn('menu')            what can be ordered
//   crux.fn('order', body)     place one (validated, numbered, stored, announced)
//   crux.fn('orders')          the queue
//   crux.fn('status', body)    the owner moves an order along
//   crux.fn('whoami')          is this visitor the owner?
//   crux.on('*', cb)           hear order:* events and refresh
// The page never writes the Store itself: functions/on-store.js refuses that.
(function () {
  var form = document.getElementById('order-form');
  var placed = document.getElementById('placed');
  var list = document.getElementById('orders');
  var empty = document.getElementById('empty');
  var summary = document.getElementById('summary');
  var itemSelect = document.getElementById('item');
  var owner = false;
  var STEPS = ['new', 'printing', 'ready', 'done'];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function say(text, isError) {
    placed.textContent = text;
    placed.className = isError ? 'error' : '';
  }

  function render(orders) {
    list.innerHTML = '';
    empty.hidden = orders.length > 0;
    orders.forEach(function (o) {
      var li = document.createElement('li');
      li.dataset.id = o.id;
      var next = STEPS[STEPS.indexOf(o.status) + 1];
      li.innerHTML =
        '<span class="id">#' + esc(o.id) + '</span>' +
        '<span><strong>' + esc(o.qty) + ' × ' + esc(o.item) + '</strong>' +
        (o.note ? ' <span class="muted">— ' + esc(o.note) + '</span>' : '') +
        '<br><span class="who">for ' + esc(o.name) + '</span></span>' +
        '<span class="actions"><span class="status ' + esc(o.status) + '">' + esc(o.status) + '</span>' +
        (owner && next ? '<button class="small" data-next="' + next + '">Mark ' + next + '</button>' : '') +
        '</span>';
      list.appendChild(li);
    });
  }

  function refresh() {
    return crux.fn('orders').then(function (r) {
      render(r.orders);
      var s = r.summary;
      summary.textContent = s ? s.open + ' open · ' + s.total + ' total' : '';
    });
  }

  list.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-next]');
    if (!b) return;
    var id = b.closest('li').dataset.id;
    b.disabled = true;
    crux.fn('status', { id: id, status: b.dataset.next }).then(refresh, function (err) {
      say(err.message, true);
      b.disabled = false;
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = Object.fromEntries(new FormData(form).entries());
    data.qty = Number(data.qty);
    say('Placing…');
    crux.fn('order', data).then(
      function (o) {
        say('Order #' + o.id + ' placed. ' + o.qty + ' × ' + o.item + ' for ' + o.name + '.');
        form.reset();
        return refresh();
      },
      function (err) { say(err.message, true); }
    );
  });

  crux.fn('menu').then(function (menu) {
    document.getElementById('shop-name').textContent = menu.shop;
    document.getElementById('tagline').textContent = menu.tagline;
    itemSelect.innerHTML = menu.items
      .map(function (i) { return '<option value="' + esc(i.name) + '">' + esc(i.name) + ' — ' + esc(i.price) + '</option>'; })
      .join('');
  });
  crux.fn('whoami').then(function (me) { owner = !!me.owner; return refresh(); });
  crux.on('*', function (data, ev) {
    if (ev.name.indexOf('order:') === 0) refresh();
  });
})();
