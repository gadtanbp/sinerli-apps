/* Sinerli Note — Copyright © 2026 Gadtan x Gallen. All rights reserved.
 * NDB — database: halaman ber-`isDb` dengan skema properti & beberapa tampilan.
 * Setiap baris adalah halaman biasa (parent = database) dengan `props`, jadi
 * baris bisa dibuka & diisi blok seperti halaman lain. */
(function (global) {
  'use strict';
  var esc = SN.esc;
  var NDB = global.NDB = {};
  var PTYPES = [
    ['text', '≡'], ['number', '#'], ['select', '◉'], ['multi', '☰'], ['status', '◐'], ['date', '📅'], ['person', '👤'],
    ['checkbox', '☑'], ['url', '🔗'], ['email', '@'], ['phone', '☎'], ['created', '🕒'], ['edited', '🕘']
  ];
  NDB.PTYPES = PTYPES;
  var VTYPES = [['table', '⊞'], ['board', '▥'], ['list', '☰'], ['gallery', '▦'], ['calendar', '📅']];
  var hosts = [];   // {el, db, opt} yang sedang tampil (untuk render ulang saat ada perubahan)

  function schemaKeys(db) {
    var keys = (db.propOrder || []).filter(function (k) { return db.schema[k]; });
    Object.keys(db.schema || {}).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    var ti = keys.indexOf('title'); if (ti > 0) { keys.splice(ti, 1); keys.unshift('title'); }
    return keys;
  }
  function rows(db) { return NS.childPages(db.id); }
  function value(row, key, db) {
    var t = db.schema[key].type;
    if (t === 'title') return row.title || '';
    if (t === 'created') return row.created || 0;
    if (t === 'edited') return row.edited || row.created || 0;
    return (row.props || {})[key];
  }
  function setValue(row, key, v) {
    if (key === 'title') { NS.set(row.id, { title: v }); return; }
    var props = Object.assign({}, row.props || {}); props[key] = v;
    NS.set(row.id, { props: props });
  }
  function opt(db, key, id) { return ((db.schema[key].options) || []).find(function (o) { return o.id === id; }); }
  function tag(o, status) { return o ? '<span class="ndb-tag' + (status ? ' is-status' : '') + '" style="--bg:var(--b-' + (o.color || 'gray') + ');--fg:var(--c-' + (o.color || 'gray') + ')">' + esc(o.name) + '</span>' : ''; }
  function fmtDate(v) { if (!v) return ''; var d = new Date(typeof v === 'number' ? v : v + 'T00:00:00'); return isNaN(d) ? esc(v) : d.toLocaleDateString(SN.lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function display(db, key, row) {
    var p = db.schema[key], v = value(row, key, db);
    switch (p.type) {
      case 'title': return esc(v || SN.t('n_untitled'));
      case 'select': case 'status': return tag(opt(db, key, v), p.type === 'status');
      case 'multi': return (v || []).map(function (id) { return tag(opt(db, key, id)); }).join('');
      case 'checkbox': return '<input type="checkbox" data-cb' + (v ? ' checked' : '') + '>';
      case 'date': return fmtDate(v);
      case 'created': case 'edited': return fmtDate(v);
      case 'url': return v ? '<a href="' + esc(/^https?:/.test(v) ? v : 'https://' + v) + '" target="_blank" rel="noopener">' + esc(v) + '</a>' : '';
      case 'number': return v == null || v === '' ? '' : esc(p.fmt === 'pct' ? v + '%' : p.fmt === 'idr' ? 'Rp ' + Number(v).toLocaleString('id-ID') : p.fmt === 'usd' ? '$' + Number(v).toLocaleString('en-US') : Number(v).toLocaleString(SN.lang === 'id' ? 'id-ID' : 'en-US'));
      default: return esc(v || '');
    }
  }

  /* ---------------------------------------------------------- filter & sort */
  function applyView(db, view, list) {
    var q = (view._q || '').toLowerCase();
    if (q) list = list.filter(function (r) { return (r.title || '').toLowerCase().indexOf(q) >= 0 || JSON.stringify(r.props || {}).toLowerCase().indexOf(q) >= 0; });
    (view.filters || []).forEach(function (f) {
      if (!db.schema[f.prop]) return;
      list = list.filter(function (r) {
        var v = value(r, f.prop, db), t = db.schema[f.prop].type;
        var s = Array.isArray(v) ? v.join(',') : String(v == null ? '' : v);
        if (t === 'select' || t === 'status' || t === 'multi') s = (Array.isArray(v) ? v : [v]).map(function (id) { var o = opt(db, f.prop, id); return o ? o.name : ''; }).join(',');
        var val = String(f.val || '').toLowerCase();
        switch (f.op) {
          case 'is': return s.toLowerCase() === val;
          case 'not': return s.toLowerCase() !== val;
          case 'contains': return s.toLowerCase().indexOf(val) >= 0;
          case 'empty': return !s || s === 'false';
          case 'notempty': return !!s && s !== 'false';
          case 'gt': return Number(v) > Number(f.val) || (t === 'date' && s > f.val);
          case 'lt': return Number(v) < Number(f.val) || (t === 'date' && s && s < f.val);
          case 'checked': return !!v;
          case 'unchecked': return !v;
        }
        return true;
      });
    });
    var sorts = view.sorts || [];
    if (sorts.length) list = list.slice().sort(function (a, b) {
      for (var i = 0; i < sorts.length; i++) {
        var s = sorts[i]; if (!db.schema[s.prop]) continue;
        var va = value(a, s.prop, db), vb = value(b, s.prop, db), t = db.schema[s.prop].type;
        if (t === 'select' || t === 'status') { var oa = db.schema[s.prop].options || []; va = oa.findIndex(function (o) { return o.id === va; }); vb = oa.findIndex(function (o) { return o.id === vb; }); }
        if (va == null) va = ''; if (vb == null) vb = '';
        var c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true });
        if (c) return s.dir === 'desc' ? -c : c;
      }
      return 0;
    });
    return list;
  }

  /* ---------------------------------------------------------- render */
  NDB.render = function (host, dbId, o) {
    o = o || {};
    var db = NS.page(dbId);
    if (!db) { host.innerHTML = '<div class="nb-ph">' + esc(SN.t('n_page_missing')) + '</div>'; return; }
    hosts = hosts.filter(function (h) { return h.el.isConnected && h.el !== host; });
    hosts.push({ el: host, db: dbId, opt: o });
    var views = db.views && db.views.length ? db.views : [{ id: 'v1', name: SN.t('n_view_table'), type: 'table' }];
    var cur = SN.store.get('ndb_view_' + dbId, views[0].id);
    var view = views.find(function (v) { return v.id === cur; }) || views[0];
    view._q = host._q || '';
    var ed = !NS.readonly && !db.locked;
    var el = SN.el('div', { class: 'ndb' });
    el.innerHTML = '<div class="ndb-head">' + (o.inline ? '<div class="ndb-title" data-go="' + db.id + '">' + esc(NS.icon(db)) + ' ' + esc(NS.title(db)) + '</div>' : '') +
      '<div class="ndb-views">' + views.map(function (v) { return '<button class="ndb-view' + (v.id === view.id ? ' is-on' : '') + '" data-view="' + v.id + '">' + (VTYPES.find(function (t) { return t[0] === v.type; }) || ['', ''])[1] + ' ' + esc(v.name) + '</button>'; }).join('') +
      (ed ? '<button class="ndb-view" data-addview title="' + esc(SN.t('n_add_view')) + '">＋</button>' : '') + '</div>' +
      '<div class="ndb-tools"><input class="ndb-search" placeholder="' + esc(SN.t('n_search')) + '" value="' + esc(view._q) + '">' +
      '<button class="n-ib' + ((view.filters || []).length ? ' is-on' : '') + '" data-tool="filter" title="' + esc(SN.t('n_filter')) + '">⚲</button>' +
      '<button class="n-ib' + ((view.sorts || []).length ? ' is-on' : '') + '" data-tool="sort" title="' + esc(SN.t('n_sort')) + '">⇅</button>' +
      '<button class="n-ib" data-tool="view" title="' + esc(SN.t('n_view_settings')) + '">⋯</button>' +
      (ed ? '<button class="n-btn n-btn-p" data-tool="new" style="padding:3px 10px">' + esc(SN.t('n_new')) + '</button>' : '') + '</div></div>' +
      (((view.filters || []).length + (view.sorts || []).length) ? '<div class="ndb-chips">' + (view.filters || []).map(function (f, i) { return '<span class="ndb-chip" data-tool="filter">' + esc((db.schema[f.prop] || {}).name || '?') + ': ' + esc(SN.t('n_op_' + f.op)) + (f.val ? ' ' + esc(f.val) : '') + '</span>'; }).join('') + (view.sorts || []).map(function (s) { return '<span class="ndb-chip" data-tool="sort">' + (s.dir === 'desc' ? '↓ ' : '↑ ') + esc((db.schema[s.prop] || {}).name || '?') + '</span>'; }).join('') + '</div>' : '') +
      '<div class="ndb-body"></div>';
    host.innerHTML = '';
    host.appendChild(el);
    var body = el.querySelector('.ndb-body');
    var list = applyView(db, view, rows(db));
    ({ table: table, board: board, list: listView, gallery: gallery, calendar: calendar }[view.type] || table)(body, db, view, list, ed);

    var search = el.querySelector('.ndb-search');
    search.addEventListener('input', function () { host._q = search.value; var pos = search.selectionStart; NDB.render(host, dbId, o); var s2 = host.querySelector('.ndb-search'); s2.focus(); s2.setSelectionRange(pos, pos); });
    el.querySelector('.ndb-head').addEventListener('click', function (e) {
      var v = e.target.closest('[data-view]'), t = e.target.closest('[data-tool]');
      if (v) { SN.store.set('ndb_view_' + dbId, v.dataset.view); NDB.render(host, dbId, o); if (v.classList.contains('is-on') && ed) viewMenu(v, db, view, host, o); }
      if (e.target.closest('[data-addview]')) addView(e.target.closest('[data-addview]'), db, host, o);
      if (t) toolMenu(t, t.dataset.tool, db, view, host, o);
    });
    el.querySelector('.ndb-chips') && el.querySelector('.ndb-chips').addEventListener('click', function (e) { var t = e.target.closest('[data-tool]'); if (t) toolMenu(t, t.dataset.tool, db, view, host, o); });
  };
  NDB.refreshAll = function () { hosts = hosts.filter(function (h) { return h.el.isConnected; }); hosts.forEach(function (h) { if (!h.el.contains(document.activeElement) || !document.activeElement.matches('input, textarea')) NDB.render(h.el, h.db, h.opt); }); };

  function saveView(db, view) {
    var views = JSON.parse(JSON.stringify(db.views || [])), i = views.findIndex(function (v) { return v.id === view.id; });
    var clean = JSON.parse(JSON.stringify(view)); delete clean._q;
    if (i < 0) views.push(clean); else views[i] = clean;
    NS.set(db.id, { views: views });
  }
  function newRow(db, view, props) {
    var p = {};
    (view.filters || []).forEach(function (f) { if (f.op === 'is' && db.schema[f.prop]) { var t = db.schema[f.prop].type; if (t === 'select' || t === 'status') { var o = (db.schema[f.prop].options || []).find(function (x) { return x.name.toLowerCase() === String(f.val).toLowerCase(); }); if (o) p[f.prop] = o.id; } else if (t !== 'title') p[f.prop] = f.val; } });
    Object.assign(p, props || {});
    return NS.newPage(db.id, { title: '', props: p, icon: '' });
  }

  /* ---------------------------------------------------------- tabel */
  function table(body, db, view, list, ed) {
    var keys = schemaKeys(db).filter(function (k) { return !(view.hidden || {})[k]; });
    var h = '<div class="ndb-scroll"><table class="ndb-tbl"><thead><tr>' + keys.map(function (k) { var p = db.schema[k]; return '<th style="' + (k === 'title' ? 'min-width:240px' : '') + '"><button class="ndb-th" data-prop="' + k + '">' + ((PTYPES.find(function (t) { return t[0] === p.type; }) || ['', 'Aa'])[1]) + ' ' + esc(p.name) + '</button></th>'; }).join('') +
      (ed ? '<th style="min-width:40px;width:40px"><button class="ndb-th" data-addprop title="' + esc(SN.t('n_add_prop')) + '">＋</button></th>' : '') + '</tr></thead><tbody>' +
      list.map(function (r) { return '<tr data-row="' + r.id + '">' + keys.map(function (k) { return '<td><div class="ndb-cell' + (k === 'title' ? ' is-title' : '') + '" data-k="' + k + '"><span>' + (k === 'title' && r.icon ? esc(r.icon) + ' ' : '') + display(db, k, r) + '</span>' + (k === 'title' ? '<button class="ndb-open" data-open="' + r.id + '">' + esc(SN.t('n_open')) + '</button>' : '') + '</div></td>'; }).join('') + (ed ? '<td></td>' : '') + '</tr>'; }).join('') +
      '</tbody></table></div>' + (ed ? '<button class="ndb-add" data-addrow>＋ ' + esc(SN.t('n_new')) + '</button>' : '') +
      '<div class="ndb-calc">' + esc(SN.t('n_count', { n: list.length })) + calcs(db, keys, list) + '</div>';
    body.innerHTML = h;
    body.addEventListener('click', function (e) {
      var open = e.target.closest('[data-open]');
      if (open) { NS.emit('peek', open.dataset.open); return; }
      if (e.target.closest('[data-addrow]')) { var id = newRow(db, view); NDB.refreshAll(); setTimeout(function () { var c = body.querySelector('tr[data-row="' + id + '"] [data-k=title]'); if (c) editCell(c, db, NS.page(id), 'title'); }, 30); return; }
      if (e.target.closest('[data-addprop]')) { addProp(e.target.closest('[data-addprop]'), db); return; }
      var th = e.target.closest('[data-prop]'); if (th && ed) { propMenu(th, db, th.dataset.prop, view); return; }
      var a = e.target.closest('a[href]'); if (a) return;
      var cell = e.target.closest('.ndb-cell'); if (!cell || !ed) return;
      var row = NS.page(cell.closest('tr').dataset.row);
      if (e.target.matches('[data-cb]')) { setValue(row, cell.dataset.k, e.target.checked); return; }
      editCell(cell, db, row, cell.dataset.k);
    });
  }
  function calcs(db, keys, list) {
    var out = '';
    keys.forEach(function (k) {
      var p = db.schema[k];
      if (p.type === 'number') { var sum = list.reduce(function (a, r) { return a + (Number(value(r, k, db)) || 0); }, 0); out += ' · ' + esc(p.name) + ' Σ ' + sum.toLocaleString(SN.lang === 'id' ? 'id-ID' : 'en-US'); }
      if (p.type === 'checkbox') { var n = list.filter(function (r) { return value(r, k, db); }).length; out += ' · ' + esc(p.name) + ' ' + (list.length ? Math.round(n / list.length * 100) : 0) + '%'; }
    });
    return out;
  }

  /* ---------------------------------------------------------- edit sel */
  function editCell(cell, db, row, key) {
    var p = db.schema[key], t = p.type, v = value(row, key, db);
    if (t === 'created' || t === 'edited') return;
    if (t === 'select' || t === 'status' || t === 'multi') { optionPicker(cell, db, key, row); return; }
    if (t === 'checkbox') { setValue(row, key, !v); return; }
    if (t === 'person') { personPicker(cell, row, key, v); return; }
    var type = { number: 'number', date: 'date', url: 'url', email: 'email', phone: 'tel' }[t] || 'text';
    cell.innerHTML = '<input type="' + type + '" value="' + esc(v == null ? '' : v) + '">';
    var inp = cell.querySelector('input');
    inp.focus(); if (inp.select && type !== 'date') inp.select();
    var done = false;
    var fin = function (save) { if (done) return; done = true; if (save) setValue(row, key, type === 'number' ? (inp.value === '' ? '' : Number(inp.value)) : inp.value); NDB.refreshAll(); };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') fin(true); if (e.key === 'Escape') fin(false); e.stopPropagation(); });
    inp.addEventListener('blur', function () { fin(true); });
  }
  function optionPicker(anchor, db, key, row, onDone) {
    var p = db.schema[key], multi = p.type === 'multi', cur = value(row, key, db);
    var sel = multi ? (cur || []) : (cur ? [cur] : []);
    function paint(q) {
      var opts = (p.options || []).filter(function (o) { return !q || o.name.toLowerCase().indexOf(q.toLowerCase()) >= 0; });
      return '<input class="n-pop-in" placeholder="' + esc(SN.t('n_opt_search')) + '" value="' + esc(q || '') + '">' +
        opts.map(function (o) { return '<button class="n-mi is-small" data-o="' + o.id + '"><span class="n-mi-ic">' + (sel.indexOf(o.id) >= 0 ? '✓' : '') + '</span>' + tag(o, p.type === 'status') + '<span class="n-mi-ic" data-edit="' + o.id + '" style="margin-left:auto">⋯</span></button>'; }).join('') +
        (q && !opts.some(function (o) { return o.name.toLowerCase() === q.toLowerCase(); }) ? NE.mi('data-create="1"', '＋', SN.t('n_opt_create', { name: q }), '', '', true) : '') +
        (sel.length ? '<div class="n-sep"></div>' + NE.mi('data-clear="1"', '✕', SN.t('n_clear'), '', '', true) : '');
    }
    var el = NE.popAt(anchor, paint(''), { onClose: function () { NDB.refreshAll(); if (onDone) onDone(); } });
    var bind = function () {
      var inp = el.querySelector('input');
      inp.focus();
      inp.oninput = function () { var pos = inp.selectionStart; el.innerHTML = paint(inp.value); bind(); var i2 = el.querySelector('input'); i2.setSelectionRange(pos, pos); };
      inp.onkeydown = function (e) { if (e.key === 'Enter') { var c = el.querySelector('[data-create]') || el.querySelector('[data-o]'); if (c) c.click(); } };
    };
    bind();
    el.addEventListener('click', function (e) {
      var ed = e.target.closest('[data-edit]');
      if (ed) { e.stopPropagation(); optionEdit(ed, db, key, ed.dataset.edit); return; }
      var b = e.target.closest('button'); if (!b) return;
      var q = el.querySelector('input').value;
      if (b.dataset.clear) { setValue(row, key, multi ? [] : ''); NE.closePop(); return; }
      var id = b.dataset.o;
      if (b.dataset.create) {
        var schema = JSON.parse(JSON.stringify(db.schema)); id = 'o' + Math.random().toString(36).slice(2, 8);
        var colors = NE.COLORS.slice(1);
        (schema[key].options = schema[key].options || []).push({ id: id, name: q, color: colors[schema[key].options.length % colors.length] });
        NS.set(db.id, { schema: schema }); db = NS.page(db.id); p = db.schema[key];
      }
      if (multi) { sel = sel.indexOf(id) >= 0 ? sel.filter(function (x) { return x !== id; }) : sel.concat([id]); setValue(row, key, sel); row = NS.page(row.id); el.innerHTML = paint(''); bind(); }
      else { setValue(row, key, id); NE.closePop(); }
    });
  }
  function optionEdit(anchor, db, key, oid) {
    var o = opt(db, key, oid); if (!o) return;
    var el = NE.popAt(anchor, '<input class="n-pop-in" value="' + esc(o.name) + '"><div class="n-colors">' + NE.COLORS.slice(1).map(function (c) { return '<button data-c="' + c + '" style="background:var(--b-' + c + ');color:var(--c-' + c + ')">' + (o.color === c ? '✓' : 'A') + '</button>'; }).join('') + '</div>' + NE.mi('data-del="1"', '🗑', SN.t('n_delete'), '', '', true));
    var inp = el.querySelector('input');
    var save = function (patch) { var schema = JSON.parse(JSON.stringify(db.schema)); var x = schema[key].options.find(function (y) { return y.id === oid; }); Object.assign(x, patch); NS.set(db.id, { schema: schema }); };
    inp.addEventListener('change', function () { save({ name: inp.value || o.name }); });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.c) { save({ color: b.dataset.c, name: inp.value || o.name }); NE.closePop(); NDB.refreshAll(); }
      if (b.dataset.del) { var schema = JSON.parse(JSON.stringify(db.schema)); schema[key].options = schema[key].options.filter(function (y) { return y.id !== oid; }); NS.set(db.id, { schema: schema }); NE.closePop(); NDB.refreshAll(); }
    });
  }
  function personPicker(anchor, row, key, v) {
    var people = {};
    people[SN.ctx.email] = SN.ctx.name || SN.ctx.email;
    (NS.peersSeen || []).forEach(function (p) { people[p.user_email] = p.display_name || p.user_email; });
    NS.allPages().forEach(function (p) { if (p.by) people[p.by] = p.byName || p.by; });
    var el = NE.popAt(anchor, Object.keys(people).map(function (e) { return NE.mi('data-p="' + esc(e) + '"', (v || []).indexOf(e) >= 0 ? '✓' : '👤', people[e], e, '', true); }).join(''), { onClose: NDB.refreshAll });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-p]'); if (!b) return;
      var cur = (value(NS.page(row.id), key, NS.page(row.parent)) || []).slice(), i = cur.indexOf(b.dataset.p);
      if (i >= 0) cur.splice(i, 1); else cur.push(b.dataset.p);
      setValue(NS.page(row.id), key, cur);
      NE.closePop();
    });
  }

  /* ---------------------------------------------------------- properti */
  function addProp(anchor, db) {
    var el = NE.popAt(anchor, '<div class="n-pop-h">' + esc(SN.t('n_prop_type')) + '</div>' + PTYPES.map(function (t) { return NE.mi('data-t="' + t[0] + '"', t[1], SN.t('n_pt_' + t[0]), '', '', true); }).join(''));
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]'); if (!b) return;
      NE.closePop();
      var key = 'p' + Math.random().toString(36).slice(2, 8), schema = JSON.parse(JSON.stringify(db.schema));
      schema[key] = { name: SN.t('n_pt_' + b.dataset.t), type: b.dataset.t };
      if (/select|multi|status/.test(b.dataset.t)) schema[key].options = b.dataset.t === 'status' ? [{ id: 'o1', name: SN.t('n_st_todo'), color: 'gray' }, { id: 'o2', name: SN.t('n_st_doing'), color: 'blue' }, { id: 'o3', name: SN.t('n_st_done'), color: 'green' }] : [];
      NS.set(db.id, { schema: schema, propOrder: schemaKeys(db).concat([key]) });
      NDB.refreshAll();
    });
  }
  function propMenu(anchor, db, key, view) {
    var p = db.schema[key];
    var el = NE.popAt(anchor, '<input class="n-pop-in" value="' + esc(p.name) + '">' +
      (key !== 'title' ? '<div class="n-pop-h">' + esc(SN.t('n_prop_type')) + '</div>' + PTYPES.map(function (t) { return NE.mi('data-t="' + t[0] + '"', p.type === t[0] ? '✓' : t[1], SN.t('n_pt_' + t[0]), '', '', true); }).join('') : '') +
      (p.type === 'number' ? '<div class="n-pop-h">' + esc(SN.t('n_num_fmt')) + '</div>' + ['plain', 'idr', 'usd', 'pct'].map(function (f) { return NE.mi('data-fmt="' + f + '"', (p.fmt || 'plain') === f ? '✓' : '#', SN.t('n_fmt_' + f), '', '', true); }).join('') : '') +
      '<div class="n-sep"></div>' + NE.mi('data-s="asc"', '↑', SN.t('n_sort_asc'), '', '', true) + NE.mi('data-s="desc"', '↓', SN.t('n_sort_desc'), '', '', true) + NE.mi('data-hide="1"', '🙈', SN.t('n_hide'), '', '', true) +
      (key !== 'title' ? NE.mi('data-del="1"', '🗑', SN.t('n_delete_prop'), '', '', true) : ''));
    var inp = el.querySelector('input');
    inp.addEventListener('change', function () { var s = JSON.parse(JSON.stringify(db.schema)); s[key].name = inp.value || p.name; NS.set(db.id, { schema: s }); NDB.refreshAll(); });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var s = JSON.parse(JSON.stringify(db.schema));
      if (b.dataset.t) { s[key].type = b.dataset.t; if (/select|multi|status/.test(b.dataset.t) && !s[key].options) s[key].options = []; NS.set(db.id, { schema: s }); }
      if (b.dataset.fmt) { s[key].fmt = b.dataset.fmt; NS.set(db.id, { schema: s }); }
      if (b.dataset.s) { view.sorts = [{ prop: key, dir: b.dataset.s }]; saveView(db, view); }
      if (b.dataset.hide) { view.hidden = Object.assign({}, view.hidden); view.hidden[key] = 1; saveView(db, view); }
      if (b.dataset.del) { delete s[key]; NS.set(db.id, { schema: s, propOrder: (db.propOrder || []).filter(function (k) { return k !== key; }) }); }
      NE.closePop(); NDB.refreshAll();
    });
  }
  /** Panel properti di atas halaman baris. */
  NDB.renderProps = function (box, row, db) {
    var keys = schemaKeys(db).filter(function (k) { return k !== 'title'; });
    var ed = !NS.readonly && !db.locked;
    box.innerHTML = keys.map(function (k) { var p = db.schema[k]; return '<div class="n-prop"><div class="n-prop-k" data-pk="' + k + '">' + ((PTYPES.find(function (t) { return t[0] === p.type; }) || ['', '≡'])[1]) + ' ' + esc(p.name) + '</div><div class="n-prop-v ndb-cell" data-k="' + k + '">' + (display(db, k, row) || '<span style="color:var(--n-faint)">' + esc(SN.t('n_empty')) + '</span>') + '</div></div>'; }).join('') +
      (ed ? '<button class="ndb-add" data-addprop style="width:auto">＋ ' + esc(SN.t('n_add_prop')) + '</button>' : '');
    box.onclick = function (e) {
      if (!ed) return;
      if (e.target.closest('[data-addprop]')) { addProp(e.target.closest('[data-addprop]'), db); return; }
      var pk = e.target.closest('[data-pk]'); if (pk) { propMenu(pk, db, pk.dataset.pk, (db.views || [])[0] || { id: 'v1', type: 'table' }); return; }
      if (e.target.closest('a[href]')) return;
      var c = e.target.closest('.ndb-cell'); if (!c) return;
      var r = NS.page(row.id);
      if (e.target.matches('[data-cb]')) { setValue(r, c.dataset.k, e.target.checked); return; }
      editCell(c, NS.page(db.id), r, c.dataset.k);
    };
  };

  /* ---------------------------------------------------------- board */
  function board(body, db, view, list, ed) {
    var key = view.groupBy && db.schema[view.groupBy] ? view.groupBy : schemaKeys(db).find(function (k) { return /select|status/.test(db.schema[k].type); });
    if (!key) { body.innerHTML = '<div class="nb-ph" data-grp>' + esc(SN.t('n_board_need')) + '</div>'; body.onclick = function () { addProp(body.firstChild, db); }; return; }
    var cols = [{ id: '', name: SN.t('n_no_value'), color: 'gray' }].concat(db.schema[key].options || []);
    var cardProps = schemaKeys(db).filter(function (k) { return k !== 'title' && k !== key && !(view.hidden || {})[k]; });
    body.innerHTML = '<div class="ndb-board">' + cols.map(function (c) {
      var items = list.filter(function (r) { return (value(r, key, db) || '') === c.id; });
      if (!c.id && !items.length) return '';
      return '<div class="ndb-col" data-col="' + c.id + '"><div class="ndb-col-h">' + (c.id ? tag(c, db.schema[key].type === 'status') : '<span class="ndb-tag">' + esc(c.name) + '</span>') + '<small>' + items.length + '</small></div>' +
        items.map(function (r) { return '<div class="ndb-card" data-row="' + r.id + '" draggable="' + ed + '"><b>' + (r.icon ? esc(r.icon) + ' ' : '') + esc(r.title || SN.t('n_untitled')) + '</b><div class="ndb-card-props">' + cardProps.map(function (k) { return display(db, k, r); }).filter(Boolean).join(' ') + '</div></div>'; }).join('') +
        (ed ? '<button class="ndb-add" data-add="' + c.id + '">＋ ' + esc(SN.t('n_new')) + '</button>' : '') + '</div>';
    }).join('') + '</div>';
    body.onclick = function (e) {
      var add = e.target.closest('[data-add]');
      if (add) { var props = {}; props[key] = add.dataset.add; var id = newRow(db, view, props); NDB.refreshAll(); NS.emit('peek', id); return; }
      var card = e.target.closest('[data-row]'); if (card) NS.emit('peek', card.dataset.row);
    };
    var dragId = null;
    body.addEventListener('dragstart', function (e) { var c = e.target.closest('[data-row]'); if (c) { dragId = c.dataset.row; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); } });
    body.addEventListener('dragover', function (e) { var col = e.target.closest('.ndb-col'); if (col && dragId) { e.preventDefault(); body.querySelectorAll('.drop-in').forEach(function (x) { x.classList.remove('drop-in'); }); col.classList.add('drop-in'); } });
    body.addEventListener('drop', function (e) { var col = e.target.closest('.ndb-col'); if (col && dragId) { e.preventDefault(); setValue(NS.page(dragId), key, col.dataset.col); dragId = null; NDB.refreshAll(); } });
    body.addEventListener('dragend', function () { dragId = null; body.querySelectorAll('.drop-in').forEach(function (x) { x.classList.remove('drop-in'); }); });
  }

  /* ---------------------------------------------------------- list & galeri */
  function listView(body, db, view, list, ed) {
    var props = schemaKeys(db).filter(function (k) { return k !== 'title' && !(view.hidden || {})[k]; }).slice(0, 4);
    body.innerHTML = list.map(function (r) { return '<div class="ndb-list-row" data-row="' + r.id + '"><span>' + esc(NS.icon(r)) + '</span><span class="t">' + esc(r.title || SN.t('n_untitled')) + '</span>' + props.map(function (k) { return display(db, k, r); }).join(' ') + '</div>'; }).join('') +
      (ed ? '<button class="ndb-add" data-addrow>＋ ' + esc(SN.t('n_new')) + '</button>' : '');
    body.onclick = function (e) {
      if (e.target.closest('[data-addrow]')) { var id = newRow(db, view); NDB.refreshAll(); NS.emit('peek', id); return; }
      var r = e.target.closest('[data-row]'); if (r && !e.target.closest('a')) NS.emit('peek', r.dataset.row);
    };
  }
  function firstImage(pid) { var b = NS.blocks(pid, '').find(function (x) { return x.type === 'image' && x.src; }); return b ? b.src : ''; }
  function gallery(body, db, view, list, ed) {
    var props = schemaKeys(db).filter(function (k) { return k !== 'title' && !(view.hidden || {})[k]; }).slice(0, 3);
    body.innerHTML = '<div class="ndb-gallery">' + list.map(function (r) {
      var img = r.cover && /^data:|^https?:/.test(r.cover) ? r.cover : firstImage(r.id);
      return '<div class="ndb-gcard" data-row="' + r.id + '"><div class="ndb-gcover" style="' + (img ? 'background-image:url(&quot;' + esc(img) + '&quot;)' : r.cover ? 'background:' + esc(r.cover) : '') + '">' + (img ? '' : esc(NS.icon(r))) + '</div><div><b>' + esc(r.title || SN.t('n_untitled')) + '</b><div class="ndb-card-props">' + props.map(function (k) { return display(db, k, r); }).join(' ') + '</div></div></div>';
    }).join('') + (ed ? '<div class="ndb-gcard" data-addrow style="display:grid;place-items:center;min-height:170px;color:var(--n-faint)">＋ ' + esc(SN.t('n_new')) + '</div>' : '') + '</div>';
    body.onclick = function (e) {
      if (e.target.closest('[data-addrow]')) { var id = newRow(db, view); NDB.refreshAll(); NS.emit('peek', id); return; }
      var r = e.target.closest('[data-row]'); if (r) NS.emit('peek', r.dataset.row);
    };
  }

  /* ---------------------------------------------------------- kalender */
  function calendar(body, db, view, list, ed) {
    var key = view.dateBy && db.schema[view.dateBy] ? view.dateBy : schemaKeys(db).find(function (k) { return db.schema[k].type === 'date'; });
    if (!key) { body.innerHTML = '<div class="nb-ph">' + esc(SN.t('n_cal_need')) + '</div>'; body.onclick = function () { addProp(body.firstChild, db); }; return; }
    var base = body._month || new Date(); base = new Date(base.getFullYear(), base.getMonth(), 1);
    var start = new Date(base); start.setDate(1 - ((base.getDay() + 6) % 7));
    var todayIso = new Date().toISOString().slice(0, 10);
    var locale = SN.lang === 'id' ? 'id-ID' : 'en-US';
    var dows = []; for (var i = 0; i < 7; i++) { var dd = new Date(2024, 0, 1 + i); dows.push(dd.toLocaleDateString(locale, { weekday: 'short' })); }
    var cells = '';
    for (var d = 0; d < 42; d++) {
      var day = new Date(start); day.setDate(start.getDate() + d);
      var iso = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
      var evs = list.filter(function (r) { return String(value(r, key, db) || '').slice(0, 10) === iso; });
      cells += '<div class="day' + (day.getMonth() !== base.getMonth() ? ' is-out' : '') + (iso === todayIso ? ' is-today' : '') + '" data-day="' + iso + '"><span class="dn">' + day.getDate() + '</span>' + (ed ? '<button class="add" data-addday="' + iso + '">＋</button>' : '') +
        evs.map(function (r) { return '<span class="ev" data-row="' + r.id + '">' + esc(r.title || SN.t('n_untitled')) + '</span>'; }).join('') + '</div>';
    }
    body.innerHTML = '<div class="ndb-cal-h"><button class="n-ib" data-m="-1">‹</button><span>' + esc(base.toLocaleDateString(locale, { month: 'long', year: 'numeric' })) + '</span><button class="n-ib" data-m="1">›</button><button class="n-btn" data-m="0" style="margin-left:auto">' + esc(SN.t('n_today')) + '</button></div>' +
      '<div class="ndb-cal">' + dows.map(function (w) { return '<div class="dow">' + esc(w) + '</div>'; }).join('') + cells + '</div>';
    body.onclick = function (e) {
      var m = e.target.closest('[data-m]');
      if (m) { var x = +m.dataset.m; body._month = x ? new Date(base.getFullYear(), base.getMonth() + x, 1) : new Date(); calendar(body, db, view, list, ed); return; }
      var add = e.target.closest('[data-addday]');
      if (add) { var props = {}; props[key] = add.dataset.addday; var id = newRow(db, view, props); NDB.refreshAll(); NS.emit('peek', id); return; }
      var r = e.target.closest('[data-row]'); if (r) NS.emit('peek', r.dataset.row);
    };
  }

  /* ---------------------------------------------------------- menu tampilan */
  function addView(anchor, db, host, o) {
    var el = NE.popAt(anchor, VTYPES.map(function (t) { return NE.mi('data-v="' + t[0] + '"', t[1], SN.t('n_view_' + t[0]), '', '', true); }).join(''));
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]'); if (!b) return;
      NE.closePop();
      var v = { id: 'v' + Math.random().toString(36).slice(2, 7), name: SN.t('n_view_' + b.dataset.v), type: b.dataset.v };
      if (v.type === 'board') v.groupBy = schemaKeys(db).find(function (k) { return /select|status/.test(db.schema[k].type); });
      if (v.type === 'calendar') v.dateBy = schemaKeys(db).find(function (k) { return db.schema[k].type === 'date'; });
      NS.set(db.id, { views: (db.views || []).concat([v]) });
      SN.store.set('ndb_view_' + db.id, v.id);
      NDB.render(host, db.id, o);
    });
  }
  function viewMenu(anchor, db, view, host, o) {
    var el = NE.popAt(anchor, '<input class="n-pop-in" value="' + esc(view.name) + '">' + '<div class="n-pop-h">' + esc(SN.t('n_layout')) + '</div>' + VTYPES.map(function (t) { return NE.mi('data-v="' + t[0] + '"', view.type === t[0] ? '✓' : t[1], SN.t('n_view_' + t[0]), '', '', true); }).join('') +
      '<div class="n-sep"></div>' + NE.mi('data-dup="1"', '⧉', SN.t('n_duplicate'), '', '', true) + ((db.views || []).length > 1 ? NE.mi('data-del="1"', '🗑', SN.t('n_delete_view'), '', '', true) : ''));
    var inp = el.querySelector('input');
    inp.addEventListener('change', function () { view.name = inp.value || view.name; saveView(db, view); NDB.render(host, db.id, o); });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      NE.closePop();
      if (b.dataset.v) { view.type = b.dataset.v; if (view.type === 'board' && !view.groupBy) view.groupBy = schemaKeys(db).find(function (k) { return /select|status/.test(db.schema[k].type); }); if (view.type === 'calendar' && !view.dateBy) view.dateBy = schemaKeys(db).find(function (k) { return db.schema[k].type === 'date'; }); saveView(db, view); }
      if (b.dataset.dup) { var v = JSON.parse(JSON.stringify(view)); v.id = 'v' + Math.random().toString(36).slice(2, 7); v.name += ' 2'; delete v._q; NS.set(db.id, { views: (db.views || []).concat([v]) }); SN.store.set('ndb_view_' + db.id, v.id); }
      if (b.dataset.del) NS.set(db.id, { views: (db.views || []).filter(function (v) { return v.id !== view.id; }) });
      NDB.render(host, db.id, o);
    });
  }
  function toolMenu(anchor, tool, db, view, host, o) {
    var keys = schemaKeys(db);
    if (tool === 'new') { var id = newRow(db, view); NDB.refreshAll(); NS.emit('peek', id); return; }
    if (tool === 'filter' || tool === 'sort') {
      var list = JSON.parse(JSON.stringify(view[tool === 'filter' ? 'filters' : 'sorts'] || []));
      var ops = ['contains', 'is', 'not', 'empty', 'notempty', 'gt', 'lt', 'checked', 'unchecked'];
      var paint = function () {
        return list.map(function (f, i) {
          return '<div class="ndb-filter-row" data-i="' + i + '"><select data-f="prop">' + keys.map(function (k) { return '<option value="' + k + '"' + (k === f.prop ? ' selected' : '') + '>' + esc(db.schema[k].name) + '</option>'; }).join('') + '</select>' +
            (tool === 'filter' ? '<select data-f="op">' + ops.map(function (op) { return '<option value="' + op + '"' + (op === f.op ? ' selected' : '') + '>' + esc(SN.t('n_op_' + op)) + '</option>'; }).join('') + '</select>' + (/empty|checked/.test(f.op) ? '' : '<input data-f="val" value="' + esc(f.val || '') + '" style="width:110px">')
              : '<select data-f="dir"><option value="asc"' + (f.dir !== 'desc' ? ' selected' : '') + '>' + esc(SN.t('n_sort_asc')) + '</option><option value="desc"' + (f.dir === 'desc' ? ' selected' : '') + '>' + esc(SN.t('n_sort_desc')) + '</option></select>') +
            '<button class="n-ib" data-rm="' + i + '">✕</button></div>';
        }).join('') + NE.mi('data-add="1"', '＋', SN.t(tool === 'filter' ? 'n_add_filter' : 'n_add_sort'), '', '', true);
      };
      var el = NE.popAt(anchor, paint(), { onClose: function () { view[tool === 'filter' ? 'filters' : 'sorts'] = list; saveView(db, view); NDB.render(host, db.id, o); } });
      el.style.maxWidth = '460px';
      el.addEventListener('change', function (e) { var r = e.target.closest('[data-i]'); if (!r) return; list[+r.dataset.i][e.target.dataset.f] = e.target.value; if (e.target.dataset.f === 'op') { el.innerHTML = paint(); } });
      el.addEventListener('input', function (e) { var r = e.target.closest('[data-i]'); if (r && e.target.dataset.f === 'val') list[+r.dataset.i].val = e.target.value; });
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.add) list.push(tool === 'filter' ? { prop: keys[0], op: 'contains', val: '' } : { prop: keys[0], dir: 'asc' });
        if (b.dataset.rm) list.splice(+b.dataset.rm, 1);
        el.innerHTML = paint();
      });
      return;
    }
    if (tool === 'view') {
      var grp = keys.filter(function (k) { return /select|status/.test(db.schema[k].type); });
      var dates = keys.filter(function (k) { return db.schema[k].type === 'date'; });
      var el2 = NE.popAt(anchor, '<div class="n-pop-h">' + esc(SN.t('n_props_shown')) + '</div>' + keys.filter(function (k) { return k !== 'title'; }).map(function (k) { return NE.mi('data-h="' + k + '"', (view.hidden || {})[k] ? '○' : '●', db.schema[k].name, '', '', true); }).join('') +
        (view.type === 'board' ? '<div class="n-pop-h">' + esc(SN.t('n_group_by')) + '</div>' + grp.map(function (k) { return NE.mi('data-g="' + k + '"', view.groupBy === k ? '✓' : '◉', db.schema[k].name, '', '', true); }).join('') : '') +
        (view.type === 'calendar' ? '<div class="n-pop-h">' + esc(SN.t('n_date_by')) + '</div>' + dates.map(function (k) { return NE.mi('data-d="' + k + '"', view.dateBy === k ? '✓' : '📅', db.schema[k].name, '', '', true); }).join('') : '') +
        '<div class="n-sep"></div>' + NE.mi('data-csv="1"', '⬇', SN.t('n_export_csv'), '', '', true) + (o.inline ? NE.mi('data-full="1"', '↗', SN.t('n_open_full'), '', '', true) : '') +
        NE.mi('data-lock="1"', db.locked ? '🔓' : '🔒', SN.t(db.locked ? 'n_unlock' : 'n_lock'), '', '', true));
      el2.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        NE.closePop();
        if (b.dataset.h) { view.hidden = Object.assign({}, view.hidden); if (view.hidden[b.dataset.h]) delete view.hidden[b.dataset.h]; else view.hidden[b.dataset.h] = 1; saveView(db, view); }
        if (b.dataset.g) { view.groupBy = b.dataset.g; saveView(db, view); }
        if (b.dataset.d) { view.dateBy = b.dataset.d; saveView(db, view); }
        if (b.dataset.csv) NDB.exportCsv(db);
        if (b.dataset.full) NS.emit('go', db.id);
        if (b.dataset.lock) NS.set(db.id, { locked: !db.locked });
        NDB.render(host, db.id, o);
      });
    }
  }
  NDB.exportCsv = function (db) {
    var keys = schemaKeys(db);
    var cell = function (s) { s = String(s == null ? '' : s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    var plain = function (k, r) { var d = document.createElement('div'); d.innerHTML = display(db, k, r); if (db.schema[k].type === 'checkbox') return value(r, k, db) ? 'true' : 'false'; return d.textContent; };
    var csv = [keys.map(function (k) { return cell(db.schema[k].name); }).join(',')].concat(rows(db).map(function (r) { return keys.map(function (k) { return cell(plain(k, r)); }).join(','); })).join('\n');
    SN.saveFile(NS.title(db) + '.csv', new Blob(['﻿' + csv], { type: 'text/csv' }));
  };
})(window);
