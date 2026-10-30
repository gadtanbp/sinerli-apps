/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
// Development-only mock of an OpenAI-compatible API, used to exercise Sinai's
// streaming, reasoning, tool-calling, approval and deliberation paths without a
// real API key.  Run: node dev/mock-llm.mjs [port]   (default 8787)
// Every request body is appended to dev/requests.log for inspection.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2] || 8787);
const logFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'requests.log');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (s, n) => s.match(new RegExp(`[\\s\\S]{1,${n}}`, 'g')) || [];

function lastUserText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user') return typeof m.content === 'string' ? m.content : m.content.map((p) => p.text || '').join(' ');
  }
  return '';
}

function plan(body) {
  const sys = body.messages.find((m) => m.role === 'system')?.content || '';
  const last = body.messages[body.messages.length - 1];
  const user = lastUserText(body.messages).toLowerCase();
  if (sys.includes('short, specific title')) return { text: 'Uji Coba Sinai' };
  if (sys.includes('strict senior engineer reviewing')) return { text: '{"verdict": "pass", "issues": []}' };
  if (sys.includes('meticulous senior reviewer')) return { reasoning: 'Memeriksa draf…', text: '1. Tambahkan contoh konkret.\n2. Jelaskan kompleksitas waktu.' };
  if (sys.includes('expert judge')) return { text: 'Kandidat 1 paling tepat; gabungkan contoh dari kandidat 2.' };
  if (sys.includes('compressing a long working session')) return { text: 'Ringkasan: pengguna menguji Sinai.' };
  if (sys.includes('focused research sub-agent')) {
    if (last.role === 'tool') return { text: '## Laporan sub-agen\n- Ditemukan `hello.txt` di root proyek.\n- Tidak ada konfigurasi build.' };
    return { text: 'Menyelidiki…', tools: [{ name: 'glob', args: { pattern: '**/*' } }] };
  }
  if (sys.includes('Plan mode (active)') && last.role !== 'tool') {
    return { text: 'Saya sudah menyelidiki proyek.', tools: [{ name: 'exit_plan_mode', args: { plan: '## Rencana\n1. Buat `app.js`\n2. Tambah tes\n3. Verifikasi dengan `node app.js`' } }] };
  }
  if (last.role === 'user' && /artifact_edit could not be applied/.test(typeof last.content === 'string' ? last.content : '')) {
    return { text: 'Menulis ulang penuh.\n<artifact id="landing" type="html" title="Landing Page Tabung">\n<!doctype html><html><body style="font-family:sans-serif;background:#0f172a;color:#fff"><h1 style="color:#facc15">Tabung (rewrite)</h1></body></html>\n</artifact>' };
  }
  const lastText = typeof last.content === 'string' ? last.content : (Array.isArray(last.content) ? last.content.map((x) => x.text || '').join(' ') : '');
  const deck = '# Strategi Pemasaran UMKM\nRencana 2026\n\n---\n\n## Masalah\n- Jangkauan pasar terbatas\n- Biaya iklan tinggi\n  - CPC naik 30%\n\nNarasi: Ini masalah utama yang dihadapi UMKM.\n\n---\n\n## Solusi\n- Konten organik\n- Marketplace\n- Kolaborasi komunitas';
  if (last.role === 'user' && /deck html/i.test(lastText)) {
    const html = '<style>:root{--a:#0b6bcb;--ink:#0f172a}.slide{font-family:Helvetica,Arial,sans-serif;color:var(--ink);background:#fff;padding:72px}' +
      '.cover{background:linear-gradient(135deg,#0b3d91,#0b6bcb);color:#fff;display:flex;flex-direction:column;justify-content:center}.cover h1{font-size:64px;margin:0 0 16px}.cover p{font-size:24px;opacity:.85}' +
      '.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:32px}.card{background:#eef5fd;border-radius:16px;padding:24px}.card b{display:block;font-size:24px;margin-bottom:8px}.card span{font-size:18px;color:#334155}h2{font-size:40px;margin:0}ul{font-size:22px;line-height:1.6}</style>' +
      '<section class="slide cover"><h1>Energi Surya untuk Sekolah</h1><p>Hemat biaya, belajar sains, dan peduli bumi</p></section>' +
      '<section class="slide"><h2>Empat manfaat utama</h2><div class="grid"><div class="card"><b>Hemat listrik 40%</b><span>tagihan bulanan turun drastis</span></div><div class="card"><b>Laboratorium hidup</b><span>siswa belajar fisika langsung</span></div><div class="card"><b>Nol emisi</b><span>mengurangi jejak karbon sekolah</span></div><div class="card"><b>Cadangan daya</b><span>tetap menyala saat padam</span></div></div></section>' +
      '<section class="slide"><h2>Langkah memulai</h2><ul><li>Audit atap dan kebutuhan listrik</li><li>Pilih kapasitas panel</li><li>Libatkan siswa dalam pemantauan</li></ul></section>';
    return { text: 'Saya buatkan presentasinya.', tools: [{ name: 'create_file', args: { kind: 'presentation', format: 'pptx', filename: 'Energi Surya', title: 'Energi Surya untuk Sekolah', html } }] };
  }
  if (last.role === 'user' && /dsml bocor/i.test(lastText)) {
    // DeepSeek-style model that writes its tool call into the text instead of using native tools.
    const args = JSON.stringify({ kind: 'presentation', format: 'pdf', filename: 'Materi-Planet-Bumi', title: 'Materi Planet Bumi', content: '# Bumi\nPlanet biru\n\n---\n\n## Fakta\n- Diameter 12.742 km\n- Jarak 149,6 juta km' });
    return { text: 'Saya buatkan PDF-nya.\n<｜DSML｜function_calls>\n<｜DSML｜invoke name="create_file">\n<｜DSML｜parameter name="arguments" string="false">' + args + '</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜function_calls>' };
  }
  if (last.role === 'user' && /without creating the file/.test(lastText)) {
    return { text: 'Baik, saya buatkan filenya.', tools: [{ name: 'create_file', args: { kind: 'presentation', format: 'pptx', filename: 'Deck Nudge', content: deck } }] };
  }
  if (last.role === 'user' && user.includes('ppt nakal')) {
    return { text: 'Berikut kode Python untuk membuat PPT:\n\n```python\nfrom pptx import Presentation\nprs = Presentation()\nprs.save("deck.pptx")\n```' };
  }
  if (last.role === 'user' && user.includes('buat ppt')) {
    return { text: 'Saya buatkan presentasinya.', tools: [{ name: 'create_file', args: { kind: 'presentation', format: 'pptx', filename: 'Strategi UMKM', title: 'Strategi Pemasaran UMKM', content: deck } }] };
  }
  if (last.role === 'user' && user.includes('buat pdf')) {
    return { text: '', tools: [{ name: 'create_file', args: { kind: 'document', format: 'pdf', filename: 'Laporan Uji', content: '# Laporan Penjualan Q3\n\nRingkasan kinerja **kuartal ketiga**.\n\n## Angka utama\n\n| Bulan | Penjualan |\n|---|---|\n| Juli | 120 |\n| Agustus | 150 |\n| September | 180 |\n\n## Kesimpulan\n\n' + 'Penjualan naik konsisten setiap bulan. '.repeat(120) } }] };
  }
  if (last.role === 'user' && user.includes('buat word')) {
    return { text: '', tools: [{ name: 'create_file', args: { kind: 'document', format: 'docx', filename: 'Surat Uji', content: '# Surat Penawaran\n\nYth. Bapak/Ibu,\n\n- Poin satu\n- Poin dua\n\nHormat kami.' } }] };
  }
  if (last.role === 'user' && user.includes('buat excel')) {
    return { text: '', tools: [{ name: 'create_file', args: { kind: 'spreadsheet', format: 'xlsx', filename: 'Data Uji', content: '## Penjualan\n| Produk | Harga | Stok |\n|---|---|---|\n| Kopi | 25000 | 12 |\n| Teh | 18000 | 30 |\n\n## Pelanggan\n| Nama | Kota |\n|---|---|\n| Ana | Bandung |' } }] };
  }
  if (last.role === 'user' && user.includes('buat gambar')) {
    return { text: '', tools: [{ name: 'create_file', args: { kind: 'image', format: 'png', filename: 'Poster Uji', width: 800, height: 600, content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#1e1b4b"/><circle cx="400" cy="260" r="140" fill="#facc15"/><text x="400" y="520" font-size="56" text-anchor="middle" fill="#fff" font-family="Helvetica">Senja Fest</text></svg>' } }] };
  }
  if (last.role === 'user' && user.includes('buat video')) {
    return { text: '', tools: [{ name: 'create_file', args: { kind: 'video', format: 'mp4', filename: 'Video Uji', scene_seconds: 2, content: deck } }] };
  }
  if (last.role === 'tool') {
    const results = body.messages.filter((m) => m.role === 'tool').slice(-3).map((m) => m.content.slice(0, 120));
    return { reasoning: 'Hasil alat sudah diterima, saya rangkum.', text: `Selesai ✅\n\nRingkasan hasil alat:\n\n${results.map((r) => '- `' + r.replace(/`/g, "'").split('\n')[0] + '`').join('\n')}` };
  }
  if (user.includes('buat board')) {
    const board = { title: 'Rencana Launching Produk', layout: 'mindmap', items: [
      { id: 'root', type: 'shape', shape: 'pill', text: 'Launching Q1', color: 'purple' },
      { id: 'a', type: 'note', parent: 'root', text: '**Riset pasar**\nSurvei 200 pengguna', color: 'yellow' },
      { id: 'b', type: 'note', parent: 'root', text: 'Konten & iklan', color: 'blue' },
      { id: 'b1', type: 'card', parent: 'b', title: 'Instagram', body: '3 post/minggu', tag: 'Sosmed' },
      { id: 'c', type: 'list', parent: 'root', title: 'Checklist', items: [{ text: 'Harga final', done: true }, { text: 'Landing page', done: false }] },
      { id: 'k', type: 'kanban', title: 'Tugas tim', x: 0, y: 700, columns: [{ title: 'To do', cards: ['Desain logo', 'Copy iklan'] }, { title: 'Proses', cards: ['Riset'] }, { title: 'Selesai', cards: [] }] },
      { id: 'ch', type: 'chart', kind: 'bar', title: 'Target penjualan', x: 760, y: 700, labels: ['Jan', 'Feb', 'Mar'], values: [120, 180, 260] },
    ] };
    return { text: 'Board rencananya sudah jadi.\n\n<artifact id="rencana-launch" type="board" title="Rencana Launching">\n' + JSON.stringify(board, null, 2) + '\n</artifact>' };
  }
  if (user.includes('landing page')) {
    return { text: 'Berikut landing page-nya.\n\n<artifact id="landing" type="html" title="Landing Page Tabung">\n<!doctype html>\n<html><head><style>body{margin:0;font-family:-apple-system,sans-serif;background:linear-gradient(135deg,#1e1b4b,#4338ca);color:#fff;min-height:100vh;display:grid;place-items:center}.cta{background:#facc15;color:#1e1b4b;padding:14px 28px;border-radius:999px;font-weight:700;border:0;font-size:18px}h1{font-size:56px;margin:0 0 12px}</style></head>\n<body><main style="text-align:center"><h1 id="judul">Tabung</h1><p>Menabung jadi mudah dan menyenangkan.</p><button class="cta">Mulai sekarang</button></main></body></html>\n</artifact>\n\nDesainnya memakai gradien indigo dengan CTA kuning.' };
  }
  if (user.includes('ubah judul')) {
    return { text: 'Judul diubah.\n<artifact_edit id="landing">\n<find>Tabung</h1></find>\n<replace>Tabung Pintar</h1></replace>\n</artifact_edit>' };
  }
  if (user.includes('edit rusak')) {
    return { text: 'Mencoba edit.\n<artifact_edit id="landing">\n<find>teks yang tidak ada</find>\n<replace>x</replace>\n</artifact_edit>' };
  }
  if (user.includes('react')) {
    return { text: 'Aplikasi penghitung interaktif:\n<artifact id="counter" type="react" title="Penghitung">\nimport { useState } from "react";\n\nexport default function App() {\n  const [n, setN] = useState(0);\n  return (\n    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-900 text-white">\n      <h1 className="text-5xl font-bold" id="angka">{n}</h1>\n      <button className="px-6 py-3 rounded-full bg-indigo-500" onClick={() => setN(n + 1)}>Tambah</button>\n    </div>\n  );\n}\n</artifact>' };
  }
  if (user.includes('diagram')) {
    return { text: '<artifact id="alur" type="mermaid" title="Alur Login">\nflowchart LR\n  A[Buka app] --> B{Sudah login?}\n  B -- Ya --> C[Beranda]\n  B -- Tidak --> D[Form login] --> C\n</artifact>' };
  }
  if (user.includes('slide')) {
    return { text: '<artifact id="deck" type="slides" title="Strategi UMKM">\n# Strategi Digital UMKM\nTim Sinai\n\n---\n\n## Masalah\n- Jangkauan terbatas\n- Biaya iklan mahal\n\n---\n\n## Solusi\n- Konten organik\n- Marketplace\n</artifact>' };
  }
  if (user.includes('logo svg')) {
    return { text: '<artifact id="logo" type="svg" title="Logo Kopi">\n<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><circle cx="100" cy="100" r="90" fill="#3b2314"/><text x="100" y="115" font-size="40" text-anchor="middle" fill="#f5deb3" font-family="Georgia">Kopi</text></svg>\n</artifact>' };
  }
  if (user.includes('sub-agen')) {
    return { text: 'Saya delegasikan ke sub-agen.', tools: [{ name: 'task', args: { description: 'Survei proyek', prompt: 'Daftar semua file dan jelaskan struktur proyek.' } }] };
  }
  if (user.includes('baca gambar')) {
    return { text: '', tools: [{ name: 'read_file', args: { path: 'pic.png' } }] };
  }
  if (/cut off by the output token limit/.test(lastText)) {
    return { text: ' bagian kedua yang melanjutkan kalimat. SELESAI.' };
  }
  if (user.includes('potong panjang')) {
    return { text: 'Ini bagian pertama yang terpotong di tengah', finish: 'length' };
  }
  if (/todo list still has unfinished/.test(lastText)) {
    return { text: 'Melanjutkan.', tools: [{ name: 'todo_write', args: { todos: [{ content: 'Langkah A', status: 'completed' }, { content: 'Langkah B', status: 'completed' }] } }] };
  }
  if (last.role === 'user' && user.includes('todo belum')) {
    return { text: '', tools: [{ name: 'todo_write', args: { todos: [{ content: 'Langkah A', status: 'completed' }, { content: 'Langkah B', status: 'pending' }] } }] };
  }
  if (last.role === 'user' && user.includes('tanya pilihan')) {
    return { text: '', tools: [{ name: 'ask_user', args: { question: 'Framework apa yang dipakai?', options: [{ label: 'React + Vite', description: 'Cepat & populer' }, { label: 'Vue', description: 'Ringan' }] } }] };
  }
  if (last.role === 'user' && user.includes('simpan skill')) {
    return { text: '', tools: [{ name: 'save_skill', args: { content: '# Laporan Mingguan\n\nGunakan saat pengguna meminta laporan mingguan tim.\n\n## Langkah\n1. Kumpulkan data KPI dari file yang diberikan\n2. Buat ringkasan dan grafik\n3. Periksa angka sebelum selesai\n' } }] };
  }
  if (last.role === 'user' && user.includes('pkill aman')) {
    return { text: 'Mematikan proses uji.', tools: [{ name: 'run_command', args: { command: 'pkill -f sinai_proses_tidak_ada_xyz; echo selesai-pkill', description: 'pkill uji' } }] };
  }
  if (last.role === 'user' && user.includes('sudo uji')) {
    return { text: 'Mencoba sudo.', tools: [{ name: 'run_command', args: { command: 'sudo -n true', description: 'sudo uji' } }] };
  }
  if (last.role === 'tool') {
    return { text: 'Selesai. Semua langkah sudah dikerjakan.' };
  }
  if (user.includes('buat file')) {
    return { text: 'Saya akan membuat file tersebut.', tools: [{ name: 'write_file', args: { path: 'hello.txt', content: 'Halo dari Sinai!\nBaris kedua.\n' } }] };
  }
  if (user.includes('edit file')) {
    return { text: 'Mengedit file.', tools: [{ name: 'edit_file', args: { path: 'hello.txt', old_string: 'Baris kedua.', new_string: 'Baris kedua (diedit).' } }] };
  }
  if (user.includes('jalankan')) {
    return { text: 'Menjalankan perintah.', tools: [{ name: 'run_command', args: { command: 'echo "halo dari shell" && sleep 1 && ls -la | head -5', description: 'Tes perintah shell' } }] };
  }
  if (user.includes('rencana')) {
    return { text: '', tools: [
      { name: 'todo_write', args: { todos: [{ content: 'Baca struktur proyek', status: 'completed' }, { content: 'Tulis fitur', status: 'in_progress' }, { content: 'Verifikasi', status: 'pending' }] } },
      { name: 'list_directory', args: { path: '.', depth: 1 } },
      { name: 'glob', args: { pattern: '**/*.txt' } },
    ] };
  }
  if (user.includes('cari web')) {
    return { text: '', tools: [{ name: 'web_search', args: { query: 'macOS Tahoe release date' } }] };
  }
  return {
    reasoning: 'Pengguna bertanya sesuatu. Saya akan menjawab dengan terstruktur, menyertakan contoh kode dan tabel.',
    text: '## Jawaban\n\nIni adalah **respons uji** dari server mock.\n\n1. Poin pertama\n2. Poin kedua dengan `kode inline`\n\n```python\ndef halo(nama: str) -> str:\n    return f"Halo, {nama}!"\n\nprint(halo("Sinai"))\n```\n\n| Fitur | Status |\n|---|---|\n| Streaming | ✅ |\n| Tools | ✅ |\n\n> Kutipan contoh.\n\nLink: [Apple](https://www.apple.com) — dan <script>alert(1)</script> harus tampil sebagai teks.',
  };
}

async function stream(res, body) {
  const p = plan(body);
  // Meniru server Sinerli: tanpa parameter `tools` (protokol teks) → panggilan alat sebagai <tool_call>.
  if (!body.tools && p.tools) {
    p.text = (p.text || '') + p.tools.map((t) => '\n<tool_call>\n' + JSON.stringify({ name: t.name, arguments: t.args }) + '\n</tool_call>').join('');
    p.tools = null;
  }
  const sys0 = body.messages.find((m) => m.role === 'system')?.content || '';
  if (/siapa kamu|who are you/.test(lastUserText(body.messages).toLowerCase())) p.text = sys0.includes('You are Sinerli AI') ? 'Saya Sinerli AI dari Sinerli.' : 'Saya model lain.';
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (delta, extra = {}) => res.write(`data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`);
  res.write(': keep-alive\n\n');
  if (p.reasoning) for (const c of chunk(p.reasoning, 12)) { send({ reasoning_content: c }); await sleep(20); }
  for (const c of chunk(p.text || '', 9)) { send({ content: c }); await sleep(12); }
  (p.tools || []).forEach((t, i) => {
    const args = JSON.stringify(t.args);
    send({ tool_calls: [{ index: i, id: 'call_' + Math.random().toString(36).slice(2, 9), type: 'function', function: { name: t.name, arguments: '' } }] });
    for (const c of chunk(args, 15)) send({ tool_calls: [{ index: i, function: { arguments: c } }] });
  });
  res.write(`data: ${JSON.stringify({ id: 'x', choices: [{ index: 0, delta: {}, finish_reason: p.finish || (p.tools ? 'tool_calls' : 'stop') }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ id: 'x', choices: [], usage: { prompt_tokens: 1234, completion_tokens: 321 } })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}


// Anthropic Messages API (SSE) — converts the request to the same scenario planner.
async function streamAnthropic(res, body) {
  const msgs = [{ role: 'system', content: typeof body.system === 'string' ? body.system : (body.system || []).map((b) => b.text).join('') }];
  for (const m of body.messages) {
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
    if (blocks.some((b) => b.type === 'tool_result')) msgs.push({ role: 'tool', content: blocks.map((b) => (typeof b.content === 'string' ? b.content : JSON.stringify(b.content))).join('\n') });
    else msgs.push({ role: m.role, content: blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n') });
  }
  const p = plan({ ...body, messages: msgs });
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  ev('message_start', { message: { id: 'msg_1', role: 'assistant', content: [], usage: { input_tokens: 2000, output_tokens: 1 } } });
  let idx = 0;
  if (p.reasoning) {
    ev('content_block_start', { index: idx, content_block: { type: 'thinking', thinking: '' } });
    for (const c of chunk(p.reasoning, 12)) { ev('content_block_delta', { index: idx, delta: { type: 'thinking_delta', thinking: c } }); await sleep(15); }
    ev('content_block_delta', { index: idx, delta: { type: 'signature_delta', signature: 'sig-abc' } });
    ev('content_block_stop', { index: idx++ });
  }
  if (p.text) {
    ev('content_block_start', { index: idx, content_block: { type: 'text', text: '' } });
    for (const c of chunk(p.text, 9)) { ev('content_block_delta', { index: idx, delta: { type: 'text_delta', text: c } }); await sleep(10); }
    ev('content_block_stop', { index: idx++ });
  }
  for (const t of p.tools || []) {
    ev('content_block_start', { index: idx, content_block: { type: 'tool_use', id: 'toolu_' + Math.random().toString(36).slice(2, 9), name: t.name, input: {} } });
    for (const c of chunk(JSON.stringify(t.args), 11)) ev('content_block_delta', { index: idx, delta: { type: 'input_json_delta', partial_json: c } });
    ev('content_block_stop', { index: idx++ });
  }
  ev('message_delta', { delta: { stop_reason: p.tools ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 222 } });
  ev('message_stop', {});
  res.end();
}

http.createServer((req, res) => {
  let data = '';
  req.on('data', (d) => (data += d));
  req.on('end', async () => {
    if (req.url.startsWith('/v1/models') && req.headers['x-api-key']) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', max_input_tokens: 1000000, max_tokens: 128000 }, { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5' }] }));
      return;
    }
    if (req.url.endsWith('/v1/messages')) {
      const body = JSON.parse(data || '{}');
      fs.appendFileSync(logFile, JSON.stringify({ anthropic: true, ...body }) + '\n');
      await streamAnthropic(res, body);
      return;
    }
    if (req.url.endsWith('/models')) {
      if (req.headers.authorization !== 'Bearer sk-test-mock') {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid API key' } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'mock-coder' }, { id: 'mock-chat' }, { id: 'mock-broken' }, { id: 'text-embedding-3-small' }] }));
      return;
    }
    if (req.method === 'GET' && req.url.endsWith('/user/balance')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ is_available: true, balance_infos: [{ currency: 'USD', total_balance: '12.34', granted_balance: '2.00', topped_up_balance: '10.34' }] }));
      return;
    }
    if (req.method === 'GET' && req.url.endsWith('/users/me/balance')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 0, data: { available_balance: 49.58894, voucher_balance: 46.58893, cash_balance: 3.00001 }, scode: '0x0', status: true }));
      return;
    }
    if (req.url.endsWith('/images/generations')) {
      // 1×1 PNG pixel, enough to exercise the image pipeline.
      const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const b = JSON.parse(data || '{}');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ created: 1, data: Array.from({ length: b.n || 1 }, () => ({ b64_json: png })) }));
      return;
    }
    if (req.url.endsWith('/chat/completions')) {
      const body = JSON.parse(data || '{}');
      fs.appendFileSync(logFile, JSON.stringify(body) + '\n');
      const rl = { 'x-ratelimit-limit-tokens': '200000', 'x-ratelimit-remaining-tokens': '199990', 'x-ratelimit-limit-requests': '500', 'x-ratelimit-remaining-requests': '499', 'x-ratelimit-reset-tokens': '6ms' };
      if (body.model === 'mock-429') {
        res.writeHead(429, { 'Content-Type': 'application/json', 'retry-after': '1' });
        res.end(JSON.stringify({ error: { message: 'Rate limit reached for requests', type: 'rate_limit' } }));
        return;
      }
      if ((req.headers.authorization || '') === 'Bearer sk-bad-key') {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'You exceeded your current quota', type: 'insufficient_quota' } }));
        return;
      }
      if (body.model === 'mock-broken') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'The model `mock-broken` does not exist', code: 'model_not_found' } }));
        return;
      }
      if (body.stream === false || body.stream === undefined) {
        res.writeHead(200, { 'Content-Type': 'application/json', ...rl });
        res.end(JSON.stringify({ id: 'x', choices: [{ index: 0, message: { role: 'assistant', content: 'Hi' }, finish_reason: 'length' }], usage: { prompt_tokens: 8, completion_tokens: 1 } }));
        return;
      }
      res.setHeader('x-ratelimit-limit-tokens', '200000');
      res.setHeader('x-ratelimit-remaining-tokens', '198000');
      await stream(res, body);
      return;
    }
    res.writeHead(404);
    res.end();
  });
}).listen(port, '127.0.0.1', () => console.log(`mock LLM on http://127.0.0.1:${port}/v1`));
