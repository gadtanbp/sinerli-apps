/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* User hooks and automatic diagnostics around tool calls.
   - Hooks (Pengaturan → Agen & Izin): shell commands the user attaches to
     events. "before" runs before a matching tool; a non-zero exit blocks the
     call and its output is told to the model. "after" runs after a matching
     tool; its output is appended to the tool result. "stop" runs when the
     agent finishes a turn in Code mode.
   - Diagnostics: after every file write/edit in Code mode the changed file is
     syntax-checked with the project's own toolchain (node, python, php, bash,
     tsc, go, ruby, JSON) and problems are fed straight back to the model —
     the agent sees its own mistakes without having to remember to check. */
(function () {
  'use strict';

  function list() { return (Store.settings.hooks || []).filter(function (x) { return x && x.enabled !== false && x.command; }); }
  function matches(hook, toolName) {
    if (!hook.match || hook.match === '*') return true;
    try { return new RegExp('^(' + hook.match + ')$').test(toolName); } catch (e) { return hook.match === toolName; }
  }
  function env(tool, args, conv) {
    var p = args && (args.path || args.file_path || '');
    return { SINAI_TOOL: tool, SINAI_PATH: String(p || ''), SINAI_MODE: conv.mode || '', SINAI_ARGS: JSON.stringify(args || {}).slice(0, 8000) };
  }
  async function exec(cmd, cwd, vars, timeout) {
    var prefix = '';
    if (Store.info.posixShell !== false) prefix = Object.keys(vars).map(function (k) { return k + '=' + U.shq(vars[k]) + ' '; }).join('');
    else prefix = Object.keys(vars).map(function (k) { return '$env:' + k + '=' + "'" + String(vars[k]).replace(/'/g, "''") + "'; "; }).join('');
    try {
      var r = await Native.call('exec.sync', { command: prefix + cmd, cwd: cwd || Store.info.home, timeout: timeout || 30 });
      return { code: r.code, out: String((r.stdout || '') + (r.stderr ? '\n' + r.stderr : '')).trim() };
    } catch (e) { return { code: 1, out: e.message || String(e) }; }
  }

  async function before(tool, args, conv) {
    var hs = list().filter(function (x) { return x.event === 'before' && matches(x, tool.name); });
    for (var i = 0; i < hs.length; i++) {
      var r = await exec(hs[i].command, conv.workspace, env(tool.name, args, conv), hs[i].timeout);
      if (r.code !== 0) return { block: 'Blocked by the user\'s hook "' + (hs[i].name || hs[i].command) + '" (exit ' + r.code + ')' + (r.out ? ':\n' + U.truncateMiddle(r.out, 2000) : '') };
    }
    return null;
  }

  async function after(tool, args, conv, result) {
    var notes = [];
    var hs = list().filter(function (x) { return x.event === 'after' && matches(x, tool.name); });
    for (var i = 0; i < hs.length; i++) {
      var r = await exec(hs[i].command, conv.workspace, env(tool.name, args, conv), hs[i].timeout);
      if (r.out || r.code) notes.push('[hook ' + (hs[i].name || hs[i].command) + ' · exit ' + r.code + ']\n' + U.truncateMiddle(r.out, 3000));
    }
    if (conv.mode === 'code' && tool.kind === 'write' && !result.isError && Store.settings.agent.diagnostics !== false && args && args.path) {
      var d = await diagnose(args.path, conv.workspace);
      if (d) notes.push(d);
    }
    return notes.join('\n\n');
  }

  async function onStop(conv) {
    if (conv.mode !== 'code') return '';
    var hs = list().filter(function (x) { return x.event === 'stop'; });
    var out = [];
    for (var i = 0; i < hs.length; i++) {
      var r = await exec(hs[i].command, conv.workspace, env('stop', {}, conv), hs[i].timeout || 120);
      if (r.code !== 0) out.push('[hook ' + (hs[i].name || hs[i].command) + ' · exit ' + r.code + ']\n' + U.truncateMiddle(r.out, 3000));
    }
    return out.join('\n\n');
  }

  // ---------------------------------------------------------------- diagnostics

  function abs(path, cwd) {
    if (/^(\/|~|[A-Za-z]:[\\/])/.test(path)) return path.replace(/^~/, Store.info.home);
    return (cwd || Store.info.home).replace(/[\\/]+$/, '') + '/' + path;
  }
  var tscCache = new Map();
  async function hasTsc(cwd) {
    if (!cwd) return false;
    if (tscCache.has(cwd)) return tscCache.get(cwd);
    var st = await Native.call('fs.stat', { path: cwd + '/node_modules/.bin/tsc' }).catch(function () { return {}; });
    var cfg = await Native.call('fs.stat', { path: cwd + '/tsconfig.json' }).catch(function () { return {}; });
    var ok = !!(st.exists && cfg.exists);
    tscCache.set(cwd, ok);
    return ok;
  }

  /* Returns a short "Diagnostics" note when the file has problems, else ''. */
  async function diagnose(path, cwd) {
    var p = abs(path, cwd), ext = (p.split('.').pop() || '').toLowerCase(), q = U.shq(p), cmd = null, filter = null, timeout = 20;
    if (ext === 'json') {
      try { JSON.parse((await Native.call('file.text', { path: p, maxBytes: 4000000 })).text); return ''; }
      catch (e) { return '[diagnostics] ' + U.basename(p) + ': invalid JSON — ' + e.message; }
    }
    if (Store.info.posixShell === false) q = '"' + p.replace(/"/g, '') + '"';
    if (/^(js|mjs|cjs)$/.test(ext)) cmd = 'node --check ' + q;
    else if (ext === 'py') cmd = (Store.info.posixShell === false ? 'python' : 'python3') + ' -m py_compile ' + q;
    else if (ext === 'php') cmd = 'php -l ' + q;
    else if (ext === 'sh' || ext === 'bash') cmd = 'bash -n ' + q;
    else if (ext === 'rb') cmd = 'ruby -c ' + q;
    else if (ext === 'go') cmd = 'gofmt -l -e ' + q;
    else if (/^(ts|tsx|mts|cts)$/.test(ext) && await hasTsc(cwd)) { cmd = 'node_modules/.bin/tsc --noEmit -p .'; filter = U.basename(p); timeout = 90; }
    if (!cmd) return '';
    var r;
    try { r = await Native.call('exec.sync', { command: cmd, cwd: cwd || Store.info.home, timeout: timeout }); } catch (e) { return ''; }
    var out = String((r.stdout || '') + '\n' + (r.stderr || '')).trim();
    if (/command not found|not recognized|No such file or directory: '?(node|python3?|php|ruby|gofmt)/i.test(out)) return '';
    if (filter) out = out.split('\n').filter(function (l) { return l.indexOf(filter) >= 0; }).slice(0, 25).join('\n');
    if (ext === 'go' && r.code === 0 && !/error/i.test(out)) return '';
    if (r.code === 0 && (!filter || !out)) return '';
    if (!out) return '';
    return '[diagnostics] ' + U.basename(p) + ' has problems — fix them before moving on:\n' + U.truncateMiddle(out, 3000);
  }

  window.Hooks = { before: before, after: after, onStop: onStop, diagnose: diagnose, list: list };
})();
