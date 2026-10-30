/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* The engine: runs conversations. It drives the tool loop for the coding agent,
   the multi-pass "deliberation" pipeline (draft → critique → refine, or
   several drafts → synthesis) that lets any model reason more carefully, an
   independent verifier for code changes, approvals and context compaction. */
(function () {
  'use strict';

  var runs = new Map();        // convId -> run
  var approvals = new Map();   // callId -> {resolve, request}
  var listeners = {};

  function on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); }
  function emit(name, a, b) {
    // Unattended quality-suite runs stay invisible to the UI, sidebar and sync.
    if (a && a.eval) return;
    (listeners[name] || []).forEach(function (fn) { try { fn(a, b); } catch (e) { console.error(e); } }); }
  function touch(conv, msg) { emit('update', conv, msg); }

  var LEVELS = {
    fast: { label: 'Cepat', desc: 'Jawaban langsung tanpa penalaran panjang. Hemat token.' },
    balanced: { label: 'Seimbang', desc: 'Penalaran bawaan model + panduan berpikir ahli.' },
    deep: { label: 'Mendalam', desc: 'Draf → kritik ahli → jawaban final. Coding: verifikasi otomatis oleh peninjau.' },
    max: { label: 'Maksimal', desc: 'Beberapa draf paralel → sintesis → kritik → final. Coding: verifikasi berlapis. Paling cerdas, paling boros token.' },
  };

  function defaultModelRef(mode) {
    var s = Store.settings;
    var ref = s.defaults[mode] || s.defaults.chat || s.defaults.code;
    if (ref && Providers.resolve(ref)) return ref;
    var all = Providers.allModels();
    return all.length ? { providerId: all[0].providerId, modelId: all[0].modelId } : null;
  }

  /* Model router: light (sub-agents), strong (escalation when stuck), panel (diverse drafts). */
  function routerModel(role) {
    var rt = Store.settings.router || {};
    return rt[role] ? Providers.resolve(rt[role]) : null;
  }
  function routerPanel() {
    return ((Store.settings.router || {}).panel || []).map(function (ref) { return Providers.resolve(ref); }).filter(Boolean);
  }

  function levelOf(conv) { return conv.level || Store.settings.intelligence[conv.mode] || 'balanced'; }
  function webOn(conv) { return conv.web != null ? conv.web : Store.settings.web; }
  function textOf(blocks, type) {
    return (blocks || []).filter(function (b) { return b.type === (type || 'text'); }).map(function (b) { return b.text || ''; }).join('');
  }
  function lastRealUserId(conv) {
    for (var i = conv.messages.length - 1; i >= 0; i--) {
      var m = conv.messages[i];
      if (m.role === 'user' && !(m.meta && m.meta.synthetic)) return m.id;
    }
    return null;
  }

  // ------------------------------------------------------------------ token saver: tools on demand

  /* Optional tools are only sent when the conversation is about them (or the
     model asks for them with load_tools). Every tool definition is resent on
     every step, so this is one of the biggest savings. */
  var OPTIONAL = {
    create_file: [/(\b|^)(pptx?|power ?point|presentasi|slide|deck|pdf|docx?|word|excel|xlsx|xls|csv|spreadsheet|dokumen|laporan|proposal|surat|cv|resume|video|mp4|file|berkas|unduh|download|ekspor|export|infografis|poster|brosur|flyer|sertifikat)(\b|$)/i, 'create PPTX/PDF/Word/Excel/image/video files'],
    generate_image: [/(\b|^)(gambar|image|images|foto|photo|ilustrasi|illustration|poster|banner|thumbnail|wallpaper|avatar|karakter|character|lukisan|render|mockup|visual|logo|desain grafis|edit (gambar|foto))(\b|$)/i, 'generate/edit images with an AI image model'],
    ask_user: [/./, 'ask the user a clickable multiple-choice question'],
    save_skill: [/(\b|^)skills?(\b|$)/i, 'save a reusable skill (SKILL.md)'],
    memory: [/(\b|^)(ingat|ingatlah|remember|memori|memory|lupakan|forget|preferensi saya|tentang saya)(\b|$)/i, 'save/forget long-term memories about the user'],
    calendar: [/(\b|^)(kalender|calendar|jadwal|agenda|rapat|meeting|acara|event)(\b|$)/i, 'read/create calendar events'],
    reminders: [/(\b|^)(pengingat|reminder|ingatkan|to-?do)(\b|$)/i, 'read/create reminders'],
    contacts: [/(\b|^)(kontak|contact|nomor (hp|telepon)|alamat email)(\b|$)/i, 'search/create contacts'],
    send_message: [/(kirim(kan)? (email|e-mail|pesan|imessage|sms)|send (an? )?(email|message)|imessage)/i, 'send an email or iMessage'],
    run_shortcut: [/(\b|^)(shortcuts?|pintasan)(\b|$)/i, 'run a macOS Shortcut'],
    list_shortcuts: [/(\b|^)(shortcuts?|pintasan)(\b|$)/i, 'list macOS Shortcuts'],
    notify: [/(\b|^)(notifikasi|notification|notify)(\b|$)/i, 'show a system notification'],
    open_preview: [/(\b|^)(live ?view|preview|pratinjau|lihat hasil|localhost|dev ?server|jalankan|run|serve|browser|web|website|situs|halaman|html|landing|ui|tampilan|game|3d)(\b|$)/i, 'show a live view (project HTML file/folder, dev server or URL) in the Sinai Browser panel'],
    browser_check: [/(\b|^)(live ?view|preview|pratinjau|browser|web|website|situs|halaman|html|landing|ui|tampilan|game|3d|error|bug|konsol|console|tes|test)(\b|$)/i, 'read the console errors of the page in the Sinai Browser live view'],
    open_app: [/(\b|^)(buka|bukakan|open|launch|jalankan aplikasi|aplikasi|app|finder|browser|safari|chrome|vscode|xcode)(\b|$)/i, 'open an app, file or URL on the device'],
    scan_dev_servers: [/(\b|^)(localhost|dev ?server|port)(\b|$)/i, 'find running local dev servers'],
    pdf_tools: [/(\b|^)pdf(\b|$)/i, 'merge/split/watermark/encrypt PDFs'],
    convert_image: [/(\b|^)(konversi|convert|heic|webp|resize|kompres|compress)(\b|$)/i, 'convert/resize images'],
    // Code-mode tools that most coding turns never need (sent on demand only).
    move_path: [/(\b|^)(pindah|pindahkan|pindahin|move|rename|ganti nama|ubah nama)(\b|$)/i, 'move or rename files and folders'],
    delete_path: [/(\b|^)(hapus|hapuskan|delete|remove|buang|bersihkan)(\b|$)/i, 'delete files and folders (moves to Trash)'],
    task: [/(\b|^)(paralel|parallel|sub-?agen|subagent|sub-?agent|pekerja|worker)(\b|$)/i, 'delegate work to parallel sub-agents'],
    web_search: [/(\b|^)(web|internet|online|cari|search|browse|dokumentasi|documentation|docs)(\b|$)|https?:\/\//i, 'search the web'],
    web_fetch: [/(\b|^)(web|internet|online|browse|dokumentasi|documentation|docs)(\b|$)|https?:\/\//i, 'fetch a web page'],
  };
  function leanOn() { return Store.settings.agent.lean !== false; }
  /* Shorter descriptions for the core tools (the model already knows these patterns well). */
  var SHORT = {
    read_file: 'Read a file: code with line numbers (~700 lines per call; offset/limit for more). Also reads images, PDF, Office files, notebooks, SQLite, archives, audio/video. Read several in parallel. Read before editing.',
    write_file: 'Create a file or fully overwrite one (parent folders created). For existing files prefer edit_file.',
    edit_file: 'Replace old_string with new_string in a file. old_string must match exactly (whitespace included) and be unique — include surrounding lines; replace_all for every occurrence.',
    list_directory: 'List a folder tree (depth).',
    glob: 'Find files by glob pattern (e.g. src/**/*.ts).',
    grep: 'Search file contents with a regex; returns path:line matches (glob/include filters).',
    run_command: 'Run a shell command non-interactively with a timeout (no editors/REPLs/watch). Background long-running servers.',
    todo_write: 'Replace the task checklist: [{content, status: pending|in_progress|completed}].',
    web_search: 'Search the web; returns titles, URLs and snippets.',
    web_fetch: 'Fetch a web page as readable text.',
    delete_path: 'Move a file or folder to the Trash.',
    move_path: 'Move or rename a file or folder.',
    skill: 'Load a skill listed under "# Skills" by name, then follow it.',
  };
  /* Which optional prompt sections this conversation needs (all of them when the token saver is off). */
  var UI_WORDS = /(\b|^)(ui|ux|web|website|situs|landing|halaman|page|dashboard|aplikasi|app|frontend|front-end|tampilan|desain|design|react|vue|html|css|tailwind|komponen|component|layout|mockup|prototipe|prototype|portfolio|toko online)(\b|$)/i;
  var ARTIFACT_WORDS = /(\b|^)(diagram|flowchart|mermaid|svg|chart|grafik|game|kode|code|script|skrip|program|kalkulator|calculator|artifact|artefak|simulasi|visualisasi|infografis|slides?|presentasi|board|papan|whiteboard|kanban|mind ?map|peta pikiran|moodboard|brainstorm|roadmap|canvas|kanvas|space|journey)(\b|$)/i;
  function intentOf(conv) {
    if (!leanOn()) return { artifact: true, ui: true, files: true, deck: true, lean: false };
    var t = convText(conv);
    var ui = conv.mode === 'design' || UI_WORDS.test(t);
    return { ui: ui, artifact: ui || ARTIFACT_WORDS.test(t) || conv.messages.some(function (m) { return m.role === 'assistant' && /<artifact\b/.test(textOf(m.content)); }),
      lean: true, files: !!wantedOptional(conv).create_file, deck: /(\b|^)(pptx?|power ?point|presentasi|slides?|deck|pitch)(\b|$)/i.test(t) };
  }
  function convText(conv) {
    return conv.messages.filter(function (m) { return m.role === 'user' && !(m.meta && m.meta.synthetic); }).map(function (m) { return textOf(m.content) + ' ' + ((m.meta && m.meta.display) || '') + ' ' + (m.content || []).filter(function (b) { return b.type !== 'text'; }).map(function (b) { return b.type + ' ' + (b.name || ''); }).join(' '); }).join('\n');
  }
  function wantedOptional(conv) {
    var text = convText(conv);
    var used = {};
    conv.messages.forEach(function (m) { if (m.role === 'assistant') (m.content || []).forEach(function (b) { if (b.type === 'tool_call') used[b.name] = 1; }); });
    (conv.extraTools || []).forEach(function (n) { used[n] = 1; });
    var want = {};
    Object.keys(OPTIONAL).forEach(function (n) {
      if (used[n]) want[n] = 1;
      else if (n === 'ask_user') { if (conv.mode !== 'chat') want[n] = 1; }
      else if (OPTIONAL[n][0].test(text)) want[n] = 1;
    });
    if (conv.mode === 'design' || wantsFile(text)) want.create_file = 1;
    if (conv.mode === 'design') want.generate_image = 1;
    if (want.create_file && /(\b|^)(gambar|image|poster|banner|logo)(\b|$)/i.test(text)) want.generate_image = 1;
    return want;
  }
  function loadToolsDef(missing) {
    return { name: 'load_tools', description: 'Load extra tools you need but do not have yet (they become available on your next step): ' + missing.map(function (n) { return n + ' (' + OPTIONAL[n][1] + ')'; }).join('; ') + '.',
      parameters: { type: 'object', properties: { names: { type: 'array', items: { type: 'string', enum: missing } } }, required: ['names'] } };
  }

  /* Tools offered to the model for the current state of the conversation. */
  function toolsFor(conv) {
    var list;
    if (conv.mode === 'code') {
      list = permissionMode(conv) === 'plan' ? Tools.forPlan() : Tools.forCode();
      if (!webOn(conv)) list = list.filter(function (t) { return t.name.indexOf('web_') !== 0; });
    } else {
      list = Tools.forChat(webOn(conv));
    }
    if (window.Skills && !Skills.active().length) list = list.filter(function (t) { return t.name !== 'skill'; });
    if (leanOn()) {
      list = list.map(function (t) { return SHORT[t.name] ? Object.assign({}, t, { description: SHORT[t.name] }) : t; });
    }
    // Like Claude, the model sees its whole tool catalogue and decides itself; only
    // small-context models get the keyword-filtered list plus load_tools.
    var prof = window.Profiles ? Profiles.get(Providers.resolve(conv.model || defaultModelRef(conv.mode))) : { allTools: false };
    if (leanOn() && !prof.allTools) {
      var want = wantedOptional(conv), missing = [];
      list = list.filter(function (t) {
        if (!OPTIONAL[t.name] || want[t.name]) return true;
        missing.push(t.name);
        return false;
      });
      if (missing.length) list = list.concat([loadToolsDef(missing)]);
    }
    var mt = MCP.tools();
    if (mt.length > MCP.META_LIMIT) return list.concat(MCP.metaTools());
    return list.concat(mt.map(function (t) { return { name: t.name, description: t.description, parameters: t.parameters }; }));
  }

  /* Built-in tool or an MCP tool wrapped in the same shape. */
  function toolFor(name) {
    var t = Tools.get(name);
    if (t) return t;
    if (name === 'load_tools') return { name: name, kind: 'meta', icon: 'plug', parameters: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } } }, required: ['names'] },
      label: function (a) { return { verb: 'Memuat alat', target: (a.names || []).join(', ') }; },
      run: async function (a, ctx) {
        var names = (Array.isArray(a.names) ? a.names : [a.names]).map(String).filter(function (n) { return OPTIONAL[n]; });
        ctx.conv.extraTools = Array.from(new Set((ctx.conv.extraTools || []).concat(names)));
        return { content: names.length ? 'Loaded: ' + names.join(', ') + '. You can call them now.' : 'Unknown tool names. Choose from the list in the load_tools description.' };
      } };
    if (name === 'connector_search') return { name: name, kind: 'read', icon: 'plug', parameters: MCP.metaTools()[0].parameters,
      label: function (a) { return { verb: 'Mencari alat konektor', target: a.query || '' }; },
      run: async function (a) { return { content: MCP.searchTools(a.query) }; } };
    if (name === 'connector_call') return { name: name, kind: 'mcp', icon: 'plug', parameters: MCP.metaTools()[1].parameters,
      get trusted() { return false; },
      label: function (a) { var f = MCP.find(a.tool || ''); return { verb: f ? f._serverName : 'Konektor', target: f ? f._title : (a.tool || '') }; },
      run: function (a) {
        // Models sometimes send the arguments as a JSON string or flattened beside "tool".
        var x = a.arguments;
        if (typeof x === 'string') { try { x = JSON.parse(x); } catch (e) { x = null; } }
        if (!x || typeof x !== 'object') { x = {}; Object.keys(a).forEach(function (k) { if (k !== 'tool' && k !== 'arguments') x[k] = a[k]; }); }
        return MCP.call(a.tool, x);
      } };
    var m = MCP.find(name);
    if (!m) return null;
    return {
      name: name, kind: 'mcp', icon: 'plug', parameters: m.parameters, trusted: m._trusted, _ro: m._ro,
      label: function () { return { verb: m._serverName, target: m._title }; },
      run: function (a) { return MCP.call(name, a); },
    };
  }

  /* "buatkan PPT / PDF / file Word / gambar / video …" — the user wants a real file. */
  var FILE_NOUN = /(\b|^)(pptx?|power ?point|keynote|presentasi|slide|slides|deck|pdf|docx?|ms ?word|word|dokumen|document|laporan|surat|proposal|cv|resume|excel|xlsx|xls|csv|spreadsheet|lembar kerja|gambar|image|poster|banner|logo|ilustrasi|infografis|png|jpe?g|svg|video|mp4|animasi|file|berkas)(\b|$)/i;
  var FILE_VERB = /(\b|^)(buat|buatkan|bikin|bikinkan|bikinin|buatin|generate|create|make|jadikan|ubah (jadi|ke)|convert|konversi|ekspor|export|susun|siapkan|tolong (buat|bikin)|minta)(\b|$)/i;
  var WANTS_CODE = /(\b|^)(kode|code|coding|script|skrip|python|javascript|typescript|program|fungsi|function|html saja|react)(\b|$)/i;
  function stampOf(ts) {
    var d = new Date(ts), off = -d.getTimezoneOffset();
    return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' (GMT' + (off >= 0 ? '+' : '-') + Math.floor(Math.abs(off) / 60) + (off % 60 ? ':' + String(Math.abs(off) % 60).padStart(2, '0') : '') + ')';
  }
  function wantsFile(text) {
    text = String(text || '');
    return FILE_NOUN.test(text) && FILE_VERB.test(text) && !WANTS_CODE.test(text) && !wantsApp(text);
  }
  /* "buat presentasi di Canva" — the user names a connected app: the work belongs there, not in a local file. */
  function wantsApp(text) {
    if (!window.MCP) return null;
    var t = ' ' + String(text || '').toLowerCase() + ' ';
    var names = {};
    MCP.tools().forEach(function (x) { if (x._serverName) names[x._serverName] = 1; });
    return Object.keys(names).find(function (n) {
      var words = n.toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length > 2 && !/^(mcp|server|app|the|api)$/.test(w); });
      return words.some(function (w) { return new RegExp('[^a-z0-9]' + w + '[^a-z0-9]').test(t); });
    }) || null;
  }

  function turnHasFile(conv) {
    for (var i = conv.messages.length - 1; i >= 0; i--) {
      var m = conv.messages[i];
      if (m.role === 'user' && !(m.meta && m.meta.synthetic)) return false;
      if (m.role === 'assistant' && (m.content || []).some(function (b) { return b.type === 'tool_call' && b.name === 'create_file'; })) return true;
    }
    return false;
  }

  function lastUserText(conv) {
    for (var i = conv.messages.length - 1; i >= 0; i--) {
      var m = conv.messages[i];
      if (m.role === 'user' && !(m.meta && m.meta.synthetic)) return textOf(m.content);
    }
    return '';
  }

  /* Messages sent to the model: compacted turns are replaced by the summary,
     UI-only entries are skipped. */
  /* Older tool output and big tool-call payloads (whole files written, long
     edits) are replaced by short stubs once they are a few steps behind —
     the work is already on disk. Marking happens in batches and is stored on
     the message, so the prompt prefix stays identical between batches and
     provider-side prompt caching keeps working. */
  var LEAN_KEEP = 2, LEAN_BATCH = 5, DEEP_KEEP = 10, DEEP_BATCH = 12;
  function leanMark(conv) {
    var tools = conv.messages.filter(function (m) { return m.role === 'tool' && !m.compacted && !m.lean; });
    if (tools.length > LEAN_BATCH) {
      var cut = conv.messages.indexOf(tools[tools.length - LEAN_KEEP]);
      for (var i = 0; i < cut; i++) {
        var m = conv.messages[i];
        if (m.role === 'tool' || m.role === 'assistant') m.lean = true;
      }
    }
    // Second tier: steps far behind keep only a one-line trace of what happened.
    var lean1 = conv.messages.filter(function (m) { return m.role === 'tool' && !m.compacted && m.lean && !m.lean2; });
    if (leanOn() && lean1.length > DEEP_BATCH) {
      var cut2 = conv.messages.indexOf(lean1[lean1.length - DEEP_KEEP]);
      for (var j = 0; j < cut2; j++) {
        var mm = conv.messages[j];
        if (mm.lean && (mm.role === 'tool' || mm.role === 'assistant')) mm.lean2 = true;
      }
    }
  }
  function trace(s) {
    s = String(s || '');
    var first = s.split('\n').filter(function (l) { return l.trim(); })[0] || '';
    return (first.length > 160 ? first.slice(0, 160) + '…' : first) + (s.length > 200 ? ' [+' + s.length + ' karakter dipangkas]' : '');
  }
  function stub(s, head, tail, what) {
    s = String(s || '');
    if (s.length <= head + tail + 200) return s;
    return s.slice(0, head) + '\n…[' + (s.length - head - tail) + ' karakter ' + what + ' dipangkas untuk hemat token — jalankan/baca ulang bila perlu]…\n' + s.slice(-tail);
  }
  var STUB_TAG = 'sinai-omitted';
  /* A placeholder from leanArgs copied back by the model (old or new form). */
  function copiedStub(args) {
    return Object.keys(args || {}).some(function (k) {
      var v = args[k];
      return typeof v === 'string' && (v.indexOf(STUB_TAG) >= 0 || /\[\d+ karakter, \d+ baris — sudah diterapkan/.test(v));
    });
  }
  function leanArgs(args, max) {
    var o = {};
    Object.keys(args || {}).forEach(function (k) {
      var v = args[k];
      o[k] = typeof v === 'string' && v.length > (max || 1200) ? v.slice(0, 80) + '⟪' + STUB_TAG + ' ' + v.length + ' chars — already applied; NOT real content, never copy this⟫' : v;
    });
    return o;
  }

  /* Messages sent to the model: compacted turns are replaced by the summary,
     UI-only entries are skipped, old bulky content is slimmed (see leanMark). */
  function apiMessages(conv, exclude) {
    var out = [];
    if (conv.summary) {
      out.push({ role: 'user', content: [{ type: 'text', text: '<conversation_summary>\n' + conv.summary.text + '\n</conversation_summary>\n\nThe earlier part of this conversation was compacted into the summary above. Continue from where it left off.' }] });
    }
    var lastUser = -1, userIdx = [];
    conv.messages.forEach(function (m, i) { if (m.role === 'user' && !(m.meta && m.meta.synthetic)) { lastUser = i; userIdx.push(i); } });
    function userTurnsAfter(i) { return userIdx.filter(function (u) { return u > i; }).length; }
    // Older full versions of an artifact that was rewritten later are not needed again.
    var latestArt = {};
    conv.messages.forEach(function (m, i) {
      if (m.role !== 'assistant') return;
      var re = /<artifact\s[^>]*id="([^"]+)"/g, x, t = textOf(m.content);
      while ((x = re.exec(t))) latestArt[x[1]] = i;
    });
    conv.messages.forEach(function (m, i) {
      if (m === exclude || m.compacted || m.uiOnly) return;
      if (m.role === 'user') {
        // Each real message carries its own send time (stable per message, so the prompt stays cacheable).
        var stamp = m.ts && !(m.meta && m.meta.synthetic) ? [{ type: 'text', text: '[Waktu pesan: ' + stampOf(m.ts) + ']' }] : [];
        out.push({ role: 'user', content: stamp.concat(m.content) });
      }
      else if (m.role === 'assistant') {
        if (!m.content || !m.content.length) return;
        var content = m.content;
        // Reasoning of earlier turns is never needed again; in long agent turns, older steps keep only a stub.
        if (i < lastUser) content = content.filter(function (b) { return b.type !== 'thinking'; });
        else if (m.lean) content = content.map(function (b) { return b.type === 'thinking' && (b.text || '').length > 200 ? Object.assign({}, b, { text: b.text.slice(0, m.lean2 ? 40 : 160) + '…', signature: undefined }) : b; });
        if (m.lean2) content = content.map(function (b) { return b.type === 'text' && b.text.length > 300 ? Object.assign({}, b, { text: trace(b.text) }) : b; });
        // Chat: long answers from older turns are shortened (recent turns stay complete).
        if (leanOn() && conv.mode !== 'code' && userTurnsAfter(i) >= 4) content = content.map(function (b) {
          return b.type === 'text' && b.text.length > 2400 && b.text.indexOf('<artifact') < 0 ? Object.assign({}, b, { text: stub(b.text, 1400, 500, 'jawaban lama') }) : b;
        });
        if (m.lean) content = content.map(function (b) { return b.type === 'tool_call' ? Object.assign({}, b, { args: leanArgs(b.args, m.lean2 ? 200 : 1200) }) : b; });
        content = content.map(function (b) {
          if (b.type !== 'text' || b.text.indexOf('<artifact') < 0) return b;
          var t2 = b.text.replace(/(<artifact\s[^>]*id="([^"]+)"[^>]*>)([\s\S]*?)(<\/artifact>)/g, function (all, open, id, body, close) {
            return latestArt[id] > i && body.length > 400 ? open + '\n[versi lama — sudah diganti versi yang lebih baru di bawah]\n' + close : all;
          });
          return t2 === b.text ? b : Object.assign({}, b, { text: t2 });
        });
        if (!content.length) return;
        out.push({ role: 'assistant', content: content, model: m.model });
      } else if (m.role === 'tool') {
        out.push({ role: 'tool', results: m.results.map(function (r) {
          if (m.pruned && r.content.length > 600) return Object.assign({}, r, { content: '[Output lama dipangkas untuk menghemat konteks. Jalankan ulang alatnya bila perlu.]', images: undefined });
          if (m.lean2) return Object.assign({}, r, { content: (r.isError ? '[error] ' : '') + trace(r.content), images: undefined });
          if (m.lean) return Object.assign({}, r, { content: stub(r.content, 600, 250, 'output'), images: undefined });
          return r;
        }) });
      }
    });
    // Anthropic & most APIs need the transcript to start with a user turn
    while (out.length && out[0].role !== 'user') out.shift();
    return out;
  }

  function transcript(msgs, maxChars) {
    var parts = msgs.map(function (m) {
      if (m.role === 'user') return 'USER:\n' + (m.content || []).map(function (b) { return b.type === 'text' ? b.text : b.type === 'file' ? '[file ' + b.name + ']\n' + U.truncateMiddle(b.text || '', 4000) : '[image]'; }).join('\n');
      if (m.role === 'assistant') {
        return 'ASSISTANT:\n' + (m.content || []).map(function (b) {
          if (b.type === 'text') return b.text;
          if (b.type === 'tool_call') return '[tool call ' + b.name + ' ' + U.truncateMiddle(JSON.stringify(b.args || {}), 1500) + ']';
          return '';
        }).filter(Boolean).join('\n');
      }
      if (m.role === 'tool') return 'TOOL RESULTS:\n' + m.results.map(function (r) { return '[' + r.name + (r.isError ? ' (error)' : '') + ']\n' + U.truncateMiddle(r.content || '', 2500); }).join('\n');
      return '';
    });
    return U.truncateMiddle(parts.join('\n\n'), maxChars || 120000);
  }

  // ------------------------------------------------------------------ public API

  function isRunning(convId) { return runs.has(convId); }

  function stop(convId) {
    var run = runs.get(convId);
    if (!run) return;
    run.ac.abort();
    approvals.forEach(function (a, id) {
      if (a.convId === convId) { a.resolve({ allow: false, aborted: true }); approvals.delete(id); }
    });
  }

  function answerApproval(callId, decision) {
    var a = approvals.get(callId);
    if (!a) return;
    approvals.delete(callId);
    a.resolve(decision);
  }

  async function send(conv, input) {
    if (runs.has(conv.id)) return;
    var content = [];
    (input.attachments || []).forEach(function (a) {
      if (a.kind === 'image') content.push({ type: 'image', mime: a.mime, data: a.data, name: a.name });
      else content.push({ type: 'file', name: a.name, text: a.text });
    });
    if (input.text) content.push({ type: 'text', text: input.text });
    if (!content.length) return;
    var msg = { id: U.uid('m_'), role: 'user', content: content, ts: Date.now() };
    if (input.display) msg.meta = { display: input.display };
    conv.messages.push(msg);
    conv.updatedAt = Date.now();
    // Every new request gets its own work plan: the old list (done or not)
    // must not show above the composer while the new request runs.
    if (conv.todos && conv.todos.length) { conv.todos = []; emit('todos', conv); }
    if (!conv.model) conv.model = defaultModelRef(conv.mode);
    Store.saveConv(conv);
    touch(conv, msg);
    await runTurn(conv);
  }

  /* Re-run from a user message (edit) or regenerate the last answer. */
  async function rerunFrom(conv, userMsgId, newText) {
    if (runs.has(conv.id)) return;
    var idx = conv.messages.findIndex(function (m) { return m.id === userMsgId; });
    if (idx < 0) return;
    var m = conv.messages[idx];
    if (newText != null) {
      var keep = m.content.filter(function (b) { return b.type !== 'text'; });
      keep.push({ type: 'text', text: newText });
      m.content = keep;
    }
    conv.messages = conv.messages.slice(0, idx + 1);
    conv.todos = [];
    if (conv.summary && !conv.messages.some(function (x) { return x.compacted; })) conv.summary = null;
    conv.updatedAt = Date.now();
    Store.saveConv(conv);
    emit('reset', conv);
    await runTurn(conv);
  }

  async function regenerate(conv) {
    for (var i = conv.messages.length - 1; i >= 0; i--) {
      var m = conv.messages[i];
      if (m.role === 'user' && !(m.meta && m.meta.synthetic)) return rerunFrom(conv, m.id);
    }
  }

  async function continueRun(conv) {
    if (runs.has(conv.id)) return;
    await runTurn(conv);
  }

  // ------------------------------------------------------------------ turn

  async function runTurn(conv) {
    var ref = conv.model || defaultModelRef(conv.mode);
    var r = Providers.resolve(ref);
    var run = {
      ac: new AbortController(), convId: conv.id, startedAt: Date.now(), changes: [], readFiles: new Map(),
      toolLog: [], allowedCmds: new Set(), wsContext: null,
    };
    runs.set(conv.id, run);
    emit('run', conv, true);
    try {
      if (!r) throw new Error('Belum ada model yang dipilih. Tambahkan API key di Pengaturan → Provider, lalu pilih model.');
      conv.model = { providerId: r.provider.id, modelId: r.modelId };
      run.origRef = conv.model;
      run.model = r;
      var level = levelOf(conv);
      run.turnId = lastRealUserId(conv);
      if (window.Skills) { try { await Skills.load(conv.workspace); } catch (e) { /* keep previous list */ } }
      // File requests need tools (create_file), which the deliberation pipeline does not run.
      if (conv.mode !== 'code' && (level === 'deep' || level === 'max') && !wantsFile(lastUserText(conv))) await deliberateResilient(conv, level, run);
      else if (window.Team && permissionMode(conv) !== 'plan' && Team.wanted(conv, lastUserText(conv)) && !conv.messages.some(function (m) { return m.role === 'team' && m.turnId === run.turnId; })) await teamRun(conv, r, level, run);
      else await agentLoop(conv, r, level, run);
      if (!conv.eval) {
        maybeTitle(conv, run.model);
        if (window.Repair) Repair.learn(conv, run, run.model).catch(function () {});
      }
    } catch (e) {
      console.error(e);
      var last = conv.messages[conv.messages.length - 1];
      if (!last || last.role !== 'assistant') {
        last = { id: U.uid('m_'), role: 'assistant', content: [], ts: Date.now(), model: conv.model };
        conv.messages.push(last);
      }
      last.streaming = false;
      last.error = e.message || String(e);
      touch(conv, last);
    } finally {
      // A fallback model only stands in for this turn; the user's pick is tried first next time.
      if (run.switched && run.origRef) conv.model = run.origRef;
      runs.delete(conv.id);
      conv.updatedAt = Date.now();
      Store.saveConv(conv, true);
      emit('run', conv, false);
      if (!conv.eval) Native.call('app.attention').catch(function () {});
    }
  }

  async function buildSystem(conv, r, level, run) {
    var ctx = { modelName: r.info.name || r.modelId, providerName: r.provider.name, sinerli: r.provider.presetId === 'sinerli', web: webOn(conv), cwd: conv.workspace,
      mode: conv.mode, style: conv.style, project: conv.projectId ? Store.project(conv.projectId) : null, ctxTokens: r.info.ctx, intent: intentOf(conv), fullAuto: permissionMode(conv) === 'auto' };
    var sys;
    if (conv.mode === 'code') {
      if (!run.wsContext) run.wsContext = await workspaceContext(conv.workspace);
      sys = Prompts.codeSystem(Object.assign(ctx, run.wsContext));
      if (permissionMode(conv) === 'plan') sys += Prompts.PLAN_MODE;
      if (permissionMode(conv) === 'auto') sys += Prompts.FULL_AUTO;
      sys += '\n\n' + Prompts.capabilities('code');
    } else if (conv.mode === 'design') {
      sys = Prompts.designSystem(ctx);
    } else {
      sys = Prompts.chatSystem(ctx);
    }
    if (MCP.tools().length) sys += '\n\n# Connected apps\nWhen the user asks to change something in a connected app (Canva, Notion, Google, Figma…), edit it there directly with the connector tools — do not hand back a file or instructions instead. Read the item first to get real IDs, follow the tool schema exactly (never guess field names), finish multi-step flows (start → edit → commit/save), then confirm with a link.' +
      '\n- CRUD target: if the user gives a link/name of an existing item, read and edit THAT item — never make a new blank design/sheet/page instead. To create something new, create it with its full content in one go (e.g. Canva generate-design / generate-design-structured with the real text per page, then create-design-from-candidate) — never an empty canvas or a local file. Delete only when the user asked.' +
      '\n- Locked/uneditable parts (e.g. Canva pages with is_editable: false): edit everything that IS editable and commit it, then do NOT stop to ask — build the rest automatically: create a new design in the same style (same palette, fonts, layout rhythm) containing the full content, and report both links. Ask only if the source content itself is missing.' +
      '\n- Design quality (decks, posters): plan a page-by-page outline first; one idea per slide, a clear title + max 4–5 short bullets or one visual, consistent palette/fonts from the template, enough whitespace, no overflowing or placeholder text. After creating, look at the page thumbnails and fix anything cramped, overflowing or inconsistent before reporting.' +
      '\n- Progress style: one short sentence before each group of tool calls (what you are doing now). Final report: at most ~6 short lines — what was done, link(s), what (if anything) needs the user. No long explanations of internal errors.';
    if (window.Mirror) sys += Mirror.promptSection(conv);
    if (window.Profiles) sys += Profiles.promptSection(r);
    if (window.Profiles && Profiles.get(r).htmlFiles && conv.mode !== 'code') sys += Prompts.HTML_FILES;
    if (window.Repair) sys += Repair.promptSection(conv, r);
    if (window.Skills) sys += Skills.promptSection();
    if (window.Templates) sys += Templates.promptSection(conv);
    var wantsScratch = !r.info.reasoning && r.provider.kind !== 'anthropic' &&
      (conv.mode === 'chat' ? level !== 'fast' : (level === 'deep' || level === 'max'));
    if (wantsScratch) sys += Prompts.SCRATCHPAD;
    if (level === 'max' && conv.mode === 'code') {
      sys += '\n\n# Maximum-rigour mode\nThe user asked for maximum quality. Investigate thoroughly, plan with todo_write, and verify every change by actually running builds/tests/scripts. Re-read your edits. Do not stop until the task is complete and verified.';
    }
    return sys;
  }

  async function workspaceContext(cwd) {
    var out = { tooling: '', git: '', tree: '', projectNotes: '', projectNotesFile: '' };
    try {
      var t = await Native.call('exec.sync', { command: Store.info.posixShell === false
        ? "'git','node','npm','pnpm','yarn','bun','deno','python','py','pip','go','cargo','java','mvn','gradle','php','composer','ruby','docker','rg','winget','choco','scoop','dotnet' | Where-Object { Get-Command $_ -ErrorAction SilentlyContinue } | ForEach-Object { Write-Host -NoNewline ($_ + ' ') }"
        : 'for t in git node npm pnpm yarn bun deno python3 python pip3 brew apt dnf pacman winget swift xcodebuild go cargo java mvn gradle php composer ruby docker rg dotnet; do command -v $t >/dev/null 2>&1 && printf "%s " $t; done', timeout: 8 });
      out.tooling = (t.stdout || '').trim();
    } catch (e) { /* ignore */ }
    if (!cwd) return out;
    try {
      var g = await Native.call('exec.sync', { command: Store.info.posixShell === false
        ? 'git rev-parse --abbrev-ref HEAD 2>$null; if ($LASTEXITCODE -eq 0) { "---"; git status --short 2>$null | Select-Object -First 25; "---"; git log --oneline -5 2>$null }'
        : 'git rev-parse --abbrev-ref HEAD 2>/dev/null && echo "---" && git status --short 2>/dev/null | head -25 && echo "---" && git log --oneline -5 2>/dev/null', cwd: cwd, timeout: 8 });
      if (g.code === 0 && g.stdout.trim()) {
        var parts = g.stdout.replace(/\r\n/g, '\n').split('---\n');
        out.git = '- Branch: ' + (parts[0] || '').trim() + '\n- Status:\n' + ((parts[1] || '').trim() || '(clean)') + '\n- Recent commits:\n' + (parts[2] || '').trim();
      }
    } catch (e) { /* not a repo */ }
    try {
      var l = await Native.call('fs.list', { path: cwd, depth: 2, limit: 150 });
      out.tree = l.entries.map(function (e) { return '  '.repeat(e.depth - 1) + e.path.split('/').pop() + (e.dir ? '/' : ''); }).join('\n') + (l.truncated ? '\n…' : '');
    } catch (e) { /* ignore */ }
    var names = ['SINAI.md', 'AGENTS.md', 'CLAUDE.md', '.cursorrules'];
    for (var i = 0; i < names.length; i++) {
      try {
        var f = await Native.call('fs.read', { path: cwd + '/' + names[i], maxBytes: 40000 });
        if (f.content) { out.projectNotes = f.content; out.projectNotesFile = names[i]; break; }
      } catch (e) { /* missing */ }
    }
    return out;
  }

  function newAssistant(conv, r) {
    var msg = { id: U.uid('m_'), role: 'assistant', content: [], model: { providerId: r.provider.id, modelId: r.modelId }, ts: Date.now(), streaming: true };
    conv.messages.push(msg);
    touch(conv, msg);
    return msg;
  }

  function addUsage(conv, msg, u) {
    if (!u) return;
    msg.usage = msg.usage || { input: 0, output: 0 };
    msg.usage.input += u.input || 0;
    msg.usage.output += u.output || 0;
    msg.usage.cached = (msg.usage.cached || 0) + (u.cacheRead || 0);
    conv.usage = conv.usage || { input: 0, output: 0 };
    conv.usage.input += u.input || 0;
    conv.usage.output += u.output || 0;
    conv.usage.cached = (conv.usage.cached || 0) + (u.cacheRead || 0);
    if (u.input) conv.lastInputTokens = u.input;
  }

  // ------------------------------------------------------------------ agent loop

  // ------------------------------------------------------------------ automatic recovery

  function refKey(r) { return r.provider.id + '::' + r.modelId; }

  /* What went wrong with a model request, for automatic recovery. */
  function failureKind(e) {
    var t = ((e.detail || '') + ' ' + (e.body || '') + ' ' + (e.message || '')).toLowerCase();
    if (e.status === 413 || /context[_ ]length|context window|maximum context|too many tokens|prompt is too long|input is too long|reduce the length|exceeds? the (model'?s? )?(context|max)|konteks melebihi/.test(t)) return 'context';
    if (e.status === 429) return 'ratelimit';
    if (e.network || Providers.retryable(e)) return 'transient';
    if ([401, 402, 403, 404].indexOf(e.status) >= 0 || /insufficient|quota|kuota|credit|balance|saldo|not found|does not exist|belum diatur/.test(t)) return 'model';
    return 'fatal';
  }

  /* Next model to try when the current one is out of quota / rate limited /
     unavailable: the user's fallback list, then their default models, then
     models that answered recently. Another provider is preferred, because a
     provider-wide limit hits all of its models. */
  function nextFallback(conv, cur, tried) {
    var s = Store.settings, explicit = [], others = [];
    function push(list, ref) {
      if (!ref || !ref.providerId || !ref.modelId) return;
      var k = ref.providerId + '::' + ref.modelId;
      if (tried.has(k) || explicit.concat(others).some(function (x) { return x.providerId + '::' + x.modelId === k; })) return;
      var h = window.Health && Health.get(ref.providerId, ref.modelId);
      if (h && !h.ok && h.code !== 'ratelimit' && h.code !== 'server' && Date.now() - h.at < 30 * 60000) return;
      list.push({ providerId: ref.providerId, modelId: ref.modelId });
    }
    (s.agent.fallbackModels || []).forEach(function (ref) { push(explicit, ref); });
    [s.defaults[conv.mode], s.defaults.code, s.defaults.chat, s.reviewer, s.utility].forEach(function (ref) { push(others, ref); });
    var all = Providers.allModels();
    all.forEach(function (m) { if (window.Health && Health.state(m.providerId, m.modelId) === 'ok') push(others, m); });
    if (!explicit.length && others.length < 3) all.slice(0, 8).forEach(function (m) { push(others, m); });
    others.sort(function (a, b) { return (a.providerId === cur.provider.id) - (b.providerId === cur.provider.id); });
    var list = explicit.concat(others);
    for (var i = 0; i < list.length; i++) { var r = Providers.resolve(list[i]); if (r) return r; }
    return null;
  }

  async function waitWithStatus(conv, run, msg, ms, label) {
    var end = Date.now() + ms;
    while (Date.now() < end) {
      if (run.ac.signal.aborted) return false;
      msg.status = label + ' — mencoba lagi otomatis dalam ' + U.fmtDuration(end - Date.now()) + '…';
      touch(conv, msg);
      await U.sleep(Math.min(1000, end - Date.now()));
    }
    return !run.ac.signal.aborted;
  }

  /* Providers.chat that does not give up: a full context is compacted, a
     model that is out of quota / rate limited / unavailable is swapped for
     another configured model, and when nothing else is available it waits
     (30 s → 5 min, up to ~45 min) and tries again — no clicks needed. */
  async function callModel(conv, run, msg, buildReq, opts) {
    var tried = new Set([refKey(run.model)]), waits = 0, compacts = 0;
    for (;;) {
      try {
        return await Providers.chat(buildReq(run.model));
      } catch (e) {
        if (run.ac.signal.aborted) return { content: msg.content, usage: { input: 0, output: 0 }, stopReason: 'aborted', aborted: true };
        if (Store.settings.agent.autoRecover === false) throw e;
        var kind = failureKind(e);
        if (kind === 'fatal') throw e;
        if (kind === 'context') {
          if (compacts >= 2 || !opts.compact) throw e;
          compacts++;
          msg.status = 'Konteks model penuh — meringkas percakapan otomatis…';
          touch(conv, msg);
          await opts.compact();
          continue;
        }
        var alt = kind === 'transient' && waits === 0 ? null : nextFallback(conv, run.model, tried);
        if (alt) {
          tried.add(refKey(alt));
          var why = kind === 'ratelimit' ? 'batas rate/kuota' : kind === 'model' ? 'tidak tersedia/kuota habis' : 'server bermasalah';
          run.switchNote = 'Beralih otomatis dari ' + (run.model.info.name || run.model.modelId) + ' ke ' + (alt.info.name || alt.modelId) + ' (' + why + ').';
          run.model = alt;
          run.switched = true;
          msg.model = { providerId: alt.provider.id, modelId: alt.modelId };
          msg.status = run.switchNote;
          touch(conv, msg);
          continue;
        }
        if (kind === 'model' || waits >= 10) throw e;
        var ms = Math.min(300000, 30000 * Math.pow(2, waits));
        waits++;
        if (!await waitWithStatus(conv, run, msg, ms, kind === 'ratelimit' ? 'Batas rate tercapai di semua model' : 'Koneksi/server bermasalah')) {
          return { content: msg.content, usage: { input: 0, output: 0 }, stopReason: 'aborted', aborted: true };
        }
        tried = new Set([refKey(run.model)]);
      }
    }
  }

  function unfinishedTodos(conv) {
    return (conv.todos || []).filter(function (t) { return t && t.status !== 'completed'; });
  }

  /* An answer cut off by the output-token limit was continued in a follow-up
     request: fold the continuation back into the original message so the
     user (and artifact parser) sees one seamless answer. */
  function mergeContinuation(conv, root, msg) {
    var add = textOf(msg.content);
    var texts = root.content.filter(function (b) { return b.type === 'text'; });
    if (texts.length) texts[texts.length - 1].text += add; else root.content.push({ type: 'text', text: add });
    if (msg.usage) {
      root.usage = root.usage || { input: 0, output: 0 };
      root.usage.input += msg.usage.input || 0;
      root.usage.output += msg.usage.output || 0;
    }
    var i = conv.messages.indexOf(msg);
    if (i > 0 && conv.messages[i - 1].meta && conv.messages[i - 1].meta.kind === 'continue') conv.messages.splice(i - 1, 2);
    else if (i >= 0) conv.messages.splice(i, 1);
    root.notice = null;
    emit('reset', conv);
    return root;
  }

  function synthetic(conv, kind, text) {
    var m = { id: U.uid('m_'), role: 'user', ts: Date.now(), meta: { synthetic: true, kind: kind }, content: [{ type: 'text', text: text }] };
    conv.messages.push(m);
    touch(conv);
    return m;
  }

  // ------------------------------------------------------------------ agent loop

  var HARD_STEP_FACTOR = 10;

  async function agentLoop(conv, r, level, run) {
    var baseSteps = Math.max(5, Store.settings.agent.maxSteps || 80), maxSteps = baseSteps;
    var autoGo = Store.settings.agent.autoContinue !== false;
    var reviews = 0, maxReviews = level === 'max' ? 3 : 2, fixes = 0, fileNudged = false, conts = 0, todoNudges = 0;
    var system = null, sysMode = null, sysModel = null;
    run.model = run.model || r;

    for (var step = 0; ; step++) {
      if (run.ac.signal.aborted) break;
      if (step >= maxSteps) {
        // Long jobs keep going on their own (up to a hard safety cap).
        if (autoGo && maxSteps < baseSteps * HARD_STEP_FACTOR) maxSteps += baseSteps;
        else {
          var lastMsg = newAssistant(conv, run.model);
          lastMsg.streaming = false;
          lastMsg.notice = 'Batas langkah agen (' + maxSteps + ') tercapai. Kirim "lanjutkan" untuk meneruskan.';
          touch(conv, lastMsg);
          break;
        }
      }
      r = run.model;
      var tools = toolsFor(conv);
      if (!system || sysMode !== permissionMode(conv) || sysModel !== r) { system = await buildSystem(conv, r, level, run); sysMode = permissionMode(conv); sysModel = r; }
      leanMark(conv);
      await maybeCompact(conv, r, run, system);
      var msg = newAssistant(conv, r);
      if (!r.info.vision) await Perception.prepare(conv, r, run.ac.signal, function (t) { msg.status = t; touch(conv, msg); }).catch(function (e) { console.warn(e); });
      // Routine follow-up steps (previous tools succeeded) do not need the deepest reasoning budget;
      // the first step of a turn and every step after an error still get the full level.
      var prevTool = conv.messages.slice(0, -1).reverse().find(function (m) { return m.role === 'tool' || (m.role === 'user' && !(m.meta && m.meta.synthetic)); });
      var stepLevel = level;
      if (leanOn() && step > 0 && prevTool && prevTool.role === 'tool' && !prevTool.results.some(function (x) { return x.isError; }) && (level === 'deep' || level === 'max')) stepLevel = 'balanced';
      var res = await callModel(conv, run, msg, function (rr) {
        if (!rr.info.tools && rr.info.toolMode !== 'xml' && tools.length) rr.info.toolMode = 'xml';
        return {
          provider: rr.provider, modelId: rr.modelId, info: rr.info, system: system, messages: apiMessages(conv, msg),
          tools: tools, level: stepLevel, signal: run.ac.signal, blocks: msg.content,
          temperature: rr.info.temperature != null ? rr.info.temperature : (window.Profiles ? Profiles.get(rr).temperature : undefined),
          onUpdate: function () { msg.status = null; touch(conv, msg); },
          onRetry: function (t) { msg.status = t; touch(conv, msg); },
        };
      }, { compact: function () { return maybeCompact(conv, run.model, run, system, true); } });
      msg.streaming = false;
      msg.status = null;
      if (run.switchNote) { msg.notice = run.switchNote; run.switchNote = null; }
      addUsage(conv, msg, res.usage);
      var truncated = res.stopReason === 'length' || res.stopReason === 'max_tokens';
      if (res.stopReason === 'refusal') msg.notice = 'Model menolak melanjutkan permintaan ini (refusal).';
      if (truncated) msg.notice = 'Respons terpotong karena mencapai batas token keluaran.';
      Store.saveConv(conv);
      touch(conv, msg);
      if (res.aborted || run.ac.signal.aborted) { msg.aborted = true; break; }

      var calls = msg.content.filter(function (b) { return b.type === 'tool_call'; });
      if (run.contOf) {
        var root = run.contOf;
        run.contOf = null;
        if (!calls.length) msg = mergeContinuation(conv, root, msg);
      }
      if (!calls.length) {
        // Cut off by the output limit: carry on automatically from where it stopped.
        if (truncated && autoGo && conts < 12) {
          conts++;
          msg.notice = null;
          run.contOf = msg;
          synthetic(conv, 'continue', 'Your previous reply was cut off by the output token limit. Continue EXACTLY where it stopped — mid-sentence or mid-code if needed. Do not repeat anything already written, do not restart, do not summarise, no preamble. If you were inside a code block or <artifact>, keep writing its content and close it properly.');
          continue;
        }
        if (conv.mode !== 'code' && fixes < 2) {
          var errs = Artifacts.collect(conv).errors.filter(function (e) { return e.msgId === msg.id; });
          if (errs.length) {
            fixes++;
            synthetic(conv, 'artifact-fix', 'Your artifact_edit could not be applied (' + errs.map(function (e) { return e.id + ': ' + e.error; }).join('; ') + '). Re-emit the COMPLETE updated artifact with the same id using <artifact …>…</artifact>.');
            continue;
          }
        }
        // Asked for a file but got code / instructions instead: ask once for the real file.
        if (conv.mode !== 'code' && !fileNudged && wantsFile(lastUserText(conv)) && !turnHasFile(conv) &&
            tools.some(function (t) { return t.name === 'create_file'; })) {
          fileNudged = true;
          synthetic(conv, 'file-nudge', 'You replied without creating the file I asked for. Do not give code, scripts or instructions. Call the create_file tool now with the complete, final content (choose the right kind and format), then reply in one or two short sentences.');
          continue;
        }
        // Design mode: one automatic art-director pass over a fresh visual artifact.
        if (conv.mode === 'design' && level === 'balanced' && autoGo && !run.polished && !(leanOn() && conv.polished) && Store.settings.agent.designPolish !== false) {
          var fresh = Artifacts.collect(conv).list.filter(function (a) {
            var v = a.versions[a.versions.length - 1];
            return v && v.msgId === msg.id && v.complete && !v.edit && /^(html|react|svg)$/.test(a.type);
          })[0];
          if (fresh) {
            run.polished = true;
            conv.polished = true;
            synthetic(conv, 'design-polish', 'Art-director pass (automatic): critically review the artifact "' + fresh.id + '" you just made against the Sinai design kit — art direction, hierarchy, spacing rhythm, typography scale, palette consistency, contrast, hover/focus states, responsiveness at 390px and 1440px, realistic content, and that the code runs without errors. Then re-emit the COMPLETE improved artifact with the same id (not an artifact_edit) that fixes every weakness you found and raises the visual polish to a top-tier product level. After it, write at most 3 short bullets on what you improved. Do not ask questions.');
            continue;
          }
        }
        // Code: berhenti tepat setelah alat gagal → cari solusi sendiri dulu (maks 4 kali per giliran).
        var lastTool = conv.messages.slice(0, -1).reverse().find(function (m) { return m.role === 'tool' || m.role === 'user'; });
        if (autoGo && conv.mode === 'code' && permissionMode(conv) !== 'plan' && Store.settings.agent.autoRecover !== false && lastTool && lastTool.role === 'tool' &&
            lastTool.results.some(function (x) { return x.isError && repairHint(x); }) && (run.repairNudges || 0) < 4) {
          run.repairNudges = (run.repairNudges || 0) + 1;
          synthetic(conv, 'self-repair', 'Your last tool step failed and the task is not done yet:\n' +
            lastTool.results.filter(function (x) { return x.isError; }).map(function (x) { return '- ' + x.name + ': ' + U.truncateMiddle(String(x.content || '').split('\n[Sinai self-repair]')[0], 300); }).join('\n') +
            '\n\nSolve it yourself: find the cause, pick a different working approach, and continue until the task is finished and verified. Only if it is truly impossible without something only I have (a password, a decision, hardware), say exactly what is needed.');
          continue;
        }
        // Stopped with planned work still open: keep going instead of waiting for a click.
        var open = unfinishedTodos(conv);
        if (autoGo && conv.mode === 'code' && permissionMode(conv) !== 'plan' && open.length && todoNudges < 4) {
          todoNudges++;
          synthetic(conv, 'todo-nudge', 'You stopped, but your todo list still has unfinished items:\n' + open.map(function (t) { return '- [' + t.status + '] ' + t.content; }).join('\n') +
            '\n\nKeep working until every item is done and verified, updating the list with todo_write as you go. Do not ask me for confirmation. If an item is genuinely impossible or no longer needed, mark it completed with a short note why, then give the final report.');
          continue;
        }
        // Lean mode: the independent reviewer only runs at max (it re-sends the whole change log).
        if (conv.mode === 'code' && Store.settings.agent.autoVerify && (level === 'deep' || level === 'max') && (!leanOn() || level === 'max') && run.changes.length && reviews < maxReviews) {
          var verdict = await verify(conv, r, run);
          if (verdict && verdict.verdict === 'needs_work' && verdict.issues && verdict.issues.length) {
            reviews++;
            synthetic(conv, 'review', 'An independent reviewer checked your work and reported these issues:\n' + verdict.issues.map(function (x) { return '- ' + x; }).join('\n') + '\n\nVerify each one against the actual code. Fix every real problem, re-run the relevant checks, then give an updated final report. If an issue is not real, explain briefly why.');
            continue;
          }
        }
        // User "stop" hooks (e.g. run the test suite): a failing hook sends the agent back to work.
        if (window.Hooks && conv.mode === 'code' && run.changes.length && (run.stopHooks || 0) < 2) {
          var hookOut = await Hooks.onStop(conv);
          if (hookOut) {
            run.stopHooks = (run.stopHooks || 0) + 1;
            synthetic(conv, 'hook', 'The user\'s stop hook failed after your changes:\n' + hookOut + '\n\nFix the cause, re-run the relevant checks, then give an updated final report.');
            continue;
          }
        }
        break;
      }
      if (truncated) {
        calls.forEach(function (c) { if (c.invalidArgs != null) c.truncated = true; });
      }
      await executeCalls(conv, r, run, msg, calls);
      // Stuck in a loop (same failure again and again)? Make it stop and rethink
      // instead of burning hundreds of steps on blind retries.
      var recent = conv.messages.slice(-24).filter(function (m) { return m.role === 'tool'; }).reduce(function (a, m) { return a.concat(m.results); }, []).slice(-8);
      var errSigs = recent.filter(function (x) { return x.isError || /exit code: [1-9]|bad pattern|not found|ERR_/.test(String(x.content).slice(0, 400)); })
        .map(function (x) { return x.name + ':' + String(x.content).replace(/\d+/g, '#').slice(0, 60); });
      var sameErr = errSigs.length >= 3 && errSigs.slice(-3).every(function (e) { return e === errSigs[errSigs.length - 1]; });
      if ((errSigs.length >= 6 || sameErr) && step - (run.lastStuck == null ? -99 : run.lastStuck) >= 12) {
        run.lastStuck = step;
        var strong = routerModel('strong');
        if (strong && refKey(strong) !== refKey(run.model) && Store.settings.router.escalate !== false) {
          run.switchNote = 'Model utama buntu — dialihkan ke ' + (strong.info.name || strong.modelId) + ' (model kuat) untuk sisa tugas ini.';
          run.model = strong;
          run.switched = true;
          system = null;
        }
        synthetic(conv, 'stuck', 'Stop — your last attempts keep failing (' + errSigs.slice(-3).join(' | ') + '). Do not retry the same thing. Briefly: (1) what you know for sure, (2) the most likely root cause, (3) ONE different approach that tests it with the smallest possible step. Read the exact relevant code before editing; prefer one precise fix over many probes.');
      }
      if (run.ac.signal.aborted) break;
    }
  }

  function lastUserText(conv) {
    for (var i = conv.messages.length - 1; i >= 0; i--) {
      var m = conv.messages[i];
      if (m.role === 'user' && !(m.meta && m.meta.synthetic)) return textOf(m.content);
    }
    return '';
  }
  function permissionMode(conv) { return conv.permission || Store.settings.permission || 'ask'; }

  function cmdPrefix(cmd) {
    var t = String(cmd || '').trim().split(/\s+/);
    return t[0] + (t[1] && t[1][0] !== '-' ? ' ' + t[1] : '');
  }

  function needsApproval(tool, args, conv, run, ctx) {
    var mode = permissionMode(conv);
    // create_file only writes brand-new files into the Sinai output folder.
    // Code mode stays focused on the files at hand: a web lookup the user did not
    // ask for is confirmed once per conversation (full-auto never asks).
    if (tool.kind === 'web' && conv.mode === 'code' && mode !== 'auto' && !conv.allowWeb && !OPTIONAL.web_search[0].test(lastUserText(conv))) {
      return { warn: 'Sinai ingin mencari referensi di web untuk tugas ini' + (args.query ? ': "' + String(args.query).slice(0, 120) + '"' : args.url ? ': ' + String(args.url).slice(0, 120) : '') + '.' };
    }
    if (tool.kind === 'read' || tool.kind === 'web' || tool.kind === 'meta' || tool.kind === 'output') return null;
    if (tool.kind === 'plan') return { plan: true };
    if (tool.kind === 'integration') {
      // Outbound messages confirm unless full-auto runs unattended (setting "confirmOutbound").
      if (tool.confirm === 'always' && (mode !== 'auto' || Store.settings.agent.confirmOutbound)) return { warn: 'Tindakan ini mengirim pesan keluar atas nama Anda.', once: true };
      if (mode === 'auto' || (conv.allowedIntegrations || []).indexOf(tool.name) >= 0) return null;
      var personal = { calendar: 'kalender', reminders: 'pengingat', contacts: 'kontak' }[tool.name];
      return { warn: personal ? 'Sinai ingin mengakses ' + personal + ' Anda.' : 'Sinai ingin menjalankan tindakan integrasi ' + (U.isMac() ? 'macOS' : 'sistem') + '.' };
    }
    if (tool.kind === 'mcp') {
      var inner = tool.name === 'connector_call' ? MCP.find(args.tool || '') : null;
      var key = inner ? inner.name : tool.name;
      if (tool.trusted || (inner && (inner._trusted || inner._ro)) || tool._ro || mode === 'auto' || (conv.allowedMcp || []).indexOf(key) >= 0) return null;
      return {};
    }
    if (tool.name === 'run_command') {
      // Full-auto never stops to ask: risky-but-recoverable commands just run,
      // machine-wrecking ones (and anything needing a password) are skipped.
      if (mode === 'auto') {
        var lvl = Tools.dangerLevel(args.command || '');
        if (args.admin) return { block: 'perintah administrator memerlukan password' };
        if (lvl && lvl.critical) return { block: lvl.reason };
        return null;
      }
      var danger = Tools.dangerReason(args.command || '');
      if (args.admin) return { danger: danger || 'Perintah ini meminta hak administrator (' + (U.isMac() ? 'macOS' : 'sistem') + ' akan meminta password Anda).' };
      if (danger) return { danger: danger };
      if (mode === 'auto') return null;
      if (Tools.isSafeCommand(args.command)) return null;
      if (run.allowedCmds.has(cmdPrefix(args.command)) || (conv.allowedCmds || []).indexOf(cmdPrefix(args.command)) >= 0) return null;
      return {};
    }
    if (tool.kind === 'write') {
      if (mode === 'auto' || conv.allowEdits) return null;
      var target = tool.targetPath ? tool.targetPath(args, ctx) : '';
      var inside = conv.workspace && target && (U.samePath(target, conv.workspace) || U.startsWithPath(target, conv.workspace + '/'));
      if (mode === 'edits' && inside && tool.name !== 'delete_path') return null;
      if (!inside && conv.workspace) return { warn: 'File ini berada di luar folder proyek.' };
      return {};
    }
    return {};
  }

  function toolCtx(conv, run, call) {
    var home = Store.info.home;
    var cwd = conv.workspace || null;
    return {
      cwd: cwd, home: home, conv: conv, run: run, vision: !!(run.model && run.model.info.vision), model: run.model,
      abs: function (p) { return U.resolvePath(cwd || home, p, home); },
      progress: function (d) { call.live = d; touch(conv); },
      onAbort: function (fn) {
        var s = run.ac.signal;
        if (s.aborted) { fn(); return function () {}; }
        s.addEventListener('abort', fn);
        return function () { s.removeEventListener('abort', fn); };
      },
      onTodos: function () { emit('todos', conv); emit('title', conv); },
    };
  }

  async function executeOne(conv, r, run, call) {
    var tool = toolFor(call.name);
    var result = { id: call.id, name: call.name, content: '', isError: false };
    if (tool && permissionMode(conv) === 'plan' && (tool.kind === 'write' || tool.kind === 'exec')) {
      result.content = 'Plan mode is active: modifying tools are disabled. Finish investigating and call exit_plan_mode with your plan.';
      result.isError = true;
      call.state = 'error';
      return result;
    }
    if (!tool) {
      result.content = 'Unknown tool "' + call.name + '". Available tools: ' + toolsFor(conv).map(function (t) { return t.name; }).join(', ');
      result.isError = true;
      call.state = 'error';
      return result;
    }
    if (call.invalidArgs != null) {
      result.content = call.truncated
        ? 'Your tool call was cut off because the response hit the output token limit, so its arguments are incomplete. Split the work into smaller pieces (e.g. write a large file in several edit_file steps).'
        : 'The arguments were not valid JSON. Re-issue the call with valid JSON arguments.';
      result.isError = true;
      call.state = 'error';
      return result;
    }
    var args = call.args || {};
    var missing = (tool.parameters.required || []).filter(function (k) { return args[k] == null; });
    if (missing.length) {
      result.content = 'Missing required parameter(s): ' + missing.join(', ') + '.';
      result.isError = true;
      call.state = 'error';
      return result;
    }
    var appWanted = tool.name === 'create_file' && !/(\b|^)(export|ekspor|unduh|download|simpan ke (komputer|lokal))(\b|$)/i.test(lastUserText(conv)) && wantsApp(lastUserText(conv));
    if (appWanted) {
      result.content = 'Not run: the user asked for this in ' + appWanted + ', which is connected. Do NOT create a local file — create/edit it directly in ' + appWanted + ' with its connector tools (search the tools first if needed), then share the link.';
      result.isError = true;
      call.state = 'error';
      return result;
    }
    if (copiedStub(args)) {
      result.content = 'Your arguments contain a context placeholder (an omitted earlier value), not real content. Nothing was run. Write the actual full text/command yourself — re-read the file first if you need its current content.';
      result.isError = true;
      call.state = 'error';
      return result;
    }
    var ctx = toolCtx(conv, run, call);
    if (tool.kind === 'question' && conv.eval) { call.state = 'done'; result.content = 'The user skipped the question. Choose sensibly yourself and continue.'; return result; }
    if (tool.kind === 'question') return askUser(conv, run, call, args, result);
    var need = needsApproval(tool, args, conv, run, ctx);
    if (need && need.block) {
      call.state = 'error';
      call.blocked = need.block;
      touch(conv);
      result.content = 'Not run — blocked automatically in full-auto mode (' + need.block + '). The user is not watching, so nobody was asked. Reach the goal another way (target the exact file/process/PID, avoid sudo, use user-level install locations), or skip this step and mention it in your final report.';
      result.isError = true;
      return result;
    }
    if (need && conv.eval) {
      call.state = 'denied';
      result.content = 'Not run: this is an unattended evaluation run, so actions that need the user\'s approval are unavailable. Complete the task without it.';
      result.isError = true;
      return result;
    }
    if (need) {
      call.state = 'pending';
      call.approval = { danger: need.danger || null, warn: need.warn || null, plan: !!need.plan, once: !!need.once };
      if (tool.preview) { try { call.preview = await tool.preview(args, ctx); } catch (e) { /* ignore */ } }
      touch(conv);
      var decision = await new Promise(function (resolve) { approvals.set(call.id, { resolve: resolve, convId: conv.id }); });
      call.preview = null;
      if (!decision.allow) {
        call.state = 'denied';
        call.approval = null;
        touch(conv);
        result.content = decision.aborted ? 'Cancelled by the user.' : tool.kind === 'plan'
          ? 'The user did not approve the plan yet.' + (decision.feedback ? ' Their feedback: "' + decision.feedback + '".' : '') + ' Stay in plan mode, revise the plan accordingly and call exit_plan_mode again.'
          : 'The user denied this action.' + (decision.feedback ? ' The user said: "' + decision.feedback + '".' : '') + ' Do not retry the same action; adjust your approach or ask the user how to proceed.';
        result.isError = true;
        return result;
      }
      call.approval = null;
      if (decision.always) {
        if (tool.name === 'run_command') {
          run.allowedCmds.add(cmdPrefix(args.command));
          conv.allowedCmds = (conv.allowedCmds || []).concat([cmdPrefix(args.command)]);
        } else if (tool.kind === 'mcp') {
          conv.allowedMcp = (conv.allowedMcp || []).concat([tool.name === 'connector_call' ? String(args.tool || '') : tool.name]);
        } else if (tool.kind === 'web') {
          conv.allowWeb = true;
        } else if (tool.kind === 'integration') {
          conv.allowedIntegrations = (conv.allowedIntegrations || []).concat([tool.name]);
        } else conv.allowEdits = true;
      }
    }
    call.state = 'running';
    call.startedAt = Date.now();
    touch(conv);
    try {
      var hookBlock = window.Hooks ? await Hooks.before(tool, args, conv) : null;
      if (hookBlock) throw new Error(hookBlock.block);
      if (tool.kind === 'write') await checkpoint(conv, run, tool, args, ctx);
      var out = await tool.run(args, ctx);
      result.content = U.truncateMiddle(String(out.content == null ? '' : out.content), leanOn() ? (conv.mode === 'code' ? 14000 : 24000) : (conv.mode === 'code' ? 24000 : 40000));
      result.isError = !!out.isError;
      if (window.Hooks) { var hookNote = await Hooks.after(tool, args, conv, result).catch(function () { return ''; }); if (hookNote) result.content += '\n\n' + hookNote; }
      if (out.images && out.images.length) result.images = out.images.slice(0, 8);
      call.display = out.display || null;
    } catch (e) {
      result.content = 'Error: ' + (e.message || String(e));
      result.isError = true;
    }
    call.live = null;
    call.state = result.isError ? 'error' : 'done';
    call.endedAt = Date.now();
    run.toolLog.push({ name: call.name, args: args, result: result.content, isError: result.isError });
    touch(conv);
    return result;
  }

  /* ask_user: clickable options (or a typed answer). In full-auto nobody is
     watching, so the model's recommended (first) option is taken at once. */
  async function askUser(conv, run, call, args, result) {
    var list = (Array.isArray(args.questions) && args.questions.length ? args.questions : [{ question: args.question, options: args.options }]).slice(0, 3)
      .map(function (q) {
        var opts = (Array.isArray(q.options) ? q.options : []).map(function (o) { return typeof o === 'string' ? { label: o } : { label: String(o.label || o.title || ''), description: o.description ? String(o.description) : '' }; })
          .filter(function (o) { return o.label; }).slice(0, 4);
        return { question: String(q.question || ''), options: opts };
      }).filter(function (q) { return q.question; });
    if (!list.length) { result.content = 'ask_user needs a question.'; result.isError = true; call.state = 'error'; return result; }
    var answers;
    if (permissionMode(conv) === 'auto') {
      answers = list.map(function (q) { return q.options[0] ? q.options[0].label : '(putuskan sendiri)'; });
      call.display = { type: 'question', questions: list, answers: answers, auto: true };
      call.state = 'done';
      touch(conv);
      result.content = 'Full-auto mode: the user is not available, so your recommended option was chosen automatically:\n' +
        list.map(function (q, i) { return '- ' + q.question + ' → ' + answers[i]; }).join('\n') + '\nProceed with it and do not ask again.';
      return result;
    }
    call.state = 'pending';
    call.question = { questions: list };
    touch(conv);
    var d = await new Promise(function (resolve) { approvals.set(call.id, { resolve: resolve, convId: conv.id }); });
    call.question = null;
    if (d.aborted || !d.answers) {
      call.state = 'denied';
      touch(conv);
      result.content = d.aborted ? 'Cancelled by the user.' : 'The user skipped the question. Choose sensibly yourself and continue.';
      result.isError = !!d.aborted;
      return result;
    }
    call.display = { type: 'question', questions: list, answers: d.answers };
    call.state = 'done';
    touch(conv);
    result.content = 'The user answered:\n' + list.map(function (q, i) { return '- ' + q.question + ' → ' + (d.answers[i] || '(tidak dijawab)'); }).join('\n');
    return result;
  }

  /* What a tool call touches, so independent calls can run at the same time:
     {reads: [paths], writes: [paths]} — '*' = the whole workspace, '!' = must run alone. */
  function callResources(conv, c) {
    var t = toolFor(c.name), a = c.args || {};
    var home = Store.info.home, base = conv.workspace || home;
    function abs(p) { return p ? U.resolvePath(base, String(p), home) : '*'; }
    if (!t) return { reads: [], writes: [] };
    switch (t.kind) {
      case 'read':
        if (c.name === 'read_file') return { reads: [abs(a.path)], writes: [] };
        if (c.name === 'task' && a.can_write) { var own = Array.isArray(a.files) && a.files.length ? a.files.map(abs) : ['*']; return { reads: own, writes: own }; }
        return { reads: ['*'], writes: [] };
      case 'write':
        if (c.name === 'move_path') return { reads: [], writes: [abs(a.from), abs(a.to)] };
        return { reads: [], writes: [a.path ? abs(a.path) : '*'] };
      case 'exec':
        return Tools.isSafeCommand(a.command) ? { reads: ['*'], writes: [] } : { reads: [], writes: ['*'] };
      case 'meta':
        return { reads: [], writes: [c.name === 'todo_write' ? 'todo:' : 'meta:' + c.name] };
      case 'question': case 'plan':
        return { reads: [], writes: ['!'] };
      default:
        return { reads: [], writes: [] };   // web, output, mcp, integration: independent
    }
  }
  function overlap(p, q) {
    if (p === '!' || q === '!') return true;
    if (/:$/.test(p) || /:$/.test(q) || /^meta:/.test(p) || /^meta:/.test(q)) return p === q;
    return p === '*' || q === '*' || p === q || p.indexOf(q + '/') === 0 || q.indexOf(p + '/') === 0;
  }
  function conflicts(x, y) {
    function any(as, bs) { return as.some(function (a) { return bs.some(function (b) { return overlap(a, b); }); }); }
    return any(x.writes, y.writes.concat(y.reads)) || any(y.writes, x.reads);
  }
  /* Ordered batches: a call joins the current batch only when it conflicts with
     nothing in it; otherwise it waits for the batch to finish. */
  function planBatches(conv, calls) {
    var batches = [];
    calls.forEach(function (c) {
      var res = callResources(conv, c);
      var cur = batches[batches.length - 1];
      if (cur && !cur.some(function (x) { return conflicts(x.res, res); })) cur.push({ call: c, res: res });
      else batches.push([{ call: c, res: res }]);
    });
    return batches;
  }

  // ------------------------------------------------------------------ self-repair (code)

  /* Diagnosis + jalan keluar konkret untuk hasil alat yang gagal, supaya agen mencari
     solusi sendiri sampai berhasil (bukan berhenti dan melapor "gagal/ditolak"). */
  var REPAIR_RULES = [
    [/permission denied|EACCES|EPERM|operation not permitted|access is denied|akses ditolak|not permitted/i,
      'Access was denied. Find out why (ls -la / stat the path, check owner & mode, whether it is a system/protected folder or needs macOS Full Disk Access). Then use a path you own (the project folder, home or a temp dir), fix permissions on files you own (chmod u+rw / chmod +x for scripts), install tools in user space (npm i -D / npx, pip install --user, a local venv) instead of system-wide, and never loop on sudo. If the folder is truly protected, work on a copy elsewhere.'],
    [/command not found|not recognized as an internal|No such file or directory.*(bin|exe)|ENOENT.*spawn|is not installed/i,
      'A program is missing. Check alternatives already on PATH (which/where, `npx <tool>`, python3 -m <module>, bundled scripts in package.json), or install it locally (npm i -D, pip install --user / venv, brew/winget/apt only if available without a password prompt). Then retry the original step.'],
    [/Cannot find module|ModuleNotFoundError|No module named|ERR_MODULE_NOT_FOUND|could not resolve|package .* not found/i,
      'A dependency is missing. Install the project dependencies (npm install / pnpm i / pip install -r requirements.txt / the correct package name), check the import path and spelling, then re-run.'],
    [/EADDRINUSE|address already in use|port .* (in use|is already)/i,
      'The port is busy. Find the process (lsof -i :PORT / netstat) — reuse it if it is this project\'s server, otherwise start on another free port.'],
    [/no such file|ENOENT|not found|does not exist|tidak ditemukan/i,
      'The path does not exist. Locate the right one with glob/grep/list_directory (check relative vs absolute path and spelling), create missing parent folders, then retry.'],
    [/old_string|not unique|did not match|could not find the text/i,
      'The edit did not match. Re-read the file (current exact text, whitespace and indentation), then edit again with a unique, exact old_string — or rewrite the small section.'],
    [/timed? ?out|ETIMEDOUT|ECONNRESET|ENOTFOUND|network|socket hang up|getaddrinfo/i,
      'A timeout or network problem. Retry once; for long jobs run them in the background with a log and poll it; use a mirror/alternative source or an offline approach if the host stays unreachable.'],
    [/SyntaxError|TypeError|ReferenceError|error TS\d+|compil|build failed|exit code [1-9]|Traceback|FAILED|AssertionError/i,
      'The code/build failed. Read the exact first error and its file:line, inspect that code, fix the root cause (not the symptom), and re-run the same command to confirm.'],
  ];
  function repairHint(res) {
    if (!res || !res.isError) return '';
    var c = String(res.content || '');
    if (/^(Cancelled|The user denied|The user skipped)/.test(c)) return '';   // keputusan pengguna dihormati
    var rule = REPAIR_RULES.find(function (x) { return x[0].test(c); });
    return '\n\n[Sinai self-repair] ' + (rule ? rule[1] + ' ' : '') +
      'Do not give up and do not just report the failure: diagnose the cause, try the next best approach (a different command, path, tool or method), and keep going until the step works and is verified. Avoid repeating the exact same failing call.';
  }

  async function executeCalls(conv, r, run, msg, calls) {
    var toolMsg = { id: U.uid('m_'), role: 'tool', results: [], ts: Date.now() };
    conv.messages.push(toolMsg);
    var byId = {};
    var batches = planBatches(conv, calls);
    for (var b = 0; b < batches.length; b++) {
      if (run.ac.signal.aborted) break;
      var results = await Promise.all(batches[b].map(function (x) { return executeOne(conv, r, run, x.call); }));
      results.forEach(function (x) { byId[x.id] = x; });
      Store.saveConv(conv);
    }
    calls.forEach(function (c) {
      if (byId[c.id] && conv.mode === 'code' && byId[c.id].isError && Store.settings.agent.autoRecover !== false) {
        byId[c.id].content = String(byId[c.id].content || '') + repairHint(byId[c.id]);
        run.lastFailures = (run.lastFailures || 0) + 1;
      }
      if (byId[c.id]) toolMsg.results.push(byId[c.id]);
      else {
        c.state = 'denied';
        toolMsg.results.push({ id: c.id, name: c.name, content: 'Cancelled by the user before it ran.', isError: true });
      }
    });
    touch(conv);
  }

  // ------------------------------------------------------------------ checkpoints (rewind)

  /* Remembers a file's content before the agent first touches it in a turn. */
  async function checkpoint(conv, run, tool, args, ctx) {
    var target = tool.name === 'move_path' ? ctx.abs(args.from) : ctx.abs(args.path);
    if (!target || !run.turnId) return;
    run.snap = run.snap || {};
    if (run.snap[target]) return;
    run.snap[target] = true;
    var entry = { path: target, before: null, ts: Date.now() };
    try {
      var st = await Native.call('fs.stat', { path: target });
      if (st.exists && st.isDir) entry.dir = true;
      else if (st.exists) {
        if (st.size > 5000000) entry.skipped = true;
        else {
          var r = await Native.call('fs.read', { path: target, maxBytes: 5000000 });
          if (r.binary) entry.skipped = true; else entry.before = r.content;
        }
      }
    } catch (e) { entry.skipped = true; }
    if (tool.name === 'move_path') entry.movedTo = ctx.abs(args.to);
    if (tool.name === 'delete_path') entry.deleted = true;
    var cps = await Store.loadCheckpoints(conv.id);
    (cps[run.turnId] = cps[run.turnId] || []).push(entry);
    Store.saveCheckpoints(conv.id, cps);
  }

  /* Restores files changed from the given user message onward (or the whole session). */
  async function rewindCode(conv, fromUserMsgId) {
    var cps = await Store.loadCheckpoints(conv.id);
    var turns = conv.messages.filter(function (m) { return m.role === 'user' && !(m.meta && m.meta.synthetic); }).map(function (m) { return m.id; });
    var start = fromUserMsgId ? turns.indexOf(fromUserMsgId) : 0;
    if (start < 0) start = 0;
    var restored = 0, problems = [];
    for (var i = turns.length - 1; i >= start; i--) {
      var list = (cps[turns[i]] || []).slice().reverse();
      for (var j = 0; j < list.length; j++) {
        var e = list[j];
        try {
          if (e.movedTo) { await Native.call('fs.move', { from: e.movedTo, to: e.path }); restored++; continue; }
          if (e.skipped || e.dir) { problems.push(U.basename(e.path) + (e.deleted ? ' (ada di Trash)' : ' (tidak dicadangkan)')); continue; }
          if (e.before == null) {
            var s = await Native.call('fs.stat', { path: e.path });
            if (s.exists) await Native.call('fs.trash', { path: e.path });
          } else {
            await Native.call('fs.write', { path: e.path, content: e.before });
          }
          restored++;
        } catch (err) { problems.push(U.basename(e.path) + ': ' + err.message); }
      }
      delete cps[turns[i]];
    }
    Store.saveCheckpoints(conv.id, cps);
    return { restored: restored, problems: problems };
  }

  // ------------------------------------------------------------------ sub-agents

  async function runSubagent(a, ctx) {
    var r = a.model || (!a.can_write && routerModel('light')) || ctx.model;
    if (!r) throw new Error('Model tidak tersedia');
    var system = Prompts.SUBAGENT + '\n\n# Environment\n- ' + Prompts.osLine() + ', home ' + Store.info.home + '\n- Project root: ' + (ctx.cwd || '(none)') + '\n- Date: ' + new Date().toISOString().slice(0, 10);
    var local = [{ role: 'user', content: [{ type: 'text', text: a.prompt }] }];
    // Worker sub-agents may edit files (only where the user lets edits run without asking).
    var mode = permissionMode(ctx.conv);
    var canWrite = !!a.can_write && (mode === 'auto' || mode === 'edits');
    var tools = canWrite ? Tools.forWorker(mode === 'auto') : Tools.forSubagent();
    if (canWrite) system = Prompts.WORKER + '\n\n# Environment\n- ' + Prompts.osLine() + ', home ' + Store.info.home + '\n- Project root: ' + (ctx.cwd || '(none)') + '\n- Date: ' + new Date().toISOString().slice(0, 10) +
      (Array.isArray(a.files) && a.files.length ? '\n- You own ONLY these files/folders (other workers edit the rest in parallel): ' + a.files.join(', ') : '');
    if (a.rolePrompt) system = a.rolePrompt + '\n\n' + system;
    var last = '', steps = 0, actions = [];
    for (; steps < (canWrite ? 80 : 30); steps++) {
      if (ctx.run.ac.signal.aborted) break;
      var blocks = [];
      var res = await Providers.chat({ provider: r.provider, modelId: r.modelId, info: r.info, system: system, messages: local, tools: tools,
        level: 'balanced', signal: ctx.run.ac.signal, blocks: blocks });
      addUsage(ctx.conv, { usage: null }, res.usage);
      if (res.aborted) break;
      local.push({ role: 'assistant', content: blocks.slice() });
      var calls = blocks.filter(function (b) { return b.type === 'tool_call'; });
      last = textOf(blocks) || last;
      if (!calls.length) break;
      var results = await Promise.all(calls.map(async function (c) {
        var t = Tools.get(c.name);
        var lbl = t ? t.label(c.args || {}, ctx) : { verb: c.name, target: '' };
        actions.push(lbl.verb + ' ' + lbl.target);
        ctx.progress({ type: 'output', command: '', output: actions.slice(-12).join('\n'), running: true });
        var allowed = t && t.name !== 'task' && (t.kind === 'read' || t.kind === 'web' || (canWrite && tools.some(function (x) { return x.name === t.name; })));
        if (!allowed) return { id: c.id, name: c.name, content: 'Tool not available to sub-agents.', isError: true };
        if (t.kind === 'write' || t.kind === 'exec') {
          var need = needsApproval(t, c.args || {}, ctx.conv, ctx.run, ctx);
          if (need) return { id: c.id, name: c.name, content: 'Not permitted for a worker in this permission mode' + (need.block ? ' (' + need.block + ')' : '') + '. Leave this step to the main agent and mention it in your report.', isError: true };
          if (t.kind === 'write') await checkpoint(ctx.conv, ctx.run, t, c.args || {}, ctx);
        }
        try {
          var out = await t.run(c.args || {}, ctx);
          return { id: c.id, name: c.name, content: U.truncateMiddle(String(out.content || ''), 30000), isError: !!out.isError };
        } catch (e) { return { id: c.id, name: c.name, content: 'Error: ' + e.message, isError: true }; }
      }));
      local.push({ role: 'tool', results: results });
    }
    return { content: last || 'Sub-agen tidak menghasilkan laporan.', display: { type: 'subagent', steps: steps + 1, actions: actions.slice(-30), report: last } };
  }

  // ------------------------------------------------------------------ Tim Agen (code)
  /* Arsitek → agen spesialis paralel → Bug Test (integrasi + build/tes/live view)
     → Peninjau kode + Keamanan → perbaikan. Each stage shows on one team card. */
  async function teamRun(conv, r, level, run) {
    var R = Team.ROLES;
    var card = { id: U.uid('m_'), role: 'team', uiOnly: true, ts: Date.now(), turnId: run.turnId, state: 'running', stages: [] };
    conv.messages.push(card);
    function stage(role, title) { var s = { role: role, name: R[role].name, title: title || R[role].desc, state: 'running' }; card.stages.push(s); touch(conv, card); return s; }
    function done(s, state, report) { s.state = state; if (report != null) s.report = String(report).slice(0, 1400); touch(conv, card); }
    var finish = function (state) { card.state = state; touch(conv, card); Store.saveConv(conv); };

    // 1. Arsitek
    var sp = stage('arsitek', 'Menyelidiki proyek & membagi tugas');
    var plan = null;
    try {
      var strong = routerModel('strong') || r;
      var pres = await runSubagent({ description: 'Arsitek', prompt: (conv.messages.length > 2 ? '# Earlier conversation (context)\n' + transcript(conv.messages.slice(-14, -1), 6000) + '\n\n' : '') + '# User request\n' + lastUserText(conv) + '\n\nInvestigate, then reply with ONLY the JSON plan object (no report, no prose).', rolePrompt: Team.PLANNER, model: strong }, toolCtx(conv, run, sp));
      plan = Team.parsePlan(pres.content);
    } catch (e) { done(sp, 'error', e.message); }
    if (run.ac.signal.aborted) { finish('stopped'); return; }
    if (!plan || plan.solo) {
      done(sp, 'pass', plan ? 'Tugas cukup dikerjakan satu agen.' : 'Rencana tidak terbaca — dikerjakan agen utama.');
      card.solo = true; finish('pass');
      await agentLoop(conv, r, level, run);
      return;
    }
    card.plan = { summary: plan.summary, stack: plan.stack, checks: plan.checks, tasks: plan.tasks.map(function (t) { return { role: t.role, title: t.title, files: t.files }; }) };
    done(sp, 'pass', plan.summary + (plan.stack ? ' · ' + plan.stack : '') + '\n' + plan.tasks.map(function (t) { return '• ' + R[t.role].name + ': ' + t.title; }).join('\n'));

    // 2. Builders (parallel waves) — only where edits may run without asking; otherwise the main agent builds with the plan.
    var mode = permissionMode(conv), workers = [];
    if (mode === 'auto' || mode === 'edits') {
      var ws = Team.waves(plan.tasks);
      for (var wi = 0; wi < ws.length && !run.ac.signal.aborted; wi++) {
        await Promise.all(ws[wi].map(async function (t) {
          var st = stage(t.role, t.title);
          try {
            var out = await runSubagent({ description: t.title, prompt: t.spec + (t.files.length ? '\n\nFiles you own: ' + t.files.join(', ') : ''), can_write: true, files: t.files, rolePrompt: Team.builderPrompt(t.role, plan, t) }, toolCtx(conv, run, st));
            done(st, 'pass', out.content);
            workers.push({ name: R[t.role].name, title: t.title, report: out.content });
          } catch (e) { done(st, 'error', e.message); workers.push({ name: R[t.role].name, title: t.title, report: 'FAILED: ' + e.message + ' — finish this part yourself.' }); }
        }));
      }
      if (run.ac.signal.aborted) { finish('stopped'); return; }
    } else {
      synthetic(conv, 'team-build', '[Tim Agen] The architect split the work. Build it now, task by task in this order (track it with todo_write), acting as each specialist in turn:\n\n# Goal\n' + plan.summary + '\n# Stack\n' + plan.stack + '\n# Shared interfaces\n' + plan.interfaces + '\n\n' +
        Team.waves(plan.tasks).reduce(function (a, w) { return a.concat(w); }, []).map(function (t, i) { return '## ' + (i + 1) + '. ' + R[t.role].name + ' — ' + t.title + '\nFiles: ' + t.files.join(', ') + '\n' + R[t.role].prompt + '\n' + t.spec; }).join('\n\n') +
        '\n\nWhen all parts are built, stop with a one-line summary (QA follows).');
      var bs = stage('sistem', 'Agen utama membangun sesuai rencana (mode izin: tanya dulu)');
      await agentLoop(conv, r, level, run);
      done(bs, run.ac.signal.aborted ? 'stopped' : 'pass');
      if (run.ac.signal.aborted) { finish('stopped'); return; }
    }

    // 3. Bug Test: integrate, build, test, live view, fix
    var qs = stage('qa');
    synthetic(conv, 'team-qa', Team.qaPrompt(plan, workers));
    await agentLoop(conv, r, level, run);
    done(qs, run.ac.signal.aborted ? 'stopped' : 'pass', 'Integrasi, build/tes, dan live view diperiksa — lihat laporan di bawah.');
    if (run.ac.signal.aborted) { finish('stopped'); return; }

    // 4. Peninjau kode + Keamanan (parallel), up to 2 fix rounds
    for (var round = 0; round < 2 && run.changes.length && !run.ac.signal.aborted; round++) {
      var rs = stage('reviewer', round ? 'Tinjau ulang perbaikan' : 'Memeriksa kebenaran & kelengkapan diff');
      var ks = stage('keamanan');
      var results = await Promise.all([
        verify(conv, r, run, { silent: true }).catch(function () { return null; }),
        Providers.complete(Providers.resolve(Store.settings.reviewer) || r, R.keamanan.prompt, [{ role: 'user', content: [{ type: 'text', text: '# Request\n' + lastUserText(conv) + '\n\n# Diff\n' + changeLog(run) }] }], { level: 'balanced', signal: run.ac.signal })
          .then(function (x) { var v = U.extractJSONObject(x.text) || { verdict: 'pass', issues: [] }; v.issues = (v.issues || []).map(String).filter(Boolean); return v; }).catch(function () { return null; }),
      ]);
      var rv = results[0], kv = results[1], issues = [];
      if (rv && rv.verdict === 'needs_work' && rv.issues.length) { done(rs, 'needs_work', rv.issues.join('\n')); issues = issues.concat(rv.issues.map(function (x) { return '[review] ' + x; })); } else done(rs, rv ? 'pass' : 'skipped');
      if (kv && kv.verdict === 'needs_work' && kv.issues.length) { done(ks, 'needs_work', kv.issues.join('\n')); issues = issues.concat(kv.issues.map(function (x) { return '[security] ' + x; })); } else done(ks, kv ? 'pass' : 'skipped');
      if (!issues.length) break;
      var fs2 = stage('qa', 'Memperbaiki temuan peninjau');
      synthetic(conv, 'team-fix', '[Tim Agen] The code reviewer and security agent reported:\n' + issues.map(function (x) { return '- ' + x; }).join('\n') + '\n\nVerify each against the actual code, fix every real problem at its root, re-run the relevant checks (and browser_check for web UIs), then give the final report: what was built, files, checks with results.');
      await agentLoop(conv, r, level, run);
      done(fs2, run.ac.signal.aborted ? 'stopped' : 'pass');
    }
    finish(run.ac.signal.aborted ? 'stopped' : 'pass');
  }

  // ------------------------------------------------------------------ verification (code)

  function changeLog(run) {
    var seen = {};
    var parts = [];
    for (var i = run.changes.length - 1; i >= 0; i--) {
      var c = run.changes[i];
      if (seen[c.path]) continue;
      seen[c.path] = true;
      var first = run.changes.find(function (x) { return x.path === c.path; });
      var before = first.before, after = c.after;
      if (after == null || typeof before === 'string' && before.indexOf('(') === 0 && before.indexOf('moved') >= 0) { parts.push('### ' + c.path + '\n' + (after == null ? '(deleted)' : '(moved)')); continue; }
      var d = U.diffLines(before || '', after || '');
      var hunks = U.diffHunks(d.ops, 3);
      var txt = hunks.map(function (h) { return h.gap ? '@@ … ' + h.gap + ' unchanged lines …' : (h.t === '+' ? '+' : h.t === '-' ? '-' : ' ') + h.s; }).join('\n');
      parts.push('### ' + c.path + (before == null ? ' (new file)' : '') + '\n```diff\n' + U.truncateMiddle(txt, 12000) + '\n```');
    }
    return U.truncateMiddle(parts.reverse().join('\n\n'), 70000);
  }

  async function verify(conv, r, run, opts) {
    var reviewer = Providers.resolve(Store.settings.reviewer) || r;
    var card = { id: U.uid('m_'), role: 'review', uiOnly: true, ts: Date.now(), state: 'running' };
    if (!(opts && opts.silent)) conv.messages.push(card);
    touch(conv, card);
    var log = run.toolLog.slice(-60).map(function (t) {
      return '- ' + t.name + ' ' + U.truncateMiddle(JSON.stringify(t.name === 'write_file' ? { path: t.args.path } : t.args), 400) + (t.isError ? ' → ERROR' : '') + '\n  ' + U.truncateMiddle(t.result || '', 1200).replace(/\n/g, '\n  ');
    }).join('\n');
    var finalReport = '';
    for (var i = conv.messages.length - 1; i >= 0; i--) {
      if (conv.messages[i].role === 'assistant') { finalReport = textOf(conv.messages[i].content); if (finalReport) break; }
    }
    var lean = leanOn();
    var prompt = '# User request\n' + lastUserText(conv) + '\n\n# Agent actions\n' + U.truncateMiddle(log, lean ? 8000 : 50000) +
      '\n\n# Resulting changes\n' + U.truncateMiddle(changeLog(run), lean ? 30000 : 70000) + '\n\n# Agent final report\n' + U.truncateMiddle(finalReport, 4000);
    try {
      var res = await Providers.complete(reviewer, Prompts.VERIFIER, [{ role: 'user', content: [{ type: 'text', text: prompt }] }], { level: 'balanced', signal: run.ac.signal });
      if (res.aborted) { card.state = 'skipped'; touch(conv, card); return null; }
      var v = U.extractJSONObject(res.text) || { verdict: /needs_work/.test(res.text) ? 'needs_work' : 'pass', issues: [] };
      v.issues = (v.issues || []).map(String).filter(Boolean);
      if (v.verdict !== 'needs_work') v.issues = [];
      card.state = v.verdict === 'needs_work' && v.issues.length ? 'needs_work' : 'pass';
      card.issues = v.issues;
      card.reviewer = reviewer.info.name || reviewer.modelId;
      touch(conv, card);
      return v;
    } catch (e) {
      card.state = 'error';
      card.error = e.message;
      touch(conv, card);
      return null;
    }
  }

  // ------------------------------------------------------------------ deliberation (chat)

  async function researchLoop(conv, r, system, base, stage, run, level) {
    var local = base.slice();
    var tools = Tools.forChat(true).filter(function (t) { return t.name !== 'memory'; });
    var blocks = [];
    for (var step = 0; step < 8; step++) {
      blocks = [];
      var res = await Providers.chat({
        provider: r.provider, modelId: r.modelId, info: r.info, system: system, messages: local, tools: tools,
        level: level === 'max' ? 'deep' : level, signal: run.ac.signal, blocks: blocks,
        onUpdate: function (b) { stage.text = textOf(b); stage.thinking = textOf(b, 'thinking'); touch(conv); },
      });
      stage.usage = res.usage;
      if (res.aborted) break;
      var calls = blocks.filter(function (b) { return b.type === 'tool_call'; });
      if (!calls.length) break;
      local.push({ role: 'assistant', content: blocks.slice() });
      var results = await Promise.all(calls.map(async function (c) {
        var tool = Tools.get(c.name);
        var lbl = tool ? tool.label(c.args || {}, toolCtx(conv, run, c)) : { verb: c.name, target: '' };
        stage.tools = (stage.tools || []).concat([lbl.verb + ': ' + lbl.target]);
        touch(conv);
        if (!tool || tool.kind !== 'web') return { id: c.id, name: c.name, content: 'Tool not available here.', isError: true };
        try {
          var out = await tool.run(c.args || {}, toolCtx(conv, run, c));
          return { id: c.id, name: c.name, content: U.truncateMiddle(out.content, 30000), isError: !!out.isError };
        } catch (e) { return { id: c.id, name: c.name, content: 'Error: ' + e.message, isError: true }; }
      }));
      local.push({ role: 'tool', results: results });
    }
    return { text: textOf(blocks), research: local.slice(base.length) };
  }

  /* The multi-pass pipeline restarted on another model (or after a wait)
     when the provider fails mid-way, instead of ending with an error. */
  async function deliberateResilient(conv, level, run) {
    var tried = new Set([refKey(run.model)]), waits = 0;
    for (;;) {
      var before = conv.messages.length;
      try { return await deliberate(conv, run.model, level, run); } catch (e) {
        if (run.ac.signal.aborted || Store.settings.agent.autoRecover === false) throw e;
        var kind = failureKind(e);
        if (kind === 'fatal' || kind === 'context') throw e;
        var alt = nextFallback(conv, run.model, tried);
        if (!alt && (kind === 'model' || waits >= 6)) throw e;
        conv.messages.splice(before);
        emit('reset', conv);
        var holder = newAssistant(conv, run.model);
        if (alt) {
          tried.add(refKey(alt));
          run.switchNote = 'Beralih otomatis dari ' + (run.model.info.name || run.model.modelId) + ' ke ' + (alt.info.name || alt.modelId) + '.';
          run.model = alt;
          run.switched = true;
        } else {
          var ok = await waitWithStatus(conv, run, holder, Math.min(300000, 30000 * Math.pow(2, waits++)), 'Provider sedang dibatasi');
          if (!ok) { holder.streaming = false; holder.aborted = true; touch(conv, holder); return; }
        }
        conv.messages.splice(conv.messages.indexOf(holder), 1);
      }
    }
  }

  async function deliberate(conv, r, level, run) {
    var reviewer = Providers.resolve(Store.settings.reviewer) || r;
    var system = await buildSystem(conv, r, level, run);
    var msg = newAssistant(conv, r);
    if (!r.info.vision) await Perception.prepare(conv, r, run.ac.signal, function (t) { msg.status = t; touch(conv, msg); }).catch(function (e) { console.warn(e); });
    msg.status = null;
    msg.deliberation = { stages: [], level: level };
    var base = apiMessages(conv, msg);
    function stage(label) {
      var s = { label: label, text: '', thinking: '', state: 'running', startedAt: Date.now() };
      msg.deliberation.stages.push(s);
      touch(conv, msg);
      return s;
    }
    function done(s, usage) { s.state = 'done'; s.endedAt = Date.now(); if (usage) addUsage(conv, msg, usage); touch(conv, msg); }

    // 1) Draft(s)
    var nDrafts = level === 'max' ? Math.max(2, Math.min(4, Store.settings.agent.maxDrafts || 3)) : 1;
    var s1 = stage((nDrafts > 1 ? 'Draf 1' : 'Draf awal') + (webOn(conv) ? ' (riset web & jawaban)' : ''));
    var draft1;
    if (webOn(conv)) {
      draft1 = await researchLoop(conv, r, system, base, s1, run, level);
    } else {
      var blocks = [];
      var res1 = await Providers.chat({
        provider: r.provider, modelId: r.modelId, info: r.info, system: system, messages: base, level: level,
        signal: run.ac.signal, blocks: blocks,
        onUpdate: function (b) { s1.text = textOf(b); s1.thinking = textOf(b, 'thinking'); touch(conv, msg); },
      });
      s1.usage = res1.usage;
      draft1 = { text: textOf(blocks), research: [] };
    }
    done(s1, s1.usage);
    if (run.ac.signal.aborted) return finishAborted(conv, msg, draft1.text);

    var researchNote = '';
    if (draft1.research.length) {
      researchNote = '\n\n# Research already gathered (web results)\n' + transcript(draft1.research.filter(function (m) { return m.role === 'tool'; }), 40000);
    }
    var drafts = [draft1.text];
    if (nDrafts > 1) {
      var extra = [];
      for (var i = 1; i < nDrafts; i++) extra.push(i);
      var outs = await Promise.all(extra.map(async function (i) {
        var dm = routerPanel()[i - 1] || r;
        var st = stage('Draf ' + (i + 1) + (dm !== r ? ' — ' + (dm.info.name || dm.modelId) : ' (sudut pandang berbeda)'));
        var b = [];
        var rr = await Providers.chat({
          provider: dm.provider, modelId: dm.modelId, info: dm.info, system: system + Prompts.DRAFT_ANGLES[i % Prompts.DRAFT_ANGLES.length] + researchNote,
          messages: base, level: 'deep', signal: run.ac.signal, blocks: b, temperature: dm.info.reasoning ? undefined : 0.8,
          onUpdate: function (bb) { st.text = textOf(bb); st.thinking = textOf(bb, 'thinking'); touch(conv, msg); },
        });
        done(st, rr.usage);
        return textOf(b);
      }));
      drafts = drafts.concat(outs.filter(Boolean));
    }
    if (run.ac.signal.aborted) return finishAborted(conv, msg, drafts[0]);

    var convo = transcript(base, 60000);
    var notes = '';
    if (drafts.length > 1) {
      var s2 = stage('Sintesis & penilaian kandidat');
      var syn = await Providers.complete(reviewer, Prompts.SYNTH, [{ role: 'user', content: [{ type: 'text', text: '# Conversation\n' + convo + '\n\n' + drafts.map(function (d, k) { return '# CANDIDATE ' + (k + 1) + '\n' + d; }).join('\n\n') }] }],
        { level: 'deep', signal: run.ac.signal, onUpdate: function (b) { s2.text = textOf(b); s2.thinking = textOf(b, 'thinking'); touch(conv, msg); } });
      notes = syn.text;
      s2.text = syn.text;
      done(s2, syn.usage);
      if (run.ac.signal.aborted) return finishAborted(conv, msg, drafts[0]);
    }

    // 2) Critique of the best available draft
    var draftForReview = drafts[0];
    if (drafts.length > 1) {
      var s3a = stage('Menyusun jawaban gabungan');
      var comb = await Providers.complete(r, system + '\n\n' + Prompts.REFINER + researchNote,
        base.concat([{ role: 'user', content: [{ type: 'text', text: '[Internal — not written by the user]\n<draft>\n' + drafts[0] + '\n</draft>\n\n<review_notes>\n' + notes + '\n\n' + drafts.slice(1).map(function (d, k) { return '<alternative_candidate ' + (k + 2) + '>\n' + d + '\n</alternative_candidate>'; }).join('\n') + '\n</review_notes>\n\nNow write the final reply to my previous message.' }] }]),
        { level: 'deep', signal: run.ac.signal, onUpdate: function (b) { s3a.text = textOf(b); touch(conv, msg); } });
      draftForReview = comb.text || drafts[0];
      s3a.text = draftForReview;
      done(s3a, comb.usage);
      if (run.ac.signal.aborted) return finishAborted(conv, msg, draftForReview);
    }
    var s3 = stage('Kritik ahli');
    var crit = await Providers.complete(reviewer, Prompts.CRITIC, [{ role: 'user', content: [{ type: 'text', text: '# Conversation\n' + convo + '\n\n# DRAFT reply to the last user message\n' + draftForReview + researchNote }] }],
      { level: 'deep', signal: run.ac.signal, onUpdate: function (b) { s3.text = textOf(b); s3.thinking = textOf(b, 'thinking'); touch(conv, msg); } });
    s3.text = crit.text;
    done(s3, crit.usage);
    if (run.ac.signal.aborted) return finishAborted(conv, msg, draftForReview);

    // 3) Final answer, streamed visibly
    var clean = /^\s*NO_MAJOR_ISSUES\s*$/i.test(crit.text.trim());
    if (clean) {
      msg.content.length = 0;
      msg.content.push({ type: 'text', text: draftForReview });
    } else {
      msg.deliberation.finalizing = true;
      touch(conv, msg);
      var res3 = await Providers.chat({
        provider: r.provider, modelId: r.modelId, info: r.info, system: system + '\n\n' + Prompts.REFINER + researchNote,
        messages: base.concat([{ role: 'user', content: [{ type: 'text', text: '[Internal — not written by the user]\n<draft>\n' + draftForReview + '\n</draft>\n\n<review_notes>\n' + crit.text + '\n</review_notes>\n\nNow write the final reply to my previous message.' }] }]),
        level: level === 'max' ? 'deep' : 'balanced', signal: run.ac.signal, blocks: msg.content,
        onUpdate: function () { touch(conv, msg); },
      });
      addUsage(conv, msg, res3.usage);
      // keep only the answer text in the visible message; reasoning lives in the stages
      var finalText = textOf(msg.content) || draftForReview;
      msg.content.length = 0;
      msg.content.push({ type: 'text', text: finalText });
    }
    msg.deliberation.finalizing = false;
    if (run.switchNote) { msg.notice = run.switchNote; run.switchNote = null; }
    msg.streaming = false;
    Store.saveConv(conv);
    touch(conv, msg);
  }

  function finishAborted(conv, msg, text) {
    msg.streaming = false;
    msg.aborted = true;
    if (!textOf(msg.content) && text) msg.content.push({ type: 'text', text: text });
    touch(conv, msg);
  }

  // ------------------------------------------------------------------ context management

  function estimate(conv, system) {
    var n = U.estimateTokens(system || '');
    apiMessages(conv).forEach(function (m) {
      if (m.role === 'tool') m.results.forEach(function (r) { n += U.estimateTokens(r.content); });
      else (m.content || []).forEach(function (b) {
        if (b.type === 'image') n += 1500;
        else n += U.estimateTokens(b.text || (b.args ? JSON.stringify(b.args) : '') || '');
      });
    });
    return n;
  }

  async function maybeCompact(conv, r, run, system, force) {
    // Huge context windows (1M) are not a reason to resend 700k tokens every step:
    // coding sessions are compacted at a working budget instead.
    var limit = Math.min(r.info.ctx || 128000, conv.mode === 'code' ? (Store.settings.agent.contextBudget || (leanOn() ? 64000 : 100000)) : leanOn() ? Math.max(64000, Store.settings.agent.contextBudget || 100000) : Infinity);
    var est = Math.max(estimate(conv, system), 0);
    if (!force && est < limit * 0.72) return;
    // 1) prune bulky old tool output first (cheap, keeps reasoning intact)
    var toolMsgs = conv.messages.filter(function (m) { return m.role === 'tool' && !m.compacted && !m.pruned; });
    if (!force && toolMsgs.length > 6) {
      toolMsgs.slice(0, toolMsgs.length - 6).forEach(function (m) { m.pruned = true; });
      if (estimate(conv, system) < limit * 0.6) return;
    }
    // 2) summarise everything before a safe cut point
    var live = conv.messages.filter(function (m) { return !m.compacted && !m.uiOnly; });
    if (live.length < 4) return;
    var cut = -1;
    for (var i = live.length - 3; i > 0; i--) {
      if (live[i].role === 'user' || (live[i].role === 'assistant' && live[i - 1].role !== 'assistant')) { cut = i; break; }
    }
    if (cut <= 0) return;
    var head = live.slice(0, cut);
    var divider = { id: U.uid('m_'), role: 'divider', uiOnly: true, ts: Date.now(), text: 'Meringkas percakapan sebelumnya agar muat di konteks model…' };
    conv.messages.splice(conv.messages.indexOf(live[cut]), 0, divider);
    touch(conv, divider);
    var util = Providers.resolve(Store.settings.utility) || r;
    var prior = conv.summary ? 'Previous summary:\n' + conv.summary.text + '\n\n' : '';
    var res = await Providers.complete(util, Prompts.COMPACT, [{ role: 'user', content: [{ type: 'text', text: prior + transcript(head, Math.min(400000, limit * 2.5)) }] }], { level: 'fast', signal: run.ac.signal });
    if (!res.text || res.aborted) { conv.messages.splice(conv.messages.indexOf(divider), 1); return; }
    conv.summary = { text: res.text, at: Date.now() };
    head.forEach(function (m) { m.compacted = true; });
    divider.text = 'Percakapan sebelumnya diringkas otomatis (' + head.length + ' pesan) untuk menghemat konteks.';
    Store.saveConv(conv);
    touch(conv, divider);
  }

  async function compactNow(conv) {
    var r = Providers.resolve(conv.model || defaultModelRef(conv.mode));
    if (!r || runs.has(conv.id)) return;
    var run = { ac: new AbortController(), changes: [], readFiles: new Map(), toolLog: [], allowedCmds: new Set() };
    runs.set(conv.id, run);
    emit('run', conv, true);
    try { await maybeCompact(conv, r, run, '', true); } finally { runs.delete(conv.id); emit('run', conv, false); }
  }

  // ------------------------------------------------------------------ titles

  async function maybeTitle(conv, r) {
    if (conv.titled) return;
    var users = conv.messages.filter(function (m) { return m.role === 'user' && !(m.meta && m.meta.synthetic); });
    if (!users.length) return;
    conv.titled = true;
    var u = (users[0].meta && users[0].meta.display) || textOf(users[0].content);
    var fallback = u.replace(/\s+/g, ' ').trim().split(' ').slice(0, 7).join(' ').slice(0, 60) || 'Percakapan baru';
    conv.title = fallback;
    Store.saveConv(conv);
    emit('title', conv);
    var a = '';
    for (var i = 0; i < conv.messages.length; i++) if (conv.messages[i].role === 'assistant') { a = textOf(conv.messages[i].content); if (a) break; }
    try {
      var util = Providers.resolve(Store.settings.utility) || r;
      var res = await Providers.complete(util, Prompts.TITLE, [{ role: 'user', content: [{ type: 'text', text: 'User: ' + u.slice(0, 2000) + '\n\nAssistant: ' + a.slice(0, 800) }] }], { level: 'off' });
      var t = (res.text || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean)[0] || '';
      t = t.replace(/^(title|judul)\s*:\s*/i, '').replace(/^["'“”*#\s]+|["'“”*.\s]+$/g, '').slice(0, 70);
      if (t) { conv.title = t; Store.saveConv(conv); emit('title', conv); }
    } catch (e) { /* keep fallback */ }
  }

  window.Engine = {
    LEVELS: LEVELS, on: on, send: send, stop: stop, isRunning: isRunning, answerApproval: answerApproval,
    rerunFrom: rerunFrom, regenerate: regenerate, continueRun: continueRun, compactNow: compactNow,
    defaultModelRef: defaultModelRef, levelOf: levelOf, webOn: webOn, textOf: textOf, approvals: approvals,
    toolFor: toolFor, runSubagent: runSubagent, _test: { apiMessages: apiMessages, leanMark: leanMark, estimate: estimate, planBatches: planBatches, toolsFor: toolsFor, buildSystem: buildSystem }, wantsFile: wantsFile, rewindCode: rewindCode, permissionMode: permissionMode,
  };
})();
