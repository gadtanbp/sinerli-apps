// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Files the user can keep or send: Office/ODF/RTF documents, spreadsheets and
// slide decks (Open XML), image conversions, archives, PDF editing, backups.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, dialog, shell, clipboard } = require('electron');
const U = require('./util');
const { BridgeError, expand, toPosix, xmlEsc, zipCreate, Env, runSync, support } = U;

/** Saves data to an explicit savePath (no dialog) or through a Save dialog. Returns the path, or null if cancelled. */
async function deliver(data, suggestedName, savePath, parent) {
  if (savePath) {
    const p = expand(savePath);
    require('./files').guardWritable(p);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, data);
    return p;
  }
  const r = await dialog.showSaveDialog(parent, { defaultPath: path.join(app.getPath('documents'), suggestedName) });
  if (r.canceled || !r.filePath) return null;
  await fs.promises.writeFile(r.filePath, data);
  return toPosix(r.filePath);
}

// ---------------------------------------------------------------- documents
const CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function coreXml(title) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return CT + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + xmlEsc(title || '') + '</dc:title><dc:creator>Sinai</dc:creator>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>';
}

async function docx(html, name) {
  const r = await require('./worker').htmlTo('docx', html);
  const files = [
    ['[Content_Types].xml', CT + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'],
    ['_rels/.rels', CT + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
    ['docProps/core.xml', coreXml(r.title || name)],
    ['word/document.xml', r.documentXml],
    ['word/styles.xml', r.stylesXml],
    ['word/numbering.xml', r.numberingXml],
    ['word/_rels/document.xml.rels', r.relsXml],
  ];
  for (const m of r.media) files.push([m.name, Buffer.from(m.base64, 'base64')]);
  return zipCreate(files);
}

async function odt(html, name) {
  const r = await require('./worker').htmlTo('odt', html);
  return zipCreate([
    ['mimetype', 'application/vnd.oasis.opendocument.text'], // must be first and stored
    ['META-INF/manifest.xml', '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/></manifest:manifest>'],
    ['meta.xml', '<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.3"><office:meta><meta:generator>Sinai</meta:generator><dc:title>' + xmlEsc(name || '') + '</dc:title></office:meta></office:document-meta>'],
    ['content.xml', r.content],
    ['styles.xml', r.styles],
  ]);
}

function wordHtml(html) {
  // Word opens HTML saved as .doc; the Office namespaces make it a Word document.
  let s = String(html || '');
  if (!/<html/i.test(s)) s = '<html><head><meta charset="utf-8"></head><body>' + s + '</body></html>';
  return s.replace(/<html([^>]*)>/i, '<html$1 xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">')
    .replace(/<head([^>]*)>/i, '<head$1><meta charset="utf-8"><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->');
}

async function document(p, parent) {
  const format = String(p.format || 'docx').toLowerCase();
  const html = String(p.html || '');
  const name = p.name || 'dokumen';
  let data;
  switch (format) {
    case 'docx': data = await docx(html, name); break;
    case 'odt': data = await odt(html, name); break;
    case 'rtf': data = Buffer.from((await require('./worker').htmlTo('rtf', html)).rtf, 'latin1'); break;
    case 'doc': data = Buffer.from(wordHtml(html), 'utf8'); break;
    case 'html': data = Buffer.from(html, 'utf8'); break;
    case 'txt': data = Buffer.from((await require('./worker').htmlTo('txt', html)).text, 'utf8'); break;
    default: throw new BridgeError('Format dokumen tidak didukung di ' + (process.platform === 'win32' ? 'Windows' : 'Linux') + ': ' + format + '. Pilih DOCX, DOC, ODT, RTF, HTML, atau TXT.');
  }
  return deliver(data, name + '.' + format, p.savePath, parent);
}

// ---------------------------------------------------------------- spreadsheets
function colName(i) {
  let n = i, s = '';
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

async function spreadsheet(p, parent) {
  const format = String(p.format || 'xlsx').toLowerCase();
  const name = p.name || 'data';
  let sheets = Array.isArray(p.sheets) ? p.sheets : [];
  if (!sheets.length && p.rows) sheets = [{ name: 'Sheet1', rows: p.rows }];
  if (!sheets.length) throw new BridgeError('Tidak ada data untuk diekspor');

  if (format === 'csv' || format === 'tsv') {
    const sep = format === 'tsv' ? '\t' : ',';
    const rows = sheets[0].rows || [];
    const text = rows.map((row) => row.map((c) => {
      const v = c == null ? '' : String(c);
      return format === 'csv' && /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(sep)).join('\r\n');
    return deliver(Buffer.from('﻿' + text, 'utf8'), name + '.' + format, p.savePath, parent);
  }
  if (format !== 'xlsx') throw new BridgeError('Format spreadsheet tidak didukung: ' + format);

  const sheetXmls = [];
  let wbSheets = '', wbRels = '', overrides = '', relId = 0;
  sheets.forEach((sheet, i) => {
    const sname = String(sheet.name || 'Sheet' + (i + 1)).replace(/[\[\]*?:/\\]/g, '_');
    const rows = sheet.rows || [];
    const header = sheet.header !== false;
    const widths = [];
    let body = '';
    rows.forEach((row, r) => {
      let cells = '';
      const style = header && r === 0 ? ' s="1"' : '';
      (row || []).forEach((val, c) => {
        const ref = colName(c) + (r + 1);
        let shown;
        if (typeof val === 'number' && isFinite(val)) { cells += '<c r="' + ref + '"' + style + '><v>' + val + '</v></c>'; shown = String(val); }
        else {
          const s = val == null ? '' : String(val);
          shown = s;
          if (s) cells += '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEsc(s) + '</t></is></c>';
        }
        while (widths.length <= c) widths.push(8);
        widths[c] = Math.max(widths[c], Math.min(60, shown.length + 2));
      });
      body += '<row r="' + (r + 1) + '">' + cells + '</row>';
    });
    const cols = widths.length ? '<cols>' + widths.map((w, k) => '<col min="' + (k + 1) + '" max="' + (k + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>' : '';
    const freeze = header && rows.length > 1 ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
    sheetXmls.push(['xl/worksheets/sheet' + (i + 1) + '.xml', CT + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + freeze + cols + '<sheetData>' + body + '</sheetData></worksheet>']);
    relId++;
    wbSheets += '<sheet name="' + xmlEsc(sname.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + relId + '"/>';
    wbRels += '<Relationship Id="rId' + relId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
    overrides += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
  });
  relId++;
  wbRels += '<Relationship Id="rId' + relId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
  const files = [
    ['[Content_Types].xml', CT + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + overrides + '</Types>'],
    ['_rels/.rels', CT + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', CT + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + wbSheets + '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', CT + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + wbRels + '</Relationships>'],
    ['xl/styles.xml', CT + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
  ].concat(sheetXmls);
  return deliver(zipCreate(files), name + '.xlsx', p.savePath, parent);
}

// ---------------------------------------------------------------- slide decks (pptx)
async function slides(p, parent) {
  const name = p.name || 'presentasi';
  const decks = Array.isArray(p.slides) ? p.slides : [];
  if (!decks.length) throw new BridgeError('Tidak ada slide untuk diekspor');
  const W = 12192000, H = 6858000;
  const t = p.theme || {};
  const hex = (v, d) => { const s = String(v || d).replace('#', '').toUpperCase(); return /^[0-9A-F]{6}$/.test(s) ? s : d; };
  const bg = hex(t.background, 'FFFFFF'), fg = hex(t.text, '1E2236'), accent = hex(t.accent, '4F46E5');
  const run = (text, size, bold, color) => '<a:r><a:rPr lang="id-ID" sz="' + size * 100 + '" b="' + (bold ? 1 : 0) + '" dirty="0"><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>' + xmlEsc(text) + '</a:t></a:r>';
  const shape = (id, x, y, w, h, fill, body, anchor) => {
    const fillXml = fill ? '<a:solidFill><a:srgbClr val="' + fill + '"/></a:solidFill>' : '<a:noFill/>';
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="s' + id + '"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + w + '" cy="' + h + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' + fillXml + '<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" rIns="0" anchor="' + (anchor || 't') + '"><a:normAutofit/></a:bodyPr><a:lstStyle/>' + (body || '<a:p/>') + '</p:txBody></p:sp>';
  };
  const items = (s) => {
    if (Array.isArray(s.items)) return s.items.map((it) => [String(it.text == null ? '' : it.text), Math.max(0, Math.min(it.level | 0, 4)), it.bullet !== false]);
    if (Array.isArray(s.bullets)) return s.bullets.map((b) => [String(b), 0, true]);
    if (typeof s.body === 'string') return s.body.split('\n').filter(Boolean).map((l) => [l, 0, false]);
    return [];
  };
  const slideFiles = [], slideRels = [];
  let presSheets = '', presRels = '', overrides = '', relId = 1;
  decks.forEach((s, i) => {
    const n = i + 1;
    const title = String(s.title || '');
    const list = items(s);
    const isCover = i === 0 && (s.cover != null ? !!s.cover : list.length <= 2);
    let shapes = shape(2, 0, 0, W, H, isCover ? accent : bg, '');
    if (isCover) {
      shapes += shape(3, 914400, 2057400, W - 1828800, 1600200, null, '<a:p>' + run(title, 48, true, 'FFFFFF') + '</a:p>', 'b');
      const sub = list.map((x) => x[0]).join('\n');
      if (sub) shapes += shape(4, 914400, 3840480, W - 1828800, 1371600, null, sub.split('\n').filter(Boolean).map((l) => '<a:p>' + run(l, 22, false, 'E8E9FF') + '</a:p>').join(''));
    } else {
      shapes += shape(3, 0, 0, W, 91440, accent, '');
      if (title) shapes += shape(4, 685800, 411480, W - 1371600, 1005840, null, '<a:p>' + run(title, 34, true, fg) + '</a:p>', 'b');
      const paras = list.map(([text, level, bullet]) => {
        const size = Math.max(14, 22 - level * 3);
        const marL = 342900 + level * 457200;
        const bu = bullet ? '<a:buClr><a:srgbClr val="' + accent + '"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="' + (level === 0 ? '•' : '–') + '"/>' : '<a:buNone/>';
        return '<a:p><a:pPr marL="' + (bullet ? marL : level * 457200) + '" indent="' + (bullet ? -342900 : 0) + '"><a:spcBef><a:spcPts val="600"/></a:spcBef>' + bu + '</a:pPr>' + run(text, size, false, fg) + '</a:p>';
      }).join('');
      if (paras) shapes += shape(5, 685800, 1600200, W - 1371600, H - 2286000, null, paras);
      shapes += shape(6, W - 1371600, H - 548640, 914400, 365760, null, '<a:p><a:pPr algn="r"/>' + run(String(n), 12, false, '8A8FA8') + '</a:p>');
    }
    slideFiles.push(['ppt/slides/slide' + n + '.xml', CT + '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' + shapes + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>']);
    slideRels.push(['ppt/slides/_rels/slide' + n + '.xml.rels', CT + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>']);
    relId++;
    presSheets += '<p:sldId id="' + (255 + n) + '" r:id="rId' + relId + '"/>';
    presRels += '<Relationship Id="rId' + relId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + n + '.xml"/>';
    overrides += '<Override PartName="/ppt/slides/slide' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
  });
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const master = CT + '<p:sldMaster ' + NS + '><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>';
  const layout = CT + '<p:sldLayout ' + NS + ' type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
  const theme = CT + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
  const files = [
    ['[Content_Types].xml', CT + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' + overrides + '</Types>'],
    ['_rels/.rels', CT + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'],
    ['ppt/presentation.xml', CT + '<p:presentation ' + NS + '><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>' + presSheets + '</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>'],
    ['ppt/_rels/presentation.xml.rels', CT + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>' + presRels + '</Relationships>'],
    ['ppt/slideMasters/slideMaster1.xml', master],
    ['ppt/slideMasters/_rels/slideMaster1.xml.rels', CT + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>'],
    ['ppt/slideLayouts/slideLayout1.xml', layout],
    ['ppt/slideLayouts/_rels/slideLayout1.xml.rels', CT + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>'],
    ['ppt/theme/theme1.xml', theme],
  ].concat(slideFiles, slideRels);
  return deliver(zipCreate(files), name + '.pptx', p.savePath, parent);
}

// ---------------------------------------------------------------- images
async function convertImage(p, parent) {
  const format = String(p.format || 'jpeg').toLowerCase();
  if (format === 'heic' || format === 'gif') throw new BridgeError('Format gambar ' + format.toUpperCase() + ' tidak didukung di sini. Pilih JPEG, PNG, WebP, TIFF, BMP, atau PDF.');
  const r = await require('./worker').convertImage(p);
  let data = Buffer.from(r.base64, 'base64');
  if (r.ext === 'pdf') {
    const { PDFDocument } = require('pdf-lib');
    const pdf = await PDFDocument.create();
    const img = await pdf.embedPng(data);
    const page = pdf.addPage([img.width * 0.75, img.height * 0.75]);
    page.drawImage(img, { x: 0, y: 0, width: img.width * 0.75, height: img.height * 0.75 });
    data = Buffer.from(await pdf.save());
  }
  return deliver(data, (p.name || 'gambar') + '.' + r.ext, p.savePath, parent);
}

// ---------------------------------------------------------------- zip export
async function zipExport(p, parent) {
  const items = Array.isArray(p.files) ? p.files : [];
  if (!items.length) throw new BridgeError('Tidak ada file untuk diarsipkan');
  const used = new Set();
  const entries = [];
  items.forEach((it, i) => {
    let ename = String(it.name || 'file-' + i).replace(/\.\./g, '_').replace(/\\/g, '/');
    while (used.has(ename)) ename = i + '-' + ename;
    used.add(ename);
    if (it.path) entries.push([ename, fs.readFileSync(expand(it.path))]);
    else if (it.base64) entries.push([ename, Buffer.from(it.base64, 'base64')]);
    else if (it.content != null) entries.push([ename, String(it.content)]);
  });
  return deliver(zipCreate(entries), (p.name || 'sinai-ekspor') + '.zip', p.savePath, parent);
}

// ---------------------------------------------------------------- PDF editing
function qpdf() { return Env.which('qpdf'); }

async function loadPdf(file, password) {
  const { PDFDocument } = require('pdf-lib');
  const bytes = fs.readFileSync(expand(file));
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    if (!/encrypt/i.test(String(e && e.message))) throw new BridgeError('PDF tidak bisa dibuka (file rusak atau bukan PDF)');
    const q = qpdf();
    if (!q) throw new BridgeError('PDF_LOCKED: PDF ini terenkripsi. Untuk mengubahnya, pasang qpdf lalu coba lagi.');
    if (!password) throw new BridgeError('PDF_LOCKED: PDF ini dilindungi kata sandi.');
    const tmp = U.tempDir('sinai-pdf-');
    try {
      const out = path.join(tmp, 'plain.pdf');
      const r = await runSync(q, ['--password=' + password, '--decrypt', expand(file), out], { timeout: 60 });
      if (r.code !== 0 && r.code !== 3) throw new BridgeError('PDF_LOCKED: Kata sandi PDF salah.');
      return await PDFDocument.load(fs.readFileSync(out), { updateMetadata: false });
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
}

function pageRanges(spec, total) {
  if (!spec || !String(spec).trim()) return Array.from({ length: total }, (_, i) => i);
  const out = [];
  for (const part of String(spec).split(',')) {
    const t = part.trim();
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(t);
    if (m) { const a = +m[1], z = +m[2]; for (let i = Math.min(a, z); i <= Math.max(a, z); i++) if (i >= 1 && i <= total) out.push(i - 1); }
    else if (/^\d+$/.test(t) && +t >= 1 && +t <= total) out.push(+t - 1);
  }
  return out;
}

function winAnsiSafe(text) {
  // The standard PDF fonts only cover WinAnsi; keep what they can draw.
  return Array.from(String(text)).map((ch) => (/[\x20-\x7e\xa0-\xff€‘’“”•–—…™]/.test(ch) ? ch : '?')).join('');
}

async function pdfEdit(p, parent) {
  const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
  const op = String(p.op || '');
  let result;
  if (op === 'merge') {
    if (!Array.isArray(p.paths) || !p.paths.length) throw new BridgeError('Daftar PDF kosong');
    const merged = await PDFDocument.create();
    for (const f of p.paths) {
      const d = await loadPdf(f, p.password);
      (await merged.copyPages(d, d.getPageIndices())).forEach((pg) => merged.addPage(pg));
    }
    result = await merged.save();
  } else if (op === 'split') {
    if (!p.path) throw new BridgeError('path wajib diisi');
    const d = await loadPdf(p.path, p.password);
    const idx = pageRanges(p.pages, d.getPageCount());
    if (!idx.length) throw new BridgeError('Tidak ada halaman yang dipilih');
    const out = await PDFDocument.create();
    (await out.copyPages(d, idx)).forEach((pg) => out.addPage(pg));
    result = await out.save();
  } else if (op === 'watermark' || op === 'stamp') {
    if (!p.path) throw new BridgeError('path wajib diisi');
    const d = await loadPdf(p.path, p.password);
    const font = await d.embedFont(StandardFonts.HelveticaBold);
    const text = winAnsiSafe(p.text || 'RAHASIA');
    const opacity = p.opacity != null ? Number(p.opacity) : 0.18;
    const diagonal = p.diagonal != null ? !!p.diagonal : op === 'watermark';
    for (const page of d.getPages()) {
      const { width, height } = page.getSize();
      const size = Math.max(18, Math.min(width, height) / Math.max(6, text.length) * 1.4);
      const tw = font.widthOfTextAtSize(text, size);
      if (diagonal) {
        const a = 36 * Math.PI / 180;
        page.drawText(text, { x: width / 2 - (tw / 2) * Math.cos(a) + (size / 3) * Math.sin(a), y: height / 2 - (tw / 2) * Math.sin(a) - (size / 3) * Math.cos(a), size, font, color: rgb(0.5, 0.5, 0.5), opacity, rotate: degrees(36) });
      } else {
        page.drawText(text, { x: width - tw - 24, y: 24, size, font, color: rgb(0.5, 0.5, 0.5), opacity });
      }
    }
    result = await d.save();
  } else if (op === 'encrypt') {
    if (!p.path || !p.newPassword) throw new BridgeError('path dan newPassword wajib diisi');
    const q = qpdf();
    if (!q) throw new BridgeError('Enkripsi PDF memerlukan qpdf (' + (process.platform === 'win32' ? 'https://qpdf.sourceforge.io' : 'sudo apt install qpdf') + '). Pasang lalu coba lagi.');
    const tmp = U.tempDir('sinai-pdf-');
    try {
      const src = path.join(tmp, 'in.pdf'), out = path.join(tmp, 'out.pdf');
      fs.writeFileSync(src, await (await loadPdf(p.path, p.password)).save());
      const r = await runSync(q, ['--encrypt', String(p.newPassword), String(p.ownerPassword || p.newPassword), '256', '--', src, out], { timeout: 60 });
      if (r.code !== 0 && r.code !== 3) throw new BridgeError('Gagal mengenkripsi PDF: ' + r.err.slice(0, 200));
      result = fs.readFileSync(out);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  } else {
    throw new BridgeError('Operasi PDF tidak dikenal: ' + op);
  }
  let suggested = (p.name || 'pdf') + '.pdf';
  const src = p.path || (p.paths || [])[0];
  if (!p.name && src) suggested = path.basename(src).replace(/\.pdf$/i, '') + '-' + op + '.pdf';
  return deliver(Buffer.from(result), suggested, p.savePath, parent);
}

// ---------------------------------------------------------------- share & backup
/** No system share sheet here: show the file in the file manager / copy the text. */
function share(p) {
  const paths = (p.paths || []).map(expand).filter((x) => fs.existsSync(x));
  if (paths.length) { shell.showItemInFolder(path.normalize(paths[0])); return true; }
  const text = [p.text, p.url].filter(Boolean).join('\n');
  if (!text) throw new BridgeError('Tidak ada yang bisa dibagikan');
  clipboard.writeText(text);
  return true;
}

async function backup(p, parent) {
  const root = support();
  const entries = [];
  (function walk(dir, rel) {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.name.startsWith('.')) continue;
      const r = rel ? rel + '/' + d.name : d.name;
      if (!rel && d.name.startsWith('backup-')) continue;
      const full = path.join(dir, d.name);
      if (d.isDirectory()) walk(full, r);
      else if (d.isFile() && d.name !== 'secrets.bin' && d.name !== 'secrets.json') entries.push([r, fs.readFileSync(full)]);
    }
  })(root, '');
  const date = new Date().toISOString().slice(0, 10);
  return deliver(zipCreate(entries), 'Sinai-backup-' + date + '.zip', p.savePath, parent);
}

module.exports = { deliver, document, spreadsheet, slides, convertImage, zipExport, pdfEdit, share, backup };
