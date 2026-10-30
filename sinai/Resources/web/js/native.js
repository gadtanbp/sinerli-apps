/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Bridge to the Swift host (window.webkit.messageHandlers.sinai). */
(function () {
  'use strict';
  // Android/iOS: mobile/web/host-mobile.js (dimuat lebih dulu) memenuhi kontrak yang sama.
  var handler = window.__gxHost || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.sinai);
  var pending = new Map();
  var listeners = new Map();
  var seq = 0;

  function emit(name, payload) {
    var set = listeners.get(name);
    if (!set) return;
    set.forEach(function (fn) {
      try { fn(payload); } catch (e) { console.error(e); }
    });
  }

  window.__gx = {
    resolve: function (id, w) {
      var p = pending.get(id);
      if (p) { pending.delete(id); p.resolve(w ? w.v : undefined); }
    },
    reject: function (id, msg) {
      var p = pending.get(id);
      if (p) { pending.delete(id); p.reject(new Error(msg)); }
    },
    events: function (list) {
      for (var i = 0; i < list.length; i++) emit(list[i][0], list[i][1].v);
    },
  };

  function call(method, params) {
    if (!handler) return Promise.reject(new Error('Sinai native bridge tidak tersedia'));
    return new Promise(function (resolve, reject) {
      var id = 'c' + (++seq);
      pending.set(id, { resolve: resolve, reject: reject });
      handler.postMessage({ id: id, method: method, params: params || {} });
    });
  }

  function on(name, fn) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return function () { listeners.get(name).delete(fn); };
  }

  // Streaming HTTP
  var streams = new Map();
  on('http.head', function (p) {
    var s = streams.get(p.id);
    if (s) { s.status = p.status; s.headers = p.headers || {}; }
  });
  on('http.data', function (p) {
    var s = streams.get(p.id);
    if (s && s.onData) s.onData(p.data);
  });
  on('http.done', function (p) {
    var s = streams.get(p.id);
    if (!s) return;
    streams.delete(p.id);
    s.resolve({ status: p.status || s.status || 0, body: p.body, aborted: !!p.aborted, headers: s.headers || {} });
  });
  on('http.fail', function (p) {
    var s = streams.get(p.id);
    if (!s) return;
    streams.delete(p.id);
    var e = new Error(p.error || 'Koneksi gagal');
    e.network = true;
    s.reject(e);
  });

  function stream(opts, onData) {
    var id = 's' + (++seq) + '_' + Date.now().toString(36);
    var s = null;
    var promise = new Promise(function (resolve, reject) {
      s = { resolve: resolve, reject: reject, onData: onData };
      streams.set(id, s);
    });
    call('http.stream', Object.assign({}, opts, { id: id })).catch(function (e) {
      streams.delete(id);
      s.reject(e);
    });
    return { id: id, promise: promise, abort: function () { return call('http.abort', { id: id }); } };
  }

  // Shell jobs
  var jobs = new Map();
  on('exec.out', function (p) {
    var j = jobs.get(p.id);
    if (j && j.onOutput) j.onOutput(p.stream, p.data);
  });
  on('exec.exit', function (p) {
    var j = jobs.get(p.id);
    if (!j) return;
    jobs.delete(p.id);
    j.resolve(p);
  });

  function exec(opts, onOutput) {
    var id = 'x' + (++seq) + '_' + Date.now().toString(36);
    var j = null;
    var promise = new Promise(function (resolve, reject) {
      j = { resolve: resolve, reject: reject, onOutput: onOutput };
      jobs.set(id, j);
    });
    call('exec.start', Object.assign({}, opts, { id: id })).catch(function (e) {
      jobs.delete(id);
      j.reject(e);
    });
    return {
      id: id, promise: promise,
      kill: function () { return call('exec.kill', { id: id }); },
      write: function (data) { return call('exec.write', { id: id, data: data }); },
      closeInput: function () { return call('exec.closeInput', { id: id }); },
      resize: function (cols, rows) { return call('exec.resize', { id: id, cols: cols, rows: rows }); },
      interrupt: function () { return call('exec.interrupt', { id: id }); },
    };
  }

  // Outgoing WebSocket (to other services, from the app side — no CORS)
  var socks = new Map();
  on('ws.open', function (p) { var s = socks.get(p.id); if (s && s.onOpen) s.onOpen(); });
  on('ws.message', function (p) { var s = socks.get(p.id); if (s && s.onMessage) s.onMessage(p.text != null ? p.text : p.base64, p.base64 != null); });
  on('ws.close', function (p) { var s = socks.get(p.id); if (s) { socks.delete(p.id); if (s.onClose) s.onClose(p.error); } });

  function ws(opts, handlers) {
    var id = 'w' + (++seq) + '_' + Date.now().toString(36);
    socks.set(id, handlers || {});
    call('ws.connect', Object.assign({}, opts, { id: id })).catch(function (e) { socks.delete(id); if (handlers && handlers.onClose) handlers.onClose(e.message); });
    return {
      id: id,
      send: function (text) { return call('ws.send', { id: id, text: text }); },
      sendBytes: function (base64) { return call('ws.send', { id: id, base64: base64 }); },
      close: function () { socks.delete(id); return call('ws.close', { id: id }); },
    };
  }

  window.Native = { available: !!handler, call: call, on: on, stream: stream, exec: exec, ws: ws };
})();
