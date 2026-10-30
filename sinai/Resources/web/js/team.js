/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Tim Agen (mode Code): setiap bagian pekerjaan punya agen khusus.
   Arsitek merencanakan → agen spesialis (UI, Sistem, Data, 3D, Integrasi,
   Dokumentasi) membangun bagiannya masing-masing secara paralel → agen Bug
   Test menjalankan build/tes/live view dan memperbaiki error → Peninjau kode
   dan agen Keamanan memeriksa diff. Orkestrasinya ada di engine.js (teamRun). */
(function () {
  'use strict';

  var ROLES = {
    arsitek: { name: 'Arsitek', icon: 'layers', desc: 'Menyelidiki proyek & membagi tugas',
      prompt: 'You are the ARCHITECT of a software team. You investigate the project read-only and split the user request into well-scoped tasks for specialist agents.' },
    ui: { name: 'Agen UI/UX', icon: 'palette', desc: 'Tampilan, komponen, responsif, aksesibilitas',
      prompt: 'You are the UI/UX ENGINEER of the team. You own the user interface: layout, components, styling, interaction states (hover/focus/active/disabled/loading/empty/error), responsive behaviour from 360px to 1440px+, accessibility (semantic HTML, labels, contrast, keyboard) and visual polish at the level of a top product. Wire the UI to the interfaces defined in the plan; never invent backend endpoints that the plan does not define.' },
    sistem: { name: 'Agen Sistem', icon: 'cpu', desc: 'Logika, API, server, arsitektur',
      prompt: 'You are the SYSTEMS / BACKEND ENGINEER of the team. You own business logic, APIs, services, CLI, state management and error handling. Validate every input, handle every failure path explicitly, keep functions small and typed, and expose exactly the interfaces in the plan.' },
    data: { name: 'Agen Data', icon: 'list', desc: 'Skema, database, migrasi, model data',
      prompt: 'You are the DATA ENGINEER of the team. You own schemas, models, migrations, seed data, queries and persistence. Use parameterised queries, indexes where needed, safe migrations, and keep data shapes exactly as defined in the plan.' },
    '3d': { name: 'Agen 3D', icon: 'box', desc: 'Scene three.js, model, shader, grafis',
      prompt: 'You are the 3D / GRAPHICS ENGINEER of the team. You own three.js / WebGL scenes, models, materials, lighting, cameras, animation and performance (dispose resources, cap pixel ratio at 2, pause when hidden). Use PBR materials and real proportions.' },
    integrasi: { name: 'Agen Integrasi', icon: 'settings', desc: 'Build, dependensi, konfigurasi, env',
      prompt: 'You are the INTEGRATION / DEVOPS ENGINEER of the team. You own package manifests, build and bundler config, scripts, environment files (with examples, never real secrets), CI and how the parts connect. Make `install`, `build`, `dev` and `test` work from a clean checkout.' },
    docs: { name: 'Agen Dokumentasi', icon: 'file', desc: 'README, panduan, komentar penting',
      prompt: 'You are the DOCUMENTATION WRITER of the team. You own README and usage docs: what it is, setup, commands, configuration, architecture overview. Short, accurate, matching the real code.' },
    qa: { name: 'Agen Bug Test', icon: 'check', desc: 'Build, tes, live view, perbaiki error',
      prompt: 'You are the QA / BUG-TEST ENGINEER of the team.' },
    keamanan: { name: 'Agen Keamanan', icon: 'shield', desc: 'Celah keamanan & data sensitif',
      prompt: 'You are the SECURITY REVIEWER of the team. Review the diff below for real, exploitable problems only: injection (SQL/command/path/XSS), missing authz/authn, secrets committed to code, unsafe deserialisation/eval, SSRF, insecure CORS/cookies, missing input validation at trust boundaries, dangerous file operations. Ignore style. Reply with ONLY JSON: {"verdict":"pass"|"needs_work","issues":["file:line — problem — concrete fix", …]}.' },
    reviewer: { name: 'Peninjau Kode', icon: 'search', desc: 'Kebenaran, kelengkapan, kualitas', prompt: '' },
  };
  var BUILDERS = ['ui', 'sistem', 'data', '3d', 'integrasi', 'docs'];

  var PLANNER = ROLES.arsitek.prompt + '\n' + [
    'Use read-only tools to understand the project (structure, stack, conventions, existing code the request touches). Then reply with ONLY one JSON object, no prose:',
    '{"solo": false, "summary": "one sentence goal", "stack": "detected stack", "interfaces": "shared contracts every agent must follow: file layout, exported functions/components with signatures, API routes + payloads, data shapes, CSS tokens", "tasks": [{"id":"t1","role":"ui|sistem|data|3d|integrasi|docs","title":"short","files":["paths this agent owns (create or edit)"],"spec":"complete, self-contained instructions incl. acceptance criteria","depends":["t0"]}], "checks": ["exact shell commands that prove it works, e.g. npm run build, npm test, python -m pytest, tsc --noEmit"], "preview": "project-relative html file or dev URL to show in the live view, or empty"}',
    'Rules:',
    '- "solo": true when the request is a question, an explanation, a tiny change (one or two small edits in one file) or anything a single agent finishes faster; then tasks may be empty.',
    '- Use only the roles that are really needed (often 2–4). Every file belongs to exactly ONE task — no overlaps. Put shared contracts in "interfaces" so agents working in parallel stay compatible.',
    '- depends: a task that needs another task\'s files to exist first lists it; independent tasks run in parallel.',
    '- Specs must be complete and concrete (no "etc."), matching the project\'s existing conventions. For new projects choose a simple, robust stack and include an integrasi task for manifests/config.',
    '- checks: only commands that exist (or will exist after the plan) and finish on their own (no watch mode, no dev server).',
  ].join('\n');

  function builderPrompt(role, plan, task) {
    var R = ROLES[role] || ROLES.sistem;
    return R.prompt + '\n\n# Team plan\nGoal: ' + (plan.summary || '') + '\nStack: ' + (plan.stack || '') +
      '\n\n# Shared interfaces (follow exactly)\n' + (plan.interfaces || '(none)') +
      '\n\n# Other agents (do NOT edit their files)\n' + plan.tasks.filter(function (t) { return t !== task; }).map(function (t) { return '- ' + (ROLES[t.role] || {}).name + ': ' + t.title + ' → ' + (t.files || []).join(', '); }).join('\n') +
      '\n\nWrite production-quality code with no placeholders or TODOs, complete error handling, and no syntax errors: re-read every file you write once before reporting.';
  }

  function qaPrompt(plan, workers) {
    return '[Tim Agen · ' + ROLES.qa.name + '] You now act as the QA / bug-test engineer of the team. The builder agents finished:\n' +
      (workers.length ? workers.map(function (w) { return '- ' + w.name + ' (' + w.title + '): ' + String(w.report || '').slice(0, 900); }).join('\n') : '(the main agent built it)') +
      '\n\nDo this now, without asking:\n1. Integrate: read the files the agents touched, fix mismatched imports/interfaces/names between parts.\n' +
      '2. Run every check: ' + (plan.checks && plan.checks.length ? plan.checks.map(function (c) { return '`' + c + '`'; }).join(', ') : 'the project\'s build, type-check, lint and tests (discover them)') +
      '. Where the project has a test setup but the new code has no tests, add focused tests for the core logic and run them.\n' +
      '3. ' + (plan.preview ? 'Open the result in the Sinai Browser with open_preview("' + plan.preview + '") and read the console with browser_check.' : 'If it has a web UI, open it with open_preview and read the console with browser_check.') +
      '\n4. Fix the root cause of every error, warning that indicates a bug, failing test and console error, then re-run the failing check. Repeat until everything passes and the console is clean.\n5. Finish with a short QA report: checks run with results (pass/fail), bugs found and fixed, anything that could not be verified and why.';
  }

  function parsePlan(text) {
    var o = U.extractJSONObject(String(text || ''));
    if (!o || typeof o !== 'object') return null;
    var tasks = (Array.isArray(o.tasks) ? o.tasks : []).filter(function (t) { return t && t.spec; }).slice(0, 8).map(function (t, i) {
      var role = String(t.role || '').toLowerCase();
      if (!ROLES[role] || BUILDERS.indexOf(role) < 0) role = /ui|front|style|css|tampil/.test(role) ? 'ui' : /data|db|schema/.test(role) ? 'data' : /3d|three|webgl/.test(role) ? '3d' : /doc/.test(role) ? 'docs' : /build|config|devops|integr/.test(role) ? 'integrasi' : 'sistem';
      return { id: String(t.id || 't' + (i + 1)), role: role, title: String(t.title || ROLES[role].name).slice(0, 80), files: (Array.isArray(t.files) ? t.files : []).map(String).slice(0, 40), spec: String(t.spec), depends: (Array.isArray(t.depends) ? t.depends : []).map(String) };
    });
    return { solo: !!o.solo || !tasks.length, summary: String(o.summary || ''), stack: String(o.stack || ''), interfaces: typeof o.interfaces === 'string' ? o.interfaces : JSON.stringify(o.interfaces || ''),
      tasks: tasks, checks: (Array.isArray(o.checks) ? o.checks : []).map(String).slice(0, 8), preview: String(o.preview || '') };
  }

  function overlaps(a, b) {
    return (a.files || []).some(function (p) {
      return (b.files || []).some(function (q) { p = p.replace(/\/+$/, ''); q = q.replace(/\/+$/, ''); return p === q || p.indexOf(q + '/') === 0 || q.indexOf(p + '/') === 0; });
    });
  }

  /* Waves of tasks: dependencies first; within a wave no two tasks share files. */
  function waves(tasks) {
    var done = {}, left = tasks.slice(), out = [];
    while (left.length) {
      var ready = left.filter(function (t) { return t.depends.every(function (d) { return done[d] || !tasks.some(function (x) { return x.id === d; }); }); });
      if (!ready.length) ready = [left[0]]; // dependency cycle: just go in order
      var wave = [];
      ready.forEach(function (t) { if (!wave.some(function (w) { return overlaps(w, t); })) wave.push(t); });
      wave.forEach(function (t) { done[t.id] = true; left.splice(left.indexOf(t), 1); });
      out.push(wave);
    }
    return out;
  }

  /* Should this turn go through the team? Questions and tiny requests stay solo. */
  function wanted(conv, text) {
    if (!conv || conv.mode !== 'code' || !conv.workspace) return false;
    var on = conv.team != null ? conv.team : (Store.settings.agent.team !== false);
    if (!on) return false;
    var t = String(text || '').trim();
    if (t.length < 24) return false;
    if (/^\/(?!team)/.test(t)) return false;
    return /(buat|bikin|bangun|kembangkan|implementasi|tambah|tambahkan|perbaiki|fix|refactor|ubah|migrasi|integrasikan|create|build|make|implement|add|develop|rewrite|port|setup|set up|scaffold|aplikasi|app|fitur|feature|website|landing|dashboard|api|game|sistem)/i.test(t);
  }

  window.Team = { ROLES: ROLES, BUILDERS: BUILDERS, PLANNER: PLANNER, builderPrompt: builderPrompt, qaPrompt: qaPrompt, parsePlan: parsePlan, waves: waves, wanted: wanted };
})();
