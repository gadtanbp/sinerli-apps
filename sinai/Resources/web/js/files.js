/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Universal file reader. Turns any file into attachments a model can use:
   text (with page/sheet/slide structure) and images (for vision models).
   Covers text & code in any encoding, images (HEIC, TIFF, PSD, WebP, RAW…),
   PDF (incl. OCR of scans), Word/RTF/ODT, Excel/ODS, PowerPoint/ODP,
   Pages/Numbers/Keynote previews, notebooks, SQLite, plists, archives,
   audio & video (transcript + key frames), fonts and other binaries. */
(function () {
  'use strict';

  var MAX_TEXT = 400000;
  var IMG = /^(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|avif|ico|icns|psd|tga|jp2|j2k|cr2|cr3|nef|arw|dng|raf|orf|rw2|rwl|pef|srw|erf|kdc|dcr|mos|mef|iiq|gpr|exr|hdr|jxl)$/;
  var AUDIO = /^(mp3|m4a|wav|aiff?|aac|flac|caf|ogg|oga|opus|wma|amr|m4b)$/;
  var VIDEO = /^(mp4|mov|m4v|avi|mkv|webm|3gp|mpe?g|wmv|flv|mts|m2ts)$/;
  var TEXTUTIL = /^(docx?|dotx?|rtf|rtfd|odt|webarchive|wordml)$/;
  var ARCHIVE_ZIP = /^(zip|jar|war|ear|apk|ipa|xpi|aar|whl|nupkg|vsix|epub)$/;
  var ARCHIVE_TAR = /^(tar|tgz|tbz2?|txz|gz|bz2|xz|zst)$/;
  var ARCHIVE_ANY = /^(7z|rar|cab|lzh|lha|cpio|ar|deb|rpm|iso|xar|pkg)$/;
  var SUBTITLE = /^(srt|vtt|ass|ssa|sbv|sub)$/;
  var EMAIL = /^(eml|msg|emlx|mbox)$/;
  var MODEL3D = /^(stl|obj|ply|gltf|glb|fbx|3mf|dae|usdz?|step|stp|iges|igs|dxf|dwg|off|3ds|x3d|wrl|vox)$/;
  var LONG_MEDIA_SECS = 70;

  function clip(text, note) {
    text = String(text || '');
    if (text.length <= MAX_TEXT) return text;
    return text.slice(0, MAX_TEXT) + '\n\n[… dipotong: ' + (text.length - MAX_TEXT) + ' karakter lagi' + (note ? '; ' + note : '') + ']';
  }
  function fileAtt(name, text, label) {
    return { kind: 'file', name: name + (label ? ' (' + label + ')' : ''), text: clip(text) };
  }
  function imgAtt(name, r) { return { kind: 'image', name: name, mime: r.mime, data: r.data }; }
  function sh(cmd, cwd, timeout) { return Native.call('exec.sync', { command: cmd, cwd: cwd, timeout: timeout || 30 }); }
  function xml(s) { return new DOMParser().parseFromString(s || '', 'application/xml'); }
  function byTag(doc, local) {
    var all = doc.getElementsByTagName('*'), out = [];
    for (var i = 0; i < all.length; i++) if (all[i].localName === local) out.push(all[i]);
    return out;
  }
  function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function natural(a, b) { return a.localeCompare(b, undefined, { numeric: true }); }

  // ---------------------------------------------------------------- office formats

  function colIndex(ref) {
    var m = /^([A-Z]+)/.exec(ref || ''), n = 0;
    if (!m) return 0;
    for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }

  async function xlsx(path, name) {
    var list = (await Native.call('zip.list', { path: path })).entries;
    var shared = [];
    if (list.indexOf('xl/sharedStrings.xml') >= 0) {
      var ss = xml((await Native.call('zip.read', { path: path, entry: 'xl/sharedStrings.xml' })).text);
      byTag(ss, 'si').forEach(function (si) { shared.push(byTag(si, 't').map(function (t) { return t.textContent; }).join('')); });
    }
    var names = {};
    try {
      var wb = xml((await Native.call('zip.read', { path: path, entry: 'xl/workbook.xml' })).text);
      var rels = xml((await Native.call('zip.read', { path: path, entry: 'xl/_rels/workbook.xml.rels' })).text);
      var target = {};
      byTag(rels, 'Relationship').forEach(function (r) { target[r.getAttribute('Id')] = r.getAttribute('Target'); });
      byTag(wb, 'sheet').forEach(function (s) {
        var rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        var t = target[rid];
        if (t) names['xl/' + t.replace(/^\/?xl\//, '')] = s.getAttribute('name');
      });
    } catch (e) { /* fall back to file names */ }
    var sheets = list.filter(function (e) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(e); }).sort(natural);
    var hasCharts = list.some(function (e) { return /^xl\/charts\//.test(e); });
    var hasImages = list.some(function (e) { return /^xl\/media\//.test(e); });
    var out = [];
    for (var i = 0; i < sheets.length; i++) {
      var doc = xml((await Native.call('zip.read', { path: path, entry: sheets[i] })).text);
      var rows = byTag(doc, 'row'), lines = [];
      rows.slice(0, 5000).forEach(function (row) {
        var cells = [];
        byTag(row, 'c').forEach(function (c) {
          var v = byTag(c, 'v')[0], t = c.getAttribute('t'), val = '';
          if (t === 's' && v) val = shared[+v.textContent] || '';
          else if (t === 'inlineStr') val = byTag(c, 't').map(function (x) { return x.textContent; }).join('');
          else if (v) val = v.textContent;
          var f = byTag(c, 'f')[0];
          if (f) val = '=' + f.textContent + (v ? ' → ' + val : '');
          cells[colIndex(c.getAttribute('r'))] = val;
        });
        lines.push(Array.prototype.map.call(cells.length ? cells : [], function (x) { return csvCell(x); }).join(','));
      });
      var merges = byTag(doc, 'mergeCell').map(function (m) { return m.getAttribute('ref'); }).filter(Boolean);
      var header = '## Sheet: ' + (names[sheets[i]] || sheets[i].replace(/.*\//, '')) + ' (' + rows.length + ' baris)';
      if (merges.length) header += '\n[Sel digabung: ' + merges.slice(0, 40).join(', ') + (merges.length > 40 ? '…' : '') + ']';
      out.push(header + '\n' + lines.join('\n') + (rows.length > 5000 ? '\n[… baris dipotong]' : ''));
    }
    var extras = [];
    if (hasCharts) extras.push('berisi grafik/chart');
    if (hasImages) extras.push('berisi gambar tertanam');
    var note = extras.length ? '[Catatan: workbook ini ' + extras.join(' dan ') + '; rumus ditampilkan beserta nilainya. Format angka/warna tidak disertakan dalam ekstraksi teks.]\n\n' : '';
    return [fileAtt(name, note + (out.join('\n\n') || '(workbook kosong)'), 'spreadsheet → CSV')];
  }

  async function pptx(path, name) {
    var list = (await Native.call('zip.list', { path: path })).entries;
    var slides = list.filter(function (e) { return /^ppt\/slides\/slide\d+\.xml$/.test(e); }).sort(natural);
    var out = [];
    for (var i = 0; i < slides.length; i++) {
      var doc = xml((await Native.call('zip.read', { path: path, entry: slides[i] })).text);
      var paras = byTag(doc, 'p').map(function (p) { return byTag(p, 't').map(function (t) { return t.textContent; }).join(''); }).filter(Boolean);
      var notesEntry = 'ppt/notesSlides/notesSlide' + (i + 1) + '.xml', notes = '';
      if (list.indexOf(notesEntry) >= 0) {
        var nd = xml((await Native.call('zip.read', { path: path, entry: notesEntry })).text);
        notes = byTag(nd, 't').map(function (t) { return t.textContent; }).join(' ').trim();
      }
      out.push('--- Slide ' + (i + 1) + ' ---\n' + paras.join('\n') + (notes ? '\n[Catatan pembicara] ' + notes : ''));
    }
    return [fileAtt(name, out.join('\n\n') || '(presentasi tanpa teks)', 'presentasi')];
  }

  async function odf(path, name, ext) {
    var doc = xml((await Native.call('zip.read', { path: path, entry: 'content.xml' })).text);
    if (ext === 'ods') {
      var out = [];
      byTag(doc, 'table').forEach(function (tb) {
        var lines = [];
        byTag(tb, 'table-row').slice(0, 5000).forEach(function (r) {
          lines.push(byTag(r, 'table-cell').map(function (c) { return csvCell(byTag(c, 'p').map(function (p) { return p.textContent; }).join(' ')); }).join(',').replace(/,+$/, ''));
        });
        out.push('## Sheet: ' + (tb.getAttribute('table:name') || '') + '\n' + lines.filter(Boolean).join('\n'));
      });
      return [fileAtt(name, out.join('\n\n'), 'spreadsheet → CSV')];
    }
    if (ext === 'odp') {
      var pages = byTag(doc, 'page').map(function (pg, i) {
        return '--- Slide ' + (i + 1) + ' ---\n' + byTag(pg, 'p').map(function (p) { return p.textContent; }).filter(Boolean).join('\n');
      });
      return [fileAtt(name, pages.join('\n\n'), 'presentasi')];
    }
    return [fileAtt(name, byTag(doc, 'p').map(function (p) { return p.textContent; }).join('\n'), 'dokumen')];
  }

  async function iwork(path, name, ext, vision) {
    var list = (await Native.call('zip.list', { path: path }).catch(function () { return { entries: [] }; })).entries;
    var out = [];
    var pdf = list.find(function (e) { return /QuickLook\/Preview\.pdf$/i.test(e); });
    if (pdf) {
      var b = await Native.call('zip.read', { path: path, entry: pdf, base64: true });
      var t = await Native.call('fs.writeTemp', { name: 'preview.pdf', base64: b.base64 });
      return (await readPath(t.path, { vision: vision })).map(function (a) { a.name = name + (a.kind === 'image' ? ' (halaman)' : ' (isi)'); return a; });
    }
    var prev = list.find(function (e) { return /(^|\/)preview(-web)?\.jpe?g$/i.test(e); }) || list.find(function (e) { return /Thumbnail\.jpe?g$/i.test(e); });
    if (prev) {
      var img = await Native.call('zip.read', { path: path, entry: prev, base64: true });
      var r = await Native.call('image.prepare', { base64: img.base64 });
      out.push(imgAtt(name + ' (pratinjau)', r));
      var o = await Native.call('image.ocr', { base64: img.base64 }).catch(function () { return { text: '' }; });
      if (o.text) out.push(fileAtt(name, o.text, 'teks dari pratinjau (OCR)'));
    }
    if (!out.length) out.push(fileAtt(name, 'File ' + ext.toUpperCase() + ' (iWork) tidak menyertakan pratinjau. Ekspor ke PDF/DOCX/XLSX dari aplikasinya lalu lampirkan lagi.', 'info'));
    return out;
  }

  // ---------------------------------------------------------------- archives (any format)

  async function archive(path, name, ext, opts) {
    var pw = opts && opts.password;
    var list;
    try {
      list = await Native.call('archive.list', { path: path, password: pw });
    } catch (e) {
      if (/ARCHIVE_PASSWORD/.test(e.message)) {
        return [fileAtt(name, 'Arsip ini terenkripsi (dilindungi kata sandi). Jika Anda tahu sandinya, sampaikan ke Sinai agar isinya bisa dibaca.', 'arsip terkunci')];
      }
      // Fall back to a plain listing for formats libarchive can stream but not stat.
      var fallback = await sh('tar -tf ' + U.shq(path) + ' 2>/dev/null | head -2000').catch(function () { return { stdout: '' }; });
      if (fallback.stdout.trim()) return [fileAtt(name, 'Isi arsip:\n' + fallback.stdout, 'isi arsip')];
      throw e;
    }
    var entries = list.entries || [];
    var names = entries.map(function (e) { return e.name + (e.dir ? '/' : '') + (e.size ? '  (' + (e.size < 1024 ? e.size + ' B' : (e.size / 1024).toFixed(1) + ' KB') + ')' : ''); });
    var nested = entries.filter(function (e) { return /\.(zip|tar|gz|tgz|7z|rar|jar)$/i.test(e.name) && !e.dir; });
    var note = entries.length + ' item di dalam arsip' + (list.partial ? ' (sebagian; ' + (list.warning || '') + ')' : '') + ':\n' + names.slice(0, 3000).join('\n');
    if (nested.length) note += '\n\n(Berisi ' + nested.length + ' arsip bertingkat: ' + nested.slice(0, 10).map(function (e) { return e.name; }).join(', ') + ')';
    return [fileAtt(name, note, 'isi arsip')];
  }

  // ---------------------------------------------------------------- media

  async function audioVideo(path, name, ext, vision, isVideo) {
    var out = [];
    // Frames are kept for every model: models without vision get them described by Sinai's built-in vision.
    var frames = isVideo ? 6 : 0;
    var probe = await Native.call('media.info', { path: path, frames: 0 }).catch(function () { return null; });
    var long = probe && probe.duration > LONG_MEDIA_SECS;
    if (frames && probe && probe.duration > 0) frames = Math.max(6, Math.min(12, Math.round(probe.duration / 60) + 5));
    var info = frames ? await Native.call('media.info', { path: path, frames: frames }).catch(function () { return probe; }) : probe;
    var meta = [];
    if (info) {
      meta.push('Durasi: ' + fmtTs(info.duration) + ' (' + Math.round(info.duration) + ' dtk)');
      if (info.video) meta.push('Video: ' + Math.round(info.video.width) + '×' + Math.round(info.video.height) + ' @' + Math.round(info.video.fps) + 'fps');
      Object.keys(info.metadata || {}).forEach(function (k) { meta.push(k + ': ' + info.metadata[k]); });
      (info.frames || []).forEach(function (f) { out.push(imgAtt(name + ' — frame ' + fmtTs(f.time), f)); });
    }
    // Audio analysis (loudness / silence / clipping) for the model to reason about.
    if (!info || info.audio) {
      try {
        var stats = await Native.call('audio.stats', { path: path });
        if (stats && stats.seconds) {
          meta.push('', 'Analisis audio: rata-rata ' + stats.averageDb + ' dB, puncak ' + stats.peakDb + ' dB, hening ' + Math.round((stats.silentRatio || 0) * 100) + '%' + (stats.clippedSamples > 50 ? ', terdeteksi clipping' : ''));
          if ((stats.segments || []).length) meta.push('Segmen: ' + stats.segments.slice(0, 20).map(function (s) { return s.from + '–' + s.to + ' ' + s.kind; }).join(', ') + (stats.segments.length > 20 ? '…' : ''));
        }
      } catch (e) { /* non-fatal */ }
    }
    if (!info || info.audio) {
      var snd = await Perception.soundText(path);
      if (snd) meta.push('', snd);
    }
    var transcript = '';
    if ((!info || info.audio) && !U.feature('transcribe')) {
      transcript = '(Transkrip otomatis belum tersedia di Sinai untuk ' + Prompts.osName() + '.)';
    } else if (!info || info.audio) {
      var locale = (Store.info.locale || 'id-ID').replace('_', '-');
      try {
        if (long) {
          var tl = await Native.call('media.transcribeLong', { path: path, locale: locale });
          transcript = tl.text ? 'Transkrip berstempel waktu (' + tl.locale + (tl.onDevice ? ', di perangkat' : '') + ', ' + fmtTs(tl.covered) + ' dari ' + fmtTs(tl.duration) + '):\n' + tl.text : '';
          if (tl.errors && tl.errors.length) transcript += '\n[Sebagian gagal: ' + tl.errors.slice(0, 3).join('; ') + ']';
        } else {
          var t = await Native.call('media.transcribe', { path: path, locale: locale });
          transcript = t.text ? 'Transkrip (' + t.locale + (t.onDevice ? ', di perangkat' : '') + '):\n' + t.text : '';
        }
      } catch (e) { transcript = '(Transkrip tidak tersedia: ' + e.message + ')'; }
    }
    out.unshift(fileAtt(name, meta.join('\n') + (transcript ? '\n\n' + transcript : ''), isVideo ? 'video' : 'audio'));
    return out;
  }

  // ---------------------------------------------------------------- subtitles

  function parseVtt(ts) {
    var m = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/.exec(ts || '');
    if (!m) return 0;
    return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
  }
  function fmtTs(s) {
    var t = Math.max(0, Math.floor(s));
    return (t >= 3600 ? Math.floor(t / 3600) + ':' : '') + String(Math.floor(t / 60) % 60).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }
  async function subtitle(path, name, ext) {
    var raw = (await Native.call('file.text', { path: path, maxBytes: 4000000 })).text;
    var cues = [];
    if (ext === 'ass' || ext === 'ssa') {
      raw.split('\n').forEach(function (l) {
        var m = /^Dialogue:\s*[^,]*,([^,]+),([^,]+),(?:[^,]*,){6}(.*)$/.exec(l.trim());
        if (m) cues.push({ start: parseVtt(m[1]), end: parseVtt(m[2]), text: m[3].replace(/\{[^}]*\}/g, '').replace(/\\N/gi, ' ').trim() });
      });
    } else {
      // SRT / VTT / SBV share a "timestamp --> timestamp" then text block shape.
      raw.replace(/\r/g, '').split(/\n\n+/).forEach(function (block) {
        var lines = block.split('\n').filter(function (x) { return !/^\s*(WEBVIEW|WEBVTT|NOTE|\d+)\s*$/.test(x); });
        var tl = lines.find(function (x) { return /-->|,\d/.test(x) && /\d:\d/.test(x); });
        if (!tl) return;
        var parts = tl.split(/-->|\t/);
        var start = parseVtt(parts[0]), end = parseVtt(parts[1] || parts[0]);
        var text = lines.slice(lines.indexOf(tl) + 1).join(' ').replace(/<[^>]+>/g, '').trim();
        if (text) cues.push({ start: start, end: end, text: text });
      });
    }
    cues.sort(function (a, b) { return a.start - b.start; });
    var dur = cues.length ? cues[cues.length - 1].end : 0;
    var body = cues.map(function (c) { return '[' + fmtTs(c.start) + ' → ' + fmtTs(c.end) + '] ' + c.text; }).join('\n');
    var plain = cues.map(function (c) { return c.text; }).join(' ');
    return [fileAtt(name, (cues.length + ' baris subtitle, durasi ' + fmtTs(dur) + '\n\n' + body + '\n\n--- Teks penuh ---\n' + plain).slice(0, MAX_TEXT), 'subtitle')];
  }

  // ---------------------------------------------------------------- email

  function decodeHeader(v) {
    return String(v || '').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, function (_, cs, enc, data) {
      try {
        if (enc.toLowerCase() === 'b') return decodeURIComponent(escape(atob(data)));
        return data.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); });
      } catch (e) { return data; }
    });
  }
  async function email(path, name, ext) {
    if (ext === 'msg') {
      // Outlook .msg is a binary OLE compound file — pull readable strings.
      var s = Store.info.posixShell === false ? { stdout: '' } : await sh('strings -n 4 ' + U.shq(path) + " | grep -aE '@|Subject|From|To|Sent' | head -200");
      var all = await Native.call('file.text', { path: path, maxBytes: 2000000 }).catch(function () { return { text: '' }; });
      var txt = (all.text || '').replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]+/g, ' ').replace(/\s{3,}/g, '\n');
      return [fileAtt(name, 'Email Outlook (.msg). Metadata & teks yang terbaca:\n' + s.stdout + '\n\n' + txt.slice(0, 40000), 'email .msg')];
    }
    var raw = (await Native.call('file.text', { path: path, maxBytes: 6000000 })).text;
    var sep = raw.indexOf('\r\n\r\n'); if (sep < 0) sep = raw.indexOf('\n\n');
    var head = sep > 0 ? raw.slice(0, sep) : raw;
    var rest = sep > 0 ? raw.slice(sep + (raw[sep] === '\r' ? 4 : 2)) : '';
    head = head.replace(/\r?\n[ \t]+/g, ' '); // unfold
    var hdr = {};
    head.split(/\r?\n/).forEach(function (l) { var i = l.indexOf(':'); if (i > 0) hdr[l.slice(0, i).toLowerCase()] = decodeHeader(l.slice(i + 1).trim()); });
    var ctype = (hdr['content-type'] || '').toLowerCase();
    var cte = (hdr['content-transfer-encoding'] || '').toLowerCase();
    var bodyText = rest, atts = [];
    var mb = /boundary="?([^";\r\n]+)"?/i.exec(ctype);
    if (mb) {
      var parts = rest.split('--' + mb[1]);
      var best = '';
      parts.forEach(function (part) {
        var ps = part.indexOf('\r\n\r\n'); if (ps < 0) ps = part.indexOf('\n\n');
        if (ps < 0) return;
        var ph = part.slice(0, ps).replace(/\r?\n[ \t]+/g, ' ');
        var pb = part.slice(ps).trim();
        var pct = (/content-type:\s*([^;\r\n]+)/i.exec(ph) || [])[1] || '';
        var pcte = ((/content-transfer-encoding:\s*([^\r\n]+)/i.exec(ph) || [])[1] || '').toLowerCase().trim();
        var disp = (/content-disposition:\s*([^;\r\n]+)/i.exec(ph) || [])[1] || '';
        var fn = (/name="?([^";\r\n]+)"?/i.exec(ph) || [])[1];
        if (/attachment/i.test(disp) || (fn && !/text\//i.test(pct))) { atts.push(fn || pct.trim()); return; }
        if (/text\/plain/i.test(pct)) best = decodeBody(pb, pcte) || best;
        else if (/text\/html/i.test(pct) && !best) best = U.htmlToText(decodeBody(pb, pcte), '').text;
      });
      if (best) bodyText = best;
    } else {
      bodyText = decodeBody(rest, cte);
    }
    var meta = ['Dari: ' + (hdr.from || '?'), 'Kepada: ' + (hdr.to || '?')];
    if (hdr.cc) meta.push('Cc: ' + hdr.cc);
    meta.push('Tanggal: ' + (hdr.date || '?'), 'Subjek: ' + (hdr.subject || '(tanpa subjek)'));
    if (atts.length) meta.push('Lampiran: ' + atts.join(', '));
    return [fileAtt(name, meta.join('\n') + '\n\n' + bodyText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT), 'email')];
  }
  function decodeBody(s, enc) {
    try {
      if (enc === 'base64') return decodeURIComponent(escape(atob(s.replace(/\s+/g, ''))));
      if (enc === 'quoted-printable') return s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); });
    } catch (e) { /* fall through */ }
    return s;
  }

  // ---------------------------------------------------------------- 3D / CAD

  async function model3d(path, name, ext) {
    var out = [];
    // A Quick Look thumbnail works for STL/OBJ/USDZ/STEP on recent macOS.
    var thumb = await Native.call('file.thumbnail', { path: path, size: 1200 }).catch(function () { return null; });
    if (thumb && thumb.data) out.push(imgAtt(name + ' (pratinjau 3D)', thumb));
    var summary = '';
    try {
      if (ext === 'stl') {
        var head = await Native.call('file.text', { path: path, maxBytes: 200000 }).catch(function () { return { text: '' }; });
        if (/^\s*solid/i.test(head.text) && /facet/i.test(head.text)) {
          var facets = (head.text.match(/facet/gi) || []).length;
          summary = 'STL ASCII, ' + facets + '+ segitiga (sampel).';
        } else {
          var st = await Native.call('fs.stat', { path: path });
          summary = 'STL biner, ± ' + Math.max(0, Math.round((st.size - 84) / 50)) + ' segitiga.';
        }
      } else if (ext === 'obj') {
        var g = await sh("grep -cE '^v ' " + U.shq(path) + "; grep -cE '^f ' " + U.shq(path));
        var nums = g.stdout.split('\n');
        summary = 'OBJ: ' + (nums[0] || '?') + ' vertex, ' + (nums[1] || '?') + ' face.';
      } else if (ext === 'step' || ext === 'stp' || ext === 'iges' || ext === 'igs') {
        var h = await Native.call('file.text', { path: path, maxBytes: 8000 });
        var nm = /FILE_NAME\('([^']*)'/.exec(h.text);
        summary = ext.toUpperCase() + ' CAD (BREP). ' + (nm ? 'Nama: ' + nm[1] : '');
      } else if (ext === 'dxf') {
        var d = await Native.call('file.text', { path: path, maxBytes: 2000000 });
        var ents = (d.text.match(/\n\s*0\s*\r?\n(LINE|CIRCLE|ARC|LWPOLYLINE|POLYLINE|TEXT|INSERT)/g) || []).length;
        summary = 'DXF (gambar 2D/3D), ± ' + ents + ' entitas.';
      }
    } catch (e) { /* ignore */ }
    out.push(fileAtt(name, 'Model 3D/CAD ' + ext.toUpperCase() + '.\n' + summary + (thumb && thumb.data ? '\nPratinjau terlampir.' : '\n(Pratinjau visual tidak tersedia untuk format ini di ' + Prompts.osName() + '.)'), 'model 3D'));
    return out;
  }

  // ---------------------------------------------------------------- dispatcher

  async function readPath(path, opts) {
    opts = opts || {};
    var vision = !!opts.vision;
    // Resolve symlinks, download iCloud files, and surface offline-drive errors.
    var prep = await Native.call('file.prepare', { path: path }).catch(function (e) { throw e; });
    if (prep && prep.path) path = prep.path;
    var info = await Native.call('file.info', { path: path });
    var name = info.name, ext = info.ext;

    if (info.isDir && !info.isPackage) {
      var l = await Native.call('fs.list', { path: path, depth: 3, limit: 800 });
      var tree = l.entries.map(function (e) { return '  '.repeat(e.depth - 1) + e.path.split('/').pop() + (e.dir ? '/' : ''); }).join('\n');
      return [fileAtt(name, path + '/\n' + tree + (l.truncated ? '\n…' : ''), 'isi folder')];
    }
    if (IMG.test(ext)) {
      var out = [];
      var r = await Native.call('image.prepare', { path: path, maxDim: 1600 });
      out.push(imgAtt(name, r));
      var meta = await Native.call('image.meta', { path: path }).catch(function () { return {}; });
      var metaLines = [];
      if (meta.make || meta.model) metaLines.push('Kamera: ' + [meta.make, meta.model].filter(Boolean).join(' '));
      if (meta.lens) metaLines.push('Lensa: ' + meta.lens);
      ['focalLength', 'aperture', 'exposure', 'iso'].forEach(function (k) { if (meta[k] != null) metaLines.push({ focalLength: 'Focal', aperture: 'Aperture', exposure: 'Shutter', iso: 'ISO' }[k] + ': ' + meta[k]); });
      if (meta.taken) metaLines.push('Diambil: ' + meta.taken);
      if (meta.gps) metaLines.push('Lokasi GPS: ' + meta.gps);
      // Live Photo: a HEIC/JPEG paired with a .mov of the same base name.
      var livePhoto = '';
      if (/^(heic|heif|jpe?g)$/.test(ext)) {
        var base = path.replace(/\.[^.]+$/, '');
        for (var mi = 0; mi < 2; mi++) {
          var movp = base + (mi === 0 ? '.mov' : '.MOV');
          var ms = await Native.call('fs.stat', { path: movp }).catch(function () { return { exists: false }; });
          if (ms.exists) { livePhoto = '\nLive Photo: ada klip video pasangan (' + U.basename(movp) + ').'; break; }
        }
      }
      if (!vision || opts.ocr) {
        var o = await Native.call('image.ocr', { path: path }).catch(function () { return { text: '' }; });
        out.push(fileAtt(name, (o.text ? 'Teks yang terbaca dari gambar (OCR):\n' + o.text : '(tidak ada teks terbaca di gambar)') +
          '\nUkuran asli: ' + r.origWidth + '×' + r.origHeight + (metaLines.length ? '\n' + metaLines.join('\n') : '') + livePhoto, 'teks gambar'));
      } else if (metaLines.length || livePhoto) {
        out.push(fileAtt(name, metaLines.join('\n') + livePhoto, 'info gambar'));
      }
      return out;
    }
    if (SUBTITLE.test(ext)) return subtitle(path, name, ext);
    if (EMAIL.test(ext)) return email(path, name, ext);
    if (MODEL3D.test(ext)) return model3d(path, name, ext);
    if (ext === 'svg') {
      var sv = await Native.call('file.text', { path: path });
      return [fileAtt(name, sv.text, 'SVG')];
    }
    if (ext === 'pdf' || ext === 'ai') {
      var p;
      try {
        p = await Native.call('pdf.read', { path: path, images: vision ? 3 : 0, password: opts.password });
      } catch (e) {
        if (/PDF_LOCKED/.test(e.message)) {
          return [fileAtt(name, 'PDF ini dilindungi kata sandi dan tidak bisa dibuka tanpa password. Jika Anda tahu sandinya, sampaikan ke Sinai agar bisa membacanya.', 'PDF terkunci')];
        }
        throw e;
      }
      var res = [fileAtt(name, (p.title ? 'Judul: ' + p.title + '\n' : '') + p.pages + ' halaman' + (p.ocr ? ' (hasil OCR dokumen pindaian)' : '') + '\n\n' + p.text, 'PDF')];
      if (vision && (p.scanned || p.textChars < 2000)) (p.images || []).forEach(function (im, i) { res.push(imgAtt(name + ' — halaman ' + (i + 1), im)); });
      return res;
    }
    if (TEXTUTIL.test(ext)) {
      var d = await Native.call('doc.extractText', { path: path });
      return [fileAtt(name, d.text, 'dokumen')];
    }
    if (/^(xlsx|xlsm|xltx)$/.test(ext)) return xlsx(path, name);
    if (/^(pptx|ppsx|potx)$/.test(ext)) return pptx(path, name);
    if (/^(ods|odp)$/.test(ext)) return odf(path, name, ext);
    if (/^(pages|numbers|key)$/.test(ext)) return iwork(path, name, ext, vision);
    if (AUDIO.test(ext)) return audioVideo(path, name, ext, vision, false);
    if (VIDEO.test(ext)) return audioVideo(path, name, ext, vision, true);
    if (ext === 'ipynb') {
      var nb = JSON.parse((await Native.call('file.text', { path: path })).text);
      var cells = (nb.cells || []).map(function (c, i) {
        var src = Array.isArray(c.source) ? c.source.join('') : (c.source || '');
        var outs = (c.outputs || []).map(function (o) {
          var t = o.text || (o.data && o.data['text/plain']) || '';
          return Array.isArray(t) ? t.join('') : String(t);
        }).join('\n');
        return '### Sel ' + (i + 1) + ' [' + c.cell_type + ']\n' + (c.cell_type === 'code' ? '```python\n' + src + '\n```' : src) + (outs ? '\nOutput:\n```\n' + outs.slice(0, 4000) + '\n```' : '');
      });
      return [fileAtt(name, cells.join('\n\n'), 'notebook')];
    }
    if (/^(sqlite3?|db|sqlitedb)$/.test(ext)) {
      var q = 'sqlite3 -readonly ' + U.shq(path);
      var tables = await sh(q + ' ".tables"');
      if (tables.code === 0) {
        var schema = await sh(q + ' ".schema"');
        var names = tables.stdout.split(/\s+/).filter(Boolean).slice(0, 30);
        var sample = '';
        for (var i = 0; i < names.length; i++) {
          var s = await sh(q + ' -header -csv "SELECT * FROM \\"' + names[i].replace(/"/g, '') + '\\" LIMIT 15"');
          sample += '\n## ' + names[i] + ' (15 baris pertama)\n' + s.stdout;
        }
        return [fileAtt(name, 'Skema:\n' + schema.stdout + '\n' + sample, 'database SQLite')];
      }
    }
    if (ext === 'plist' || ext === 'mobileconfig') {
      var pl = await sh('plutil -convert xml1 -o - ' + U.shq(path));
      if (pl.code === 0) return [fileAtt(name, pl.stdout, 'property list')];
    }
    if (ARCHIVE_ZIP.test(ext) || ARCHIVE_TAR.test(ext) || ARCHIVE_ANY.test(ext)) {
      return archive(path, name, ext, opts);
    }
    if (info.isText || info.size === 0) {
      var tx = await Native.call('file.text', { path: path, maxBytes: 3000000 });
      return [fileAtt(name, tx.text + (tx.truncated ? '\n[… file terlalu besar, dipotong]' : ''))];
    }
    // Any other binary: describe it and pull readable strings.
    var desc, strs;
    if (Store.info.posixShell === false || !U.isMac()) {
      desc = Store.info.posixShell === false ? { stdout: '' } : await sh('file -b ' + U.shq(path) + ' 2>/dev/null');
      strs = await Native.call('doc.extractText', { path: path, strings: true }).then(function (r) { return { stdout: String(r.text || '').split('\n').slice(0, 400).join('\n') }; }).catch(function () { return { stdout: '' }; });
    } else {
      desc = await sh('file -b ' + U.shq(path) + '; mdls -name kMDItemKind -name kMDItemTitle -name kMDItemAuthors ' + U.shq(path) + ' 2>/dev/null');
      strs = await sh('strings -n 5 ' + U.shq(path) + ' | head -400');
    }
    var legacy = /^(xls|ppt|msg|pub|vsd|mpp)$/.test(ext) ? '\nCatatan: format Office lama (biner). Teks di bawah diambil langsung dari isi file dan mungkin tidak lengkap; simpan ulang sebagai .xlsx/.pptx/.docx untuk hasil terbaik.\n' : '';
    return [fileAtt(name, 'Jenis: ' + info.kind + ' (' + (info.uti || ext) + '), ' + info.size + ' byte\n' + desc.stdout + legacy +
      '\nTeks yang terbaca:\n' + (strs.stdout || '(tidak ada)'), 'file biner')];
  }

  /* From a browser File (paste/drag from other apps): write to a temp file first. */
  async function readFileObject(file, opts) {
    var url = await new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(file);
    });
    var name = file.name || ('tempel-' + Date.now() + (/png/.test(file.type) ? '.png' : /jpe?g/.test(file.type) ? '.jpg' : ''));
    var t = await Native.call('fs.writeTemp', { name: name, base64: String(url).split(',')[1] || '' });
    return readPath(t.path, opts);
  }

  /* For the agent's read_file tool: text plus images for vision models. */
  async function forTool(path, vision) {
    var atts = await readPath(path, { vision: vision });
    return {
      text: atts.filter(function (a) { return a.kind === 'file'; }).map(function (a) { return a.text; }).join('\n\n'),
      images: atts.filter(function (a) { return a.kind === 'image'; }).map(function (a) { return { mime: a.mime, data: a.data, name: a.name }; }),
    };
  }

  function needsSpecialReader(path) {
    var ext = (String(path).split('.').pop() || '').toLowerCase();
    return IMG.test(ext) || AUDIO.test(ext) || VIDEO.test(ext) || TEXTUTIL.test(ext) ||
      SUBTITLE.test(ext) || EMAIL.test(ext) || MODEL3D.test(ext) ||
      /^(pdf|ai|xlsx|xlsm|xltx|pptx|ppsx|potx|ods|odp|pages|numbers|key|ipynb|sqlite3?|db|sqlitedb|plist|mobileconfig)$/.test(ext) ||
      ARCHIVE_ZIP.test(ext) || ARCHIVE_TAR.test(ext) || ARCHIVE_ANY.test(ext);
  }

  window.Files = { readPath: readPath, readFileObject: readFileObject, forTool: forTool, needsSpecialReader: needsSpecialReader };
})();
