// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Shell commands for the agent and the terminal panel (streamed output,
// optional stdin), local MCP servers over stdio, and "open a terminal here".
'use strict';
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');
const { IS_WIN, BridgeError, expand, Env, killTree, toPosix } = require('./util');

// ---------------------------------------------------------------- shell jobs
const jobs = new Map();

const Shell = {
  start(o) {
    let workDir = os.homedir();
    if (o.cwd) {
      const d = expand(o.cwd);
      if (fs.existsSync(d) && fs.statSync(d).isDirectory()) workDir = d;
      else throw new BridgeError('Folder kerja tidak ditemukan: ' + o.cwd);
    }
    const sh = Env.getShell();
    const env = Env.environment();
    if (o.pty) {
      // No pseudo-terminal here: tools see a pipe, but colours and width are hinted.
      env.TERM = 'xterm-256color';
      delete env.NO_COLOR;
      env.CLICOLOR = '1';
      env.FORCE_COLOR = '1';
      env.COLUMNS = String(o.cols || 120);
      env.LINES = String(o.rows || 32);
    }
    let exe = sh.exe, args = sh.args(o.command);
    if (o.admin) {
      if (process.platform === 'linux' && Env.which('pkexec')) {
        // polkit shows its own password dialog; the password never reaches Sinai.
        exe = Env.which('pkexec');
        args = ['env', 'PATH=' + Env.path, 'HOME=' + os.homedir(), sh.exe, '-c', 'cd ' + JSON.stringify(workDir) + ' && { ' + o.command + '\n} 2>&1'];
      } else if (IS_WIN) {
        throw new BridgeError('Perintah administrator tidak bisa dijalankan dari Sinai di Windows. Jalankan perintah ini sendiri di PowerShell/Terminal "Run as administrator", atau buka Sinai sebagai Administrator.');
      } else {
        throw new BridgeError('pkexec tidak tersedia — jalankan perintah ini sendiri dengan sudo di terminal.');
      }
    }
    const child = spawn(exe, args, {
      cwd: workDir, env, windowsHide: true,
      detached: !IS_WIN,                       // own process group, so the whole tree can be stopped
      stdio: [o.interactive || o.pty ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    const job = { child, timedOut: false, killed: false, done: false };
    jobs.set(o.id, job);
    const outDec = new StringDecoder('utf8'), errDec = new StringDecoder('utf8');
    child.stdout.on('data', (d) => { const s = outDec.write(d); if (s) o.output('stdout', s); });
    child.stderr.on('data', (d) => { const s = errDec.write(d); if (s) o.output('stderr', s); });
    let spawnError = null;
    child.on('error', (e) => { spawnError = e; });
    child.on('close', (code, signal) => {
      if (job.done) return;
      job.done = true;
      clearTimeout(job.timer);
      const a = outDec.end(); if (a) o.output('stdout', a);
      const b = errDec.end(); if (b) o.output('stderr', b);
      if (spawnError && code == null) o.output('stderr', spawnError.message + '\n');
      jobs.delete(o.id);
      o.exit({ id: o.id, code: code == null ? (signal ? 128 + 15 : -1) : code, signal: !!signal, timedOut: job.timedOut, killed: job.killed });
    });
    if (child.stdin) child.stdin.on('error', () => {});
    if (o.timeout > 0) {
      job.timer = setTimeout(() => { if (!job.done) { job.timedOut = true; killTree(child.pid); } }, o.timeout * 1000);
    }
    return child.pid || 0;
  },

  write(id, data) {
    const j = jobs.get(id);
    if (!j || j.done || !j.child.stdin || j.child.stdin.destroyed) return false;
    j.child.stdin.write(IS_WIN ? String(data).replace(/(?<!\r)\n/g, '\r\n') : String(data));
    return true;
  },

  closeInput(id) {
    const j = jobs.get(id);
    if (j && j.child.stdin && !j.child.stdin.destroyed) j.child.stdin.end();
  },

  interrupt(id) {
    const j = jobs.get(id);
    if (!j || j.done) return;
    if (IS_WIN) { j.killed = true; killTree(j.child.pid, true); return; }
    try { process.kill(-j.child.pid, 'SIGINT'); } catch (e) { try { j.child.kill('SIGINT'); } catch (e2) { /* gone */ } }
  },

  kill(id) {
    const j = jobs.get(id);
    if (!j || j.done) return;
    j.killed = true;
    killTree(j.child.pid);
  },

  killAll() { for (const j of jobs.values()) if (!j.done) killTree(j.child.pid, true); },
};

// ---------------------------------------------------------------- MCP servers
const servers = new Map();
let mcpEmit = () => {};

const Mcp = {
  setEmitter(fn) { mcpEmit = fn; },
  start(id, command, args, env, cwd) {
    Mcp.stop(id);
    const emit = require('./bridge').emit;
    const opts = {
      cwd: cwd ? expand(cwd) : os.homedir(), env: Env.environment(env), windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'], detached: !IS_WIN,
    };
    // On Windows, npx/uvx etc. are .cmd scripts and need a shell to start.
    let child;
    if (IS_WIN) {
      const resolved = Env.which(command) || command;
      const needsShell = /\.(cmd|bat)$/i.test(resolved);
      child = needsShell
        ? spawn([quoteWin(resolved)].concat(args.map(quoteWin)).join(' '), [], Object.assign({ shell: true }, opts))
        : spawn(resolved, args, opts);
    } else {
      child = spawn(Env.which(command) || command, args, opts);
    }
    const server = { child, buf: '' };
    servers.set(id, server);
    const dec = new StringDecoder('utf8');
    child.stdout.on('data', (d) => {
      server.buf += dec.write(d);
      let nl;
      while ((nl = server.buf.indexOf('\n')) >= 0) {
        const line = server.buf.slice(0, nl).trim();
        server.buf = server.buf.slice(nl + 1);
        if (line) emit('mcp.message', { id, line });
      }
    });
    child.stderr.on('data', (d) => emit('mcp.log', { id, text: d.toString('utf8') }));
    child.stdin.on('error', () => {});
    child.on('error', (e) => { emit('mcp.log', { id, text: e.message + '\n' }); });
    child.on('close', (code) => {
      if (servers.get(id) === server) servers.delete(id);
      emit('mcp.exit', { id, code: code == null ? -1 : code });
    });
  },
  send(id, line) {
    const s = servers.get(id);
    if (!s || !s.child.stdin || s.child.stdin.destroyed) throw new BridgeError('Server MCP tidak berjalan');
    s.child.stdin.write(line + '\n');
  },
  stop(id) {
    const s = servers.get(id);
    if (!s) return;
    servers.delete(id);
    try { s.child.stdin.end(); } catch (e) { /* ignore */ }
    killTree(s.child.pid);
  },
  stopAll() { for (const id of Array.from(servers.keys())) Mcp.stop(id); },
};

function quoteWin(s) {
  s = String(s);
  return /[\s"&|<>^()]/.test(s) ? '"' + s.replace(/"/g, '\\"') + '"' : s;
}

// ---------------------------------------------------------------- terminal
function openTerminal(dir) {
  dir = path.normalize(dir);
  if (IS_WIN) {
    const wt = Env.which('wt');
    if (wt) spawn(wt, ['-d', dir], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    else spawn('cmd.exe', ['/c', 'start', '""', '/D', dir, 'powershell.exe', '-NoExit'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return true;
  }
  if (process.platform === 'darwin') { spawn('open', ['-a', 'Terminal', dir], { detached: true, stdio: 'ignore' }).unref(); return true; }
  const candidates = [
    ['x-terminal-emulator', ['--working-directory=' + dir]], ['gnome-terminal', ['--working-directory=' + dir]],
    ['konsole', ['--workdir', dir]], ['xfce4-terminal', ['--working-directory=' + dir]], ['tilix', ['-w', dir]],
    ['kitty', ['--directory', dir]], ['alacritty', ['--working-directory', dir]], ['xterm', []],
  ];
  for (const [name, args] of candidates) {
    const exe = Env.which(name);
    if (exe) { spawn(exe, args, { cwd: dir, detached: true, stdio: 'ignore' }).unref(); return true; }
  }
  throw new BridgeError('Aplikasi terminal tidak ditemukan.');
}

module.exports = { Shell, Mcp, openTerminal, toPosix };
