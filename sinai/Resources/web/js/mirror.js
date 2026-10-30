/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Cermin (mirror) untuk konektor: baca desain/halaman dari aplikasi lain
   (Canva, Figma, Google Slides/Docs, Notion, Miro, WordPress, Webflow, Wix,
   Shopify…), tiru 100% sebagai halaman yang bisa diedit di Sinai, edit di
   kanvas, lalu dorong hasilnya kembali ke sumber — semua halaman atau
   halaman tertentu saja.

   Tiap halaman sumber = satu artifact html  id="mirror-p<N>"  berisi
   <div data-mirror-page="N" data-source-id="…" style="width/height asli">
   dengan elemen berposisi absolut ber-atribut data-mirror-id (id elemen di
   sumber). Saat mendorong, Sinai membandingkan versi hasil tarikan dengan
   versi sekarang per elemen (teks, posisi, ukuran, warna, font, gambar), jadi
   AI hanya menerapkan perubahan yang benar-benar ada. */
(function () {
  'use strict';

  var PROFILES = [
    { id: 'canva', match: /canva/i, name: 'Canva', unit: 'halaman',
      pull: 'Canva: resolve short links first (resolve-shortlink). Read the design (read-design / get-design-content / get-design-pages or start-editing-transaction to get every page with its elements: ids, type, text + formatting, position, size, rotation, fills, image asset URLs). Get each page thumbnail (export-design png or the page thumbnail URLs) and use it as the visual reference for exact placement. If you opened an editing transaction only to read, cancel it.',
      push: 'Canva: start-editing-transaction on the design, then perform-editing-operations with the exact element ids (update text/formatting, position, size, fills, replace images via upload-asset-from-url), then commit-editing-transaction. Elements that are new in Sinai: insert them. Pages marked is_editable:false or operations Canva rejects: re-create that page in a new design in the same style (generate-design-structured / create-design-from-candidate) and report both links.' },
    { id: 'figma', match: /figma/i, name: 'Figma', unit: 'frame',
      pull: 'Figma: read the file/frames (get_metadata / get_design_context / get_code / get_screenshot / get_variable_defs) for node ids, auto-layout, sizes, fills, text styles and variables; use the screenshot as the visual reference.',
      push: 'Figma: apply changes with the write tools the server offers (e.g. use_figma / set properties per node id). If the server is read-only (Dev Mode), say so and export the edited frames as code/HTML or a new file instead.' },
    { id: 'gworkspace', match: /google|gworkspace|slides|docs/i, name: 'Google Slides/Docs', unit: 'slide',
      pull: 'Google Slides: read the presentation (pages, page elements with objectId, transform, size, text runs + styles, images) and slide thumbnails. Google Docs: read the document structure (headings, paragraphs, tables, inline images) — one mirror page per section or page break.',
      push: 'Google Slides: batchUpdate with requests per objectId (deleteText/insertText, updateTextStyle, updatePageElementTransform, replaceImage, createShape for new elements). Google Docs: batchUpdate with the minimal insert/delete/updateTextStyle requests.' },
    { id: 'notion', match: /notion/i, name: 'Notion', unit: 'halaman',
      pull: 'Notion: fetch the page(s) and their blocks (ids, type, rich text, children, images, databases).', push: 'Notion: update the changed blocks by block id (update-page / update block content), append new blocks after their neighbour, keep untouched blocks as they are.' },
    { id: 'miro', match: /miro/i, name: 'Miro', unit: 'frame',
      pull: 'Miro: read the board items (ids, type, position, geometry, style, content) per frame.', push: 'Miro: update items by id (position, geometry, style, content), create new items, keep the rest.' },
    { id: 'wordpress', match: /wordpress|wp-json/i, name: 'WordPress', unit: 'halaman',
      pull: 'WordPress: GET the page/post (content.rendered + raw blocks when available, featured media, template).', push: 'WordPress: update the page/post content with the edited HTML/blocks (POST /pages/<id> or /posts/<id>), upload new media first.' },
    { id: 'webflow', match: /webflow/i, name: 'Webflow', unit: 'halaman', pull: 'Webflow: read the site pages and their DOM/content nodes and styles.', push: 'Webflow: update page content nodes / static content by node id; publish only if the user asked.' },
    { id: 'wix', match: /wix/i, name: 'Wix', unit: 'halaman', pull: 'Wix: read the site pages and content.', push: 'Wix: update the page content through the available tools.' },
    { id: 'shopify', match: /shopify/i, name: 'Shopify', unit: 'halaman', pull: 'Shopify: read pages, theme sections/templates or products to mirror.', push: 'Shopify: update the page body_html / theme asset / product fields that changed.' },
  ];
  var GENERIC = { id: 'generic', name: 'Konektor', unit: 'halaman',
    pull: 'Use the connector tools to list and read the item and every page/section with element ids, layout, styles and media URLs.',
    push: 'Use the connector update tools to apply exactly the changed elements by id; create new elements where needed; never recreate untouched parts.' };

  function profileFor(serverName) {
    return PROFILES.find(function (p) { return p.match.test(serverName || ''); }) || GENERIC;
  }

  /* Connected connectors that can be mirrored (any ready MCP server with tools). */
  function available() {
    var seen = {}, out = [];
    MCP.tools().forEach(function (t) {
      if (seen[t._server]) return;
      seen[t._server] = true;
      out.push({ serverId: t._server, name: t._serverName, profile: profileFor(t._serverName) });
    });
    return out;
  }

  function parsePages(spec) {
    var s = String(spec || '').trim().toLowerCase();
    if (!s || /^(semua|all|\*)$/.test(s)) return null;
    var out = [];
    s.split(/[,\s]+/).forEach(function (part) {
      var m = /^(\d+)\s*-\s*(\d+)$/.exec(part);
      if (m) { for (var i = +m[1]; i <= +m[2] && out.length < 300; i++) out.push(i); }
      else if (/^\d+$/.test(part)) out.push(+part);
    });
    return out.length ? out.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; }) : null;
  }
  function pagesLabel(pages) { return pages && pages.length ? 'halaman ' + pages.join(', ') : 'semua halaman'; }

  /* Mirror page artifacts of this conversation: { n → artifact }. */
  function pageArtifacts(conv) {
    var out = {};
    Artifacts.collect(conv).list.forEach(function (a) { var m = /^mirror-p(\d+)$/.exec(a.id); if (m) out[+m[1]] = a; });
    return out;
  }
  function latest(a) { return a.versions[a.versions.length - 1]; }

  // ---------------------------------------------------------------- element diff

  function elements(html) {
    var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    var map = {};
    doc.querySelectorAll('[data-mirror-id]').forEach(function (el) {
      var st = el.getAttribute('style') || '';
      function prop(n) { var m = new RegExp('(?:^|;)\\s*' + n + '\\s*:\\s*([^;]+)', 'i').exec(st); return m ? m[1].trim() : ''; }
      var img = el.tagName === 'IMG' ? el.getAttribute('src') : (el.querySelector('img') && el.querySelector('img').getAttribute('src')) || (/url\(["']?([^"')]+)/.exec(prop('background-image')) || [])[1] || '';
      map[el.getAttribute('data-mirror-id')] = {
        kind: el.getAttribute('data-kind') || el.tagName.toLowerCase(),
        text: el.children.length && el.querySelector('[data-mirror-id]') ? '' : (el.textContent || '').replace(/\s+/g, ' ').trim(),
        left: prop('left'), top: prop('top'), width: prop('width'), height: prop('height'), rotate: (/rotate\(([^)]+)\)/.exec(prop('transform')) || [])[1] || '',
        color: prop('color'), background: prop('background-color') || (prop('background').indexOf('url(') < 0 ? prop('background') : ''), font: [prop('font-family'), prop('font-size'), prop('font-weight'), prop('font-style')].filter(Boolean).join(' '),
        align: prop('text-align'), opacity: prop('opacity'), image: img || '', hidden: /display\s*:\s*none/i.test(st),
      };
    });
    return map;
  }

  var FIELDS = ['text', 'left', 'top', 'width', 'height', 'rotate', 'color', 'background', 'font', 'align', 'opacity', 'image', 'hidden'];
  function diff(beforeHtml, afterHtml) {
    var a = elements(beforeHtml), b = elements(afterHtml), out = [];
    Object.keys(b).forEach(function (id) {
      if (!a[id]) { out.push({ op: 'add', id: id, kind: b[id].kind, el: b[id] }); return; }
      var ch = {};
      FIELDS.forEach(function (f) { if (String(a[id][f]) !== String(b[id][f])) ch[f] = { from: a[id][f], to: b[id][f] }; });
      if (Object.keys(ch).length) out.push({ op: 'update', id: id, kind: b[id].kind, changes: ch });
    });
    Object.keys(a).forEach(function (id) { if (!b[id]) out.push({ op: 'delete', id: id, kind: a[id].kind }); });
    return out;
  }

  function describe(changes) {
    return changes.map(function (c) {
      if (c.op === 'delete') return '- DELETE ' + c.kind + ' ' + c.id;
      if (c.op === 'add') return '- ADD ' + c.kind + ' (sinai id ' + c.id + '): ' + JSON.stringify(c.el);
      return '- UPDATE ' + c.kind + ' ' + c.id + ': ' + Object.keys(c.changes).map(function (f) {
        return f + ' ' + JSON.stringify(String(c.changes[f].from).slice(0, 300)) + ' → ' + JSON.stringify(String(c.changes[f].to).slice(0, 600));
      }).join('; ');
    }).join('\n');
  }

  /* Pages changed since the last pull/push: [{ n, artifact, changes }] */
  function changedPages(conv) {
    var mr = conv.mirror; if (!mr) return [];
    var arts = pageArtifacts(conv), out = [];
    Object.keys(arts).forEach(function (k) {
      var n = +k, a = arts[n], base = mr.base && mr.base[n];
      var cur = latest(a).content;
      if (base == null || cur === base) return;
      var ch = diff(base, cur);
      out.push({ n: n, artifact: a, changes: ch, structural: !ch.length });
    });
    return out.sort(function (x, y) { return x.n - y.n; });
  }

  // ---------------------------------------------------------------- flows

  function rules(conv) {
    var mr = conv.mirror;
    return '\n\n# Cermin (mirror) — ' + mr.profileName + ': ' + (mr.title || mr.source) + '\n' +
      'This conversation mirrors pages of an external ' + mr.profileName + ' item so the user edits them in Sinai and pushes them back. Rules for EVERY mirror page artifact:\n' +
      '- One artifact per source ' + mr.unit + ': <artifact id="mirror-p<N>" type="html" title="' + mr.profileName + ' · ' + mr.unit + ' <N>"> (N = 1-based page number in the source).\n' +
      '- Body margin 0; a root <div data-mirror-page="N" data-source-id="<source page id>" style="position:relative;width:<W>px;height:<H>px;overflow:hidden;background:…"> at the EXACT source size (scale to fit the viewport with a CSS transform in a tiny inline script, never by changing W/H).\n' +
      '- Every source element becomes one absolutely positioned child with data-mirror-id="<source element id>" data-kind="text|image|shape|group|video|table" and inline style left/top/width/height(px), transform:rotate(deg), opacity, colours, font-family/size/weight/style, line-height, letter-spacing, text-align exactly as in the source. Text stays real text. Images use the real asset/thumbnail URLs from the source. Load the source fonts from Google Fonts when available.\n' +
      '- Keep data-mirror-id / data-source-id on every edit. New elements the user adds get data-mirror-id="new-<short>". Never renumber or drop ids.\n' +
      '- Goal: visually identical to the source thumbnail (100%): compare against it and fix differences in position, size, colour, font and spacing before finishing.';
  }


  async function pull(conv, opts) {
    opts = opts || {};
    var srv = available().find(function (s) { return s.serverId === opts.serverId; }) || available()[0];
    if (!srv) throw new Error('Belum ada konektor yang tersambung. Buka Pengaturan → Konektor, hubungkan Canva/Figma/Notion/Google, lalu coba lagi.');
    var pages = parsePages(opts.pages);
    conv.mirror = Object.assign(conv.mirror || {}, { serverId: srv.serverId, serverName: srv.name, profile: srv.profile.id, profileName: srv.profile.name, unit: srv.profile.unit,
      source: opts.source, title: opts.title || (conv.mirror && conv.mirror.title) || '', pages: pages, status: 'pulling', base: (conv.mirror && conv.mirror.base) || {}, at: Date.now() });
    Store.saveConv(conv);
    var text = '[Cermin · TARIK dari ' + srv.name + ']\nSource: ' + opts.source + '\nPages: ' + pagesLabel(pages) + '\n\n' + srv.profile.pull +
      '\n\nThen create the mirror page artifacts exactly as described under "# Cermin" (one complete artifact per ' + srv.profile.unit + ', in page order' + (pages ? ', only pages ' + pages.join(', ') : '') + '). Before the artifacts, write one line: TITLE: <source title> | SIZE: <W>x<H> | PAGES: <total>. Do not change anything in ' + srv.name + ' during the pull.';
    await Engine.send(conv, { text: text, display: '⇣ Tarik dari ' + srv.name + ': ' + opts.source + ' (' + pagesLabel(pages) + ')' });
    settle(conv, pages, 'pulled');
  }

  /* After a pull/push: the current versions become the new baseline. */
  function settle(conv, pages, status) {
    var mr = conv.mirror; if (!mr) return;
    var arts = pageArtifacts(conv);
    Object.keys(arts).forEach(function (k) { if (!pages || pages.indexOf(+k) >= 0 || mr.base[k] == null) mr.base[k] = latest(arts[k]).content; });
    var last = conv.messages.filter(function (m) { return m.role === 'assistant'; }).pop();
    var t = last && /TITLE:\s*([^|\n]+)/.exec(Engine.textOf(last.content) || '');
    if (t && status === 'pulled') mr.title = t[1].trim();
    mr.status = last && last.error ? 'error' : status;
    mr.at = Date.now();
    Store.saveConv(conv);
    if (window.Panel) Panel.render();
  }

  async function push(conv, opts) {
    opts = opts || {};
    var mr = conv.mirror;
    if (!mr) throw new Error('Belum ada cermin. Tarik desain dari konektor dulu.');
    var want = opts.pages === 'changed' || opts.pages == null ? null : parsePages(opts.pages);
    var changed = changedPages(conv);
    var arts = pageArtifacts(conv);
    var targets = want ? want.map(function (n) { return changed.find(function (c) { return c.n === n; }) || (arts[n] ? { n: n, artifact: arts[n], changes: [], force: true } : null); }).filter(Boolean)
      : (opts.pages === 'all' ? Object.keys(arts).map(function (k) { return changed.find(function (c) { return c.n === +k; }) || { n: +k, artifact: arts[k], changes: [], force: true }; }) : changed);
    if (!targets.length) throw new Error('Tidak ada halaman yang berubah sejak terakhir ditarik/didorong.');
    var parts = targets.map(function (t) {
      var src = (/data-source-id="([^"]+)"/.exec(latest(t.artifact).content) || [])[1] || '';
      return '## ' + mr.unit + ' ' + t.n + (src ? ' (source id ' + src + ')' : '') + '\n' +
        (t.changes.length ? describe(t.changes) : t.force ? '(push the whole page as it is in artifact mirror-p' + t.n + ' — make the source match it exactly)' : '(layout/structure changed — make the source match artifact mirror-p' + t.n + ' exactly)');
    });
    mr.status = 'pushing';
    Store.saveConv(conv);
    var text = '[Cermin · DORONG ke ' + mr.serverName + ']\nSource: ' + mr.source + (mr.title ? ' (' + mr.title + ')' : '') + '\nUpdate ONLY these ' + mr.unit + 's: ' + targets.map(function (t) { return t.n; }).join(', ') +
      ' — leave every other ' + mr.unit + ' in the source untouched.\n\n' + (PROFILES.find(function (p) { return p.id === mr.profile; }) || GENERIC).push +
      '\n\nElement changes (ids are source element ids; values are CSS from the Sinai mirror):\n' + parts.join('\n\n') +
      '\n\nApply them in the source now, commit/save, then verify by reading the updated ' + mr.unit + 's (thumbnail) and fix any mismatch. Do not re-emit the mirror artifacts. Report in at most 4 lines with the link.';
    await Engine.send(conv, { text: text, display: '⇡ Dorong ke ' + mr.serverName + ': ' + mr.unit + ' ' + targets.map(function (t) { return t.n; }).join(', ') });
    var last = conv.messages.filter(function (m) { return m.role === 'assistant'; }).pop();
    if (last && !last.error && !last.aborted) settle(conv, targets.map(function (t) { return t.n; }), 'pushed');
    else { mr.status = 'error'; Store.saveConv(conv); if (window.Panel) Panel.render(); }
  }

  // ---------------------------------------------------------------- UI

  function dialog(conv, prefill) {
    var list = available();
    var h = U.h, m;
    var src = h('input.inp', { placeholder: 'Tautan atau ID desain/halaman (mis. https://www.canva.com/design/…)', value: (prefill && prefill.source) || (conv.mirror && conv.mirror.source) || '' });
    var pages = h('input.inp', { placeholder: 'semua · atau 1,3,5-8', value: (prefill && prefill.pages) || '' });
    var sel = h('select.inp', list.map(function (s) { return h('option', { value: s.serverId, text: s.name + ' (' + s.profile.name + ')' }); }));
    if (conv.mirror) sel.value = conv.mirror.serverId;
    function fld(label, el) { return h('label.mirror-fld', h('span', { text: label }), el); }
    function go() {
      if (!src.value.trim()) { src.focus(); return; }
      m.close();
      pull(conv, { serverId: sel.value, source: src.value.trim(), pages: pages.value }).catch(err);
    }
    src.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    var el = h('div.modal',
      h('div.modal-head', h('h3', { text: 'Cermin dari konektor' })),
      h('div.modal-body',
        h('p', { style: { margin: '0 0 12px', color: 'var(--text-2)' }, text: 'Sinai membaca desain di aplikasi yang tersambung, meniru tampilannya 100% sebagai halaman yang bisa diedit di sini, lalu mengunggah hasil editan kembali untuk memperbarui sumbernya — semua halaman atau halaman tertentu saja.' }),
        list.length ? fld('Konektor', sel) : h('div.err-box', { text: 'Belum ada konektor yang tersambung. Hubungkan Canva, Figma, Notion, Google, Miro, WordPress, Webflow… di Pengaturan → Konektor.' }),
        fld('Sumber', src), fld('Halaman', pages)),
      h('div.modal-foot',
        h('button.btn.ghost', { text: 'Batal', onclick: function () { m.close(); } }),
        h('button.btn', { text: 'Konektor…', onclick: function () { m.close(); Settings.open('connectors'); } }),
        h('button.btn.primary', { text: 'Tarik & tiru', disabled: !list.length, onclick: go })));
    m = UI.modal(el);
    setTimeout(function () { src.focus(); }, 30);
  }

  /* Bar above the canvas while a conversation mirrors an external item. */
  function bar(conv) {
    var mr = conv.mirror; if (!mr) return null;
    var h = U.h;
    var ch = changedPages(conv);
    var busy = Engine.isRunning(conv.id);
    var label = { pulling: 'Menarik…', pushing: 'Mendorong…', pulled: 'Tersalin', pushed: 'Tersinkron', error: 'Gagal — coba lagi' }[mr.status] || '';
    var pushBtn = h('button.btn.sm.primary', { text: ch.length ? 'Dorong ' + ch.length + ' ' + mr.unit : 'Dorong', disabled: busy, onclick: function () {
      UI.menu(pushBtn, [
        { label: 'Halaman yang diubah' + (ch.length ? ' (' + ch.map(function (c) { return c.n; }).join(', ') + ')' : ''), icon: 'arrowUp', onClick: function () { push(conv, { pages: 'changed' }).catch(err); } },
        { label: 'Semua halaman', icon: 'layers', onClick: function () { push(conv, { pages: 'all' }).catch(err); } },
        { label: 'Pilih halaman…', icon: 'list', onClick: function () {
          UI.prompt({ title: 'Dorong ' + mr.unit + ' tertentu', placeholder: '1,3,5-8', ok: 'Dorong' }).then(function (v) { if (v) push(conv, { pages: v }).catch(err); });
        } },
      ], { align: 'end', width: 260 });
    } });
    return h('div.mirror-bar',
      h('span.mb-ic', { html: U.icon('refresh') }),
      h('span.mb-t', { html: '<b>' + U.esc(mr.profileName) + '</b> · ' + U.esc(mr.title || mr.source) + ' <em>' + U.esc(label) + (ch.length ? ' · ' + ch.length + ' berubah' : '') + '</em>' }),
      h('button.btn.sm', { text: 'Tarik ulang', disabled: busy, onclick: function () { dialog(conv, { source: mr.source, pages: mr.pages ? mr.pages.join(',') : '' }); } }),
      pushBtn);
  }
  function err(e) { UI.toast(e.message, { error: true }); }

  window.Mirror = {
    PROFILES: PROFILES, available: available, parsePages: parsePages, diff: diff, describe: describe, changedPages: changedPages,
    pull: pull, push: push, dialog: dialog, bar: bar, promptSection: function (conv) { return conv && conv.mirror ? rules(conv) : ''; },
  };
})();
