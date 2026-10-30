/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
// Development-only remote MCP server protected by OAuth 2.1 (RFC 9728 metadata,
// RFC 8414 discovery, dynamic client registration, PKCE S256, refresh tokens),
// speaking both Streamable HTTP (/mcp) and the legacy SSE transport (/sse).
// /authorize approves immediately and redirects back (no login page).
// Run: node dev/mock-mcp-oauth.mjs [port]   (default 8790)
import http from 'node:http';
import crypto from 'node:crypto';

const port = Number(process.argv[2] || 8790);
const origin = `http://127.0.0.1:${port}`;
const codes = new Map();      // code -> {challenge, redirect}
const tokens = new Set();
const notes = [];
const sseClients = new Map(); // sid -> res

const json = (res, status, obj, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(obj)); };
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function rpc(msg) {
  if (msg.method === 'initialize') return { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'mock-notes', version: '1.0' } };
  if (msg.method === 'tools/list') return { tools: [
    { name: 'create_note', description: 'Create a note', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
    { name: 'list_notes', description: 'List notes', inputSchema: { type: 'object', properties: {} } },
  ] };
  if (msg.method === 'tools/call') {
    if (msg.params.name === 'create_note') { notes.push(msg.params.arguments.text); return { content: [{ type: 'text', text: 'Catatan dibuat (#' + notes.length + ')' }] }; }
    return { content: [{ type: 'text', text: JSON.stringify(notes) }] };
  }
  return {};
}

function authed(req) { return tokens.has(String(req.headers.authorization || '').replace(/^Bearer /, '')); }

http.createServer((req, res) => {
  let data = '';
  req.on('data', (c) => { data += c; });
  req.on('end', () => {
    const u = new URL(req.url, origin);
    if (u.pathname === '/.well-known/oauth-protected-resource/mcp' || u.pathname === '/.well-known/oauth-protected-resource' || u.pathname === '/.well-known/oauth-protected-resource/sse') {
      return json(res, 200, { resource: origin + '/mcp', authorization_servers: [origin], scopes_supported: ['notes'] });
    }
    if (u.pathname === '/.well-known/oauth-authorization-server') {
      return json(res, 200, { issuer: origin, authorization_endpoint: origin + '/authorize', token_endpoint: origin + '/token', registration_endpoint: origin + '/register', code_challenge_methods_supported: ['S256'] });
    }
    if (u.pathname === '/register' && req.method === 'POST') {
      const b = JSON.parse(data || '{}');
      return json(res, 201, { client_id: 'cid-' + crypto.randomBytes(4).toString('hex'), redirect_uris: b.redirect_uris, token_endpoint_auth_method: 'none' });
    }
    if (u.pathname === '/authorize') {
      const code = 'code-' + crypto.randomBytes(6).toString('hex');
      codes.set(code, { challenge: u.searchParams.get('code_challenge'), redirect: u.searchParams.get('redirect_uri') });
      res.writeHead(302, { Location: u.searchParams.get('redirect_uri') + '?code=' + code + '&state=' + encodeURIComponent(u.searchParams.get('state')) });
      return res.end();
    }
    if (u.pathname === '/token' && req.method === 'POST') {
      const p = new URLSearchParams(data);
      if (p.get('grant_type') === 'authorization_code') {
        const c = codes.get(p.get('code'));
        if (!c) return json(res, 400, { error: 'invalid_grant' });
        if (b64url(crypto.createHash('sha256').update(p.get('code_verifier') || '').digest()) !== c.challenge) return json(res, 400, { error: 'invalid_grant', error_description: 'PKCE mismatch' });
        if (p.get('redirect_uri') !== c.redirect) return json(res, 400, { error: 'invalid_grant', error_description: 'redirect mismatch' });
        codes.delete(p.get('code'));
      } else if (p.get('grant_type') !== 'refresh_token') return json(res, 400, { error: 'unsupported_grant_type' });
      const t = 'tok-' + crypto.randomBytes(6).toString('hex');
      tokens.add(t);
      return json(res, 200, { access_token: t, token_type: 'Bearer', expires_in: 3600, refresh_token: 'ref-' + crypto.randomBytes(6).toString('hex') });
    }
    const challenge = { 'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"` };
    if (u.pathname === '/mcp' && req.method === 'POST') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' }, challenge);
      const msg = JSON.parse(data || '{}');
      if (msg.id == null) { res.writeHead(202); return res.end(); }
      return json(res, 200, { jsonrpc: '2.0', id: msg.id, result: rpc(msg) }, { 'Mcp-Session-Id': 'sess-1' });
    }
    if (u.pathname === '/sse' && req.method === 'GET') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' }, challenge);
      const sid = crypto.randomBytes(4).toString('hex');
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`event: endpoint\ndata: /messages?sid=${sid}\n\n`);
      sseClients.set(sid, res);
      res.on('close', () => sseClients.delete(sid));
      return;
    }
    if (u.pathname === '/messages' && req.method === 'POST') {
      if (!authed(req)) return json(res, 401, { error: 'unauthorized' }, challenge);
      const stream = sseClients.get(u.searchParams.get('sid'));
      if (!stream) return json(res, 404, { error: 'no session' });
      const msg = JSON.parse(data || '{}');
      res.writeHead(202); res.end('Accepted');
      if (msg.id != null) stream.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: rpc(msg) })}\n\n`);
      return;
    }
    if (u.pathname === '/api/items') {
      // Plain REST endpoint for the REST connector test.
      if (req.headers['x-api-key'] !== 'rest-secret') return json(res, 401, { error: 'bad key' });
      if (req.method === 'POST') { notes.push(JSON.parse(data || '{}').name); return json(res, 201, { id: notes.length }); }
      return json(res, 200, { items: notes });
    }
    res.writeHead(404); res.end();
  });
}).listen(port, '127.0.0.1', () => console.log(`mock OAuth MCP on ${origin}/mcp (and /sse)`));
