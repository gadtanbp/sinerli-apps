/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Real files on request: the AI describes the content (Markdown, slides,
   tables, SVG) and Sinai renders it into PDF / Word / PowerPoint / Excel /
   images / MP4 video in the output folder. The canvas then shows the result. */
(function () {
  'use strict';

  var KINDS = {
    document: { formats: ['pdf', 'docx', 'rtf', 'odt', 'html', 'md', 'txt'], def: 'pdf', label: 'Dokumen', icon: 'file' },
    presentation: { formats: ['pptx', 'pdf', 'html'], def: 'pptx', label: 'Presentasi', icon: 'play' },
    spreadsheet: { formats: ['xlsx', 'csv'], def: 'xlsx', label: 'Spreadsheet', icon: 'list' },
    image: { formats: ['png', 'jpg', 'svg', 'pdf'], def: 'png', label: 'Gambar', icon: 'image' },
    video: { formats: ['mp4'], def: 'mp4', label: 'Video', icon: 'play' },
    text: { formats: ['txt', 'md', 'csv', 'json', 'html', 'xml', 'yaml', 'ics', 'vcf'], def: 'txt', label: 'File teks', icon: 'file' },
  };
  var FORMAT_LABEL = { pdf: 'PDF', docx: 'Word', rtf: 'RTF', odt: 'OpenDocument', html: 'HTML', md: 'Markdown', txt: 'Teks', pptx: 'PowerPoint',
    xlsx: 'Excel', csv: 'CSV', png: 'PNG', jpg: 'JPEG', svg: 'SVG', mp4: 'Video MP4', json: 'JSON', xml: 'XML', yaml: 'YAML', ics: 'Kalender', vcf: 'Kontak' };

  var md = new marked.Marked({ gfm: true, breaks: false });

  function esc(s) { return U.esc(s); }
  function slug(s) { return String(s || 'file').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'file'; }
  function artifactId(name, format) { return 'file-' + slug(name) + '-' + format; }
  function fmtSize(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }

  /* Markdown → sanitised HTML. Remote images are dropped (no network fetches
     from generated documents); data: images are kept. */
  function renderMarkdown(src) {
    var html;
    try { html = md.parse(String(src || '')); } catch (e) { html = '<p>' + esc(src) + '</p>'; }
    return DOMPurify.sanitize(html, {
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'link', 'meta', 'base'],
      FORBID_ATTR: ['style', 'srcset'],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|data:image\/(?:png|jpe?g|gif|webp|svg\+xml);|#)/i,
    }).replace(/<img[^>]+src="https?:[^"]*"[^>]*>/gi, '');
  }

  var DOC_CSS = '@page{size:A4;margin:0}html{background:#fff}body{margin:0;font:11.5pt/1.6 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;color:#1b1c2b}' +
    'h1{font-size:22pt;line-height:1.2;margin:0 0 12pt;letter-spacing:-.01em;color:#16172a}h2{font-size:15pt;margin:18pt 0 6pt;color:#2b2d6e;border-bottom:1px solid #e3e5ee;padding-bottom:3pt}' +
    'h3{font-size:12.5pt;margin:14pt 0 4pt}p{margin:0 0 8pt}ul,ol{margin:0 0 8pt;padding-left:18pt}li{margin:2pt 0}' +
    'table{border-collapse:collapse;width:100%;margin:6pt 0 12pt;font-size:10pt}th,td{border:1px solid #d6d9e6;padding:5pt 7pt;text-align:left;vertical-align:top}th{background:#eef0fa;font-weight:600}' +
    'tr{page-break-inside:avoid}h1,h2,h3{page-break-after:avoid}' +
    'code{font:9.5pt ui-monospace,Menlo,monospace;background:#f2f3f7;padding:1pt 3pt;border-radius:3pt}pre{background:#f6f7fb;padding:8pt 10pt;border-radius:6pt;white-space:pre-wrap;page-break-inside:avoid}pre code{background:none;padding:0}' +
    'blockquote{margin:0 0 8pt;padding:2pt 10pt;border-left:3pt solid #4f46e5;color:#4a4c63;background:#f7f7fd}hr{border:0;height:1px;background:#e3e5ee;margin:14pt 0}img{max-width:100%}a{color:#3b37c4}';

  function docHtml(src, title, opts) {
    opts = opts || {};
    var body = renderMarkdown(src);
    var page = opts.page ? 'html{background:#e9eaf0}body{max-width:760px;margin:24px auto;padding:56px 64px;background:#fff;box-shadow:0 6px 30px rgba(0,0,0,.12);border-radius:4px}' : '';
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title || 'Dokumen') + '</title><style>' + DOC_CSS + page + (opts.css || '') + '</style></head><body>' + body + '</body></html>';
  }

  function plain(s) {
    return String(s || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2').replace(/`([^`]+)`/g, '$1').replace(/<[^>]+>/g, '').trim();
  }

  /* Slides: Markdown separated by lines of ---. A line "Narasi: …" (or
     "Narration: …", "Catatan: …") is spoken in videos / kept out of the slide. */
  function parseSlides(src) {
    return String(src || '').replace(/\r/g, '').split(/\n-{3,}\s*\n/).map(function (block) {
      var title = '', items = [], narration = [], keep = [];
      block.split('\n').forEach(function (line) {
        var nm = /^\s*(narasi|narration|narrator|voiceover|catatan pembicara|speaker notes?)\s*:\s*(.*)$/i.exec(line);
        if (nm) { narration.push(nm[2]); return; }
        keep.push(line);
        var hm = /^\s*#{1,3}\s+(.*)$/.exec(line);
        if (hm && !title) { title = plain(hm[1]); return; }
        if (/^\s*$/.test(line) || /^\s*(```|!\[)/.test(line)) return;
        var bm = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
        if (bm) items.push({ text: plain(bm[3]), level: Math.min(4, Math.floor(bm[1].replace(/\t/g, '  ').length / 2)), bullet: true });
        else if (!/^\s*#/.test(line)) items.push({ text: plain(line), level: 0, bullet: false });
      });
      return { title: title, items: items.filter(function (i) { return i.text; }), narration: narration.join(' ').trim(), markdown: keep.join('\n').trim() };
    }).filter(function (s) { return s.title || s.items.length || s.markdown; });
  }

  function slidesMarkdown(slides) { return slides.map(function (s) { return s.markdown; }).join('\n\n---\n\n'); }

  /* Tables: CSV/TSV text or one or more Markdown tables (a preceding
     "## Name" heading names the sheet). Numeric-looking cells become numbers. */
  function cellValue(v) {
    var s = String(v == null ? '' : v).trim();
    if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(s) && s.length < 16) return Number(s);
    return s;
  }
  function parseCsv(text, sep) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim(); }); });
  }
  function parseSheets(content) {
    var text = String(content || '').replace(/\r/g, '');
    var lines = text.split('\n');
    if (lines.some(function (l) { return /^\s*\|.*\|\s*$/.test(l); })) {
      var sheets = [], cur = null, name = '';
      lines.forEach(function (l) {
        var hm = /^\s*#{1,4}\s+(.*)$/.exec(l);
        if (hm) { name = plain(hm[1]); cur = null; return; }
        if (/^\s*\|.*\|\s*$/.test(l)) {
          if (/^\s*\|[\s:|-]+\|\s*$/.test(l) && /-/.test(l)) return; // separator row
          if (!cur) { cur = { name: (name || 'Sheet' + (sheets.length + 1)).slice(0, 31), rows: [] }; sheets.push(cur); name = ''; }
          cur.rows.push(l.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return plain(c); }));
        } else if (l.trim()) cur = null;
      });
      return sheets.map(function (s) { return { name: s.name, rows: s.rows.map(function (r) { return r.map(cellValue); }) }; });
    }
    var sep = text.indexOf('\t') >= 0 && text.split('\n')[0].indexOf('\t') >= 0 ? '\t' : (text.split('\n')[0].split(';').length > text.split('\n')[0].split(',').length ? ';' : ',');
    return [{ name: 'Sheet1', rows: parseCsv(text, sep).map(function (r) { return r.map(cellValue); }) }];
  }

  // ---------------------------------------------------------------- locations

  function outputDir(conv) {
    var custom = (Store.settings.outputDir || '').trim();
    if (custom) return custom.replace(/\/+$/, '');
    return Store.info.supportDir + '/files/' + (conv ? conv.id : 'umum');
  }

  function cleanName(name, fallback) {
    var n = String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[\/\\:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
    return n || fallback || 'Sinai';
  }

  async function uniquePath(dir, base, ext) {
    for (var i = 1; i < 500; i++) {
      var p = dir + '/' + base + (i > 1 ? ' (' + i + ')' : '') + '.' + ext;
      var st = await Native.call('fs.stat', { path: p });
      if (!st.exists) return p;
    }
    return dir + '/' + base + ' ' + Date.now() + '.' + ext;
  }

  async function tempPath(ext) {
    return Store.info.supportDir + '/tmp/' + U.uid('o_') + '.' + ext;
  }
  function removeTemp(path) {
    var prefix = Store.info.supportDir + '/';
    if (path && path.indexOf(prefix + 'tmp/') === 0) Native.call('store.delete', { name: path.slice(prefix.length) }).catch(function () {});
  }

  // ---------------------------------------------------------------- renderers

  function imagePage(content, w, h) {
    var c = String(content || '').trim();
    var reset = '<style>html,body{margin:0;padding:0;width:' + w + 'px;height:' + h + 'px;overflow:hidden}</style>';
    if (/^<svg[\s>]/i.test(c) || /^<\?xml/i.test(c)) {
      return '<!doctype html><html><head><meta charset="utf-8">' + reset + '<style>svg{display:block;width:100%;height:100%}</style></head><body>' + c + '</body></html>';
    }
    if (/<html[\s>]/i.test(c)) return c.replace(/<head[^>]*>/i, function (m) { return m + '<meta charset="utf-8">' + reset; });
    return '<!doctype html><html><head><meta charset="utf-8">' + reset + '</head><body>' + c + '</body></html>';
  }

  function svgSize(c) {
    var vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
    if (vb) return [Math.round(+vb[1]), Math.round(+vb[2])];
    var w = /<svg[^>]*\swidth\s*=\s*["']?([\d.]+)/i.exec(c), h = /<svg[^>]*\sheight\s*=\s*["']?([\d.]+)/i.exec(c);
    return w && h ? [Math.round(+w[1]), Math.round(+h[1])] : null;
  }

  /* Designed deck (see deck.js): the same layout engine renders PPTX, PDF, HTML and video frames. */
  function slidesDoc(slides, opts) {
    return Deck.html(slidesMarkdown(slides), opts || {});
  }

  async function render(args, out, ctx, conv) {
    var kind = args.kind, format = args.format, content = args.content;
    var title = args.title || U.basename(out).replace(/\.[^.]+$/, '');
    var info = {};
    var tpl = window.Templates ? (args.template ? Templates.get(args.template, kind) : Templates.active(conv)) : null;
    if (tpl) info.template = tpl.name;
    var css = tpl ? Templates.docCss(tpl) : '';
    if (kind === 'document' && isHtmlDoc(content)) {
      // Designed in code (HTML + CSS): printed exactly as written.
      info.source = 'html';
      var pd = HtmlDeck.pageDoc(content, { paper: args.paper, landscape: !!args.landscape });
      if (format === 'pdf') await Native.call('pdf.fromHTML', { html: pd, outPath: out, paper: args.paper || 'a4', landscape: !!args.landscape });
      else if (format === 'html') await Native.call('fs.write', { path: out, content: pd });
      else if (format === 'md' || format === 'txt') await Native.call('fs.write', { path: out, content: U.htmlToText(pd, '').text });
      else await Native.call('export.document', { html: pd, format: format, savePath: out });
    } else if (kind === 'presentation' && HtmlDeck.isDeck(content)) {
      // Slides designed in code: live HTML, PDF pages, or an editable PPTX (design picture + real text boxes).
      info.source = 'html';
      info.slides = HtmlDeck.count(content);
      if (!info.slides) throw new Error('Tidak ada <section class="slide"> di HTML presentasi.');
      if (format === 'pptx') {
        var hd = await HtmlDeck.pptx(content, { theme: args.theme, progress: function (t) { if (ctx && ctx.progress) ctx.progress({ type: 'output', command: '', output: t, running: true }); } });
        try { await Native.call('export.zip', { files: hd.files, savePath: out, name: title }); } finally { hd.temps.forEach(removeTemp); }
      } else if (format === 'pdf') {
        await Native.call('preview.export', { key: 'hdeck-' + U.uid(), html: HtmlDeck.deckDoc(content, 'print'), format: 'pdf', width: HtmlDeck.W, pageHeight: HtmlDeck.H, pages: info.slides, name: 'deck', outPath: out });
      } else await Native.call('fs.write', { path: out, content: HtmlDeck.deckDoc(content, 'view') });
    } else if (kind === 'document') {
      if (format === 'pdf') await Native.call('pdf.fromHTML', { html: docHtml(content, title, { css: css }), outPath: out, paper: args.paper || 'a4', landscape: !!args.landscape });
      else if (format === 'md' || format === 'txt') await Native.call('fs.write', { path: out, content: format === 'txt' ? renderPlainText(content) : String(content) });
      else if (format === 'html') await Native.call('fs.write', { path: out, content: docHtml(content, title, { page: true, css: css }) });
      else if (format === 'docx' && tpl && /^(docx|dotx|docm)$/.test(tpl.ext)) {
        var dx = await Templates.docxFromTemplate(tpl, content);
        await Native.call('export.zip', { files: dx.files, savePath: out, name: title });
      }
      else await Native.call('export.document', { html: docHtml(content, title, { css: css }), format: format, savePath: out });
    } else if (kind === 'presentation') {
      var slides = parseSlides(content);
      if (!slides.length) throw new Error('Isi presentasi kosong. Tulis slide dalam Markdown, dipisah baris "---".');
      info.slides = slides.length;
      var deckSrc = slidesMarkdown(slides);
      info.slides = Deck.build(deckSrc).slides.length;
      if (tpl && !args.theme) args.theme = Templates.deckTheme(tpl) || undefined;
      if (format === 'pptx' && tpl && tpl.layouts && tpl.layouts.length) {
        // The user's own PowerPoint template: slides are written into its masters & layouts.
        var px = await Templates.pptxFromTemplate(tpl, deckSrc);
        await Native.call('export.zip', { files: px.files, savePath: out, name: title });
      }
      else if (format === 'pptx') await Native.call('export.zip', { files: Deck.pptxFiles(deckSrc, { theme: args.theme }), savePath: out, name: title });
      else if (format === 'pdf') {
        await Native.call('preview.export', { key: 'deck-' + U.uid(), html: Deck.html(deckSrc, { print: true, theme: args.theme }), format: 'pdf', width: 1280, pageHeight: 720, pages: info.slides, name: 'deck', outPath: out });
      } else await Native.call('fs.write', { path: out, content: Deck.html(deckSrc, { export: true, theme: args.theme }) });
    } else if (kind === 'spreadsheet') {
      var sheets = Array.isArray(args.sheets) && args.sheets.length
        ? args.sheets.map(function (s, i) { return { name: String(s.name || 'Sheet' + (i + 1)).slice(0, 31), rows: (s.rows || []).map(function (r) { return (r || []).map(cellValue); }) }; })
        : parseSheets(content);
      if (!sheets.length || !sheets[0].rows.length) throw new Error('Tidak ada data tabel. Kirim CSV atau tabel Markdown.');
      info.rows = sheets.reduce(function (n, s) { return n + s.rows.length; }, 0);
      info.sheets = sheets.length;
      await Native.call('export.spreadsheet', { sheets: sheets, format: format, savePath: out });
    } else if (kind === 'image') {
      var c = String(content || '').trim();
      var size = svgSize(c) || [1200, 800];
      var w = Math.max(16, Math.min(4096, parseInt(args.width, 10) || size[0]));
      var h = Math.max(16, Math.min(4096, parseInt(args.height, 10) || size[1]));
      info.width = w; info.height = h;
      if (format === 'svg') {
        if (!/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(c)) throw new Error('Format SVG membutuhkan isi berupa elemen <svg>. Untuk HTML pilih format png/jpg.');
        await Native.call('fs.write', { path: out, content: /xmlns=/.test(c) ? c : c.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"') });
      } else if (format === 'pdf') {
        await Native.call('preview.export', { key: 'img-' + U.uid(), html: imagePage(c, w, h), format: 'pdf', width: w, pageHeight: h, pages: 1, name: 'img', outPath: out });
      } else {
        var png = format === 'png' ? out : await tempPath('png');
        await Native.call('preview.export', { key: 'img-' + U.uid(), html: imagePage(c, w, h), format: 'png', width: w, pageHeight: h, pages: 1, name: 'img', outPath: png });
        if (format === 'jpg') {
          try { await Native.call('export.image', { path: png, format: 'jpeg', quality: 0.92, savePath: out }); } finally { removeTemp(png); }
        }
      }
    } else if (kind === 'video') {
      var scenes = parseSlides(content);
      if (!scenes.length) throw new Error('Isi video kosong. Tulis adegan sebagai slide Markdown dipisah "---".');
      if (scenes.length > 60) throw new Error('Maksimal 60 adegan per video.');
      var secs = Math.max(1.5, Math.min(30, parseFloat(args.scene_seconds) || 4));
      var frames = [], temps = [];
      for (var i = 0; i < scenes.length; i += 6) {
        var batch = scenes.slice(i, i + 6);
        if (ctx && ctx.progress) ctx.progress({ type: 'output', command: '', output: 'Merender adegan ' + (i + 1) + '–' + (i + batch.length) + ' dari ' + scenes.length + '…', running: true });
        var strip = await tempPath('png');
        temps.push(strip);
        await Native.call('preview.export', { key: 'vid-' + U.uid(), html: Deck.html(slidesMarkdown(scenes), { print: true, noNumbers: true, range: [i, i + 6], theme: args.theme }), format: 'png', width: 1280, pageHeight: 720, pages: batch.length, name: 'scene', outPath: strip });
        batch.forEach(function (s, j) { frames.push({ path: strip, y: j * 720, h: 720, baseWidth: 1280, duration: secs }); });
      }
      var narrate = args.narrate === true || (args.narrate !== false && scenes.some(function (s) { return s.narration; }));
      var narration = narrate ? scenes.map(function (s) { return s.narration || (args.narrate === true ? [s.title].concat(s.items.map(function (x) { return x.text; })).join('. ') : ''); }) : [];
      var job = U.uid('v_');
      var off = Native.on('video.progress', function (p) {
        if (p.job === job && ctx && ctx.progress) ctx.progress({ type: 'output', command: '', output: 'Menyusun video… ' + Math.round((p.progress || 0) * 100) + '%', running: true });
      });
      try {
        var v = await Native.call('video.make', { job: job, frames: frames, outPath: out, width: 1280, height: 720, fps: 30, fade: 0.6, narration: narration,
          voice: args.voice || (Store.info.locale || 'id-ID').replace('_', '-') });
        info.duration = v.duration; info.scenes = v.scenes; info.narrated = v.narrated;
        // The Windows/Linux host may produce WebM when no MP4 encoder is available.
        if (v.path && v.path !== out) { info.path = v.path; info.format = v.format || U.basename(v.path).split('.').pop(); }
      } finally { off(); temps.forEach(removeTemp); }
    } else {
      await Native.call('fs.write', { path: out, content: String(content == null ? '' : content) });
    }
    return info;
  }

  /* A document written as HTML (not Markdown): starts with a tag and has real structure. */
  function isHtmlDoc(src) {
    var c = String(src || '').trim();
    return /^</.test(c) && /<(html|body|div|section|article|header|main|table|style|h1|h2|p)\b/i.test(c);
  }

  function renderPlainText(src) {
    try { return U.htmlToText(renderMarkdown(src), '').text; } catch (e) { return String(src || ''); }
  }

  // ---------------------------------------------------------------- tool entry

  function normalize(args) {
    var a = Object.assign({}, args || {});
    if (a.html && !a.content) a.content = a.html;
    delete a.html;
    a.kind = String(a.kind || '').toLowerCase();
    a.format = String(a.format || '').toLowerCase().replace(/^\./, '').replace('jpeg', 'jpg').replace('markdown', 'md').replace('powerpoint', 'pptx').replace('excel', 'xlsx').replace('word', 'docx');
    if (!KINDS[a.kind]) {
      // Infer the kind from the format when the model left it out.
      var guess = Object.keys(KINDS).find(function (k) { return KINDS[k].formats.indexOf(a.format) >= 0; });
      a.kind = a.format === 'pdf' ? 'document' : (guess || 'document');
    }
    if (!a.format) a.format = KINDS[a.kind].def;
    if (KINDS[a.kind].formats.indexOf(a.format) < 0) {
      throw new Error('Format "' + a.format + '" tidak didukung untuk ' + a.kind + '. Pilihan: ' + KINDS[a.kind].formats.join(', ') + '.');
    }
    return a;
  }

  async function create(args, ctx) {
    var a = normalize(args);
    if ((a.content == null || a.content === '') && !(a.kind === 'spreadsheet' && Array.isArray(a.sheets) && a.sheets.length)) {
      throw new Error('Parameter content wajib diisi dengan isi file (Markdown, slide, tabel, atau SVG).');
    }
    var conv = ctx && ctx.conv;
    var dir = outputDir(conv);
    await Native.call('fs.mkdir', { path: dir });
    var base = cleanName(a.filename || a.title, KINDS[a.kind].label + ' Sinai');
    // Only the canvas "rebuild" passes overwritePath (via ctx, never from model arguments).
    var ow = ctx && ctx.overwritePath;
    var out = ow && new RegExp('\\.' + a.format + '$', 'i').test(ow) ? ow : await uniquePath(dir, base, a.format);
    if (ctx && ctx.progress) ctx.progress({ type: 'output', command: '', output: 'Membuat ' + (FORMAT_LABEL[a.format] || a.format.toUpperCase()) + '…', running: true });
    var info = await render(a, out, ctx, conv);
    if (info.path) { out = info.path; delete info.path; }
    if (info.format) { a.format = info.format; delete info.format; }
    var st = await Native.call('fs.stat', { path: out });
    if (!st.exists || !st.size) throw new Error('File gagal dibuat (hasil kosong).');
    var name = U.basename(out);
    var display = Object.assign({
      type: 'file', id: artifactId(base, a.format), kind: a.kind, format: a.format, name: name, path: out, size: st.size,
      title: a.title || base, createdAt: Date.now(),
    }, info);
    var detail = [FORMAT_LABEL[a.format] || a.format, fmtSize(st.size)];
    if (info.slides) detail.push(info.slides + ' slide');
    if (info.rows) detail.push(info.rows + ' baris');
    if (info.duration) detail.push(Math.round(info.duration) + ' detik' + (info.narrated ? ', bernarasi' : ''));
    if (info.width) detail.push(info.width + '×' + info.height + ' px');
    return {
      content: 'Created the file "' + name + '" (' + detail.join(', ') + ') at ' + out + '. It is now shown to the user in the canvas, where they can preview, open, save and share it. ' +
        'Do NOT paste the file content or any code into the chat. Reply with one or two short sentences about what the file contains and offer to adjust it.',
      display: display,
    };
  }

  // ---------------------------------------------------------------- canvas preview

  function tableHtml(sheets) {
    var css = 'body{margin:0;background:#f4f5f9;font:13px -apple-system,BlinkMacSystemFont,sans-serif;color:#1b1c2b}section{padding:16px 20px}h2{font-size:14px;margin:0 0 8px;color:#2b2d6e}' +
      '.wrap{overflow:auto;background:#fff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.08)}table{border-collapse:collapse;min-width:100%}th,td{border:1px solid #e3e5ee;padding:5px 9px;white-space:nowrap;text-align:left}' +
      'thead th{background:#4f46e5;color:#fff;position:sticky;top:0}td.n{text-align:right;font-variant-numeric:tabular-nums}tr:nth-child(even) td{background:#fafbff}.rn{color:#9a9cb5;background:#f6f7fb!important;text-align:right}';
    var body = sheets.map(function (s) {
      var rows = s.rows || [];
      var head = rows[0] || [];
      var bodyRows = rows.slice(1, 2001);
      return '<section><h2>' + esc(s.name) + ' · ' + rows.length + ' baris</h2><div class="wrap"><table><thead><tr><th class="rn">#</th>' + head.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        bodyRows.map(function (r, i) { return '<tr><td class="rn">' + (i + 2) + '</td>' + r.map(function (c) { return '<td' + (typeof c === 'number' ? ' class="n"' : '') + '>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table></div>' + (rows.length > 2001 ? '<p>… ' + (rows.length - 2001) + ' baris lagi</p>' : '') + '</section>';
    }).join('');
    return '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + body + '</body></html>';
  }

  function shell(inner, extraCss) {
    return '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;min-height:100%;background:#2a2b36;color:#dfe1f0;font:13px -apple-system,sans-serif}' +
      '.stage{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}' + (extraCss || '') + '</style></head><body>' + inner + '</body></html>';
  }

  /* HTML shown in the canvas for a generated file. */
  async function previewHtml(file, args) {
    var f = file.format, path = file.path;
    var st = await Native.call('fs.stat', { path: path }).catch(function () { return { exists: false }; });
    if (!st.exists) return shell('<div class="stage"><div style="text-align:center"><b>File tidak ditemukan</b><br><span style="opacity:.7">' + esc(path) + '</span><br>Mungkin sudah dipindah atau dihapus.</div></div>');
    var content = args && (args.content || args.html);
    if (f === 'pdf' && file.kind === 'presentation' && HtmlDeck.isDeck(content)) return HtmlDeck.deckDoc(content, 'view');
    if (f === 'pdf') {
      var p = await Native.call('pdf.read', { path: path, images: 40, ocr: false });
      var pages = (p.images || []).map(function (im, i) {
        return '<figure><img src="data:' + im.mime + ';base64,' + im.data + '" alt="Halaman ' + (i + 1) + '"><figcaption>' + (i + 1) + ' / ' + p.pages + '</figcaption></figure>';
      }).join('');
      return shell('<div class="pages">' + pages + (p.pages > 40 ? '<p class="more">… ' + (p.pages - 40) + ' halaman lagi — buka file untuk melihat semuanya</p>' : '') + '</div>',
        '.pages{display:flex;flex-direction:column;align-items:center;gap:18px;padding:24px 16px}figure{margin:0;max-width:100%}img{display:block;max-width:min(100%,900px);background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.4);border-radius:2px}figcaption{text-align:center;font-size:11px;opacity:.6;margin-top:6px}.more{opacity:.7}');
    }
    if (/^(png|jpg|jpeg|gif|heic|webp|tiff?)$/.test(f)) {
      var im = await Native.call('image.prepare', { path: path, maxDim: 2400, png: f === 'png' });
      return shell('<div class="stage"><img src="data:' + im.mime + ';base64,' + im.data + '"></div>',
        'img{max-width:100%;max-height:calc(100vh - 48px);box-shadow:0 8px 30px rgba(0,0,0,.4);background:repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0 0/16px 16px}');
    }
    if (f === 'svg') {
      var sv = await Native.call('file.text', { path: path, maxBytes: 4000000 });
      return shell('<div class="stage"><div class="svg">' + DOMPurify.sanitize(sv.text, { USE_PROFILES: { svg: true, svgFilters: true } }) + '</div></div>',
        '.svg{background:#fff;padding:16px;border-radius:6px;max-width:100%}.svg svg{max-width:100%;max-height:calc(100vh - 80px);height:auto;display:block}');
    }
    if (/^(mp4|mov|m4v)$/.test(f)) {
      var url = await Native.call('preview.file', { path: path });
      return shell('<div class="stage"><video controls playsinline preload="auto" src="' + esc(url) + '#t=0.3"></video></div>',
        'video{max-width:100%;max-height:calc(100vh - 48px);background:#000;border-radius:6px;box-shadow:0 8px 30px rgba(0,0,0,.5)}');
    }
    if (file.kind === 'presentation' && content && HtmlDeck.isDeck(content)) return HtmlDeck.deckDoc(content, 'view');
    if (file.kind === 'presentation' && content) return slidesDoc(parseSlides(content), {});
    if (file.kind === 'spreadsheet') {
      var sheets = args && Array.isArray(args.sheets) && args.sheets.length ? args.sheets : (content ? parseSheets(content) : null);
      if (!sheets && f === 'csv') sheets = parseSheets((await Native.call('file.text', { path: path })).text);
      if (sheets) return tableHtml(sheets);
    }
    if (file.kind === 'document' && content && file.source === 'html') return HtmlDeck.pageView(content, { paper: args.paper, landscape: !!args.landscape });
    if (file.kind === 'document' && content) return docHtml(content, file.title, { page: true });
    if (/^(txt|md|csv|json|xml|yaml|ics|vcf|html)$/.test(f)) {
      var t = await Native.call('file.text', { path: path, maxBytes: 2000000 });
      return shell('<pre>' + esc(t.text) + '</pre>', 'pre{margin:0;padding:20px;white-space:pre-wrap;font:12.5px/1.6 ui-monospace,Menlo,monospace;color:#e6e7f5}');
    }
    // Anything else: Quick Look thumbnail of the real file.
    var th = await Native.call('file.thumbnail', { path: path, size: 1400 }).catch(function () { return null; });
    if (th && th.data) return shell('<div class="stage"><img src="data:' + th.mime + ';base64,' + th.data + '"></div>', 'img{max-width:100%;max-height:calc(100vh - 48px);background:#fff}');
    return shell('<div class="stage">Pratinjau tidak tersedia — gunakan Quick Look atau buka file.</div>');
  }

  window.Outputs = {
    KINDS: KINDS, FORMAT_LABEL: FORMAT_LABEL, create: create, previewHtml: previewHtml, artifactId: artifactId, fmtSize: fmtSize,
    outputDir: outputDir, parseSlides: parseSlides, isHtmlDoc: isHtmlDoc, parseSheets: parseSheets, docHtml: docHtml, normalize: normalize,
  };
})();
