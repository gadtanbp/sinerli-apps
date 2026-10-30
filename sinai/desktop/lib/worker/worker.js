// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Hidden helper page for the Windows/Linux host. Everything that needs a real
// browser engine runs here: HTML → Word/ODF/RTF conversion (DOM), PDF reading
// (pdf.js), image decoding/encoding (canvas), media metadata and frames,
// audio analysis (Web Audio), slide videos and screen/audio recording
// (MediaRecorder). The main process calls window.W.<fn>(args).
import * as pdfjs from './pdfjs/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = './pdfjs/pdf.worker.min.mjs';
const PDF_OPTS = { cMapUrl: './pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: './pdfjs/standard_fonts/', wasmUrl: './pdfjs/wasm/', iccUrl: './pdfjs/iccs/', isEvalSupported: false };

const W = {};
window.W = W;

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bytesOf(src) {
  if (src.base64) return Uint8Array.from(atob(src.base64), (c) => c.charCodeAt(0));
  const r = await fetch(src.url);
  if (!r.ok) throw new Error('File tidak bisa dibaca');
  return new Uint8Array(await r.arrayBuffer());
}

function b64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function canvasB64(canvas, mime, quality) {
  return canvas.toDataURL(mime, quality).split(',')[1] || '';
}

async function decodeImage(src) {
  const bytes = await bytesOf(src);
  const type = src.mime || sniffMime(bytes);
  const blob = new Blob([bytes], { type });
  if (type !== 'image/svg+xml') {
    try { return { img: await createImageBitmap(blob, { imageOrientation: 'from-image' }), type }; } catch (e) { /* try <img> */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('decode')); img.src = url; });
    const w = img.naturalWidth || 1024, h = img.naturalHeight || 1024;
    const c = new OffscreenCanvas(w, h);
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return { img: c.transferToImageBitmap(), type };
  } catch (e) {
    throw new Error('Format gambar ini tidak bisa dibaca (dekoder tidak tersedia). Ekspor ke PNG/JPEG/WebP dari aplikasi asalnya lalu lampirkan lagi.');
  } finally { URL.revokeObjectURL(url); }
}

function sniffMime(b) {
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (/avif|avis/.test(brand)) return 'image/avif';
    if (/heic|heix|mif1|msf1/.test(brand)) return 'image/heic';
  }
  if ((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d)) return 'image/tiff';
  const head = new TextDecoder().decode(b.subarray(0, 256)).trim();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)?<svg/i.test(head) || /<svg[\s>]/i.test(head)) return 'image/svg+xml';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon';
  return 'application/octet-stream';
}

function hasAlpha(bitmap) {
  const w = Math.min(bitmap.width, 256), h = Math.min(bitmap.height, 256);
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d');
  g.drawImage(bitmap, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

function encodeBitmap(bitmap, maxDim, preferPNG) {
  const w = bitmap.width, h = bitmap.height;
  const s = Math.min(1, maxDim / Math.max(w, h));
  const nw = Math.max(1, Math.round(w * s)), nh = Math.max(1, Math.round(h * s));
  const png = !!preferPNG && hasAlpha(bitmap);
  const c = document.createElement('canvas');
  c.width = nw; c.height = nh;
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, nw, nh); }
  g.drawImage(bitmap, 0, 0, nw, nh);
  const mime = png ? 'image/png' : 'image/jpeg';
  return { mime, data: canvasB64(c, mime, 0.86), width: nw, height: nh, origWidth: w, origHeight: h };
}

// ---------------------------------------------------------------- images
W.imagePrepare = async (p) => {
  const { img } = await decodeImage(p);
  return encodeBitmap(img, p.maxDim || 1600, !!p.png);
};

W.imageMeta = async (p) => {
  const bytes = await bytesOf(p);
  const type = sniffMime(bytes);
  const out = { format: type.replace('image/', ''), frames: 1 };
  try { const { img } = await decodeImage(Object.assign({}, p, { mime: type })); out.width = img.width; out.height = img.height; } catch (e) { /* unknown */ }
  return out;
};

function bmpEncode(imageData) {
  const { width: w, height: h, data } = imageData;
  const row = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + row * h;
  const buf = new Uint8Array(size), dv = new DataView(buf.buffer);
  buf[0] = 0x42; buf[1] = 0x4d; dv.setUint32(2, size, true); dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true); dv.setInt32(18, w, true); dv.setInt32(22, h, true); dv.setUint16(26, 1, true); dv.setUint16(28, 24, true);
  dv.setUint32(34, row * h, true); dv.setInt32(38, 2835, true); dv.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    const off = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, o = off + x * 3;
      buf[o] = data[i + 2]; buf[o + 1] = data[i + 1]; buf[o + 2] = data[i];
    }
  }
  return buf;
}

function tiffEncode(imageData) {
  // Baseline uncompressed RGBA TIFF.
  const { width: w, height: h, data } = imageData;
  const entries = 11, ifdSize = 2 + entries * 12 + 4;
  const bpsOff = 8 + ifdSize, extraOff = bpsOff + 8, pixOff = extraOff + 16;
  const buf = new Uint8Array(pixOff + w * h * 4), dv = new DataView(buf.buffer);
  buf[0] = 0x49; buf[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, 8, true);
  let p = 8; dv.setUint16(p, entries, true); p += 2;
  const tag = (id, type, count, value) => { dv.setUint16(p, id, true); dv.setUint16(p + 2, type, true); dv.setUint32(p + 4, count, true); if (type === 3 && count === 1) dv.setUint16(p + 8, value, true); else dv.setUint32(p + 8, value, true); p += 12; };
  tag(256, 4, 1, w); tag(257, 4, 1, h); tag(258, 3, 4, bpsOff); tag(259, 3, 1, 1); tag(262, 3, 1, 2);
  tag(273, 4, 1, pixOff); tag(277, 3, 1, 4); tag(278, 4, 1, h); tag(279, 4, 1, w * h * 4); tag(284, 3, 1, 1); tag(338, 3, 1, 2);
  dv.setUint32(p, 0, true);
  for (let i = 0; i < 4; i++) dv.setUint16(bpsOff + i * 2, 8, true);
  buf.set(data, pixOff);
  return buf;
}

