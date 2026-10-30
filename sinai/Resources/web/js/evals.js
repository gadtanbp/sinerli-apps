/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Quality suite: runs the same set of real tasks on every chosen model through
   the real engine (system prompt, tools, artifacts, file creation), checks the
   results automatically, and has a judge model score each answer against the
   standard of an excellent Claude-class assistant. The measured habits are
   written into the model's profile (profiles.js), so prompts are tuned from
   data instead of guesses. Runs are unattended: nothing asks the user, and
   files made during a run are deleted afterwards. */
(function () {
  'use strict';

  function txt(r) { return r.text || ''; }
  function has(re) { return function (r) { return re.test(txt(r)); }; }
  function called(name, pred) { return function (r) { return r.calls.some(function (c) { return c.name === name && (!pred || pred(c.args || {})); }); }; }
  function artifact(type) { return function (r) { return new RegExp('<artifact\\b[^>]*type="' + type + '"', 'i').test(txt(r)); }; }
  function shorter(n) { return function (r) { return txt(r).replace(/```[\s\S]*?```/g, '').length <= n; }; }
  function noFiller(r) { return !/^\s*(tentu|baik(lah)?|tentu saja|of course|sure|certainly|great question|pertanyaan bagus)\b/i.test(txt(r)); }

  /* Each case: prompt, mode, automatic checks [label, fn], and what the judge should look for. */
  var CASES = [
    { id: 'math', cat: 'Penalaran', prompt: 'Sebuah toko memberi diskon 20%, lalu diskon tambahan 15% dari harga setelah diskon pertama. Berapa total diskon efektifnya? Jelaskan singkat.',
      checks: [['jawaban 32%', has(/32\s*%|32 persen/i)]], focus: 'correct arithmetic, brief working' },
    { id: 'logic', cat: 'Penalaran', prompt: 'Jika semua A adalah B dan sebagian B adalah C, apakah pasti sebagian A adalah C? Jawab ya/tidak lalu alasannya.',
      checks: [['menjawab tidak', has(/\btidak\b/i)]], focus: 'valid logic, counter-example' },
    { id: 'short', cat: 'Gaya', prompt: 'Apa ibu kota Australia?',
      checks: [['Canberra', has(/canberra/i)], ['ringkas', shorter(300)], ['tanpa basa-basi', noFiller]], focus: 'one-line answer, no filler' },
    { id: 'lang', cat: 'Gaya', prompt: 'Explain recursion in one short paragraph, tapi jawab dalam Bahasa Indonesia.',
      checks: [['Bahasa Indonesia', has(/\b(yang|adalah|fungsi|memanggil)\b/i)], ['satu paragraf', shorter(900)]], focus: 'follows language and length instruction' },
    { id: 'honest', cat: 'Kejujuran', prompt: 'Siapa pemenang Piala Dunia FIFA 2034?',
      checks: [['tidak mengarang', has(/belum|tidak (tahu|dapat|bisa)|akan (datang|digelar|diselenggarakan)|masa depan|future/i)]], focus: 'does not fabricate a future fact' },
    { id: 'json', cat: 'Instruksi', prompt: 'Sebutkan 3 planet terbesar di tata surya dalam format JSON array saja, tanpa penjelasan apa pun.',
      checks: [['JSON array 3 item', function (r) { try { var j = JSON.parse(txt(r).replace(/```(json)?/gi, '').trim()); return Array.isArray(j) && j.length === 3; } catch (e) { return false; } }]], focus: 'exact output format' },
    { id: 'convert', cat: 'Gaya', prompt: 'Konversi 72°F ke Celsius.',
      checks: [['22,2 °C', has(/22[.,]2/)], ['ringkas', shorter(400)], ['tanpa basa-basi', noFiller]], focus: 'correct, short' },
    { id: 'code', cat: 'Kode', prompt: 'Tulis fungsi JavaScript isPalindrome(s) yang mengabaikan huruf besar/kecil dan karakter non-alfanumerik, plus 3 contoh pemakaian.',
      checks: [['ada fungsi', has(/function\s+isPalindrome|isPalindrome\s*=\s*\(?/)], ['normalisasi', has(/toLowerCase|toUpperCase/)], ['buang non-alfanumerik', has(/\[\^a-z0-9|\\W|\[\^\\p\{L\}|replace\(/i)]],
      focus: 'correct, idiomatic, complete code' },
    { id: 'email', cat: 'Menulis', prompt: 'Tulis email singkat ke klien untuk menunda rapat ke hari Kamis jam 14.00.',
      checks: [['Kamis', has(/kamis/i)], ['14.00', has(/14[.:]00/)], ['ringkas', shorter(1200)]], focus: 'natural, polite, concise writing' },
    { id: 'security', cat: 'Keseimbangan', prompt: 'Bagaimana cara mengamankan router Wi-Fi rumah saya?',
      checks: [['membantu', function (r) { return txt(r).length > 300 && !/tidak (bisa|dapat) membantu/i.test(txt(r)); }]], focus: 'helpful practical steps, no needless refusal' },
    { id: 'vague', cat: 'Instruksi', prompt: 'Buatkan.',
      checks: [['bertanya balik', function (r) { return /\?/.test(txt(r)) || r.calls.some(function (c) { return c.name === 'ask_user'; }); }]], focus: 'asks one focused clarifying question' },
    { id: 'recall', cat: 'Alat', prompt: 'Apa yang pernah kita bahas sebelumnya tentang presentasi? Cek percakapan lama saya.',
      checks: [['memakai search_conversations', called('search_conversations')]], focus: 'uses the right tool instead of guessing' },
    { id: 'landing', cat: 'Artifact', mode: 'design', prompt: 'Buat landing page sederhana untuk kedai kopi "Senja": hero, menu 3 item, lokasi, footer.',
      checks: [['artifact html/react', function (r) { return artifact('html')(r) || artifact('react')(r); }]], focus: 'polished, modern, complete design' },
    { id: 'diagram', cat: 'Artifact', prompt: 'Buat diagram alur proses login dengan OTP.',
      checks: [['artifact mermaid', artifact('mermaid')]], focus: 'correct, readable diagram' },
    { id: 'deck', cat: 'File', prompt: 'Buatkan presentasi PPT 6 slide tentang manfaat energi surya untuk sekolah.',
      checks: [['create_file presentasi', called('create_file', function (a) { return /present/i.test(a.kind || '') || /pptx/i.test(a.format || ''); })],
        ['didesain dengan HTML', called('create_file', function (a) { return /<section\b[^>]*class\s*=\s*["'][^"']*slide/i.test(a.html || a.content || ''); })]],
      focus: 'real file with strong design and content' },
    { id: 'sheet', cat: 'File', prompt: 'Buat file Excel anggaran bulanan rumah tangga dengan 10 baris pengeluaran dan totalnya.',
      checks: [['create_file spreadsheet', called('create_file', function (a) { return /sheet|xlsx/i.test((a.kind || '') + (a.format || '')); })]], focus: 'real file, sensible data' },
  ];

  var JUDGE = [
    'You grade AI assistant answers for the Sinai app. The bar is an excellent Claude-class assistant: correct, honest, does exactly what was asked, uses tools/artifacts/files when they serve the user, writes naturally in the user\'s language, concise, no filler or needless disclaimers, polished output.',
    'Return ONLY JSON: {"score": 1-10, "strengths": "...", "weaknesses": "...", "fix": "one short imperative instruction (max 25 words) that would most improve this model next time, or empty"}.',
    '10 = indistinguishable from an excellent Claude answer; 7 = good but noticeably weaker; 4 = flawed; 1 = wrong or unusable.',
  ].join('\n');

  var state = { running: false, log: [], onChange: null, stop: false };
  function log(s) { state.log.push(s); if (state.onChange) state.onChange(); }

  function summarize(conv) {
    var text = '', calls = [], err = null, usage = { input: 0, output: 0 };
    conv.messages.forEach(function (m) {
      if (m.role !== 'assistant') return;
      if (m.error) err = m.error;
      (m.content || []).forEach(function (b) {
        if (b.type === 'text') text += b.text;
        if (b.type === 'tool_call') calls.push({ name: b.name, args: b.args || {}, ok: b.state === 'done' });
      });
      if (m.usage) { usage.input += m.usage.input || 0; usage.output += m.usage.output || 0; }
    });
    return { text: text.trim(), calls: calls, error: err, usage: usage };
  }

  async function runCase(ref, c) {
    var conv = { id: U.uid('eval_'), eval: true, title: 'Uji ' + c.id, mode: c.mode || 'chat', createdAt: Date.now(), updatedAt: Date.now(), model: ref,
      workspace: null, level: 'balanced', web: false, messages: [], todos: [], summary: null, usage: { input: 0, output: 0 }, projectId: null, titled: true, persisted: false };
    var t0 = Date.now();
    var timer = null;
    try {
      await Promise.race([
        Engine.send(conv, { text: c.prompt }),
        new Promise(function (_, rej) { timer = setTimeout(function () { Engine.stop(conv.id); rej(new Error('Waktu habis (4 menit)')); }, 240000); }),
      ]);
    } catch (e) { conv.messages.push({ role: 'assistant', error: e.message, content: [] }); }
    clearTimeout(timer);
    var r = summarize(conv);
    r.ms = Date.now() - t0;
    Native.call('store.delete', { name: 'files/' + conv.id }).catch(function () {});
    return r;
  }

  async function judge(judgeRef, c, r) {
    var j = Providers.resolve(judgeRef);
    if (!j) return null;
    var calls = r.calls.map(function (x) { return '- ' + x.name + ' ' + U.truncateMiddle(JSON.stringify(x.args), x.name === 'create_file' ? 3000 : 400); }).join('\n');
    var body = '# Task given to the assistant\n' + c.prompt + '\n\n# What a great answer focuses on\n' + c.focus +
      '\n\n# Tool calls it made\n' + (calls || '(none)') + '\n\n# Its final answer\n' + U.truncateMiddle(r.text || '(empty)', 9000) + (r.error ? '\n\n# Error\n' + r.error : '');
    try {
      var res = await Providers.complete(j, JUDGE, [{ role: 'user', content: [{ type: 'text', text: body }] }], { level: 'off', maxTokens: 600 });
      var m = /\{[\s\S]*\}/.exec(res.text || '');
      var o = m ? JSON.parse(m[0]) : null;
      if (o) o.score = Math.max(1, Math.min(10, Number(o.score) || 1));
      return o;
    } catch (e) { return null; }
  }

  function defaultJudge() {
    var s = Store.settings;
    if (s.evalJudge && Providers.resolve(s.evalJudge)) return s.evalJudge;
    if (s.router && s.router.strong && Providers.resolve(s.router.strong)) return s.router.strong;
    if (s.reviewer && Providers.resolve(s.reviewer)) return s.reviewer;
    var claude = Providers.allModels().find(function (m) { return /claude/i.test(m.modelId); });
    return claude ? { providerId: claude.providerId, modelId: claude.modelId } : Engine.defaultModelRef('chat');
  }

  /* Most frequent judge fixes + failed automatic checks → profile notes. */
  function learnFrom(ref, cases) {
    var fixes = {}, failed = [];
    cases.forEach(function (x) {
      if (x.judge && x.judge.fix && x.judge.score < 9) { var k = x.judge.fix.trim().replace(/\.$/, ''); fixes[k] = (fixes[k] || 0) + (10 - x.judge.score); }
      x.checks.forEach(function (ch) { if (!ch.ok) failed.push(x.id + ': ' + ch.label); });
    });
    var notes = Object.keys(fixes).sort(function (a, b) { return fixes[b] - fixes[a]; }).slice(0, 6).map(function (f) { return '- ' + f + '.'; });
    var deck = cases.find(function (x) { return x.id === 'deck'; });
    var data = { notes: notes.join('\n'), score: avg(cases.map(function (x) { return x.judge ? x.judge.score : null; })), pass: passRate(cases) };
    // A model that cannot produce a valid HTML deck keeps the Markdown deck engine.
    if (deck && deck.checks[0] && deck.checks[0].ok && deck.checks[1] && !deck.checks[1].ok) data.htmlFiles = false;
    Profiles.learn(ref, data);
    return data;
  }
  function avg(a) { a = a.filter(function (x) { return x != null; }); return a.length ? Math.round(a.reduce(function (s, x) { return s + x; }, 0) / a.length * 10) / 10 : null; }
  function passRate(cases) {
    var all = 0, ok = 0;
    cases.forEach(function (x) { x.checks.forEach(function (c) { all++; if (c.ok) ok++; }); });
    return all ? Math.round(ok / all * 100) : null;
  }

  /* refs: models to test; opts: {judge, cases: [ids], learn} */
  async function run(refs, opts) {
    if (state.running) throw new Error('Uji kualitas sedang berjalan');
    opts = opts || {};
    state.running = true; state.stop = false; state.log = [];
    var judgeRef = opts.judge || defaultJudge();
    var jr = Providers.resolve(judgeRef);
    log('Penilai: ' + (jr ? (jr.info.name || jr.modelId) : '—'));
    var cases = CASES.filter(function (c) { return !opts.cases || opts.cases.indexOf(c.id) >= 0; });
    var report = { at: Date.now(), judge: judgeRef, models: [] };
    try {
      for (var i = 0; i < refs.length && !state.stop; i++) {
        var r = Providers.resolve(refs[i]);
        if (!r) continue;
        var name = r.info.name || r.modelId;
        log('▶ ' + name);
        var rows = [];
        for (var k = 0; k < cases.length && !state.stop; k++) {
          var c = cases[k];
          var res = await runCase(refs[i], c);
          var checks = c.checks.map(function (ch) { var ok = false; try { ok = !!ch[1](res); } catch (e) { ok = false; } return { label: ch[0], ok: ok }; });
          var jg = await judge(judgeRef, c, res);
          rows.push({ id: c.id, cat: c.cat, checks: checks, judge: jg, ms: res.ms, tokens: res.usage.input + res.usage.output, error: res.error });
          log('  ' + c.id + ': ' + (jg ? jg.score + '/10' : 'tanpa nilai') + ' · cek ' + checks.filter(function (x) { return x.ok; }).length + '/' + checks.length + (res.error ? ' · error: ' + res.error : ''));
        }
        var learned = opts.learn !== false && rows.length === cases.length ? learnFrom(refs[i], rows) : { score: avg(rows.map(function (x) { return x.judge ? x.judge.score : null; })), pass: passRate(rows) };
        report.models.push({ ref: refs[i], name: name, family: Profiles.get(r).label, score: learned.score, pass: learned.pass, notes: learned.notes || '',
          ms: rows.reduce(function (s, x) { return s + x.ms; }, 0), tokens: rows.reduce(function (s, x) { return s + x.tokens; }, 0), cases: rows });
        log('  = skor ' + (learned.score == null ? '—' : learned.score) + '/10, lulus cek ' + learned.pass + '%');
      }
    } finally {
      state.running = false;
      var hist = (Store.settings.evalRuns || []).slice(-4);
      if (report.models.length) Store.setSetting('evalRuns', hist.concat([report]));
      if (state.onChange) state.onChange();
    }
    return report;
  }

  window.Evals = { CASES: CASES, run: run, state: state, stop: function () { state.stop = true; }, defaultJudge: defaultJudge };
})();
