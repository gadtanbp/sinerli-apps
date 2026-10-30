/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Conversation view: message list (streaming-aware, block-level DOM reuse),
   tool cards with live output, diffs and approvals, deliberation panel,
   composer with attachments, model & intelligence pickers. */
(function () {
  'use strict';
  var h = U.h, $ = UI.$;
  var Chat = {};
  var conv = null;
  var els = {};
  var nodes = new Map();
  var openState = new Map();
  var dirty = new Set();
  var dirtyRecent = false;
  var stick = true;
  var attachments = [];
  var contexts = [];
  var pendingFiles = 0;
  var mention = { open: false, items: [], idx: 0, files: null, filesAt: 0, ws: null };

  var TEXT_EXT = /\.(txt|md|markdown|json|jsonc|ya?ml|toml|ini|cfg|conf|env|csv|tsv|log|xml|html?|css|scss|sass|less|js|mjs|cjs|jsx|ts|tsx|vue|svelte|py|rb|php|go|rs|java|kt|kts|swift|m|mm|h|hpp|c|cc|cpp|cs|sh|bash|zsh|fish|sql|graphql|gql|r|lua|pl|dart|scala|ex|exs|erl|hs|clj|el|vim|dockerfile|makefile|gradle|properties|plist|gitignore|editorconfig|tf|hcl|proto|ipynb|tex|bib|srt|vtt)$/i;
  var IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i;
  var DOC_EXT = /\.(pdf|docx?|rtf|rtfd|odt|pages|html?|webarchive)$/i;

  // ================================================================ init

  Chat.init = function () {
    ['scroller', 'messages', 'empty', 'input', 'composer', 'attachments', 'todo-panel', 'jump-bottom', 'conv-title', 'conv-sub',
      'chip-workspace', 'chip-permission', 'chip-project', 'chip-usage', 'btn-send', 'btn-model', 'btn-level', 'btn-web', 'btn-attach', 'btn-capture', 'btn-dictate', 'btn-export', 'btn-style', 'foot-note', 'mention-pop']
      .forEach(function (id) { els[id.replace(/-(\w)/g, function (_, c) { return c.toUpperCase(); })] = document.getElementById(id); });

    els.input.addEventListener('input', autosize);
    els.input.addEventListener('keydown', onInputKey);
    els.input.addEventListener('focus', function () { els.composer.classList.add('focus'); });
    els.input.addEventListener('blur', function () { els.composer.classList.remove('focus'); });
    els.input.addEventListener('paste', onPaste);
    els.btnSend.addEventListener('click', submit);
    els.btnModel.addEventListener('click', function () { Chat.openModelPicker(els.btnModel); });
    els.btnLevel.addEventListener('click', openLevelMenu);
    els.btnWeb.addEventListener('click', toggleWeb);
    els.btnTeam = document.getElementById('btn-team');
    if (els.btnTeam) els.btnTeam.addEventListener('click', toggleTeam);
    els.btnStyle.addEventListener('click', styleMenu);
    els.btnTemplate = document.getElementById('btn-template');
    if (els.btnTemplate) els.btnTemplate.addEventListener('click', templateMenu);
    els.btnSkill = document.getElementById('btn-skill');
    if (els.btnSkill) els.btnSkill.addEventListener('click', skillMenu);
    els.chipProject.addEventListener('click', function () { if (conv && conv.projectId) App.openProject(conv.projectId); });
    els.input.addEventListener('keyup', function (e) { if (!/^(ArrowUp|ArrowDown|Enter|Escape|Tab)$/.test(e.key)) updateMention(); });
    els.input.addEventListener('click', updateMention);
    els.input.addEventListener('input', function () { if (/^\//.test(els.input.value) || mention.open) updateMention(); });   // keyboard ponsel sering tanpa keyup
    Native.on('files.dropped', function (p) { els.composer.classList.remove('drop'); addPaths(p.paths); });
    // Files / text handed to Sinai from Finder "Open with", the Dock, or Services.
    Native.on('files.opened', function (p) { if (p.paths && p.paths.length) openIncomingFiles(p.paths); });
    Native.on('text.shared', function (p) { if (p.text) { Chat.focusInput(); insertAtCursor(p.text); } });
    els.btnAttach.addEventListener('click', pickFiles);
    els.btnCapture.addEventListener('click', captureMenu);
    els.btnDictate.addEventListener('click', toggleDictation);
    // Live dictation needs the macOS Speech framework.
    if (!U.feature('dictation')) els.btnDictate.hidden = true;
    // Ponsel: kamera & foto lewat tombol lampiran (pemilih berkas sistem); rekam/tangkap layar tidak tersedia.
    if (U.isMobile()) els.btnCapture.hidden = true;
    bindDictationEvents();
    els.btnExport.addEventListener('click', exportMenu);
    els.chipWorkspace.addEventListener('click', workspaceMenu);
    els.chipPermission.addEventListener('click', permissionMenu);
    els.chipUsage.addEventListener('click', function () { Chat.openUsage(els.chipUsage); });
    els.usageRing = document.getElementById('usage-ring');
    els.usageRing.addEventListener('click', function () { Chat.openUsage(els.usageRing); });
    Health.on(U.throttle(function () { if (conv) renderUsageChip(); }, 1000));
    els.jumpBottom.addEventListener('click', function () { scrollToBottom(true); });
    els.scroller.addEventListener('scroll', function () {
      var near = els.scroller.scrollHeight - els.scroller.scrollTop - els.scroller.clientHeight < 80;
      if (near) stick = true;
      els.jumpBottom.hidden = near || stick;
    });
    els.scroller.addEventListener('wheel', function (e) { if (e.deltaY < 0) { stick = false; } });
    els.scroller.addEventListener('keydown', function (e) { if (/^(PageUp|ArrowUp|Home)$/.test(e.key)) stick = false; });
    if (window.ResizeObserver) new ResizeObserver(function () { if (stick) scrollToBottom(); }).observe(els.scroller);
    els.messages.addEventListener('click', onMessagesClick);

    var comp = els.composer;
    ['dragenter', 'dragover'].forEach(function (t) {
      document.addEventListener(t, function (e) {
        var types = e.dataTransfer ? e.dataTransfer.types || [] : [];
        var ix = Array.prototype.indexOf;
        if (ix.call(types, 'Files') >= 0 || ix.call(types, 'text/uri-list') >= 0 || ix.call(types, 'text/html') >= 0 || ix.call(types, 'text/plain') >= 0) {
          e.preventDefault(); comp.classList.add('drop');
        }
      });
    });
    document.addEventListener('dragleave', function (e) { if (!e.relatedTarget) comp.classList.remove('drop'); });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      comp.classList.remove('drop');
      var dt = e.dataTransfer;
      if (!dt) return;
      if (dt.files && dt.files.length) { addFileObjects(Array.prototype.slice.call(dt.files)); return; }
      // Non-file drops: text from Safari, a table copied from Numbers, etc.
      var html = dt.getData && dt.getData('text/html');
      var plain = dt.getData && dt.getData('text/plain');
      var uri = dt.getData && dt.getData('text/uri-list');
      if (html && html.trim()) { addDroppedContent(dropHtmlToText(html), 'konten HTML'); }
      else if (plain && plain.trim()) { insertAtCursor((uri && uri !== plain ? uri + '\n' : '') + plain); Chat.focusInput(); }
      else if (uri && uri.trim()) { insertAtCursor(uri); Chat.focusInput(); }
    });

    Engine.on('update', function (c, m) {
      Sidebar.markRunning();
      if (c !== conv) return;
      if (m) dirty.add(m.id); else dirtyRecent = true;
      scheduleFlush();
      Panel.update();
    });
    var ringLater = U.throttle(function () { if (conv) renderUsageChip(); }, 1500);
    Engine.on('update', function (c) { if (c === conv) ringLater(); });
    Engine.on('run', function (c) {
      Sidebar.markRunning();
      if (c === conv) { renderComposerState(); dirtyRecent = true; scheduleFlush(); renderTodos(); }
    });
    Engine.on('reset', function (c) { if (c === conv) Chat.open(c); });
    Engine.on('todos', function (c) { if (c === conv) renderTodos(); });
    Engine.on('title', function (c) { if (c === conv) renderHeader(); Sidebar.render(); });
    Store.on('settings', function () { if (conv) { renderHeader(); renderComposerState(); } });
  };

  Chat.current = function () { return conv; };

  Chat.open = function (c) {
    if (dictating) { Native.call('dictation.stop'); finishDictation(); }
    conv = c;
    UI.state.conv = c;
    nodes.clear();
    dirty.clear();
    els.messages.innerHTML = '';
    conv.messages.forEach(function (m) { var n = buildNode(m); if (n) { n.classList.add('no-anim'); els.messages.appendChild(n); nodes.set(m.id, n); } });
    markTurns();
    renderEmpty();
    renderHeader();
    renderComposerState();
    renderTodos();
    contexts = [];
    renderAttachments();
    var app = document.getElementById('app');
    app.classList.toggle('mode-design', c.mode === 'design');
    app.classList.toggle('mode-code', c.mode === 'code');
    Panel.attach(c);
    stick = true;
    scrollToBottom(true);
    setTimeout(function () { els.input.focus(); }, 30);
    Sidebar.render();
  };

  Chat.focusInput = function () { els.input.focus(); };
  Chat.setInput = function (t) { els.input.value = t; autosize(); els.input.focus(); };

  // ================================================================ flush / scheduling

  var flushPending = false, lastFlush = 0;
  function scheduleFlush() {
    if (flushPending) return;
    flushPending = true;
    var wait = Math.max(0, 45 - (Date.now() - lastFlush));
    setTimeout(function () { requestAnimationFrame(flush); }, wait);
  }

  function flush() {
    flushPending = false;
    lastFlush = Date.now();
    if (!conv) return;
    var created = false;
    conv.messages.forEach(function (m, i) {
      if (m.role === 'tool' || nodes.has(m.id)) return;
      var n = buildNode(m);
      if (!n) return;
      nodes.set(m.id, n);
      var next = null;
      for (var j = i + 1; j < conv.messages.length; j++) { var nn = nodes.get(conv.messages[j].id); if (nn) { next = nn; break; } }
      els.messages.insertBefore(n, next);
      created = true;
    });
    if (dirtyRecent) {
      var count = 0;
      for (var k = conv.messages.length - 1; k >= 0 && count < 4; k--) {
        var mm = conv.messages[k];
        if (mm.role === 'assistant' || mm.role === 'review' || mm.role === 'team') { dirty.add(mm.id); count++; }
        if (mm.role === 'user' && !(mm.meta && mm.meta.synthetic)) break;
      }
      dirtyRecent = false;
    }
    dirty.forEach(function (id) {
      var m = conv.messages.find(function (x) { return x.id === id; });
      var n = nodes.get(id);
      if (!m || !n) return;
      if (m.role === 'assistant') updateAssistant(m, n);
      else if (m.role === 'review' || m.role === 'team' || m.role === 'divider' || m.role === 'user') {
        var fresh = buildNode(m);
        fresh.classList.add('no-anim');
        n.replaceWith(fresh);
        nodes.set(id, fresh);
      }
    });
    dirty.clear();
    nodes.forEach(function (n, id) {
      if (!conv.messages.some(function (m) { return m.id === id; })) { n.remove(); nodes.delete(id); }
    });
    markTurns();
    renderEmpty();
    if (stick) scrollToBottom();
  }

  function scrollToBottom(force) {
    if (force) stick = true;
    els.scroller.scrollTop = els.scroller.scrollHeight;
    els.jumpBottom.hidden = true;
  }

  function isRealUser(m) { return m && m.role === 'user' && !(m.meta && m.meta.synthetic); }

  function markTurns() {
    var prev = null, lastAssistant = null;
    conv.messages.forEach(function (m, i) {
      var n = nodes.get(m.id);
      if (m.role !== 'assistant' || !n) {
        if (isRealUser(m)) prev = 'user';
        return;
      }
      n.classList.toggle('cont', prev === 'assistant');
      var tag = n.querySelector('.model-tag');
      if (tag) tag.hidden = prev === 'assistant';
      var next = null;
      for (var j = i + 1; j < conv.messages.length; j++) {
        var x = conv.messages[j];
        if (x.role === 'tool' || x.uiOnly) continue;
        next = x;
        break;
      }
      n.classList.toggle('turn-end', !next || isRealUser(next));
      prev = 'assistant';
      lastAssistant = n;
    });
    UI.$$('.msg.assistant.last', els.messages).forEach(function (n) { n.classList.remove('last'); });
    if (lastAssistant) lastAssistant.classList.add('last');
    markWork();
  }

  /* Claude-style: all thinking + tool steps of one turn fold behind a single
     "Memutar otak · 31 dtk ›" line; answers, artifacts and approvals stay visible. */
  function markWork() {
    var turns = [], cur = null;
    conv.messages.forEach(function (m) {
      if (isRealUser(m)) { cur = null; return; }
      if (m.role !== 'assistant' && !(m.role === 'user' && m.meta && m.meta.synthetic)) return;
      if (!cur) { cur = { msgs: [] }; turns.push(cur); }
      cur.msgs.push(m);
      // Like Claude: text between steps splits them into separate step lines.
      if (m.role === 'assistant' && Engine.textOf(m.content).trim()) cur = null;
    });
    UI.$$('.work-head', els.messages).forEach(function (x) { if (!turns.some(function (t) { return t.head === x; })) x.__stale = true; });
    turns.forEach(function (t) {
      var steps = 0, start = 0, end = 0, live = null;
      t.msgs.forEach(function (m) {
        (m.content || []).forEach(function (b) {
          if (b.type === 'thinking' && (b.text || m.streaming)) { steps++; start = start || b.startedAt || m.ts; end = Math.max(end, b.endedAt || 0); if (m.streaming && !b.endedAt) live = 'Berpikir'; }
          if (b.type === 'tool_call') {
            steps++; start = start || b.startedAt || m.ts; end = Math.max(end, b.endedAt || b.startedAt || 0);
            if (b.state === 'running') { var tl = toolFor(b); live = tl ? tl.verb : b.name; }
          }
        });
      });
      var first = t.msgs.map(function (m) { return nodes.get(m.id); }).filter(Boolean)[0];
      var key = t.msgs[0].id + ':work';
      var open = !!openState.get(key);
      var running = Engine.isRunning(conv.id) && t === turns[turns.length - 1];
      t.msgs.forEach(function (m) {
        var n = nodes.get(m.id);
        if (!n) return;
        n.classList.toggle('work-collapsed', steps > 0 && !open);
        n.classList.toggle('work-only', m.role === 'assistant' && !Engine.textOf(m.content) && !m.error && !(m.content || []).some(function (b) { return b.type === 'tool_call' && (b.state === 'pending' || b.name === 'ask_user'); }));
      });
      if (!first || !steps) return;
      var head = first.querySelector(':scope > .work-head');
      if (!head) {
        head = h('div.work-head');
        head.addEventListener('click', function () { openState.set(key, !openState.get(key)); markWork(); });
        first.insertBefore(head, first.firstChild);
      }
      t.head = head;
      head.__run = running ? { start: start || t.msgs[0].ts } : null;
      head.__info = { steps: steps, dur: running ? 0 : Math.max(0, (end || start) - start), live: live, open: open };
      paintWork(head);
    });
    UI.$$('.work-head', els.messages).forEach(function (x) { if (x.__stale && !turns.some(function (t) { return t.head === x; })) x.remove(); x.__stale = false; });
    if (!workTimer) workTimer = setInterval(function () {
      if (!els.messages) return;
      UI.$$('.work-head', els.messages).forEach(function (x) { if (x.__run) paintWork(x); });
    }, 1000);
  }
  var workTimer = null;
  function paintWork(head) {
    var i = head.__info || {}, run = head.__run;
    var secs = run ? Math.max(0, Date.now() - run.start) : i.dur;
    var html = (run ? '<span class="work-dots"><i></i><i></i><i></i></span><span class="shimmer">Memutar otak</span>' : U.icon('bulb') + '<span>' + (i.steps > 1 ? i.steps + ' langkah' : 'Proses berpikir') + '</span>') +
      (secs >= 1000 ? '<span class="wd">' + U.fmtDuration(secs) + '</span>' : '') +
      (run && i.live && !i.open ? '<span class="wl">' + U.esc(i.live) + '</span>' : '') +
      U.icon('chevronRight', 'chev');
    if (head.__html === html) return;
    head.__html = html;
    head.innerHTML = html;
    head.classList.toggle('open', !!i.open);
  }
  function toolFor(b) {
    try { var t = Tools.get(b.name); var l = t && t.label ? t.label(b.args || {}) : null; return l ? { verb: l.verb } : null; } catch (e) { return null; }
  }

  // ================================================================ nodes

  function buildNode(m) {
    if (m.role === 'user') return m.meta && m.meta.synthetic ? syntheticNode(m) : userNode(m);
    if (m.role === 'assistant') {
      var n = h('div.msg.assistant', { dataset: { id: m.id } }, h('div.body'), h('div.meta-row'));
      n.__cache = new Map();
      updateAssistant(m, n);
      return n;
    }
    if (m.role === 'review') return reviewNode(m);
    if (m.role === 'team') return teamNode(m);
    if (m.role === 'divider') return h('div.compact-divider', { dataset: { id: m.id }, text: m.text });
    return null;
  }

  function userNode(m) {
    var bubble = h('div.bubble');
    var atts = (m.content || []).filter(function (b) { return b.type === 'image' || b.type === 'file'; });
    if (atts.length) {
      var row = h('div.att-row');
      atts.forEach(function (b) {
        if (b.type === 'image') row.appendChild(h('img.att-img', { src: 'data:' + b.mime + ';base64,' + b.data, alt: b.name || '' }));
        else row.appendChild(h('span.att', { html: '<span class="fi">' + U.icon('file') + '</span><span>' + U.esc(b.name) + '</span>' }));
      });
      bubble.appendChild(row);
    }
    var text = (m.meta && m.meta.display) || Engine.textOf(m.content);
    if (text) bubble.appendChild(document.createTextNode(text));
    var n = h('div.msg.user', { dataset: { id: m.id } }, bubble,
      h('div.meta-row',
        iconBtn('copy', 'Salin', function () { copyText(Engine.textOf(m.content)); }),
        iconBtn('edit', 'Edit & kirim ulang', function () { editUser(m, n); }),
        conv && conv.mode === 'code' ? iconBtn('history', 'Kembalikan kode & percakapan ke titik ini', function () { rewindTo(m); }) : null,
        m.ts ? h('span.info', { title: new Date(m.ts).toLocaleString('id-ID'), text: timeLabel(m.ts) }) : null));
    return n;
  }

  function timeLabel(ts) {
    var d = new Date(ts), now = new Date();
    var t = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === now.toDateString() ? t : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' ' + t;
  }

  var SYN_LABEL = {
    'artifact-fix': ['refresh', 'Edit artifact gagal — AI diminta menulis ulang'],
    'file-nudge': ['filePlus', 'AI diminta membuat file sungguhan, bukan kode'],
    review: ['shield', 'Peninjau meminta perbaikan — dikirim ke agen'],
    'continue': ['refresh', 'Batas token keluaran tercapai — dilanjutkan otomatis'],
    'todo-nudge': ['list', 'Rencana kerja belum selesai — agen melanjutkan otomatis'],
    'design-polish': ['sparkle', 'Pemolesan desain otomatis oleh art director'],
    stuck: ['alert', 'Agen berulang gagal — diminta berhenti & memikir ulang (hemat token)'],
  };

  function syntheticNode(m) {
    var key = m.id + ':syn';
    var open = !!openState.get(key);
    var box = h('div.think' + (open ? '.open' : ''),
      h('div.th-head', { html: U.icon('chevronRight', 'chev') + U.icon((SYN_LABEL[m.meta.kind] || SYN_LABEL.review)[0]) + '<span>' + (SYN_LABEL[m.meta.kind] || SYN_LABEL.review)[1] + '</span>', onclick: function () { openState.set(key, !openState.get(key)); box.classList.toggle('open'); } }),
      h('div.th-body', h('div.md', { html: MD.render(Engine.textOf(m.content)) })));
    return h('div.msg.synthetic-note', { dataset: { id: m.id } }, box);
  }

  function reviewNode(m) {
    var cls = m.state === 'pass' ? '.pass' : '';
    var head, body = null;
    if (m.state === 'running') head = '<span class="spin"></span><span class="shimmer">Peninjau independen sedang memeriksa hasil kerja…</span>';
    else if (m.state === 'pass') head = U.icon('check') + '<span>Lolos verifikasi peninjau' + (m.reviewer ? ' (' + U.esc(m.reviewer) + ')' : '') + '</span>';
    else if (m.state === 'needs_work') {
      head = U.icon('alert') + '<span>Peninjau menemukan ' + m.issues.length + ' masalah — agen memperbaikinya</span>';
      body = h('ul', m.issues.map(function (i) { return h('li', { text: i }); }));
    } else if (m.state === 'error') head = U.icon('alert') + '<span>Verifikasi gagal dijalankan: ' + U.esc(m.error || '') + '</span>';
    else head = '<span>Verifikasi dilewati</span>';
    return h('div.msg', { dataset: { id: m.id } }, h('div.review-card' + cls, h('div.rh', { html: head }), body));
  }

  /* Kartu Tim Agen: tiap agen khusus (Arsitek, UI, Sistem, Bug Test, Keamanan…) dengan statusnya. */
  function teamNode(m) {
    var R = (window.Team && Team.ROLES) || {};
    var running = m.state === 'running';
    var head = running ? '<span class="spin"></span><span class="shimmer">Tim Agen bekerja…</span>'
      : m.solo ? U.icon('check') + '<span>Tim Agen: cukup satu agen untuk tugas ini</span>'
      : m.state === 'stopped' ? U.icon('alert') + '<span>Tim Agen dihentikan</span>'
      : U.icon('check') + '<span>Tim Agen selesai · ' + m.stages.length + ' tahap</span>';
    var list = h('div.team-stages', m.stages.map(function (s) {
      var role = R[s.role] || {};
      var ic = s.state === 'running' ? '<span class="spin"></span>' : s.state === 'pass' ? U.icon('check') : s.state === 'needs_work' || s.state === 'error' ? U.icon('alert') : U.icon('info');
      var live = s.state === 'running' && s.live && s.live.output ? h('pre.team-live', { text: String(s.live.output).split('\n').slice(-4).join('\n') }) : null;
      var rep = s.report && s.state !== 'running' ? h('details.team-rep', h('summary', { text: 'Laporan' }), h('div', { text: s.report })) : null;
      return h('div.team-stage.' + (s.state || 'running'),
        h('div.ts-head', { html: '<span class="ts-ic">' + U.icon(role.icon || 'cpu') + '</span><b>' + U.esc(s.name || role.name || s.role) + '</b><span class="ts-title">' + U.esc(s.title || '') + '</span><span class="ts-state">' + ic + '</span>' }),
        live, rep);
    }));
    return h('div.msg', { dataset: { id: m.id } }, h('div.review-card.team-card' + (running ? '' : '.pass'), h('div.rh', { html: head }), list));
  }

  function iconBtn(icon, title, fn) {
    return h('button.icon-btn', { title: title, html: U.icon(icon), onclick: function (e) { e.stopPropagation(); fn(e); } });
  }

  function copyText(t) {
    Native.call('app.copy', { text: t }).then(function () { UI.toast('Disalin'); });
  }

  async function rewindTo(m) {
    if (Engine.isRunning(conv.id)) { UI.toast('Hentikan proses yang berjalan dulu', { error: true }); return; }
    var ok = await UI.confirm({ title: 'Kembalikan ke titik ini?', body: 'File yang diubah agen sejak pesan ini akan dipulihkan, dan percakapan dikembalikan ke sebelum pesan ini (teksnya dimasukkan lagi ke kolom input).', ok: 'Kembalikan', danger: true });
    if (!ok) return;
    var res = await Engine.rewindCode(conv, m.id);
    var idx = conv.messages.indexOf(m);
    var text = (m.meta && m.meta.display) || Engine.textOf(m.content);
    conv.messages = conv.messages.slice(0, idx);
    conv.updatedAt = Date.now();
    if (conv.messages.length) Store.saveConv(conv, true);
    Chat.open(conv);
    Chat.setInput(text);
    UI.toast(res.restored + ' file dipulihkan' + (res.problems.length ? ' — ' + res.problems.length + ' tidak bisa: ' + res.problems.slice(0, 3).join(', ') : ''), { error: res.problems.length > 0 });
  }

  function editUser(m, node) {
    if (Engine.isRunning(conv.id)) { UI.toast('Hentikan proses yang berjalan dulu', { error: true }); return; }
    var ta = h('textarea.ta', { value: Engine.textOf(m.content) });
    ta.style.width = '100%';
    var box = h('div', { style: { width: '84%' } }, ta,
      h('div.row', { style: { justifyContent: 'flex-end', marginTop: '8px' } },
        h('button.btn.ghost.sm', { text: 'Batal', onclick: function () { box.replaceWith(userNode(m)); Chat.open(conv); } }),
        h('button.btn.primary.sm', { text: 'Kirim ulang', onclick: function () { Engine.rerunFrom(conv, m.id, ta.value.trim()); } })));
    node.innerHTML = '';
    node.appendChild(box);
    ta.focus();
    ta.style.height = Math.min(320, ta.scrollHeight + 4) + 'px';
  }

  // ---------------------------------------------------------------- assistant

  function reconcile(container, parts, cache) {
    var seen = new Set();
    parts.forEach(function (p, idx) {
      seen.add(p.key);
      var entry = cache.get(p.key);
      if (!entry || entry.sig !== p.sig) {
        var el = p.build();
        if (entry && entry.el.parentNode === container) container.replaceChild(el, entry.el);
        entry = { sig: p.sig, el: el };
        cache.set(p.key, entry);
      }
      var cur = container.children[idx];
      if (cur !== entry.el) container.insertBefore(entry.el, cur || null);
    });
    cache.forEach(function (e, k) { if (!seen.has(k)) { e.el.remove(); cache.delete(k); } });
  }

  function updateAssistant(m, node) {
    // Bukan firstChild: markWork() menyisipkan .work-head di depan .body.
    var body = node.querySelector(':scope > .body');
    var parts = [];
    var info = m.model ? Providers.modelInfo(m.model.providerId, m.model.modelId) : null;
    parts.push({ key: 'tag', sig: 'tag' + (m.model ? m.model.modelId : ''), build: function () {
      return h('div.model-tag', { html: '<span class="logo-mini"></span><span>' + U.esc(info ? info.name : 'Sinai') + '</span>' });
    } });
    if (m.deliberation) parts.push({ key: 'delib', sig: delibSig(m), build: function () { return buildDelib(m); } });
    (m.content || []).forEach(function (b, i) {
      if (b.type === 'thinking') {
        if (!b.text && !m.streaming) return;
        var open = !!openState.get(m.id + ':th' + i);
        parts.push({ key: 'th' + i, sig: 'th' + (open ? (b.text || '').length : 0) + (b.endedAt ? 'e' : '') + (m.streaming ? 's' : '') + open, build: function () { return buildThinking(m, b, i); } });
      } else if (b.type === 'text') {
        if (!b.text) return;
        var po = { fences: conv.mode !== 'code', key: m.id + '-' + i };
        if (Artifacts.hasArtifacts(b.text, po)) {
          Artifacts.parse(b.text, po).forEach(function (s, j) {
            if (s.kind === 'text') {
              if (!s.text.trim()) return;
              parts.push({ key: 'tx' + i + '-' + j, sig: 'tx' + s.text.length + (m.streaming ? 's' : ''), build: function () { return h('div.md', { html: MD.render(s.text, { streaming: m.streaming }) }); } });
            } else {
              parts.push({ key: 'ar' + i + '-' + j, sig: 'ar' + s.id + s.complete + (s.content || '').length + (s.pairs ? s.pairs.length : '') + (m.streaming ? 's' : ''), build: function () { return artifactCard(m, s); } });
            }
          });
          return;
        }
        parts.push({ key: 'tx' + i, sig: 'tx' + b.text.length + (m.streaming ? 's' : ''), build: function () { return h('div.md', { html: MD.render(b.text, { streaming: m.streaming }) }); } });
      } else if (b.type === 'tool_call') {
        parts.push({ key: 'tc' + i, sig: toolSig(m, b), build: function () { return buildTool(m, b, i); } });
      }
    });
    var visible = parts.length > 1;
    if (m.streaming && !visible && !m.status) parts.push({ key: 'typing', sig: 't', build: function () { return h('div.typing', h('i'), h('i'), h('i')); } });
    if (m.deliberation && m.deliberation.finalizing && !Engine.textOf(m.content)) parts.push({ key: 'fin', sig: 'f', build: function () { return h('div.status-line', { html: '<span class="spin"></span><span class="shimmer">Menulis jawaban final…</span>' }); } });
    if (m.status) parts.push({ key: 'status', sig: m.status, build: function () { return h('div.status-line', { html: '<span class="spin"></span>' + U.esc(m.status) }); } });
    if (m.notice) parts.push({ key: 'notice', sig: m.notice, build: function () { return h('div.status-line', { html: U.icon('info') + U.esc(m.notice) }); } });
    if (m.aborted) parts.push({ key: 'aborted', sig: 'a', build: function () { return h('div.status-line', { html: U.icon('stop') + 'Dihentikan' }); } });
    if (m.error) parts.push({ key: 'err', sig: m.error, build: function () { return errorBox(m); } });
    reconcile(body, parts, node.__cache);
    renderMeta(m, node);
  }

  function artifactCard(m, s) {
    var col = Artifacts.collect(conv);
    var art = col.byId[s.id];
    var T = Artifacts.TYPES[(art && art.type) || s.type] || Artifacts.TYPES.html;
    var vIdx = art ? art.versions.map(function (v) { return v.msgId; }).lastIndexOf(m.id) : -1;
    var err = s.kind === 'edit' && col.errors.find(function (e) { return e.msgId === m.id && e.id === s.id; });
    var busy = !s.complete;
    var title = s.kind === 'edit' ? (art ? art.title : s.id) : s.title;
    var sub = busy ? (s.kind === 'edit' ? 'Mengedit…' : 'Membuat… ' + U.fmtTokens(U.estimateTokens(s.content || '')) + ' token')
      : err ? 'Edit gagal: ' + err.error
      : T.label + (vIdx >= 0 && art.versions.length > 1 ? ' · versi ' + (vIdx + 1) : '') + (s.kind === 'edit' ? ' · diedit' : '') + ' · klik untuk membuka';
    return h('div.art-card' + (err ? '.err' : ''), {
      html: '<span class="ai">' + (busy ? '<span class="spin"></span>' : U.icon(err ? 'alert' : T.icon)) + '</span><span class="an"><b>' + U.esc(title) + '</b><span>' + U.esc(sub) + '</span></span>' + U.icon('chevronRight'),
      onclick: function () { Panel.openArtifact(s.id, vIdx >= 0 && vIdx < art.versions.length - 1 ? vIdx : null); },
    });
  }

  function errorBox(m) {
    var needsKey = /API key|Pengaturan|model yang dipilih/.test(m.error);
    return h('div.err-box', h('div', { html: '<b>Terjadi kesalahan.</b> ' + U.esc(m.error) }),
      h('div.acts',
        h('button.btn.sm', { html: U.icon('refresh') + 'Coba lagi', onclick: function () { m.error = null; Engine.continueRun(conv); } }),
        needsKey ? h('button.btn.sm', { html: U.icon('settings') + 'Buka Pengaturan', onclick: function () { Settings.open('providers'); } }) : null,
        h('button.btn.sm.ghost', { html: U.icon('cpu') + 'Ganti model', onclick: function () { Chat.openModelPicker(els.btnModel); } })));
  }

  function renderMeta(m, node) {
    var row = node.querySelector(':scope > .meta-row');
    var key = (m.streaming ? 's' : '') + (m.usage ? m.usage.output : '') + (Engine.isRunning(conv.id) ? 'r' : '');
    if (row.__key === key) return;
    row.__key = key;
    row.innerHTML = '';
    if (m.streaming) return;
    var text = turnText(m);
    if (text) row.appendChild(iconBtn('copy', 'Salin jawaban', function () { copyText(text); }));
    if (!Engine.isRunning(conv.id)) row.appendChild(iconBtn('refresh', 'Buat ulang jawaban', function () { Engine.regenerate(conv); }));
    var u = turnUsage(m);
    if (m.ts) row.appendChild(h('span.info', { title: new Date(m.ts).toLocaleString('id-ID'), text: timeLabel(m.ts) }));
    if (u && (u.input || u.output)) row.appendChild(h('span.info', { title: u.cached ? 'Token dari cache provider ditagih jauh lebih murah (±10%).' : '', text: U.fmtTokens(u.input) + ' masuk' + (u.cached ? ' (' + Math.round(u.cached / Math.max(1, u.input) * 100) + '% cache)' : '') + ' · ' + U.fmtTokens(u.output) + ' keluar' }));
  }

  function turnRange(m) {
    var idx = conv.messages.indexOf(m), s = idx, e = idx;
    while (s > 0 && !(conv.messages[s - 1].role === 'user' && !(conv.messages[s - 1].meta && conv.messages[s - 1].meta.synthetic))) s--;
    while (e < conv.messages.length - 1 && !(conv.messages[e + 1].role === 'user' && !(conv.messages[e + 1].meta && conv.messages[e + 1].meta.synthetic))) e++;
    return conv.messages.slice(s, e + 1);
  }
  function turnText(m) {
    return turnRange(m).filter(function (x) { return x.role === 'assistant'; }).map(function (x) { return Engine.textOf(x.content); }).filter(Boolean).join('\n\n');
  }
  function turnUsage(m) {
    var u = { input: 0, output: 0 };
    turnRange(m).forEach(function (x) { if (x.usage) { u.input += x.usage.input || 0; u.output += x.usage.output || 0; } });
    return u;
  }

  // ---------------------------------------------------------------- thinking & deliberation

  function collapsible(key, headHtml, buildBody, defaultOpen) {
    var open = openState.has(key) ? openState.get(key) : !!defaultOpen;
    var box = h('div.think' + (open ? '.open' : ''));
    var head = h('div.th-head', { html: U.icon('chevronRight', 'chev') + headHtml });
    var bodyEl = h('div.th-body');
    head.addEventListener('click', function () {
      var now = !box.classList.contains('open');
      openState.set(key, now);
      box.classList.toggle('open', now);
      if (now && !bodyEl.__built) { bodyEl.appendChild(buildBody()); bodyEl.__built = true; }
      if (conv) { var m = conv.messages.find(function (x) { return key.indexOf(x.id) === 0; }); if (m) { dirty.add(m.id); scheduleFlush(); } }
    });
    if (open) { bodyEl.appendChild(buildBody()); bodyEl.__built = true; }
    box.appendChild(head);
    box.appendChild(bodyEl);
    return box;
  }

  function buildThinking(m, b, i) {
    var active = m.streaming && !b.endedAt;
    var dur = b.startedAt && b.endedAt ? ' · ' + U.fmtDuration(b.endedAt - b.startedAt) : '';
    var label = active ? '<span class="shimmer">Berpikir…</span>' : '<span>Proses berpikir' + dur + '</span>';
    return collapsible(m.id + ':th' + i, U.icon('bulb') + label, function () {
      return h('div.md', { html: b.redacted && !b.text ? '<p><i>Penalaran disembunyikan oleh provider.</i></p>' : MD.render(b.text || '…') });
    });
  }

  function delibSig(m) {
    var d = m.deliberation, open = !!openState.get(m.id + ':delib');
    return 'd' + d.stages.length + d.stages.map(function (s) { return s.state + (open ? (s.text || '').length + '/' + (s.tools || []).length : ''); }).join(',') + open + (m.streaming ? 's' : '');
  }

  function buildDelib(m) {
    var d = m.deliberation;
    var running = d.stages.some(function (s) { return s.state === 'running'; });
    var total = d.stages.length && d.stages[d.stages.length - 1].endedAt ? d.stages[d.stages.length - 1].endedAt - d.stages[0].startedAt : 0;
    var cur = d.stages[d.stages.length - 1];
    var label = running ? '<span class="shimmer">' + U.esc(cur ? cur.label : 'Berpikir') + '…</span>'
      : '<span>Penalaran mendalam · ' + d.stages.length + ' tahap' + (total ? ' · ' + U.fmtDuration(total) : '') + '</span>';
    return collapsible(m.id + ':delib', U.icon('brain') + label, function () {
      var wrap = h('div');
      d.stages.forEach(function (s) {
        var st = h('div.th-stage', h('b', { text: s.label + (s.state === 'running' ? ' …' : '') }));
        if (s.tools && s.tools.length) st.appendChild(h('div', { style: { fontSize: '12px', color: 'var(--text-3)', margin: '0 0 6px' } }, s.tools.map(function (t) { return h('div', { text: '• ' + t }); })));
        if (s.thinking && !s.text) st.appendChild(h('div.md', { html: MD.render(U.truncateMiddle(s.thinking, 6000)) }));
        if (s.text) st.appendChild(h('div.md', { html: MD.render(s.text, { streaming: s.state === 'running' }) }));
        wrap.appendChild(st);
      });
      return wrap;
    });
  }

  // ---------------------------------------------------------------- tool cards

  function toolResult(callId) {
    for (var i = conv.messages.length - 1; i >= 0; i--) {
      var m = conv.messages[i];
      if (m.role !== 'tool') continue;
      for (var j = 0; j < m.results.length; j++) if (m.results[j].id === callId) return m.results[j];
    }
    return null;
  }

  function toolSig(m, b) {
    var open = !!openState.get(m.id + ':tc' + b.id);
    return [b.state, b.streaming ? (b.argsText || '').length : '', b.live ? b.live.output.length : '', b.display ? 1 : 0, b.approval ? 1 : 0, b.question ? 1 : 0, b.preview ? 1 : 0, open].join('|');
  }

  function toolCtx() {
    var home = Store.info.home, cwd = conv.workspace || null;
    return { cwd: cwd, home: home, abs: function (p) { return U.resolvePath(cwd || home, p, home); } };
  }

  function buildTool(m, b, i) {
    var tool = Engine.toolFor(b.name);
    var key = m.id + ':tc' + b.id;
    var lbl;
    try { lbl = tool ? tool.label(b.args || {}, toolCtx()) : { verb: b.name, target: '' }; } catch (e) { lbl = { verb: b.name, target: '' }; }
    if (b.streaming) lbl = { verb: (tool ? tool.label({}, toolCtx()).verb : b.name), target: 'menyiapkan…' };
    var state = b.streaming ? 'running' : (b.state || (m.streaming ? 'running' : 'done'));
    if (!b.state && !m.streaming && !b.streaming) {
      var res = toolResult(b.id);
      state = res ? (res.isError ? 'error' : 'done') : 'done';
    }
    if (b.name === 'create_file') return fileCard(m, b, state);
    if (b.name === 'ask_user') return questionCard(m, b, state);
    var cls = { running: '.running', pending: '.pending.open', done: '.ok', error: '.err', denied: '.err' }[state] || '';
    var open = state === 'pending' || (openState.has(key) ? openState.get(key) : (state === 'running' && b.name === 'run_command'));
    var card = h('div.tool' + cls + (open ? '.open' : ''));

    var stat = '';
    if (state === 'running') stat = '<span class="spin"></span>';
    else if (state === 'pending') stat = '<span style="color:var(--accent)">Menunggu izin</span>';
    else if (state === 'denied') stat = '<span>Ditolak</span>';
    else if (state === 'error') stat = '<span style="color:var(--danger)">Gagal</span>';
    if (b.display && b.display.type === 'diff') stat = '<span class="add">+' + b.display.adds + '</span><span class="del">−' + b.display.dels + '</span>' + (state === 'error' ? stat : '');
    if (b.display && b.display.type === 'output' && state !== 'running') stat = '<span' + (b.display.exitCode ? ' style="color:var(--danger)"' : '') + '>exit ' + b.display.exitCode + '</span>';
    if (b.display && b.display.type === 'read') stat = '<span>' + b.display.lines + ' baris</span>';
    if (b.display && b.display.type === 'subagent' && state !== 'running') stat = '<span>' + b.display.steps + ' langkah</span>';
    if (state === 'pending' && b.approval && b.approval.plan) stat = '<span style="color:var(--accent)">Menunggu persetujuan</span>';
    if (b.blocked) stat = '<span style="color:var(--warn,#d4a537)" title="' + U.esc('Diblokir otomatis: ' + b.blocked) + '">Dilewati demi keamanan</span>';

    var head = h('div.tool-head', { html:
      '<span class="tic">' + U.icon(tool ? tool.icon : 'wrench') + '</span>' +
      '<span class="tl"><b>' + U.esc(lbl.verb) + '</b><code>' + U.esc(lbl.target || '') + '</code></span>' +
      '<span class="ts">' + stat + '</span>' + U.icon('chevronRight', 'chev') });
    head.addEventListener('click', function () {
      if (state === 'pending') return;
      openState.set(key, !card.classList.contains('open'));
      dirty.add(m.id);
      scheduleFlush();
    });
    card.appendChild(head);
    if (open) card.appendChild(toolBody(m, b, state, tool));
    return card;
  }

  /* A generated file in the chat: a card that opens it in the canvas. */
  function fileCard(m, b, state) {
    var a = b.args || {};
    var d = b.display && b.display.type === 'file' ? b.display : null;
    var fmt = String((d && d.format) || a.format || '').toLowerCase();
    var icon = { presentation: 'play', spreadsheet: 'list', image: 'image', video: 'play' }[(d && d.kind) || a.kind] || 'file';
    var label = (Outputs.FORMAT_LABEL[fmt] || fmt.toUpperCase() || 'File');
    if (!d) {
      var running = state === 'running' || b.streaming;
      var err = state === 'error' || state === 'denied';
      var res = err ? toolResult(b.id) : null;
      var live = b.live && b.live.output ? b.live.output : '';
      return h('div.art-card.file-card' + (err ? '.err' : ''), {
        html: '<span class="ai">' + (running ? '<span class="spin"></span>' : U.icon(err ? 'alert' : icon)) + '</span><span class="an"><b>' +
          U.esc(a.filename || a.title || ('Membuat ' + label)) + '</b><span>' +
          U.esc(running ? (live || (b.streaming ? 'Menulis isi ' + label + '…' : 'Membuat ' + label + '…')) : err ? 'Gagal: ' + ((res && res.content) || 'file tidak dibuat').replace(/^Error:\s*/, '').slice(0, 160) : label) + '</span></span>',
      });
    }
    var act = Panel.fileActions(d);
    var card = h('div.art-card.file-card', {
      title: d.path,
      onclick: function () { if (conv.mode === 'code') act.quicklook(); else Panel.openArtifact(d.id); },
    });
    card.innerHTML = '<span class="ai">' + U.icon(icon) + '</span><span class="an"><b>' + U.esc(d.name) + '</b><span>' + U.esc(label + ' · ' + Outputs.fmtSize(d.size || 0) +
      (d.slides ? ' · ' + d.slides + ' slide' : '') + (d.duration ? ' · ' + Math.round(d.duration) + ' dtk' : '') + (conv.mode === 'code' ? (U.isMac() ? ' · klik untuk Quick Look' : ' · klik untuk membuka') : ' · klik untuk melihat')) + '</span></span>';
    var acts = h('span.fc-acts');
    [U.isMac() ? ['eye', 'Quick Look', act.quicklook] : null, ['external', 'Buka', act.open], ['folder', U.plat('Tampilkan di Finder'), act.reveal], U.feature('share') ? ['share', 'Bagikan', act.share] : null].filter(Boolean).forEach(function (x) {
      acts.appendChild(h('button.icon-btn', { title: x[1], html: U.icon(x[0]), onclick: function (e) { e.stopPropagation(); x[2](); } }));
    });
    card.appendChild(acts);
    return card;
  }

  function diffView(disp) {
    var box = h('div.diff');
    (disp.hunks || []).forEach(function (l) {
      if (l.gap) { box.appendChild(h('div.gap', { text: l.note ? '… diff dipotong' : '⋯ ' + l.gap + ' baris tidak berubah' })); return; }
      box.appendChild(h('div.ln.' + (l.t === '+' ? 'add' : l.t === '-' ? 'del' : 'ctx'), h('span.no', { text: String(l.no) }), h('span.tx', { text: l.s })));
    });
    return box;
  }

  function toolBody(m, b, state, tool) {
    var body = h('div.tool-body');
    var a = b.args || {};
    if (b.name === 'exit_plan_mode') {
      body.appendChild(h('div.md.plan-md', { style: { padding: '10px 14px' }, html: MD.render(a.plan || '') }));
      if (state === 'pending' && b.approval) body.appendChild(approvalBar(b));
      return body;
    }
    if (b.name === 'task') {
      body.appendChild(h('div.note', { text: a.prompt || '' }));
      var acts = b.live ? b.live.output : (b.display && b.display.actions ? b.display.actions.join('\n') : '');
      if (acts) body.appendChild(h('pre', { text: acts }));
      if (b.display && b.display.report) body.appendChild(h('div.md', { style: { padding: '8px 12px', borderTop: '1px solid var(--stroke-2)' }, html: MD.render(b.display.report) }));
      return body;
    }
    if (b.name === 'run_command') {
      body.appendChild(h('div.cmd', { text: a.command || '' }));
      var out = b.live ? b.live.output : (b.display ? b.display.output : '');
      if (out) body.appendChild(h('pre', { text: out }));
      else if (state === 'running') body.appendChild(h('div.note', { text: 'Berjalan…' }));
      if (b.display && b.display.timedOut) body.appendChild(h('div.note', { text: 'Dihentikan karena melewati batas waktu.' }));
    } else if (state === 'pending' && b.preview) {
      body.appendChild(diffView(b.preview));
    } else if (b.display) {
      var d = b.display;
      if (d.type === 'diff') body.appendChild(diffView(d));
      else if (d.type === 'text') body.appendChild(h('pre', { text: d.text }));
      else if (d.type === 'links') {
        var ul = h('div', { style: { padding: '8px 12px', fontSize: '12.5px' } });
        d.items.forEach(function (it) { ul.appendChild(h('div', { style: { margin: '3px 0' } }, h('a', { href: it.url, dataset: { ext: '1' }, text: it.title }), h('div', { style: { color: 'var(--text-3)', fontSize: '11.5px' }, text: it.url }))); });
        body.appendChild(ul);
      } else if (d.type === 'read') body.appendChild(h('div.note', { text: 'Membaca ' + (d.shown || d.lines) + ' dari ' + d.lines + ' baris.' }));
      else if (d.type === 'todos') body.appendChild(h('div.note', { text: 'Rencana diperbarui — lihat panel di atas kolom input.' }));
    }
    if (state === 'error' || state === 'denied') {
      var r = toolResult(b.id);
      if (r && r.content && b.name !== 'run_command') body.appendChild(h('pre', { text: r.content }));
    }
    if (b.live && b.name !== 'run_command' && !b.display) body.appendChild(h('pre', { text: b.live.output }));
    if (state === 'pending' && b.approval) body.appendChild(approvalBar(b));
    if (!body.childNodes.length) {
      var res = toolResult(b.id);
      body.appendChild(h('pre', { text: res ? U.truncateMiddle(res.content, 4000) : JSON.stringify(a, null, 2) }));
    }
    return body;
  }

  /* ask_user: options as buttons + a free-text answer; read-only once answered. */
  function questionCard(m, b, state) {
    var qs = (b.question && b.question.questions) || (b.display && b.display.questions) || [{ question: (b.args || {}).question || '', options: [] }];
    var answered = b.display && b.display.answers;
    var card = h('div.qcard' + (state === 'pending' ? '.pending' : ''));
    var picks = qs.map(function () { return null; });
    var send = h('button.btn.primary.sm', { html: U.icon('check') + 'Kirim jawaban', disabled: true });
    function ready() { send.disabled = picks.some(function (p) { return !p; }); }
    qs.forEach(function (q, qi) {
      var box = h('div.q-item', h('div.q-text', { html: U.icon('chat') + '<span>' + U.esc(q.question) + '</span>' }));
      if (answered) {
        box.appendChild(h('div.q-answer', { html: U.icon('check') + '<b>' + U.esc(answered[qi] || '—') + '</b>' + (b.display.auto ? '<span class="q-auto">dipilih otomatis (mode Otomatis penuh)</span>' : '') }));
      } else if (state === 'pending') {
        var opts = h('div.q-opts');
        var other = h('input.inp', { placeholder: 'Atau ketik jawaban sendiri…' });
        (q.options || []).forEach(function (o, oi) {
          var btn = h('button.q-opt', { html: '<b>' + U.esc(o.label) + (oi === 0 ? ' <i>(disarankan)</i>' : '') + '</b>' + (o.description ? '<small>' + U.esc(o.description) + '</small>' : '') });
          btn.addEventListener('click', function () {
            opts.querySelectorAll('.q-opt').forEach(function (x) { x.classList.remove('on'); });
            btn.classList.add('on'); other.value = ''; picks[qi] = o.label; ready();
            if (qs.length === 1) send.click();
          });
          opts.appendChild(btn);
        });
        other.addEventListener('input', function () { opts.querySelectorAll('.q-opt').forEach(function (x) { x.classList.remove('on'); }); picks[qi] = other.value.trim() || null; ready(); });
        other.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !send.disabled) { e.preventDefault(); send.click(); } });
        box.appendChild(opts);
        box.appendChild(other);
      } else box.appendChild(h('div.q-answer.muted', { text: 'Pertanyaan dilewati' }));
      card.appendChild(box);
    });
    if (state === 'pending' && !answered) {
      send.addEventListener('click', function () { Engine.answerApproval(b.id, { allow: true, answers: picks.slice() }); });
      var skip = h('button.btn.sm.ghost', { text: 'Lewati — biar AI yang memutuskan', onclick: function () { Engine.answerApproval(b.id, { allow: true, answers: null }); } });
      card.appendChild(h('div.q-foot', skip, send));
    }
    return card;
  }

  function approvalBar(b) {
    var ap = b.approval;
    var fb = h('input', { placeholder: 'Opsional: beri tahu agen apa yang harus dilakukan…' });
    var allow = h('button.btn.primary.sm', { html: U.icon('check') + 'Izinkan', onclick: function () { Engine.answerApproval(b.id, { allow: true }); } });
    var alwaysLabel = b.name === 'run_command' ? 'Selalu izinkan perintah ini'
      : Engine.toolFor(b.name) && Engine.toolFor(b.name).kind === 'integration' ? 'Selalu izinkan alat ini'
      : Engine.toolFor(b.name) && Engine.toolFor(b.name).kind === 'mcp' ? 'Selalu izinkan alat ini'
      : 'Izinkan semua edit';
    var always = h('button.btn.sm', { text: alwaysLabel, onclick: function () { Engine.answerApproval(b.id, { allow: true, always: true }); } });
    var deny = h('button.btn.sm.danger', { text: 'Tolak', onclick: function () { Engine.answerApproval(b.id, { allow: false, feedback: fb.value.trim() }); } });
    fb.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); Engine.answerApproval(b.id, fb.value.trim() ? { allow: false, feedback: fb.value.trim() } : { allow: true }); }
    });
    if (ap.plan) {
      fb.placeholder = 'Apa yang perlu diubah dari rencana ini? (lalu tekan Revisi)';
      allow.innerHTML = U.icon('check') + 'Setujui & jalankan';
      deny.textContent = 'Revisi rencana';
      deny.className = 'btn sm';
    }
    var q = ap.plan ? 'Tinjau rencana di atas. Setujui untuk mulai mengerjakan, atau minta revisi.'
      : ap.danger ? '<b>Perhatian:</b> ' + U.esc(ap.danger) : ap.warn ? U.esc(ap.warn) + ' Izinkan?' : 'Sinai ingin melakukan tindakan ini. Izinkan?';
    var bar = h('div.approve', h('div.q' + (ap.danger ? '.danger' : ''), { html: U.icon(ap.danger ? 'alert' : ap.plan ? 'list' : 'shield') + '<span>' + q + '</span>' }), fb, deny, ap.danger || ap.plan || ap.once ? null : always, allow);
    setTimeout(function () { if (document.activeElement === document.body || document.activeElement === els.input) allow.focus(); }, 30);
    return bar;
  }

  // ---------------------------------------------------------------- clicks inside messages

  function onMessagesClick(e) {
    var a = e.target.closest('a[data-ext], a[href^="http"]');
    if (a) {
      e.preventDefault();
      Native.call('app.openURL', { url: a.getAttribute('href') }).catch(function () {});
      return;
    }
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var block = btn.closest('.codeblock');
    var code = block ? block.querySelector('code').textContent : '';
    if (btn.dataset.act === 'copy-code') {
      Native.call('app.copy', { text: code }).then(function () {
        var span = btn.querySelector('span');
        if (span) { span.textContent = 'Tersalin'; setTimeout(function () { span.textContent = 'Salin'; }, 1400); }
      });
    } else if (btn.dataset.act === 'preview-code') {
      var lang = block.dataset.lang;
      var html = lang === 'svg' ? '<!doctype html><html><body style="margin:0;display:grid;place-items:center;min-height:100vh">' + code + '</body></html>' : code;
      Native.call('app.preview', { html: html, title: 'Pratinjau — ' + (conv.title || 'Sinai') });
    }
  }

  // ================================================================ header / empty / todos

  function renderHeader() {
    if (!conv) return;
    els.convTitle.textContent = conv.messages.length ? conv.title : (conv.mode === 'code' ? 'Sesi coding baru' : 'Percakapan baru');
    var r = Providers.resolve(conv.model || Engine.defaultModelRef(conv.mode));
    var lvl = Engine.LEVELS[Engine.levelOf(conv)];
    els.convSub.textContent = r ? (r.info.name + ' · ' + r.provider.name + ' · ' + lvl.label) : '';
    var code = conv.mode === 'code';
    els.chipWorkspace.hidden = !code;
    els.chipPermission.hidden = !code;
    if (code) {
      els.chipWorkspace.querySelector('span').textContent = conv.workspace ? U.basename(conv.workspace) : 'Pilih folder';
      els.chipWorkspace.title = conv.workspace || 'Pilih folder proyek';
      var pm = conv.permission || Store.settings.permission;
      var lbl = { ask: 'Tanya dulu', edits: 'Edit otomatis', auto: 'Otomatis penuh', plan: 'Rencana dulu' }[pm];
      els.chipPermission.querySelector('span').textContent = lbl;
      els.chipPermission.classList.toggle('warn', pm === 'auto');
    }
    renderUsageChip();
    var proj = conv.projectId && Store.project(conv.projectId);
    els.chipProject.hidden = !proj;
    if (proj) els.chipProject.querySelector('span').textContent = proj.name;
    UI.syncDrag();
  }

  /* Header chip: how full the model's context window is for this conversation. */
  function renderUsageChip() {
    var r = Providers.resolve(conv.model || Engine.defaultModelRef(conv.mode));
    els.chipUsage.hidden = !r;
    if (!r) return;
    var ctx = r.info.ctx || 128000, used = conv.lastInputTokens || 0;
    var pct = Math.min(100, Math.round(used / ctx * 100));
    var hs = Health.state(r.provider.id, r.modelId);
    els.chipUsage.querySelector('span').textContent = (used ? pct + '% konteks' : U.fmtTokens(ctx) + ' konteks');
    // Ring under the chat (like Claude): how full the context is; turns amber/red near the limit.
    var ring = els.usageRing;
    if (ring) {
      // An empty ring looks like a stuck spinner — show it only once there is usage.
      ring.hidden = !used;
      var C = 2 * Math.PI * 14, shown = Math.max(used ? 3 : 0, pct);
      var bar = ring.querySelector('.bar');
      bar.style.strokeDasharray = C.toFixed(1);
      bar.style.strokeDashoffset = (C * (1 - shown / 100)).toFixed(1);
      ring.classList.toggle('warn', pct >= 60 && pct < 85);
      ring.classList.toggle('bad', pct >= 85 || hs === 'err');
      var mu = Health.modelUsage(r.provider.id, r.modelId);
      ring.title = 'Konteks ' + pct + '% (' + U.fmtTokens(used) + ' / ' + U.fmtTokens(ctx) + ')\nHari ini: ' + U.fmtTokens(mu.today.i + mu.today.o) + ' token · ' + mu.today.r + ' permintaan\nKlik untuk detail pemakaian & batas';
    }
    els.chipUsage.classList.toggle('warn', pct >= 75 || hs === 'warn');
    els.chipUsage.classList.toggle('bad', hs === 'err');
  }

  /* Popover: context window, this conversation, today's tokens per model and
     per API key, rate-limit headers and the account balance of the provider. */
  Chat.openUsage = function (anchor) {
    var r = Providers.resolve(conv && conv.model || Engine.defaultModelRef(conv ? conv.mode : 'chat'));
    var el = h('div.popover.usage-pop');
    var pop;
    function kv(rows) {
      var g = h('div.kv');
      rows.forEach(function (x) { g.appendChild(h('span', { text: x.label })); g.appendChild(h('b' + (x.strong ? '.strong' : ''), { text: x.value })); });
      return g;
    }
    function tok(u) { return U.fmtTokens(u.i) + ' masuk · ' + U.fmtTokens(u.o) + ' keluar · ' + u.r + '×'; }
    async function paint() {
      el.innerHTML = '';
      if (!r) { el.appendChild(h('p.hint', { text: 'Belum ada model. Tambahkan provider di Pengaturan.' })); return; }
      var p = r.provider, ctx = r.info.ctx || 128000, used = conv && conv.lastInputTokens || 0, pct = Math.min(100, used / ctx * 100);
      el.appendChild(h('div.up-head', h('span.hdot.h-' + Health.state(p.id, r.modelId)),
        h('div', h('b', { text: r.info.name || r.modelId }), h('small', { text: p.name + ' · ' + Health.describe(p.id, r.modelId) }))));
      el.appendChild(h('div.up-sec', h('h5', { text: 'Jendela konteks percakapan ini' }),
        h('div.up-bar', h('i', { style: { width: pct.toFixed(1) + '%', background: pct > 85 ? 'var(--danger)' : pct > 70 ? 'var(--warn, #d4a537)' : 'var(--accent)' } })),
        kv([{ label: 'Terpakai', value: U.fmtTokens(used) + ' / ' + U.fmtTokens(ctx) + ' (' + pct.toFixed(0) + '%)', strong: true },
          { label: 'Maks keluaran / respons', value: r.info.maxOut ? U.fmtTokens(r.info.maxOut) : 'bawaan provider' },
          { label: 'Total percakapan', value: conv && conv.usage ? U.fmtTokens(conv.usage.input) + ' masuk · ' + U.fmtTokens(conv.usage.output) + ' keluar' : '—' },
          { label: 'Dari cache (murah)', value: conv && conv.usage && conv.usage.cached ? U.fmtTokens(conv.usage.cached) + ' (' + Math.round(conv.usage.cached / Math.max(1, conv.usage.input) * 100) + '%)' : '—' }]),
        h('p.hint', { text: 'Di atas ±72% Sinai meringkas percakapan otomatis supaya tidak terputus.' })));
      var mu = Health.modelUsage(p.id, r.modelId);
      el.appendChild(h('div.up-sec', h('h5', { text: 'Model ini (dilaporkan API penyedia)' }), kv([{ label: 'Hari ini', value: tok(mu.today) }, { label: '30 hari', value: tok(mu.month) }])));
      var keys = await Store.getKeys(p.id);
      var stats = Health.keysOf(p.id);
      var cur = (Store.keyCursor[p.id] || 0) % Math.max(1, keys.length);
      if (keys.length) {
        el.appendChild(h('div.up-sec', h('h5', { text: 'API key (' + keys.length + ')' }), kv(keys.map(function (k, i) {
          var tag = Providers.keyTag(k), st = stats.find(function (x) { return x.tag === tag; });
          return { label: (i === cur ? '● ' : '○ ') + (i ? 'Cadangan ' + i : 'Utama') + ' ' + tag,
            value: (st ? (st.ok ? 'OK' : st.msg) + ' · hari ini ' + U.fmtTokens(st.today.i + st.today.o) + ' · 30 hr ' + U.fmtTokens(st.month.i + st.month.o) : 'belum dipakai'), strong: i === cur };
        }))));
      }
      var lim = Health.rateLimitRows(p.id);
      if (lim && lim.rows.length) el.appendChild(h('div.up-sec', h('h5', { text: 'Batas rate (header respons, ' + Health.ago(lim.at) + ')' }), kv(lim.rows.slice(0, 8))));
      var acctBox = h('div.up-sec', h('h5', { text: 'Saldo / kuota akun' }));
      el.appendChild(acctBox);
      function acct(a) {
        while (acctBox.childNodes.length > 1) acctBox.removeChild(acctBox.lastChild);
        if (!a) { acctBox.appendChild(h('div.status-line', { html: '<span class="spin"></span>Mengambil dari ' + U.esc(p.name) + '…' })); return; }
        var rows = a.balance.concat(a.usage).slice(0, 6);
        if (rows.length) acctBox.appendChild(kv(rows));
        else acctBox.appendChild(h('p.hint', { text: a.error || (a.notes && a.notes[0]) || 'Penyedia ini tidak menyediakan data saldo lewat API.' }));
      }
      var cached = Health.cachedAccount(p.id);
      if (cached && Date.now() - cached.at < 5 * 60000) acct(cached);
      else { acct(null); Health.account(p).then(acct).catch(function (e) { acct({ balance: [], usage: [], notes: [], error: e.message }); }); }
      el.appendChild(h('div.up-foot',
        h('button.btn.sm', { html: U.icon('zap') + 'Tes model', onclick: async function (e) { e.currentTarget.disabled = true; await Health.test(p.id, r.modelId); paint(); } }),
        h('button.btn.sm.ghost', { html: U.icon('target') + 'Semua pemakaian', onclick: function () { pop.close(); Settings.open('usage'); } })));
    }
    var ar = anchor.getBoundingClientRect();
    pop = UI.popover(anchor, el, { align: 'end', placement: ar.top > window.innerHeight / 2 ? 'top' : 'bottom' });
    paint();
  };

  function greeting() {
    var hr = new Date().getHours();
    var g = hr < 11 ? 'Selamat pagi' : hr < 15 ? 'Selamat siang' : hr < 19 ? 'Selamat sore' : 'Selamat malam';
    var n = (Store.settings.profile.name || Store.info.fullName || '').split(' ')[0];
    return g + (n ? ', ' + n : '');
  }

  function renderEmpty() {
    var empty = !conv.messages.length;
    els.empty.hidden = !empty;
    if (!empty) return;
    var key = conv.mode + '|' + (conv.workspace || '') + '|' + Store.settings.providers.length + '|' + (conv.projectId || '');
    if (els.empty.__key === key) return;
    els.empty.__key = key;
    els.empty.innerHTML = '';
    els.empty.appendChild(h('div.orb'));
    var sugg;
    if (conv.mode === 'code') {
      els.empty.appendChild(h('h1', { text: 'Sinai Code' }));
      els.empty.appendChild(h('p', { text: U.plat('Agen coding yang membaca, mengedit, dan menjalankan perintah langsung di Mac Anda — dengan izin Anda.') }));
      if (!conv.workspace) {
        els.empty.appendChild(h('button.btn.primary', { html: U.icon('folder') + 'Pilih folder proyek', onclick: function () { Chat.pickWorkspace(); } }));
        var rec = Store.settings.recentWorkspaces || [];
        if (rec.length) {
          var list = h('div', { style: { marginTop: '18px', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' } });
          list.appendChild(h('div', { style: { fontSize: '12px', color: 'var(--text-3)' }, text: 'Terakhir dibuka' }));
          rec.slice(0, 5).forEach(function (p) { list.appendChild(h('button.chip', { html: U.icon('folder') + '<span>' + U.esc(U.tildify(p, Store.info.home)) + '</span>', onclick: function () { setWorkspace(p); } })); });
          els.empty.appendChild(list);
        }
        return;
      }
      sugg = [
        ['Pahami proyek', 'Jelaskan arsitektur dan struktur proyek ini'],
        ['Cari & perbaiki bug', 'Temukan bug atau potensi masalah di proyek ini lalu perbaiki'],
        ['Buat SINAI.md', '/init'],
        ['Tinjau perubahan', '/review'],
      ];
    } else if (conv.mode === 'design') {
      els.empty.appendChild(h('h1', { text: 'Sinai Design' }));
      els.empty.appendChild(h('p', { text: 'Ubah ide menjadi desain yang hidup — situs, aplikasi, dashboard, slide, poster, logo, diagram. Revisi dengan chat atau klik elemen langsung di kanvas.' }));
      sugg = [
        ['Landing page', 'Buat landing page modern untuk aplikasi fintech bernama "Tabung" dengan hero, fitur, harga, testimoni dan FAQ'],
        ['Dashboard', 'Rancang dashboard analitik penjualan interaktif dengan grafik, filter tanggal, dan tabel transaksi (React)'],
        ['Aplikasi mobile', 'Desain 3 layar aplikasi mobile pemesanan kopi: beranda, detail produk, keranjang — tampilkan dalam mockup ponsel'],
        ['Slide presentasi', 'Buat deck presentasi 8 slide tentang strategi pemasaran digital untuk UMKM'],
        ['Poster / flyer', 'Desain poster acara konser musik indie "Senja Fest" ukuran A4 dengan tipografi berani'],
        ['Logo SVG', 'Buat 3 konsep logo SVG minimalis untuk brand kopi "Kopi Rindu"'],
      ];
    } else {
      els.empty.appendChild(h('h1', { text: conv.projectId && Store.project(conv.projectId) ? Store.project(conv.projectId).name : greeting() }));
      els.empty.appendChild(h('p', { text: Store.settings.providers.length ? 'Apa yang bisa saya bantu hari ini?' : 'Tambahkan API key untuk mulai — DeepSeek, OpenAI, Claude, Gemini, OpenRouter, Ollama, dan lainnya.' }));
      if (!Store.settings.providers.length) {
        els.empty.appendChild(h('button.btn.primary', { html: U.icon('key') + 'Hubungkan API key', onclick: function () { Settings.onboarding(); } }));
        return;
      }
      sugg = [
        ['Jelaskan dengan sederhana', 'Jelaskan cara kerja internet seperti saya berumur 12 tahun'],
        ['Tulis kode', 'Tulis fungsi Python untuk mendeteksi palindrom beserta tesnya'],
        ['Analisis & rencanakan', 'Bantu saya membuat rencana belajar machine learning 3 bulan'],
        ['Riset terbaru', 'Apa perkembangan terbaru di dunia AI minggu ini?'],
      ];
    }
    var grid = h('div.suggestions');
    sugg.forEach(function (s) {
      grid.appendChild(h('button.sugg', { html: '<b>' + U.esc(s[0]) + '</b>' + U.esc(s[1]), onclick: function () {
        if (s[1].charAt(0) === '/') { Chat.setInput(s[1]); submit(); } else Chat.setInput(s[1]);
      } }));
    });
    els.empty.appendChild(grid);
  }

  function renderTodos() {
    var p = els.todoPanel;
    var todos = conv && conv.mode === 'code' ? (conv.todos || []) : [];
    var running = conv && Engine.isRunning(conv.id);
    var done = todos.filter(function (t) { return t.status === 'completed'; }).length;
    if (!todos.length || (!running && done === todos.length)) { p.hidden = true; return; }
    p.hidden = false;
    p.innerHTML = '';
    p.appendChild(h('div.th', { html: U.icon('list') + '<span>Rencana kerja</span><span class="prog">' + done + '/' + todos.length + '</span>' }));
    todos.forEach(function (t) {
      p.appendChild(h('div.todo' + (t.status === 'completed' ? '.done' : t.status === 'in_progress' ? '.doing' : ''),
        h('span.box', { html: t.status === 'completed' ? U.icon('check') : '' }), h('span', { text: t.content })));
    });
  }

  // ================================================================ composer

  function autosize() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(260, els.input.scrollHeight) + 'px';
    renderSendState();
  }

  function renderSendState() {
    var running = conv && Engine.isRunning(conv.id);
    els.btnSend.classList.toggle('stop', !!running);
    els.btnSend.innerHTML = U.icon(running ? 'stop' : 'arrowUp');
    els.btnSend.title = running ? 'Hentikan (Esc)' : 'Kirim (↵)';
    els.btnSend.disabled = !running && !els.input.value.trim() && !attachments.length;
  }

  function renderComposerState() {
    renderTemplateBtn();
    if (conv && els.usageRing) { try { renderUsageChip(); } catch (e) { /* not ready */ } }
    if (!conv) return;
    renderSendState();
    var level = Engine.levelOf(conv);
    els.btnLevel.className = 'toggle lvl-' + level;
    els.btnLevel.querySelector('span').textContent = Engine.LEVELS[level].label;
    var web = Engine.webOn(conv);
    els.btnWeb.classList.toggle('on', !!web);
    if (els.btnTeam) {
      els.btnTeam.hidden = conv.mode !== 'code';
      els.btnTeam.classList.toggle('on', conv.team != null ? !!conv.team : Store.settings.agent.team !== false);
    }
    var r = Providers.resolve(conv.model || Engine.defaultModelRef(conv.mode));
    els.btnModel.classList.toggle('missing', !r);
    els.btnModel.querySelector('span').textContent = r ? r.info.name : 'Pilih model';
    var hs = r ? Health.state(r.provider.id, r.modelId) : 'unknown';
    els.btnModel.setAttribute('data-health', hs);
    els.btnModel.title = r ? r.info.name + ' — ' + Health.describe(r.provider.id, r.modelId) + ' (' + U.kbd('⇧⌘M') + ' untuk ganti)' : 'Pilih model (' + U.kbd('⇧⌘M') + ')';
    els.input.placeholder = conv.mode === 'code'
      ? (conv.workspace ? 'Minta Sinai mengerjakan sesuatu di ' + U.basename(conv.workspace) + '…  (@ untuk file, / untuk perintah)' : 'Pilih folder proyek dulu, lalu jelaskan tugasnya…')
      : conv.mode === 'design' ? 'Jelaskan desain yang ingin dibuat atau diubah…' : 'Tanyakan apa saja…';
    var styleId = conv.style || Store.settings.style || 'normal';
    els.btnStyle.hidden = conv.mode === 'code';
    els.btnStyle.classList.toggle('on', styleId !== 'normal');
    els.btnStyle.querySelector('span').textContent = styleName(styleId);
    els.footNote.textContent = conv.mode === 'code'
      ? U.plat('Agen bekerja langsung di Mac Anda.') + ' Mode izin: ' + ({ ask: 'tanya sebelum mengubah', edits: 'edit file otomatis', auto: 'otomatis penuh', plan: 'rencana dulu (hanya membaca)' }[conv.permission || Store.settings.permission]) + '.'
      : 'AI bisa keliru. Periksa kembali informasi penting.';
  }
  Chat.refreshComposer = function () { renderComposerState(); renderHeader(); };

  function onInputKey(e) {
    if (mention.open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); mention.idx = Math.min(mention.items.length - 1, mention.idx + 1); renderMention(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); mention.idx = Math.max(0, mention.idx - 1); renderMention(); return; }
      if ((e.key === 'Enter' || e.key === 'Tab') && mention.items.length) {
        var cur = mention.items[mention.idx];
        // "/review" sudah diketik lengkap + Enter → langsung kirim, bukan sekadar melengkapi.
        if (e.key === 'Enter' && cur && cur.cmd && mention.tok && mention.tok.query.toLowerCase() === cur.cmd.slice(1)) closeMention();
        else { e.preventDefault(); pickMention(cur); return; }
      }
      if (e.key === 'Escape') { e.preventDefault(); closeMention(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      if (Store.settings.sendWithEnter || e.metaKey || (!U.isMac() && e.ctrlKey)) { e.preventDefault(); submit(); }
    } else if (e.key === 'Escape' && conv && Engine.isRunning(conv.id)) {
      e.preventDefault();
      Engine.stop(conv.id);
    }
  }

  async function submit() {
    if (!conv) return;
    if (dictating) { Native.call('dictation.stop'); finishDictation(); }
    if (Engine.isRunning(conv.id)) { Engine.stop(conv.id); return; }
    var text = els.input.value.trim();
    if (pendingFiles) { UI.toast('Tunggu, file masih diproses…', { icon: 'clip' }); return; }
    if (!text && !attachments.length && !contexts.length) return;
    if (text.charAt(0) === '/' && !attachments.length) {
      var handled = await slash(text);
      if (handled) { els.input.value = ''; autosize(); return; }
    }
    if (conv.mode === 'code' && !conv.workspace) {
      var ok = await Chat.pickWorkspace();
      if (!ok) return;
    }
    if (!Providers.resolve(conv.model || Engine.defaultModelRef(conv.mode))) {
      UI.toast('Belum ada model. Tambahkan API key dulu.', { error: true });
      if (!Store.settings.providers.length) Settings.onboarding(); else Chat.openModelPicker(els.btnModel);
      return;
    }
    var att = attachments;
    var display = text;
    if (contexts.length) {
      text = contexts.map(function (c) { return c.text; }).join('\n\n') + '\n\n' + text;
      display = contexts.map(function (c) { return '🎯 ' + c.label; }).join('\n') + '\n' + display;
    }
    if (conv.mode === 'code' && conv.workspace && /(^|\s)@[\w./~-]+/.test(text)) {
      var seen = {};
      var re = /(^|\s)@([\w./~-]+)/g, mm;
      while ((mm = re.exec(text))) {
        var rel = mm[2].replace(/[.,;:]+$/, '');
        if (seen[rel]) continue;
        seen[rel] = 1;
        var abs = U.resolvePath(conv.workspace, rel, Store.info.home);
        var stt = await Native.call('fs.stat', { path: abs }).catch(function () { return { exists: false }; });
        if (!stt.exists) continue;
        var more = await Files.readPath(abs, { vision: currentVision() }).catch(function () { return []; });
        more.forEach(function (a2) { if (a2.kind === 'file') a2.name = rel; att.push(a2); });
      }
    }
    attachments = [];
    contexts = [];
    renderAttachments();
    els.input.value = '';
    autosize();
    closeMention();
    stick = true;
    Engine.send(conv, { text: text, attachments: att, display: display !== text ? display : undefined });
  }

  Chat.sendText = function (text) {
    if (!conv || Engine.isRunning(conv.id)) return;
    stick = true;
    Engine.send(conv, { text: text });
  };

  Chat.addContext = function (c) {
    contexts.push(c);
    renderAttachments();
    els.input.focus();
  };

  /* Konteks yang diganti, bukan ditumpuk (mis. board yang terus diedit). */
  Chat.setContext = function (c) {
    contexts = contexts.filter(function (x) { return !(x.kind === c.kind && x.key === c.key); });
    contexts.push(c);
    renderAttachments();
  };

  /* Error dari live view (Browser) dikirim sebagai konteks + perintah singkat. */
  Chat.insertText = function (text) {
    Chat.setContext({ kind: 'browser', key: 'browser-errors', label: 'Error live view', text: text });
    if (!els.input.value.trim()) els.input.value = 'Perbaiki error yang muncul di live view, lalu verifikasi ulang.';
    autosize();
    els.input.focus();
  };

  Chat.insertMention = function (rel) {
    var v = els.input.value;
    els.input.value = v + (v && !/\s$/.test(v) ? ' ' : '') + '@' + rel + ' ';
    autosize();
    els.input.focus();
  };

  function currentVision() {
    var r = conv && Providers.resolve(conv.model || Engine.defaultModelRef(conv.mode));
    return !!(r && r.info.vision);
  }

  // ---------------------------------------------------------------- @ mentions (code mode)

  async function workspaceFiles() {
    if (mention.files && mention.ws === conv.workspace && Date.now() - mention.filesAt < 60000) return mention.files;
    var r = await Native.call('fs.glob', { root: conv.workspace, pattern: '**/*', limit: 8000 }).catch(function () { return { files: [] }; });
    mention.files = r.files.slice().sort();
    mention.ws = conv.workspace;
    mention.filesAt = Date.now();
    return mention.files;
  }

  function mentionToken() {
    var pos = els.input.selectionStart, before = els.input.value.slice(0, pos);
    var m = /(^|\s)@([\w./~-]*)$/.exec(before);
    return m ? { query: m[2], start: pos - m[2].length - 1, end: pos } : null;
  }

  // ---------------------------------------------------------------- / perintah & skill (semua mode)

  var SLASH = [
    ['/new', 'Percakapan baru', 'plus'], ['/clear', 'Bersihkan — mulai percakapan baru', 'trash'], ['/compact', 'Ringkas percakapan untuk menghemat konteks', 'layers'],
    ['/model', 'Ganti model AI', 'cpu'], ['/skills', 'Kelola & buat skill', 'settings'], ['/help', 'Pintasan & bantuan', 'bulb'],
    ['/cermin', 'Tarik desain dari Canva/Figma/Notion/Google…, edit di Sinai, dorong balik', 'refresh'], ['/dorong', 'Dorong perubahan cermin ke sumbernya (opsional: nomor halaman)', 'arrowUp'],
    ['/browser', 'Buka Browser live view (URL, localhost, atau file proyek)', 'globe'], ['/tim', 'Aktif/nonaktifkan Tim Agen (mode Code)', 'layers', 'code'],
    ['/init', 'Buat SINAI.md untuk proyek ini', 'file', 'code'], ['/review', 'Tinjau perubahan kode (git diff)', 'search', 'code'], ['/plan', 'Mode rencana: baca & susun rencana dulu', 'list', 'code'],
  ];

  function slashToken() {
    var v = els.input.value, pos = els.input.selectionStart;
    var m = /^\/([\w.-]*)$/.exec(v.slice(0, pos));
    return m && !/\s/.test(v.slice(0, pos)) ? { query: m[1], start: 0, end: pos, slash: true } : null;
  }

  function slashItems(q) {
    q = q.toLowerCase();
    var out = SLASH.filter(function (c) { return !c[3] || c[3] === conv.mode; }).map(function (c) { return { cmd: c[0], sub: c[1], icon: c[2], builtin: true }; });
    (window.Skills ? Skills.active() : []).forEach(function (sk) {
      if (out.some(function (o) { return o.cmd === '/' + sk.name; })) return;
      out.push({ cmd: '/' + sk.name, sub: sk.description, icon: 'bulb', cat: Skills.categoryOf(sk) });
    });
    if (!q) return out;
    return out.map(function (o) {
      var n = o.cmd.slice(1), i = n.indexOf(q);
      var score = i === 0 ? 3 : i > 0 ? 2 : (o.sub || '').toLowerCase().indexOf(q) >= 0 ? 1 : 0;
      return [o, score];
    }).filter(function (x) { return x[1]; }).sort(function (a, b) { return b[1] - a[1]; }).map(function (x) { return x[0]; });
  }

  var skillsLoadedFor = null;
  async function updateMention() {
    var st = conv && slashToken();
    if (st) {
      if (window.Skills && skillsLoadedFor !== (conv.workspace || '')) { skillsLoadedFor = conv.workspace || ''; await Skills.load(conv.workspace).catch(function () {}); st = slashToken(); if (!st) return closeMention(); }
      mention.items = slashItems(st.query).slice(0, 40);
      mention.idx = 0;
      mention.tok = st;
      mention.open = mention.items.length > 0;
      return renderMention();
    }
    if (!conv || conv.mode !== 'code' || !conv.workspace) return closeMention();
    var tok = mentionToken();
    if (!tok) return closeMention();
    var files = await workspaceFiles();
    var q = tok.query.toLowerCase();
    var scored = [];
    for (var i = 0; i < files.length && scored.length < 400; i++) {
      var f = files[i], fl = f.toLowerCase(), base = fl.split('/').pop();
      if (!q) { scored.push([f, 0]); continue; }
      var idx = base.indexOf(q), score = idx === 0 ? 3 : idx > 0 ? 2 : fl.indexOf(q) >= 0 ? 1 : 0;
      if (score) scored.push([f, score - f.length / 1000]);
    }
    scored.sort(function (a, b) { return b[1] - a[1]; });
    mention.items = scored.slice(0, 12).map(function (x) { return x[0]; });
    mention.idx = 0;
    mention.tok = tok;
    mention.open = mention.items.length > 0;
    renderMention();
  }

  function renderMention() {
    var pop = els.mentionPop;
    pop.hidden = !mention.open;
    if (!mention.open) return;
    pop.innerHTML = '';
    mention.items.forEach(function (f, i) {
      if (f && f.cmd) {
        pop.appendChild(h('button.mrow' + (i === mention.idx ? '.hover' : ''), {
          html: U.icon(f.icon || 'bulb') + '<span class="mn"><b>' + U.esc(f.cmd) + (f.cat ? ' <small style="display:inline">· ' + U.esc(f.cat) + '</small>' : '') + '</b><small style="font-family:inherit">' + U.esc((f.sub || '').length > 120 ? f.sub.slice(0, 117) + '…' : (f.sub || '')) + '</small></span>',
          onmousedown: function (e) { e.preventDefault(); pickMention(f); },
        }));
        return;
      }
      var parts = f.split('/'), base = parts.pop();
      pop.appendChild(h('button.mrow' + (i === mention.idx ? '.hover' : ''), {
        html: U.icon('file') + '<span class="mn"><b>' + U.esc(base) + '</b><small>' + U.esc(parts.join('/') || '.') + '</small></span>',
        onmousedown: function (e) { e.preventDefault(); pickMention(f); },
      }));
    });
  }

  function pickMention(f) {
    if (f && f.cmd) {
      var rest = els.input.value.slice(mention.tok ? mention.tok.end : 0).replace(/^\s+/, '');
      els.input.value = f.cmd + ' ' + rest;
      els.input.setSelectionRange(f.cmd.length + 1, f.cmd.length + 1);
      closeMention();
      autosize();
      // Perintah tanpa argumen langsung dijalankan.
      if (f.builtin && /^\/(new|clear|compact|model|skills|help)$/.test(f.cmd) && !rest) submit();
      return;
    }
    var t = mention.tok || mentionToken();
    if (!t) return closeMention();
    var v = els.input.value;
    els.input.value = v.slice(0, t.start) + '@' + f + ' ' + v.slice(t.end);
    var caret = t.start + f.length + 2;
    els.input.setSelectionRange(caret, caret);
    closeMention();
    autosize();
  }

  function renderTemplateBtn() {
    if (!els.btnTemplate || !conv) return;
    var t = Templates.active(conv);
    els.btnTemplate.classList.toggle('on', !!t);
    els.btnTemplate.querySelector('span').textContent = t ? U.truncateMiddle(t.name, 22) : 'Template';
    els.btnTemplate.title = t ? 'Template aktif: ' + t.name + ' — dipakai untuk semua desain & file di percakapan ini' : 'Pilih template desain (PPT, Word, PDF, UI…)';
  }

  function templateMenu() {
    var items = [{ title: 'Template desain untuk percakapan ini' }];
    var cur = conv.templateId;
    items.push({ label: 'Tanpa template', icon: cur ? 'x' : 'check', onClick: function () { conv.templateId = null; Store.saveConv(conv); renderTemplateBtn(); } });
    Templates.list().forEach(function (t) {
      items.push({ label: t.name, sub: (Templates.KIND_LABEL[t.kind] || t.kind) + ' · .' + t.ext, icon: cur === t.id ? 'check' : 'layers', onClick: function () {
        conv.templateId = t.id; Store.saveConv(conv); renderTemplateBtn();
        UI.toast('Template "' + t.name + '" aktif — semua desain & file mengikuti template ini');
      } });
    });
    items.push('sep', { label: 'Impor / kelola template…', icon: 'settings', onClick: function () { Settings.open('templates'); } });
    UI.menu(els.btnTemplate, items, { placement: 'top', width: 320 });
  }
  Chat.renderTemplateBtn = function () { renderTemplateBtn(); };

  /* Composer: pick a skill by category; it is inserted as /name. */
  async function skillMenu() {
    await Skills.load(conv && conv.workspace).catch(function () {});
    var items = [{ title: 'Gunakan skill' }];
    var list = Skills.active();
    Skills.CATEGORIES.concat(['Lainnya']).filter(function (c, i, a) { return a.indexOf(c) === i; }).forEach(function (c) {
      var inCat = list.filter(function (s) { return Skills.categoryOf(s) === c; });
      if (!inCat.length) return;
      items.push({ title: c });
      inCat.forEach(function (sk) {
        items.push({ label: '/' + sk.name, sub: U.truncateMiddle(sk.description, 90), icon: 'bulb', onClick: function () { Chat.setInput('/' + sk.name + ' ' + els.input.value.replace(/^\/\S+\s*/, '')); Chat.focusInput(); } });
      });
    });
    items.push('sep', { label: 'Kelola & buat skill…', icon: 'settings', onClick: function () { Settings.open('skills'); } });
    UI.menu(els.btnSkill, items, { placement: 'top', width: 340 });
  }

  function closeMention() { mention.open = false; if (els.mentionPop) els.mentionPop.hidden = true; }

  async function slash(text) {
    var cmd = text.split(/\s+/)[0].toLowerCase();
    var rest = text.slice(cmd.length).trim();
    switch (cmd) {
      case '/cermin':
      case '/mirror': {
        var mp = /^(\S+)(?:\s+(.+))?$/.exec(rest);
        if (mp && /^https?:\/\/|^[A-Za-z0-9_-]{8,}$/.test(mp[1]) && Mirror.available().length) Mirror.pull(conv, { source: mp[1], pages: mp[2] || '' }).catch(function (e) { UI.toast(e.message, { error: true }); });
        else Mirror.dialog(conv, { source: mp ? mp[1] : '' });
        return true;
      }
      case '/dorong':
      case '/push':
        Mirror.push(conv, { pages: rest || 'changed' }).catch(function (e) { UI.toast(e.message, { error: true }); });
        return true;
      case '/browser':
        Panel.openBrowser(rest || undefined);
        return true;
      case '/tim':
      case '/team':
        if (conv.mode !== 'code') return false;
        toggleTeam();
        return true;
      case '/init':
        if (conv.mode !== 'code') return false;
        if (!conv.workspace && !(await Chat.pickWorkspace())) return true;
        Engine.send(conv, { text: Prompts.INIT_PROMPT + (rest ? '\n\n' + rest : ''), display: '/init' + (rest ? ' ' + rest : '') });
        return true;
      case '/review':
        if (conv.mode !== 'code') return false;
        if (!conv.workspace && !(await Chat.pickWorkspace())) return true;
        Engine.send(conv, { text: Prompts.REVIEW_PROMPT + (rest ? '\n\n' + rest : ''), display: '/review' + (rest ? ' ' + rest : '') });
        return true;
      case '/compact':
        if (!conv.messages.length) return true;
        UI.toast('Meringkas percakapan…', { icon: 'layers' });
        await Engine.compactNow(conv);
        return true;
      case '/clear':
      case '/new':
        App.newConversation(conv.mode, { workspace: conv.workspace });
        return true;
      case '/plan':
        if (conv.mode !== 'code') return false;
        conv.prevPermission = conv.permission || Store.settings.permission;
        conv.permission = 'plan';
        renderHeader(); renderComposerState();
        if (rest) Engine.send(conv, { text: rest });
        else UI.toast('Mode rencana aktif: agen hanya membaca & menyusun rencana', { icon: 'list' });
        return true;
      case '/model':
        Chat.openModelPicker(els.btnModel);
        return true;
      case '/help':
        App.showShortcuts();
        return true;
      case '/skills':
        Settings.open('skills');
        return true;
    }
    // /<skill-name> [details] runs a skill directly.
    var sk = window.Skills && Skills.get(cmd.slice(1));
    if (sk && sk.enabled) {
      Engine.send(conv, { text: 'Use the skill "' + sk.name + '" for this request. Its instructions:\n<skill name="' + sk.name + '">\n' + sk.body + '\n</skill>\n\n' + (rest || 'Run the skill.'), display: cmd + (rest ? ' ' + rest : '') });
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- attachments

  function renderAttachments() {
    var box = els.attachments;
    box.innerHTML = '';
    box.hidden = !attachments.length && !contexts.length && !pendingFiles;
    contexts.forEach(function (c, i) {
      box.appendChild(h('div.att.ctx', h('span.fi', { html: U.icon('target') }), h('span', { text: c.label }),
        h('button', { html: U.icon('x'), title: 'Hapus', onclick: function () { contexts.splice(i, 1); renderAttachments(); } })));
    });
    if (pendingFiles) box.appendChild(h('div.att.loading', h('span.fi', { html: '<span class="spin"></span>' }), h('span', { text: 'Memproses ' + pendingFiles + ' file…' })));
    attachments.forEach(function (a, i) {
      var thumb = a.kind === 'image' ? h('img', { src: 'data:' + a.mime + ';base64,' + a.data }) : h('span.fi', { html: U.icon('file') });
      box.appendChild(h('div.att', thumb, h('span', { text: a.name }),
        h('button', { html: U.icon('x'), title: 'Hapus', onclick: function () { attachments.splice(i, 1); renderAttachments(); renderSendState(); } })));
    });
    renderSendState();
  }

  function downscale(dataUrl, mime) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, ht = img.naturalHeight;
        var s = Math.min(1, max / Math.max(w, ht));
        var raw = dataUrl.split(',')[1] || '';
        if (s === 1 && raw.length < 1500000 && /png|jpe?g|gif|webp/.test(mime)) { resolve({ mime: mime, data: raw }); return; }
        var c = document.createElement('canvas');
        c.width = Math.round(w * s); c.height = Math.round(ht * s);
        var g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        resolve({ mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.86).split(',')[1] });
      };
      img.onerror = function () { resolve(null); };
      img.src = dataUrl;
    });
  }

  function mimeFor(name) {
    var ext = (name.split('.').pop() || '').toLowerCase();
    return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff' }[ext] || 'application/octet-stream';
  }

  async function addPaths(paths) {
    var vision = currentVision();
    pendingFiles += paths.length;
    renderAttachments();
    await Promise.all(paths.map(async function (p) {
      try {
        var atts = await Files.readPath(p, { vision: vision });
        atts.forEach(function (a) { attachments.push(a); });
      } catch (e) { UI.toast(U.basename(p) + ': ' + e.message, { error: true }); }
      pendingFiles--;
      renderAttachments();
    }));
  }
  Chat.addPaths = addPaths;

  function readFile(file, as) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      if (as === 'url') fr.readAsDataURL(file); else fr.readAsText(file);
    });
  }

  async function addFileObjects(files) {
    var vision = currentVision();
    pendingFiles += files.length;
    renderAttachments();
    await Promise.all(files.map(async function (f) {
      try {
        var atts = await Files.readFileObject(f, { vision: vision });
        atts.forEach(function (a) { attachments.push(a); });
      } catch (e) { UI.toast((f.name || 'file') + ': ' + e.message, { error: true }); }
      pendingFiles--;
      renderAttachments();
    }));
  }

  function onPaste(e) {
    var items = e.clipboardData && e.clipboardData.items;
    var files = [];
    if (items) for (var i = 0; i < items.length; i++) if (items[i].kind === 'file') { var f = items[i].getAsFile(); if (f) files.push(f); }
    if (!files.length) return;
    e.preventDefault();
    // Files copied in Finder arrive with real paths — read those directly.
    Native.call('clipboard.files').then(function (paths) {
      if (paths && paths.length) addPaths(paths); else addFileObjects(files);
    }).catch(function () { addFileObjects(files); });
  }

  async function pickFiles() {
    var paths = await Native.call('dialog.openFiles', { multiple: true });
    if (paths && paths.length) addPaths(paths);
  }

  // ---------------------------------------------------------------- text / open-with

  function insertAtCursor(text) {
    var el = els.input;
    var s = el.selectionStart != null ? el.selectionStart : el.value.length;
    var e = el.selectionEnd != null ? el.selectionEnd : el.value.length;
    var before = el.value.slice(0, s), after = el.value.slice(e);
    var glue = before && !/\s$/.test(before) ? ' ' : '';
    el.value = before + glue + text + after;
    var caret = (before + glue + text).length;
    el.setSelectionRange(caret, caret);
    autosize();
  }

  function dropHtmlToText(html) {
    try {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      // A table (e.g. dragged from Numbers / a web page) → Markdown-ish text.
      var table = doc.querySelector('table');
      if (table) {
        var rows = Array.prototype.map.call(table.rows, function (r) {
          return Array.prototype.map.call(r.cells, function (c) { return (c.textContent || '').replace(/\s+/g, ' ').trim(); }).join('\t');
        });
        return rows.join('\n');
      }
      return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
    } catch (e) { return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
  }

  function addDroppedContent(text, label) {
    if (!text) return;
    if (text.length < 600) { insertAtCursor(text); Chat.focusInput(); return; }
    attachments.push({ kind: 'file', name: (label || 'teks') + ' (ditempel)', text: text });
    renderAttachments();
    Chat.focusInput();
  }

  function openIncomingFiles(paths) {
    // Route files from Finder/Services into the active conversation's composer.
    if (!conv) { App.newConversation(UI.state.mode || 'chat'); }
    Chat.focusInput();
    addPaths(paths);
    UI.toast(paths.length + ' file ditambahkan dari ' + (paths.length === 1 ? U.basename(paths[0]) : U.plat('Finder')), { icon: 'clip' });
  }
  Chat.openIncomingFiles = openIncomingFiles;

  // ---------------------------------------------------------------- live dictation

  var dictating = false;
  function bindDictationEvents() {
    Native.on('dictation.text', function (p) {
      if (!dictating) return;
      // Replace the dictated region at the cursor each update.
      var base = els.input.dataset.dictBase || '';
      els.input.value = base + (base && p.text && !/\s$/.test(base) ? ' ' : '') + (p.text || '');
      autosize();
      if (p.final) finishDictation();
    });
    Native.on('dictation.level', function (p) {
      if (dictating) els.btnDictate.style.setProperty('--lvl', String(0.4 + (p.level || 0) * 0.6));
    });
  }

  async function toggleDictation() {
    if (dictating) { Native.call('dictation.stop'); finishDictation(); return; }
    var locale = (Store.info.locale || 'id-ID').replace('_', '-');
    els.input.dataset.dictBase = els.input.value;
    try {
      dictating = true;
      els.btnDictate.classList.add('on', 'rec');
      els.input.placeholder = 'Mendengarkan… bicara sekarang (klik mik untuk berhenti)';
      await Native.call('dictation.start', { locale: locale });
      Chat.focusInput();
    } catch (e) {
      dictating = false;
      els.btnDictate.classList.remove('on', 'rec');
      renderComposerState();
      UI.toast(e.message, { error: true });
    }
  }

  function finishDictation() {
    if (!dictating) return;
    dictating = false;
    els.btnDictate.classList.remove('on', 'rec');
    delete els.input.dataset.dictBase;
    renderComposerState();
    renderSendState();
  }

  // ---------------------------------------------------------------- capture (record / camera / screenshot)

  function captureMenu() {
    UI.menu(els.btnCapture, [
      { title: 'Rekam & tangkap' },
      { label: 'Rekam audio (mikrofon)', icon: 'mic', onClick: function () { startRecording('audio'); } },
      { label: 'Rekam layar', sub: 'Dengan suara mikrofon', icon: 'monitor', onClick: function () { startRecording('screen', true); } },
      U.feature('recordSystemAudio') ? { label: 'Rekam audio sistem', sub: U.plat('Suara yang diputar Mac (rapat, video)'), icon: 'record', onClick: function () { startRecording('system'); } } : null,
      'sep',
      { label: U.isMac() ? 'Kamera (foto / video)' : 'Kamera (foto)', icon: 'camera', onClick: openCamera },
      U.feature('screenshotArea')
        ? { label: 'Tangkapan layar…', sub: 'Pilih area atau jendela', icon: 'scan', onClick: function () { screenshot('interactive'); } }
        : { label: 'Tangkapan layar', sub: 'Seluruh layar', icon: 'scan', onClick: function () { screenshot('full'); } },
      { label: 'Tangkap jendela Sinai', icon: 'monitor', onClick: windowSnapshot },
    ].filter(Boolean), { placement: 'top', width: 300 });
  }

  var recording = null;
  async function startRecording(kind, mic) {
    if (recording) return;
    try {
      var s = await Native.call('record.start', { kind: kind, mic: !!mic });
      recording = { id: s.id, kind: kind, start: Date.now() };
      showRecordingBar(kind);
    } catch (e) { UI.toast(e.message, { error: true, ms: 7000 }); }
  }

  function showRecordingBar(kind) {
    var label = { audio: 'Merekam audio', screen: 'Merekam layar', system: 'Merekam audio sistem' }[kind] || 'Merekam';
    var time = h('span', { text: '0:00' });
    var bar = h('div.rec-bar',
      h('span.rec-dot'), h('b', { text: label }), time, h('div', { style: { flex: '1' } }),
      h('button.btn.sm.ghost', { text: 'Batal', onclick: function () { stopRecording(true); } }),
      h('button.btn.sm.primary', { html: U.icon('check') + 'Selesai & lampirkan', onclick: function () { stopRecording(false); } }));
    bar.__time = time;
    recording.bar = bar;
    els.composer.parentNode.insertBefore(bar, els.composer);
    var off = Native.on('record.tick', function (p) {
      if (!recording || p.id !== recording.id) return;
      var s = Math.floor(p.seconds);
      time.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    });
    recording.offTick = off;
  }

  async function stopRecording(cancel) {
    if (!recording) return;
    var r = recording; recording = null;
    if (r.offTick) r.offTick();
    if (r.bar) r.bar.remove();
    try {
      var res = await Native.call('record.stop', { id: r.id, cancel: !!cancel });
      if (res && res.path && !cancel) { addPaths([res.path]); UI.toast('Rekaman dilampirkan (' + U.fmtDuration((res.duration || 0) * 1000) + ')', { icon: 'record' }); }
    } catch (e) { UI.toast(e.message, { error: true, ms: 7000 }); }
  }

  async function openCamera() {
    try { var p = await Native.call('camera.open'); if (p) addPaths([p]); }
    catch (e) { UI.toast(e.message, { error: true, ms: 6000 }); }
  }

  async function screenshot(mode) {
    try { var p = await Native.call('screen.shot', { mode: mode }); if (p) addPaths([p]); }
    catch (e) { UI.toast(e.message, { error: true, ms: 6000 }); }
  }

  async function windowSnapshot() {
    try { var p = await Native.call('window.snapshot'); if (p) addPaths([p]); }
    catch (e) { UI.toast(e.message, { error: true }); }
  }

  // ---------------------------------------------------------------- pickers

  Chat.openModelPicker = function (anchor) {
    var models = Providers.allModels();
    if (!models.length) {
      UI.menu(anchor, [{ label: 'Belum ada model', sub: 'Tambahkan provider & API key terlebih dahulu', icon: 'info', disabled: true }, 'sep',
        { label: 'Tambah API key…', icon: 'key', onClick: function () { Settings.onboarding(); } }], { align: 'end' });
      return;
    }
    var current = conv && (conv.model || Engine.defaultModelRef(conv.mode));
    var el = h('div.model-pop');
    var input = h('input', { placeholder: 'Cari model (' + models.length + ' tersedia)…' });
    var list = h('div.mp-list');
    el.appendChild(h('div.mp-search', { html: U.icon('search') }, input));
    el.appendChild(list);
    var checkBtn = h('button.menu-item', { html: U.icon('refresh') + '<span class="lbl">Cek status model yang tampil<span class="sub">Mengirim permintaan sangat kecil ke tiap model</span></span>' });
    checkBtn.addEventListener('click', async function () {
      var visible = rows.map(function (r) { return { providerId: r.m.providerId, modelId: r.m.modelId }; });
      var seen = {};
      visible = visible.filter(function (x) { var k = x.providerId + '::' + x.modelId; if (seen[k]) return false; seen[k] = 1; return true; }).slice(0, 40);
      checkBtn.disabled = true;
      var done = 0;
      checkBtn.querySelector('.lbl').firstChild.textContent = 'Mengecek 0/' + visible.length + '…';
      await Health.testMany(visible, function () { done++; if (checkBtn.isConnected) checkBtn.querySelector('.lbl').firstChild.textContent = 'Mengecek ' + done + '/' + visible.length + '…'; });
      if (checkBtn.isConnected) { checkBtn.disabled = false; checkBtn.querySelector('.lbl').firstChild.textContent = 'Cek ulang status model yang tampil'; }
    });
    el.appendChild(h('div.mp-foot', checkBtn, h('button.menu-item', { html: U.icon('settings') + '<span class="lbl">Kelola provider & model…</span>', onclick: function () { pop.close(); Settings.open('providers'); } })));
    var rows = [], hover = 0;
    function badges(info) {
      var b = '';
      if (info.reasoning) b += '<span class="badge b-r">nalar</span>';
      if (info.vision) b += '<span class="badge b-v">visi</span>';
      if (info.tools !== false) b += '<span class="badge b-t">alat</span>';
      if (info.ctx) b += '<span class="badge">' + U.fmtTokens(info.ctx) + '</span>';
      return b;
    }
    function render() {
      var q = input.value.trim().toLowerCase();
      list.innerHTML = '';
      rows = [];
      var recent = (Store.settings.recentModels || []).map(function (ref) {
        return models.find(function (m) { return m.providerId === ref.providerId && m.modelId === ref.modelId; });
      }).filter(Boolean);
      var groups = [];
      if (!q && recent.length) groups.push({ title: 'Terakhir dipakai', items: recent.slice(0, 5) });
      var byProv = {};
      models.forEach(function (m) {
        if (q && (m.name + ' ' + m.modelId + ' ' + m.providerName).toLowerCase().indexOf(q) < 0) return;
        (byProv[m.providerName] = byProv[m.providerName] || []).push(m);
      });
      Object.keys(byProv).forEach(function (k) { groups.push({ title: k, items: byProv[k] }); });
      groups.forEach(function (g) {
        list.appendChild(h('div.menu-title', { text: g.title }));
        g.items.forEach(function (m) {
          var sel = current && current.providerId === m.providerId && current.modelId === m.modelId;
          var hs = Health.state(m.providerId, m.modelId);
          var row = h('button.mrow', { title: Health.describe(m.providerId, m.modelId), html: '<span class="hdot h-' + hs + '"></span><span class="mn"><b>' + U.esc(m.name) + '</b><small>' + U.esc(m.modelId) + (hs === 'err' || hs === 'warn' ? ' · ' + U.esc((Health.get(m.providerId, m.modelId) || {}).msg || '') : '') + '</small></span><span class="badges">' + badges(m.info) + '</span>' + (sel ? '<span class="msel">' + U.icon('check') + '</span>' : ''), onclick: function () { choose(m); } });
          rows.push({ el: row, m: m });
          list.appendChild(row);
        });
      });
      if (!rows.length) list.appendChild(h('div.conv-empty', { text: 'Tidak ada model yang cocok' }));
      hover = 0;
      highlight();
    }
    function highlight() { rows.forEach(function (r, i) { r.el.classList.toggle('hover', i === hover); }); if (rows[hover]) rows[hover].el.scrollIntoView({ block: 'nearest' }); }
    function choose(m) {
      var ref = { providerId: m.providerId, modelId: m.modelId };
      if (conv) conv.model = ref;
      Store.settings.defaults[conv ? conv.mode : 'chat'] = ref;
      var rec = (Store.settings.recentModels || []).filter(function (x) { return !(x.providerId === ref.providerId && x.modelId === ref.modelId); });
      rec.unshift(ref);
      Store.settings.recentModels = rec.slice(0, 8);
      Store.saveSettings();
      if (conv && conv.messages.length) Store.saveConv(conv);
      pop.close();
      renderComposerState();
      renderHeader();
    }
    input.addEventListener('input', render);
    // Live dots while checks finish (keeps scroll position).
    var rerender = U.throttle(function () {
      if (!el.isConnected) return;
      rows.forEach(function (r) {
        var dot = r.el.querySelector('.hdot');
        var hs = Health.state(r.m.providerId, r.m.modelId);
        if (dot) dot.className = 'hdot h-' + hs;
        r.el.title = Health.describe(r.m.providerId, r.m.modelId);
        var small = r.el.querySelector('small');
        if (small) small.textContent = r.m.modelId + (hs === 'err' || hs === 'warn' ? ' · ' + ((Health.get(r.m.providerId, r.m.modelId) || {}).msg || '') : '');
      });
    }, 250);
    var offHealth = Health.on(rerender);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); hover = Math.min(rows.length - 1, hover + 1); highlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); hover = Math.max(0, hover - 1); highlight(); }
      else if (e.key === 'Enter' && rows[hover]) { e.preventDefault(); choose(rows[hover].m); }
    });
    var pop = UI.popover(anchor, el, { align: 'end', placement: 'top', onClose: function () { offHealth(); } });
    render();
    // re-position now that content exists
    var r = anchor.getBoundingClientRect();
    el.style.top = Math.max(8, r.top - el.offsetHeight - 6) + 'px';
    el.style.left = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, r.right - el.offsetWidth)) + 'px';
    setTimeout(function () { input.focus(); }, 20);
    Health.refreshImportant();
  };

  function openLevelMenu() {
    var cur = Engine.levelOf(conv);
    var icons = { fast: 'zap', balanced: 'sparkle', deep: 'brain', max: 'rocket' };
    UI.menu(els.btnLevel, [{ title: 'Mode kecerdasan' }].concat(Object.keys(Engine.LEVELS).map(function (k) {
      var L = Engine.LEVELS[k];
      return { label: L.label, sub: L.desc, icon: icons[k], check: k === cur, onClick: function () {
        conv.level = k;
        Store.setSetting('intelligence.' + conv.mode, k);
        renderComposerState(); renderHeader();
      } };
    })), { width: 340, placement: 'top' });
  }

  function styleName(id) {
    var c = (Store.settings.customStyles || []).find(function (x) { return x.id === id; });
    return c ? c.name : { normal: 'Normal', concise: 'Ringkas', explanatory: 'Penjelasan', formal: 'Formal' }[id] || 'Normal';
  }

  function styleMenu() {
    var cur = conv.style || Store.settings.style || 'normal';
    var items = [{ title: 'Gaya jawaban' }];
    [['normal', 'Normal', 'Jawaban seimbang bawaan'], ['concise', 'Ringkas', 'Sesingkat mungkin, langsung ke inti'], ['explanatory', 'Penjelasan', 'Mengajar langkah demi langkah dengan contoh'], ['formal', 'Formal', 'Profesional dan terstruktur']]
      .concat((Store.settings.customStyles || []).map(function (c) { return [c.id, c.name, c.instructions.slice(0, 60)]; }))
      .forEach(function (o) {
        items.push({ label: o[1], sub: o[2], icon: 'pen', check: cur === o[0], onClick: function () { conv.style = o[0]; Store.setSetting('style', o[0]); renderComposerState(); } });
      });
    items.push('sep', { label: 'Buat gaya sendiri…', icon: 'plus', onClick: function () { Settings.open('personal'); } });
    UI.menu(els.btnStyle, items, { placement: 'top', width: 300 });
  }

  function toggleWeb() {
    var on = !Engine.webOn(conv);
    conv.web = on;
    Store.setSetting('web', on);
    renderComposerState();
    UI.toast(on ? 'Akses web aktif' : 'Akses web nonaktif', { icon: 'globe' });
  }

  function toggleTeam() {
    var on = !(conv.team != null ? conv.team : Store.settings.agent.team !== false);
    conv.team = on;
    Store.settings.agent.team = on;
    Store.saveSettings();
    renderComposerState();
    UI.toast(on ? 'Tim Agen aktif: Arsitek, UI, Sistem, Data, Bug Test & Keamanan bekerja bersama' : 'Tim Agen nonaktif: satu agen', { icon: 'layers' });
  }

  async function setWorkspace(path) {
    conv.workspace = path;
    Store.addRecentWorkspace(path);
    if (conv.messages.length) Store.saveConv(conv);
    renderHeader(); renderComposerState(); renderEmpty();
    Sidebar.render();
  }

  Chat.pickWorkspace = async function () {
    var p = await Native.call('dialog.openFolder', { message: 'Pilih folder proyek untuk Sinai Code' });
    if (!p) return false;
    await setWorkspace(p);
    return true;
  };
  Chat.setWorkspace = setWorkspace;

  function workspaceMenu() {
    var items = [{ label: 'Pilih folder lain…', icon: 'folder', onClick: function () { Chat.pickWorkspace(); } }];
    if (conv.workspace) {
      items.push({ label: U.plat('Tampilkan di Finder'), icon: 'external', onClick: function () { Native.call('app.reveal', { path: conv.workspace }); } });
      items.push({ label: 'Buka di Terminal', icon: 'terminal', onClick: function () {
        if (U.isMac()) Native.call('exec.sync', { command: 'open -a Terminal ' + U.shq(conv.workspace) });
        else Native.call('app.openTerminal', { path: conv.workspace }).catch(function (e) { UI.toast(e.message, { error: true }); });
      } });
    }
    var rec = (Store.settings.recentWorkspaces || []).filter(function (p) { return p !== conv.workspace; });
    if (rec.length) {
      items.push('sep', { title: 'Terakhir dibuka' });
      rec.slice(0, 6).forEach(function (p) { items.push({ label: U.basename(p), sub: U.tildify(p, Store.info.home), icon: 'folder', onClick: function () { setWorkspace(p); } }); });
    }
    UI.menu(els.chipWorkspace, items, { align: 'end', width: 300 });
  }

  function permissionMenu() {
    var cur = conv.permission || Store.settings.permission;
    var opts = [
      ['plan', 'Rencana dulu', 'Agen hanya membaca & menyusun rencana; Anda menyetujui sebelum ada perubahan', 'list'],
      ['ask', 'Tanya dulu', 'Minta izin sebelum mengedit file atau menjalankan perintah', 'shield'],
      ['edits', 'Edit otomatis', 'Edit file di folder proyek tanpa bertanya; perintah tetap minta izin', 'fileEdit'],
      ['auto', 'Otomatis penuh', 'Semua aksi tanpa bertanya (kecuali perintah berbahaya/admin)', 'zap'],
    ];
    UI.menu(els.chipPermission, [{ title: 'Mode izin agen' }].concat(opts.map(function (o) {
      return { label: o[1], sub: o[2], icon: o[3], check: cur === o[0], onClick: function () {
        if (o[0] === 'plan') conv.prevPermission = cur === 'plan' ? conv.prevPermission : cur;
        conv.permission = o[0];
        if (o[0] !== 'plan') Store.setSetting('permission', o[0]);
        renderHeader(); renderComposerState();
      } };
    })), { align: 'end', width: 340 });
  }

  // ---------------------------------------------------------------- export

  Chat.diffView = diffView;

  function conversationMarkdown() {
    var out = ['# ' + conv.title, ''];
    conv.messages.forEach(function (m) {
      if (m.role === 'user' && !(m.meta && m.meta.synthetic)) out.push('## 🧑 Anda', '', (m.meta && m.meta.display) || Engine.textOf(m.content), '');
      else if (m.role === 'assistant') {
        var t = (m.content || []).map(function (b) {
          if (b.type === 'text') return b.text;
          if (b.type === 'tool_call') {
            var tool = Tools.get(b.name);
            var l = tool ? tool.label(b.args || {}, toolCtx()) : { verb: b.name, target: '' };
            return '> 🔧 ' + l.verb + ' `' + l.target + '`';
          }
          return '';
        }).filter(Boolean).join('\n\n');
        if (t) out.push('## ✨ Sinai', '', t, '');
      }
    });
    if (conv.mode === 'code' && conv.todos && conv.todos.length) {
      out.push('## ✅ Rencana kerja', '');
      conv.todos.forEach(function (td) { out.push('- [' + (td.status === 'completed' ? 'x' : ' ') + '] ' + td.content); });
      out.push('');
    }
    out.push('---', '', '_Diekspor dari Sinai — ' + App.copyright() + '_', '');
    return out.join('\n');
  }

  function conversationHTML() {
    var body = MD.render(conversationMarkdown());
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + U.esc(conv.title) + '</title><style>' +
      'body{max-width:740px;margin:0 auto;padding:40px 32px;font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1b1c2b}' +
      'h1{font-size:1.8em}h2{font-size:1.25em;margin-top:1.6em;border-bottom:1px solid #eee;padding-bottom:4px}' +
      'pre{background:#f6f7fb;padding:12px 14px;border-radius:8px;overflow:auto}code{background:#f2f3f7;padding:.1em .35em;border-radius:4px;font-family:ui-monospace,Menlo,monospace}pre code{background:none}' +
      'blockquote{border-left:3px solid #6e6bff;margin:0 0 1em;padding:.2em 1em;color:#555;background:#f7f7fd}table{border-collapse:collapse}th,td{border:1px solid #e3e5ee;padding:6px 10px}img{max-width:100%}' +
      '</style></head><body>' + body + '</body></html>';
  }

  function exportMenu() {
    if (!conv || !conv.messages.length) { UI.toast('Tidak ada yang bisa diekspor', { error: true }); return; }
    var name = (conv.title || 'percakapan').replace(/[\/:*?"<>|]+/g, '-').slice(0, 60);
    UI.menu(els.btnExport, [
      { title: 'Ekspor percakapan' },
      { label: 'Markdown (.md)', icon: 'download', onClick: Chat.exportConv },
      { label: 'Word (.docx)', icon: 'file', onClick: function () {
        Native.call('export.document', { html: conversationHTML(), format: 'docx', name: name }).then(function (p) { if (p) UI.toast('Disimpan: ' + U.basename(p)); }).catch(function (e) { UI.toast(e.message, { error: true }); });
      } },
      { label: 'PDF', icon: 'file', onClick: function () {
        UI.toast('Menyiapkan PDF…', { icon: 'download' });
        Native.call('preview.export', { key: 'conv-' + conv.id + '-' + Date.now(), html: conversationHTML(), format: 'pdf', name: name, width: 820, pageHeight: 1056, pages: 0 })
          .then(function (p) { if (p) UI.toast('Disimpan: ' + U.basename(p)); }).catch(function (e) { UI.toast(e.message, { error: true }); });
      } },
      'sep',
      { label: 'Cetak…', icon: 'print', onClick: function () { Native.call('export.print', { html: conversationHTML(), name: name }).catch(function (e) { UI.toast(e.message, { error: true }); }); } },
      U.feature('share')
        ? { label: 'Bagikan…', sub: 'AirDrop, Mail, Pesan…', icon: 'share', onClick: function () { Native.call('export.share', { text: conversationMarkdown() }).catch(function (e) { UI.toast(e.message, { error: true }); }); } }
        : { label: 'Salin sebagai Markdown', sub: 'Untuk ditempel di email/chat', icon: 'copy', onClick: function () { Native.call('app.copy', { text: conversationMarkdown() }).then(function () { UI.toast('Percakapan disalin'); }); } },
    ], { align: 'end', width: 260 });
  }

  Chat.exportConv = async function () {
    if (!conv || !conv.messages.length) { UI.toast('Tidak ada yang bisa diekspor', { error: true }); return; }
    var out = ['# ' + conv.title, ''];
    conv.messages.forEach(function (m) {
      if (m.role === 'user' && !(m.meta && m.meta.synthetic)) out.push('## 🧑 Anda', '', (m.meta && m.meta.display) || Engine.textOf(m.content), '');
      else if (m.role === 'assistant') {
        var t = (m.content || []).map(function (b) {
          if (b.type === 'text') return b.text;
          if (b.type === 'tool_call') {
            var tool = Tools.get(b.name);
            var l = tool ? tool.label(b.args || {}, toolCtx()) : { verb: b.name, target: '' };
            return '> 🔧 ' + l.verb + ' `' + l.target + '`';
          }
          return '';
        }).filter(Boolean).join('\n\n');
        if (t) out.push('## ✨ Sinai', '', t, '');
      }
    });
    out.push('---', '', '_Diekspor dari Sinai — ' + App.copyright() + '_', '');
    var name = (conv.title || 'percakapan').replace(/[\/:*?"<>|]+/g, '-').slice(0, 60) + '.md';
    var p = await Native.call('dialog.save', { name: name, content: out.join('\n') });
    if (p) UI.toast('Diekspor ke ' + U.basename(p));
  };

  window.Chat = Chat;
})();