W.convertImage = async (p) => {
  const { img } = await decodeImage(p);
  const fmt = String(p.format || 'jpeg').toLowerCase();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  if (fmt === 'jpg' || fmt === 'jpeg' || fmt === 'bmp') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
  g.drawImage(img, 0, 0);
  if (fmt === 'jpg' || fmt === 'jpeg') return { base64: canvasB64(c, 'image/jpeg', p.quality || 0.9), ext: 'jpg' };
  if (fmt === 'png' || fmt === 'pdf' || fmt === 'pdf-a' || fmt === 'pdfa') return { base64: canvasB64(c, 'image/png'), ext: fmt === 'png' ? 'png' : 'pdf', width: c.width, height: c.height };
  if (fmt === 'webp') return { base64: canvasB64(c, 'image/webp', p.quality || 0.9), ext: 'webp' };
  if (fmt === 'bmp') return { base64: b64(bmpEncode(g.getImageData(0, 0, c.width, c.height))), ext: 'bmp' };
  if (fmt === 'tif' || fmt === 'tiff') return { base64: b64(tiffEncode(g.getImageData(0, 0, c.width, c.height))), ext: 'tiff' };
  throw new Error('Format gambar ' + fmt + ' tidak didukung di sini. Pilih JPEG, PNG, WebP, TIFF, BMP, atau PDF.');
};

// ---------------------------------------------------------------- PDF
async function openPdf(p) {
  const data = await bytesOf(p);
  try {
    const task = pdfjs.getDocument(Object.assign({ data, password: p.password || undefined }, PDF_OPTS));
    const doc = await task.promise;
    doc.__task = task;
    return doc;
  } catch (e) {
    if (e && e.name === 'PasswordException') {
      throw new Error(p.password ? 'PDF_LOCKED: Kata sandi PDF salah.' : 'PDF_LOCKED: PDF ini dilindungi kata sandi.');
    }
    throw new Error('PDF tidak bisa dibuka (file rusak atau bukan PDF)');
  }
}

async function pageText(page) {
  const tc = await page.getTextContent();
  let out = '', lastY = null;
  for (const it of tc.items) {
    if (!('str' in it)) continue;
    const y = it.transform ? it.transform[5] : null;
    if (lastY != null && y != null && Math.abs(y - lastY) > 2 && !out.endsWith('\n')) out += '\n';
    out += it.str;
    if (it.hasEOL) out += '\n';
    lastY = y;
  }
  return out;
}

async function renderPage(page, maxDim, mime) {
  const v1 = page.getViewport({ scale: 1 });
  const scale = Math.min(3, maxDim / Math.max(v1.width, v1.height));
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas');
  c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp, canvas: c }).promise;
  return { canvas: c, data: canvasB64(c, mime || 'image/jpeg', 0.86) };
}

W.pdfRead = async (p) => {
  const doc = await openPdf(p);
  try {
    const maxPages = p.maxPages || 400;
    const n = Math.min(doc.numPages, maxPages);
    const parts = [];
    let textChars = 0;
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const t = await pageText(page);
      textChars += t.trim().length;
      parts.push('--- Halaman ' + i + ' ---\n' + t);
      page.cleanup();
    }
    const out = { pages: doc.numPages, text: parts.join('\n\n'), textChars, scanned: n > 0 && textChars < 40 * n };
    try { const meta = await doc.getMetadata(); if (meta && meta.info && meta.info.Title) out.title = meta.info.Title; } catch (e) { /* none */ }
    const want = p.images | 0;
    if (want > 0 || (out.scanned && p.ocrImages)) {
      const imgs = [];
      const count = Math.min(n, want > 0 ? want : (p.ocrPages || 30));
      for (let i = 1; i <= count; i++) {
        const page = await doc.getPage(i);
        const r = await renderPage(page, want > 0 ? 1400 : 2000, want > 0 ? 'image/jpeg' : 'image/png');
        imgs.push({ mime: want > 0 ? 'image/jpeg' : 'image/png', data: r.data, width: r.canvas.width, height: r.canvas.height });
        page.cleanup();
      }
      if (want > 0) out.images = imgs; else out.ocrImages = imgs;
    }
    return out;
  } finally { (doc.__task || doc).destroy(); }
};

W.pdfThumb = async (p) => {
  const doc = await openPdf(p);
  try {
    const page = await doc.getPage(1);
    const r = await renderPage(page, p.size || 1200, 'image/png');
    return { mime: 'image/png', data: r.data, width: r.canvas.width, height: r.canvas.height };
  } finally { (doc.__task || doc).destroy(); }
};

// ---------------------------------------------------------------- media
function loadMedia(url, video) {
  return new Promise((resolve, reject) => {
    const el = document.createElement(video ? 'video' : 'audio');
    el.preload = 'auto';
    el.muted = true;
    el.crossOrigin = 'anonymous';
    const t = setTimeout(() => reject(new Error('Media tidak bisa dibaca (format/codec tidak didukung)')), 30000);
    el.onloadedmetadata = () => { clearTimeout(t); resolve(el); };
    el.onerror = () => { clearTimeout(t); reject(new Error('Media tidak bisa dibaca (format/codec tidak didukung)')); };
    el.src = url;
  });
}

function seek(el, time) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, 5000);
    el.onseeked = () => { clearTimeout(t); resolve(); };
    el.currentTime = time;
  });
}

W.mediaInfo = async (p) => {
  const el = await loadMedia(p.url, true);
  const duration = isFinite(el.duration) ? el.duration : 0;
  const out = { duration, metadata: {} };
  if (el.videoWidth) out.video = { width: el.videoWidth, height: el.videoHeight, fps: 0 };
  let audio = !el.videoWidth;
  try { const s = el.captureStream ? el.captureStream() : null; if (s) { await sleep(50); audio = audio || s.getAudioTracks().length > 0; } } catch (e) { /* unknown */ }
  if (!audio && el.videoWidth) audio = true; // most videos carry sound; never claim silence we cannot verify
  out.audio = audio;
  const req = p.frames | 0;
  if (req > 0 && el.videoWidth) {
    const count = Math.min(req, 60), frames = [];
    const c = document.createElement('canvas');
    const s = Math.min(1, 1280 / Math.max(el.videoWidth, el.videoHeight));
    c.width = Math.round(el.videoWidth * s); c.height = Math.round(el.videoHeight * s);
    const g = c.getContext('2d');
    for (let i = 0; i < count; i++) {
      const t = duration * (i + 0.5) / count;
      await seek(el, t);
      g.drawImage(el, 0, 0, c.width, c.height);
      frames.push({ mime: 'image/jpeg', data: canvasB64(c, 'image/jpeg', 0.86), width: c.width, height: c.height, origWidth: el.videoWidth, origHeight: el.videoHeight, time: t });
    }
    out.frames = frames;
  }
  el.removeAttribute('src'); el.load();
  return out;
};

