/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Real image generation & editing with whatever image model the user's keys
   unlock: Google Gemini image ("Nano Banana") & Imagen, OpenAI gpt-image /
   DALL·E, OpenRouter image models, xAI, Together/Fireworks/SiliconFlow FLUX,
   and any OpenAI-compatible /images/generations endpoint. The chat model
   writes a detailed prompt; results are saved as PNG files and shown in the
   canvas like every other generated file. */
(function () {
  'use strict';

  var IMAGE_MODEL = /gpt-image|dall-e|imagen|gemini[^/]*image|nano-banana|flux|sdxl|stable-diffusion|\bsd3|sd-?3\.5|grok[^/]*image|seedream|qwen-image|hidream|kolors|recraft|ideogram|cogview|wanx|janus-pro|playground-v|image-preview|-image-gen/i;
  var PRIORITY = [/gemini-3[^/]*image|gemini-2\.5[^/]*image|nano-banana/i, /gpt-image-1/i, /imagen-4/i, /imagen/i, /seedream/i, /flux[^/]*(pro|max|dev)/i, /flux/i, /qwen-image/i, /grok[^/]*image/i, /dall-e-3/i, /./];

  function isImageModel(id) { return IMAGE_MODEL.test(String(id || '')); }

  function candidates() {
    var out = [];
    Store.settings.providers.forEach(function (p) {
      if (p.enabled === false) return;
      (p.models || []).forEach(function (m) { if (isImageModel(m.id)) out.push({ providerId: p.id, modelId: m.id, provider: p, name: (m.name || m.id) + ' · ' + p.name }); });
    });
    out.sort(function (a, b) {
      function rank(x) { for (var i = 0; i < PRIORITY.length; i++) if (PRIORITY[i].test(x.modelId)) return i; return 99; }
      return rank(a) - rank(b);
    });
    return out;
  }

  function pick() {
    var s = Store.settings.imageModel;
    var list = candidates();
    if (s) { var hit = list.find(function (c) { return c.providerId === s.providerId && c.modelId === s.modelId; }); if (hit) return hit; }
    return list[0] || null;
  }

  var SIZES = { '1:1': '1024x1024', '16:9': '1536x1024', '3:2': '1536x1024', '4:3': '1536x1024', '9:16': '1024x1536', '2:3': '1024x1536', '3:4': '1024x1536', '4:5': '1024x1536', '5:4': '1536x1024', '21:9': '1536x1024' };

  async function post(url, headers, body, timeout) {
    var r = await Native.call('http.request', { url: url, method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Accept: 'application/json' }, headers), body: JSON.stringify(body), timeout: timeout || 300 });
    var j = null;
    try { j = JSON.parse(r.body); } catch (e) { j = null; }
    if (r.status >= 400 || !j) {
      var msg = j && (j.error && (j.error.message || j.error)) || String(r.body || '').slice(0, 300);
      throw new Error('Pembuatan gambar gagal (HTTP ' + r.status + '): ' + (typeof msg === 'string' ? msg : JSON.stringify(msg)).slice(0, 400));
    }
    return j;
  }

  async function fetchImage(url) {
    if (/^data:/.test(url)) { var m = /^data:([^;]+);base64,(.*)$/.exec(url); return m ? { mime: m[1], data: m[2] } : null; }
    var r = await Native.call('http.request', { url: url, method: 'GET', binary: true, timeout: 120 });
    return r.status === 200 && r.base64 ? { mime: (r.headers['content-type'] || 'image/png').split(';')[0], data: r.base64 } : null;
  }

  function geminiRoot(p) {
    var b = Providers.baseUrl(p);
    if (/generativelanguage\.googleapis\.com/.test(b)) return 'https://generativelanguage.googleapis.com/v1beta';
    return b.replace(/\/openai\/?$/, '');
  }

  /* → [{mime, data(base64)}] */
  async function generate(opts) {
    var c = opts.model || pick();
    if (!c) throw new Error('NO_IMAGE_MODEL');
    var p = c.provider || Store.provider(c.providerId);
    var key = await Store.getKey(p.id);
    var id = String(c.modelId).replace(/^models\//, ''), n = Math.max(1, Math.min(4, opts.count || 1)), ar = opts.aspect || '1:1';
    var refs = opts.references || [];
    var images = [];
    var google = p.presetId === 'gemini' || /generativelanguage\.googleapis\.com/.test(p.baseUrl || '');
    if (google && /imagen/i.test(id)) {
      var j = await post(geminiRoot(p) + '/models/' + id + ':predict', { 'x-goog-api-key': key }, { instances: [{ prompt: opts.prompt }], parameters: { sampleCount: n, aspectRatio: ar } });
      (j.predictions || []).forEach(function (x) { if (x.bytesBase64Encoded) images.push({ mime: x.mimeType || 'image/png', data: x.bytesBase64Encoded }); });
    } else if (google) {
      for (var i = 0; i < n; i++) {
        var parts = [{ text: opts.prompt }].concat(refs.map(function (r) { return { inline_data: { mime_type: r.mime, data: r.data } }; }));
        var g = await post(geminiRoot(p) + '/models/' + id + ':generateContent', { 'x-goog-api-key': key },
          { contents: [{ role: 'user', parts: parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: ar } } });
        ((g.candidates && g.candidates[0] && g.candidates[0].content && g.candidates[0].content.parts) || []).forEach(function (pt) {
          var d = pt.inlineData || pt.inline_data;
          if (d && d.data) images.push({ mime: d.mimeType || d.mime_type || 'image/png', data: d.data });
        });
      }
    } else if (p.presetId === 'openrouter' || /openrouter\.ai/.test(p.baseUrl || '')) {
      for (var k = 0; k < n; k++) {
        var content = [{ type: 'text', text: opts.prompt }].concat(refs.map(function (r) { return { type: 'image_url', image_url: { url: 'data:' + r.mime + ';base64,' + r.data } }; }));
        var o = await post(Providers.baseUrl(p) + '/chat/completions', Providers.authHeaders(p, key), { model: id, messages: [{ role: 'user', content: content }], modalities: ['image', 'text'], image_config: { aspect_ratio: ar } });
        var msg = o.choices && o.choices[0] && o.choices[0].message;
        for (var q = 0; msg && msg.images && q < msg.images.length; q++) {
          var im = await fetchImage((msg.images[q].image_url || {}).url || msg.images[q].url || '');
          if (im) images.push(im);
        }
      }
    } else {
      // OpenAI and OpenAI-compatible /images/generations (Together, Fireworks, xAI, SiliconFlow…)
      var body = { model: id, prompt: opts.prompt, n: n };
      if (/gpt-image/i.test(id)) { body.size = SIZES[ar] || '1024x1024'; body.quality = opts.quality || 'high'; }
      else if (/dall-e-3/i.test(id)) { body.size = SIZES[ar] === '1536x1024' ? '1792x1024' : SIZES[ar] === '1024x1536' ? '1024x1792' : '1024x1024'; body.response_format = 'b64_json'; body.n = 1; }
      else { body.response_format = 'b64_json'; var wh = (SIZES[ar] || '1024x1024').split('x'); body.width = +wh[0]; body.height = +wh[1]; body.aspect_ratio = ar; }
      var r;
      try { r = await post(Providers.baseUrl(p) + '/images/generations', Providers.authHeaders(p, key), body); }
      catch (e) {
        // Some servers reject the extra size fields — retry with the bare minimum.
        if (!/HTTP 4\d\d/.test(e.message)) throw e;
        r = await post(Providers.baseUrl(p) + '/images/generations', Providers.authHeaders(p, key), { model: id, prompt: opts.prompt, n: body.n });
      }
      for (var x = 0; x < (r.data || []).length; x++) {
        var d2 = r.data[x];
        if (d2.b64_json) images.push({ mime: 'image/png', data: d2.b64_json });
        else if (d2.url) { var f = await fetchImage(d2.url); if (f) images.push(f); }
      }
    }
    if (!images.length) throw new Error('Model gambar tidak mengembalikan gambar (mungkin prompt ditolak oleh filter keamanan penyedia). Ubah prompt lalu coba lagi.');
    return { images: images, model: c };
  }

  /* Tool entry: generate, save as files, show in the canvas. */
  async function run(a, ctx) {
    var prompt = String(a.prompt || '').trim();
    if (!prompt) throw new Error('prompt wajib diisi');
    var refs = [];
    var conv = ctx && ctx.conv;
    if (a.use_attachments && conv) {
      for (var i = conv.messages.length - 1; i >= 0 && !refs.length; i--) {
        var m = conv.messages[i];
        if (m.role === 'user') (m.content || []).forEach(function (b) { if (b.type === 'image') refs.push({ mime: b.mime, data: b.data }); });
      }
    }
    for (var j = 0; j < (a.reference_paths || []).length && refs.length < 4; j++) {
      try { var im = await Native.call('image.prepare', { path: ctx.abs(a.reference_paths[j]), maxDim: 2048 }); if (im && im.data) refs.push({ mime: im.mime || 'image/jpeg', data: im.data }); } catch (e) { /* skip */ }
    }
    var c = pick();
    if (!c) {
      return { isError: true, content: 'No image-generation model is configured (e.g. Gemini "gemini-2.5-flash-image" / Imagen with a Google AI Studio key, OpenAI gpt-image-1, or an OpenRouter image model). ' +
        'Tell the user they can add one in Settings → Provider (it is detected automatically), and meanwhile create the image as a polished SVG/HTML illustration with create_file (kind image, format png).' };
    }
    if (ctx && ctx.progress) ctx.progress({ type: 'output', command: '', output: 'Membuat gambar dengan ' + c.name + '…', running: true });
    var res = await generate({ prompt: prompt, aspect: a.aspect_ratio, count: a.count, references: refs, model: c });
    var dir = Outputs.outputDir(conv);
    await Native.call('fs.mkdir', { path: dir });
    var base = String(a.filename || prompt.split(/\s+/).slice(0, 6).join(' ')).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Gambar Sinai';
    var saved = [];
    for (var k = 0; k < res.images.length; k++) {
      var ext = /jpe?g/.test(res.images[k].mime) ? 'jpg' : /webp/.test(res.images[k].mime) ? 'webp' : 'png';
      var name = base + (res.images.length > 1 ? ' ' + (k + 1) : '');
      var tmp = await Native.call('fs.writeTemp', { base64: res.images[k].data, name: 'img.' + ext });
      var out = dir + '/' + name + '.' + ext, n2 = 2;
      while ((await Native.call('fs.stat', { path: out })).exists) out = dir + '/' + name + ' (' + (n2++) + ').' + ext;
      await Native.call('fs.move', { from: tmp.path, to: out });
      saved.push({ path: out, ext: ext, name: U.basename(out) });
    }
    var st = await Native.call('fs.stat', { path: saved[0].path });
    var display = { type: 'file', id: Outputs.artifactId(base + '-' + Date.now().toString(36), saved[0].ext), kind: 'image', format: saved[0].ext, name: saved[0].name, path: saved[0].path, size: st.size,
      title: base, createdAt: Date.now(), generatedBy: c.name, more: saved.slice(1).map(function (x) { return x.path; }) };
    return {
      content: 'Generated ' + saved.length + ' image(s) with ' + c.name + ': ' + saved.map(function (x) { return x.path; }).join(', ') + '. They are shown to the user in the canvas. Reply briefly (what you made, 1–2 ideas to refine). To edit one, call generate_image again with reference_paths set to its path.',
      display: display,
    };
  }

  window.ImageGen = { candidates: candidates, pick: pick, generate: generate, run: run, isImageModel: isImageModel };
})();
