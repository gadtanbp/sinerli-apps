/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Host native tiruan untuk harness (dev/harness/serve.mjs): primitif yang sama
   dengan mobile/android & mobile/ios, disimpan di localStorage browser. */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  var OS = q.get('os') || 'android';
  var VERSION = q.get('version') || '1.1.0';
  var FSKEY = 'gxfs:', SECKEY = 'gxsec:';
  var HOME = '/data/home', SUPPORT = '/data/support', TMP = '/data/cache/tmp';
  var log = (window.__gxMockLog = []);
  var streams = new Map();
  var blobs = new Map();

  function reply(id, ok, v) { setTimeout(function () { window.__gxn(ok ? { id: id, ok: true, v: v } : { id: id, ok: false, err: String(v && v.message || v) }); }, 0); }
  function emit(name, payload) { window.__gxn({ events: [[name, payload]] }); }

  function b64(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { var b = atob(s || ''), o = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
  function norm(p) { p = String(p || '').replace(/\/+/g, '/').replace(/\/$/, ''); return p || '/'; }
  function inSandbox(p) { return /^\/data\/(home|support|cache)(\/|$)/.test(p) && p.indexOf('..') < 0; }
  function guard(p) { p = norm(p); if (!inSandbox(p)) throw new Error('Di luar sandbox aplikasi: ' + p); return p; }
  function getFile(p) { var r = localStorage.getItem(FSKEY + p); return r ? JSON.parse(r) : null; }
  function isDir(p) {
    if (/^\/data\/(home|support|cache|cache\/tmp)$/.test(p) || localStorage.getItem(FSKEY + p + '/') !== null) return true;
    var pre = FSKEY + p + '/';
    for (var i = 0; i < localStorage.length; i++) if (localStorage.key(i).indexOf(pre) === 0) return true;
    return false;
  }
  function putFile(p, bytes, append) {
    var old = append ? getFile(p) : null;
    var data = old ? (function () { var a = unb64(old.b64), o = new Uint8Array(a.length + bytes.length); o.set(a); o.set(bytes, a.length); return o; })() : bytes;
    localStorage.setItem(FSKEY + p, JSON.stringify({ b64: b64(data), mtime: Date.now(), size: data.length }));
    return data.length;
  }
  function children(dir) {
    var pre = FSKEY + dir + '/', seen = {}, out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k.indexOf(pre) !== 0) continue;
      var rest = k.slice(pre.length);
      if (!rest) continue;
      var name = rest.split('/')[0];
      if (seen[name]) continue;
      seen[name] = 1;
      var full = dir + '/' + name;
      var f = rest.indexOf('/') < 0 && !/\/$/.test(rest) ? getFile(full) : null;
      out.push(f ? { name: name, dir: false, size: f.size, mtime: f.mtime } : { name: name, dir: true, size: 0, mtime: 0 });
    }
    return out;
  }

  async function proxy(p, signal) {
    var r = await fetch('/__proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: p.url, method: p.method || 'GET', headers: p.headers || {}, body: p.body }), signal: signal });
    if (r.headers.get('X-Proxy-Error')) { var j = await r.json(); throw new Error('Koneksi gagal: ' + j.error); }
    return { status: Number(r.headers.get('X-Status')) || 0, headers: JSON.parse(decodeURIComponent(r.headers.get('X-Headers') || '%7B%7D')), res: r };
  }

  var H = {
    'app.info': function () {
      return {
        version: VERSION, build: '20261024', osFamily: OS, platform: OS === 'macos' ? 'darwin' : OS === 'windows' ? 'win32' : OS,
        os: OS === 'ios' ? 'iOS 18.0 (harness)' : OS === 'android' ? 'Android 15 (harness)' : OS + ' (harness)', osVersion: '15', deviceModel: 'Harness',
        arch: 'arm64', home: HOME, user: 'harness', fullName: 'harness', host: 'harness', supportDir: SUPPORT, tempDir: TMP, cacheDir: '/data/cache',
        previewBase: location.origin + '/__preview/', locale: 'id-ID', reduceTransparency: true, updateKind: { android: 'apk', ios: 'ipa', macos: 'dmg', windows: 'setup', linux: 'appimage' }[OS],
        copyright: '© Gadtan x Gallen', owner: 'Gadtan x Gallen', legal: 'Copyright © 2026 Gadtan x Gallen. All rights reserved.',
      };
    },
    'app.setAppearance': function () { return true; },
    'app.openURL': function (p) { log.push(['openURL', p.url]); return true; },
    'app.copy': function (p) { log.push(['copy', p.text]); return true; },
    'app.share': function (p) { log.push(['share', p.path || p.text]); return true; },
    'app.open': function (p) { log.push(['open', p.path]); return true; },
    'app.pendingOpens': function () { return []; },
    'app.background': function () { log.push(['background']); return true; },
    'notify.show': function (p) { log.push(['notify', p.title, p.body]); return true; },
    'store.read': function (p) { var f = getFile(SUPPORT + '/' + p.name); return f ? new TextDecoder().decode(unb64(f.b64)) : null; },
    'store.write': function (p) { putFile(SUPPORT + '/' + p.name, new TextEncoder().encode(String(p.content == null ? '' : p.content))); return true; },
    'store.delete': function (p) { var base = FSKEY + SUPPORT + '/' + p.name; for (var i = localStorage.length - 1; i >= 0; i--) { var k = localStorage.key(i); if (k === base || k.indexOf(base + '/') === 0) localStorage.removeItem(k); } return true; },
    'store.list': function (p) { return children(norm(SUPPORT + '/' + (p.dir || ''))).map(function (e) { return e.name; }); },
    'secret.get': function (p) { return localStorage.getItem(SECKEY + p.key); },
    'secret.set': function (p) { if (p.value) localStorage.setItem(SECKEY + p.key, p.value); else localStorage.removeItem(SECKEY + p.key); return true; },
    'secret.keys': function () { var o = []; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf(SECKEY) === 0) o.push(k.slice(SECKEY.length)); } return o; },
    'fs.readBytes': function (p) {
      var f = getFile(guard(p.path));
      if (!f) throw new Error('File tidak ditemukan: ' + p.path);
      var b = unb64(f.b64);
      var off = p.offset || 0, len = p.length > 0 ? p.length : b.length;
      return { base64: b64(b.subarray(off, off + len)), size: b.length, mtime: f.mtime };
    },
    'fs.writeBytes': function (p) { var path = guard(p.path); return { path: path, bytes: putFile(path, unb64(p.base64), p.append) }; },
    'fs.stat': function (p) {
      var path = norm(p.path); if (!inSandbox(path)) return { exists: false, path: path };
      var f = getFile(path);
      if (f) return { exists: true, path: path, isDir: false, size: f.size, mtime: f.mtime };
      return isDir(path) ? { exists: true, path: path, isDir: true, size: 0, mtime: 0 } : { exists: false, path: path };
    },
    'fs.listDir': function (p) { return { entries: children(guard(p.path)) }; },
    'fs.mkdir': function (p) { localStorage.setItem(FSKEY + guard(p.path) + '/', '1'); return true; },
    'fs.remove': function (p) { var base = FSKEY + guard(p.path); for (var i = localStorage.length - 1; i >= 0; i--) { var k = localStorage.key(i); if (k === base || k.indexOf(base + '/') === 0) localStorage.removeItem(k); } return true; },
    'fs.move': function (p) {
      var from = guard(p.from), to = guard(p.to), moved = 0;
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k === FSKEY + from || k.indexOf(FSKEY + from + '/') === 0) { localStorage.setItem(FSKEY + to + k.slice(FSKEY.length + from.length), localStorage.getItem(k)); localStorage.removeItem(k); moved++; }
      }
      if (!moved) throw new Error('Sumber tidak ditemukan');
      return true;
    },
    'file.url': function (p) {
      var f = getFile(guard(p.path));
      if (!f) throw new Error('File tidak ditemukan');
      var u = URL.createObjectURL(new Blob([unb64(f.b64)]));
      blobs.set(u, 1);
      return u;
    },
    'dialog.openFiles': function (p) {
      return new Promise(function (resolve) {
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.multiple = p.multiple !== false;
        inp.onchange = async function () {
          var out = [];
          for (var i = 0; i < inp.files.length; i++) {
            var f = inp.files[i], path = '/data/cache/lampiran/' + Date.now() + '-' + f.name.replace(/[\/]/g, '_');
            putFile(path, new Uint8Array(await f.arrayBuffer()));
            out.push(path);
          }
          resolve(out);
        };
        inp.click();
      });
    },
    'preview.put': async function (p) {
      var r = await fetch('/__preview/put', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: p.key, html: p.html }) });
      return (await r.json()).url;
    },
    'preview.file': function (p) { return H['file.url'](p); },
    // Harness: PNG renders become a 1×1 placeholder (enough to exercise file pipelines); PDF stays unavailable.
    'render': function (p) {
      if (p.format !== 'png') throw new Error('Render PDF hanya tersedia di aplikasi ponsel (bukan harness).');
      log.push(['render', p.pages, String(p.html || '').length]);
      putFile(guard(p.outPath), unb64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
      return p.outPath;
    },
    'oauth.start': function (p) {
      log.push(['oauth.start', p.url]);
      return new Promise(function (resolve, reject) { window.__gxMockOAuth = { url: p.url, resolve: resolve, reject: reject }; });
    },
    'http.request': async function (p) {
      var r = await proxy(p);
      return { status: r.status, headers: r.headers, body: await r.res.text() };
    },
    'http.stream': function (p) {
      var id = p.id, ac = new AbortController();
      streams.set(id, ac);
      (async function () {
        try {
          var r = await proxy(p, ac.signal);
          emit('http.head', { id: id, status: r.status, headers: r.headers });
          var reader = r.res.body.getReader(), dec = new TextDecoder(), buf = '', isErr = r.status >= 400;
          for (;;) {
            var x = await reader.read();
            if (x.done) break;
            buf += dec.decode(x.value, { stream: true });
            if (isErr) continue;   // sama dengan host native: body error dikirim utuh di http.done
            var cut = buf.lastIndexOf('\n');
            if (cut >= 0) { emit('http.data', { id: id, data: buf.slice(0, cut + 1) }); buf = buf.slice(cut + 1); }
          }
          if (isErr) emit('http.done', { id: id, status: r.status, body: buf });
          else {
            if (buf) emit('http.data', { id: id, data: buf });
            emit('http.done', { id: id, status: r.status });
          }
        } catch (e) {
          if (ac.signal.aborted) emit('http.done', { id: id, aborted: true });
          else emit('http.fail', { id: id, error: e.message });
        } finally { streams.delete(id); }
      })();
      return true;
    },
    'http.abort': function (p) { var a = streams.get(p.id); if (a) a.abort(); return true; },
    'update.download': async function (p) {
      var r = await proxy({ url: p.url });
      if (r.status !== 200) throw new Error('Server pembaruan menjawab HTTP ' + r.status + '.');
      var bytes = new Uint8Array(await r.res.arrayBuffer());
      emit('update.progress', { job: p.job, received: bytes.length, total: bytes.length });
      var dig = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      if (dig !== String(p.sha256).toLowerCase()) throw new Error('Berkas pembaruan rusak atau tidak cocok (SHA-256 berbeda). Coba lagi.');
      var path = '/data/cache/pembaruan/' + p.name;
      log.push(['update.download', path, bytes.length]);
      return path;
    },
    'update.install': function (p) { log.push(['update.install', p.path]); return { mode: 'installer' }; },
  };

  window.__gxMock = {
    post: function (msg) {
      var fn = H[msg.method];
      if (!fn) { reply(msg.id, false, 'Metode native tidak dikenal: ' + msg.method); return; }
      try { Promise.resolve(fn(msg.params || {})).then(function (v) { reply(msg.id, true, v === undefined ? null : v); }, function (e) { reply(msg.id, false, e); }); }
      catch (e) { reply(msg.id, false, e); }
    },
    log: log,
  };
})();