W.videoThumb = async (p) => {
  const el = await loadMedia(p.url, true);
  if (!el.videoWidth) throw new Error('Tidak ada gambar video');
  await seek(el, Math.min(1, (el.duration || 2) / 2));
  const s = Math.min(1, (p.size || 1200) / Math.max(el.videoWidth, el.videoHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(el.videoWidth * s); c.height = Math.round(el.videoHeight * s);
  c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
  return { mime: 'image/png', data: canvasB64(c, 'image/png'), width: c.width, height: c.height };
};

function stamp(s) {
  const t = Math.floor(s);
  const pad = (n) => String(n).padStart(2, '0');
  return t >= 3600 ? Math.floor(t / 3600) + ':' + pad(Math.floor(t / 60) % 60) + ':' + pad(t % 60) : pad(Math.floor(t / 60)) + ':' + pad(t % 60);
}

W.audioStats = async (p) => {
  const bytes = await bytesOf(p);
  const rate = 8000;
  let buf;
  try { buf = await new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes.buffer); }
  catch (e) { throw new Error('Tidak ada trek audio yang bisa dibaca'); }
  const maxSeconds = p.maxSeconds || 4 * 3600;
  const len = Math.min(buf.length, Math.floor(maxSeconds * rate));
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  const perSecond = [];
  let acc = 0, n = 0, peak = 0, clipped = 0;
  for (let i = 0; i < len; i++) {
    let s = 0;
    for (const ch of chans) s += ch[i];
    s /= chans.length;
    const a = Math.abs(s);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    acc += s * s; n++;
    if (n >= rate) { perSecond.push(Math.sqrt(acc / n)); acc = 0; n = 0; }
  }
  if (n > 0) perSecond.push(Math.sqrt(acc / n));
  const db = (x) => (x <= 0.00001 ? -100 : 20 * Math.log10(x));
  const dbs = perSecond.map(db);
  const silent = -45;
  const segments = [];
  let cur = null, segStart = 0;
  dbs.forEach((d, i) => {
    const s = d < silent;
    if (cur === null) { cur = s; segStart = i; }
    else if (s !== cur) {
      if (i - segStart >= 2) segments.push({ from: stamp(segStart), to: stamp(i), kind: cur ? 'hening' : 'suara' });
      cur = s; segStart = i;
    }
  });
  if (cur !== null) segments.push({ from: stamp(segStart), to: stamp(dbs.length), kind: cur ? 'hening' : 'suara' });
  const loud = dbs.filter((d) => d > silent);
  const avg = loud.length ? loud.reduce((a, b) => a + b, 0) / loud.length : -100;
  const timeline = [];
  for (let i = 0; i < dbs.length; i += 10) {
    const sl = dbs.slice(i, i + 10);
    timeline.push(stamp(i) + ' ' + Math.round(sl.reduce((a, b) => a + b, 0) / sl.length) + ' dB');
  }
  return {
    seconds: dbs.length, averageDb: Math.round(avg * 10) / 10, peakDb: Math.round(db(peak) * 10) / 10,
    silentRatio: dbs.length ? dbs.filter((d) => d < silent).length / dbs.length : 0,
    clippedSamples: clipped, segments: segments.slice(0, 400), timeline: timeline.slice(0, 720),
  };
};

// ---------------------------------------------------------------- slide video
function pickMime(kind) {
  const list = kind === 'audio'
    ? ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
    : ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return list.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

async function loadBitmap(url) {
  const r = await fetch(url);
  return createImageBitmap(await r.blob());
}

/** Streams a MediaRecorder into a file through the host, one chunk at a time. */
function recorderToFile(rec, token) {
  let first = true, chain = Promise.resolve();
  rec.ondataavailable = (e) => {
    if (!e.data || !e.data.size) return;
    const append = !first; first = false;
    chain = chain.then(async () => gxw.write(token, new Uint8Array(await e.data.arrayBuffer()), append));
  };
  return () => new Promise((resolve) => {
    rec.onstop = () => { chain.then(resolve, resolve); };
    if (rec.state !== 'inactive') rec.stop(); else chain.then(resolve, resolve);
  });
}

W.videoFormat = () => { const m = pickMime('video'); return { mime: m, ext: m.startsWith('video/mp4') ? 'mp4' : 'webm' }; };

W.videoMake = async (p) => {
  const width = p.width, height = p.height, fps = p.fps, fade = p.fade;
  const cache = new Map();
  const scenes = [];
  for (const f of p.frames) {
    if (!cache.has(f.url)) cache.set(f.url, await loadBitmap(f.url));
    let img = cache.get(f.url);
    if (f.y != null && f.h != null && f.baseWidth > 0) {
      const k = img.width / f.baseWidth;
      img = await createImageBitmap(img, 0, Math.round(f.y * k), img.width, Math.max(1, Math.round(f.h * k)));
    }
    scenes.push({ img, duration: Math.max(0.5, Math.min(f.duration || 4, 120)) });
  }
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const g = c.getContext('2d');
  const draw = (img, alpha) => {
    const s = Math.min(width / img.width, height / img.height);
    const dw = img.width * s, dh = img.height * s;
    g.globalAlpha = alpha;
    g.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
    g.globalAlpha = 1;
  };
  const mime = pickMime('video');
  if (!mime) throw new Error('Perekam video tidak tersedia di sistem ini');
  const stream = c.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.min(width * height * 4, 12000000) });
  const finish = recorderToFile(rec, p.token);
  g.fillStyle = '#000'; g.fillRect(0, 0, width, height);
  rec.start(1000);
  const total = scenes.reduce((a, s) => a + s.duration, 0);
  const t0 = performance.now();
  let prev = null, idx = 0, sceneStart = 0;
  await new Promise((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      while (idx < scenes.length && t >= sceneStart + scenes[idx].duration) { sceneStart += scenes[idx].duration; prev = scenes[idx].img; idx++; }
      if (idx >= scenes.length) { clearInterval(timer); resolve(); return; }
      const s = scenes[idx];
      g.fillStyle = '#000'; g.fillRect(0, 0, width, height);
      const local = t - sceneStart;
      if (prev && local < fade) { draw(prev, 1); draw(s.img, Math.min(1, local / Math.max(fade, 0.01))); }
      else draw(s.img, 1);
      gxw.progress(p.token, Math.min(0.99, t / total));
    };
    const timer = setInterval(tick, 1000 / fps);
    tick();
  });
  await finish();
  stream.getTracks().forEach((t) => t.stop());
  return { duration: total, scenes: scenes.length, narrated: false, mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
};

// ---------------------------------------------------------------- recording
const recordings = new Map();

