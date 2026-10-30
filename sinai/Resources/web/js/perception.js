/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Lets models without vision understand images (and video frames): before a
   request, every image the model cannot see is turned into a detailed written
   description — by a vision-capable model the user has configured (the
   "vision helper") and/or by on-device analysis (Apple Vision: scene labels,
   people, animals, objects and their positions, barcodes, text, colours).
   Descriptions are cached on the message, so each image is analysed once. */
(function () {
  'use strict';

  var PREFER = [/gemini[^/]*flash(?!.*image)/i, /gpt-4\.1-mini|gpt-4o-mini|gpt-5-mini/i, /claude-haiku|claude-sonnet/i, /qwen.*vl/i, /gemini/i, /gpt-4o|gpt-4\.1|gpt-5/i, /grok-4/i, /llama-4/i, /pixtral/i, /./];

  /* A configured chat model that can see images (user choice first). */
  function helper(exclude) {
    var s = Store.settings.visionModel;
    if (s) { var r = Providers.resolve(s); if (r && r.info.vision) return r; }
    var list = Providers.allModels().filter(function (m) { return m.info.vision && !(exclude && m.providerId === exclude.provider.id && m.modelId === exclude.modelId) && !ImageGen.isImageModel(m.modelId); });
    var hs = function (m) { return window.Health ? Health.state(m.providerId, m.modelId) : 'unknown'; };
    list = list.filter(function (m) { return hs(m) !== 'err'; });
    list.sort(function (a, b) {
      function rank(m) { for (var i = 0; i < PREFER.length; i++) if (PREFER[i].test(m.modelId)) return i * 2 + (hs(m) === 'ok' ? 0 : 1); return 99; }
      return rank(a) - rank(b);
    });
    return list.length ? Providers.resolve(list[0]) : null;
  }

  function onDeviceText(a) {
    if (!a || a.unsupported) return '';
    var L = [];
    L.push('Ukuran: ' + a.width + '×' + a.height + ' px');
    if (a.labels && a.labels.length) L.push('Isi/adegan (klasifikasi): ' + a.labels.map(function (x) { return x.label + ' ' + Math.round(x.confidence * 100) + '%'; }).join(', '));
    if (a.people && a.people.length) L.push('Orang: ' + a.people.length + ' (' + a.people.join('; ') + ')');
    if (a.faces && a.faces.length) L.push('Wajah: ' + a.faces.length + ' (' + a.faces.join('; ') + ')');
    if (a.animals && a.animals.length) L.push('Hewan: ' + a.animals.join('; '));
    if (a.objects && a.objects.length) L.push('Objek menonjol: ' + a.objects.join('; '));
    if (a.barcodes && a.barcodes.length) L.push('Barcode/QR: ' + a.barcodes.join('; '));
    if (a.colors && a.colors.length) L.push('Warna dominan: ' + a.colors.join(', '));
    if (a.text) L.push('Teks terbaca:\n' + U.truncateMiddle(a.text, 4000));
    return L.join('\n');
  }

  var HELPER_PROMPT = 'You are the eyes of another AI that cannot see images. For each image, write a precise, exhaustive description so it can answer any question about it: ' +
    'type of image (photo, screenshot, chart, document, drawing…), overall scene, every important object/person/animal with position, appearance, actions, expressions (do not identify real people by name), ' +
    'ALL visible text verbatim, numbers and values in charts/tables (reconstruct tables as Markdown), UI layout and components for screenshots (with labels and states), colors, style, quality issues. ' +
    'Be factual, no speculation beyond what is visible. Answer in the language of the user context. Format: "### Gambar N" headers.';

  async function describeWithModel(r, imgs, context, signal) {
    var content = [{ type: 'text', text: 'User context (focus on what matters for it): ' + (context || '(none)').slice(0, 800) }];
    imgs.forEach(function (im, i) { content.push({ type: 'text', text: '### Gambar ' + (i + 1) + (im.name ? ' — ' + im.name : '') }); content.push({ type: 'image', mime: im.mime, data: im.data, name: im.name }); });
    var res = await Providers.complete(r, HELPER_PROMPT, [{ role: 'user', content: content }], { level: 'off', signal: signal, maxTokens: Math.min(6000, 900 * imgs.length + 400) });
    var text = String(res.text || '');
    var parts = text.split(/^###\s*Gambar\s*(\d+)[^\n]*$/m);
    var out = imgs.map(function () { return ''; });
    if (parts.length > 2) for (var i = 1; i < parts.length; i += 2) { var n = parseInt(parts[i], 10) - 1; if (out[n] !== undefined) out[n] = parts[i + 1].trim(); }
    else out[0] = text.trim();
    return { texts: out, model: r.info.name || r.modelId };
  }

  /* Describes the images in `blocks` (array of {type:'image', mime, data, name}) and stores b.vision. */
  async function describeBlocks(blocks, model, context, signal) {
    var todo = blocks.filter(function (b) { return b && !b.vision && b.data; });
    if (!todo.length) return;
    var native = await Promise.all(todo.map(function (b) {
      return Native.call('image.analyze', { base64: b.data }).catch(function () { return null; });
    }));
    var h = helper(model);
    var helped = null;
    if (h) {
      for (var i = 0; i < todo.length; i += 6) {
        try {
          var chunk = todo.slice(i, i + 6);
          var d = await describeWithModel(h, chunk, context, signal);
          helped = helped || { model: d.model, texts: [] };
          helped.texts = helped.texts.concat(d.texts);
        } catch (e) { console.warn('vision helper failed', e); break; }
      }
    }
    todo.forEach(function (b, k) {
      var parts = [];
      if (helped && helped.texts[k]) parts.push('Deskripsi visual (oleh ' + helped.model + '):\n' + helped.texts[k]);
      var nd = onDeviceText(native[k]);
      if (nd) parts.push('Analisis on-device (Apple Vision):\n' + nd);
      b.vision = parts.join('\n\n') || 'Gambar tidak dapat dianalisis (tidak ada model vision dan analisis on-device tidak tersedia). Tambahkan model yang bisa melihat gambar di Pengaturan.';
    });
  }

  /* Before a request to a model without vision: describe every image it would receive. */
  async function prepare(conv, r, signal, onStatus) {
    if (!r || r.info.vision) return;
    var lastUser = '';
    var pending = [];
    conv.messages.forEach(function (m) {
      if (m.compacted || m.uiOnly) return;
      if (m.role === 'user') {
        var t = (m.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join(' ');
        if (t) lastUser = t;
        var imgs = (m.content || []).filter(function (b) { return b.type === 'image' && !b.vision; });
        if (imgs.length) pending.push({ blocks: imgs, context: t });
      } else if (m.role === 'tool') {
        m.results.forEach(function (res) {
          var imgs = (res.images || []).filter(function (im) { return !im.vision; });
          if (imgs.length) pending.push({ blocks: imgs, context: lastUser, result: res });
        });
      }
    });
    if (!pending.length) return;
    if (onStatus) onStatus('Menganalisis ' + pending.reduce(function (n, p) { return n + p.blocks.length; }, 0) + ' gambar dengan vision Sinai…');
    for (var i = 0; i < pending.length; i++) {
      var p = pending[i];
      await describeBlocks(p.blocks, r, p.context, signal);
      if (p.result && !p.result.visionAppended) {
        p.result.content = (p.result.content || '') + '\n\n' + p.blocks.map(function (b, k) { return '[Gambar ' + (k + 1) + ' dari hasil alat — dianalisis oleh vision Sinai]\n' + b.vision; }).join('\n\n');
        p.result.visionAppended = true;
      }
    }
    Store.saveConv(conv);
  }

  /* Non-speech sounds in an audio/video file, as text. */
  async function soundText(path) {
    try {
      var r = await Native.call('audio.classify', { path: path });
      if (!r || r.unsupported || !(r.top || []).length) return '';
      function ts(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
      return 'Suara yang terdeteksi (on-device): ' + r.top.map(function (t) { return t.label + ' ±' + t.seconds + ' dtk'; }).join(', ') +
        ((r.segments || []).length ? '\nLini waktu suara: ' + r.segments.slice(0, 40).map(function (s) { return ts(s.start) + '–' + ts(s.end) + ' ' + s.label; }).join('; ') : '');
    } catch (e) { return ''; }
  }

  window.Perception = { prepare: prepare, describeBlocks: describeBlocks, helper: helper, soundText: soundText, onDeviceText: onDeviceText };
})();
