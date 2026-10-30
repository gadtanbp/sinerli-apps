/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Host Sinai untuk Android & iOS.
   UI web Sinai berbicara dengan host lewat kontrak bridge desktop
   ({id, method, params} → window.__gx.resolve/reject/events). Di ponsel,
   berkas ini memenuhi kontrak itu: sebagian besar metode dikerjakan di sini
   (pembaca berkas, ekspor DOCX/XLSX/ZIP, PDF & gambar lewat gx-worker.js),
   dan hanya primitif kecil yang diteruskan ke host native (mobile/android,
   mobile/ios): penyimpanan, keychain/keystore, HTTP, berkas di sandbox
   aplikasi, pemilih berkas, login, render PDF/PNG, bagikan, pembaruan.
   Dimuat sebelum js/native.js (lihat mobile/build-web.sh). */
(function () {
  'use strict';

  // ================================================================ transport ke native
  //   iOS     : window.webkit.messageHandlers.sinaiNative (hanya frame utama)
  //   Android : MessagePort yang dikirim WebView.postWebMessage ke frame utama
  //   Uji     : window.__gxMock (dev/mobile-harness)
  // Jawaban & event native masuk lewat window.__gxn(msg).
  var seq = 0;
  var waiting = new Map();
  var listeners = new Map();
  var queue = [];
  var port = null;
  var ios = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.sinaiNative;
  var nonceMeta = document.querySelector('meta[name="gx-nonce"]');
  var NONCE = nonceMeta ? nonceMeta.getAttribute('content') : '';

  function send(msg) {
    if (ios) { ios.postMessage(msg); return; }
    if (window.__gxMock) { window.__gxMock.post(msg); return; }
    if (port) { port.postMessage(JSON.stringify(msg)); return; }
    queue.push(msg);
  }

  // Android: hanya port pertama, tanpa sumber (dikirim WebView, bukan iframe), dengan nonce halaman ini.
  window.addEventListener('message', function (e) {
    if (port || ios || window.__gxMock) return;
    var d = e.data;
    if (e.source != null || typeof d !== 'string' || d !== 'sinai-port:' + NONCE || !NONCE || !e.ports || !e.ports[0]) return;
    port = e.ports[0];
    port.onmessage = function (ev) { var m; try { m = JSON.parse(ev.data); } catch (er) { return; } window.__gxn(m); };
    var q = queue; queue = [];
    q.forEach(send);
  });

  window.__gxn = function (m) {
    if (!m) return;
    if (m.events) {
      var page = [];
      m.events.forEach(function (ev) {
        var set = listeners.get(ev[0]);
        if (set) set.forEach(function (fn) { try { fn(ev[1]); } catch (er) { console.error(er); } });
        page.push([ev[0], { v: ev[1] }]);
      });
      if (window.__gx) window.__gx.events(page);
      return;
    }
    var w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    if (m.ok) w.resolve(m.v); else w.reject(new Error(m.err || 'Kesalahan'));
  };

  /** Panggil primitif native. */
  function nx(method, params) {
    return new Promise(function (resolve, reject) {
      var id = 'n' + (++seq);
      waiting.set(id, { resolve: resolve, reject: reject });
      send({ id: id, method: method, params: params || {} });
    });
  }
  function onNative(name, fn) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return function () { listeners.get(name).delete(fn); };
  }
  function emitPage(name, payload) { if (window.__gx) window.__gx.events([[name, { v: payload }]]); }

  // ================================================================ util
  function fail(msg) { return Promise.reject(new Error(msg)); }
  var NOT_MOBILE = function (what) { return function () { return fail((what || 'Fitur ini') + ' belum tersedia di Sinai untuk ponsel.'); }; };
  var info = null;

  function b64ToBytes(s) {
    var bin = atob(s || '');
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  var enc = new TextEncoder();
  function utf8(s) { return enc.encode(String(s == null ? '' : s)); }
  function isBinary(b) { var n = Math.min(b.length, 8000); for (var i = 0; i < n; i++) if (b[i] === 0) return true; return false; }
  function decodeText(b) {
    if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), encoding: 10 };
    if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), encoding: 2415919360 };
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 4 }; } catch (e) { /* bukan utf-8 */ }
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(0, Math.max(0, b.length - 4))), encoding: 4 }; } catch (e) { /* tidak */ }
    return { text: new TextDecoder('windows-1252').decode(b), encoding: 12 };
  }
  function xmlEsc(s) { return String(s == null ? '' : s).replace(/[<>&'"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]; }); }
  function basename(p) { return String(p || '').replace(/\/+$/, '').split('/').pop(); }
  function dirname(p) { var s = String(p || '').replace(/\/+$/, ''); var i = s.lastIndexOf('/'); return i > 0 ? s.slice(0, i) : '/'; }
  function extOf(p) { var b = basename(p); var i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; }
  function expand(p) {
    p = String(p || '');
    if (p === '~' || p.indexOf('~/') === 0) p = info.home + p.slice(1);
    return p.replace(/\/{2,}/g, '/');
  }
  function uid() { var b = new Uint8Array(8); crypto.getRandomValues(b); return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }

  async function readBytes(path, maxBytes) {
    var r = await nx('fs.readBytes', { path: expand(path), length: maxBytes || 0 });
    return { bytes: b64ToBytes(r.base64), size: r.size, mtime: r.mtime };
  }
  function writeBytes(path, bytes, append) {
    return nx('fs.writeBytes', { path: expand(path), base64: bytesToB64(bytes), append: !!append });
  }
  async function tempPath(name) {
    var dir = info.tempDir + '/' + uid();
    await nx('fs.mkdir', { path: dir });
    return dir + '/' + String(name || 'file').replace(/[\\/:*?"<>|]/g, '_');
  }

  // ================================================================ zip
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) { var c = i; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

  async function streamBytes(bytes, stream) {
    var s = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  function canDeflate() { try { new CompressionStream('deflate-raw'); return true; } catch (e) { return false; } }
  function canInflate() { try { new DecompressionStream('deflate-raw'); return true; } catch (e) { return false; } }

  /** entries: [[nama, Uint8Array|string]] → Uint8Array zip. Berkas "mimetype" disimpan tanpa kompresi (syarat ODF). */
  async function zipCreate(entries) {
    var deflate = canDeflate();
    var chunks = [], central = [], offset = 0, total = 0;
    var dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
    for (var i = 0; i < entries.length; i++) {
      var name = utf8(String(entries[i][0]).replace(/\\/g, '/'));
      var data = typeof entries[i][1] === 'string' ? utf8(entries[i][1]) : entries[i][1];
      var crc = crc32(data), payload = data, method = 0;
      if (deflate && data.length > 64 && entries[i][0] !== 'mimetype') {
        var d = await streamBytes(data, new CompressionStream('deflate-raw'));
        if (d.length < data.length) { payload = d; method = 8; }
      }
      var local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, method, true);
      local.setUint16(10, 0, true); local.setUint16(12, dosDate, true); local.setUint32(14, crc, true); local.setUint32(18, payload.length, true);
      local.setUint32(22, data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      var cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, method, true);
      cd.setUint16(12, 0, true); cd.setUint16(14, dosDate, true); cd.setUint32(16, crc, true); cd.setUint32(20, payload.length, true);
      cd.setUint32(24, data.length, true); cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);
      chunks.push(new Uint8Array(local.buffer), name, payload);
      offset += 30 + name.length + payload.length;
    }
    var cdLen = central.reduce(function (a, c) { return a + c.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdLen, true); end.setUint32(16, offset, true);
    var all = chunks.concat(central, [new Uint8Array(end.buffer)]);
    all.forEach(function (c) { total += c.length; });
    var out = new Uint8Array(total), pos = 0;
    all.forEach(function (c) { out.set(c, pos); pos += c.length; });
    return out;
  }

  /** Daftar isi zip dari central directory. */
  function zipEntries(b) {
    var dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    var eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Bukan arsip zip yang valid');
    var count = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), out = [];
    var dec = new TextDecoder();
    for (var n = 0; n < count && p + 46 <= b.length; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
      var nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      out.push({ name: dec.decode(b.subarray(p + 46, p + 46 + nl)), method: method, csize: csize, usize: usize, offset: lho });
      p += 46 + nl + xl + cl;
    }
    return out;
  }
  async function zipReadEntry(b, e) {
    var dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (dv.getUint32(e.offset, true) !== 0x04034b50) throw new Error('Isi zip rusak');
    var start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
    var data = b.subarray(start, start + e.csize);
    if (e.method === 0) return data;
    if (e.method === 8 && canInflate()) return streamBytes(data, new DecompressionStream('deflate-raw'));
    throw new Error('Metode kompresi zip tidak didukung di perangkat ini');
  }
  async function zipFile(path) { return (await readBytes(path, 200 * 1048576)).bytes; }

  // ================================================================ pembaca dokumen (port dari desktop/lib/files.js)
  function decodeXml(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); }).replace(/&amp;/g, '&');
  }
  function ooxmlText(xml, paraTag) {
    return decodeXml(xml.replace(/<w:tab\/>|<a:tab\/>|<text:tab\/>/g, '\t').replace(/<w:br[^>]*\/>|<a:br[^>]*\/>|<text:line-break\/>/g, '\n')
      .replace(new RegExp('</' + paraTag + '>|</text:h>', 'g'), '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();
  }
  function htmlText(html) {
    return decodeXml(String(html).replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr|table|section|article|blockquote|pre)>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<\/t[dh]>/gi, '\t')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function rtfText(rtf) {
    var out = '', skip = [];
    var dest = /^(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|themedata|colorschememapping|latentstyles|datastore|generator|xmlnstbl|listtable|listoverridetable|rsidtbl)$/;
    for (var i = 0; i < rtf.length; i++) {
      var ch = rtf[i];
      if (ch === '{') { skip.push(skip.length ? skip[skip.length - 1] : false); continue; }
      if (ch === '}') { skip.pop(); continue; }
      var skipping = skip.length && skip[skip.length - 1];
      if (ch === '\\') {
        var m = /^\\([a-z]+)(-?\d+)? ?|^\\'([0-9a-f]{2})|^\\([^a-z])/i.exec(rtf.slice(i, i + 40));
        if (!m) continue;
        i += m[0].length - 1;
        if (m[1]) {
          if (m[1] === '*' || dest.test(m[1])) { if (skip.length) skip[skip.length - 1] = true; continue; }
          if (skipping) continue;
          if (m[1] === 'par' || m[1] === 'line') out += '\n'; else if (m[1] === 'tab') out += '\t';
          else if (m[1] === 'u' && m[2]) { var n = parseInt(m[2], 10); if (n < 0) n += 65536; out += String.fromCharCode(n); if (rtf[i + 1] === '?') i++; }
        } else if (m[3] && !skipping) out += new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(m[3], 16)]));
        else if (m[4] === '*' && skip.length) skip[skip.length - 1] = true;
        else if (m[4] && !skipping && '{}\\'.indexOf(m[4]) >= 0) out += m[4];
        continue;
      }
      if (skipping || ch === '\r' || ch === '\n') continue;
      out += ch;
    }
    return out.replace(/\n{3,}/g, '\n\n').trim();
  }
  function legacyText(b) {
    var runs = [], m, re;
    var u16 = new TextDecoder('utf-16le').decode(b.subarray(0, b.length - (b.length % 2)));
    re = /[\p{L}\p{N}\p{P}\p{Zs}\r\n\t]{4,}/gu;
    while ((m = re.exec(u16))) if (/\p{L}{2}/u.test(m[0])) runs.push(m[0]);
    if (runs.join('').length < 200) {
      var latin = new TextDecoder('windows-1252').decode(b);
      re = /[\x20-\x7e\xa0-\xff\r\n\t]{6,}/g;
      while ((m = re.exec(latin))) if (/[A-Za-z]{3}/.test(m[0])) runs.push(m[0]);
    }
    return runs.join('\n').replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function extractText(p) {
    var file = p.path ? expand(p.path) : null, bytes;
    var ext = file ? extOf(file) : String(p.ext || 'bin').toLowerCase();
    if (!file && !p.base64) throw new Error('path atau base64 wajib diisi');
    bytes = file ? await zipFile(file) : b64ToBytes(p.base64);
    var td = new TextDecoder();
    var entryText = async function (name) { var e = zipEntries(bytes).find(function (x) { return x.name === name; }); return e ? td.decode(await zipReadEntry(bytes, e)) : ''; };
    if (ext === 'pdf') {
      var r = await worker('pdfRead', { base64: bytesToB64(bytes), password: p.password, maxPages: 400 });
      return { text: r.text.replace(/^--- Halaman \d+ ---\n/gm, ''), pages: r.pages };
    }
    if (ext === 'docx' || ext === 'docm' || ext === 'dotx') return { text: ooxmlText(await entryText('word/document.xml'), 'w:p') };
    if (ext === 'odt' || ext === 'ods' || ext === 'odp') return { text: ooxmlText(await entryText('content.xml'), 'text:p') };
    if (ext === 'pptx') {
      var names = zipEntries(bytes).map(function (e) { return e.name; }).filter(function (n) { return /^ppt\/slides\/slide\d+\.xml$/.test(n); })
        .sort(function (a, b) { return parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10); });
      var parts = [];
      for (var i = 0; i < names.length; i++) parts.push('--- Slide ' + (i + 1) + ' ---\n' + ooxmlText(await entryText(names[i]), 'a:p'));
      return { text: parts.join('\n\n') };
    }
    if (ext === 'xlsx') {
      var shared = [];
      var ss = await entryText('xl/sharedStrings.xml');
      if (ss) shared = Array.from(ss.matchAll(/<si>([\s\S]*?)<\/si>/g)).map(function (m) { return ooxmlText(m[1], 'x'); });
      var sheets = zipEntries(bytes).map(function (e) { return e.name; }).filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); });
      var out = [];
      for (var s = 0; s < sheets.length; s++) {
        var xml = await entryText(sheets[s]);
        var rows = Array.from(xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)).map(function (r) {
          return Array.from(r[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)).map(function (c) {
            var v = (/<v>([\s\S]*?)<\/v>/.exec(c[2]) || [])[1];
            if (/t="s"/.test(c[1]) && v != null) return shared[parseInt(v, 10)] || '';
            var t = /<t[^>]*>([\s\S]*?)<\/t>/.exec(c[2]);
            return t ? decodeXml(t[1]) : (v != null ? decodeXml(v) : '');
          }).join('\t');
        });
        out.push('--- ' + basename(sheets[s]).replace(/\.xml$/, '') + ' ---\n' + rows.join('\n'));
      }
      return { text: out.join('\n\n') };
    }
    if (p.strings) return { text: legacyText(bytes) };
    if (ext === 'rtf' || td.decode(bytes.subarray(0, 5)) === '{\\rtf') return { text: rtfText(new TextDecoder('windows-1252').decode(bytes)) };
    if (ext === 'html' || ext === 'htm' || ext === 'xhtml') return { text: htmlText(decodeText(bytes).text) };
    if (['doc', 'ppt', 'xls', 'wps', 'pages', 'key', 'numbers'].indexOf(ext) >= 0) { var lt = legacyText(bytes); if (lt) return { text: lt }; }
    if (!isBinary(bytes)) return { text: decodeText(bytes).text };
    throw new Error('Tidak bisa mengekstrak teks dari file .' + ext);
  }

  var KIND = {
    pdf: 'Dokumen PDF', docx: 'Dokumen Word', doc: 'Dokumen Word 97-2003', xlsx: 'Lembar kerja Excel', xls: 'Lembar kerja Excel 97-2003',
    pptx: 'Presentasi PowerPoint', ppt: 'Presentasi PowerPoint 97-2003', odt: 'Dokumen OpenDocument', ods: 'Lembar kerja OpenDocument',
    odp: 'Presentasi OpenDocument', rtf: 'Dokumen RTF', txt: 'Teks biasa', md: 'Markdown', csv: 'CSV', json: 'JSON', html: 'Dokumen HTML',
    png: 'Gambar PNG', jpg: 'Gambar JPEG', jpeg: 'Gambar JPEG', gif: 'Gambar GIF', webp: 'Gambar WebP', svg: 'Gambar SVG', heic: 'Gambar HEIC',
    mp3: 'Audio MP3', wav: 'Audio WAV', m4a: 'Audio AAC', mp4: 'Video MPEG-4', mov: 'Video QuickTime', webm: 'Video WebM', zip: 'Arsip ZIP',
  };

  // ================================================================ worker (gx-worker.js: pdf.js, canvas, media)
  var workerReady = null;
  window.gxw = {
    write: function (token, bytes, append) { var t = tokens.get(token); if (!t) return Promise.reject(new Error('token')); return writeBytes(t.path, bytes, append); },
    progress: function (token, f) { var t = tokens.get(token); if (t && t.onProgress) t.onProgress(f); },
    done: function () {},
  };
  var tokens = new Map();
  function worker(fn, args) {
    if (!workerReady) workerReady = import('/gx-worker.js').then(function () { if (!window.W) throw new Error('Modul pembaca berkas gagal dimuat'); });
    return workerReady.then(function () { return window.W[fn](args || {}); });
  }
  async function src(p) {
    if (p.base64) return { base64: p.base64 };
    if (!p.path) throw new Error('path wajib diisi');
    return { url: await nx('file.url', { path: expand(p.path) }) };
  }

  // ================================================================ ekspor (port dari desktop/lib/exports.js)
  var CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  function coreXml(title) {
    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return CT + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + xmlEsc(title || '') + '</dc:title><dc:creator>Sinai</dc:creator>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>';
  }
  async function docx(html, name) {
    var r = await worker('htmlToDocx', { html: String(html || '') });
    var files = [
      ['[Content_Types].xml', CT + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
      ['_rels/.rels', CT + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
      ['docProps/core.xml', coreXml(r.title || name)],
      ['word/document.xml', r.documentXml], ['word/styles.xml', r.stylesXml], ['word/numbering.xml', r.numberingXml], ['word/_rels/document.xml.rels', r.relsXml],
    ];
    (r.media || []).forEach(function (m) { files.push([m.name, b64ToBytes(m.base64)]); });
    return zipCreate(files);
  }
  async function odt(html, name) {
    var r = await worker('htmlToOdt', { html: String(html || '') });
    return zipCreate([
      ['mimetype', 'application/vnd.oasis.opendocument.text'],
      ['META-INF/manifest.xml', '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>'],
      ['meta.xml', '<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"><office:meta><meta:generator>Sinai</meta:generator><dc:title>' + xmlEsc(name || '') + '</dc:title></office:meta></office:document-meta>'],
      ['content.xml', r.content], ['styles.xml', r.styles],
    ]);
  }
  function wordHtml(html) {
    var s = String(html || '');
    if (!/<html/i.test(s)) s = '<html><head><meta charset="utf-8"></head><body>' + s + '</body></html>';
    return s.replace(/<html([^>]*)>/i, '<html$1 xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">')
      .replace(/<head([^>]*)>/i, '<head$1><meta charset="utf-8"><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->');
  }
  function colName(i) { var n = i, s = ''; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; }
  async function xlsx(sheets) {
    var sheetXmls = [], wbSheets = '', wbRels = '', overrides = '', relId = 0;
    sheets.forEach(function (sheet, i) {
      var sname = String(sheet.name || 'Sheet' + (i + 1)).replace(/[\[\]*?:/\\]/g, '_');
      var rows = sheet.rows || [], header = sheet.header !== false, widths = [], body = '';
      rows.forEach(function (row, r) {
        var cells = '', style = header && r === 0 ? ' s="1"' : '';
        (row || []).forEach(function (val, c) {
          var ref = colName(c) + (r + 1), shown;
          if (typeof val === 'number' && isFinite(val)) { cells += '<c r="' + ref + '"' + style + '><v>' + val + '</v></c>'; shown = String(val); }
          else { var s = val == null ? '' : String(val); shown = s; if (s) cells += '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(s) + '</t></is></c>'; }
          while (widths.length <= c) widths.push(8);
          widths[c] = Math.max(widths[c], Math.min(60, shown.length + 2));
        });
        body += '<row r="' + (r + 1) + '">' + cells + '</row>';
      });
      var cols = widths.length ? '<cols>' + widths.map(function (w, k) { return '<col min="' + (k + 1) + '" max="' + (k + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' : '';
      var freeze = header && rows.length > 1 ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
      sheetXmls.push(['xl/worksheets/sheet' + (i + 1) + '.xml', CT + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + freeze + cols + '<sheetData>' + body + '</sheetData></worksheet>']);
      relId++;
      wbSheets += '<sheet name="' + xmlEsc(sname.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + relId + '"/>';
      wbRels += '<Relationship Id="rId' + relId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      overrides += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    });
    relId++;
    wbRels += '<Relationship Id="rId' + relId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
    return zipCreate([
      ['[Content_Types].xml', CT + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + overrides + '</Types>'],
      ['_rels/.rels', CT + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', CT + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + wbSheets + '</sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', CT + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + wbRels + '</Relationships>'],
      ['xl/styles.xml', CT + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ].concat(sheetXmls));
  }

  /** Simpan hasil ke savePath (tanpa dialog) atau ke folder sementara lalu buka lembar Bagikan ("Simpan ke Files"). */
  async function deliver(bytes, name, savePath) {
    if (savePath) { var p = expand(savePath); await writeBytes(p, bytes); return p; }
    var t = await tempPath(name);
    await writeBytes(t, bytes);
    await nx('app.share', { path: t, name: name });
    return t;
  }

  // ================================================================ sistem berkas (kontrak desktop di atas primitif native)
  var HEAVY = { node_modules: 1, '.git': 1, '.next': 1, dist: 1, build: 1, '.cache': 1, Pods: 1, DerivedData: 1, '.gradle': 1, vendor: 1 };
  var collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  async function listDir(path) { return ((await nx('fs.listDir', { path: path })).entries || []).sort(function (a, b) { return collator.compare(a.name, b.name); }); }

  async function walk(root, opts, visit) {
    var maxDepth = opts.depth || 8, hidden = !!opts.hidden, stop = false;
    async function go(dir, rel, depth) {
      if (stop) return;
      var names;
      try { names = await listDir(dir); } catch (e) { return; }
      for (var i = 0; i < names.length && !stop; i++) {
        var d = names[i];
        if (!hidden && d.name.charAt(0) === '.' && ['.env.example', '.gitignore', '.github'].indexOf(d.name) < 0) continue;
        var relPath = rel ? rel + '/' + d.name : d.name;
        if ((await visit(d, relPath, depth, dir + '/' + d.name)) === false) { stop = true; return; }
        if (d.dir && !HEAVY[d.name] && depth < maxDepth) await go(dir + '/' + d.name, relPath, depth + 1);
      }
    }
    await go(root, '', 1);
  }

  /** Sama dengan desktop/lib/files.js: **, *, ?, {a,b}, [abc]. */
  function globRegex(pattern) {
    var rx = '^', i = 0, inBrace = 0, c = Array.from(String(pattern));
    while (i < c.length) {
      var ch = c[i];
      if (ch === '*') {
        if (c[i + 1] === '*') { if (c[i + 2] === '/') { rx += '(?:.*/)?'; i += 3; continue; } rx += '.*'; i += 2; continue; }
        rx += '[^/]*';
      } else if (ch === '?') rx += '[^/]';
      else if (ch === '{') { rx += '(?:'; inBrace++; }
      else if (ch === '}') { rx += inBrace > 0 ? ')' : '\\}'; inBrace = Math.max(0, inBrace - 1); }
      else if (ch === ',') rx += inBrace > 0 ? '|' : ',';
      else if (ch === '[') {
        var close = c.indexOf(']', i + 1);
        if (close > 0) { var cls = c.slice(i + 1, close).join(''); if (cls.charAt(0) === '!') cls = '^' + cls.slice(1); rx += '[' + cls + ']'; i = close + 1; continue; }
        rx += '\\[';
      } else if ('.()+|^$\\'.indexOf(ch) >= 0) rx += '\\' + ch;
      else rx += ch;
      i++;
    }
    try { return new RegExp(rx + '$'); } catch (e) { return null; }
  }

  var FS = {
    'fs.read': async function (p) {
      var f = expand(p.path);
      var st = await nx('fs.stat', { path: f });
      if (!st.exists) throw new Error('File tidak ditemukan: ' + f);
      if (st.isDir) throw new Error('Path adalah folder, bukan file: ' + f);
      var max = p.maxBytes || 4000000;
      var r = await readBytes(f, Math.min(max, st.size));
      var bin = isBinary(r.bytes);
      var out = { path: f, size: st.size, truncated: st.size > max, binary: bin, mtime: st.mtime };
      if (p.base64) out.base64 = bytesToB64(r.bytes); else if (!bin) out.content = decodeText(r.bytes).text;
      return out;
    },
    'fs.write': async function (p) {
      if (!p.path || typeof p.content !== 'string') throw new Error('path dan content wajib diisi');
      var f = expand(p.path);
      var existed = (await nx('fs.stat', { path: f })).exists;
      var data = utf8(p.content);
      await writeBytes(f, data);
      return { path: f, created: !existed, bytes: data.length };
    },
    'fs.stat': function (p) { return p.path ? nx('fs.stat', { path: expand(p.path) }) : Promise.resolve({ exists: false }); },
    'fs.list': async function (p) {
      var root = expand(p.path), limit = p.limit || 400, entries = [], truncated = false;
      var st = await nx('fs.stat', { path: root });
      if (!st.exists || !st.isDir) throw new Error('Folder tidak ditemukan: ' + root);
      await walk(root, { depth: Math.max(1, Math.min(p.depth || 2, 8)), hidden: p.hidden }, function (d, rel, depth) {
        if (entries.length >= limit) { truncated = true; return false; }
        var e = { path: rel, dir: !!d.dir, depth: depth };
        if (d.dir && HEAVY[d.name]) e.skipped = true;
        if (!d.dir) e.size = d.size || 0;
        entries.push(e);
      });
      return { root: root, entries: entries, truncated: truncated };
    },
    'fs.glob': async function (p) {
      if (!p.root || !p.pattern) throw new Error('root dan pattern wajib diisi');
      var root = expand(p.root), limit = p.limit || 200, pat = String(p.pattern).replace(/\\/g, '/');
      if (pat.indexOf('./') === 0) pat = pat.slice(2);
      var matchBase = pat.indexOf('/') < 0, rx = globRegex(pat), results = [];
      if (!rx) throw new Error('Pola glob tidak valid');
      if (!(await nx('fs.stat', { path: root })).exists) throw new Error('Folder tidak ditemukan: ' + root);
      await walk(root, { depth: 30, hidden: true }, function (d, rel) { if (!d.dir && rx.test(matchBase ? d.name : rel)) results.push([rel, d.mtime || 0]); });
      results.sort(function (a, b) { return b[1] - a[1]; });
      return { root: root, files: results.slice(0, limit).map(function (r) { return r[0]; }), total: results.length, truncated: results.length > limit };
    },
    'fs.grep': async function (p) {
      if (!p.pattern) throw new Error('pattern wajib diisi');
      var root = expand(p.path || p.root || info.home), rx;
      try { rx = new RegExp(p.pattern, p.ignore_case ? 'i' : ''); } catch (e) { throw new Error('Regex tidak valid: ' + e.message); }
      var inc = p.include ? globRegex(String(p.include)) : null, ctx = Math.max(0, Math.min(5, p.context | 0)), filesOnly = p.output_mode === 'files';
      var files = [], out = [], lines = 0;
      var st = await nx('fs.stat', { path: root });
      if (st.exists && !st.isDir) files.push([root, basename(root), st.size]);
      else if (st.exists) await walk(root, { depth: 30, hidden: true }, function (d, rel, depth, abs) { if (!d.dir && (!inc || inc.test(d.name))) files.push([abs, d.name, d.size || 0]); });
      for (var i = 0; i < files.length && lines < 400; i++) {
        if (files[i][2] > 4000000) continue;
        var r;
        try { r = await readBytes(files[i][0], 4000000); } catch (e) { continue; }
        if (isBinary(r.bytes)) continue;
        var text = decodeText(r.bytes).text.split(/\r?\n/), hits = 0;
        for (var n = 0; n < text.length; n++) {
          if (!rx.test(text[n])) continue;
          hits++;
          if (filesOnly) { out.push(files[i][0]); lines++; break; }
          var a = Math.max(0, n - ctx), b = Math.min(text.length - 1, n + ctx);
          for (var k = a; k <= b; k++) { out.push(files[i][0] + (k === n ? ':' : '-') + (k + 1) + (k === n ? ':' : '-') + text[k].slice(0, 400)); lines++; }
          if (ctx) out.push('--');
          if (hits >= 100 || lines >= 400) break;
        }
      }
      return { code: out.length ? 0 : 1, stdout: out.join('\n') + (out.length ? '\n' : ''), stderr: '' };
    },
    'fs.mkdir': function (p) { return nx('fs.mkdir', { path: expand(p.path) }).then(function () { return { path: expand(p.path) }; }); },
    'fs.trash': function (p) {
      var f = expand(p.path);
      if (f === info.home || f === '/' || f === info.supportDir) return fail('Menolak menghapus path ini');
      return nx('fs.remove', { path: f }).then(function () { return { path: f, trashedTo: 'dihapus' }; });
    },
    'fs.move': async function (p) {
      if (!p.from || !p.to) throw new Error('from dan to wajib diisi');
      var to = expand(p.to);
      if ((await nx('fs.stat', { path: to })).exists) throw new Error('Tujuan sudah ada: ' + to);
      await nx('fs.move', { from: expand(p.from), to: to });
      return { from: expand(p.from), to: to };
    },
  };

  // ================================================================ peta metode desktop → ponsel
  var H = {
    'app.info': async function () {
      var i = await nx('app.info');
      info = i;
      if (i.osFamily !== 'android' && i.osFamily !== 'ios') return i;   // harness uji tampilan desktop
      i.features = {
        mobile: true, code: false, shell: false, mcpStdio: false, dictation: false, transcribe: false, recordAudio: false, recordScreen: false,
        recordSystemAudio: false, camera: false, screenshotArea: false, quicklook: false, integrations: false, share: true, ocr: false, glass: false,
        adminCommands: false, watchFolders: false, webhook: false, terminal: false,
      };
      i.shell = ''; i.shellName = ''; i.posixShell = false; i.path = '';
      i.macos = i.os;
      return i;
    },
    'app.setDragRegions': function () { return true; },
    'app.setGlass': function () { return true; },
    'app.attention': function () { return true; },
    'app.quit': function () { return true; },
    'app.reveal': function (p) { return nx('app.share', { path: expand(p.path) }).then(function () { return true; }); },
    'app.openPath': function (p) { return nx('app.open', { path: expand(p.path) }).then(function () { return true; }); },
    'app.quicklook': function (p) { var l = p.paths || [p.path]; return nx('app.open', { path: expand(l[0]) }).then(function () { return true; }); },
    'app.openTerminal': NOT_MOBILE('Terminal'),
    'app.preview': async function (p) {
      var url = await H['preview.put']({ key: p.key || 'win-' + uid(), html: p.html || '' });
      showPreview(url, p.title || 'Pratinjau');
      return true;
    },
    'preview.put': function (p) { return nx('preview.put', { key: p.key || uid(), html: previewHtml(p.html) }); },
    'preview.export': async function (p) {
      var name = (p.name || 'artifact').replace(/[\\/:*?"<>|]/g, '_');
      var fmt = String(p.format || 'png').toLowerCase();
      var out = p.outPath ? expand(p.outPath) : await tempPath(name + '.' + (fmt === 'pdf' ? 'pdf' : fmt === 'jpeg' || fmt === 'jpg' ? 'jpg' : 'png'));
      await nx('render', { html: previewHtml(p.html), format: fmt === 'pdf' ? 'pdf' : 'png', width: p.width || 1280, pageHeight: p.pageHeight || 720, pages: p.pages || 0, outPath: out });
      if (!p.outPath) await nx('app.share', { path: out });
      return out;
    },
    'pdf.fromHTML': async function (p) {
      var out = p.outPath ? expand(p.outPath) : await tempPath('dokumen.pdf');
      await nx('render', { html: String(p.html || ''), format: 'pdf', paper: p.paper || 'a4', landscape: !!p.landscape, outPath: out });
      return out;
    },
    'export.print': async function (p) {
      var out = await tempPath((p.name || 'cetak') + '.pdf');
      await nx('render', { html: String(p.html || ''), format: 'pdf', paper: 'a4', outPath: out });
      await nx('app.share', { path: out });
      return true;
    },

    // berkas
    'file.info': async function (p) {
      var f = expand(p.path), st = await nx('fs.stat', { path: f });
      if (!st.exists) throw new Error('File tidak ditemukan: ' + f);
      var ext = extOf(f), isText = false;
      if (!st.isDir) {
        var head = (await readBytes(f, 8192)).bytes;
        if (head.length >= 2 && ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff))) isText = true;
        else if (!isBinary(head)) { try { new TextDecoder('utf-8', { fatal: true }).decode(head.length === 8192 ? head.subarray(0, 8188) : head); isText = true; } catch (e) { isText = head.length < 8192; } }
      }
      return { path: f, name: basename(f), ext: ext, isDir: !!st.isDir, isPackage: false, size: st.size, uti: '', kind: KIND[ext] || (ext ? 'File ' + ext.toUpperCase() : 'File'), isText: isText };
    },
    'file.text': async function (p) {
      var max = p.maxBytes || 2000000;
      var r = await readBytes(p.path, max);
      var d = decodeText(r.bytes);
      return { text: d.text, truncated: r.bytes.length >= max, encoding: d.encoding };
    },
    'file.prepare': async function (p) {
      var f = expand(p.path);
      if (!(await nx('fs.stat', { path: f })).exists) throw new Error('File tidak ditemukan: ' + f);
      return { requested: f, path: f };
    },
    'fs.writeTemp': async function (p) {
      if (!p.base64) throw new Error('data tidak valid');
      var t = await tempPath(p.name || 'file');
      await nx('fs.writeBytes', { path: t, base64: p.base64 });
      return { path: t };
    },
    'clipboard.files': function () { return []; },
    'doc.extractText': extractText,
    'zip.list': async function (p) { return { entries: zipEntries(await zipFile(p.path)).map(function (e) { return e.name; }) }; },
    'zip.read': async function (p) {
      if (!p.entry) throw new Error('entry wajib diisi');
      var b = await zipFile(p.path), e = zipEntries(b).find(function (x) { return x.name === p.entry; });
      if (!e) return p.base64 ? { base64: '', size: 0 } : { text: '', size: 0 };
      var data = await zipReadEntry(b, e), d = data.subarray(0, p.maxBytes || 20000000);
      return p.base64 ? { base64: bytesToB64(d), size: data.length } : { text: decodeText(d).text, size: data.length };
    },
    'archive.list': async function (p) {
      if (extOf(p.path) !== 'zip') throw new Error('Di ponsel hanya arsip ZIP yang bisa dibuka.');
      var list = zipEntries(await zipFile(p.path));
      return { entries: list.map(function (e) { return { name: e.name, size: e.usize, dir: /\/$/.test(e.name) }; }), encrypted: false, format: 'zip' };
    },
    'archive.extract': NOT_MOBILE('Ekstrak arsip'),
    'archive.clean': function () { return true; },
    'image.prepare': async function (p) { return worker('imagePrepare', Object.assign(await src(p), { maxDim: p.maxDim || 1600, png: !!p.png })); },
    'image.meta': async function (p) { return worker('imageMeta', await src(p)); },
    'image.ocr': function () { return { text: '' }; },
    'image.analyze': function () { return { unsupported: true }; },
    'audio.classify': function () { return { unsupported: true }; },
    'file.thumbnail': async function (p) {
      var e = extOf(p.path), s = await src(p), size = p.size || 1200;
      if (e === 'pdf') return worker('pdfThumb', Object.assign(s, { size: size }));
      if (/^(mp4|m4v|mov|webm|mkv|ogv)$/.test(e)) return worker('videoThumb', Object.assign(s, { size: size }));
      try { return await worker('imagePrepare', Object.assign(s, { maxDim: size, png: true })); } catch (er) { throw new Error('Pratinjau tidak tersedia untuk file ini'); }
    },
    'pdf.read': async function (p) {
      var r = await worker('pdfRead', Object.assign(await src(p), { password: p.password, maxPages: p.maxPages || 400, images: p.images | 0, ocrImages: false }));
      delete r.ocrImages;
      return r;
    },
    'media.info': async function (p) { return worker('mediaInfo', Object.assign(await src(p), { frames: p.frames | 0 })); },
    'audio.stats': async function (p) { return worker('audioStats', Object.assign(await src(p), { maxSeconds: p.maxSeconds })); },
    'media.transcribe': NOT_MOBILE('Transkripsi suara'),
    'media.transcribeLong': NOT_MOBILE('Transkripsi suara'),
    'video.make': async function (p) {
      if (!p.outPath) throw new Error('outPath wajib diisi');
      var fmt = await worker('videoFormat');
      if (!fmt.mime) throw new Error('Perekam video tidak tersedia di perangkat ini');
      var out = expand(p.outPath).replace(/\.mp4$/i, '.' + fmt.ext);
      var token = uid();
      tokens.set(token, { path: out, onProgress: function (f) { emitPage('video.progress', { job: p.job || 'video', progress: f }); } });
      try {
        var frames = [];
        for (var i = 0; i < (p.frames || []).length; i++) { var f = p.frames[i]; frames.push(Object.assign({}, f, { url: await nx('file.url', { path: expand(f.path) }) })); }
        var r = await worker('videoMake', { frames: frames, width: p.width || 1280, height: p.height || 720, fps: p.fps || 30, fade: p.fade || 0.6, token: token });
        r.path = out;
        return r;
      } finally { tokens.delete(token); }
    },

    // dialog & bagikan
    'dialog.openFiles': function (p) { return nx('dialog.openFiles', { multiple: p.multiple !== false }); },
    'dialog.openFolder': function () { return null; },
    'dialog.save': async function (p) {
      var t = await tempPath(p.name || 'export.md');
      await writeBytes(t, utf8(p.content));
      await nx('app.share', { path: t, name: p.name });
      return t;
    },
    'file.saveAs': function (p) { return nx('app.share', { path: expand(p.path), name: p.name }).then(function () { return expand(p.path); }); },
    'export.share': async function (p) {
      if (p.path) return nx('app.share', { path: expand(p.path) });
      return nx('app.share', { text: String(p.text || '') });
    },

    // ekspor
    'export.document': async function (p) {
      var format = String(p.format || 'docx').toLowerCase(), html = String(p.html || ''), name = p.name || 'dokumen', data;
      switch (format) {
        case 'docx': data = await docx(html, name); break;
        case 'odt': data = await odt(html, name); break;
        case 'rtf': var r = await worker('htmlToRtf', { html: html }); data = new Uint8Array(Array.prototype.map.call(r.rtf, function (c) { return c.charCodeAt(0) & 0xff; })); break;
        case 'doc': data = utf8(wordHtml(html)); break;
        case 'html': data = utf8(html); break;
        case 'txt': data = utf8((await worker('htmlToText', { html: html })).text); break;
        case 'pdf': var out = p.savePath ? expand(p.savePath) : await tempPath(name + '.pdf'); await nx('render', { html: html, format: 'pdf', paper: 'a4', outPath: out }); if (!p.savePath) await nx('app.share', { path: out }); return out;
        default: throw new Error('Format dokumen tidak didukung di ponsel: ' + format + '. Pilih DOCX, DOC, ODT, RTF, PDF, HTML, atau TXT.');
      }
      return deliver(data, name + '.' + format, p.savePath);
    },
    'export.spreadsheet': async function (p) {
      var format = String(p.format || 'xlsx').toLowerCase(), name = p.name || 'data';
      var sheets = Array.isArray(p.sheets) ? p.sheets : [];
      if (!sheets.length && p.rows) sheets = [{ name: 'Sheet1', rows: p.rows }];
      if (!sheets.length) throw new Error('Tidak ada data untuk diekspor');
      if (format === 'csv' || format === 'tsv') {
        var sep = format === 'tsv' ? '\t' : ',';
        var text = (sheets[0].rows || []).map(function (row) { return row.map(function (c) { var v = c == null ? '' : String(c); return format === 'csv' && /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(sep); }).join('\r\n');
        return deliver(utf8('﻿' + text), name + '.' + format, p.savePath);
      }
      if (format !== 'xlsx') throw new Error('Format spreadsheet tidak didukung: ' + format);
      return deliver(await xlsx(sheets), name + '.xlsx', p.savePath);
    },
    'export.slides': NOT_MOBILE('Ekspor slide langsung'),
    'export.zip': async function (p) {
      var items = Array.isArray(p.files) ? p.files : [];
      if (!items.length) throw new Error('Tidak ada file untuk diarsipkan');
      var used = {}, entries = [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i], en = String(it.name || 'file-' + i).replace(/\.\./g, '_').replace(/\\/g, '/');
        while (used[en]) en = i + '-' + en;
        used[en] = 1;
        if (it.path) entries.push([en, (await readBytes(it.path, 500 * 1048576)).bytes]);
        else if (it.base64) entries.push([en, b64ToBytes(it.base64)]);
        else if (it.content != null) entries.push([en, String(it.content)]);
      }
      return deliver(await zipCreate(entries), (p.name || 'sinai-ekspor') + '.' + String(p.ext || 'zip').replace(/[^a-z0-9]/gi, ''), p.savePath);
    },
    'export.image': async function (p) {
      var format = String(p.format || 'jpeg').toLowerCase();
      if (format === 'heic' || format === 'gif' || format === 'pdf') throw new Error('Format gambar ' + format.toUpperCase() + ' tidak didukung di ponsel. Pilih JPEG, PNG, WebP, TIFF, atau BMP.');
      var r = await worker('convertImage', Object.assign(await src(p), { format: format, quality: p.quality }));
      return deliver(b64ToBytes(r.base64), (p.name || 'gambar') + '.' + r.ext, p.savePath);
    },
    'pdf.edit': NOT_MOBILE('Edit PDF'),
    'backup.create': NOT_MOBILE('Backup ke .zip'),

    // tidak ada di ponsel
    'exec.start': NOT_MOBILE('Perintah shell'),
    'exec.sync': NOT_MOBILE('Perintah shell'),
    'exec.kill': function () { return true; }, 'exec.write': function () { return true; }, 'exec.closeInput': function () { return true; },
    'exec.resize': function () { return true; }, 'exec.interrupt': function () { return true; },
    'mcp.start': NOT_MOBILE('Konektor lokal (stdio) — pakai konektor remote (URL https)'),
    'mcp.send': NOT_MOBILE('Konektor lokal (stdio)'),
    'mcp.stop': function () { return true; },
    'dictation.start': NOT_MOBILE('Dikte suara'), 'dictation.stop': function () { return { text: '' }; },
    'record.start': NOT_MOBILE('Rekam layar/audio'), 'record.stop': function () { return null; },
    'screen.shot': NOT_MOBILE('Tangkapan layar'), 'window.snapshot': NOT_MOBILE('Tangkapan jendela'), 'camera.open': NOT_MOBILE('Kamera'),
    'watch.start': NOT_MOBILE('Pantau folder'), 'watch.stop': function () { return true; },
    'webhook.start': NOT_MOBILE('Webhook lokal'), 'webhook.stop': function () { return true; },
    'oauth.listen': NOT_MOBILE('Login loopback'),
    'net.scanDev': function () { return []; }, 'net.cookies': function () { return []; }, 'net.clearCookies': function () { return true; },
    'net.upload': NOT_MOBILE('Unggah berkas langsung'),
    'ws.connect': NOT_MOBILE('WebSocket'), 'ws.send': NOT_MOBILE('WebSocket'), 'ws.close': function () { return true; },
    'pim.status': function () { return 'unavailable'; }, 'pim.request': function () { return false; },
    'contacts.search': NOT_MOBILE('Akses Kontak'), 'contacts.create': NOT_MOBILE('Akses Kontak'),
    'calendar.list': NOT_MOBILE('Akses Kalender'), 'calendar.create': NOT_MOBILE('Akses Kalender'),
    'reminders.list': NOT_MOBILE('Akses Pengingat'), 'reminders.create': NOT_MOBILE('Akses Pengingat'),
    'photos.recent': NOT_MOBILE('Akses Foto'), 'photos.export': NOT_MOBILE('Akses Foto'), 'photos.save': NOT_MOBILE('Akses Foto'),
    'apple.script': NOT_MOBILE('Integrasi Mail/Messages/Notes'),
    'shortcuts.list': function () { return []; }, 'shortcuts.run': NOT_MOBILE('Shortcuts'),
  };
  Object.keys(FS).forEach(function (k) { H[k] = FS[k]; });
  // Diteruskan apa adanya: app.openURL, app.copy, app.setAppearance, app.pendingOpens, store.*, secret.*,
  // http.*, oauth.start, preview.file, notify.show, update.*.

  /** HTML pratinjau: di Android skema sinai-preview:// diganti asal https pratinjau. */
  function previewHtml(html) {
    html = String(html || '');
    return info && info.previewBase ? html.replace(/sinai-preview:\/\//g, info.previewBase) : html;
  }

  /** Pratinjau layar penuh (pengganti jendela terpisah di desktop). */
  function showPreview(url, title) {
    var old = document.getElementById('gx-mobile-preview');
    if (old) old.remove();
    var box = document.createElement('div');
    box.id = 'gx-mobile-preview';
    box.className = 'mobile-preview';
    var bar = document.createElement('div');
    bar.className = 'mp-bar';
    var t = document.createElement('b');
    t.textContent = title;
    var close = document.createElement('button');
    close.className = 'btn sm';
    close.textContent = 'Tutup';
    close.onclick = function () { box.remove(); };
    bar.appendChild(t);
    bar.appendChild(close);
    var frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox');
    frame.src = url + '?t=' + Date.now();
    box.appendChild(bar);
    box.appendChild(frame);
    document.body.appendChild(box);
  }

  // ================================================================ titik masuk untuk js/native.js
  window.__gxHost = {
    postMessage: function (msg) {
      if (!msg || typeof msg.id !== 'string' || typeof msg.method !== 'string') return;
      var fn = H[msg.method];
      var run = fn ? function () { return fn(msg.params || {}); } : function () { return nx(msg.method, msg.params || {}); };
      var ready = info || msg.method === 'app.info' ? Promise.resolve() : H['app.info']();
      ready.then(run).then(function (v) { window.__gx.resolve(msg.id, { v: v === undefined ? null : v }); },
        function (e) { window.__gx.reject(msg.id, (e && e.message) || String(e || 'Kesalahan')); });
    },
  };

  // Tombol Kembali Android: tutup lapisan teratas → sidebar → panel; selain itu biarkan sistem (ke latar belakang).
  onNative('app.back', function () {
    var handled = false;
    var prev = document.getElementById('gx-mobile-preview');
    if (prev) { prev.remove(); handled = true; }
    else if (window.UI && UI.closeTopOverlay && UI.closeTopOverlay()) handled = true;
    else {
      var app = document.getElementById('app');
      if (app && app.classList.contains('m-drawer')) { app.classList.remove('m-drawer'); handled = true; }
      else { var panel = document.getElementById('panel'); if (panel && !panel.hidden && window.Panel && Panel.toggle) { Panel.toggle(); handled = true; } }
    }
    if (!handled) nx('app.background').catch(function () {});
  });

  window.SinaiMobile = { nx: nx, on: onNative, zipCreate: zipCreate, zipEntries: zipEntries, zipReadEntry: zipReadEntry, extractText: extractText, globRegex: globRegex, decodeText: decodeText, H: H };
})();