W.recordStart = async (p) => {
  let stream, tracks = [];
  if (p.kind === 'audio') {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } else if (p.kind === 'system') {
    const d = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    d.getVideoTracks().forEach((t) => t.stop());
    if (!d.getAudioTracks().length) throw new Error('Audio sistem tidak tersedia di perangkat ini');
    stream = new MediaStream(d.getAudioTracks());
  } else {
    const d = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    tracks = d.getVideoTracks();
    if (p.mic) {
      try { const m = await navigator.mediaDevices.getUserMedia({ audio: true }); tracks = tracks.concat(m.getAudioTracks()); } catch (e) { /* no mic */ }
    }
    stream = new MediaStream(tracks);
  }
  const audioOnly = !stream.getVideoTracks().length;
  const mime = audioOnly ? pickMime('audio') : (pickMime('video').startsWith('video/mp4') && p.preferMp4 ? pickMime('video') : (['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || ''));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const finish = recorderToFile(rec, p.token);
  rec.start(1000);
  recordings.set(p.token, { rec, stream, finish, start: performance.now() });
  return { ext: audioOnly ? 'webm' : 'webm', mime: rec.mimeType };
};

W.recordStop = async (p) => {
  const r = recordings.get(p.token);
  if (!r) return { duration: 0 };
  recordings.delete(p.token);
  await r.finish();
  r.stream.getTracks().forEach((t) => t.stop());
  return { duration: (performance.now() - r.start) / 1000 };
};

// ---------------------------------------------------------------- HTML → documents
function parseHTML(html) {
  return new DOMParser().parseFromString(String(html || ''), 'text/html');
}

const BLOCK = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION', 'ADDRESS', 'CENTER', 'DETAILS', 'SUMMARY', 'DD', 'DT', 'DL', 'FORM', 'FIELDSET']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'HEAD', 'TITLE', 'META', 'LINK', 'NOSCRIPT', 'TEMPLATE', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'IFRAME', 'OBJECT', 'CANVAS']);

function xe(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
}

function cssColor(el, prop) {
  const v = el.style && el.style[prop];
  if (!v) return null;
  const m = /^#([0-9a-f]{6})$/i.exec(v.trim()) || /^#([0-9a-f]{3})$/i.exec(v.trim());
  if (m) return m[1].length === 3 ? m[1].split('').map((c) => c + c).join('').toUpperCase() : m[1].toUpperCase();
  const r = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
  return r ? [r[1], r[2], r[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('').toUpperCase() : null;
}

function pageBreakBefore(el) {
  const s = (el.getAttribute && (el.getAttribute('style') || '')) || '';
  return /page-break-before\s*:\s*always|break-before\s*:\s*page/i.test(s) || (el.classList && (el.classList.contains('page-break') || el.classList.contains('pagebreak')));
}

/**
 * A neutral intermediate form both the DOCX and ODT writers use:
 * blocks = [{type:'p'|'h'|'li'|'pre'|'quote'|'hr'|'table'|'img'|'pagebreak', level, runs, list:{id, ordered, level}, rows, align}]
 * runs = [{text, b, i, u, s, code, sup, sub, href, color, br}]
 */
function toBlocks(doc) {
  const blocks = [];
  let listSeq = 0;
  function runsOf(node, fmt, out) {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        const t = n.nodeValue.replace(/[\s\u00a0]+/g, (m) => (m.includes('\u00a0') ? m.replace(/[^\u00a0]/g, ' ') : ' '));
        if (t) out.push(Object.assign({ text: t }, fmt));
        continue;
      }
      if (n.nodeType !== 1 || SKIP.has(n.tagName)) continue;
      const tag = n.tagName;
      if (tag === 'BR') { out.push(Object.assign({ br: true, text: '' }, fmt)); continue; }
      if (tag === 'IMG') { out.push({ img: n.getAttribute('src') || '', alt: n.getAttribute('alt') || '', text: '' }); continue; }
      const f = Object.assign({}, fmt);
      if (tag === 'B' || tag === 'STRONG') f.b = true;
      if (tag === 'I' || tag === 'EM' || tag === 'CITE' || tag === 'DFN') f.i = true;
      if (tag === 'U' || tag === 'INS') f.u = true;
      if (tag === 'S' || tag === 'DEL' || tag === 'STRIKE') f.s = true;
      if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP' || tag === 'TT') f.code = true;
      if (tag === 'SUP') f.sup = true;
      if (tag === 'SUB') f.sub = true;
      if (tag === 'MARK') f.hl = true;
      if (tag === 'A' && n.getAttribute('href') && /^(https?:|mailto:)/i.test(n.getAttribute('href'))) { f.href = n.getAttribute('href'); f.u = true; f.color = '1F5FBF'; }
      const st = n.getAttribute('style') || '';
      if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(st)) f.b = true;
      if (/font-style\s*:\s*italic/i.test(st)) f.i = true;
      if (/text-decoration[^;]*underline/i.test(st)) f.u = true;
      const col = cssColor(n, 'color'); if (col) f.color = col;
      runsOf(n, f, out);
    }
    return out;
  }
  function trimRuns(runs) {
    while (runs.length && !runs[0].br && !runs[0].img && !runs[0].text.trim()) runs.shift();
    while (runs.length && !runs[runs.length - 1].br && !runs[runs.length - 1].img && !runs[runs.length - 1].text.trim()) runs.pop();
    if (runs.length && runs[0].text) runs[0] = Object.assign({}, runs[0], { text: runs[0].text.replace(/^ +/, '') });
    const l = runs.length - 1;
    if (l >= 0 && runs[l].text) runs[l] = Object.assign({}, runs[l], { text: runs[l].text.replace(/ +$/, '') });
    return runs;
  }
  function align(el) {
    const a = (el.getAttribute && (el.getAttribute('align') || '')) || '';
    const st = (el.getAttribute && el.getAttribute('style')) || '';
    const m = /text-align\s*:\s*(left|right|center|justify)/i.exec(st);
    return (m ? m[1] : a || '').toLowerCase() || null;
  }
  function inline(el, base) {
    const runs = trimRuns(runsOf(el, base || {}, []));
    return runs;
  }
  function walk(node, ctx) {
    let pendingInline = [];
    const flushInline = () => {
      const runs = trimRuns(pendingInline);
      pendingInline = [];
      if (runs.length) blocks.push(Object.assign({ type: ctx.quote ? 'quote' : 'p', runs }, ctx.list ? { type: 'li', list: ctx.list } : {}));
    };
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { if (n.nodeValue.trim() || pendingInline.length) pendingInline.push({ text: n.nodeValue.replace(/\s+/g, ' ') }); continue; }
      if (n.nodeType !== 1 || SKIP.has(n.tagName)) continue;
      const tag = n.tagName;
      if (pageBreakBefore(n)) { flushInline(); blocks.push({ type: 'pagebreak' }); }
      if (/^H[1-6]$/.test(tag)) { flushInline(); blocks.push({ type: 'h', level: +tag[1], runs: inline(n), align: align(n) }); }
      else if (tag === 'P') { flushInline(); const r = inline(n); if (r.length) blocks.push({ type: ctx.list ? 'li' : ctx.quote ? 'quote' : 'p', runs: r, list: ctx.list, align: align(n) }); }
      else if (tag === 'UL' || tag === 'OL') {
        flushInline();
        const level = ctx.list ? ctx.list.level + 1 : 0;
        const list = { id: ++listSeq, ordered: tag === 'OL', level: Math.min(level, 4), start: parseInt(n.getAttribute('start') || '1', 10) || 1 };
        for (const li of n.children) {
          if (li.tagName !== 'LI') continue;
          // Inline content of the item, then nested blocks.
          const head = [], rest = document.createElement('div');
          for (const c of Array.from(li.childNodes)) {
            if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL' || c.tagName === 'P' || c.tagName === 'DIV' || c.tagName === 'TABLE' || c.tagName === 'PRE' || c.tagName === 'BLOCKQUOTE')) rest.appendChild(c.cloneNode(true));
            else if (!rest.childNodes.length) head.push(c);
            else rest.appendChild(c.cloneNode(true));
          }
          const tmp = document.createElement('span');
          head.forEach((c) => tmp.appendChild(c.cloneNode(true)));
          let runs = inline(tmp);
          if (!runs.length && rest.firstElementChild && rest.firstElementChild.tagName === 'P') { runs = inline(rest.firstElementChild); rest.removeChild(rest.firstElementChild); }
          const checkbox = li.querySelector(':scope > input[type=checkbox]');
          if (checkbox) runs.unshift({ text: checkbox.checked ? '☑ ' : '☐ ' });
          blocks.push({ type: 'li', runs, list });
          if (rest.childNodes.length) walk(rest, Object.assign({}, ctx, { list }));
        }
      } else if (tag === 'PRE') {
        flushInline();
        blocks.push({ type: 'pre', text: n.textContent.replace(/\n$/, '') });
      } else if (tag === 'BLOCKQUOTE') { flushInline(); walk(n, Object.assign({}, ctx, { quote: true })); }
      else if (tag === 'HR') { flushInline(); blocks.push({ type: 'hr' }); }
      else if (tag === 'TABLE') {
        flushInline();
        const rows = [];
        for (const tr of n.querySelectorAll('tr')) {
          if (tr.closest('table') !== n) continue;
          const cells = [];
          for (const td of tr.children) {
            if (td.tagName !== 'TD' && td.tagName !== 'TH') continue;
            cells.push({ runs: inline(td), header: td.tagName === 'TH' || tr.parentElement.tagName === 'THEAD', span: parseInt(td.getAttribute('colspan') || '1', 10) || 1, align: align(td) });
          }
          if (cells.length) rows.push(cells);
        }
        if (rows.length) blocks.push({ type: 'table', rows });
      } else if (tag === 'IMG') { flushInline(); blocks.push({ type: 'img', src: n.getAttribute('src') || '', alt: n.getAttribute('alt') || '', width: parseInt(n.getAttribute('width') || '0', 10) || 0 }); }
      else if (tag === 'LI') { flushInline(); blocks.push({ type: 'li', runs: inline(n), list: ctx.list || { id: ++listSeq, ordered: false, level: 0, start: 1 } }); }
      else if (BLOCK.has(tag) || tag === 'BODY' || tag === 'HTML') { flushInline(); walk(n, ctx); }
      else if (tag === 'SVG' || tag === 'svg') { flushInline(); }
      else pendingInline.push(...runsOf(n, inlineFmt(n), []));
    }
    flushInline();
  }
  function inlineFmt(n) {
    const f = {};
    const tag = n.tagName;
    if (tag === 'B' || tag === 'STRONG') f.b = true;
    if (tag === 'I' || tag === 'EM') f.i = true;
    if (tag === 'U') f.u = true;
    if (tag === 'S' || tag === 'DEL') f.s = true;
    if (tag === 'CODE' || tag === 'KBD') f.code = true;
    if (tag === 'SUP') f.sup = true;
    if (tag === 'SUB') f.sub = true;
    if (tag === 'A' && /^(https?:|mailto:)/i.test(n.getAttribute('href') || '')) { f.href = n.getAttribute('href'); f.u = true; f.color = '1F5FBF'; }
    return f;
  }
  walk(doc.body || doc.documentElement, {});
  return blocks;
}

async function imageForDoc(src) {
  if (!src) return null;
  try {
    let blob;
    if (/^data:/i.test(src) || /^(https?|sinai-worker):/i.test(src)) blob = await (await fetch(src)).blob();
    else return null;
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    return { data: canvasB64(c, 'image/png'), width: bmp.width, height: bmp.height };
  } catch (e) { return null; }
}

// ---- DOCX
W.htmlToDocx = async (p) => {
  const doc = parseHTML(p.html);
  const title = (doc.querySelector('title') || {}).textContent || '';
  const blocks = toBlocks(doc);
  const rels = [];
  const media = [];
  let relSeq = 10, numSeq = 2, picSeq = 1;
  const nums = [];
  const listNum = new Map();
  const rel = (type, target, external) => { const id = 'rId' + (++relSeq); rels.push('<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/' + type + '" Target="' + xe(target) + '"' + (external ? ' TargetMode="External"' : '') + '/>'); return id; };

  const rPr = (r, extra) => {
    let s = '';
    if (r.code) s += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>';
    if (r.b) s += '<w:b/><w:bCs/>';
    if (r.i) s += '<w:i/><w:iCs/>';
    if (r.s) s += '<w:strike/>';
    if (r.color) s += '<w:color w:val="' + r.color + '"/>';
    if (r.code) s += '<w:sz w:val="20"/>';
    if (r.hl) s += '<w:highlight w:val="yellow"/>';
    if (r.u) s += '<w:u w:val="single"/>';
    if (r.sup) s += '<w:vertAlign w:val="superscript"/>';
    if (r.sub) s += '<w:vertAlign w:val="subscript"/>';
    if (r.code) s += '<w:shd w:val="clear" w:color="auto" w:fill="F1F3F7"/>';
    s += extra || '';
    return s ? '<w:rPr>' + s + '</w:rPr>' : '';
  };
  const drawing = (img, maxW) => {
    const id = rel('image', 'media/image' + picSeq + '.png');
    media.push({ name: 'word/media/image' + picSeq + '.png', base64: img.data });
    const emuW = Math.round(Math.min(img.width, maxW || 600) * 9525);
    const emuH = Math.round(emuW * img.height / img.width);
    const n = picSeq++;
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + emuW + '" cy="' + emuH + '"/><wp:docPr id="' + n + '" name="Gambar ' + n + '"/>' +
      '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:nvPicPr><pic:cNvPr id="' + n + '" name="image' + n + '.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + emuW + '" cy="' + emuH + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  };
  const runsXml = async (runs, base) => {
    let out = '';
    for (const r of runs) {
      if (r.img != null) { const im = await imageForDoc(r.img); if (im) out += drawing(im); else if (r.alt) out += '<w:r><w:t xml:space="preserve">[' + xe(r.alt) + ']</w:t></w:r>'; continue; }
      const f = Object.assign({}, base || {}, r);
      const body = r.br ? '<w:br/>' : '<w:t xml:space="preserve">' + xe(r.text) + '</w:t>';
      const run = '<w:r>' + rPr(f) + body + '</w:r>';
      out += r.href ? '<w:hyperlink r:id="' + rel('hyperlink', r.href, true) + '" w:history="1">' + run + '</w:hyperlink>' : run;
    }
    return out;
  };
  const jc = (a) => (a && a !== 'left' ? '<w:jc w:val="' + (a === 'justify' ? 'both' : a) + '"/>' : '');

  let body = '';
  for (const b of blocks) {
    if (b.type === 'h') body += '<w:p><w:pPr><w:pStyle w:val="Heading' + b.level + '"/>' + jc(b.align) + '</w:pPr>' + await runsXml(b.runs) + '</w:p>';
    else if (b.type === 'p') body += '<w:p>' + (b.align ? '<w:pPr>' + jc(b.align) + '</w:pPr>' : '') + await runsXml(b.runs) + '</w:p>';
    else if (b.type === 'quote') body += '<w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>' + await runsXml(b.runs) + '</w:p>';
    else if (b.type === 'li') {
      let numId;
      if (!b.list.ordered) numId = 1;
      else if (listNum.has(b.list.id)) numId = listNum.get(b.list.id);
      else { numId = numSeq++; listNum.set(b.list.id, numId); nums.push('<w:num w:numId="' + numId + '"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="' + b.list.level + '"><w:startOverride w:val="' + b.list.start + '"/></w:lvlOverride></w:num>'); }
      body += '<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="' + b.list.level + '"/><w:numId w:val="' + numId + '"/></w:numPr></w:pPr>' + await runsXml(b.runs) + '</w:p>';
    } else if (b.type === 'pre') {
      const lines = b.text.split('\n');
      body += '<w:p><w:pPr><w:pStyle w:val="Code"/></w:pPr>' + lines.map((l, i) => '<w:r>' + (i ? '<w:br/>' : '') + '<w:t xml:space="preserve">' + xe(l) + '</w:t></w:r>').join('') + '</w:p>';
    } else if (b.type === 'hr') body += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="C8CCD8"/></w:pBdr></w:pPr></w:p>';
    else if (b.type === 'pagebreak') body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    else if (b.type === 'img') { const im = await imageForDoc(b.src); if (im) body += '<w:p>' + drawing(im, b.width || 600) + '</w:p>'; }
    else if (b.type === 'table') {
      const cols = Math.max(...b.rows.map((r) => r.reduce((a, c) => a + c.span, 0)));
      const colW = Math.floor(9360 / cols);
      let t = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblLook w:val="04A0" w:firstRow="1"/></w:tblPr><w:tblGrid>' + ('<w:gridCol w:w="' + colW + '"/>').repeat(cols) + '</w:tblGrid>';
      for (const [ri, row] of b.rows.entries()) {
        const header = row.every((c) => c.header);
        t += '<w:tr>' + (header && ri === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : '');
        for (const cell of row) {
          t += '<w:tc><w:tcPr><w:tcW w:w="' + colW * cell.span + '" w:type="dxa"/>' + (cell.span > 1 ? '<w:gridSpan w:val="' + cell.span + '"/>' : '') + (cell.header ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF0F6"/>' : '') + '</w:tcPr>' +
            '<w:p>' + (cell.align ? '<w:pPr>' + jc(cell.align) + '</w:pPr>' : '') + await runsXml(cell.runs, cell.header ? { b: true } : null) + '</w:p></w:tc>';
        }
        t += '</w:tr>';
      }
      body += t + '</w:tbl><w:p/>';
    }
  }
  if (!body) body = '<w:p/>';
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + body +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>';
  const lvl = (i, ordered) => {
    const fmt = ordered ? ['decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter'][i] : 'bullet';
    const text = ordered ? '%' + (i + 1) + '.' : ['•', '◦', '▪', '•', '◦'][i];
    return '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/><w:numFmt w:val="' + fmt + '"/><w:lvlText w:val="' + text + '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="' + (720 + i * 360) + '" w:hanging="360"/></w:pPr>' + (ordered ? '' : '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr>') + '</w:lvl>';
  };
  const numberingXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>' + [0, 1, 2, 3, 4].map((i) => lvl(i, false)).join('') + '</w:abstractNum>' +
    '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>' + [0, 1, 2, 3, 4].map((i) => lvl(i, true)).join('') + '</w:abstractNum>' +
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' + nums.join('') + '</w:numbering>';
  const font = p.font || 'Calibri';
  const hs = [0, 32, 26, 24, 22, 22, 22];
  const heading = (n) => '<w:style w:type="paragraph" w:styleId="Heading' + n + '"><w:name w:val="heading ' + n + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="' + (n <= 2 ? 360 : 240) + '" w:after="120"/><w:outlineLvl w:val="' + (n - 1) + '"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="' + (n <= 2 ? '1E2236' : '2B3150') + '"/><w:sz w:val="' + hs[n] + '"/><w:szCs w:val="' + hs[n] + '"/></w:rPr></w:style>';
  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="' + font + '" w:hAnsi="' + font + '" w:eastAsia="' + font + '" w:cs="' + font + '"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="id-ID"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    [1, 2, 3, 4, 5, 6].map(heading).join('') +
    '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="C8CCD8"/></w:pBdr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/><w:color w:val="555B70"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F4F5F8"/><w:spacing w:after="160" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="19"/></w:rPr></w:style>' +
    '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="C8CCD8"/><w:left w:val="single" w:sz="4" w:space="0" w:color="C8CCD8"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="C8CCD8"/><w:right w:val="single" w:sz="4" w:space="0" w:color="C8CCD8"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="C8CCD8"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="C8CCD8"/></w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    '</w:styles>';
  const relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' + rels.join('') + '</Relationships>';
  return { title, documentXml, stylesXml, numberingXml, relsXml, media };
};

// ---- ODT
W.htmlToOdt = async (p) => {
  const doc = parseHTML(p.html);
  const blocks = toBlocks(doc);
  const styles = new Map();
  const tstyle = (r) => {
    const props = [];
    if (r.b) props.push('fo:font-weight="bold"');
    if (r.i) props.push('fo:font-style="italic"');
    if (r.u) props.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
    if (r.s) props.push('style:text-line-through-style="solid"');
    if (r.code) props.push('style:font-name="Liberation Mono" fo:font-family="\'Liberation Mono\', Consolas, monospace"');
    if (r.color) props.push('fo:color="#' + r.color + '"');
    if (r.sup) props.push('style:text-position="super 58%"');
    if (r.sub) props.push('style:text-position="sub 58%"');
    if (!props.length) return null;
    const k = props.join(' ');
    if (!styles.has(k)) styles.set(k, 'T' + (styles.size + 1));
    return styles.get(k);
  };
  const runs = (rs, base) => rs.map((r) => {
    if (r.img != null) return r.alt ? '[' + xe(r.alt) + ']' : '';
    if (r.br) return '<text:line-break/>';
    const f = Object.assign({}, base || {}, r);
    const st = tstyle(f);
    let t = xe(r.text).replace(/ {2,}/g, (m) => ' <text:s text:c="' + (m.length - 1) + '"/>');
    if (st) t = '<text:span text:style-name="' + st + '">' + t + '</text:span>';
    if (r.href) t = '<text:a xlink:type="simple" xlink:href="' + xe(r.href) + '">' + t + '</text:a>';
    return t;
  }).join('');
  let body = '';
  let openLists = []; // stack of {id, ordered}
  const closeListsTo = (depth) => { while (openLists.length > depth) { body += '</text:list-item></text:list>'; openLists.pop(); } };
  for (const b of blocks) {
    if (b.type !== 'li') closeListsTo(0);
    if (b.type === 'h') body += '<text:h text:style-name="Heading_20_' + b.level + '" text:outline-level="' + b.level + '">' + runs(b.runs) + '</text:h>';
    else if (b.type === 'p') body += '<text:p text:style-name="' + (b.align === 'center' ? 'PCenter' : b.align === 'right' ? 'PRight' : 'Text_20_body') + '">' + runs(b.runs) + '</text:p>';
    else if (b.type === 'quote') body += '<text:p text:style-name="Quotations">' + runs(b.runs) + '</text:p>';
    else if (b.type === 'pre') body += b.text.split('\n').map((l) => '<text:p text:style-name="Preformatted_20_Text">' + xe(l).replace(/ {2,}/g, (m) => ' <text:s text:c="' + (m.length - 1) + '"/>') + '</text:p>').join('');
    else if (b.type === 'hr') body += '<text:p text:style-name="HR"/>';
    else if (b.type === 'pagebreak') body += '<text:p text:style-name="PBreak"/>';
    else if (b.type === 'li') {
      const depth = b.list.level + 1;
      if (openLists.length >= depth && openLists[depth - 1].id !== b.list.id) closeListsTo(depth - 1);
      if (openLists.length === depth) body += '</text:list-item><text:list-item>';
      while (openLists.length < depth) {
        body += '<text:list' + (openLists.length === 0 ? ' text:style-name="' + (b.list.ordered ? 'LNum' : 'LBullet') + '"' : '') + '><text:list-item>';
        openLists.push({ id: b.list.id, ordered: b.list.ordered });
      }
      body += '<text:p text:style-name="List_20_Paragraph">' + runs(b.runs) + '</text:p>';
    } else if (b.type === 'table') {
      const cols = Math.max(...b.rows.map((r) => r.reduce((a, c) => a + c.span, 0)));
      body += '<table:table table:style-name="Tbl"><table:table-column table:number-columns-repeated="' + cols + '"/>';
      for (const row of b.rows) {
        body += '<table:table-row>';
        for (const c of row) body += '<table:table-cell table:style-name="' + (c.header ? 'CellH' : 'Cell') + '" office:value-type="string"' + (c.span > 1 ? ' table:number-columns-spanned="' + c.span + '"' : '') + '><text:p>' + runs(c.runs, c.header ? { b: true } : null) + '</text:p></table:table-cell>' + (c.span > 1 ? '<table:covered-table-cell/>'.repeat(c.span - 1) : '');
        body += '</table:table-row>';
      }
      body += '</table:table>';
    }
  }
  closeListsTo(0);
  const auto = Array.from(styles.entries()).map(([k, n]) => '<style:style style:name="' + n + '" style:family="text"><style:text-properties ' + k + '/></style:style>').join('') +
    '<style:style style:name="PCenter" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:text-align="center"/></style:style>' +
    '<style:style style:name="PRight" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:text-align="end"/></style:style>' +
    '<style:style style:name="HR" style:family="paragraph"><style:paragraph-properties fo:border-bottom="0.5pt solid #c8ccd8" fo:margin-bottom="0.2cm"/></style:style>' +
    '<style:style style:name="PBreak" style:family="paragraph"><style:paragraph-properties fo:break-after="page"/></style:style>' +
    '<style:style style:name="Tbl" style:family="table"><style:table-properties style:width="17cm" table:align="margins"/></style:style>' +
    '<style:style style:name="Cell" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #c8ccd8"/></style:style>' +
    '<style:style style:name="CellH" style:family="table-cell"><style:table-cell-properties fo:padding="0.1cm" fo:border="0.5pt solid #c8ccd8" fo:background-color="#eef0f6"/></style:style>' +
    '<text:list-style style:name="LBullet">' + [1, 2, 3, 4, 5].map((l) => '<text:list-level-style-bullet text:level="' + l + '" text:bullet-char="' + ['•', '◦', '▪', '•', '◦'][l - 1] + '"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.6cm" fo:margin-left="' + (l * 0.6 + 0.3).toFixed(1) + 'cm"/></style:list-level-properties></text:list-level-style-bullet>').join('') + '</text:list-style>' +
    '<text:list-style style:name="LNum">' + [1, 2, 3, 4, 5].map((l) => '<text:list-level-style-number text:level="' + l + '" style:num-suffix="." style:num-format="' + ['1', 'a', 'i', '1', 'a'][l - 1] + '"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.6cm" fo:margin-left="' + (l * 0.6 + 0.3).toFixed(1) + 'cm"/></style:list-level-properties></text:list-level-style-number>').join('') + '</text:list-style>';
  const NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" office:version="1.3"';
  const content = '<?xml version="1.0" encoding="UTF-8"?><office:document-content ' + NS + '><office:automatic-styles>' + auto + '</office:automatic-styles><office:body><office:text>' + (body || '<text:p/>') + '</office:text></office:body></office:document-content>';
  const hsz = [0, '20pt', '16pt', '14pt', '12pt', '11pt', '11pt'];
  const stylesXml = '<?xml version="1.0" encoding="UTF-8"?><office:document-styles ' + NS + '><office:styles>' +
    '<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.2cm"/><style:text-properties style:font-name="Liberation Sans" fo:font-family="\'Liberation Sans\', Arial, Carlito, sans-serif" fo:font-size="11pt" fo:language="id" fo:country="ID"/></style:default-style>' +
    '<style:style style:name="Standard" style:family="paragraph" style:class="text"/>' +
    '<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-bottom="0.25cm" fo:line-height="115%"/></style:style>' +
    [1, 2, 3, 4, 5, 6].map((n) => '<style:style style:name="Heading_20_' + n + '" style:display-name="Heading ' + n + '" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body" style:default-outline-level="' + n + '" style:class="text"><style:paragraph-properties fo:margin-top="' + (n <= 2 ? '0.5cm' : '0.35cm') + '" fo:margin-bottom="0.2cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="' + hsz[n] + '" fo:font-weight="bold" fo:color="#1e2236"/></style:style>').join('') +
    '<style:style style:name="List_20_Paragraph" style:display-name="List Paragraph" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-bottom="0.1cm"/></style:style>' +
    '<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="0.6cm" fo:border-left="1.5pt solid #c8ccd8" fo:padding-left="0.3cm"/><style:text-properties fo:font-style="italic" fo:color="#555b70"/></style:style>' +
    '<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-bottom="0cm" fo:background-color="#f4f5f8"/><style:text-properties style:font-name="Liberation Mono" fo:font-family="\'Liberation Mono\', Consolas, monospace" fo:font-size="9.5pt"/></style:style>' +
    '</office:styles><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="2.5cm" fo:margin-bottom="2.5cm" fo:margin-left="2.5cm" fo:margin-right="2.5cm"/></style:page-layout></office:automatic-styles>' +
    '<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>';
  return { content, styles: stylesXml };
};

// ---- RTF
W.htmlToRtf = async (p) => {
  const doc = parseHTML(p.html);
  const blocks = toBlocks(doc);
  const esc = (s) => Array.from(String(s)).map((ch) => {
    const c = ch.codePointAt(0);
    if (ch === '\\' || ch === '{' || ch === '}') return '\\' + ch;
    if (c < 128) return ch === '\n' ? '\\line ' : ch;
    if (c > 0xffff) { const hi = Math.floor((c - 0x10000) / 0x400) + 0xd800, lo = ((c - 0x10000) % 0x400) + 0xdc00; return '\\u' + (hi - 65536) + '?\\u' + (lo - 65536) + '?'; }
    return '\\u' + (c > 32767 ? c - 65536 : c) + '?';
  }).join('');
  const runs = (rs, base) => rs.map((r) => {
    if (r.img != null) return r.alt ? esc('[' + r.alt + ']') : '';
    if (r.br) return '\\line ';
    const f = Object.assign({}, base || {}, r);
    let pre = '';
    if (f.b) pre += '\\b'; if (f.i) pre += '\\i'; if (f.u) pre += '\\ul'; if (f.s) pre += '\\strike'; if (f.code) pre += '\\f1'; if (f.sup) pre += '\\super'; if (f.sub) pre += '\\sub';
    if (f.href) pre += '\\cf2';
    return pre ? '{' + pre + ' ' + esc(r.text) + '}' : esc(r.text);
  }).join('');
  const hs = [0, 36, 30, 26, 24, 22, 22];
  let out = '{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fswiss Calibri;}{\\f1\\fmodern Consolas;}}{\\colortbl;\\red30\\green34\\blue54;\\red31\\green95\\blue191;\\red120\\green125\\blue140;}\\viewkind4\\paperw11906\\paperh16838\\margl1418\\margr1418\\margt1418\\margb1418\\f0\\fs22\n';
  for (const b of blocks) {
    if (b.type === 'h') out += '{\\pard\\sb' + (b.level <= 2 ? 300 : 200) + '\\sa120\\keepn\\b\\fs' + hs[b.level] + '\\cf1 ' + runs(b.runs) + '\\par}\n';
    else if (b.type === 'p') out += '{\\pard\\sa160' + (b.align === 'center' ? '\\qc' : b.align === 'right' ? '\\qr' : b.align === 'justify' ? '\\qj' : '') + ' ' + runs(b.runs) + '\\par}\n';
    else if (b.type === 'quote') out += '{\\pard\\li567\\sa160\\i\\cf3 ' + runs(b.runs) + '\\par}\n';
    else if (b.type === 'li') {
      const ind = 360 + b.list.level * 360;
      out += '{\\pard\\li' + (ind + 360) + '\\fi-360\\sa60 ' + (b.list.ordered ? '' : '\\bullet\\tab ') + runs(b.runs) + '\\par}\n';
    } else if (b.type === 'pre') out += '{\\pard\\sa160\\f1\\fs19 ' + esc(b.text) + '\\par}\n';
    else if (b.type === 'hr') out += '{\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par}\n';
    else if (b.type === 'pagebreak') out += '\\page\n';
    else if (b.type === 'table') {
      for (const row of b.rows) {
        const cols = row.length, w = Math.floor(9070 / Math.max(cols, 1));
        out += '\\trowd\\trgaph100' + row.map((_, i) => '\\clbrdrt\\brdrs\\clbrdrl\\brdrs\\clbrdrb\\brdrs\\clbrdrr\\brdrs\\cellx' + w * (i + 1)).join('');
        out += row.map((c) => '\\pard\\intbl ' + runs(c.runs, c.header ? { b: true } : null) + '\\cell').join('') + '\\row\n';
      }
      out += '\\pard\\par\n';
    }
  }
  // Ordered list numbers are written as text so every reader shows them.
  return { rtf: out + '}' };
};

W.htmlToText = async (p) => {
  const doc = parseHTML(p.html);
  const blocks = toBlocks(doc);
  const counters = new Map();
  const t = (rs) => rs.map((r) => (r.br ? '\n' : r.img != null ? (r.alt ? '[' + r.alt + ']' : '') : r.text)).join('');
  return { text: blocks.map((b) => {
    if (b.type === 'h') return t(b.runs);
    if (b.type === 'li') {
      let n = '';
      if (b.list.ordered) { const c = (counters.get(b.list.id) || b.list.start - 1) + 1; counters.set(b.list.id, c); n = c + '. '; } else n = '• ';
      return '  '.repeat(b.list.level) + n + t(b.runs);
    }
    if (b.type === 'pre') return b.text;
    if (b.type === 'hr') return '────────';
    if (b.type === 'table') return b.rows.map((r) => r.map((c) => t(c.runs)).join('\t')).join('\n');
    if (b.type === 'pagebreak') return '\f';
    return t(b.runs || []);
  }).filter((s) => s != null).join('\n\n') };
};

// Ordered numbering for RTF output is applied here (RTF readers vary in list support).
const _rtf = W.htmlToRtf;
W.htmlToRtf = async (p) => {
  const html = String(p.html || '').replace(/<ol(\s[^>]*)?>([\s\S]*?)<\/ol>/gi, (m, attrs, inner) => {
    let i = parseInt(((attrs || '').match(/start="?(\d+)/) || [])[1] || '1', 10);
    return '<ul' + (attrs || '') + '>' + inner.replace(/<li(\s[^>]*)?>/gi, (li, a) => '<li' + (a || '') + '>' + (i++) + '. ') + '</ul>';
  });
  const r = await _rtf({ html });
  r.rtf = r.rtf.replace(/\\bullet\\tab (\d+\. )/g, '$1');
  return r;
};

window.__workerReady = true;
