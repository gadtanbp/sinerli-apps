// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// HTTP for the web layer, through Chromium's network stack (system proxy and
// certificates) in an in-memory session, so the page is never subject to CORS.
// Streaming bodies are delivered line-aligned (SSE friendly).
'use strict';
const { session, app } = require('electron');
const { BridgeError } = require('./util');

let ses = null;
function http() {
  if (!ses) {
    ses = session.fromPartition('sinai-http', { cache: false });
    ses.setUserAgent('Sinai/' + app.getVersion() + ' (' + (process.platform === 'win32' ? 'Windows' : 'Linux') + ')');
  }
  return ses;
}

const streams = new Map(); // id -> AbortController

function makeRequest(p) {
  let url;
  try { url = new URL(String(p.url || '')); } catch (e) { throw new BridgeError('URL tidak valid'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new BridgeError('URL tidak valid');
  const headers = {};
  for (const [k, v] of Object.entries(p.headers || {})) {
    if (/^(host|content-length|connection)$/i.test(k)) continue;
    headers[k] = String(v);
  }
  const init = { method: String(p.method || 'GET').toUpperCase(), headers, redirect: 'follow', bypassCustomProtocolHandlers: true, cache: 'no-store' };
  if (p.body != null && init.method !== 'GET' && init.method !== 'HEAD') init.body = String(p.body);
  return { url: url.toString(), init };
}

function headersOf(res) {
  const h = {};
  res.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
  return h;
}

function netError(e) {
  const m = String(e && e.message || e || '');
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND/.test(m)) return 'Server tidak ditemukan (periksa koneksi internet / alamat).';
  if (/ERR_INTERNET_DISCONNECTED/.test(m)) return 'Tidak ada koneksi internet.';
  if (/ERR_CONNECTION_REFUSED|ECONNREFUSED/.test(m)) return 'Koneksi ditolak oleh server.';
  if (/ERR_TIMED_OUT|ETIMEDOUT|timeout/i.test(m)) return 'Waktu koneksi habis.';
  if (/CERT/.test(m)) return 'Sertifikat keamanan server tidak valid.';
  return m || 'Koneksi gagal';
}

function stream(id, p, emit) {
  const { url, init } = makeRequest(p);
  const ac = new AbortController();
  streams.set(id, ac);
  init.signal = ac.signal;
  // Reasoning models can be silent for a long time: abort only after 15 min of no data.
  let idle = null;
  const bump = () => { clearTimeout(idle); idle = setTimeout(() => ac.abort(new Error('timeout')), (p.timeout > 0 ? p.timeout : 900) * 1000); };
  bump();
  (async () => {
    let status = 0;
    try {
      const res = await http().fetch(url, init);
      status = res.status;
      const isError = status >= 400;
      emit('http.head', { id, status, headers: headersOf(res) });
      const reader = res.body ? res.body.getReader() : null;
      let buf = Buffer.alloc(0);
      if (reader) {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          bump();
          buf = Buffer.concat([buf, Buffer.from(value)]);
          if (isError) continue;
          const nl = buf.lastIndexOf(10);
          if (nl >= 0) {
            emit('http.data', { id, data: buf.slice(0, nl + 1).toString('utf8') });
            buf = buf.slice(nl + 1);
          }
        }
      }
      const rest = buf.toString('utf8');
      if (isError) emit('http.done', { id, status, body: rest });
      else {
        if (rest) emit('http.data', { id, data: rest });
        emit('http.done', { id, status });
      }
    } catch (e) {
      if (ac.signal.aborted && !(ac.signal.reason instanceof Error && ac.signal.reason.message === 'timeout')) {
        emit('http.done', { id, status, aborted: true });
      } else {
        emit('http.fail', { id, error: netError(e) });
      }
    } finally {
      clearTimeout(idle);
      streams.delete(id);
    }
  })();
}

function abort(id) {
  const ac = streams.get(id);
  if (ac) ac.abort();
}

async function request(p) {
  const { url, init } = makeRequest(p);
  const ac = new AbortController();
  init.signal = ac.signal;
  const timer = setTimeout(() => ac.abort(), (p.timeout > 0 ? p.timeout : 120) * 1000);
  try {
    const res = await http().fetch(url, init);
    const maxBytes = p.maxBytes || 8000000;
    const chunks = [];
    let total = 0, truncated = false;
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.length;
        chunks.push(Buffer.from(value));
        if (total > maxBytes) { truncated = true; ac.abort(); break; }
      }
    }
    let body = Buffer.concat(chunks);
    if (body.length > maxBytes) body = body.slice(0, maxBytes);
    const headers = headersOf(res);
    const out = { status: res.status, headers, url: res.url || url, truncated };
    if (p.binary) out.base64 = body.toString('base64');
    else {
      const m = /charset=([^;]+)/i.exec(headers['content-type'] || '');
      let text;
      if (m) { try { text = new TextDecoder(m[1].trim().replace(/"/g, '')).decode(body); } catch (e) { text = null; } }
      out.body = text != null ? text : body.toString('utf8');
    }
    return out;
  } catch (e) {
    throw new BridgeError(netError(e));
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { stream, abort, request };
