/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Code-designed files. The AI writes a presentation (or document / image) as
   real HTML + CSS — any layout, palette, typography, chart or illustration it
   can code — instead of filling a fixed template. The same source is:
   - shown live in the canvas (scaled 1280×720 slides with navigation),
   - printed to PDF page by page,
   - converted to an EDITABLE PowerPoint: every slide is rendered without its
     text as a pixel-perfect background picture, and each text block is laid
     on top as a real PowerPoint text box at its measured position, size,
     colour and weight. The user can open it in PowerPoint/Keynote and edit
     every word while the design stays exactly as coded.
   The user can also edit the source in the canvas (tab "Kode") and rebuild. */
(function () {
  'use strict';

  var W = 1280, H = 720;
  var SLIDE_RE = /<section\b[^>]*class\s*=\s*["'][^"']*\bslide\b/i;

  function isHtml(src) { return /^\s*</.test(String(src || '')) && /<\/?[a-z][\s\S]*>/i.test(String(src || '')); }
  function isDeck(src) { return SLIDE_RE.test(String(src || '')); }

  var BASE = '*,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0}' +
    '.slide{width:' + W + 'px;height:' + H + 'px;position:relative;overflow:hidden;margin:0}';

  /* Split author HTML into head extras (styles/fonts) and body content. */
  function parts(src) {
    src = String(src || '');
    var head = '', body = src;
    var hm = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(src);
    if (hm) head = hm[1].replace(/<meta[^>]*>/gi, '').replace(/<title[\s\S]*?<\/title>/i, '');
    var bm = /<body[^>]*>([\s\S]*)<\/body>/i.exec(src);
    if (bm) body = bm[1];
    else if (hm) body = src.slice(src.indexOf(hm[0]) + hm[0].length).replace(/<\/?html[^>]*>/gi, '');
    // Loose <style> blocks in a fragment belong in the head.
    if (!hm) body = body.replace(/<style[\s\S]*?<\/style>/gi, function (m) { head += m; return ''; });
    return { head: head, body: body.replace(/<\/?(html|body)[^>]*>/gi, '') };
  }

  /* mode: view (canvas, scaled + navigation) | print (PDF / PNG pages) | measure. */
  function deckDoc(src, mode) {
    var p = parts(src);
    var css = BASE;
    if (mode === 'view') {
      css += 'html,body{background:#15161d;height:100%;overflow:hidden}.deck-stage{position:fixed;inset:0}' +
        '.slide{position:absolute!important;top:50%;left:50%;margin:0!important;box-shadow:0 30px 80px rgba(0,0,0,.45);border-radius:6px;transform-origin:center}.slide:not(.gx-on){display:none!important}' +
        '.gx-nav{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;color:#cfd1e6;font:13px -apple-system,"Segoe UI",sans-serif;background:rgba(0,0,0,.45);padding:6px 10px;border-radius:20px;z-index:9}' +
        '.gx-nav button{background:none;border:0;color:#fff;font-size:18px;cursor:pointer;padding:0 8px}';
    } else {
      css += '@page{size:' + W + 'px ' + H + 'px;margin:0}body{background:#fff}.slide{page-break-after:always;break-after:page}';
    }
    var js = mode !== 'view' ? '' : '<script>(function(){var all=document.querySelectorAll(".slide"),cur=0,c=document.getElementById("gx-c");' +
      'function fit(){var k=Math.min(innerWidth/' + (W + 60) + ',innerHeight/' + (H + 70) + ');for(var i=0;i<all.length;i++)all[i].style.transform="translate(-50%,-50%) scale("+k+")"}' +
      'function go(i){cur=Math.max(0,Math.min(all.length-1,i));for(var j=0;j<all.length;j++)all[j].classList.toggle("gx-on",j===cur);c.textContent=(cur+1)+" / "+all.length}' +
      'document.getElementById("gx-p").onclick=function(){go(cur-1)};document.getElementById("gx-n").onclick=function(){go(cur+1)};' +
      'addEventListener("keydown",function(e){if(/Arrow(Right|Down)|PageDown| /.test(e.key))go(cur+1);if(/Arrow(Left|Up)|PageUp/.test(e.key))go(cur-1)});' +
      'addEventListener("resize",fit);fit();go(0)})();<\/script>';
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '</style>' + p.head + '</head><body>' +
      (mode === 'view' ? '<div class="deck-stage">' + p.body + '</div><div class="gx-nav"><button id="gx-p">‹</button><span id="gx-c"></span><button id="gx-n">›</button></div>' + js : p.body) +
      '</body></html>';
  }

  /* A document (report, letter, CV…) written as HTML: printed as-is on A4/Letter. */
  function pageDoc(src, opts) {
    opts = opts || {};
    var p = parts(src);
    var size = (opts.paper === 'letter' ? 'letter' : 'A4') + (opts.landscape ? ' landscape' : '');
    return '<!doctype html><html><head><meta charset="utf-8"><style>@page{size:' + size + ';margin:' + (opts.margin || '0') + '}*,*::before,*::after{box-sizing:border-box}html,body{margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>' +
      p.head + '</head><body>' + p.body + '</body></html>';
  }
  /* Canvas view of an HTML document: paper sheets on a dark desk. */
  function pageView(src, opts) {
    var p = parts(src);
    var wpx = (opts && opts.paper === 'letter') ? 816 : 794;
    if (opts && opts.landscape) wpx = Math.round(wpx * 1.414);
    return '<!doctype html><html><head><meta charset="utf-8"><style>html{background:#2a2b36}body{margin:24px auto;width:' + wpx + 'px;max-width:calc(100% - 32px);background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.4);min-height:1123px}</style>' +
      p.head + '</head><body>' + p.body + '</body></html>';
  }

  function count(src) {
    try {
      var d = new DOMParser().parseFromString(deckDoc(src, 'print'), 'text/html');
      return d.querySelectorAll('.slide').length;
    } catch (e) { return (String(src).match(new RegExp(SLIDE_RE.source, 'gi')) || []).length; }
  }

  // ---------------------------------------------------------------- measuring

  function loadFrame(html) {
    return new Promise(function (resolve, reject) {
      var f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-same-origin');
      f.setAttribute('aria-hidden', 'true');
      f.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + W + 'px;height:' + H + 'px;border:0;visibility:hidden;pointer-events:none';
      var done = false;
      f.onload = function () {
        if (done) return;
        done = true;
        var d = f.contentDocument;
        var ready = d && d.fonts && d.fonts.ready ? d.fonts.ready : Promise.resolve();
        Promise.race([ready, U.sleep(1500)]).then(function () { return U.sleep(60); }).then(function () { resolve(f); });
      };
      setTimeout(function () { if (!done) { done = true; f.remove(); reject(new Error('Gagal mengukur slide HTML')); } }, 15000);
      f.srcdoc = html;
      document.body.appendChild(f);
    });
  }

  function hex(c) {
    var m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?/.exec(c || '');
    if (!m) return { hex: '000000', a: 1 };
    var a = m[4] == null ? 1 : /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { hex: [m[1], m[2], m[3]].map(function (v) { return ('0' + Math.round(+v).toString(16)).slice(-2); }).join('').toUpperCase(), a: a };
  }
  function fontOf(cs) {
    var first = String(cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
    var mono = /mono|courier|consol|menlo/i.test(cs.fontFamily);
    if (!first || /^(-apple-system|system-ui|BlinkMacSystemFont|sans-serif|ui-sans-serif|Segoe UI|Helvetica Neue|SF Pro.*)$/i.test(first)) first = 'Arial';
    else if (/^(serif|ui-serif)$/i.test(first)) first = 'Georgia';
    return { font: first, mono: mono };
  }
  var INLINE = /^(inline|inline-block|contents)$/;
  function isInline(el, win) {
    if (el.tagName === 'BR') return true;
    var d = win.getComputedStyle(el).display;
    return d === 'inline' || d === 'contents';
  }

  /* Text blocks of one slide → Deck text elements; their text nodes are wrapped
     in <span data-gxt> so the background render can hide exactly them. */
  function measureSlide(slide, win) {
    var doc = slide.ownerDocument, base = slide.getBoundingClientRect(), out = [];
    var blocks = [];
    (function walk(el) {
      var cs = win.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (/^(SVG|svg|CANVAS|IMG|VIDEO|IFRAME|SCRIPT|STYLE|TEXTAREA|SELECT|INPUT)$/.test(el.tagName)) return;
      var own = false;
      for (var n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3 && n.nodeValue.trim()) own = true;
        else if (n.nodeType === 1 && isInline(n, win) && n.textContent.trim() && !n.querySelector('div,p,section,ul,ol,li,table,h1,h2,h3,h4,h5,h6')) own = true;
      }
      if (own && !isInline(el, win)) blocks.push(el);
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (!isInline(c, win) || !own) walk(c);
    })(slide);

    blocks.forEach(function (el) {
      var cs = win.getComputedStyle(el);
      // Gradient / clipped text cannot be a plain text box: it stays part of the picture.
      if (hex(cs.webkitTextFillColor || cs.color).a === 0 || /text/.test(cs.webkitBackgroundClip || cs.backgroundClip || '')) return;
      if (/rotate|matrix/.test(cs.transform) && cs.transform !== 'none') return;
      var size = parseFloat(cs.fontSize) || 16, col = hex(cs.color), f = fontOf(cs);
      var paras = [{ runs: [] }], rects = [], texts = [];
      (function collect(node, inh) {
        for (var n = node.firstChild; n; n = n.nextSibling) {
          if (n.nodeType === 3) {
            if (!n.nodeValue.trim() && !paras[paras.length - 1].runs.length) continue;
            var pcs = win.getComputedStyle(n.parentNode);
            var t = n.nodeValue.replace(/\s+/g, ' ');
            if (pcs.textTransform === 'uppercase') t = t.toUpperCase();
            else if (pcs.textTransform === 'lowercase') t = t.toLowerCase();
            var c2 = hex(pcs.color);
            paras[paras.length - 1].runs.push({ t: t, b: parseInt(pcs.fontWeight, 10) >= 600, i: pcs.fontStyle === 'italic', c: c2.hex !== col.hex ? c2.hex : null });
            texts.push(n);
          } else if (n.nodeType === 1) {
            if (n.tagName === 'BR') { paras.push({ runs: [] }); continue; }
            if (isInline(n, win)) collect(n, inh);
          }
        }
      })(el);
      paras = paras.map(function (p) {
        var runs = p.runs.filter(function (r) { return r.t; });
        if (runs.length) { runs[0].t = runs[0].t.replace(/^\s+/, ''); runs[runs.length - 1].t = runs[runs.length - 1].t.replace(/\s+$/, ''); }
        return { runs: runs.filter(function (r) { return r.t; }) };
      }).filter(function (p) { return p.runs.length; });
      if (!paras.length) return;
      texts.forEach(function (n) {
        var r = doc.createRange();
        r.selectNodeContents(n);
        Array.prototype.forEach.call(r.getClientRects(), function (x) { if (x.width && x.height) rects.push(x); });
      });
      if (!rects.length) return;
      var x1 = Math.min.apply(null, rects.map(function (r) { return r.left; })), y1 = Math.min.apply(null, rects.map(function (r) { return r.top; }));
      var x2 = Math.max.apply(null, rects.map(function (r) { return r.right; })), y2 = Math.max.apply(null, rects.map(function (r) { return r.bottom; }));
      var align = /center/.test(cs.textAlign) ? 'c' : /right|end/.test(cs.textAlign) ? 'r' : 'l';
      var x = x1 - base.left, y = y1 - base.top, w = x2 - x1, hgt = y2 - y1;
      var pad = Math.max(6, size * 0.35);
      if (align === 'c') { x -= pad; w += pad * 2; } else if (align === 'r') { x -= pad; w += pad; } else w += pad;
      var li = cs.display === 'list-item';
      if (li) {
        var ind = size * 1.1;
        x -= ind; w += ind;
        paras[0].bullet = true;
        var lvl = 0;
        for (var pnode = el.parentNode; pnode && pnode !== slide; pnode = pnode.parentNode) if (/^(UL|OL)$/.test(pnode.tagName)) lvl++;
        paras[0].level = Math.max(0, lvl - 1);
        el.setAttribute('data-gxl', '');
      }
      var lhPx = parseFloat(cs.lineHeight);
      out.push({ k: 't', x: Math.round(x), y: Math.round(y), w: Math.round(Math.max(8, w)), h: Math.round(hgt + size * 0.3), size: size,
        color: col.hex, alpha: col.a < 1 ? col.a : undefined, bold: parseInt(cs.fontWeight, 10) >= 600, font: f.font, mono: f.mono, align: align, valign: 't',
        lh: lhPx ? Math.max(0.9, lhPx / size) : 1.2, gap: 0.2, spacing: parseFloat(cs.letterSpacing) || 0, paras: paras, bulletColor: col.hex });
      texts.forEach(function (n) {
        var s = doc.createElement('span');
        s.setAttribute('data-gxt', '');
        n.parentNode.insertBefore(s, n);
        s.appendChild(n);
      });
    });
    return out;
  }

  var HIDE = '<style>[data-gxt]{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important}[data-gxl]::marker{color:transparent!important}</style>';

  async function tempPng() { return Store.info.supportDir + '/tmp/' + U.uid('o_') + '.png'; }
  function removeTemp(path) {
    var prefix = Store.info.supportDir + '/';
    if (path && path.indexOf(prefix + 'tmp/') === 0) Native.call('store.delete', { name: path.slice(prefix.length) }).catch(function () {});
  }

  /* Editable PPTX from HTML slides. Returns zip entries for export.zip. */
  async function pptx(src, opts) {
    opts = opts || {};
    var frame = await loadFrame(deckDoc(src, 'print'));
    var temps = [];
    try {
      var doc = frame.contentDocument, win = frame.contentWindow;
      var slides = Array.prototype.slice.call(doc.querySelectorAll('.slide'));
      if (!slides.length) throw new Error('Tidak ada <section class="slide"> di HTML presentasi.');
      var out = slides.map(function (s, i) {
        var title = (s.querySelector('h1,h2,h3') || s).textContent.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Slide ' + (i + 1);
        return { title: title, els: measureSlide(s, win), layout: 'html' };
      });
      // Backgrounds: the slides with their measured text hidden, 6 per strip image.
      var headEnd = doc.head.innerHTML + HIDE;
      await Native.call('fs.mkdir', { path: Store.info.supportDir + '/tmp' }).catch(function () {});
      for (var i = 0; i < slides.length; i += 6) {
        var batch = slides.slice(i, i + 6);
        var html = '<!doctype html><html><head>' + headEnd + '</head><body>' + batch.map(function (s) { return s.outerHTML; }).join('') + '</body></html>';
        var strip = await tempPng();
        temps.push(strip);
        if (opts.progress) opts.progress('Merender desain slide ' + (i + 1) + '–' + (i + batch.length) + ' dari ' + slides.length + '…');
        await Native.call('preview.export', { key: 'hd-' + U.uid(), html: html, format: 'png', width: W, pageHeight: H, pages: batch.length, name: 'slides', outPath: strip });
        batch.forEach(function (s, j) { out[i + j].bg = { path: strip, media: 'bg' + (i / 6 + 1) + '.png', top: j / batch.length, bottom: (batch.length - j - 1) / batch.length }; });
      }
      var files = Deck.pptxFiles(null, { slides: out, theme: opts.theme });
      return { files: files, temps: temps, slides: out.length };
    } catch (e) {
      temps.forEach(removeTemp);
      throw e;
    } finally { frame.remove(); }
  }

  window.HtmlDeck = { removeTemp: removeTemp, W: W, H: H, isHtml: isHtml, isDeck: isDeck, deckDoc: deckDoc, pageDoc: pageDoc, pageView: pageView, count: count, pptx: pptx, measureSlide: measureSlide, loadFrame: loadFrame };
})();
