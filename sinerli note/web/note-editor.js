/* Sinerli Note — Copyright © 2026 Gadtan x Gallen. All rights reserved.
 * NE — editor halaman berbasis blok: setiap blok punya area teks sendiri
 * (contenteditable), dirender ulang secara terarah (diff per blok) supaya
 * perubahan dari kolaborator tidak memindahkan kursor kita. */
(function (global) {
  'use strict';
  var doc = document;
  var NE = global.NE = { pid: null, root: null };
  var esc = SN.esc;

  /* ====================================================== katalog blok */
  NE.TYPES = [
    { id: 'text', icon: 'Aa', k: 'text teks paragraf plain' },
    { id: 'h1', icon: 'H1', k: 'h1 heading judul besar #' },
    { id: 'h2', icon: 'H2', k: 'h2 heading judul sedang ##' },
    { id: 'h3', icon: 'H3', k: 'h3 heading judul kecil ###' },
    { id: 'bullet', icon: '•', k: 'bullet list daftar poin -' },
    { id: 'number', icon: '1.', k: 'number numbered list daftar nomor urut' },
    { id: 'todo', icon: '☑', k: 'todo to-do checkbox centang tugas []' },
    { id: 'toggle', icon: '▸', k: 'toggle lipat collapse dropdown' },
    { id: 'quote', icon: '❝', k: 'quote kutipan' },
    { id: 'callout', icon: '💡', k: 'callout info catatan sorotan' },
    { id: 'code', icon: '</>', k: 'code kode snippet program' },
    { id: 'divider', icon: '—', k: 'divider pembatas garis hr' },
    { id: 'page', icon: '📄', k: 'page halaman sub subpage' },
    { id: 'db', icon: '▦', k: 'database tabel table board kanban basis data' },
    { id: 'table', icon: '⊞', k: 'table tabel sederhana grid' },
    { id: 'image', icon: '🖼', k: 'image gambar foto picture' },
    { id: 'bookmark', icon: '🔗', k: 'bookmark tautan link web url' },
    { id: 'video', icon: '▶', k: 'video youtube embed' },
    { id: 'equation', icon: 'Σ', k: 'equation persamaan math rumus latex katex' },
    { id: 'cols2', icon: '▥', k: 'columns kolom 2 dua' },
    { id: 'cols3', icon: '▥', k: 'columns kolom 3 tiga' },
    { id: 'toc', icon: '☰', k: 'toc daftar isi table of contents' },
    { id: 'date', icon: '📅', k: 'date tanggal hari ini today now' },
    { id: 'mention', icon: '↗', k: 'mention link page tautan halaman @' }
  ];
  var TEXTUAL = { text: 1, h1: 1, h2: 1, h3: 1, bullet: 1, number: 1, todo: 1, toggle: 1, quote: 1, callout: 1, code: 1 };
  var CONVERTIBLE = ['text', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'toggle', 'quote', 'callout', 'code'];
  var COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
  NE.COLORS = COLORS;
  var LANGS = ['plain', 'javascript', 'typescript', 'python', 'php', 'java', 'kotlin', 'swift', 'c', 'cpp', 'csharp', 'go', 'rust', 'ruby', 'sql', 'html', 'css', 'json', 'yaml', 'bash', 'markdown'];

  /* ====================================================== util teks */
  var ALLOWED = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, DEL: 1, CODE: 1, A: 1, SPAN: 1, BR: 1, MARK: 1, SUB: 1, SUP: 1 };
  NE.clean = function (html) {
    var box = doc.createElement('div');
    box.innerHTML = html;
    (function walk(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (c) {
        if (c.nodeType === 3) return;
        if (c.nodeType !== 1) { c.remove(); return; }
        walk(c);
        var tag = c.tagName;
        if (tag === 'FONT') { var s = doc.createElement('span'); if (c.color) s.style.color = c.color; s.innerHTML = c.innerHTML; c.replaceWith(s); c = s; tag = 'SPAN'; }
        if (tag === 'DIV' || tag === 'P') { c.insertAdjacentHTML('beforebegin', c.previousSibling ? '<br>' : ''); c.replaceWith.apply(c, Array.prototype.slice.call(c.childNodes)); return; }
        if (!ALLOWED[tag]) { c.replaceWith.apply(c, Array.prototype.slice.call(c.childNodes)); return; }
        Array.prototype.slice.call(c.attributes).forEach(function (a) {
          var ok = (tag === 'A' && (a.name === 'href' || a.name === 'data-page' || a.name === 'class' || a.name === 'contenteditable')) ||
            (tag === 'SPAN' && (a.name === 'style' || a.name === 'class' || a.name === 'data-date' || a.name === 'contenteditable'));
          if (!ok) c.removeAttribute(a.name);
        });
        if (tag === 'A' && c.getAttribute('href') && !/^(https?:|mailto:|#)/i.test(c.getAttribute('href'))) c.removeAttribute('href');
        if (tag === 'SPAN' && c.getAttribute('style')) {
          var st = c.style, keep = [];
          if (st.color) keep.push('color:' + st.color);
          if (st.backgroundColor) keep.push('background-color:' + st.backgroundColor);
          if (keep.length) c.setAttribute('style', keep.join(';')); else c.removeAttribute('style');
        }
      });
    })(box);
    var out = box.innerHTML.replace(/(<br>)+$/, '');
    return out === '<br>' ? '' : out;
  };
  function textOf(html) { var d = doc.createElement('div'); d.innerHTML = html || ''; return d.textContent; }
  NE.textOf = textOf;

  function caretOffset(el) {
    var sel = getSelection();
    if (!sel.rangeCount || !el.contains(sel.anchorNode)) return -1;
    var r = sel.getRangeAt(0).cloneRange();
    r.selectNodeContents(el);
    r.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    return r.toString().length;
  }
  function setCaret(el, off) {
    el.focus();
    var sel = getSelection(), r = doc.createRange();
    if (off == null || off < 0) { r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); return; }
    var walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT), n, left = off;
    while ((n = walker.nextNode())) {
      if (left <= n.length) { r.setStart(n, left); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); return; }
      left -= n.length;
    }
    r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r);
  }
  NE.setCaret = setCaret;
  function atStart(el) { var s = getSelection(); return s.isCollapsed && caretOffset(el) === 0; }
  function atEnd(el) { var s = getSelection(); return s.isCollapsed && caretOffset(el) === el.textContent.length; }
  function splitAtCaret(el) {
    var sel = getSelection(), r = sel.getRangeAt(0);
    r.deleteContents();
    var after = doc.createRange();
    after.selectNodeContents(el);
    after.setStart(r.endContainer, r.endOffset);
    var frag = after.extractContents(), box = doc.createElement('div');
    box.appendChild(frag);
    return [NE.clean(el.innerHTML), NE.clean(box.innerHTML)];
  }
  function onFirstLine(el) {
    var s = getSelection(); if (!s.rangeCount) return true;
    var r = s.getRangeAt(0).getClientRects()[0], b = el.getBoundingClientRect();
    return !r || r.top - b.top < 18;
  }
  function onLastLine(el) {
    var s = getSelection(); if (!s.rangeCount) return true;
    var r = s.getRangeAt(0).getClientRects()[0], b = el.getBoundingClientRect();
    return !r || b.bottom - r.bottom < 18;
  }
  function caretRect() {
    var s = getSelection(); if (!s.rangeCount) return null;
    var r = s.getRangeAt(0).cloneRange(); r.collapse(true);
    var rect = r.getClientRects()[0];
    if (!rect) { var n = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode); rect = n && n.getBoundingClientRect(); }
    return rect;
  }

  /* ====================================================== pop umum */
  var pop = null;
  NE.closePop = function () { if (pop) { pop.el.remove(); if (pop.onClose) pop.onClose(); pop = null; } };
  NE.pop = function (x, y, html, opt) {
    NE.closePop();
    var el = SN.el('div', { class: 'n-pop', role: 'menu' }, html);
    doc.body.appendChild(el);
    var w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
    el.style.top = (y + h > innerHeight - 8 ? Math.max(8, y - h - (opt && opt.above || 28)) : y) + 'px';
    el.addEventListener('mousedown', function (e) { if (!e.target.closest('input, textarea, select')) e.preventDefault(); });
    pop = { el: el, onClose: opt && opt.onClose };
    return el;
  };
  NE.popAt = function (anchor, html, opt) { var r = anchor.getBoundingClientRect(); return NE.pop(r.left, r.bottom + 4, html, opt); };
  NE.isPopOpen = function () { return !!pop; };
  doc.addEventListener('mousedown', function (e) { if (pop && !pop.el.contains(e.target)) NE.closePop(); });
  NE.mi = function (attrs, icon, label, sub, kbd, small) {
    return '<button class="n-mi' + (small ? ' is-small' : '') + '" ' + attrs + '><span class="n-mi-ic">' + icon + '</span><span><b>' + esc(label) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' + (kbd ? '<kbd>' + esc(kbd) + '</kbd>' : '') + '</button>';
  };

  /* ====================================================== render halaman */
  var nodes = {};        // id blok → elemen .nb
  var dirtyText = {};    // id blok → elemen teks yang belum dikomit
  var commitTimer = {};

  NE.render = function (container, pid, opt) {
    opt = opt || {};
    var p = NS.page(pid);
    NE.pid = pid;
    nodes = {};
    container.innerHTML = '';
    if (!p) return;
    var page = SN.el('div', { class: 'n-page' + (p.full ? ' is-full' : '') + (p.font ? ' f-' + p.font : '') + (p.small ? ' is-small' : '') });
    if (p.cover) {
      var cov = SN.el('div', { class: 'n-cover' });
      cov.style.background = /^(data:|https?:)/.test(p.cover) ? 'center / cover url("' + p.cover.replace(/"/g, '%22') + '")' : p.cover;
      cov.innerHTML = '<div class="n-cover-acts"><button data-a="cover">' + esc(SN.t('n_change_cover')) + '</button><button data-a="uncover">' + esc(SN.t('n_remove')) + '</button></div>';
      container.appendChild(cov);
      container.classList.add('n-has-cover');
      cov.addEventListener('click', function (e) {
        var a = e.target.closest('[data-a]'); if (!a) return;
        if (a.getAttribute('data-a') === 'uncover') { NS.set(pid, { cover: '' }); NE.render(container, pid, opt); }
        else NE.coverPicker(a, function (c) { NS.set(pid, { cover: c }); NE.render(container, pid, opt); });
      });
    } else container.classList.remove('n-has-cover');
    var head = SN.el('div', { class: 'n-head' });
    head.innerHTML = (p.icon ? '<button class="n-icon" data-a="icon">' + esc(p.icon) + '</button>' : '') +
      '<div class="n-head-acts">' + (p.icon ? '' : '<button data-a="icon">☺ ' + esc(SN.t('n_add_icon')) + '</button>') +
      (p.cover ? '' : '<button data-a="cover">▨ ' + esc(SN.t('n_add_cover')) + '</button>') +
      '<button data-a="comment">💬 ' + esc(SN.t('n_add_comment')) + '</button></div>' +
      '<div class="n-title" contenteditable="' + (NE.editable(p) ? 'plaintext-only' : 'false') + '" spellcheck="true" data-ph="' + esc(SN.t('n_untitled')) + '">' + esc(p.title || '') + '</div>';
    page.appendChild(head);
    var title = head.querySelector('.n-title');
    title.addEventListener('input', function () { NS.set(pid, { title: title.textContent.replace(/\n/g, ' ') }, true); NS.emit('title', pid); });
    title.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var first = NS.blocks(pid, '')[0];
        if (first && TEXTUAL[first.type] && !textOf(first.html)) focusBlock(first.id, 0);
        else { var id = NS.newBlock(pid, '', '', { type: 'text' }); NE.refresh(); focusBlock(id, 0); }
      }
      if (e.key === 'ArrowDown') { var b = NS.blocks(pid, '')[0]; if (b) { e.preventDefault(); focusBlock(b.id, 0); } }
    });
    head.addEventListener('click', function (e) {
      var a = e.target.closest('[data-a]'); if (!a) return;
      var act = a.getAttribute('data-a');
      if (act === 'icon') NE.iconPicker(a, function (ic) { NS.set(pid, { icon: ic }); NE.render(container, pid, opt); });
      if (act === 'cover') NE.coverPicker(a, function (c) { NS.set(pid, { cover: c }); NE.render(container, pid, opt); });
      if (act === 'comment') NS.emit('comment', { page: pid });
    });

    // Properti baris database
    var parent = NS.page(p.parent);
    if (parent && parent.isDb && global.NDB) { var pr = SN.el('div', { class: 'n-props' }); page.appendChild(pr); NDB.renderProps(pr, p, parent); }
    var meta = SN.el('div', { class: 'n-meta' });
    if (p.edited) meta.textContent = SN.t('n_edited_by', { who: p.ebyName || p.eby || '', when: NE.ago(p.edited) });
    page.appendChild(meta);

    if (p.isDb && global.NDB) { var dbw = SN.el('div'); page.appendChild(dbw); NDB.render(dbw, pid, { full: true }); }

    var blocks = SN.el('div', { class: 'n-blocks' });
    page.appendChild(blocks);
    NE.root = blocks;
    renderList(blocks, pid, '');
    if (!p.isDb) {
      var add = SN.el('div', { class: 'n-addline' });
      add.addEventListener('click', function () {
        if (!NE.editable(p)) return;
        var list = NS.blocks(pid, ''), last = list[list.length - 1];
        if (last && last.type === 'text' && !textOf(last.html)) { focusBlock(last.id); return; }
        var id = NS.newBlock(pid, '', null, { type: 'text' }); NE.refresh(); focusBlock(id, 0);
      });
      page.appendChild(add);
      if (!NS.blocks(pid, '').length && !p.title && opt.templates) page.appendChild(opt.templates(pid));
    }
    var bl = NS.backlinks(pid);
    if (bl.length) {
      var bx = SN.el('div', { class: 'n-backlinks' });
      bx.innerHTML = '<div>' + esc(SN.t('n_backlinks', { n: bl.length })) + '</div>' + bl.map(function (x) { return '<a data-go="' + x.id + '">' + esc(NS.icon(x)) + ' ' + esc(NS.title(x)) + '</a>'; }).join('');
      page.appendChild(bx);
    }
    container.appendChild(page);
    NE.container = container;
    NE.opt = opt;
    if (!p.title && !NS.blocks(pid, '').length && NE.editable(p)) setTimeout(function () { title.focus(); }, 30);
  };
  NE.editable = function (p) { return !NS.readonly && !(p && p.locked); };
  NE.ago = function (t) {
    var s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return SN.t('n_just_now');
    if (s < 3600) return SN.t('n_min_ago', { n: Math.round(s / 60) });
    if (s < 86400) return SN.t('n_hour_ago', { n: Math.round(s / 3600) });
    return new Date(t).toLocaleDateString(SN.lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  /** Render ulang daftar blok (diff per id). Dipanggil setelah perubahan lokal maupun kolaborator. */
  NE.refresh = function () {
    if (!NE.root || !NS.page(NE.pid)) return;
    renderList(NE.root, NE.pid, '');
    numberLists(NE.root);
    NE.root.querySelectorAll('.nb.t-toc').forEach(function (n) { fillToc(n); });
  };
  function sig(b) { return JSON.stringify([b.type, b.html, b.checked, b.open, b.color, b.bg, b.lang, b.src, b.url, b.caption, b.rows, b.ref, b.icon, b.tex, b.title, b.cmts]); }
  function renderList(box, pid, parent) {
    var list = NS.blocks(pid, parent), seen = {};
    var prev = null;
    list.forEach(function (b) {
      seen[b.id] = 1;
      var n = nodes[b.id];
      if (!n) { n = build(b); nodes[b.id] = n; }
      else if (n._sig !== sig(b)) update(n, b);
      var want = prev ? prev.nextSibling : box.firstChild;
      if (want !== n) box.insertBefore(n, want);
      prev = n;
      if (b.type !== 'divider') renderList(n.querySelector(':scope > .nb-children'), pid, b.id);
    });
    Array.prototype.slice.call(box.children).forEach(function (c) { if (c.classList.contains('nb') && !seen[c.dataset.id]) { c.remove(); if (nodes[c.dataset.id] === c) delete nodes[c.dataset.id]; } });
    if (parent === '') numberLists(box);
  }
  function numberLists(box) {
    var n = 0;
    Array.prototype.forEach.call(box.children, function (c) {
      if (c.classList.contains('t-number')) { n++; var m = c.querySelector(':scope > .nb-row > .nb-mark'); if (m) m.textContent = n + '.'; }
      else n = 0;
      var ch = c.querySelector(':scope > .nb-children'); if (ch) numberLists(ch);
    });
  }

  function build(b) {
    var n = SN.el('div', { class: 'nb', 'data-id': b.id });
    n.innerHTML = '<div class="nb-row"></div><div class="nb-children"></div>';
    update(n, b);
    return n;
  }
  function update(n, b) {
    var row = n.querySelector(':scope > .nb-row');
    var focused = row.querySelector('.nb-text') === doc.activeElement;
    var caret = focused ? caretOffset(doc.activeElement) : -1;
    var keepText = focused && dirtyText[b.id];
    var oldText = row.querySelector('.nb-text');
    n.className = 'nb t-' + b.type + (b.type === 'todo' && b.checked ? ' is-done' : '') + (b.type === 'toggle' && b.open ? ' is-open' : '');
    if (b.color && b.color !== 'default') { n.setAttribute('data-color', b.color); n.style.setProperty('--fg', 'var(--c-' + b.color + ')'); } else { n.removeAttribute('data-color'); n.style.removeProperty('--fg'); }
    if (b.bg && b.bg !== 'default' && b.type !== 'callout') { n.setAttribute('data-bg', b.bg); n.style.setProperty('--bg', 'var(--b-' + b.bg + ')'); } else { n.removeAttribute('data-bg'); n.style.removeProperty('--bg'); }
    var ed = NE.editable(NS.page(b.page));
    var gut = '<div class="nb-gut"><button class="nb-add" data-a="add" title="' + esc(SN.t('n_add_below')) + '">＋</button><button class="nb-drag" data-a="menu" draggable="false" title="' + esc(SN.t('n_drag_menu')) + '">⋮⋮</button></div>';
    var txt = function (ph) { return '<div class="nb-text" contenteditable="' + (ed ? 'true' : 'false') + '" spellcheck="true" data-ph="' + esc(ph) + '">' + (b.html || '') + '</div>'; };
    var mark = '';
    var body = '';
    switch (b.type) {
      case 'bullet': mark = '<div class="nb-mark"></div>'; body = txt(SN.t('n_ph_list')); break;
      case 'number': mark = '<div class="nb-mark">1.</div>'; body = txt(SN.t('n_ph_list')); break;
      case 'todo': mark = '<div class="nb-mark"><input type="checkbox" data-a="check"' + (b.checked ? ' checked' : '') + (ed ? '' : ' disabled') + '></div>'; body = txt(SN.t('n_ph_todo')); break;
      case 'toggle': mark = '<div class="nb-mark"><button data-a="toggle">▶</button></div>'; body = txt(SN.t('n_ph_toggle')); break;
      case 'callout': mark = '<div class="nb-mark" data-a="calloutIcon">' + esc(b.icon || '💡') + '</div>'; body = txt(SN.t('n_ph_callout')); break;
      case 'h1': case 'h2': case 'h3': body = txt(SN.t('n_ph_' + b.type)); break;
      case 'quote': body = txt(SN.t('n_ph_quote')); break;
      case 'code':
        body = '<button class="nb-code-lang" data-a="lang">' + esc(b.lang || 'plain') + ' ▾</button><button class="nb-code-copy" data-a="copy">' + esc(SN.t('n_copy_code')) + '</button>' +
          '<div class="nb-text" contenteditable="' + (ed ? 'plaintext-only' : 'false') + '" spellcheck="false" data-ph="' + esc(SN.t('n_ph_code')) + '">' + esc(textOf(b.html)) + '</div>';
        break;
      case 'divider': body = '<hr>'; break;
      case 'page': case 'dblink':
        var rp = NS.page(b.ref);
        if (b.type === 'dblink' && rp && rp.isDb) { body = '<div class="nb-dbhost" style="flex:1;min-width:0"></div>'; break; }
        body = '<div class="nb-text" data-go="' + esc(b.ref || '') + '">' + (rp ? esc(NS.icon(rp)) + ' ' + esc(NS.title(rp)) : '<span style="color:var(--n-faint)">' + esc(SN.t('n_page_missing')) + '</span>') + '</div>';
        break;
      case 'image':
        body = b.src ? '<figure><img src="' + esc(b.src) + '" alt="" loading="lazy"><figcaption contenteditable="' + ed + '" data-ph="' + esc(SN.t('n_caption')) + '">' + esc(b.caption || '') + '</figcaption></figure>'
          : '<div class="nb-ph" data-a="upload">🖼 ' + esc(SN.t('n_upload_image')) + '</div>';
        break;
      case 'video':
        var yt = ytId(b.url);
        body = yt ? '<figure><iframe class="nb-embed" src="https://www.youtube-nocookie.com/embed/' + esc(yt) + '" allowfullscreen loading="lazy"></iframe></figure>' : '<div class="nb-ph" data-a="url">▶ ' + esc(SN.t('n_embed_video')) + '</div>';
        break;
      case 'bookmark':
        body = b.url ? '<a href="' + esc(b.url) + '" target="_blank" rel="noopener"><b>' + esc(b.title || hostOf(b.url)) + '</b><small>' + esc(b.url) + '</small></a>' : '<div class="nb-ph" data-a="url">🔗 ' + esc(SN.t('n_add_bookmark')) + '</div>';
        break;
      case 'equation':
        body = '<div class="nb-eq" data-a="tex">' + renderTex(b.tex) + '</div>';
        break;
      case 'table':
        var rows = b.rows || [['', ''], ['', '']];
        body = '<div class="nb-tbl-wrap"><table class="nb-tbl"><tbody>' + rows.map(function (r, ri) { return '<tr>' + r.map(function (c, ci) { return '<td contenteditable="' + ed + '" data-r="' + ri + '" data-c="' + ci + '">' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' +
          (ed ? '<button class="nb-tbl-add" data-a="addRow">＋ ' + esc(SN.t('n_row')) + '</button><button class="nb-tbl-add" data-a="addCol">＋ ' + esc(SN.t('n_col')) + '</button>' : '') + '</div>';
        break;
      case 'toc': body = '<nav></nav>'; break;
      case 'cols': case 'col': body = ''; break;
      default: body = txt(SN.t('n_ph_text'));
    }
    var cm = b.cmts ? '<button class="nb-cmt-badge" data-a="cmts">💬 ' + b.cmts + '</button>' : '';
    if (keepText && oldText) {
      // Kolaborator mengubah blok yang sedang kita ketik: teks kita dipertahankan (akan dikomit dan menang LWW).
      row.querySelectorAll(':scope > :not(.nb-text)').forEach(function (x) { x.remove(); });
      row.insertAdjacentHTML('afterbegin', gut + mark);
      if (cm) row.insertAdjacentHTML('beforeend', cm);
    } else {
      row.innerHTML = gut + mark + body + cm;
      if (focused) { var t = row.querySelector('.nb-text'); if (t) setCaret(t, Math.min(caret, t.textContent.length)); }
    }
    if (b.type === 'dblink' && global.NDB) { var host = row.querySelector('.nb-dbhost'); if (host) NDB.render(host, b.ref, { inline: true }); }
    if (b.type === 'toc') fillToc(n);
    n._sig = sig(b);
  }
  function fillToc(n) {
    var nav = n.querySelector('nav'); if (!nav) return;
    var hs = NS.blocks(NE.pid, '').filter(function (b) { return /^h[123]$/.test(b.type); });
    nav.innerHTML = hs.length ? hs.map(function (h) { return '<a data-jump="' + h.id + '" style="padding-left:' + ((+h.type[1] - 1) * 16) + 'px">' + esc(textOf(h.html) || SN.t('n_untitled')) + '</a>'; }).join('') : '<span style="color:var(--n-faint)">' + esc(SN.t('n_toc_empty')) + '</span>';
  }
  function ytId(u) { var m = String(u || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/); return m ? m[1] : ''; }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } }
  function renderTex(tex) {
    if (!tex) return '<span style="color:var(--n-faint)">' + esc(SN.t('n_eq_ph')) + '</span>';
    if (global.katex) { try { return katex.renderToString(tex, { throwOnError: false, displayMode: true }); } catch (e) {} }
    return '<code>' + esc(tex) + '</code>';
  }

  /* ====================================================== fokus & navigasi */
  function focusBlock(id, off) {
    var n = nodes[id]; if (!n) return false;
    var t = n.querySelector(':scope > .nb-row .nb-text[contenteditable]:not([contenteditable=false])');
    if (!t) { selectBlocks([id]); return true; }
    setCaret(t, off == null ? -1 : off);
    n.scrollIntoView({ block: 'nearest' });
    return true;
  }
  NE.focusBlock = focusBlock;
  /** Urutan blok yang terlihat (dokumen, termasuk anak), untuk panah atas/bawah. */
  function visibleOrder() {
    var out = [];
    (function walk(parent) {
      NS.blocks(NE.pid, parent).forEach(function (b) {
        if (b.type !== 'cols' && b.type !== 'col') out.push(b);
        if (b.type === 'toggle' && !b.open) return;
        walk(b.id);
      });
    })('');
    return out;
  }
  function neighbor(id, dir) {
    var list = visibleOrder(), i = list.findIndex(function (b) { return b.id === id; });
    return list[i + dir] || null;
  }
  function blockOf(el) { var n = el.closest && el.closest('.nb'); return n ? NS.get(n.dataset.id) : null; }

  /* ====================================================== komit teks */
  function commit(id, el) {
    clearTimeout(commitTimer[id]);
    delete dirtyText[id];
    var b = NS.get(id); if (!b) return;
    var html = b.type === 'code' ? esc(el.textContent) : NE.clean(el.innerHTML);
    if (html !== (b.html || '')) NS.set(id, { html: html }, true);
    if (nodes[id]) nodes[id]._sig = sig(NS.get(id));
  }
  function scheduleCommit(id, el) {
    dirtyText[id] = el;
    clearTimeout(commitTimer[id]);
    commitTimer[id] = setTimeout(function () { commit(id, el); }, NS.room && NS.room.peers.length ? 50 : 220);   // ada kolaborator: kirim lebih cepat
  }
  NE.flush = function () { Object.keys(dirtyText).forEach(function (id) { commit(id, dirtyText[id]); }); };

  /* ====================================================== ubah blok */
  NE.convert = function (id, type, extra) {
    var b = NS.get(id); if (!b) return;
    NE.flush();
    var f = Object.assign({ type: type }, extra || {});
    if (type === 'code') f.html = esc(textOf(b.html));
    if (b.type === 'code' && type !== 'code') f.html = esc(textOf(b.html));
    if (type === 'toggle') f.open = true;
    NS.set(id, f, true);
    NE.refresh();
    focusBlock(id);
  };
  /** Sisipkan blok jenis apa pun (dari menu / dan +). Kembalikan id blok baru. */
  NE.insert = function (type, afterId, replaceEmpty) {
    var after = afterId ? NS.get(afterId) : null;
    var page = NE.pid, parent = after ? (after.parent || '') : '';
    if (after && after.type === 'col') { parent = after.id; after = null; }
    var target = null;
    if (replaceEmpty && after && TEXTUAL[after.type] && !textOf(after.html) && !NS.blocks(page, after.id).length) target = after.id;
    var mk = function (fields) {
      if (target) { NS.set(target, Object.assign({ html: '', checked: false }, fields), true); return target; }
      return NS.newBlock(page, parent, after ? after.id : null, fields);
    };
    var id;
    switch (type) {
      case 'page': id = mk({ type: 'page', ref: NS.newPage(page, { title: '' }) }); NE.refresh(); NS.emit('tree'); NS.emit('go', NS.get(id).ref); return id;
      case 'db': var db = NS.newPage(page, NS.dbTemplate('blank')); id = mk({ type: 'dblink', ref: db }); NS.emit('tree'); break;
      case 'cols2': case 'cols3':
        id = mk({ type: 'cols' });
        for (var i = 0; i < (type === 'cols2' ? 2 : 3); i++) { var c = NS.newBlock(page, id, null, { type: 'col' }); NS.newBlock(page, c, null, { type: 'text' }); }
        break;
      case 'date': return NE.insertInline('<span class="nd" contenteditable="false" data-date="' + new Date().toISOString().slice(0, 10) + '">@' + esc(new Date().toLocaleDateString(SN.lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })) + '</span>&nbsp;', afterId);
      case 'mention': return NE.mentionPicker(afterId);
      case 'table': id = mk({ type: 'table', rows: [['', '', ''], ['', '', ''], ['', '', '']] }); break;
      case 'callout': id = mk({ type: 'callout', icon: '💡', bg: 'gray' }); break;
      case 'toggle': id = mk({ type: 'toggle', open: true }); break;
      default: id = mk({ type: type });
    }
    NE.refresh();
    if (type === 'image') { pickImage(id); return id; }
    if (type === 'video' || type === 'bookmark') { askUrl(id); return id; }
    if (type === 'equation') { editTex(id); return id; }
    if (type === 'divider') { var nx = NS.newBlock(page, parent, id, { type: 'text' }); NE.refresh(); focusBlock(nx, 0); return id; }
    if (type === 'cols2' || type === 'cols3') { var first = NS.blocks(page, NS.blocks(page, id)[0].id)[0]; focusBlock(first.id, 0); return id; }
    focusBlock(id, 0);
    return id;
  };
  NE.insertInline = function (html, id) {
    var n = nodes[id], t = n && n.querySelector('.nb-text');
    if (!t) return;
    t.focus();
    doc.execCommand('insertHTML', false, html);
    scheduleCommit(id, t);
  };
  NE.deleteBlocks = function (ids) {
    NE.flush();
    ids.forEach(function (id) {
      (function rm(x) { NS.blocks(NE.pid, x).forEach(function (c) { rm(c.id); }); NS.remove(x); })(id);
    });
    NE.refresh();
  };
  NE.duplicate = function (id) {
    NE.flush();
    var b = NS.get(id); if (!b) return;
    var copy = function (src, parent, after) {
      var f = JSON.parse(JSON.stringify(src)); delete f.id; delete f._o; delete f.cmts;
      var nid = NS.newBlock(NE.pid, parent, after, f);
      NS.blocks(NE.pid, src.id).forEach(function (c) { copy(c, nid, null); });
      return nid;
    };
    var nid = copy(b, b.parent, id);
    NE.refresh(); focusBlock(nid);
  };
  function indent(id) {
    var b = NS.get(id), sib = NS.blocks(NE.pid, b.parent), i = sib.findIndex(function (x) { return x.id === id; });
    if (i <= 0) return;
    var prev = sib[i - 1];
    if (!TEXTUAL[prev.type] && prev.type !== 'col') return;
    var kids = NS.blocks(NE.pid, prev.id);
    commit(id, nodes[id].querySelector('.nb-text'));
    var off = caretOffset(nodes[id].querySelector('.nb-text'));
    NS.set(id, { parent: prev.id, _o: SN.Collab.between(NS.lastOrder(kids), '') });
    if (prev.type === 'toggle' && !prev.open) NS.set(prev.id, { open: true });
    NE.refresh(); focusBlock(id, off);
  }
  function outdent(id) {
    var b = NS.get(id); if (!b.parent) return false;
    var par = NS.get(b.parent); if (!par || par.type === 'col') return false;
    var sib = NS.blocks(NE.pid, par.parent), i = sib.findIndex(function (x) { return x.id === par.id; });
    var off = caretOffset(nodes[id].querySelector('.nb-text'));
    commit(id, nodes[id].querySelector('.nb-text'));
    // Blok setelah kita di bawah induk lama ikut menjadi anak kita (perilaku editor outline).
    var after = NS.blocks(NE.pid, par.id), j = after.findIndex(function (x) { return x.id === id; });
    after.slice(j + 1).forEach(function (x, k) { NS.set(x.id, { parent: id, _o: SN.Collab.between(NS.lastOrder(NS.blocks(NE.pid, id)), '') }); });
    NS.set(id, { parent: par.parent || '', _o: SN.Collab.between(par._o, sib[i + 1] ? sib[i + 1]._o : '') });
    NE.refresh(); focusBlock(id, off);
    return true;
  }
  function moveBlock(id, dir) {
    var b = NS.get(id), sib = NS.blocks(NE.pid, b.parent), i = sib.findIndex(function (x) { return x.id === id; });
    var j = i + dir; if (j < 0 || j >= sib.length) return;
    var o = dir < 0 ? SN.Collab.between(sib[j - 1] ? sib[j - 1]._o : '', sib[j]._o) : SN.Collab.between(sib[j]._o, sib[j + 1] ? sib[j + 1]._o : '');
    var t = nodes[id].querySelector('.nb-text'), off = t ? caretOffset(t) : -1;
    NS.set(id, { _o: o });
    NE.refresh(); focusBlock(id, off);
  }

  /* ====================================================== event editor */
  doc.addEventListener('input', function (e) {
    var t = e.target;
    if (t.classList && t.classList.contains('nb-text')) {
      var b = blockOf(t); if (!b) return;
      if (b.type !== 'code' && markdownShortcut(t, b)) return;
      scheduleCommit(b.id, t);
      slashCheck(t, b);
      return;
    }
    if (t.tagName === 'FIGCAPTION') { var bb = blockOf(t); if (bb) NS.set(bb.id, { caption: t.textContent }, true); }
    if (t.tagName === 'TD' && t.closest('.nb-tbl')) {
      var tb = blockOf(t); if (!tb) return;
      var rows = JSON.parse(JSON.stringify(tb.rows || []));
      rows[+t.dataset.r][+t.dataset.c] = t.textContent;
      NS.set(tb.id, { rows: rows }, true);
      nodes[tb.id]._sig = sig(NS.get(tb.id));
    }
  });
  doc.addEventListener('focusout', function (e) {
    var t = e.target;
    if (t.classList && t.classList.contains('nb-text')) { var b = blockOf(t); if (b && dirtyText[b.id]) commit(b.id, t); }
  });
  doc.addEventListener('focusin', function (e) {
    var t = e.target;
    if (t.classList && t.classList.contains('nb-text')) { var b = blockOf(t); if (b) { NS.emit('focusBlock', b.id); clearSelection(); } }
  });

  function markdownShortcut(t, b) {
    var txt = t.textContent, off = caretOffset(t);
    var m = txt.slice(0, off).match(/^(#{1,3}|[-*+]|1[.)]|\[\s?\]|\[x\]|>|"|```|---|\|) ?\s$/) || txt.slice(0, off).match(/^(#{1,3}|[-*+]|1[.)]|\[\s?\]|\[x\]|>|"|```|---) $/);
    if (!m || !TEXTUAL[b.type] || b.type === 'code') return false;
    var k = m[1], map = { '#': 'h1', '##': 'h2', '###': 'h3', '-': 'bullet', '*': 'bullet', '+': 'bullet', '1.': 'number', '1)': 'number', '[]': 'todo', '[ ]': 'todo', '[x]': 'todo', '>': 'toggle', '"': 'quote', '```': 'code', '---': 'divider' };
    var type = map[k]; if (!type || (b.type === type)) return false;
    // buang awalan markdown dari teks
    var r = doc.createRange(); r.selectNodeContents(t);
    var sel = getSelection(); r.setEnd(sel.anchorNode, sel.anchorOffset);
    r.deleteContents();
    NS.set(b.id, { html: NE.clean(t.innerHTML) }, true);
    if (type === 'divider') { NS.set(b.id, { type: 'divider', html: '' }, true); var nx = NS.newBlock(NE.pid, b.parent, b.id, { type: 'text' }); NE.refresh(); focusBlock(nx, 0); return true; }
    NE.convert(b.id, type, k === '[x]' ? { checked: true } : null);
    focusBlock(b.id, 0);
    return true;
  }

  doc.addEventListener('keydown', function (e) {
    var t = e.target;
    if (slash && handleMenuKey(e)) return;
    if (selected.length && !(t.classList && t.classList.contains('nb-text'))) { selectionKey(e); return; }
    if (!(t.classList && t.classList.contains('nb-text'))) return;
    var b = blockOf(t); if (!b) return;
    var mod = e.metaKey || e.ctrlKey;
    if (mod && !e.shiftKey && (e.key === 'b' || e.key === 'i' || e.key === 'u')) { e.preventDefault(); doc.execCommand({ b: 'bold', i: 'italic', u: 'underline' }[e.key]); scheduleCommit(b.id, t); return; }
    if (mod && e.shiftKey && (e.key === 's' || e.key === 'S' || e.key === 'x' || e.key === 'X')) { e.preventDefault(); doc.execCommand('strikeThrough'); scheduleCommit(b.id, t); return; }
    if (mod && e.key === 'e') { e.preventDefault(); inlineCode(t); scheduleCommit(b.id, t); return; }
    if (mod && e.key === 'k') { e.preventDefault(); linkPrompt(t, b); return; }
    if (mod && e.key === 'd') { e.preventDefault(); NE.duplicate(b.id); return; }
    if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); moveBlock(b.id, e.key === 'ArrowUp' ? -1 : 1); return; }
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      if (b.type === 'todo') NS.set(b.id, { checked: !b.checked });
      else if (b.type === 'toggle') NS.set(b.id, { open: !b.open });
      else { var nn = NS.newBlock(NE.pid, b.parent, b.id, { type: 'text' }); NE.refresh(); focusBlock(nn, 0); return; }
      NE.refresh(); return;
    }
    if (e.key === 'Escape') { e.preventDefault(); commit(b.id, t); t.blur(); selectBlocks([b.id]); return; }
    if (e.key === 'Tab') { e.preventDefault(); if (b.type === 'code') { doc.execCommand('insertText', false, '  '); return; } if (e.shiftKey) outdent(b.id); else indent(b.id); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      if (b.type === 'code') return;   // baris baru di dalam kode
      e.preventDefault();
      var empty = !t.textContent.length && !t.querySelector('img,.nm,.nd');
      if (empty && /bullet|number|todo|toggle|quote|callout|h1|h2|h3/.test(b.type)) {
        if (b.parent && NS.get(b.parent) && NS.get(b.parent).type !== 'col' && outdent(b.id)) return;
        NE.convert(b.id, 'text'); return;
      }
      var parts = splitAtCaret(t);
      NS.set(b.id, { html: parts[0] }, true);
      delete dirtyText[b.id];
      var keep = /bullet|number|todo/.test(b.type) ? b.type : (b.type === 'toggle' ? 'toggle' : 'text');
      var parent = b.parent, afterId = b.id;
      // Toggle terbuka / blok dengan anak: baris baru menjadi anak pertama.
      if ((b.type === 'toggle' && b.open && !parts[1]) ) { parent = b.id; afterId = ''; keep = 'text'; }
      var nid = NS.newBlock(NE.pid, parent, afterId, { type: keep, html: parts[1], color: keep === b.type ? b.color : undefined, open: keep === 'toggle' ? true : undefined });
      NE.refresh(); focusBlock(nid, 0);
      return;
    }
    if (e.key === 'Backspace' && atStart(t) && !e.isComposing) {
      if (b.type !== 'text') {
        e.preventDefault();
        if (b.type === 'code' && t.textContent) return;
        if (/bullet|number|todo/.test(b.type) && b.parent && NS.get(b.parent).type !== 'col' && outdent(b.id)) return;
        NE.convert(b.id, 'text'); focusBlock(b.id, 0); return;
      }
      if (b.parent && NS.get(b.parent) && NS.get(b.parent).type !== 'col') { e.preventDefault(); outdent(b.id); return; }
      var prev = neighbor(b.id, -1);
      if (!prev) return;
      e.preventDefault();
      if (!TEXTUAL[prev.type] || prev.type === 'code') {
        if (!t.textContent) { NE.deleteBlocks([b.id]); focusBlock(prev.id); } else { NE.deleteBlocks([prev.id]); focusBlock(b.id, 0); }
        return;
      }
      commit(b.id, t);
      var plen = textOf(prev.html).length;
      NS.set(prev.id, { html: NE.clean((prev.html || '') + (NS.get(b.id).html || '')) });
      NS.blocks(NE.pid, b.id).forEach(function (c) { NS.set(c.id, { parent: prev.id }); });
      NS.remove(b.id);
      NE.refresh(); focusBlock(prev.id, plen);
      return;
    }
    if (e.key === 'Delete' && atEnd(t)) {
      var next = neighbor(b.id, 1);
      if (!next || !TEXTUAL[next.type] || next.type === 'code') return;
      e.preventDefault();
      commit(b.id, t);
      var len = t.textContent.length;
      NS.set(b.id, { html: NE.clean((NS.get(b.id).html || '') + (next.html || '')) });
      NS.remove(next.id);
      NE.refresh(); focusBlock(b.id, len);
      return;
    }
    if (e.key === 'ArrowUp' && !e.shiftKey && onFirstLine(t)) { var pv = neighbor(b.id, -1); if (pv) { e.preventDefault(); commit(b.id, t); focusBlock(pv.id); } else { var ti = NE.container && NE.container.querySelector('.n-title'); if (ti) { e.preventDefault(); setCaret(ti); } } return; }
    if (e.key === 'ArrowDown' && !e.shiftKey && onLastLine(t)) { var nx2 = neighbor(b.id, 1); if (nx2) { e.preventDefault(); commit(b.id, t); focusBlock(nx2.id, 0); } return; }
  });

  doc.addEventListener('paste', function (e) {
    var t = e.target.closest && e.target.closest('.nb-text');
    if (!t) return;
    var b = blockOf(t); if (!b) return;
    var cd = e.clipboardData;
    var file = Array.prototype.find.call(cd.files || [], function (f) { return /^image\//.test(f.type); });
    if (file) { e.preventDefault(); compressImage(file).then(function (src) { var id = NS.newBlock(NE.pid, b.parent, b.id, { type: 'image', src: src }); NE.refresh(); }); return; }
    if (b.type === 'code') { e.preventDefault(); doc.execCommand('insertText', false, cd.getData('text/plain')); return; }
    var txt = cd.getData('text/plain');
    var url = /^https?:\/\/\S+$/.test(txt.trim()) ? txt.trim() : '';
    if (url && !getSelection().isCollapsed) { e.preventDefault(); doc.execCommand('createLink', false, url); scheduleCommit(b.id, t); return; }
    if (url && !t.textContent) {
      e.preventDefault();
      if (ytId(url)) NS.set(b.id, { type: 'video', url: url }); else NS.set(b.id, { type: 'bookmark', url: url, title: hostOf(url) });
      var nb = NS.newBlock(NE.pid, b.parent, b.id, { type: 'text' }); NE.refresh(); focusBlock(nb, 0); return;
    }
    var lines = txt.replace(/\r/g, '').split('\n');
    if (lines.length < 2) {
      var html = cd.getData('text/html');
      if (html) { e.preventDefault(); doc.execCommand('insertHTML', false, NE.clean(html)); scheduleCommit(b.id, t); }
      return;
    }
    e.preventDefault();
    var parsed = NE.parseMarkdown(lines.join('\n'));
    var first = parsed.shift();
    if (first) { doc.execCommand('insertHTML', false, first.html); commit(b.id, t); if (!textOf(b.html) && first.type !== 'text') NS.set(b.id, { type: first.type, checked: first.checked }); }
    var after = b.id;
    parsed.forEach(function (p) { after = NS.newBlock(NE.pid, b.parent, after, p); });
    NE.refresh(); focusBlock(after);
  });

  /** Markdown sederhana → daftar blok {type, html, ...}. Dipakai tempel & impor. */
  NE.parseMarkdown = function (md) {
    var out = [], code = null;
    var inline = function (s) {
      return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
        .replace(/~~([^~]+)~~/g, '<s>$1</s>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
    };
    md.split('\n').forEach(function (l) {
      if (code) { if (/^```/.test(l)) { out.push(code); code = null; } else code.html += (code.html ? '\n' : '') + esc(l); return; }
      var m;
      if ((m = l.match(/^```(\w*)/))) { code = { type: 'code', lang: m[1] || 'plain', html: '' }; return; }
      if (!l.trim()) return;
      if ((m = l.match(/^(#{1,3})\s+(.*)/))) out.push({ type: 'h' + m[1].length, html: inline(m[2]) });
      else if ((m = l.match(/^\s*[-*+]\s+\[( |x)\]\s+(.*)/i))) out.push({ type: 'todo', checked: m[1] !== ' ', html: inline(m[2]) });
      else if ((m = l.match(/^\s*[-*+]\s+(.*)/))) out.push({ type: 'bullet', html: inline(m[1]) });
      else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) out.push({ type: 'number', html: inline(m[1]) });
      else if ((m = l.match(/^>\s?(.*)/))) out.push({ type: 'quote', html: inline(m[1]) });
      else if (/^(-{3,}|\*{3,})$/.test(l.trim())) out.push({ type: 'divider', html: '' });
      else if ((m = l.match(/^!\[[^\]]*\]\((\S+)\)/))) out.push({ type: 'image', src: m[1] });
      else out.push({ type: 'text', html: inline(l) });
    });
    if (code) out.push(code);
    return out;
  };

  /* ====================================================== klik dalam editor */
  doc.addEventListener('click', function (e) {
    var a = e.target.closest('[data-a]'), go = e.target.closest('[data-go]'), jump = e.target.closest('[data-jump]');
    var nm = e.target.closest('a.nm[data-page]');
    if (nm) { e.preventDefault(); NS.emit('go', nm.getAttribute('data-page')); return; }
    if (go && !e.target.closest('.n-pop')) { NS.emit('go', go.getAttribute('data-go')); return; }
    if (jump) { var n = nodes[jump.getAttribute('data-jump')]; if (n) n.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    var link = e.target.closest('.nb-text a[href]');
    if (link && (e.metaKey || e.ctrlKey || link.closest('[contenteditable=false]'))) { e.preventDefault(); SN.native.invoke('open_url', { url: link.href }); return; }
    if (!a || !a.closest('.nb')) return;
    var b = blockOf(a); if (!b) return;
    var act = a.getAttribute('data-a');
    var ed = NE.editable(NS.page(b.page));
    if (act === 'check' && ed) { NS.set(b.id, { checked: a.checked }); NE.refresh(); }
    if (act === 'toggle') { NS.set(b.id, { open: !b.open }); NE.refresh(); if (!b.open && !NS.blocks(NE.pid, b.id).length && ed) { var c = NS.newBlock(NE.pid, b.id, null, { type: 'text' }); NE.refresh(); focusBlock(c, 0); } }
    if (!ed) return;
    if (act === 'add') { e.preventDefault(); var nid = NS.newBlock(NE.pid, b.parent, b.id, { type: 'text' }); NE.refresh(); focusBlock(nid, 0); openSlash(nodes[nid].querySelector('.nb-text'), NS.get(nid), true); }
    if (act === 'menu') { e.preventDefault(); blockMenu(a, b); }
    if (act === 'calloutIcon') NE.iconPicker(a, function (ic) { NS.set(b.id, { icon: ic || '💡' }); NE.refresh(); });
    if (act === 'lang') NE.popAt(a, LANGS.map(function (l) { return '<button class="n-mi is-small" data-l="' + l + '"><span>' + l + '</span></button>'; }).join('')).addEventListener('click', function (ev) { var x = ev.target.closest('[data-l]'); if (x) { NS.set(b.id, { lang: x.dataset.l }); NE.closePop(); NE.refresh(); } });
    if (act === 'copy') { navigator.clipboard.writeText(textOf(b.html)).then(function () { SN.ui.toast(SN.t('n_copied')); }); }
    if (act === 'upload') pickImage(b.id);
    if (act === 'url') askUrl(b.id);
    if (act === 'tex') editTex(b.id);
    if (act === 'cmts') NS.emit('comment', { page: b.page, block: b.id });
    if (act === 'addRow' || act === 'addCol') {
      var rows = JSON.parse(JSON.stringify(b.rows || [['']]));
      if (act === 'addRow') rows.push(rows[0].map(function () { return ''; })); else rows.forEach(function (r) { r.push(''); });
      NS.set(b.id, { rows: rows }); NE.refresh();
    }
  });
  doc.addEventListener('click', function (e) {
    if (e.target.closest('.nb.t-divider .nb-row') && !e.target.closest('.nb-gut')) selectBlocks([blockOf(e.target).id]);
  });

  /* ====================================================== menu "/" */
  var slash = null;
  function slashCheck(t, b) {
    var off = caretOffset(t), txt = t.textContent.slice(0, off);
    var m = txt.match(/(^|\s)\/([^\s/]{0,24})$/);
    var mm = txt.match(/(^|\s)(@|\[\[)([^\s@]{0,24})$/);
    if (m) openSlash(t, b, false, m[2]);
    else if (mm) openMention(t, b, mm[3], mm[2].length);
    else if (slash) closeSlash();
  }
  function items(q) {
    q = (q || '').toLowerCase();
    return NE.TYPES.filter(function (x) { return !q || (SN.t('n_blk_' + x.id) + ' ' + x.k).toLowerCase().indexOf(q) >= 0; });
  }
  function openSlash(t, b, fromPlus, q) {
    var list = items(q);
    if (!list.length) { if (slash && slash.q !== undefined && q && q.length > 3) closeSlash(); if (!slash) return; }
    var rect = caretRect() || t.getBoundingClientRect();
    var html = '<div class="n-pop-h">' + esc(SN.t('n_blocks')) + '</div>' + list.map(function (x) { return NE.mi('data-t="' + x.id + '"', x.icon, SN.t('n_blk_' + x.id), SN.t('n_blkd_' + x.id)); }).join('');
    if (!list.length) html = '<div class="n-pop-h">' + esc(SN.t('n_no_result')) + '</div>';
    var el = NE.pop(rect.left, rect.bottom + 6, html, { onClose: function () { slash = null; } });
    var firstBtn = el.querySelector('.n-mi'); if (firstBtn) firstBtn.classList.add('is-act');
    slash = { el: el, t: t, b: b, idx: 0, list: list, q: q || '', fromPlus: fromPlus, kind: 'slash' };
    el.addEventListener('click', function (e) { var x = e.target.closest('[data-t]'); if (x) chooseSlash(x.getAttribute('data-t')); });
  }
  function closeSlash() { if (slash) { var s = slash; slash = null; if (NE.isPopOpen()) NE.closePop(); return s; } }
  function handleMenuKey(e) {
    if (!slash) return false;
    var btns = slash.el.querySelectorAll('.n-mi');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      slash.idx = (slash.idx + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % Math.max(1, btns.length);
      btns.forEach(function (b, i) { b.classList.toggle('is-act', i === slash.idx); });
      if (btns[slash.idx]) btns[slash.idx].scrollIntoView({ block: 'nearest' });
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); var b = btns[slash.idx]; if (b) b.click(); else closeSlash(); return true; }
    if (e.key === 'Escape') { e.preventDefault(); closeSlash(); return true; }
    return false;
  }
  function stripTrigger(t, n) {
    var sel = getSelection(); if (!sel.rangeCount) return;
    var r = sel.getRangeAt(0), node = r.startContainer, off = r.startOffset;
    if (node.nodeType === 3 && off >= n) { var rr = doc.createRange(); rr.setStart(node, off - n); rr.setEnd(node, off); rr.deleteContents(); }
  }
  function chooseSlash(type) {
    var s = closeSlash(); if (!s) return;
    stripTrigger(s.t, s.q.length + 1);
    commit(s.b.id, s.t);
    var b = NS.get(s.b.id);
    var empty = !s.t.textContent.trim();
    if (CONVERTIBLE.indexOf(type) >= 0 && empty) { NE.convert(b.id, type, type === 'callout' ? { icon: '💡', bg: 'gray' } : null); return; }
    if (type === 'date' || type === 'mention') { NE.insert(type, b.id); return; }
    NE.insert(type, b.id, empty);
  }

  /* ====================================================== mention @ */
  function openMention(t, b, q, trigLen) {
    var ql = (q || '').toLowerCase();
    var pages = NS.allPages().filter(function (p) { return !p.trashed && NS.title(p).toLowerCase().indexOf(ql) >= 0; }).slice(0, 8);
    var rect = caretRect() || t.getBoundingClientRect();
    var today = new Date().toISOString().slice(0, 10);
    var html = '<div class="n-pop-h">' + esc(SN.t('n_link_page')) + '</div>' + pages.map(function (p, i) { return NE.mi('data-p="' + p.id + '"' + (i === 0 ? ' data-first' : ''), esc(NS.icon(p)), NS.title(p), NS.path(p.id).slice(0, -1).map(NS.title).join(' / '), '', true); }).join('') +
      '<div class="n-pop-h">' + esc(SN.t('n_date')) + '</div>' + NE.mi('data-d="' + today + '"', '📅', SN.t('n_today'), '', '', true) +
      (q ? NE.mi('data-new="1"', '＋', SN.t('n_new_page_named', { name: q }), '', '', true) : '');
    var el = NE.pop(rect.left, rect.bottom + 6, html, { onClose: function () { slash = null; } });
    var first = el.querySelector('.n-mi'); if (first) first.classList.add('is-act');
    slash = { el: el, t: t, b: b, idx: 0, q: q || '', kind: 'mention', trig: trigLen };
    el.addEventListener('click', function (e) {
      var x = e.target.closest('.n-mi'); if (!x) return;
      var s = closeSlash();
      stripTrigger(s.t, s.q.length + s.trig);
      s.t.focus();
      if (x.dataset.d) doc.execCommand('insertHTML', false, '<span class="nd" contenteditable="false" data-date="' + x.dataset.d + '">@' + esc(new Date().toLocaleDateString(SN.lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })) + '</span>&nbsp;');
      else {
        var pid = x.dataset.p || NS.newPage(NE.pid, { title: s.q });
        if (x.dataset.new) NS.emit('tree');
        doc.execCommand('insertHTML', false, '<a class="nm" contenteditable="false" data-page="' + pid + '">' + esc(NS.title(NS.page(pid))) + '</a>&nbsp;');
      }
      scheduleCommit(s.b.id, s.t);
    });
  }
  NE.mentionPicker = function (id) {
    var n = nodes[id], t = n && n.querySelector('.nb-text'); if (!t) return;
    t.focus(); doc.execCommand('insertText', false, '@');
    openMention(t, NS.get(id), '', 1);
  };

  /* ====================================================== menu blok */
  function blockMenu(anchor, b) {
    var n = nodes[b.id]; n.classList.add('is-menu');
    var conv = CONVERTIBLE.map(function (t) { var x = NE.TYPES.find(function (y) { return y.id === t; }); return NE.mi('data-conv="' + t + '"', x.icon, SN.t('n_blk_' + t), '', '', true); }).join('');
    var html = NE.mi('data-m="del"', '🗑', SN.t('n_delete'), '', 'Del', true) + NE.mi('data-m="dup"', '⧉', SN.t('n_duplicate'), '', '⌘D', true) +
      NE.mi('data-m="cmt"', '💬', SN.t('n_comment'), '', '', true) + NE.mi('data-m="copylink"', '🔗', SN.t('n_copy_link'), '', '', true) + NE.mi('data-m="move"', '↪', SN.t('n_move_to'), '', '', true) +
      (TEXTUAL[b.type] ? '<div class="n-sep"></div><div class="n-pop-h">' + esc(SN.t('n_turn_into')) + '</div>' + conv : '') +
      '<div class="n-sep"></div><div class="n-pop-h">' + esc(SN.t('n_color')) + '</div><div class="n-colors">' + COLORS.map(function (c) { return '<button data-fg="' + c + '" title="' + esc(SN.t('n_c_' + c)) + '" style="color:var(--c-' + c + ', var(--n-text))">A</button>'; }).join('') + '</div>' +
      '<div class="n-pop-h">' + esc(SN.t('n_background')) + '</div><div class="n-colors">' + COLORS.map(function (c) { return '<button data-bgc="' + c + '" title="' + esc(SN.t('n_c_' + c)) + '" style="background:var(--b-' + c + ', var(--n-surface))"></button>'; }).join('') + '</div>';
    var el = NE.popAt(anchor, html, { onClose: function () { n.classList.remove('is-menu'); } });
    el.addEventListener('click', function (e) {
      var x = e.target.closest('button'); if (!x) return;
      NE.closePop();
      if (x.dataset.m === 'del') NE.deleteBlocks([b.id]);
      if (x.dataset.m === 'dup') NE.duplicate(b.id);
      if (x.dataset.m === 'cmt') NS.emit('comment', { page: b.page, block: b.id });
      if (x.dataset.m === 'copylink') { navigator.clipboard.writeText('sinerli-note://open?ws=' + (NS.ws && NS.ws.id) + '&page=' + b.page + '&block=' + b.id); SN.ui.toast(SN.t('n_copied')); }
      if (x.dataset.m === 'move') NS.emit('movePicker', { block: b.id });
      if (x.dataset.conv) NE.convert(b.id, x.dataset.conv, x.dataset.conv === 'callout' ? { icon: '💡', bg: 'gray' } : null);
      if (x.dataset.fg) { NS.set(b.id, { color: x.dataset.fg }); NE.refresh(); }
      if (x.dataset.bgc) { NS.set(b.id, { bg: x.dataset.bgc }); NE.refresh(); }
    });
  }
  /** Pindahkan blok (beserta anaknya) ke halaman lain. */
  NE.moveBlockToPage = function (bid, pid) {
    NE.flush();
    var b = NS.get(bid); if (!b || pid === b.page) return;
    var list = NS.blocks(pid, '');
    NS.set(bid, { page: pid, parent: '', _o: SN.Collab.between(NS.lastOrder(list), '') });
    (function mv(x) { NS.blocks(b.page, x).forEach(function (c) { NS.set(c.id, { page: pid }); mv(c.id); }); })(bid);
    NE.refresh();
  };

  /* ====================================================== seleksi blok */
  var selected = [];
  function selectBlocks(ids) {
    clearSelection();
    selected = ids.slice();
    selected.forEach(function (id) { if (nodes[id]) nodes[id].classList.add('is-sel'); });
    if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur();
  }
  function clearSelection() { selected.forEach(function (id) { if (nodes[id]) nodes[id].classList.remove('is-sel'); }); selected = []; }
  NE.clearSelection = clearSelection;
  function selectionKey(e) {
    if (!selected.length) return;
    var mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); var first = neighbor(selected[0], -1); NE.deleteBlocks(selected); clearSelection(); if (first) focusBlock(first.id); return; }
    if (e.key === 'Escape') { clearSelection(); return; }
    if (e.key === 'Enter') { e.preventDefault(); var id = selected[0]; clearSelection(); focusBlock(id); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      var nb = neighbor(e.key === 'ArrowUp' ? selected[0] : selected[selected.length - 1], e.key === 'ArrowUp' ? -1 : 1);
      if (!nb) return;
      if (e.shiftKey) { selected[e.key === 'ArrowUp' ? 'unshift' : 'push'](nb.id); nodes[nb.id] && nodes[nb.id].classList.add('is-sel'); } else selectBlocks([nb.id]);
      return;
    }
    if (mod && e.key === 'c') { e.preventDefault(); navigator.clipboard.writeText(selected.map(function (id) { return NE.blockMarkdown(NS.get(id)); }).join('\n')); SN.ui.toast(SN.t('n_copied')); return; }
    if (mod && e.key === 'd') { e.preventDefault(); NE.duplicate(selected[selected.length - 1]); return; }
  }
  doc.addEventListener('mousedown', function (e) { if (selected.length && !e.target.closest('.nb.is-sel') && !e.target.closest('.n-pop')) clearSelection(); });

  /* ====================================================== drag & drop */
  var drag = null;
  doc.addEventListener('pointerdown', function (e) {
    var h = e.target.closest('.nb-drag'); if (!h || e.button !== 0) return;
    var b = blockOf(h); if (!b || !NE.editable(NS.page(b.page))) return;
    drag = { id: b.id, x: e.clientX, y: e.clientY, moved: false, ghost: null, target: null };
  });
  doc.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    if (!drag.moved) {
      drag.moved = true; NE.closePop();
      drag.ghost = SN.el('div', { class: 'n-pop', style: 'pointer-events:none;opacity:.85;min-width:0;max-width:360px;padding:6px 10px' }, esc(textOf(NS.get(drag.id).html) || SN.t('n_blk_' + NS.get(drag.id).type)).slice(0, 80));
      doc.body.appendChild(drag.ghost);
      nodes[drag.id].style.opacity = '.4';
    }
    drag.ghost.style.left = (e.clientX + 12) + 'px'; drag.ghost.style.top = (e.clientY + 8) + 'px';
    clearDrop();
    var over = doc.elementFromPoint(e.clientX, e.clientY);
    var n = over && over.closest('.nb');
    var treeRow = over && over.closest('.n-tree-row');
    if (treeRow) { treeRow.classList.add('drop-in'); drag.target = { page: treeRow.dataset.id, el: treeRow }; return; }
    if (!n || n.dataset.id === drag.id || nodes[drag.id].contains(n)) { drag.target = null; return; }
    var r = n.getBoundingClientRect();
    var before = e.clientY < r.top + r.height / 2;
    var nest = !before && e.clientX > r.left + 60 && TEXTUAL[NS.get(n.dataset.id).type];
    n.classList.add(before ? 'drop-before' : 'drop-after');
    drag.target = { id: n.dataset.id, before: before, nest: nest, el: n };
  });
  function clearDrop() { doc.querySelectorAll('.drop-before, .drop-after, .drop-in').forEach(function (x) { x.classList.remove('drop-before', 'drop-after', 'drop-in'); }); }
  doc.addEventListener('pointerup', function () {
    if (!drag) return;
    var d = drag; drag = null;
    clearDrop();
    if (d.ghost) d.ghost.remove();
    if (nodes[d.id]) nodes[d.id].style.opacity = '';
    if (!d.moved) return;
    if (!d.target) return;
    if (d.target.page) { NE.moveBlockToPage(d.id, d.target.page); SN.ui.toast(SN.t('n_moved')); return; }
    var t = NS.get(d.target.id);
    if (d.target.nest) { NS.set(d.id, { parent: t.id, _o: SN.Collab.between(NS.lastOrder(NS.blocks(NE.pid, t.id)), '') }); if (t.type === 'toggle') NS.set(t.id, { open: true }); }
    else {
      var sib = NS.blocks(NE.pid, t.parent).filter(function (x) { return x.id !== d.id; });
      var i = sib.findIndex(function (x) { return x.id === t.id; });
      var o = d.target.before ? SN.Collab.between(sib[i - 1] ? sib[i - 1]._o : '', t._o) : SN.Collab.between(t._o, sib[i + 1] ? sib[i + 1]._o : '');
      NS.set(d.id, { parent: t.parent || '', _o: o });
    }
    NE.refresh();
  });

  /* ====================================================== bar format */
  var fmt = null;
  doc.addEventListener('selectionchange', function () {
    var s = getSelection();
    if (!s.rangeCount || s.isCollapsed) { hideFmt(); return; }
    var n = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode);
    var t = n && n.closest && n.closest('.nb-text');
    if (!t || t.closest('.t-code') || t.getAttribute('contenteditable') === 'false') { hideFmt(); return; }
    showFmt(s.getRangeAt(0).getBoundingClientRect(), t);
  });
  function hideFmt() { if (fmt) { fmt.remove(); fmt = null; } }
  function showFmt(rect, t) {
    if (!fmt) {
      fmt = SN.el('div', { class: 'n-fmt' });
      fmt.innerHTML = '<button data-f="turn" title="' + esc(SN.t('n_turn_into')) + '">' + esc(SN.t('n_text_short')) + ' ▾</button><span class="n-fmt-sep"></span>' +
        '<button data-f="bold" title="⌘B"><b>B</b></button><button data-f="italic" title="⌘I"><i>i</i></button><button data-f="underline" title="⌘U"><u>U</u></button><button data-f="strikeThrough" title="⌘⇧S"><s>S</s></button><button data-f="code" title="⌘E">&lt;/&gt;</button>' +
        '<button data-f="link" title="⌘K">🔗</button><button data-f="color" title="' + esc(SN.t('n_color')) + '">A▾</button><span class="n-fmt-sep"></span><button data-f="comment" title="' + esc(SN.t('n_comment')) + '">💬</button>';
      fmt.addEventListener('mousedown', function (e) { e.preventDefault(); });
      fmt.addEventListener('click', function (e) {
        var x = e.target.closest('[data-f]'); if (!x) return;
        var s = getSelection(), node = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode);
        var tt = node && node.closest('.nb-text'), bb = tt && blockOf(tt); if (!bb) return;
        var f = x.dataset.f;
        if (f === 'link') return linkPrompt(tt, bb);
        if (f === 'code') { inlineCode(tt); scheduleCommit(bb.id, tt); return; }
        if (f === 'turn') { blockMenu(x, bb); return; }
        if (f === 'comment') { NS.emit('comment', { page: bb.page, block: bb.id, quote: s.toString() }); return; }
        if (f === 'color') {
          var range = s.getRangeAt(0);
          var el = NE.popAt(x, '<div class="n-pop-h">' + esc(SN.t('n_color')) + '</div><div class="n-colors">' + COLORS.map(function (c) { return '<button data-fg="' + c + '" style="color:var(--c-' + c + ', var(--n-text))">A</button>'; }).join('') + '</div><div class="n-pop-h">' + esc(SN.t('n_background')) + '</div><div class="n-colors">' + COLORS.map(function (c) { return '<button data-bgc="' + c + '" style="background:var(--b-' + c + ', var(--n-surface))"></button>'; }).join('') + '</div>');
          el.addEventListener('click', function (ev) {
            var y = ev.target.closest('button'); if (!y) return;
            NE.closePop(); s.removeAllRanges(); s.addRange(range);
            doc.execCommand('styleWithCSS', false, true);
            if (y.dataset.fg) doc.execCommand('foreColor', false, y.dataset.fg === 'default' ? getComputedStyle(doc.body).color : getComputedStyle(doc.documentElement).getPropertyValue('--c-' + y.dataset.fg).trim());
            if (y.dataset.bgc) doc.execCommand('hiliteColor', false, y.dataset.bgc === 'default' ? 'transparent' : getComputedStyle(doc.documentElement).getPropertyValue('--b-' + y.dataset.bgc).trim());
            doc.execCommand('styleWithCSS', false, false);
            scheduleCommit(bb.id, tt);
          });
          return;
        }
        doc.execCommand(f);
        scheduleCommit(bb.id, tt);
        markFmt();
      });
      doc.body.appendChild(fmt);
    }
    markFmt();
    var w = fmt.offsetWidth;
    fmt.style.left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, innerWidth - w - 8)) + 'px';
    fmt.style.top = Math.max(8, rect.top - 44) + 'px';
  }
  function markFmt() { if (!fmt) return; ['bold', 'italic', 'underline', 'strikeThrough'].forEach(function (c) { var b = fmt.querySelector('[data-f=' + c + ']'); try { b.classList.toggle('is-on', doc.queryCommandState(c)); } catch (e) {} }); }
  function inlineCode(t) {
    var s = getSelection(); if (!s.rangeCount || s.isCollapsed) return;
    var r = s.getRangeAt(0), anc = r.commonAncestorContainer;
    var inCode = (anc.nodeType === 1 ? anc : anc.parentNode).closest('code');
    if (inCode) { inCode.replaceWith.apply(inCode, Array.prototype.slice.call(inCode.childNodes)); return; }
    var c = doc.createElement('code'); c.textContent = r.toString(); r.deleteContents(); r.insertNode(c);
  }
  async function linkPrompt(t, b) {
    var s = getSelection(); if (!s.rangeCount) return;
    var range = s.getRangeAt(0);
    var url = await SN.ui.prompt(SN.t('n_link_url'), 'https://');
    if (!url) return;
    if (!/^(https?:|mailto:)/i.test(url)) url = 'https://' + url;
    t.focus(); s.removeAllRanges(); s.addRange(range);
    if (range.collapsed) doc.execCommand('insertHTML', false, '<a href="' + esc(url) + '">' + esc(url) + '</a>'); else doc.execCommand('createLink', false, url);
    scheduleCommit(b.id, t);
  }

  /* ====================================================== media */
  function compressImage(file, max) {
    max = max || 1600;
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var s = Math.min(1, max / Math.max(img.width, img.height));
        var c = doc.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL(file.type === 'image/png' && file.size < 400000 ? 'image/png' : 'image/jpeg', 0.84));
      };
      img.onerror = rej; img.src = url;
    });
  }
  NE.compressImage = compressImage;
  NE.pickFile = function (accept) {
    return new Promise(function (res) {
      var i = doc.createElement('input'); i.type = 'file'; i.accept = accept;
      i.onchange = function () { res(i.files[0] || null); };
      i.click();
    });
  };
  function pickImage(id) {
    NE.pickFile('image/*').then(function (f) { if (!f) return; return compressImage(f).then(function (src) { NS.set(id, { type: 'image', src: src }); NE.refresh(); }); });
  }
  async function askUrl(id) {
    var b = NS.get(id);
    var u = await SN.ui.prompt(SN.t(b.type === 'video' ? 'n_video_url' : 'n_link_url'), b.url || 'https://');
    if (!u) return;
    if (!/^https?:/i.test(u)) u = 'https://' + u;
    NS.set(id, { url: u, title: hostOf(u) }); NE.refresh();
  }
  async function editTex(id) {
    var b = NS.get(id);
    var tex = await SN.ui.prompt(SN.t('n_eq_prompt'), b.tex || 'E = mc^2');
    if (tex === null) return;
    NS.set(id, { tex: tex }); NE.refresh();
  }

  /* ====================================================== pemilih ikon & sampul */
  var EMOJI = '📄 📝 📌 📎 📚 📖 📓 📒 📕 📗 📘 📙 🗂 🗃 🗄 📁 📂 🧾 📊 📈 📉 📅 🗓 ⏰ ⌛ ✅ ☑️ ✔️ ❌ ⭐ 🌟 ✨ 💡 🔥 ⚡ 💎 🎯 🚀 🛠 🔧 ⚙️ 🧪 🧠 💬 💭 📣 🔔 🏷 🔖 💼 🏢 🏠 🏫 🏥 🌍 🗺 ✈️ 🚗 🚲 🍎 🍕 ☕ 🍰 🎉 🎁 🎨 🎵 🎬 📷 🎮 ⚽ 🏀 🧘 💪 ❤️ 💛 💚 💙 💜 🖤 🤍 😀 😃 😄 😁 😆 😊 😍 🤩 😎 🤓 🧐 🤔 😴 🥳 😇 🙌 👏 👍 👀 👋 🤝 🙏 ✍️ 👨‍💻 👩‍💻 🧑‍🎓 🧑‍🏫 🐱 🐶 🦊 🐼 🐨 🦁 🐸 🐢 🦋 🌸 🌻 🌲 🌵 🍀 🌈 ☀️ 🌙 ⛅ ❄️ 🌊 🔒 🔑 🧭 🧩 🪴 🕹 💰 💳 🧮 📐 🖊 🖌 🖍 🔍 🧷 📦 🛒 🎓 🏆 🥇 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪'.split(' ');
  NE.iconPicker = function (anchor, cb) {
    var el = NE.popAt(anchor, '<input class="n-pop-in" placeholder="' + esc(SN.t('n_emoji_search')) + '"><div class="n-emoji">' + EMOJI.map(function (e) { return '<button data-e="' + e + '">' + e + '</button>'; }).join('') + '</div><div class="n-sep"></div>' + NE.mi('data-rm="1"', '✕', SN.t('n_remove'), '', '', true) + NE.mi('data-rnd="1"', '🎲', SN.t('n_random'), '', '', true));
    var inp = el.querySelector('input');
    inp.focus();
    inp.addEventListener('input', function () { var v = inp.value.trim(); if (v && /\p{Extended_Pictographic}/u.test(v)) { NE.closePop(); cb(v); } });
    el.addEventListener('click', function (e) {
      var x = e.target.closest('button'); if (!x) return;
      NE.closePop();
      if (x.dataset.e) cb(x.dataset.e); else if (x.dataset.rm) cb(''); else if (x.dataset.rnd) cb(EMOJI[Math.floor(Math.random() * EMOJI.length)]);
    });
  };
  var COVERS = ['linear-gradient(120deg,#d4e2b5,#86a35a)', 'linear-gradient(120deg,#f6d365,#fda085)', 'linear-gradient(120deg,#a1c4fd,#c2e9fb)', 'linear-gradient(120deg,#cfd9df,#e2ebf0)', 'linear-gradient(120deg,#e0c3fc,#8ec5fc)', 'linear-gradient(120deg,#fbc2eb,#a6c1ee)', 'linear-gradient(120deg,#26313d,#4f6274)', 'linear-gradient(120deg,#ff9a8b,#ff6a88)', 'linear-gradient(120deg,#43e97b,#38f9d7)', 'linear-gradient(120deg,#30cfd0,#330867)', '#c24a3b', '#cc6d2e', '#b7901a', '#4f8a4b', '#3a72b8', '#8a5bb5'];
  NE.coverPicker = function (anchor, cb) {
    var el = NE.popAt(anchor, '<div class="n-pop-h">' + esc(SN.t('n_cover')) + '</div><div class="n-colors" style="grid-template-columns:repeat(4,1fr)">' + COVERS.map(function (c, i) { return '<button data-c="' + i + '" style="height:40px;background:' + c + '"></button>'; }).join('') + '</div><div class="n-sep"></div>' + NE.mi('data-up="1"', '⬆', SN.t('n_upload_image'), '', '', true));
    el.addEventListener('click', function (e) {
      var x = e.target.closest('button'); if (!x) return;
      NE.closePop();
      if (x.dataset.c) cb(COVERS[+x.dataset.c]);
      if (x.dataset.up) NE.pickFile('image/*').then(function (f) { if (f) compressImage(f, 1800).then(cb); });
    });
  };

  /* ====================================================== kolaborator */
  NE.showPeers = function (peers) {
    doc.querySelectorAll('.nb.peer-on').forEach(function (n) { n.classList.remove('peer-on'); });
    peers.forEach(function (p) {
      var c = p.cursor; if (!c || c.page !== NE.pid || !c.block || !nodes[c.block]) return;
      nodes[c.block].classList.add('peer-on');
      nodes[c.block].style.setProperty('--peer', p.color || '#888');
      nodes[c.block].title = p.display_name || '';
    });
  };

  /* ====================================================== ekspor */
  NE.blockMarkdown = function (b, depth) {
    var pad = new Array((depth || 0) + 1).join('  ');
    var t = htmlToMd(b.html || '');
    var line = {
      h1: '# ' + t, h2: '## ' + t, h3: '### ' + t, bullet: '- ' + t, number: '1. ' + t, todo: '- [' + (b.checked ? 'x' : ' ') + '] ' + t,
      quote: '> ' + t, callout: '> ' + (b.icon || '💡') + ' ' + t, toggle: '- ' + t, code: '```' + (b.lang && b.lang !== 'plain' ? b.lang : '') + '\n' + textOf(b.html) + '\n```',
      divider: '---', image: '![' + (b.caption || '') + '](' + (b.src && b.src.length < 300 ? b.src : 'image') + ')', bookmark: '[' + (b.title || b.url) + '](' + b.url + ')', video: '[Video](' + b.url + ')',
      equation: '$$' + (b.tex || '') + '$$', page: '[' + NS.title(NS.page(b.ref)) + ']()', dblink: '[' + NS.title(NS.page(b.ref)) + ']()',
      table: (b.rows || []).map(function (r, i) { return '| ' + r.join(' | ') + ' |' + (i === 0 ? '\n|' + r.map(function () { return ' --- '; }).join('|') + '|' : ''); }).join('\n')
    }[b.type];
    if (line === undefined) line = t;
    var kids = NS.blocks(b.page, b.id).map(function (c) { return NE.blockMarkdown(c, b.type === 'cols' || b.type === 'col' ? depth : (depth || 0) + 1); }).join('\n');
    if (b.type === 'cols' || b.type === 'col') return kids;
    return pad + line + (kids ? '\n' + kids : '');
  };
  function htmlToMd(html) {
    return html.replace(/<(b|strong)>(.*?)<\/\1>/g, '**$2**').replace(/<(i|em)>(.*?)<\/\1>/g, '*$2*').replace(/<s>(.*?)<\/s>/g, '~~$1~~').replace(/<code>(.*?)<\/code>/g, '`$1`')
      .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g, '[$2]($1)').replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  NE.pageMarkdown = function (pid) {
    var p = NS.page(pid);
    return '# ' + NS.title(p) + '\n\n' + NS.blocks(pid, '').map(function (b) { return NE.blockMarkdown(b, 0); }).join('\n') + '\n';
  };
})(window);
