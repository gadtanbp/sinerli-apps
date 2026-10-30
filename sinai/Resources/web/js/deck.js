/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Deck designer. The model only writes Markdown slides; Sinai picks a theme
   and a professional layout per slide (cover, section, agenda, stats,
   timeline, comparison, cards, quote, table, code, bullets, closing) and lays
   it out on a 1280×720 canvas. The same scene is rendered to PowerPoint XML
   and to HTML (canvas preview, PDF, video), so every format looks the same —
   and good — whichever model wrote the content. */
(function () {
  'use strict';

  var W = 1280, H = 720;

  // ---------------------------------------------------------------- themes

  var THEMES = {
    aurora: { label: 'Aurora', bg: 'FFFFFF', surface: 'F3F4FB', text: '151833', muted: '5B6080', accent: '4F46E5', accent2: '06B6D4', dark: false },
    midnight: { label: 'Midnight', bg: '0E1325', surface: '1A2140', text: 'F5F7FF', muted: '9AA4C7', accent: '7C83FF', accent2: '22D3EE', dark: true },
    emerald: { label: 'Emerald', bg: 'FFFFFF', surface: 'EEF8F3', text: '102A22', muted: '4E6B60', accent: '059669', accent2: '84CC16', dark: false },
    sunset: { label: 'Sunset', bg: 'FFFBF7', surface: 'FFF0E4', text: '2A160C', muted: '7A5A48', accent: 'EA580C', accent2: 'DB2777', dark: false },
    ocean: { label: 'Ocean', bg: 'FFFFFF', surface: 'EEF6FC', text: '0C2236', muted: '4D6579', accent: '0369A1', accent2: '0EA5E9', dark: false },
    royal: { label: 'Royal', bg: '17143A', surface: '262158', text: 'F6F4FF', muted: 'B3ACD9', accent: 'A78BFA', accent2: 'F472B6', dark: true },
    graphite: { label: 'Graphite', bg: 'FAFAF9', surface: 'EFEEEC', text: '18181B', muted: '62626B', accent: '18181B', accent2: 'F59E0B', dark: false },
    corporate: { label: 'Corporate', bg: 'FFFFFF', surface: 'EFF4FF', text: '0F1B3D', muted: '52607F', accent: '1D4ED8', accent2: '0EA5E9', dark: false },
    terracotta: { label: 'Terracotta', bg: 'FBF7F2', surface: 'F3E9DD', text: '2B1D16', muted: '7A6355', accent: 'C2410C', accent2: '65A30D', dark: false, serif: true },
  };

  var TOPICS = [
    [/asuransi|insurance|bank|keuangan|finance|klaim/i, 'corporate'],
    [/teknologi|technology|tech|\bai\b|software|digital|startup|data|cyber|cloud|aplikasi|app/i, 'midnight'],
    [/keuangan|finance|bank|investasi|asuransi|insurance|bisnis|business|laporan tahunan|annual|sales|penjualan|corporate|perusahaan|klaim/i, 'corporate'],
    [/kesehatan|health|medis|medical|rumah sakit|lingkungan|green|hijau|pertanian|agri|sustainab|eco/i, 'emerald'],
    [/pendidikan|education|sekolah|kampus|belajar|training|pelatihan|kurikulum|laut|ocean|travel/i, 'ocean'],
    [/makanan|food|kuliner|resto|kopi|coffee|budaya|culture|sejarah|history|seni|art|heritage/i, 'terracotta'],
    [/marketing|brand|kreatif|creative|event|fashion|lifestyle|kampanye|campaign|sosial media/i, 'sunset'],
    [/premium|luxury|mewah|strategi|strategy|visi|vision|pitch|investor/i, 'royal'],
  ];

  function pickTheme(src, opt) {
    var t = opt && (typeof opt === 'string' ? opt : opt.name);
    var base;
    if (t && THEMES[String(t).toLowerCase()]) base = THEMES[String(t).toLowerCase()];
    if (!base) {
      for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i][0].test(src.slice(0, 1500))) { base = THEMES[TOPICS[i][1]]; break; }
    }
    base = Object.assign({}, base || THEMES.aurora);
    // Explicit colours from the model / user override the palette.
    if (opt && typeof opt === 'object') {
      ['background', 'bg', 'text', 'accent', 'accent2', 'surface', 'muted'].forEach(function (k) {
        var v = hex(opt[k]);
        if (v) base[k === 'background' ? 'bg' : k] = v;
      });
      if (opt.dark != null) base.dark = !!opt.dark;
    }
    base.dark = base.dark || luminance(base.bg) < 0.35;
    // Fonts present on every Mac / Windows / Office / Keynote / Google Slides install.
    base.head = base.serif ? 'Georgia' : 'Arial';
    base.body = base.serif ? 'Georgia' : 'Arial';
    // A user template may name its own fonts (kept in the PPTX; the preview falls back gracefully).
    if (opt && typeof opt === 'object') { if (opt.fontHead) base.head = opt.fontHead; if (opt.fontBody) base.body = opt.fontBody; }
    return base;
  }

  function hex(v) {
    var s = String(v || '').replace('#', '').trim().toUpperCase();
    if (/^[0-9A-F]{3}$/.test(s)) s = s.replace(/(.)/g, '$1$1');
    return /^[0-9A-F]{6}$/.test(s) ? s : '';
  }
  function luminance(h) {
    var n = parseInt(h, 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }
  function mix(a, b, t) {
    var x = parseInt(a, 16), y = parseInt(b, 16), out = 0;
    [16, 8, 0].forEach(function (s) { out |= Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t) << s; });
    return ('000000' + out.toString(16).toUpperCase()).slice(-6);
  }

  // ---------------------------------------------------------------- markdown → slide content

  function plain(s) {
    return String(s || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(.*?)\1/g, '$2').replace(/`([^`]+)`/g, '$1').replace(/<[^>]+>/g, '').trim();
  }

  /* "Label: description" / "Label — description" → {label, desc}. */
  function splitLabel(t) {
    var m = /^(.{2,48}?)\s*(?::|—|–|\s-\s)\s+(.{2,})$/.exec(t);
    if (m && !/https?$/i.test(m[1])) return { label: m[1].trim(), desc: m[2].trim() };
    return { label: '', desc: t };
  }

  function parse(src) {
    return String(src || '').replace(/\r/g, '').split(/\n-{3,}\s*\n/).map(function (block) {
      var s = { title: '', sub: '', bullets: [], paras: [], quote: [], table: null, code: null, notes: [] };
      var lines = block.split('\n'), inCode = false, code = [], lang = '';
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var fence = /^\s*```(\w*)/.exec(line);
        if (fence) {
          if (inCode) { s.code = { lang: lang, text: code.join('\n') }; inCode = false; code = []; } else { inCode = true; lang = fence[1]; }
          continue;
        }
        if (inCode) { code.push(line); continue; }
        var nm = /^\s*(narasi|narration|narrator|voiceover|catatan pembicara|speaker notes?|catatan)\s*:\s*(.*)$/i.exec(line);
        if (nm) { s.notes.push(nm[2]); continue; }
        if (/^\s*$/.test(line) || /^\s*!\[/.test(line)) continue;
        var hm = /^\s*(#{1,4})\s+(.*)$/.exec(line);
        if (hm) {
          if (!s.title) s.title = plain(hm[2]);
          else if (!s.sub && !s.bullets.length) s.sub = plain(hm[2]);
          else s.bullets.push({ text: plain(hm[2]), level: 0, head: true });
          continue;
        }
        if (/^\s*\|.*\|\s*$/.test(line)) {
          var rows = [];
          while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
            if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return plain(c); }));
            i++;
          }
          i--;
          if (rows.length) s.table = rows;
          continue;
        }
        var qm = /^\s*>\s?(.*)$/.exec(line);
        if (qm) { if (qm[1].trim()) s.quote.push(plain(qm[1])); continue; }
        var bm = /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/.exec(line);
        if (bm) {
          var t = plain(bm[3]);
          if (t) s.bullets.push({ text: t, level: Math.min(2, Math.floor(bm[1].replace(/\t/g, '  ').length / 2)), num: /\d/.test(bm[2]) });
          continue;
        }
        var p = plain(line);
        if (p) s.paras.push(p);
      }
      if (inCode && code.length) s.code = { lang: lang, text: code.join('\n') };
      if (!s.sub && s.paras.length && !s.bullets.length && s.paras[0].length < 140) s.sub = s.paras.shift();
      s.markdown = block.trim();
      return s;
    }).filter(function (s) { return s.title || s.bullets.length || s.paras.length || s.quote.length || s.table || s.code; });
  }

  // ---------------------------------------------------------------- layout choice

  var STAT = /^\s*((?:rp|us\$|\$|€|idr)?\s?[\d][\d.,]*\s?(?:%|x|k|rb|ribu|jt|juta|m|mn|miliar|b|bn|t|triliun|\+|jam|hari|menit|tahun|thn|kali|orang|user|pengguna)?\+?)\s*(?::|—|–|-)?\s*(.*)$/i;
  function statOf(t) {
    var m = STAT.exec(t);
    if (!m || !m[2] || m[1].replace(/[^\d]/g, '').length === 0 || m[1].length > 14) return null;
    return { value: m[1].trim(), label: m[2].trim() };
  }

  function chooseLayout(s, i, n) {
    var top = s.bullets.filter(function (b) { return b.level === 0; });
    var text = s.title + ' ' + s.sub;
    if (i === 0) return 'cover';
    if (i === n - 1 && /terima ?kasih|thank|penutup|closing|q ?& ?a|tanya jawab|sekian|kontak|contact|hubungi/i.test(s.title) && s.bullets.length <= 4) return 'closing';
    if (s.code) return 'code';
    if (s.table && s.table.length > 1) return 'table';
    if (s.quote.length && s.bullets.length <= 1) return 'quote';
    if (!s.bullets.length && s.paras.length <= 1) return 'section';
    if (/agenda|daftar isi|outline|isi presentasi|contents|pokok bahasan|topik/i.test(s.title) && top.length >= 2 && top.length <= 8) return 'agenda';
    var stats = top.map(function (b) { return statOf(b.text); }).filter(Boolean);
    if (top.length >= 2 && top.length <= 4 && stats.length === top.length) return 'stats';
    var groups = top.filter(function (b, k) { var nx = s.bullets[s.bullets.indexOf(b) + 1]; return nx && nx.level > 0; });
    if ((groups.length === 2 && top.length === 2) || (/\bvs\.?\b|versus|perbandingan|comparison|sebelum.*sesudah|before.*after|kelebihan.*kekurangan|pro.*kontra/i.test(text) && top.length >= 2 && top.length <= 8)) return 'compare';
    if (top.length >= 3 && top.length <= 6 && (/timeline|roadmap|tahap|langkah|proses|alur|step|fase|jadwal|milestone|perjalanan|sejarah|kronologi|rencana kerja/i.test(text) ||
        top.every(function (b) { return /^(19|20)\d\d|^q[1-4]\b|^(tahap|fase|step|langkah|minggu|bulan|week|month|hari|day)\s*\d/i.test(b.text); }))) return 'timeline';
    if (top.length >= 3 && top.length <= 6 && s.bullets.length === top.length && top.every(function (b) { return splitLabel(b.text).label && b.text.length < 150; })) return 'cards';
    // A handful of short points reads better as tiles than as a bullet list.
    if (top.length >= 3 && top.length <= 6 && s.bullets.length === top.length && !s.paras.length && top.every(function (b) { return b.text.length <= 45; })) return 'cards';
    return 'bullets';
  }

  // ---------------------------------------------------------------- scene primitives

  /* Element: {k:'rect'|'ellipse'|'text'|'line', x,y,w,h, fill, grad:[c1,c2,angle], alpha, r (radius px),
     shadow, paras:[{runs:[{t,b,i,c,size,font}], bullet, color, align, space}], size, color, font, bold,
     align:'l'|'c'|'r', valign:'t'|'m'|'b', lh} */
  function rect(x, y, w, h, o) { return Object.assign({ k: 'rect', x: x, y: y, w: w, h: h }, o || {}); }
  function ellipse(x, y, w, h, o) { return Object.assign({ k: 'ellipse', x: x, y: y, w: w, h: h }, o || {}); }
  function text(x, y, w, h, paras, o) {
    if (typeof paras === 'string') paras = [{ runs: [{ t: paras }] }];
    return Object.assign({ k: 'text', x: x, y: y, w: w, h: h, paras: paras, lh: 1.25 }, o || {});
  }

  /* Rough text measurement (average glyph widths) so that both renderers
     can use the same font size and nothing overflows its box. */
  function textWidth(s, size, bold, mono) {
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      w += mono ? 0.6 : /[ilI.,:;'|!\s]/.test(c) ? 0.3 : /[mwMW@%]/.test(c) ? 0.85 : /[A-Z0-9]/.test(c) ? 0.64 : 0.53;
    }
    return w * size * (bold ? 1.06 : 1);
  }
  function linesFor(s, size, width, bold, mono) {
    var words = String(s).split(/\s+/), lines = 1, cur = 0, space = textWidth(' ', size, bold, mono);
    words.forEach(function (wd) {
      var ww = textWidth(wd, size, bold, mono);
      if (cur > 0 && cur + space + ww > width) { lines++; cur = ww; }
      else cur += (cur > 0 ? space : 0) + ww;
      while (cur > width && width > 0) { lines++; cur -= width; }
    });
    return lines;
  }
  /* Height of paragraphs at a given size. */
  function measure(paras, w, size, lh, gapEm, opts) {
    opts = opts || {};
    var total = 0;
    paras.forEach(function (p, k) {
      var s = size * (p.scale || 1);
      var indent = p.bullet ? s * 1.1 + (p.level || 0) * s : 0;
      total += linesFor(p.runs.map(function (r) { return r.t; }).join(''), s, w - indent, opts.bold || p.runs.some(function (r) { return r.b; }), opts.mono) * s * lh;
      if (k) total += s * (gapEm == null ? 0.5 : gapEm);
    });
    return total;
  }

  /* Largest size (≤ max, ≥ min) at which all paragraphs fit in w×h. */
  function fit(paras, w, h, max, min, lh, gapEm, opts) {
    opts = opts || {};
    for (var size = max; size > min; size--) {
      var total = 0;
      paras.forEach(function (p, k) {
        var s = size * (p.scale || 1);
        var indent = p.bullet ? s * 1.1 + (p.level || 0) * s : 0;
        var str = p.runs.map(function (r) { return r.t; }).join('');
        total += linesFor(str, s, w - indent, opts.bold || p.runs.some(function (r) { return r.b; }), opts.mono) * s * lh;
        if (k) total += s * (gapEm == null ? 0.5 : gapEm);
      });
      if (total <= h) return size;
    }
    return min;
  }

  // ---------------------------------------------------------------- layouts

  function build(src, opts) {
    opts = opts || {};
    var slides = parse(src);
    var th = pickTheme(src, opts.theme);
    var deckTitle = slides[0] ? slides[0].title : '';
    var n = slides.length;
    var sectionNo = 0;
    return {
      theme: th,
      slides: slides.map(function (s, i) {
        var layout = chooseLayout(s, i, n);
        if (layout === 'section') sectionNo++;
        var els = LAYOUTS[layout](s, th, { i: i, n: n, deckTitle: deckTitle, section: sectionNo });
        if (['cover', 'closing', 'section'].indexOf(layout) < 0 && !opts.noNumbers) els = els.concat(footer(th, i, n, deckTitle));
        return { layout: layout, els: els, notes: s.notes.join(' '), title: s.title };
      }),
    };
  }

  function bgFor(th) { return rect(0, 0, W, H, { fill: th.bg }); }
  function softDecor(th) {
    return [
      ellipse(980, -260, 560, 560, { fill: th.accent, alpha: th.dark ? 0.16 : 0.07 }),
      ellipse(1120, 520, 320, 320, { fill: th.accent2, alpha: th.dark ? 0.14 : 0.08 }),
    ];
  }
  function titleBlock(s, th, w) {
    var t = s.title || '';
    var size = fit([{ runs: [{ t: t, b: true }] }], w || 1088, 96, 42, 26, 1.12, 0, { bold: true });
    var out = [
      rect(96, 70, 56, 6, { fill: th.accent, r: 3 }),
      text(96, 92, w || 1088, 100, [{ runs: [{ t: t, b: true }] }], { size: size, color: th.text, font: th.head, valign: 'b', lh: 1.12 }),
    ];
    if (s.sub) out.push(text(96, 198, w || 1088, 40, s.sub, { size: 20, color: th.muted, font: th.body }));
    return out;
  }
  function contentTop(s) { return s.sub ? 256 : 222; }
  function footer(th, i, n, deckTitle) {
    return [
      text(96, 666, 760, 24, deckTitle, { size: 13, color: th.muted, font: th.body, alpha: 0.9 }),
      text(1084, 666, 100, 24, (i + 1) + ' / ' + n, { size: 13, color: th.muted, font: th.body, align: 'r' }),
    ];
  }
  function bulletParas(list, th, scaleSub) {
    return list.map(function (b) {
      var sl = splitLabel(b.text);
      var runs = sl.label && b.level === 0 ? [{ t: sl.label + ': ', b: true }, { t: sl.desc }] : [{ t: b.text, b: !!b.head }];
      return { runs: runs, bullet: !b.head, level: b.level, scale: b.level ? (scaleSub || 0.84) : 1, color: b.level ? th.muted : th.text };
    });
  }

  var LAYOUTS = {
    cover: function (s, th) {
      var a = th.dark ? th.bg : mix(th.accent, '000000', 0.25), b = th.dark ? mix(th.accent, th.bg, 0.55) : th.accent2;
      var sub = s.sub || s.paras.concat(s.bullets.map(function (x) { return x.text; })).slice(0, 2).join(' · ');
      var tsize = fit([{ runs: [{ t: s.title, b: true }] }], 940, 230, 68, 36, 1.08, 0, { bold: true });
      var date = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long' });
      return [
        rect(0, 0, W, H, { grad: [a, b, 35] }),
        ellipse(760, -180, 720, 720, { fill: 'FFFFFF', alpha: 0.08 }),
        ellipse(980, 360, 520, 520, { fill: 'FFFFFF', alpha: 0.06 }),
        ellipse(-160, 520, 380, 380, { fill: th.accent2, alpha: 0.18 }),
        rect(96, 150, 72, 6, { fill: 'FFFFFF', r: 3, alpha: 0.9 }),
        text(96, 172, 940, 250, [{ runs: [{ t: s.title, b: true }] }], { size: tsize, color: 'FFFFFF', font: th.head, valign: 'b', lh: 1.08 }),
        sub ? text(96, 446, 900, 110, sub, { size: fit([{ runs: [{ t: sub }] }], 900, 110, 26, 16, 1.35), color: 'FFFFFF', alpha: 0.86, font: th.body, lh: 1.35 }) : null,
        text(96, 630, 600, 28, date.toUpperCase(), { size: 13, color: 'FFFFFF', alpha: 0.7, font: th.body, bold: true, spacing: 2 }),
      ].filter(Boolean);
    },

    closing: function (s, th) {
      var a = th.dark ? th.bg : mix(th.accent, '000000', 0.2), b = th.dark ? mix(th.accent, th.bg, 0.5) : th.accent2;
      var sub = s.sub || s.paras.concat(s.bullets.map(function (x) { return x.text; })).join('\n');
      return [
        rect(0, 0, W, H, { grad: [b, a, 215] }),
        ellipse(-200, -220, 640, 640, { fill: 'FFFFFF', alpha: 0.07 }),
        ellipse(900, 380, 560, 560, { fill: 'FFFFFF', alpha: 0.06 }),
        text(140, 210, 1000, 160, [{ runs: [{ t: s.title, b: true }] }], { size: fit([{ runs: [{ t: s.title, b: true }] }], 1000, 160, 72, 40, 1.08, 0, { bold: true }), color: 'FFFFFF', font: th.head, align: 'c', valign: 'b', lh: 1.08 }),
        rect(604, 396, 72, 6, { fill: 'FFFFFF', r: 3, alpha: 0.85 }),
        sub ? text(190, 424, 900, 150, sub.split('\n').map(function (l) { return { runs: [{ t: l }] }; }), { size: 22, color: 'FFFFFF', alpha: 0.86, font: th.body, align: 'c', lh: 1.4 }) : null,
      ].filter(Boolean);
    },

    section: function (s, th, c) {
      var body = s.sub || s.paras[0] || '';
      var num = ('0' + c.section).slice(-2);
      return [
        rect(0, 0, W, H, { fill: th.dark ? th.surface : th.accent }),
        rect(0, 0, 420, H, { fill: th.dark ? th.accent : mix(th.accent, '000000', 0.18), alpha: th.dark ? 0.35 : 1 }),
        ellipse(1000, -200, 520, 520, { fill: 'FFFFFF', alpha: 0.06 }),
        text(96, 250, 300, 200, num, { size: 140, bold: true, color: 'FFFFFF', alpha: 0.9, font: th.head, valign: 'm' }),
        text(500, 230, 680, 170, [{ runs: [{ t: s.title, b: true }] }], { size: fit([{ runs: [{ t: s.title, b: true }] }], 680, 170, 54, 30, 1.1, 0, { bold: true }), color: 'FFFFFF', font: th.head, valign: 'b', lh: 1.1 }),
        rect(500, 418, 64, 6, { fill: 'FFFFFF', r: 3, alpha: 0.85 }),
        body ? text(500, 444, 660, 120, body, { size: 22, color: 'FFFFFF', alpha: 0.85, font: th.body, lh: 1.4 }) : null,
      ].filter(Boolean);
    },

    agenda: function (s, th) {
      var items = s.bullets.filter(function (b) { return b.level === 0; });
      var cols = items.length > 4 ? 2 : 1, rows = Math.ceil(items.length / cols);
      var top = contentTop(s), gap = 18, rowH = Math.min(96, (620 - top - gap * (rows - 1)) / rows);
      var colW = cols === 2 ? 530 : 900;
      var els = [bgFor(th)].concat(softDecor(th), titleBlock(s, th));
      items.forEach(function (b, k) {
        var col = cols === 2 ? Math.floor(k / rows) : 0, row = cols === 2 ? k % rows : k;
        var x = 96 + col * (colW + 28), y = top + row * (rowH + gap);
        els.push(rect(x, y, colW, rowH, { fill: th.surface, r: 14 }));
        els.push(ellipse(x + 20, y + rowH / 2 - 22, 44, 44, { fill: th.accent }));
        els.push(text(x + 20, y + rowH / 2 - 22, 44, 44, String(k + 1), { size: 18, bold: true, color: 'FFFFFF', align: 'c', valign: 'm', font: th.head }));
        var sl = splitLabel(b.text);
        var paras = sl.label ? [{ runs: [{ t: sl.label, b: true }] }, { runs: [{ t: sl.desc }], scale: 0.8, color: th.muted }] : [{ runs: [{ t: b.text, b: true }] }];
        els.push(text(x + 84, y + 8, colW - 104, rowH - 16, paras, { size: fit(paras, colW - 104, rowH - 16, 26, 13, 1.2, 0.2, { bold: true }), color: th.text, valign: 'm', font: th.body, lh: 1.2, gap: 0.2 }));
      });
      return els;
    },

    stats: function (s, th) {
      var items = s.bullets.filter(function (b) { return b.level === 0; }).map(function (b) { return statOf(b.text); });
      var top = contentTop(s) + 30, n = items.length, gap = 28, w = (1088 - gap * (n - 1)) / n, hh = 300;
      var els = [bgFor(th)].concat(softDecor(th), titleBlock(s, th));
      items.forEach(function (st, k) {
        var x = 96 + k * (w + gap);
        els.push(rect(x, top, w, hh, { fill: th.surface, r: 20 }));
        els.push(rect(x, top, w, 8, { fill: k % 2 ? th.accent2 : th.accent, r: 4 }));
        var vsize = fit([{ runs: [{ t: st.value, b: true }] }], w - 56, 110, 72, 30, 1, 0, { bold: true });
        els.push(text(x + 28, top + 40, w - 56, 110, [{ runs: [{ t: st.value, b: true }] }], { size: vsize, color: k % 2 ? th.accent2 : th.accent, font: th.head, valign: 'b', lh: 1 }));
        var lp = [{ runs: [{ t: st.label }] }];
        els.push(text(x + 28, top + 166, w - 56, hh - 190, lp, { size: fit(lp, w - 56, hh - 190, 25, 13, 1.35), color: th.text, font: th.body, lh: 1.35 }));
      });
      if (s.paras.length) els.push(text(96, top + hh + 26, 1088, 60, s.paras.join(' '), { size: 16, color: th.muted, font: th.body }));
      return els;
    },

    timeline: function (s, th) {
      var items = s.bullets.filter(function (b) { return b.level === 0; });
      var n = items.length, top = contentTop(s), lineY = top + 150;
      var span = 1088, step = span / n;
      var els = [bgFor(th)].concat(softDecor(th), titleBlock(s, th));
      els.push(rect(96, lineY - 2, span, 4, { grad: [th.accent, th.accent2, 0], r: 2 }));
      items.forEach(function (b, k) {
        var cx = 96 + step * k + step / 2;
        var sl = splitLabel(b.text);
        var head = sl.label || ('Tahap ' + (k + 1)), desc = sl.label ? sl.desc : b.text;
        els.push(ellipse(cx - 18, lineY - 18, 36, 36, { fill: th.bg, line: k % 2 ? th.accent2 : th.accent, lineW: 4 }));
        els.push(ellipse(cx - 8, lineY - 8, 16, 16, { fill: k % 2 ? th.accent2 : th.accent }));
        var hp = [{ runs: [{ t: head, b: true }] }];
        els.push(text(cx - step / 2 + 8, top + 30, step - 16, 90, hp, { size: fit(hp, step - 16, 90, 26, 14, 1.15, 0, { bold: true }), color: k % 2 ? th.accent2 : th.accent, align: 'c', valign: 'b', font: th.head, lh: 1.15 }));
        var dp = [{ runs: [{ t: desc }] }];
        var subs = s.bullets.slice(s.bullets.indexOf(b) + 1).filter(function (x, j, arr) { return x.level > 0 && arr.slice(0, j).every(function (y) { return y.level > 0; }); });
        subs.forEach(function (x) { dp.push({ runs: [{ t: x.text }], scale: 0.85, color: th.muted }); });
        els.push(rect(cx - step / 2 + 8, lineY + 40, step - 16, 600 - lineY - 10, { fill: th.surface, r: 14 }));
        els.push(text(cx - step / 2 + 22, lineY + 54, step - 44, 600 - lineY - 38, dp, { size: fit(dp, step - 44, 600 - lineY - 38, 22, 12, 1.3, 0.35), color: th.text, align: 'c', font: th.body, lh: 1.3, gap: 0.35 }));
      });
      return els;
    },

    compare: function (s, th) {
      var groups = [], cur = null;
      s.bullets.forEach(function (b) {
        if (b.level === 0) { cur = { head: b.text, items: [] }; groups.push(cur); }
        else if (cur) cur.items.push(b.text);
      });
      if (groups.every(function (g) { return !g.items.length; })) {
        // Flat list "A vs B": split it in two halves.
        var half = Math.ceil(groups.length / 2), parts = (s.title.split(/\s+(?:vs\.?|versus)\s+/i));
        groups = [{ head: parts[0] && parts[1] ? parts[0] : 'A', items: groups.slice(0, half).map(function (g) { return g.head; }) },
          { head: parts[1] || 'B', items: groups.slice(half).map(function (g) { return g.head; }) }];
      }
      groups = groups.slice(0, 3);
      var top = contentTop(s), gap = 28, n = groups.length, w = (1088 - gap * (n - 1)) / n, maxH = 640 - top;
      var bodies = groups.map(function (g) { return g.items.map(function (t) { return { runs: [{ t: t }], bullet: true }; }); });
      var bsize = Math.min.apply(null, bodies.map(function (p) { return p.length ? fit(p, w - 56, maxH - 108, 25, 12, 1.3, 0.55) : 25; }));
      var hh = Math.min(maxH, Math.max(220, 120 + Math.max.apply(null, bodies.map(function (p) { return measure(p, w - 56, bsize, 1.3, 0.55); }))));
      top += Math.max(0, (maxH - hh) / 3);
      var els = [bgFor(th)].concat(softDecor(th), titleBlock(s, th));
      groups.forEach(function (g, k) {
        var x = 96 + k * (w + gap), col = k % 2 ? th.accent2 : th.accent;
        els.push(rect(x, top, w, hh, { fill: th.surface, r: 18 }));
        els.push(rect(x, top, w, 64, { fill: col, r: 18 }));
        els.push(rect(x, top + 40, w, 24, { fill: col }));
        var hp = [{ runs: [{ t: g.head, b: true }] }];
        els.push(text(x + 26, top + 8, w - 52, 50, hp, { size: fit(hp, w - 52, 50, 24, 14, 1.1, 0, { bold: true }), color: 'FFFFFF', valign: 'm', font: th.head }));
        var paras = bodies[k];
        if (paras.length) els.push(text(x + 28, top + 88, w - 56, hh - 108, paras, { size: bsize, color: th.text, font: th.body, bulletColor: col, lh: 1.3, gap: 0.55 }));
      });
      return els;
    },

    cards: function (s, th) {
      var items = s.bullets.filter(function (b) { return b.level === 0; });
      var n = items.length, cols = n === 4 ? 2 : 3, rows = Math.ceil(n / cols);
      var top = contentTop(s), gap = 24, w = (1088 - gap * (cols - 1)) / cols, hh = (636 - top - gap * (rows - 1)) / rows;
      var els = [bgFor(th)].concat(softDecor(th), titleBlock(s, th));
      items.forEach(function (b, k) {
        var col = k % cols, row = Math.floor(k / cols);
        var x = 96 + col * (w + gap), y = top + row * (hh + gap), c = k % 2 ? th.accent2 : th.accent;
        var sl = splitLabel(b.text);
        if (!sl.label) sl = { label: b.text, desc: '' };
        els.push(rect(x, y, w, hh, { fill: th.surface, r: 18 }));
        els.push(rect(x + 24, y + 24, 44, 44, { fill: c, r: 12 }));
        els.push(text(x + 24, y + 24, 44, 44, String(k + 1), { size: 18, bold: true, color: 'FFFFFF', align: 'c', valign: 'm', font: th.head }));
        var hp = [{ runs: [{ t: sl.label, b: true }] }];
        if (sl.desc) {
          els.push(text(x + 84, y + 22, w - 108, 50, hp, { size: fit(hp, w - 108, 50, 26, 14, 1.1, 0, { bold: true }), color: th.text, valign: 'm', font: th.head, lh: 1.1 }));
          var dp = [{ runs: [{ t: sl.desc }] }];
          els.push(text(x + 24, y + 86, w - 48, hh - 104, dp, { size: fit(dp, w - 48, hh - 104, 23, 12, 1.35), color: th.muted, font: th.body, lh: 1.35 }));
        } else {
          // Label-only tile: the point itself, large, under the number badge.
          els.push(text(x + 24, y + 86, w - 48, hh - 104, hp, { size: fit(hp, w - 48, hh - 104, 30, 14, 1.2, 0, { bold: true }), color: th.text, font: th.head, lh: 1.2 }));
        }
      });
      return els;
    },

    quote: function (s, th) {
      var q = s.quote.join(' ');
      var by = [s.sub].concat(s.paras, s.bullets.map(function (b) { return b.text; })).filter(Boolean).join(' ').replace(/^[—–-]\s*/, '');
      var qp = [{ runs: [{ t: q, i: true }] }];
      return [
        rect(0, 0, W, H, { fill: th.surface }),
        ellipse(-120, -160, 520, 520, { fill: th.accent, alpha: th.dark ? 0.18 : 0.08 }),
        text(110, 70, 200, 200, '“', { size: 220, bold: true, color: th.accent, alpha: 0.35, font: 'Georgia', lh: 1 }),
        text(190, 190, 900, 300, qp, { size: fit(qp, 900, 300, 40, 20, 1.3), color: th.text, font: th.serif ? 'Georgia' : th.head, valign: 'm', lh: 1.3 }),
        s.title && !/^(quote|kutipan)$/i.test(s.title) ? text(190, 120, 900, 40, s.title.toUpperCase(), { size: 14, bold: true, color: th.accent, spacing: 2, font: th.body }) : null,
        by ? rect(190, 524, 48, 4, { fill: th.accent, r: 2 }) : null,
        by ? text(254, 506, 800, 40, by, { size: 20, bold: true, color: th.muted, valign: 'm', font: th.body }) : null,
      ].filter(Boolean);
    },

    table: function (s, th) {
      var rows = s.table.slice(0, 9), cols = Math.min(6, Math.max.apply(null, rows.map(function (r) { return r.length; })));
      var top = contentTop(s), hh = Math.min(64, (640 - top) / rows.length), w = 1088 / cols;
      var els = [bgFor(th)].concat(titleBlock(s, th));
      var size = 22;
      rows.forEach(function (r) { r.slice(0, cols).forEach(function (c) { size = Math.min(size, fit([{ runs: [{ t: c }] }], w - 28, hh - 12, 22, 10, 1.2)); }); });
      rows.forEach(function (r, ri) {
        var y = top + ri * hh;
        if (ri === 0) els.push(rect(96, y, 1088, hh, { fill: th.accent, r: 10 }));
        else if (ri % 2 === 0) els.push(rect(96, y, 1088, hh, { fill: th.surface }));
        for (var ci = 0; ci < cols; ci++) {
          els.push(text(96 + ci * w + 14, y + 4, w - 28, hh - 8, r[ci] || '', { size: size, bold: ri === 0, color: ri === 0 ? 'FFFFFF' : th.text, valign: 'm', font: th.body, lh: 1.2 }));
        }
      });
      els.push(rect(96, top + rows.length * hh, 1088, 2, { fill: th.accent, alpha: 0.5 }));
      return els;
    },

    code: function (s, th) {
      var lines = s.code.text.split('\n').slice(0, 18);
      var top = contentTop(s), hh = 640 - top;
      var size = Math.min(20, Math.floor((hh - 48) / (lines.length * 1.4)));
      var longest = lines.reduce(function (m, l) { return Math.max(m, l.length); }, 1);
      size = Math.max(10, Math.min(size, Math.floor(1020 / (longest * 0.6))));
      return [bgFor(th)].concat(titleBlock(s, th), [
        rect(96, top, 1088, hh, { fill: '0F1222', r: 16 }),
        ellipse(120, top + 18, 12, 12, { fill: 'FF5F57' }), ellipse(140, top + 18, 12, 12, { fill: 'FEBC2E' }), ellipse(160, top + 18, 12, 12, { fill: '28C840' }),
        text(124, top + 46, 1036, hh - 64, lines.map(function (l) { return { runs: [{ t: l || ' ' }] }; }), { size: size, color: 'E6E8F5', font: 'Menlo', mono: true, lh: 1.4, gap: 0 }),
      ]);
    },

    bullets: function (s, th) {
      var list = s.bullets.slice();
      var paras = s.paras.map(function (p) { return { runs: [{ t: p }], color: th.muted }; }).concat(bulletParas(list, th));
      var top = contentTop(s), hh = 640 - top;
      var long = paras.length > 7;
      var narrow = !long && paras.length <= 5 && paras.every(function (p) { return p.runs.map(function (r) { return r.t; }).join('').length < 120; });
      var w = narrow ? 720 : 1088;
      var els = [bgFor(th)].concat(narrow ? [] : softDecor(th), titleBlock(s, th, narrow ? 740 : 1088));
      if (long) {
        var half = Math.ceil(paras.length / 2), a = paras.slice(0, half), b = paras.slice(half);
        var sz = Math.min(fit(a, 520, hh, 26, 12, 1.3, 0.55), fit(b, 520, hh, 26, 12, 1.3, 0.55));
        els.push(text(96, top, 520, hh, a, { size: sz, color: th.text, font: th.body, bulletColor: th.accent, lh: 1.3, gap: 0.55 }));
        els.push(text(664, top, 520, hh, b, { size: sz, color: th.text, font: th.body, bulletColor: th.accent, lh: 1.3, gap: 0.55 }));
      } else {
        els.push(text(96, top, w, hh - 20, paras, { size: fit(paras, w, hh - 20, narrow ? 32 : 28, 12, 1.32, 0.6), color: th.text, font: th.body, bulletColor: th.accent, lh: 1.32, gap: 0.6, valign: narrow ? 'm' : 't' }));
      }
      if (narrow) {
        // Decorative side panel keeps short slides from looking empty.
        els.push(rect(880, 0, 400, H, { grad: [th.accent, th.accent2, 60] }));
        els.push(ellipse(940, 120, 300, 300, { fill: 'FFFFFF', alpha: 0.1 }));
        els.push(ellipse(1060, 420, 240, 240, { fill: 'FFFFFF', alpha: 0.08 }));
        var kicker = (s.title.split(/\s+/)[0] || '').replace(/[^\p{L}\p{N}]/gu, '');
        els.push(text(912, 520, 330, 120, kicker.toUpperCase(), { size: fit([{ runs: [{ t: kicker.toUpperCase(), b: true }] }], 330, 120, 54, 20, 1, 0, { bold: true }), bold: true, color: 'FFFFFF', alpha: 0.9, font: th.head, valign: 'b' }));
      }
      return els;
    },
  };

  // ---------------------------------------------------------------- HTML renderer

  function rgba(h, a) {
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + (a == null ? 1 : a) + ')';
  }
  function cssFont(f, mono) {
    if (mono) return 'ui-monospace,Menlo,Consolas,monospace';
    if (f === 'Georgia') return "Georgia,'Times New Roman',serif";
    if (f && f !== 'Arial') return "'" + String(f).replace(/'/g, '') + "',Aptos,Inter,'Segoe UI',-apple-system,Arial,sans-serif";
    return "Aptos,Inter,'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif";
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function elHtml(e) {
    var st = 'left:' + e.x + 'px;top:' + e.y + 'px;width:' + e.w + 'px;height:' + e.h + 'px;';
    if (e.k === 'rect' || e.k === 'ellipse') {
      var bg = e.grad ? 'linear-gradient(' + (90 + (e.grad[2] || 0)) + 'deg,' + rgba(e.grad[0]) + ',' + rgba(e.grad[1]) + ')' : rgba(e.fill, 1);
      st += 'background:' + (e.fill || e.grad ? bg : 'transparent') + ';';
      if (e.alpha != null) st += 'opacity:' + e.alpha + ';';
      if (e.k === 'ellipse') st += 'border-radius:50%;'; else if (e.r) st += 'border-radius:' + e.r + 'px;';
      if (e.line) st += 'box-shadow:inset 0 0 0 ' + (e.lineW || 2) + 'px ' + rgba(e.line) + ';';
      return '<div class="e" style="' + st + '"></div>';
    }
    var jc = e.valign === 'm' ? 'center' : e.valign === 'b' ? 'flex-end' : 'flex-start';
    st += 'display:flex;flex-direction:column;justify-content:' + jc + ';font-family:' + cssFont(e.font, e.mono) + ';font-size:' + e.size + 'px;line-height:' + (e.lh || 1.25) + ';color:' + rgba(e.color || '000000') + ';text-align:' + ({ c: 'center', r: 'right' }[e.align] || 'left') + ';';
    if (e.alpha != null) st += 'opacity:' + e.alpha + ';';
    if (e.bold) st += 'font-weight:700;';
    if (e.spacing) st += 'letter-spacing:' + e.spacing + 'px;';
    if (e.mono) st += 'white-space:pre;';
    var gap = e.gap == null ? 0.5 : e.gap;
    var inner = e.paras.map(function (p, k) {
      var ps = 'margin:' + (k ? gap + 'em' : '0') + ' 0 0;' + (p.scale ? 'font-size:' + p.scale + 'em;' : '') + (p.color ? 'color:' + rgba(p.color) + ';' : '');
      if (p.bullet) ps += 'position:relative;padding-left:' + (1.1 + (p.level || 0)) + 'em;';
      var dot = p.bullet ? '<span style="position:absolute;left:' + (p.level || 0) + 'em;top:.5em;width:.42em;height:.42em;border-radius:50%;background:' + rgba(p.level ? (e.color || '888888') : (e.bulletColor || e.color || '000000'), p.level ? 0.5 : 1) + '"></span>' : '';
      return '<p style="' + ps + '">' + dot + p.runs.map(function (r) {
        var rs = (r.b ? 'font-weight:700;' : '') + (r.i ? 'font-style:italic;' : '') + (r.c ? 'color:' + rgba(r.c) + ';' : '');
        return rs ? '<span style="' + rs + '">' + esc(r.t) + '</span>' : esc(r.t);
      }).join('') + '</p>';
    }).join('');
    return '<div class="e t" style="' + st + '">' + inner + '</div>';
  }

  function slideHtml(sl) { return sl.els.map(elHtml).join(''); }

  /* Full HTML document. opts: {print, export, noNumbers, theme} */
  function html(src, opts) {
    opts = opts || {};
    var d = build(src, opts);
    var print = !!opts.print;
    var css = '*{box-sizing:border-box}html,body{margin:0;background:' + (print ? '#fff' : '#15161d') + '}p{margin:0}' +
      '.deck{' + (print ? '' : 'position:fixed;inset:0;overflow:hidden') + '}' +
      '.slide{width:1280px;height:720px;position:relative;overflow:hidden;background:#' + d.theme.bg + ';' +
      (print ? 'page-break-after:always' : 'position:absolute;top:50%;left:50%;transform-origin:center;display:none;box-shadow:0 30px 80px rgba(0,0,0,.45);border-radius:8px') + '}' +
      '.slide.on{display:block}.e{position:absolute}.t{overflow:hidden;word-wrap:break-word}' +
      '.nav{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;color:#cfd1e6;font:13px -apple-system,"Segoe UI",sans-serif;background:rgba(0,0,0,.4);padding:6px 10px;border-radius:999px;z-index:9}' +
      '.nav button{background:none;border:0;color:#fff;font-size:18px;cursor:pointer;padding:0 8px}' +
      (print ? '.nav{display:none}@page{size:1280px 720px;margin:0}' : '');
    var shown = opts.range ? d.slides.slice(opts.range[0], opts.range[1]) : d.slides;
    var body = shown.map(function (sl, i) { return '<section class="slide" data-layout="' + sl.layout + '" data-i="' + i + '">' + slideHtml(sl) + '</section>'; }).join('');
    var js = print ? '' :
      'var deck=document.getElementById("deck"),all=deck.children,cur=0;function fit(){var k=Math.min(innerWidth/1340,innerHeight/780);for(var i=0;i<all.length;i++)all[i].style.transform="translate(-50%,-50%) scale("+k+")"}' +
      'function go(i){cur=Math.max(0,Math.min(all.length-1,i));for(var j=0;j<all.length;j++)all[j].classList.toggle("on",j===cur);document.getElementById("c").textContent=(cur+1)+" / "+all.length}' +
      'document.getElementById("p").onclick=function(){go(cur-1)};document.getElementById("n").onclick=function(){go(cur+1)};' +
      'addEventListener("keydown",function(e){if(/Arrow(Right|Down)|PageDown| /.test(e.key))go(cur+1);if(/Arrow(Left|Up)|PageUp/.test(e.key))go(cur-1)});' +
      'deck.addEventListener("click",function(e){if(!e.target.closest("a"))go(cur+1)});addEventListener("resize",fit);fit();go(0);';
    // Safety net: shrink any text box whose real rendering overflows the estimate.
    var shrink = 'document.querySelectorAll(".t").forEach(function(t){var s=parseFloat(t.style.fontSize),n=0;while(t.scrollHeight>t.clientHeight+2&&s>9&&n<30){s-=1;n++;t.style.fontSize=s+"px"}});';
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(d.slides[0] ? d.slides[0].title : 'Presentasi') + '</title>' +
      (opts.boot || '') + '<style>' + css + '</style></head><body><div class="deck" id="deck">' + body + '</div>' +
      (print ? '' : '<div class="nav"><button id="p">‹</button><span id="c"></span><button id="n">›</button></div>') +
      '<script>' + shrink + js + '<\/script></body></html>';
  }

  // ---------------------------------------------------------------- PowerPoint renderer

  var EMU = 9525;
  function emu(px) { return Math.round(px * EMU); }
  function xe(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function clr(h, a) { return '<a:srgbClr val="' + h + '">' + (a != null && a < 1 ? '<a:alpha val="' + Math.round(a * 100000) + '"/>' : '') + '</a:srgbClr>'; }
  function fontXml(f, mono) {
    var face = mono ? 'Courier New' : f || 'Arial';
    var pitch = mono ? '49' : face === 'Georgia' ? '18' : '34';
    return '<a:latin typeface="' + face + '" pitchFamily="' + pitch + '" charset="0"/><a:cs typeface="' + face + '"/>';
  }

  function spXml(e, id) {
    var off = '<a:xfrm><a:off x="' + emu(e.x) + '" y="' + emu(e.y) + '"/><a:ext cx="' + emu(Math.max(1, e.w)) + '" cy="' + emu(Math.max(1, e.h)) + '"/></a:xfrm>';
    var geom = e.k === 'ellipse' ? '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>'
      : e.r ? '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ' + Math.min(50000, Math.round(e.r / Math.min(e.w, e.h) * 100000)) + '"/></a:avLst></a:prstGeom>'
        : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
    if (e.k === 'rect' || e.k === 'ellipse') {
      var fill = e.grad
        ? '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0">' + clr(e.grad[0], e.alpha) + '</a:gs><a:gs pos="100000">' + clr(e.grad[1], e.alpha) + '</a:gs></a:gsLst><a:lin ang="' + Math.round(((e.grad[2] || 0) % 360) * 60000) + '" scaled="0"/></a:gradFill>'
        : e.fill ? '<a:solidFill>' + clr(e.fill, e.alpha) + '</a:solidFill>' : '<a:noFill/>';
      var ln = e.line ? '<a:ln w="' + emu(e.lineW || 2) + '"><a:solidFill>' + clr(e.line) + '</a:solidFill></a:ln>' : '<a:ln><a:noFill/></a:ln>';
      return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Shape ' + id + '"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>' + off + geom + fill + ln + '</p:spPr>' +
        '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="id-ID"/></a:p></p:txBody></p:sp>';
    }
    var anchor = e.valign === 'm' ? 'ctr' : e.valign === 'b' ? 'b' : 't';
    var algn = { c: 'ctr', r: 'r' }[e.align] || 'l';
    var lh = Math.round((e.lh || 1.25) * 100000 * 0.83);
    var gap = e.gap == null ? 0.5 : e.gap;
    var paras = e.paras.map(function (p, k) {
      var size = e.size * (p.scale || 1);
      var color = p.color || e.color || '000000';
      var ppr = '<a:pPr algn="' + algn + '"' + (p.bullet ? ' marL="' + emu(size * (1.1 + (p.level || 0))) + '" indent="' + (-emu(size * 1.1)) + '"' : '') + '>' +
        '<a:lnSpc><a:spcPct val="' + lh + '"/></a:lnSpc>' + (k ? '<a:spcBef><a:spcPts val="' + Math.round(size * gap * 0.75 * 100) + '"/></a:spcBef>' : '<a:spcBef><a:spcPts val="0"/></a:spcBef>') +
        (p.bullet ? '<a:buClr>' + clr(p.level ? (e.color || '888888') : (e.bulletColor || color)) + '</a:buClr><a:buSzPct val="100000"/><a:buFont typeface="Arial"/><a:buChar char="' + (p.level ? '–' : '●') + '"/>' : '<a:buNone/>') + '</a:pPr>';
      var runs = p.runs.map(function (r) {
        return '<a:r><a:rPr lang="id-ID" sz="' + Math.round(size * 0.75 * 100) + '" b="' + (r.b || e.bold ? 1 : 0) + '" i="' + (r.i ? 1 : 0) + '"' + (e.spacing ? ' spc="' + Math.round(e.spacing * 75) + '"' : '') + ' dirty="0">' +
          '<a:solidFill>' + clr(r.c || color, e.alpha) + '</a:solidFill>' + fontXml(e.font, e.mono) + '</a:rPr><a:t>' + xe(r.t) + '</a:t></a:r>';
      }).join('');
      return '<a:p>' + ppr + runs + '</a:p>';
    }).join('');
    return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Text ' + id + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>' + off + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>' +
      '<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="' + anchor + '"><a:normAutofit/></a:bodyPr><a:lstStyle/>' + paras + '</p:txBody></p:sp>';
  }

  var NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  var HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  var REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';

  /* Zip entries ({name, content}) of a complete .pptx package. */
  /* Full-slide picture (an HTML slide rendered without its text), cropped out of a strip image. */
  function picXml(bg, id) {
    return '<p:pic><p:nvPicPr><p:cNvPr id="' + id + '" name="Design ' + id + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
      '<p:blipFill><a:blip r:embed="rId2"/><a:srcRect t="' + Math.round(bg.top * 100000) + '" b="' + Math.round(bg.bottom * 100000) + '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
      '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';
  }

  /* opts.slides: precomputed [{title, els, bg?}] (HTML decks, see htmldeck.js) instead of Markdown src. */
  function pptxFiles(src, opts) {
    opts = opts || {};
    var d = opts.slides ? { slides: opts.slides, theme: build(src || '# Presentasi', opts).theme } : build(src, opts);
    var media = {};
    var th = d.theme;
    var files = [], sldIds = '', presRels = '', overrides = '';
    d.slides.forEach(function (sl, i) {
      var n = i + 1;
      var shapes = (sl.bg ? picXml(sl.bg, 2) : '') + sl.els.map(function (e, k) { return spXml(e, k + 3); }).join('');
      if (sl.bg) media[sl.bg.media] = sl.bg.path;
      files.push({ name: 'ppt/slides/slide' + n + '.xml', content: HEAD + '<p:sld ' + NS + '><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' + shapes + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>' });
      files.push({ name: 'ppt/slides/_rels/slide' + n + '.xml.rels', content: HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL + 'slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' + (sl.bg ? '<Relationship Id="rId2" Type="' + REL + 'image" Target="../media/' + sl.bg.media + '"/>' : '') + '</Relationships>' });
      sldIds += '<p:sldId id="' + (255 + n) + '" r:id="rId' + (n + 1) + '"/>';
      presRels += '<Relationship Id="rId' + (n + 1) + '" Type="' + REL + 'slide" Target="slides/slide' + n + '.xml"/>';
      overrides += '<Override PartName="/ppt/slides/slide' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
    });
    var theme = HEAD + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Sinai ' + xe(th.label) + '"><a:themeElements><a:clrScheme name="Sinai">' +
      '<a:dk1><a:srgbClr val="' + (th.dark ? th.bg : th.text) + '"/></a:dk1><a:lt1><a:srgbClr val="' + (th.dark ? th.text : th.bg) + '"/></a:lt1><a:dk2><a:srgbClr val="' + th.muted + '"/></a:dk2><a:lt2><a:srgbClr val="' + th.surface + '"/></a:lt2>' +
      '<a:accent1><a:srgbClr val="' + th.accent + '"/></a:accent1><a:accent2><a:srgbClr val="' + th.accent2 + '"/></a:accent2><a:accent3><a:srgbClr val="' + mix(th.accent, th.accent2, 0.5) + '"/></a:accent3><a:accent4><a:srgbClr val="' + mix(th.accent, 'FFFFFF', 0.4) + '"/></a:accent4><a:accent5><a:srgbClr val="' + mix(th.accent2, '000000', 0.2) + '"/></a:accent5><a:accent6><a:srgbClr val="' + th.muted + '"/></a:accent6>' +
      '<a:hlink><a:srgbClr val="' + th.accent + '"/></a:hlink><a:folHlink><a:srgbClr val="' + th.muted + '"/></a:folHlink></a:clrScheme>' +
      '<a:fontScheme name="Sinai"><a:majorFont><a:latin typeface="' + th.head + '"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="' + th.body + '"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
      '<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
    var master = HEAD + '<p:sldMaster ' + NS + '><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="' + th.bg + '"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>';
    var layout = HEAD + '<p:sldLayout ' + NS + ' type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
    var title = xe(d.slides[0] ? d.slides[0].title : 'Presentasi');
    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return [
      { name: '[Content_Types].xml', content: HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' + overrides + '</Types>' },
      { name: '_rels/.rels', content: HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL + 'officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="' + REL + 'extended-properties" Target="docProps/app.xml"/></Relationships>' },
      { name: 'docProps/core.xml', content: HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + title + '</dc:title><dc:creator>Sinai</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified></cp:coreProperties>' },
      { name: 'docProps/app.xml', content: HEAD + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Sinai</Application><Slides>' + d.slides.length + '</Slides></Properties>' },
      { name: 'ppt/presentation.xml', content: HEAD + '<p:presentation ' + NS + ' saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>' + sldIds + '</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>' },
      { name: 'ppt/_rels/presentation.xml.rels', content: HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL + 'slideMaster" Target="slideMasters/slideMaster1.xml"/>' + presRels + '</Relationships>' },
      { name: 'ppt/slideMasters/slideMaster1.xml', content: master },
      { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', content: HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL + 'slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="' + REL + 'theme" Target="../theme/theme1.xml"/></Relationships>' },
      { name: 'ppt/slideLayouts/slideLayout1.xml', content: layout },
      { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', content: HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL + 'slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>' },
      { name: 'ppt/theme/theme1.xml', content: theme },
    ].concat(files).concat(Object.keys(media).map(function (m) { return { name: 'ppt/media/' + m, path: media[m] }; }));
  }

  window.Deck = {
    THEMES: THEMES, parse: parse, build: build, html: html, pptxFiles: pptxFiles, pickTheme: pickTheme,
    layouts: function (src) { return build(src).slides.map(function (s) { return s.layout; }); },
  };
})();
