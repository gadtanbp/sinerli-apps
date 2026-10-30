/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Design templates: the user's own PowerPoint / Word / PDF / image / HTML /
   style-guide files become reusable templates. PowerPoint and Word templates
   are used for real — new decks/documents are written INTO a copy of the
   template (its masters, layouts, theme, headers, logos stay intact). Other
   templates contribute colours, fonts and a written style guide that steers
   PDFs, UI/web designs and images. */
(function () {
  'use strict';

  function dir() { return Store.info.supportDir + '/templates'; }
  function list() { return Store.settings.templates || []; }
  /* By id or name; with several of the same name, the one matching `kind` wins. */
  function get(id, kind) {
    var key = String(id || '').toLowerCase();
    var hits = list().filter(function (t) { return t.id === id || (t.name || '').toLowerCase() === key; });
    return hits.find(function (t) { return kind && t.kind === kind; }) || hits[0] || null;
  }
  function save(t) {
    var l = list().filter(function (x) { return x.id !== t.id; }).concat([t]);
    Store.setSetting('templates', l);
  }
  async function remove(id) {
    var t = get(id);
    Store.setSetting('templates', list().filter(function (x) { return x.id !== id; }));
    if (t && t.file) { try { await Native.call('fs.trash', { path: t.file.replace(/\/[^/]+$/, '') }); } catch (e) { /* gone */ } }
  }

  var KIND_LABEL = { presentation: 'Presentasi', document: 'Dokumen', ui: 'UI / Web', image: 'Gambar & sosmed', any: 'Semua desain' };

  // ---------------------------------------------------------------- zip helpers

  function zEntry(name) { return U.isMac() ? name.replace(/[\[\]*?\\]/g, '\\$&') : name; }
  async function zText(path, entry) { try { return (await Native.call('zip.read', { path: path, entry: zEntry(entry) })).text || ''; } catch (e) { return ''; } }
  async function zList(path) { try { return (await Native.call('zip.list', { path: path })).entries || []; } catch (e) { return []; } }

  function xmlAttr(xml, re) { var m = re.exec(xml); return m ? m[1] : ''; }
  function themeOf(xml) {
    if (!xml) return null;
    function clr(tag) {
      var m = new RegExp('<a:' + tag + '>([\\s\\S]*?)</a:' + tag + '>').exec(xml);
      if (!m) return '';
      return xmlAttr(m[1], /srgbClr val="([0-9A-Fa-f]{6})"/) || xmlAttr(m[1], /lastClr="([0-9A-Fa-f]{6})"/);
    }
    var t = { dk1: clr('dk1'), lt1: clr('lt1'), dk2: clr('dk2'), lt2: clr('lt2'), accent1: clr('accent1'), accent2: clr('accent2'), accent3: clr('accent3') };
    var major = /<a:majorFont>[\s\S]*?<a:latin typeface="([^"]*)"/.exec(xml), minor = /<a:minorFont>[\s\S]*?<a:latin typeface="([^"]*)"/.exec(xml);
    return {
      colors: { bg: t.lt1 || 'FFFFFF', text: t.dk1 || '1B1C2B', muted: t.dk2 || '5B6080', surface: t.lt2 || 'F3F4FB', accent: t.accent1 || '4F46E5', accent2: t.accent2 || t.accent3 || '06B6D4' },
      fonts: { head: major ? major[1] : '', body: minor ? minor[1] : '' },
    };
  }

  // ---------------------------------------------------------------- import

  async function importFile(path) {
    var ext = (path.split('.').pop() || '').toLowerCase();
    var name = U.basename(path).replace(/\.[^.]+$/, '');
    var id = U.uid('tpl_');
    var folder = dir() + '/' + id;
    await Native.call('fs.mkdir', { path: folder });
    var file = folder + '/' + U.basename(path);
    var b = await Native.call('fs.read', { path: path, base64: true, maxBytes: 80000000 });
    var tmp = await Native.call('fs.writeTemp', { base64: b.base64 || '', name: U.basename(path) });
    await Native.call('fs.move', { from: tmp.path, to: file });
    var t = { id: id, name: name, ext: ext, file: file, createdAt: Date.now(), colors: null, fonts: null, notes: '', kind: 'any' };
    if (/^(pptx|potx|pptm)$/.test(ext)) {
      t.kind = 'presentation';
      var th = themeOf(await zText(file, 'ppt/theme/theme1.xml'));
      if (th) { t.colors = th.colors; t.fonts = th.fonts; }
      var entries = await zList(file);
      var layouts = [];
      for (var i = 0; i < entries.length; i++) {
        if (!/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(entries[i])) continue;
        var lx = await zText(file, entries[i]);
        layouts.push({ entry: entries[i], name: xmlAttr(lx, /<p:cSld name="([^"]*)"/), type: xmlAttr(lx, /<p:sldLayout[^>]*\stype="([^"]*)"/) });
      }
      t.layouts = layouts;
      t.slides = entries.filter(function (e) { return /^ppt\/slides\/slide\d+\.xml$/.test(e); }).length;
    } else if (/^(docx|dotx|docm)$/.test(ext)) {
      t.kind = 'document';
      var dt = themeOf(await zText(file, 'word/theme/theme1.xml'));
      if (dt) { t.colors = dt.colors; t.fonts = dt.fonts; }
      var styles = await zText(file, 'word/styles.xml');
      t.styleIds = {};
      (styles.match(/<w:style [^>]*w:styleId="[^"]+"[^>]*>[\s\S]*?<\/w:style>/g) || []).forEach(function (st) {
        var sid = xmlAttr(st, /w:styleId="([^"]+)"/), nm = xmlAttr(st, /<w:name w:val="([^"]+)"/).toLowerCase();
        if (nm) t.styleIds[nm] = sid;
      });
    } else if (/^(html?|css)$/.test(ext)) {
      t.kind = 'ui';
      var src = (await Native.call('fs.read', { path: file, maxBytes: 2000000 })).content || '';
      t.colors = cssColors(src);
      var ff = /font-family\s*:\s*([^;}{]+)/i.exec(src);
      t.fonts = { head: ff ? ff[1].split(',')[0].replace(/["']/g, '').trim() : '', body: ff ? ff[1].split(',')[0].replace(/["']/g, '').trim() : '' };
      t.notes = 'Referensi kode (CSS variables & gaya utama):\n' + (src.match(/--[\w-]+\s*:[^;]+;/g) || []).slice(0, 40).join('\n');
    } else if (/^(md|txt)$/.test(ext)) {
      t.notes = (await Native.call('fs.read', { path: file, maxBytes: 200000 })).content || '';
    } else {
      t.kind = ext === 'pdf' ? 'document' : 'image';
    }
    // Thumbnail + visual analysis for everything that has a look.
    try {
      var thumb = await Native.call('file.thumbnail', { path: file, size: 640 });
      if (thumb && thumb.data) {
        t.thumb = 'data:' + (thumb.mime || 'image/png') + ';base64,' + thumb.data;
        var a = await Native.call('image.analyze', { base64: thumb.data }).catch(function () { return null; });
        if (!t.colors && a && a.colors && a.colors.length) {
          var hexes = a.colors.map(function (c) { return c.slice(1, 7); });
          t.colors = { bg: hexes[0], text: pickDark(hexes) || '1B1C2B', accent: pickVivid(hexes) || hexes[1] || '4F46E5', accent2: hexes[2] || hexes[1] || '06B6D4', surface: hexes[0], muted: '5B6080' };
        }
      }
    } catch (e) { /* no preview */ }
    t.notes = (t.notes ? t.notes + '\n\n' : '') + await styleGuide(t).catch(function () { return ''; });
    save(t);
    return t;
  }

  function lum(h) { var n = parseInt(h, 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; }
  function sat(h) { var n = parseInt(h, 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (Math.max(r, g, b) - Math.min(r, g, b)) / 255; }
  function pickDark(hs) { return hs.filter(function (h) { return lum(h) < 0.3; })[0]; }
  function pickVivid(hs) { return hs.slice().sort(function (a, b) { return sat(b) - sat(a); })[0]; }
  function cssColors(src) {
    var count = {};
    (src.match(/#[0-9a-fA-F]{6}\b/g) || []).forEach(function (c) { c = c.slice(1).toUpperCase(); count[c] = (count[c] || 0) + 1; });
    var hs = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; });
    if (!hs.length) return null;
    var light = hs.filter(function (h) { return lum(h) > 0.85; })[0] || 'FFFFFF';
    return { bg: light, surface: hs.filter(function (h) { return lum(h) > 0.75 && h !== light; })[0] || light, text: pickDark(hs) || '1B1C2B', muted: '5B6080', accent: pickVivid(hs) || hs[0], accent2: hs.filter(function (h) { return sat(h) > 0.3; })[1] || hs[1] || hs[0] };
  }

  /* A written style guide (by a vision model when available) so any design follows the template. */
  async function styleGuide(t) {
    var r = window.Perception && Perception.helper();
    if (!r || !t.thumb) return '';
    var res = await Providers.complete(r, 'You are a senior brand designer. Write a compact style guide (max 180 words, bullet points, Indonesian) describing the visual language of this template so another designer can reproduce it: layout & grid, typography (sizes, weights, case), colour usage, shapes/decoration, imagery, tone. No preamble.',
      [{ role: 'user', content: [{ type: 'text', text: 'Template "' + t.name + '" (' + t.ext + '). Colours: ' + JSON.stringify(t.colors || {}) + ', fonts: ' + JSON.stringify(t.fonts || {}) }, { type: 'image', mime: 'image/png', data: t.thumb.split(',')[1], name: t.name }] }],
      { level: 'off', maxTokens: 700 });
    return res.text ? 'Panduan gaya:\n' + res.text.trim() : '';
  }

  // ---------------------------------------------------------------- use: prompt, deck theme, document CSS

  function active(conv) { return conv && conv.templateId ? get(conv.templateId) : null; }

  function promptSection(conv) {
    var l = list();
    if (!l.length) return '';
    var a = active(conv);
    var s = '\n\n# Design templates\nThe user has design templates: ' + l.map(function (t) { return '"' + t.name + '" (' + (KIND_LABEL[t.kind] || t.kind) + ', ' + t.ext + ')'; }).join(', ') +
      '. Pass `template: "<name>"` to create_file to build a presentation/document from one (PowerPoint/Word templates are filled in directly, keeping their masters, logos and styles).';
    if (a) {
      s += '\n\n## ACTIVE template: "' + a.name + '" — apply it to EVERY design, file, UI, web page and image you make in this conversation (unless the user says otherwise).\n' +
        (a.colors ? 'Colours (hex): background #' + a.colors.bg + ', text #' + a.colors.text + ', accent #' + a.colors.accent + ', accent-2 #' + a.colors.accent2 + ', surface #' + a.colors.surface + '\n' : '') +
        (a.fonts && (a.fonts.head || a.fonts.body) ? 'Fonts: headings "' + (a.fonts.head || a.fonts.body) + '", body "' + (a.fonts.body || a.fonts.head) + '"\n' : '') +
        (a.notes ? U.truncateMiddle(a.notes, 3000) : '');
    }
    return s;
  }

  function deckTheme(t) {
    if (!t || !t.colors) return null;
    return { background: t.colors.bg, text: t.colors.text, accent: t.colors.accent, accent2: t.colors.accent2, surface: t.colors.surface, muted: t.colors.muted, fontHead: t.fonts && t.fonts.head, fontBody: t.fonts && t.fonts.body };
  }

  function docCss(t) {
    if (!t) return '';
    var c = t.colors || {}, f = t.fonts || {};
    return (f.body ? 'body{font-family:"' + f.body + '",-apple-system,"Segoe UI",Arial,sans-serif}' : '') +
      (f.head ? 'h1,h2,h3{font-family:"' + f.head + '",-apple-system,"Segoe UI",Arial,sans-serif}' : '') +
      (c.accent ? 'h1{color:#' + c.text + '}h2{color:#' + c.accent + ';border-bottom-color:#' + c.accent + '33}h3{color:#' + c.accent + '}th{background:#' + c.accent + ';color:#fff}blockquote{border-left-color:#' + c.accent + '}a{color:#' + c.accent + '}' : '');
  }

  // ---------------------------------------------------------------- PowerPoint: fill the real template

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function runs(text) {
    // **bold** segments become bold runs.
    return String(text).split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(function (seg) {
      var b = /^\*\*(.+)\*\*$/.exec(seg);
      return '<a:r><a:rPr lang="id-ID" dirty="0"' + (b ? ' b="1"' : '') + '/><a:t>' + esc(b ? b[1] : seg) + '</a:t></a:r>';
    }).join('');
  }

  function chooseLayout(t, kind) {
    var L = t.layouts || [];
    function by(types, names) { return L.find(function (l) { return types.indexOf(l.type) >= 0; }) || L.find(function (l) { return names.test(l.name || ''); }); }
    if (kind === 'title') return by(['title', 'ctrTitle'], /title slide|judul/i) || L[0];
    if (kind === 'section') return by(['secHead'], /section|bagian/i) || by(['title'], /title/i) || L[0];
    if (kind === 'two') return by(['twoObj', 'twoTxTwoObj'], /two content|dua/i) || by(['obj'], /title and content|judul dan konten/i) || L[1] || L[0];
    return by(['obj', 'tx'], /title and content|judul dan konten|content/i) || L[1] || L[0];
  }

  async function pptxFromTemplate(t, markdown) {
    var file = t.file;
    var entries = await zList(file);
    var slides = Deck.parse(markdown);
    var files = [];
    var keep = entries.filter(function (e) { return !/\/$/.test(e) && !/^ppt\/slides\//.test(e) && !/^ppt\/notesSlides\//.test(e) && !/^docProps\/thumbnail/.test(e); });
    for (var i = 0; i < keep.length; i++) {
      var e = keep[i];
      if (e === '[Content_Types].xml' || e === 'ppt/presentation.xml' || e === 'ppt/_rels/presentation.xml.rels') continue;
      if (/\.(xml|rels)$/.test(e)) files.push({ name: e, content: await zText(file, e) });
      else files.push({ name: e, base64: (await Native.call('zip.read', { path: file, entry: zEntry(e), base64: true })).base64 });
    }
    var ct = await zText(file, '[Content_Types].xml');
    var pres = await zText(file, 'ppt/presentation.xml');
    var prels = await zText(file, 'ppt/_rels/presentation.xml.rels');
    // Drop existing slides (and notes) from relationships / content types; .potx → .pptx main type.
    prels = prels.replace(/<Relationship [^>]*Type="[^"]*\/slide"[^>]*\/>/g, '');
    ct = ct.replace(/<Override PartName="\/ppt\/(slides|notesSlides)\/[^"]*"[^>]*\/>/g, '').replace('presentationml.template.main+xml', 'presentationml.presentation.main+xml');
    var ids = '', maxRid = 0;
    (prels.match(/Id="rId(\d+)"/g) || []).forEach(function (x) { maxRid = Math.max(maxRid, +x.replace(/\D/g, '')); });
    var n = slides.length;
    slides.forEach(function (s, i) {
      var kind = i === 0 ? 'title' : (!s.bullets.length && s.paras.length <= 1 && !s.table) ? 'section' : 'content';
      var lay = chooseLayout(t, kind);
      var title = s.title || (i === 0 ? t.name : '');
      var body = [];
      if (kind !== 'content') { if (s.sub) body.push({ text: s.sub, level: 0, plain: true }); }
      else {
        if (s.sub) body.push({ text: s.sub, level: 0, plain: true });
        s.paras.forEach(function (p) { body.push({ text: p, level: 0, plain: true }); });
        s.bullets.forEach(function (b) { body.push({ text: b.text, level: b.level }); });
        s.quote.forEach(function (q) { body.push({ text: '“' + q + '”', level: 0, plain: true }); });
        if (s.table) s.table.forEach(function (r) { body.push({ text: r.join('  ·  '), level: 0, plain: true }); });
        if (s.code) s.code.text.split('\n').slice(0, 14).forEach(function (l) { body.push({ text: l, level: 0, plain: true }); });
      }
      var titlePh = kind === 'title' ? '<p:ph type="ctrTitle"/>' : '<p:ph type="title"/>';
      var bodyPh = kind === 'title' ? '<p:ph type="subTitle" idx="1"/>' : '<p:ph idx="1"/>';
      var sp = '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>' + titlePh + '</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p>' + runs(title) + '</a:p></p:txBody></p:sp>';
      if (body.length) {
        sp += '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>' + bodyPh + '</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr><a:normAutofit/></a:bodyPr><a:lstStyle/>' +
          body.map(function (b) { return '<a:p><a:pPr lvl="' + Math.min(4, b.level || 0) + '"' + (b.plain ? ' marL="0" indent="0"><a:buNone/></a:pPr>' : '/>') + runs(b.text) + '</a:p>'; }).join('') + '</p:txBody></p:sp>';
      }
      var no = i + 1;
      files.push({ name: 'ppt/slides/slide' + no + '.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' + sp + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>' });
      files.push({ name: 'ppt/slides/_rels/slide' + no + '.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/' + U.basename(lay ? lay.entry : 'slideLayout1.xml') + '"/></Relationships>' });
      var rid = 'rId' + (maxRid + no);
      prels = prels.replace('</Relationships>', '<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + no + '.xml"/></Relationships>');
      ct = ct.replace('</Types>', '<Override PartName="/ppt/slides/slide' + no + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>');
      ids += '<p:sldId id="' + (256 + i) + '" r:id="' + rid + '"/>';
    });
    pres = /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>|<p:sldIdLst\/>/.test(pres)
      ? pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>|<p:sldIdLst\/>/, '<p:sldIdLst>' + ids + '</p:sldIdLst>')
      : pres.replace(/(<\/p:sldMasterIdLst>)/, '$1<p:sldIdLst>' + ids + '</p:sldIdLst>');
    pres = pres.replace(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/, function (m) { return m; });
    files.unshift({ name: '[Content_Types].xml', content: ct });
    files.push({ name: 'ppt/presentation.xml', content: pres }, { name: 'ppt/_rels/presentation.xml.rels', content: prels });
    return { files: files, slides: n };
  }

  // ---------------------------------------------------------------- Word: write into the real template

  function wEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function wRuns(text) {
    return String(text).split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/).filter(Boolean).map(function (seg) {
      var b = /^\*\*(.+)\*\*$/.exec(seg), it = /^\*(.+)\*$/.exec(seg), code = /^`(.+)`$/.exec(seg);
      var t = b ? b[1] : it ? it[1] : code ? code[1] : seg.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
      return '<w:r>' + (b || it || code ? '<w:rPr>' + (b ? '<w:b/>' : '') + (it ? '<w:i/>' : '') + (code ? '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>' : '') + '</w:rPr>' : '') + '<w:t xml:space="preserve">' + wEsc(t) + '</w:t></w:r>';
    }).join('');
  }

  function docxBody(t, md) {
    var sid = t.styleIds || {};
    function st(names, fallback) { for (var i = 0; i < names.length; i++) if (sid[names[i]]) return sid[names[i]]; return fallback; }
    var H = [st(['title'], ''), st(['heading 1'], 'Heading1'), st(['heading 2'], 'Heading2'), st(['heading 3'], 'Heading3'), st(['heading 4'], 'Heading4')];
    var LIST = st(['list bullet', 'list paragraph'], ''), NUM = st(['list number', 'list paragraph'], ''), QUOTE = st(['quote', 'intense quote'], '');
    var TABLE = st(['table grid', 'grid table 4 - accent 1', 'light grid accent 1'], '');
    function p(style, inner) { return '<w:p>' + (style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : '') + inner + '</w:p>'; }
    var out = [], lines = String(md || '').replace(/\r/g, '').split('\n'), num = 0, firstH1 = true;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (/^\s*$/.test(l)) { num = 0; continue; }
      var hm = /^(#{1,4})\s+(.*)$/.exec(l);
      if (hm) {
        var lvl = hm[1].length;
        var style = lvl === 1 && firstH1 && H[0] ? H[0] : H[lvl];
        if (lvl === 1) firstH1 = false;
        out.push(p(style, wRuns(hm[2])));
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(l)) {
        var rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
          if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); }));
          i++;
        }
        i--;
        out.push('<w:tbl><w:tblPr>' + (TABLE ? '<w:tblStyle w:val="' + TABLE + '"/>' : '<w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>') + '<w:tblW w:w="5000" w:type="pct"/></w:tblPr>' +
          rows.map(function (r, ri) { return '<w:tr>' + r.map(function (c) { return '<w:tc><w:p>' + (ri === 0 ? wRuns('**' + c.replace(/\*\*/g, '') + '**') : wRuns(c)) + '</w:p></w:tc>'; }).join('') + '</w:tr>'; }).join('') + '</w:tbl>');
        out.push('<w:p/>');
        continue;
      }
      var bm = /^(\s*)[-*+]\s+(.*)$/.exec(l);
      if (bm) { out.push(p(LIST, (LIST && /bullet/i.test(Object.keys(sid).find(function (k) { return sid[k] === LIST; }) || '') ? '' : wRuns('•  ')) + wRuns(bm[2]))); continue; }
      var nm = /^\s*\d+[.)]\s+(.*)$/.exec(l);
      if (nm) { num++; out.push(p(NUM, wRuns(num + '.  ') + wRuns(nm[1]))); continue; }
      var qm = /^\s*>\s?(.*)$/.exec(l);
      if (qm) { out.push(p(QUOTE, wRuns(qm[1]))); continue; }
      out.push(p('', wRuns(l)));
    }
    return out.join('');
  }

  async function docxFromTemplate(t, markdown) {
    var file = t.file;
    var entries = await zList(file);
    var files = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (/\/$/.test(e)) continue;
      if (e === 'word/document.xml') {
        var doc = await zText(file, e);
        // Keep the section properties (page size, margins, headers/footers with logos); replace the body content.
        var sect = (/<w:sectPr[\s\S]*<\/w:sectPr>\s*<\/w:body>/.exec(doc) || [''])[0].replace(/<\/w:body>$/, '');
        doc = doc.replace(/<w:body>[\s\S]*<\/w:body>/, '<w:body>' + docxBody(t, markdown) + sect + '</w:body>');
        files.push({ name: e, content: doc });
      } else if (e === '[Content_Types].xml') {
        files.push({ name: e, content: (await zText(file, e)).replace('wordprocessingml.template.main+xml', 'wordprocessingml.document.main+xml') });
      } else if (/\.(xml|rels)$/.test(e)) files.push({ name: e, content: await zText(file, e) });
      else files.push({ name: e, base64: (await Native.call('zip.read', { path: file, entry: zEntry(e), base64: true })).base64 });
    }
    files.sort(function (a, b) { return a.name === '[Content_Types].xml' ? -1 : b.name === '[Content_Types].xml' ? 1 : 0; });
    return { files: files };
  }

  window.Templates = {
    list: list, get: get, save: save, remove: remove, importFile: importFile, active: active, promptSection: promptSection,
    deckTheme: deckTheme, docCss: docCss, pptxFromTemplate: pptxFromTemplate, docxFromTemplate: docxFromTemplate, styleGuide: styleGuide,
    KIND_LABEL: KIND_LABEL, dir: dir, _test: { themeOf: themeOf, docxBody: docxBody, cssColors: cssColors },
  };
})();
