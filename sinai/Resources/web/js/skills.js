/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Skills: reusable instructions written in Markdown (SKILL.md with a small
   YAML front matter: name + description), compatible with Claude's skill
   format. Only the one-line descriptions sit in the system prompt; the full
   body is loaded on demand with the `skill` tool or a /slash command, so
   skills cost almost no tokens until used. A linter (with auto-fix) keeps
   hand-written and AI-written skills well-formed. */
(function () {
  'use strict';

  var list = [];          // [{name, description, body, path, dir, source, enabled}]
  var listeners = [];
  function notify() { listeners.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }

  function userDir() { return Store.info.supportDir + '/skills'; }

  // ---------------------------------------------------------------- format

  function slug(s) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
  }

  /* Front matter → {meta, body}. Supports `key: value`, quoted values and folded (>) / literal (|) blocks. */
  function parse(md) {
    md = String(md || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    var meta = {}, body = md;
    var m = /^---\n([\s\S]*?)\n---\s*(\n|$)/.exec(md);
    if (m) {
      body = md.slice(m[0].length);
      var lines = m[1].split('\n'), key = null, block = null;
      lines.forEach(function (l) {
        if (block && (/^\s+\S/.test(l) || l === '')) { meta[key] += (meta[key] ? (block === '|' ? '\n' : ' ') : '') + l.trim(); return; }
        block = null;
        var kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(l);
        if (!kv) return;
        key = kv[1].toLowerCase();
        var v = kv[2].trim();
        if (v === '>' || v === '|' || v === '>-' || v === '|-') { block = v.charAt(0); meta[key] = ''; return; }
        meta[key] = v.replace(/^(["'])([\s\S]*)\1$/, '$2');
      });
    }
    return { meta: meta, body: body.trim() };
  }

  function yamlValue(v) {
    v = String(v || '').replace(/\s+/g, ' ').trim();
    return /[:#\-\[\]{}&*!|>'"%@`]/.test(v) ? '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : v;
  }

  function serialize(meta, body) {
    var keys = ['name', 'description', 'category'].concat(Object.keys(meta).filter(function (k) { return k !== 'name' && k !== 'description' && k !== 'category'; }));
    return '---\n' + keys.filter(function (k) { return meta[k] != null && meta[k] !== ''; }).map(function (k) { return k + ': ' + yamlValue(meta[k]); }).join('\n') + '\n---\n\n' + String(body || '').trim() + '\n';
  }

  /* Checks a SKILL.md and returns {errors, warnings, fixed, meta, body}.
     `fixed` is a normalised version with everything that can be repaired automatically. */
  function lint(md, fallbackName) {
    var p = parse(md), meta = Object.assign({}, p.meta), body = p.body;
    var errors = [], warnings = [];
    // Body that is wrapped in a ```markdown fence (common in AI output).
    var fence = /^```(?:markdown|md)?\n([\s\S]*?)\n```$/.exec(body);
    if (fence) { body = fence[1].trim(); warnings.push('Isi dibungkus blok kode — dibuka otomatis.'); }
    if (!/^---\n/.test(String(md || '').replace(/^﻿/, ''))) warnings.push('Front matter (--- name / description ---) belum ada — ditambahkan otomatis.');
    var title = (/^#\s+(.+)$/m.exec(body) || [])[1];
    if (!meta.name) {
      meta.name = slug(title || fallbackName || 'skill-baru');
      warnings.push('"name" kosong — diisi "' + meta.name + '".');
    } else if (meta.name !== slug(meta.name)) {
      warnings.push('"name" harus huruf kecil-dan-tanda-hubung — diubah ke "' + slug(meta.name) + '".');
      meta.name = slug(meta.name);
    }
    if (!meta.name) errors.push('Nama skill tidak valid.');
    if (!meta.description) {
      var firstPara = body.split(/\n\s*\n/).map(function (x) { return x.replace(/^#+\s.*$/gm, '').trim(); }).filter(Boolean)[0] || '';
      if (firstPara) { meta.description = firstPara.replace(/\s+/g, ' ').slice(0, 300); warnings.push('"description" kosong — diambil dari paragraf pertama. Sebaiknya tulis kapan skill ini dipakai.'); }
      else errors.push('"description" wajib: jelaskan apa yang dilakukan skill dan KAPAN dipakai.');
    }
    if (meta.description && meta.description.length > 1024) { meta.description = meta.description.slice(0, 1020) + '…'; warnings.push('"description" lebih dari 1024 karakter — dipotong.'); }
    if (meta.description && meta.description.length < 40) warnings.push('"description" terlalu singkat — AI sulit tahu kapan memakainya. Tambahkan pemicu, mis. "Gunakan saat pengguna meminta …".');
    if (meta.description && !/(gunakan|pakai|use when|when |saat|ketika|jika|bila|trigger|untuk)/i.test(meta.description)) warnings.push('"description" sebaiknya menyebut KAPAN skill dipakai (mis. "Gunakan saat …").');
    if (!meta.category) { meta.category = guessCategory({ name: meta.name || '', description: meta.description || '' }); warnings.push('"category" kosong — diisi "' + meta.category + '".'); }
    else if (!CATEGORIES.some(function (x) { return x.toLowerCase() === String(meta.category).toLowerCase(); })) warnings.push('Kategori "' + meta.category + '" bukan kategori standar (' + CATEGORIES.join(', ') + ') — tetap boleh dipakai.');
    if (!body || body.length < 80) errors.push('Isi instruksi terlalu pendek. Tulis langkah kerja yang jelas.');
    else {
      if (!/^#{1,3}\s/m.test(body)) warnings.push('Belum ada judul/heading. Struktur yang disarankan: # Judul, ## Kapan dipakai, ## Langkah, ## Aturan, ## Contoh.');
      if (!/^\s*(\d+[.)]|[-*])\s/m.test(body)) warnings.push('Tidak ada daftar langkah/aturan. Instruksi berupa daftar lebih mudah diikuti AI.');
      if (body.length > 20000) warnings.push('Isi sangat panjang (' + body.length + ' karakter). Pertimbangkan memindahkan referensi ke file terpisah di folder skill.');
    }
    if (!/^#\s/m.test(body) && body) body = '# ' + (title || meta.name.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); })) + '\n\n' + body;
    return { errors: errors, warnings: warnings, meta: meta, body: body, fixed: serialize(meta, body) };
  }

  var TEMPLATE = [
    '---',
    'name: nama-skill',
    'description: Apa yang dilakukan skill ini dalam satu kalimat. Gunakan saat pengguna meminta … (sebutkan kata kunci / situasi pemicu).',
    'category: Dokumen',
    '---',
    '',
    '# Nama Skill',
    '',
    '## Kapan dipakai',
    '- Situasi atau permintaan yang memicu skill ini',
    '- Kapan TIDAK memakainya',
    '',
    '## Langkah',
    '1. Langkah pertama yang konkret',
    '2. Langkah berikutnya (alat apa dipakai, file apa dibaca/dibuat)',
    '3. Cara memeriksa hasilnya sebelum selesai',
    '',
    '## Aturan & standar kualitas',
    '- Format keluaran yang diharapkan',
    '- Hal yang wajib / dilarang',
    '',
    '## Contoh',
    'Masukan: …',
    'Keluaran: …',
    '',
  ].join('\n');

  /* Guide given to a model that writes or improves a skill. */
  var WRITER = [
    'You write SKILL.md files: reusable instructions that another AI assistant loads when a task matches.',
    'Output ONLY the file content (no code fence, no commentary), in the user\'s language, in exactly this shape:',
    '---',
    'name: kebab-case-name (lowercase letters, digits, hyphens; ≤ 64 chars)',
    'description: ONE paragraph (≤ 400 chars) saying what the skill does AND when to use it, with concrete trigger words/situations ("Gunakan saat pengguna meminta …"). This is the only part the assistant sees before loading the skill, so make it specific.',
    'category: one of Coding, Desain, Dokumen, Data, Riset, Bisnis, Pemasaran, Produktivitas, Lainnya',
    '---',
    '# Title',
    '## Kapan dipakai — bullet list of triggers and non-triggers',
    '## Langkah — numbered, imperative, concrete steps (which tools, which files, which order); include a verification step',
    '## Aturan & standar kualitas — must / must-not rules, output format, quality bar',
    '## Contoh — at least one short input → output example',
    'Optional sections: ## Template keluaran, ## Kesalahan umum, ## Referensi.',
    'Rules: be specific and testable, no filler, no placeholders like "…" left unfilled, no instructions that conflict with safety, keep it under ~2,500 words. Prefer checklists over prose.',
  ].join('\n');

  // ---------------------------------------------------------------- storage

  var CATEGORIES = ['Coding', 'Desain', 'Dokumen', 'Data', 'Riset', 'Bisnis', 'Pemasaran', 'Produktivitas', 'Lainnya'];
  var CAT_HINTS = [
    ['Coding', /code|coding|kode|program|api|debug|bug|test|deploy|git|backend|frontend|database|sql|script/i],
    ['Desain', /desain|design|ui|ux|gambar|image|logo|poster|warna|figma|visual|ilustrasi/i],
    ['Dokumen', /dokumen|document|laporan|report|ppt|presentasi|slide|word|pdf|surat|proposal|cv/i],
    ['Data', /data|excel|spreadsheet|csv|analisis|analytics|kpi|grafik|chart|statistik/i],
    ['Riset', /riset|research|cari|sumber|literatur|investigasi/i],
    ['Pemasaran', /marketing|pemasaran|konten|content|sosial media|caption|iklan|seo|brand/i],
    ['Bisnis', /bisnis|business|email|penjualan|sales|keuangan|finance|legal|kontrak|hr/i],
  ];
  function guessCategory(s) {
    var t = (s.name + ' ' + s.description).toLowerCase();
    for (var i = 0; i < CAT_HINTS.length; i++) if (CAT_HINTS[i][1].test(t)) return CAT_HINTS[i][0];
    return 'Lainnya';
  }
  function categoryOf(s) {
    var c = String(s.category || '').trim();
    var hit = CATEGORIES.find(function (x) { return x.toLowerCase() === c.toLowerCase(); });
    return hit || c || 'Lainnya';
  }

  function enabledMap() { return Store.settings.skills || {}; }

  async function readSkillDir(dir, source) {
    var out = [];
    var l;
    try { l = await Native.call('fs.list', { path: dir, depth: 2, limit: 500 }); } catch (e) { return out; }
    var files = (l.entries || []).filter(function (e) { return !e.dir && /(^|\/)SKILL\.md$/i.test(e.path) && e.depth === 2; });
    // Also accept loose *.md files directly in the folder (single-file skills).
    files = files.concat((l.entries || []).filter(function (e) { return !e.dir && e.depth === 1 && /\.md$/i.test(e.path) && !/README\.md$/i.test(e.path); }));
    for (var i = 0; i < files.length; i++) {
      var path = /^\//.test(files[i].path) || /^[A-Za-z]:/.test(files[i].path) ? files[i].path : dir + '/' + files[i].path;
      try {
        var r = await Native.call('fs.read', { path: path, maxBytes: 400000 });
        var p = parse(r.content);
        var name = slug(p.meta.name || U.basename(path).replace(/\.md$/i, '').replace(/^SKILL$/i, U.basename(path.replace(/\/SKILL\.md$/i, ''))));
        if (!name) continue;
        out.push({ name: name, description: p.meta.description || '', category: p.meta.category || '', body: p.body, path: path, dir: path.replace(/\/[^/]+$/, ''), source: source });
      } catch (e) { /* unreadable */ }
    }
    return out;
  }

  async function load(workspace) {
    var found = await readSkillDir(userDir(), 'user');
    var claude = await readSkillDir(Store.info.home + '/.claude/skills', 'claude');
    var proj = [];
    if (workspace) proj = (await readSkillDir(workspace + '/.sinai/skills', 'project')).concat(await readSkillDir(workspace + '/.claude/skills', 'project'));
    var builtin = { name: 'skill-creator', category: 'Produktivitas', source: 'builtin', path: '', dir: '',
      description: 'Membuat atau memperbaiki skill (SKILL.md) yang rapi dan siap pakai. Gunakan saat pengguna meminta "buat skill", "jadikan ini skill", atau ingin menyimpan cara kerja/prompt sebagai skill.',
      body: '# Skill creator\n\n## Langkah\n1. Pahami tujuan skill: tugas apa, kapan dipakai, hasil seperti apa. Jika ada yang benar-benar tidak jelas, tanyakan dengan ask_user (pilihan yang bisa diklik).\n2. Tulis SKILL.md lengkap mengikuti panduan di bawah.\n3. Simpan dengan alat `save_skill` (isi = seluruh file). Jika alat melaporkan error/peringatan, perbaiki lalu simpan ulang.\n4. Laporkan singkat: nama skill, kapan dipakai, dan cara memanggilnya (/nama-skill).\n\n## Panduan format\n' + WRITER };
    var seen = {};
    list = [];
    proj.concat(found, claude, [builtin], window.BUILTIN_SKILLS || []).forEach(function (s) {
      if (!s.category) s.category = guessCategory(s);
      if (seen[s.name]) return;
      seen[s.name] = 1;
      var en = enabledMap()[s.name];
      s.enabled = en == null ? true : !!en;
      list.push(s);
    });
    list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    notify();
    return list;
  }

  function all() { return list.slice(); }
  function active() { return list.filter(function (s) { return s.enabled; }); }
  function get(name) { name = slug(name); return list.find(function (s) { return s.name === name; }) || null; }

  function setEnabled(name, on) {
    var m = Object.assign({}, enabledMap());
    m[name] = !!on;
    Store.setSetting('skills', m);
    var s = get(name);
    if (s) s.enabled = !!on;
    notify();
  }

  /* Saves (lint-fixed) content as a user skill. Returns the lint report. */
  async function save(md, opts) {
    opts = opts || {};
    var rep = lint(md, opts.name);
    if (rep.errors.length && !opts.force) return rep;
    var name = rep.meta.name;
    var existing = get(name);
    if (existing && existing.source === 'user' && opts.oldName !== name && !opts.overwrite) {
      rep.errors.push('Skill bernama "' + name + '" sudah ada. Ganti nama atau timpa.');
      rep.exists = true;
      return rep;
    }
    var dir = userDir() + '/' + name;
    await Native.call('fs.mkdir', { path: dir });
    await Native.call('fs.write', { path: dir + '/SKILL.md', content: rep.fixed });
    if (opts.oldName && opts.oldName !== name) {
      var old = get(opts.oldName);
      if (old && old.source === 'user') { try { await Native.call('fs.trash', { path: old.dir }); } catch (e) { /* ignore */ } }
    }
    await load(opts.workspace);
    rep.saved = dir + '/SKILL.md';
    return rep;
  }

  async function remove(name) {
    var s = get(name);
    if (!s || s.source !== 'user') throw new Error('Hanya skill buatan Anda yang bisa dihapus di sini.');
    await Native.call('fs.trash', { path: s.dir });
    await load();
  }

  /* Prompt section: one line per active skill. */
  function promptSection() {
    var a = active();
    if (!a.length) return '';
    return '\n\n# Skills\nIf the request matches a skill, call `skill` with its name first and follow it.\n' +
      a.slice(0, 80).map(function (s) {
        // First sentence only — enough to recognise when it applies; the full skill loads on demand.
        var d = s.description.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0];
        return '- ' + s.name + ': ' + (d.length > 100 ? d.slice(0, 97) + '…' : d);
      }).join('\n');
  }

  /* Model writes a skill from a free-text brief (or improves an existing one). */
  async function generate(brief, existing, signal) {
    var ref = Store.settings.defaults.code || Store.settings.defaults.chat;
    var r = Providers.resolve(Store.settings.reviewer) || Providers.resolve(ref) || Providers.resolve(Engine.defaultModelRef('chat'));
    if (!r) throw new Error('Belum ada model. Tambahkan provider di Pengaturan.');
    var text = existing
      ? 'Improve this SKILL.md so it is complete, specific and follows the required shape. Keep its intent.\n\nExtra request: ' + (brief || '(none)') + '\n\n<skill>\n' + existing + '\n</skill>'
      : 'Write a SKILL.md for this need:\n' + brief;
    var res = await Providers.complete(r, WRITER, [{ role: 'user', content: [{ type: 'text', text: text }] }], { level: 'balanced', signal: signal });
    var out = String(res.text || '').trim().replace(/^```(?:markdown|md)?\n/, '').replace(/\n```\s*$/, '');
    var rep = lint(out);
    // One automatic repair round when the model missed something essential.
    if (rep.errors.length) {
      var fix = await Providers.complete(r, WRITER, [{ role: 'user', content: [{ type: 'text', text: text + '\n\nYour previous attempt had these problems: ' + rep.errors.join('; ') + '\nWrite the complete corrected file.' }] }], { level: 'balanced', signal: signal });
      rep = lint(String(fix.text || '').trim().replace(/^```(?:markdown|md)?\n/, '').replace(/\n```\s*$/, ''));
    }
    return rep;
  }

  window.Skills = {
    load: load, all: all, active: active, get: get, setEnabled: setEnabled, save: save, remove: remove, lint: lint, parse: parse,
    slug: slug, promptSection: promptSection, CATEGORIES: CATEGORIES, categoryOf: categoryOf, generate: generate, TEMPLATE: TEMPLATE, WRITER: WRITER, userDir: userDir,
    onChange: function (fn) { listeners.push(fn); },
  };
})();
