/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Agent tools. Each tool has a JSON-Schema definition for the model, a kind
   used by the permission system, a label for the UI, and an implementation
   that runs through the native bridge. */
(function () {
  'use strict';

  var BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  var hasRg = null;

  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function countOcc(hay, needle) {
    if (!needle) return 0;
    var n = 0, i = 0;
    while ((i = hay.indexOf(needle, i)) >= 0) { n++; i += needle.length; }
    return n;
  }
  function numbered(lines, start) {
    return lines.map(function (l, i) {
      return String(start + i).padStart(6) + '\t' + (l.length > 2000 ? l.slice(0, 2000) + '… [baris dipotong]' : l);
    }).join('\n');
  }
  function rel(ctx, p) { return ctx.cwd ? U.relPath(ctx.cwd, p) : U.tildify(p, ctx.home); }

  async function readText(path) {
    var r = await Native.call('fs.read', { path: path, maxBytes: 8000000 });
    if (r.binary) throw new Error('File biner tidak bisa diedit sebagai teks: ' + path);
    return r;
  }

  function diffDisplay(path, oldText, newText, startLine, created) {
    var d = U.diffLines(oldText, newText);
    var hunks = U.diffHunks(d.ops, 3, startLine || 1);
    if (hunks.length > 600) hunks = hunks.slice(0, 600).concat([{ gap: hunks.length - 600, note: true }]);
    return { type: 'diff', path: path, hunks: hunks, adds: d.adds, dels: d.dels, created: !!created };
  }

  /* Read-only, side-effect-free shell commands that never need approval. */
  function isSafeCommand(cmd) {
    var c = String(cmd || '').trim();
    if (/[;&|><`\n]|\$\(/.test(c)) return false;
    return /^(ls|pwd|cat|head|tail|wc|which|whoami|date|uname|sw_vers|file|stat|du|df|tree|echo|printenv|env|id|hostname|uptime|system_profiler|defaults read|mdfind|git (status|diff|log|show|branch|remote|rev-parse|blame|ls-files|tag)|node (-v|--version)|npm (-v|--version|ls|view|outdated)|pnpm (-v|ls)|yarn (-v|--version)|python3? (-V|--version)|pip3? (list|show|--version)|brew (list|info|--version|config|doctor|outdated|search)|swift --version|xcodebuild -version|go (version|env)|cargo --version|rustc --version|java -version|php -v|ruby -v|docker (ps|images|version))\b/.test(c);
  }


  function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function cleanUrl(href) {
    href = String(href || '');
    var m = href.match(/[?&]uddg=([^&]+)/);
    if (m) return decodeURIComponent(m[1]);
    m = href.match(/bing\.com\/ck\/a\?.*[?&]u=a1([^&]+)/);
    if (m) {
      try { return atob(m[1].replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((m[1].length + 3) % 4)); } catch (e) { return href; }
    }
    if (href.indexOf('//') === 0) return 'https:' + href;
    return href;
  }

  /* Several HTML search front-ends, tried in order (some are blocked in some countries). */
  var SEARCH_ENGINES = [
    { name: 'Bing', url: function (q) { return 'https://www.bing.com/search?q=' + encodeURIComponent(q) + '&setlang=en'; },
      parse: function (d) {
        return Array.prototype.map.call(d.querySelectorAll('li.b_algo'), function (li) {
          var a = li.querySelector('h2 a');
          return a ? { title: txt(a), url: a.getAttribute('href'), snippet: txt(li.querySelector('.b_caption p, .b_lineclamp2, .b_lineclamp3, p')) } : null;
        }).filter(Boolean);
      } },
    { name: 'Brave', url: function (q) { return 'https://search.brave.com/search?q=' + encodeURIComponent(q); },
      parse: function (d) {
        return Array.prototype.map.call(d.querySelectorAll('[data-type="web"]'), function (b) {
          var a = b.querySelector('a[href^="http"]');
          if (!a) return null;
          return { title: txt(b.querySelector('.title, .snippet-title')) || txt(a), url: a.getAttribute('href'), snippet: txt(b.querySelector('.snippet-description, .description, .generic-snippet .content, .content')) };
        }).filter(Boolean);
      } },
    { name: 'DuckDuckGo', url: function (q) { return 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q); },
      parse: function (d) {
        return Array.prototype.map.call(d.querySelectorAll('.result:not(.result--ad)'), function (r) {
          var a = r.querySelector('.result__a');
          return a ? { title: txt(a), url: a.getAttribute('href'), snippet: txt(r.querySelector('.result__snippet')) } : null;
        }).filter(Boolean);
      } },
  ];

  var DANGER = [
    [/\brm\s+(-\w+\s+)*-\w*[rR]\w*\s+(-\w+\s+)*("|')?(\/|~\/?|\$HOME\/?|\*|\.\.?\/?)("|')?(\s|$)/, 'Menghapus folder penting secara rekursif'],
    [/\bsudo\b/, 'Menggunakan sudo (hak administrator)'],
    [/\bmkfs|\bnewfs_|\bdd\s+[^|]*of=\/dev\//, 'Menulis langsung ke disk'],
    [/\bdiskutil\s+(erase|partition|zero|secure|apfs\s+delete)/i, 'Mengubah / menghapus partisi disk'],
    [/:\(\)\s*\{\s*:\|:&\s*\};:/, 'Fork bomb'],
    [/\bgit\s+push\b[^\n]*\s(--force|-f)\b/, 'Force push ke git'],
    [/\bgit\s+(reset\s+--hard|clean\s+-\w*f)/, 'Membuang perubahan git secara permanen'],
    [/\b(shutdown|reboot|halt)\b/, 'Mematikan / restart komputer'],
    [/\bcsrutil\b|\bspctl\s+--master-disable|\bnvram\b/, 'Mengubah pengaturan keamanan sistem'],
    [/\bchmod\s+-R\s+777\b|\bchown\s+-R\b[^\n]*\s\/(\s|$)/, 'Mengubah izin file secara massal'],
    [/(curl|wget)[^|\n]*\|\s*(sudo\s+)?(ba|z)?sh\b/, 'Mengunduh lalu langsung menjalankan skrip'],
    [/\b(drop\s+database|drop\s+table|truncate\s+table)\b/i, 'Menghapus data database'],
    [/\bkillall\b|\bpkill\b/, 'Mematikan proses berdasarkan nama'],
    [/\blaunchctl\s+(unload|remove|bootout|disable)\b/, 'Mematikan layanan sistem'],
    // Windows (PowerShell / cmd)
    [/\bRemove-Item\b[^\n]*-Recurse\b[^\n]*\s("|')?([A-Za-z]:[\\\/]?|~[\\\/]?|\$HOME|\$env:USERPROFILE|\*)("|')?(\s|$)/i, 'Menghapus folder penting secara rekursif'],
    [/\b(rd|rmdir)\s+\/s\b[^\n]*\s[A-Za-z]:\\?(\s|$)|\bdel\s+\/[sq][^\n]*\s[A-Za-z]:\\?\*?(\s|$)/i, 'Menghapus folder penting secara rekursif'],
    [/\bformat(\.com)?\s+[A-Za-z]:|\b(diskpart|Format-Volume|Clear-Disk|Initialize-Disk|Remove-Partition)\b/i, 'Mengubah / menghapus partisi disk'],
    [/\b(Stop-Computer|Restart-Computer)\b|\bshutdown(\.exe)?\s+\/[srp]/i, 'Mematikan / restart komputer'],
    [/\b(Set-ExecutionPolicy\s+Unrestricted|bcdedit|Set-MpPreference|reg(\.exe)?\s+delete\s+HKLM|Remove-ItemProperty\b[^\n]*HKLM:)/i, 'Mengubah pengaturan keamanan sistem'],
    [/\b(iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^|\n]*\|\s*(iex|Invoke-Expression)\b/i, 'Mengunduh lalu langsung menjalankan skrip'],
    [/\b(Stop-Process|taskkill)\b[^\n]*(-Name|\/IM)\b/i, 'Mematikan proses berdasarkan nama'],
  ];
  function dangerReason(cmd) {
    for (var i = 0; i < DANGER.length; i++) if (DANGER[i][0].test(cmd)) return DANGER[i][1];
    return null;
  }
  /* Recoverable / local-only risks run without a prompt in full-auto mode;
     these can wreck the machine or need a password, so full-auto skips them
     (the agent is told to find another way) instead of stopping to ask. */
  var CRITICAL = /Menghapus folder penting|sudo|Menulis langsung ke disk|partisi disk|Fork bomb|Mematikan \/ restart komputer|pengaturan keamanan sistem|Mengunduh lalu langsung menjalankan/;
  function dangerLevel(cmd) {
    var r = dangerReason(cmd);
    return r ? { reason: r, critical: CRITICAL.test(r) } : null;
  }

  var TOOLS = [
    {
      name: 'read_file', kind: 'read', icon: 'file',
      description: 'Read a file from the local filesystem. Text/code files are returned with line numbers (cat -n format), up to 700 lines per call (more with offset/limit). Also reads any other file type: images (shown to you if you can see images, otherwise OCR text), PDF (text, OCR for scans), Word/RTF/ODT, Excel/ODS (as CSV), PowerPoint/ODP, Jupyter notebooks, SQLite databases, plists, archives (listing), audio/video (transcript + frames). Always read a file before editing it. You may call this for several files in parallel.',
      parameters: { type: 'object', properties: {
        path: { type: 'string', description: 'File path (relative to the project root, or absolute)' },
        offset: { type: 'integer', description: 'Line number to start reading from (1-based)' },
        limit: { type: 'integer', description: 'Maximum number of lines to read' },
      }, required: ['path'] },
      label: function (a, ctx) { return { verb: 'Membaca', target: rel(ctx, ctx.abs(a.path || '')) + (a.offset ? ':' + a.offset : '') }; },
      run: async function (a, ctx) {
        var p = ctx.abs(a.path);
        if (Files.needsSpecialReader(p)) {
          var st = await Native.call('fs.stat', { path: p });
          if (!st.exists) throw new Error('File tidak ditemukan: ' + p);
          var fr = await Files.forTool(p, !!ctx.vision);
          ctx.run.readFiles.set(p, st.mtime);
          return { content: U.truncateMiddle(fr.text || '(tidak ada teks)', 120000) + (fr.images.length ? '\n\n[' + fr.images.length + ' gambar dari file ini dilampirkan]' : ''),
            images: fr.images, display: { type: 'read', lines: (fr.text || '').split('\n').length } };
        }
        var r = await Native.call('fs.read', { path: p, maxBytes: 8000000 });
        if (r.binary) {
          var fb = await Files.forTool(p, !!ctx.vision);
          return { content: U.truncateMiddle(fb.text, 40000), images: fb.images };
        }
        ctx.run.readFiles.set(p, r.mtime);
        var lines = r.content.split('\n');
        if (!r.content) return { content: '(file is empty)', display: { type: 'read', lines: 0 } };
        var offset = Math.max(1, parseInt(a.offset, 10) || 1);
        // Token saver: big files are read in pages; the model asks for more with offset when needed.
        var limit = Math.max(1, parseInt(a.limit, 10) || (Store.settings.agent.lean !== false ? 700 : 2000));
        var slice = lines.slice(offset - 1, offset - 1 + limit);
        var out = numbered(slice, offset);
        if (offset - 1 + slice.length < lines.length || offset > 1) {
          out += '\n\n[Showing lines ' + offset + '–' + (offset + slice.length - 1) + ' of ' + lines.length + '. Use offset/limit to read other parts.]';
        }
        if (r.truncated) out += '\n[File is larger than 8 MB; only the beginning was read.]';
        return { content: out, display: { type: 'read', lines: lines.length, shown: slice.length } };
      },
    },
    {
      name: 'write_file', kind: 'write', icon: 'filePlus',
      description: 'Create a new file or completely overwrite an existing file with the given content. Parent directories are created automatically. Prefer edit_file for modifying existing files; only overwrite when a full rewrite is intended (read the file first).',
      parameters: { type: 'object', properties: {
        path: { type: 'string', description: 'File path (relative to the project root, or absolute)' },
        content: { type: 'string', description: 'The complete file content' },
      }, required: ['path', 'content'] },
      label: function (a, ctx) { return { verb: 'Menulis', target: rel(ctx, ctx.abs(a.path || '')) }; },
      targetPath: function (a, ctx) { return ctx.abs(a.path); },
      preview: async function (a, ctx) {
        var p = ctx.abs(a.path), old = null;
        try { old = (await readText(p)).content; } catch (e) { old = null; }
        return diffDisplay(rel(ctx, p), old || '', a.content || '', 1, old == null);
      },
      run: async function (a, ctx) {
        var p = ctx.abs(a.path), old = null;
        try { old = (await readText(p)).content; } catch (e) { old = null; }
        var content = typeof a.content === 'string' ? a.content : JSON.stringify(a.content, null, 2);
        await Native.call('fs.write', { path: p, content: content });
        ctx.run.readFiles.set(p, Date.now());
        var disp = diffDisplay(rel(ctx, p), old || '', content, 1, old == null);
        ctx.run.changes.push({ path: p, before: old, after: content });
        var n = content.split('\n').length;
        return {
          content: old == null ? 'Created ' + rel(ctx, p) + ' (' + n + ' lines).' : 'Overwrote ' + rel(ctx, p) + ' (' + n + ' lines, +' + disp.adds + ' −' + disp.dels + ').',
          display: disp,
        };
      },
    },
    {
      name: 'edit_file', kind: 'write', icon: 'fileEdit',
      description: 'Make an exact string replacement in a file. old_string must match the current file content exactly (including indentation and whitespace) and must be unique unless replace_all is true — include enough surrounding lines to make it unique. Use read_file first. For several separate changes, call edit_file several times.',
      parameters: { type: 'object', properties: {
        path: { type: 'string', description: 'File path (relative to the project root, or absolute)' },
        old_string: { type: 'string', description: 'Exact text to replace' },
        new_string: { type: 'string', description: 'Replacement text' },
        replace_all: { type: 'boolean', description: 'Replace every occurrence (default false)' },
      }, required: ['path', 'old_string', 'new_string'] },
      label: function (a, ctx) { return { verb: 'Mengedit', target: rel(ctx, ctx.abs(a.path || '')) }; },
      targetPath: function (a, ctx) { return ctx.abs(a.path); },
      preview: async function (a, ctx) {
        var p = ctx.abs(a.path);
        var content = '';
        try { content = (await readText(p)).content; } catch (e) { return null; }
        var idx = content.indexOf(a.old_string);
        var line = idx >= 0 ? content.slice(0, idx).split('\n').length : 1;
        return diffDisplay(rel(ctx, p), a.old_string || '', a.new_string || '', line, false);
      },
      run: async function (a, ctx) {
        var p = ctx.abs(a.path);
        var oldS = String(a.old_string == null ? '' : a.old_string), newS = String(a.new_string == null ? '' : a.new_string);
        var r;
        try { r = await readText(p); } catch (e) {
          if (oldS === '') {
            await Native.call('fs.write', { path: p, content: newS });
            ctx.run.changes.push({ path: p, before: null, after: newS });
            return { content: 'Created ' + rel(ctx, p) + '.', display: diffDisplay(rel(ctx, p), '', newS, 1, true) };
          }
          throw e;
        }
        var content = r.content;
        if (oldS === newS) return { content: 'old_string and new_string are identical — nothing to change.', isError: true };
        if (oldS === '') {
          if (content.trim() === '') {
            await Native.call('fs.write', { path: p, content: newS });
            ctx.run.changes.push({ path: p, before: content, after: newS });
            return { content: 'Wrote ' + rel(ctx, p) + '.', display: diffDisplay(rel(ctx, p), content, newS, 1, false) };
          }
          return { content: 'old_string is empty but the file is not. Provide the exact text to replace, or use write_file to overwrite.', isError: true };
        }
        var count = countOcc(content, oldS);
        if (!count && content.indexOf('\r\n') >= 0) {
          var o2 = oldS.replace(/\r?\n/g, '\r\n');
          if (countOcc(content, o2)) { oldS = o2; newS = newS.replace(/\r?\n/g, '\r\n'); count = countOcc(content, oldS); }
        }
        if (!count) {
          var hint = '';
          var first = oldS.split('\n').map(function (s) { return s.trim(); }).filter(Boolean)[0];
          if (first) {
            var lines = content.split('\n');
            for (var i = 0; i < lines.length; i++) {
              if (lines[i].trim() === first) {
                hint = '\nA line with the same text (ignoring indentation) exists at line ' + (i + 1) + ':\n' + numbered(lines.slice(i, i + Math.min(8, oldS.split('\n').length + 2)), i + 1) + '\nCheck indentation/whitespace and copy the exact text.';
                break;
              }
            }
          }
          return { content: 'old_string was not found in ' + rel(ctx, p) + '. Re-read the file with read_file and copy the exact current text (including indentation).' + hint, isError: true };
        }
        if (count > 1 && !a.replace_all) {
          return { content: 'old_string occurs ' + count + ' times in ' + rel(ctx, p) + '. Include more surrounding context to make it unique, or set replace_all=true.', isError: true };
        }
        var idx = content.indexOf(oldS);
        var startLine = content.slice(0, idx).split('\n').length;
        var updated = a.replace_all ? content.split(oldS).join(newS) : content.slice(0, idx) + newS + content.slice(idx + oldS.length);
        await Native.call('fs.write', { path: p, content: updated });
        ctx.run.readFiles.set(p, Date.now());
        ctx.run.changes.push({ path: p, before: content, after: updated });
        var nl = updated.split('\n');
        var s0 = Math.max(1, startLine - 3), s1 = Math.min(nl.length, startLine + newS.split('\n').length + 2);
        return {
          content: 'Edited ' + rel(ctx, p) + ' (' + (a.replace_all ? count + ' replacements' : '1 replacement') + '). Result around the change:\n' + numbered(nl.slice(s0 - 1, s1), s0),
          display: diffDisplay(rel(ctx, p), oldS, newS, startLine, false),
        };
      },
    },
    {
      name: 'list_directory', kind: 'read', icon: 'folder',
      description: 'List files and folders as a tree (default depth 2). Heavy folders like node_modules and .git are shown but not expanded. Hidden files are skipped unless include_hidden is true.',
      parameters: { type: 'object', properties: {
        path: { type: 'string', description: 'Directory path (default: project root)' },
        depth: { type: 'integer', description: 'How many levels deep to list (1-6, default 2)' },
        include_hidden: { type: 'boolean', description: 'Include dotfiles' },
      } },
      label: function (a, ctx) { return { verb: 'Melihat folder', target: rel(ctx, ctx.abs(a.path || '.')) || '.' }; },
      run: async function (a, ctx) {
        var p = ctx.abs(a.path || '.');
        var r = await Native.call('fs.list', { path: p, depth: Math.min(6, a.depth || 2), hidden: !!a.include_hidden, limit: 600 });
        if (!r.entries.length) return { content: '(empty directory)' };
        var out = r.entries.map(function (e) {
          var name = e.path.split('/').pop();
          return '  '.repeat(e.depth - 1) + name + (e.dir ? '/' : '') + (e.skipped ? '  (not expanded)' : '') + (!e.dir && e.size != null ? '  (' + fmtSize(e.size) + ')' : '');
        }).join('\n');
        if (r.truncated) out += '\n… (listing truncated; narrow the path or depth)';
        return { content: U.tildify(r.root, ctx.home) + '/\n' + out, display: { type: 'text', text: out } };
      },
    },
    {
      name: 'glob', kind: 'read', icon: 'search',
      description: 'Find files by glob pattern, e.g. "**/*.ts", "src/**/test_*.py", "*.json". Returns paths relative to the search root, most recently modified first.',
      parameters: { type: 'object', properties: {
        pattern: { type: 'string', description: 'Glob pattern' },
        path: { type: 'string', description: 'Directory to search (default: project root)' },
      }, required: ['pattern'] },
      label: function (a) { return { verb: 'Mencari file', target: a.pattern || '' }; },
      run: async function (a, ctx) {
        var root = ctx.abs(a.path || '.');
        var r = await Native.call('fs.glob', { root: root, pattern: a.pattern, limit: 300 });
        if (!r.files.length) return { content: 'No files match "' + a.pattern + '" under ' + rel(ctx, root) };
        var out = r.files.join('\n') + (r.truncated ? '\n… (' + r.total + ' matches total; showing 300)' : '');
        return { content: out, display: { type: 'text', text: out } };
      },
    },
    {
      name: 'grep', kind: 'read', icon: 'search',
      description: 'Search file contents with a regular expression (ripgrep if installed, otherwise grep -E). Returns matching lines as path:line:text. Use include to filter files (e.g. "*.js") and output_mode "files" to list matching files only.',
      parameters: { type: 'object', properties: {
        pattern: { type: 'string', description: 'Regular expression' },
        path: { type: 'string', description: 'File or directory to search (default: project root)' },
        include: { type: 'string', description: 'Glob filter for file names, e.g. "*.py" or "*.{ts,tsx}"' },
        ignore_case: { type: 'boolean' },
        context: { type: 'integer', description: 'Lines of context around each match (0-5)' },
        output_mode: { type: 'string', enum: ['content', 'files'], description: 'content (default) or files' },
      }, required: ['pattern'] },
      label: function (a) { return { verb: 'Mencari teks', target: a.pattern + (a.include ? '  ' + a.include : '') }; },
      run: async function (a, ctx) {
        var root = ctx.abs(a.path || '.');
        if (Store.info.posixShell === false) {
          var nr = await Native.call('fs.grep', { pattern: a.pattern, path: root, include: a.include, ignore_case: !!a.ignore_case, context: a.context, output_mode: a.output_mode });
          var nout = (nr.stdout || '').split(root + '/').join('');
          if (!nout.trim()) return { content: 'No matches for /' + a.pattern + '/ in ' + rel(ctx, root) };
          nout = U.truncateMiddle(nout, 30000);
          return { content: nout, display: { type: 'text', text: nout } };
        }
        if (hasRg == null) {
          var chk = await Native.call('exec.sync', { command: 'command -v rg', timeout: 5 });
          hasRg = chk.code === 0 && !!chk.stdout.trim();
        }
        var c = Math.max(0, Math.min(5, a.context | 0));
        var cmd;
        if (hasRg) {
          cmd = 'rg --line-number --no-heading --color never --max-columns 400 --max-count 100' + (a.ignore_case ? ' -i' : '') +
            (c ? ' -C ' + c : '') + (a.include ? ' --glob ' + U.shq(a.include) : '') + (a.output_mode === 'files' ? ' -l' : '') +
            ' -e ' + U.shq(a.pattern) + ' ' + U.shq(root);
        } else {
          var inc = a.include ? ' --include=' + U.shq(a.include) : '';
          cmd = 'grep -rnE -I' + (a.ignore_case ? 'i' : '') + (c ? ' -C ' + c : '') + (a.output_mode === 'files' ? ' -l' : '') + inc +
            ' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=dist --exclude-dir=build --exclude-dir=vendor --exclude-dir=.venv --exclude-dir=__pycache__ -e ' +
            U.shq(a.pattern) + ' ' + U.shq(root) + ' | head -400';
        }
        var r = await Native.call('exec.sync', { command: cmd, cwd: ctx.cwd || ctx.home, timeout: 40 });
        var out = (r.stdout || '').split(root + '/').join('');
        if (!out.trim()) {
          if (r.code > 1 && r.stderr) return { content: 'grep error: ' + r.stderr.trim(), isError: true };
          return { content: 'No matches for /' + a.pattern + '/ in ' + rel(ctx, root) };
        }
        var lines = out.split('\n');
        if (lines.length > 300) out = lines.slice(0, 300).join('\n') + '\n… (' + lines.length + ' lines; refine the pattern or path)';
        out = U.truncateMiddle(out, 30000);
        return { content: out, display: { type: 'text', text: out } };
      },
    },
    {
      name: 'run_command', kind: 'exec', icon: 'terminal',
      get description() {
        var where = U.isMac() ? '(zsh) on the user\'s Mac' : U.isWin() ? (Store.info.posixShell === false ? '(Windows PowerShell) on the user\'s Windows PC' : '(Git Bash) on the user\'s Windows PC') : '(bash) on the user\'s Linux computer';
        var admin = U.isMac() ? ' Set admin=true only for commands that truly need root — macOS will show its password dialog to the user.'
          : U.isWin() ? ' Commands needing administrator rights are not possible; tell the user to run them in an elevated terminal.'
          : ' Set admin=true only for commands that truly need root — the system will show its password dialog to the user.';
        return 'Run a shell command ' + where + ' and return combined stdout/stderr and the exit code. Non-interactive: never start editors, pagers, REPLs or watch modes; pass --yes/-y style flags. Default timeout ' +
          '180 s (max 1800). For servers, run them in the background with output redirected to a log file.' + admin;
      },
      parameters: { type: 'object', properties: {
        command: { type: 'string', description: 'The shell command to run' },
        description: { type: 'string', description: 'Short description of what the command does (shown to the user)' },
        cwd: { type: 'string', description: 'Working directory (default: project root)' },
        timeout: { type: 'integer', description: 'Timeout in seconds' },
        admin: { type: 'boolean', description: 'Run with administrator privileges via the system password dialog' },
      }, required: ['command'] },
      label: function (a) { return { verb: a.admin ? 'Menjalankan (admin)' : 'Menjalankan', target: a.description || a.command || '' }; },
      run: async function (a, ctx) {
        var cwd = a.cwd ? ctx.abs(a.cwd) : (ctx.cwd || ctx.home);
        var timeout = Math.max(5, Math.min(1800, parseInt(a.timeout, 10) || Store.settings.agent.commandTimeout || 180));
        var out = '';
        var job = Native.exec({ command: a.command, cwd: cwd, timeout: timeout, admin: !!a.admin }, function (stream, data) {
          out += data;
          if (out.length > 500000) out = out.slice(-400000);
          ctx.progress({ type: 'output', command: a.command, output: out.slice(-20000), running: true, admin: !!a.admin });
        });
        var off = ctx.onAbort(function () { job.kill(); });
        var r;
        try { r = await job.promise; } finally { off(); }
        var tail = U.truncateMiddle(out, 30000);
        var status = 'exit code: ' + r.code + (r.timedOut ? ' — TIMED OUT after ' + timeout + ' s, the process was killed' : '') + (r.killed ? ' — stopped by the user' : '');
        if (a.admin && r.code !== 0 && /User canceled|-128/.test(out)) status += ' — the user cancelled the administrator password dialog';
        return {
          content: (tail.trim() ? tail.replace(/\s+$/, '') : '(no output)') + '\n\n[' + status + ']',
          isError: r.code !== 0,
          display: { type: 'output', command: a.command, output: U.truncateMiddle(out, 60000), exitCode: r.code, timedOut: r.timedOut, admin: !!a.admin },
        };
      },
    },
    {
      name: 'web_search', kind: 'web', icon: 'globe',
      description: 'Search the web (DuckDuckGo). Returns titles, URLs and snippets of the top results. Use for current events, documentation, versions, prices and facts you are unsure of. Follow up with web_fetch to read the best sources.',
      parameters: { type: 'object', properties: {
        query: { type: 'string', description: 'Search query' },
      }, required: ['query'] },
      label: function (a) { return { verb: 'Mencari di web', target: a.query || '' }; },
      run: async function (a) {
        var q = String(a.query || '').trim();
        if (!q) return { content: 'Empty query', isError: true };
        var headers = { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9,id;q=0.8', Accept: 'text/html' };
        var results = [], tried = [];
        for (var i = 0; i < SEARCH_ENGINES.length && results.length < 3; i++) {
          var eng = SEARCH_ENGINES[i];
          try {
            var res = await Native.call('http.request', { url: eng.url(q), method: 'GET', headers: headers, timeout: 20 });
            if (res.status >= 400) { tried.push(eng.name + ' HTTP ' + res.status); continue; }
            var found = eng.parse(new DOMParser().parseFromString(res.body || '', 'text/html'));
            found.forEach(function (r) {
              r.url = cleanUrl(r.url);
              if (/^https?:/.test(r.url) && !results.some(function (x) { return x.url === r.url; })) results.push(r);
            });
            tried.push(eng.name + ' ' + found.length);
          } catch (e) { tried.push(eng.name + ' ' + e.message); }
        }
        results = results.slice(0, 8);
        if (!results.length) return { content: 'No results (search services unavailable: ' + tried.join('; ') + '). Try a different query, or use web_fetch on a known URL.', isError: true };
        var out = results.map(function (r, i) { return (i + 1) + '. [' + r.title + '](' + r.url + ')\n   ' + r.snippet; }).join('\n');
        return { content: 'Search results for "' + q + '":\n\n' + out, display: { type: 'links', items: results } };
      },
    },
    {
      name: 'web_fetch', kind: 'web', icon: 'globe',
      description: 'Fetch a web page (or PDF/JSON/text) by URL and return its readable text content. Use after web_search to read sources, or for documentation URLs the user gives.',
      parameters: { type: 'object', properties: {
        url: { type: 'string', description: 'http(s) URL' },
      }, required: ['url'] },
      label: function (a) { return { verb: 'Membaca halaman', target: a.url || '' }; },
      run: async function (a) {
        var url = String(a.url || '').trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        var headers = { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml,application/json,text/plain,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9,id;q=0.8' };
        var res = await Native.call('http.request', { url: url, method: 'GET', headers: headers, timeout: 40, maxBytes: 6000000 });
        if (res.status >= 400) return { content: 'HTTP ' + res.status + ' when fetching ' + url, isError: true };
        var type = (res.headers['content-type'] || '').toLowerCase();
        var text, title = '';
        if (type.indexOf('application/pdf') >= 0 || /\.pdf($|\?)/i.test(res.url)) {
          var bin = await Native.call('http.request', { url: url, method: 'GET', headers: headers, timeout: 60, binary: true, maxBytes: 30000000 });
          var ex = await Native.call('doc.extractText', { base64: bin.base64, ext: 'pdf' });
          text = ex.text;
          title = 'PDF (' + (ex.pages || '?') + ' halaman)';
        } else if (type.indexOf('html') >= 0 || /^\s*</.test(res.body || '')) {
          var conv = U.htmlToText(res.body || '', res.url || url);
          text = conv.text; title = conv.title;
        } else {
          text = res.body || '';
        }
        text = U.truncateMiddle(text, 60000);
        return { content: (title ? '# ' + title + '\n' : '') + 'URL: ' + (res.url || url) + '\n\n' + (text || '(no readable text)'), display: { type: 'text', text: text.slice(0, 3000) } };
      },
    },
    {
      name: 'todo_write', kind: 'meta', icon: 'list',
      description: 'Create or update the task checklist for the current work. Send the COMPLETE list every time. Use it for any task with 3+ steps: plan first, keep exactly one item in_progress, mark items completed immediately after finishing them.',
      parameters: { type: 'object', properties: {
        todos: { type: 'array', items: { type: 'object', properties: {
          content: { type: 'string', description: 'Task description (imperative)' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
        }, required: ['content', 'status'] } },
      }, required: ['todos'] },
      label: function (a) {
        var t = Array.isArray(a.todos) ? a.todos : [];
        var done = t.filter(function (x) { return x.status === 'completed'; }).length;
        return { verb: 'Memperbarui rencana', target: done + '/' + t.length + ' selesai' };
      },
      run: async function (a, ctx) {
        var todos = (Array.isArray(a.todos) ? a.todos : []).map(function (t) {
          return { content: String(t.content || t.task || ''), status: ['pending', 'in_progress', 'completed'].indexOf(t.status) >= 0 ? t.status : 'pending' };
        }).filter(function (t) { return t.content; });
        ctx.conv.todos = todos;
        ctx.onTodos();
        var done = todos.filter(function (t) { return t.status === 'completed'; }).length;
        var left = todos.filter(function (t) { return t.status !== 'completed'; }).map(function (t) { return '- [' + t.status + '] ' + t.content; }).join('\n');
        return { content: 'Todo list updated: ' + done + '/' + todos.length + ' completed.' + (left ? '\nRemaining:\n' + left : ' All tasks completed.'), display: { type: 'todos' } };
      },
    },
    {
      name: 'task', kind: 'read', icon: 'layers',
      description: 'Sub-agent with its own context; several task calls in one response run in PARALLEL. Default read-only research → concise report. can_write=true makes a WORKER that builds/edits its own disjoint `files` (needs auto/edits permission) — give a complete self-contained spec; integrate & verify afterwards.',
      parameters: { type: 'object', properties: {
        description: { type: 'string', description: 'Short (3–6 word) label for the task' },
        prompt: { type: 'string', description: 'Detailed, self-contained instructions for the sub-agent' },
        can_write: { type: 'boolean', description: 'true = worker that may create/edit files' },
        files: { type: 'array', items: { type: 'string' }, description: 'Worker only: the files/folders it owns (must not overlap with other parallel workers)' },
      }, required: ['description', 'prompt'] },
      label: function (a) { return { verb: 'Sub-agen', target: a.description || '' }; },
      run: async function (a, ctx) { return Engine.runSubagent(a, ctx); },
    },
    {
      name: 'exit_plan_mode', kind: 'plan', icon: 'list',
      description: 'Present your implementation plan to the user for approval (only in plan mode). After approval you get full tool access and should start implementing.',
      parameters: { type: 'object', properties: {
        plan: { type: 'string', description: 'The plan in Markdown: goal, approach, files to change, ordered steps, risks, verification' },
      }, required: ['plan'] },
      label: function () { return { verb: 'Rencana siap', target: 'menunggu persetujuan' }; },
      run: async function (a, ctx) {
        ctx.conv.permission = ctx.conv.prevPermission || (Store.settings.permission === 'plan' ? 'ask' : Store.settings.permission) || 'ask';
        ctx.conv.prevPermission = null;
        ctx.onTodos();
        return { content: 'The user approved the plan. Plan mode is off and you now have full tool access. Implement the plan now, step by step (use todo_write), and verify the result.', display: { type: 'plan', plan: a.plan } };
      },
    },
    {
      name: 'memory', kind: 'meta', icon: 'memory',
      description: 'Long-term memory about the user across conversations. action "save" stores a short durable fact or preference (one sentence, third person, e.g. "User prefers TypeScript"). action "forget" removes memories containing the given text. Use sparingly; never store secrets.',
      parameters: { type: 'object', properties: {
        action: { type: 'string', enum: ['save', 'forget'] },
        text: { type: 'string', description: 'The fact to save, or text identifying what to forget' },
      }, required: ['action', 'text'] },
      label: function (a) { return { verb: a.action === 'forget' ? 'Melupakan' : 'Mengingat', target: a.text || '' }; },
      run: async function (a) {
        var m = Store.settings.memory = Store.settings.memory || { enabled: true, items: [] };
        var text = String(a.text || '').trim();
        if (!text) return { content: 'Empty text', isError: true };
        if (a.action === 'forget') {
          var before = m.items.length;
          m.items = m.items.filter(function (x) { return x.text.toLowerCase().indexOf(text.toLowerCase()) < 0; });
          Store.saveSettings();
          return { content: 'Removed ' + (before - m.items.length) + ' memory item(s).' };
        }
        if (!m.items.some(function (x) { return x.text === text; })) m.items.push({ id: U.uid('mem_'), text: text, ts: Date.now() });
        Store.saveSettings();
        return { content: 'Saved to memory.' };
      },
    },
    {
      name: 'search_conversations', kind: 'read', icon: 'search',
      description: 'Search the user\'s earlier Sinai conversations (all chats, code sessions and designs) by keywords. Use it when the user refers to something discussed before ("yang kemarin", "seperti sebelumnya", "lanjutkan proyek X") or when past context would help. Returns matching conversations with dated snippets.',
      parameters: { type: 'object', properties: {
        query: { type: 'string', description: 'Keywords to look for (any language)' },
        limit: { type: 'integer', description: 'Max conversations (default 6)' },
      }, required: ['query'] },
      label: function (a) { return { verb: 'Mencari percakapan lama', target: a.query || '' }; },
      run: async function (a, ctx) {
        var terms = String(a.query || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(function (t) { return t.length > 1; });
        if (!terms.length) return { content: 'Empty query', isError: true };
        var limit = Math.max(1, Math.min(15, parseInt(a.limit, 10) || 6));
        var hits = [];
        var entries = Store.index.filter(function (e) { return !ctx.conv || e.id !== ctx.conv.id; }).slice(0, 400);
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i], c = Store.convs.get(e.id);
          if (!c) { try { var raw = await Native.call('store.read', { name: 'conversations/' + e.id + '.json' }); c = raw ? JSON.parse(raw) : null; } catch (x) { c = null; } }
          if (!c || c.eval) continue;
          var parts = [];
          (c.messages || []).forEach(function (m) {
            if ((m.role === 'user' && !(m.meta && m.meta.synthetic)) || m.role === 'assistant') {
              var t = (m.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join(' ');
              if (t) parts.push({ role: m.role, text: t, ts: m.ts });
            }
          });
          var title = String(c.title || '').toLowerCase(), score = 0, best = null, bestN = 0;
          terms.forEach(function (t) { if (title.indexOf(t) >= 0) score += 3; });
          parts.forEach(function (p) {
            var low = p.text.toLowerCase(), n = 0;
            terms.forEach(function (t) { if (low.indexOf(t) >= 0) n++; });
            score += n;
            if (n > bestN) { bestN = n; best = p; }
          });
          if (!score) continue;
          var snip = '';
          if (best) {
            var low2 = best.text.toLowerCase(), at = Math.max(0, Math.min.apply(null, terms.map(function (t) { var k = low2.indexOf(t); return k < 0 ? 1e9 : k; })) - 160);
            snip = (at ? '…' : '') + best.text.slice(at, at + 600).replace(/\s+/g, ' ') + '…';
          }
          hits.push({ score: score, text: '## ' + (c.title || 'Tanpa judul') + ' · ' + (c.mode || 'chat') + ' · ' + new Date(c.updatedAt || c.createdAt || 0).toISOString().slice(0, 10) + ' (id ' + c.id + ')\n' + (best ? '[' + best.role + '] ' : '') + snip });
        }
        hits.sort(function (x, y) { return y.score - x.score; });
        return { content: hits.length ? hits.slice(0, limit).map(function (h) { return h.text; }).join('\n\n') : 'No earlier conversation matches "' + a.query + '".' };
      },
    },
    {
      name: 'delete_path', kind: 'write', icon: 'trash',
      get description() { return 'Move a file or folder to the ' + (U.isMac() ? 'macOS Trash' : U.isWin() ? 'Windows Recycle Bin' : 'Trash') + ' (recoverable).' + this._desc; },
      _desc: ' Only when the user asked for deletion or it is clearly part of the task.',
      parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      label: function (a, ctx) { return { verb: U.plat('Memindahkan ke Trash'), target: rel(ctx, ctx.abs(a.path || '')) }; },
      targetPath: function (a, ctx) { return ctx.abs(a.path); },
      run: async function (a, ctx) {
        var p = ctx.abs(a.path);
        await Native.call('fs.trash', { path: p });
        ctx.run.changes.push({ path: p, before: '(deleted)', after: null });
        return { content: 'Moved ' + rel(ctx, p) + ' to the Trash.' };
      },
    },
    {
      name: 'move_path', kind: 'write', icon: 'folder',
      description: 'Move or rename a file or folder.',
      parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
      label: function (a, ctx) { return { verb: 'Memindahkan', target: rel(ctx, ctx.abs(a.from || '')) + ' → ' + rel(ctx, ctx.abs(a.to || '')) }; },
      targetPath: function (a, ctx) { return ctx.abs(a.to); },
      run: async function (a, ctx) {
        var r = await Native.call('fs.move', { from: ctx.abs(a.from), to: ctx.abs(a.to) });
        ctx.run.changes.push({ path: r.to, before: '(moved from ' + r.from + ')', after: '(moved)' });
        return { content: 'Moved ' + rel(ctx, r.from) + ' → ' + rel(ctx, r.to) };
      },
    },

    {
      name: 'ask_user', kind: 'question', icon: 'chat',
      description: 'Ask ONE multiple-choice question (2–4 options, recommended first) only when a decision truly depends on the user and a wrong guess wastes real work. Never to ask permission to continue. Auto-answered with the first option in full-auto.',
      parameters: { type: 'object', properties: {
        question: { type: 'string', description: 'The question (one sentence)' },
        options: { type: 'array', items: { type: 'object', properties: { label: { type: 'string', description: '1–5 words' }, description: { type: 'string', description: 'What choosing it means' } }, required: ['label'] }, description: '2–4 options, recommended first' },
        questions: { type: 'array', description: 'Optional: up to 3 questions asked together, each {question, options}', items: { type: 'object' } },
      }, required: ['question', 'options'] },
      label: function (a) { return { verb: 'Bertanya', target: a.question || '' }; },
      run: async function () { return { content: '' }; },
    },
    {
      name: 'skill', kind: 'read', icon: 'bulb',
      description: 'Load a skill (reusable instructions listed under "# Skills" in the system prompt) by name. Call it before starting a task that matches a skill description, then follow the returned instructions.',
      parameters: { type: 'object', properties: { name: { type: 'string', description: 'Skill name, e.g. "laporan-mingguan"' } }, required: ['name'] },
      label: function (a) { return { verb: 'Memuat skill', target: a.name || '' }; },
      run: async function (a) {
        var sk = Skills.get(a.name);
        if (!sk) return { content: 'Skill "' + a.name + '" tidak ada. Skill tersedia: ' + Skills.active().map(function (x) { return x.name; }).join(', '), isError: true };
        var extra = '';
        if (sk.dir) {
          try {
            var l = await Native.call('fs.list', { path: sk.dir, depth: 2, limit: 60 });
            var files = (l.entries || []).filter(function (e) { return !e.dir && !/SKILL\.md$/i.test(e.path); }).map(function (e) { return sk.dir + '/' + e.path; });
            if (files.length) extra = '\n\n[Files bundled with this skill — read them with read_file only if the instructions refer to them]\n' + files.join('\n');
          } catch (e) { /* no folder */ }
        }
        return { content: '<skill name="' + sk.name + '">\n' + sk.body + '\n</skill>' + extra };
      },
    },
    {
      name: 'generate_image', kind: 'output', icon: 'image',
      description: 'Generate or edit a real image with the user\'s image model. Prompt in English, rich: subject, setting, composition/camera, lighting, palette, style, mood; text to render in "quotes". For crisp vector logos/diagrams use create_file SVG instead.',
      parameters: { type: 'object', properties: {
        prompt: { type: 'string', description: 'Detailed English image prompt' },
        aspect_ratio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '3:2', '2:3', '21:9'], description: 'Default 1:1' },
        count: { type: 'integer', description: 'Number of variations (1–4), default 1' },
        use_attachments: { type: 'boolean', description: 'Use the images the user attached as references / the image to edit' },
        reference_paths: { type: 'array', items: { type: 'string' }, description: 'Paths of existing images to edit or use as reference (e.g. a previously generated file)' },
        filename: { type: 'string', description: 'File name without extension' },
      }, required: ['prompt'] },
      label: function (a) { return { verb: 'Membuat gambar', target: U.truncateMiddle(a.filename || a.prompt || '', 60) }; },
      run: async function (a, ctx) { return ImageGen.run(a, ctx); },
    },
    {
      name: 'save_skill', kind: 'output', icon: 'bulb',
      description: 'Save a skill: the complete SKILL.md content (front matter with name + description, then Markdown instructions). It is validated and auto-fixed; errors are returned so you can correct and call again. Load the "skill-creator" skill first for the required format.',
      parameters: { type: 'object', properties: { content: { type: 'string', description: 'Full SKILL.md content' }, overwrite: { type: 'boolean', description: 'Replace an existing skill with the same name' } }, required: ['content'] },
      label: function (a) { var p = Skills.parse(a.content || ''); return { verb: 'Menyimpan skill', target: p.meta.name || '' }; },
      run: async function (a, ctx) {
        var rep = await Skills.save(String(a.content || ''), { overwrite: !!a.overwrite, workspace: ctx.cwd });
        if (rep.errors.length) return { content: 'Skill NOT saved. Fix these problems and call save_skill again:\n- ' + rep.errors.join('\n- ') + (rep.warnings.length ? '\nWarnings:\n- ' + rep.warnings.join('\n- ') : ''), isError: true };
        return { content: 'Skill "' + rep.meta.name + '" saved to ' + rep.saved + '. The user can run it with /' + rep.meta.name + '.' + (rep.warnings.length ? '\nAuto-fixed / suggestions:\n- ' + rep.warnings.join('\n- ') : '') };
      },
    },
    {
      name: 'create_file', kind: 'output', icon: 'filePlus',
      description: 'Create a REAL file (PPTX, PDF, Word, Excel/CSV, PNG/JPG/SVG image, MP4 video, text formats) saved for the user and shown in the canvas. Use it for every file/deliverable request — never answer with code that would generate the file. content by kind: document = full Markdown; presentation = Markdown slides separated by "---" (first slide "# Title" + subtitle; Sinai designs the layouts); spreadsheet = CSV or Markdown tables ("## Sheet" above each); image = one <svg> with viewBox or a full HTML page (set width/height); video = scenes as slides, optional "Narasi: …" lines; text = raw text. Complete real content in the user\'s language. One call per format. Reply briefly afterwards.',
      parameters: { type: 'object', properties: {
        kind: { type: 'string', enum: ['document', 'presentation', 'spreadsheet', 'image', 'video', 'text'] },
        format: { type: 'string', description: 'File format/extension, e.g. pptx, pdf, docx, xlsx, png, mp4' },
        filename: { type: 'string', description: 'File name without extension, e.g. "Laporan Penjualan Q3"' },
        title: { type: 'string', description: 'Human title of the file' },
        content: { type: 'string', description: 'The file content as described for each kind' },
        html: { type: 'string', description: 'presentation / document / image designed in HTML + CSS (preferred for designed files): decks use one <section class="slide"> (1280×720) per slide; Sinai converts it to the requested format and shows the code in the canvas' },
        sheets: { type: 'array', description: 'spreadsheet alternative to content: [{name, rows: [[...], ...]}]', items: { type: 'object' } },
        width: { type: 'integer', description: 'image width in px' },
        height: { type: 'integer', description: 'image height in px' },
        theme: { type: 'object', description: 'presentation look (optional; chosen automatically from the topic): {name: aurora|midnight|emerald|sunset|ocean|royal|graphite|corporate|terracotta} and/or hex colours {background, text, accent, accent2}' },
        template: { type: 'string', description: 'Name of one of the user\'s design templates to build on (see "# Design templates"); defaults to the active template' },
        paper: { type: 'string', enum: ['a4', 'letter'], description: 'document pdf paper size' },
        landscape: { type: 'boolean' },
        scene_seconds: { type: 'number', description: 'video: seconds per scene (default 4)' },
        narrate: { type: 'boolean', description: 'video: speak scene text when no "Narasi:" lines are given' },
      }, required: ['kind', 'format'] },
      label: function (a) {
        var f = String(a.format || '').toUpperCase();
        return { verb: 'Membuat file' + (f ? ' ' + f : ''), target: a.filename || a.title || '' };
      },
      run: async function (a, ctx) { return Outputs.create(a, ctx); },
    },

    // ---- macOS integration tools (gated by approval) ----
    {
      name: 'calendar', kind: 'integration', icon: 'history',
      description: 'The user\'s Calendar. action "list" returns events between from/to (ISO dates). action "create" adds an event (title + start required). Times are local ISO like 2026-10-20T14:00.',
      parameters: { type: 'object', properties: {
        action: { type: 'string', enum: ['list', 'create'] },
        from: { type: 'string' }, to: { type: 'string' }, query: { type: 'string' },
        title: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' },
        location: { type: 'string' }, notes: { type: 'string' }, allDay: { type: 'boolean' }, calendar: { type: 'string' },
      }, required: ['action'] },
      label: function (a) { return { verb: a.action === 'create' ? 'Membuat acara' : 'Membaca kalender', target: a.title || (a.from ? a.from + '…' : '') }; },
      run: async function (a) {
        if (a.action === 'create') { var r = await Native.call('calendar.create', a); return { content: 'Acara dibuat di kalender "' + r.calendar + '".' }; }
        var ev = await Native.call('calendar.list', a);
        return { content: ev.length ? JSON.stringify(ev, null, 2) : 'Tidak ada acara pada rentang itu.' };
      },
    },
    {
      name: 'reminders', kind: 'integration', icon: 'check',
      description: 'The user\'s Reminders. action "list" (optionally includeCompleted) or "create" (title required, optional due ISO datetime, notes, list).',
      parameters: { type: 'object', properties: {
        action: { type: 'string', enum: ['list', 'create'] }, includeCompleted: { type: 'boolean' },
        title: { type: 'string' }, due: { type: 'string' }, notes: { type: 'string' }, list: { type: 'string' },
      }, required: ['action'] },
      label: function (a) { return { verb: a.action === 'create' ? 'Membuat pengingat' : 'Membaca pengingat', target: a.title || '' }; },
      run: async function (a) {
        if (a.action === 'create') { var r = await Native.call('reminders.create', a); return { content: 'Pengingat dibuat di daftar "' + r.list + '".' }; }
        var rem = await Native.call('reminders.list', a);
        return { content: rem.length ? JSON.stringify(rem, null, 2) : 'Tidak ada pengingat.' };
      },
    },
    {
      name: 'contacts', kind: 'integration', icon: 'user',
      description: 'The user\'s Contacts. action "search" by name/email/phone/org, or "create" (at least a name or organization).',
      parameters: { type: 'object', properties: {
        action: { type: 'string', enum: ['search', 'create'] }, query: { type: 'string' }, limit: { type: 'integer' },
        givenName: { type: 'string' }, familyName: { type: 'string' }, organization: { type: 'string' },
        phone: { type: 'string' }, email: { type: 'string' }, note: { type: 'string' },
      }, required: ['action'] },
      label: function (a) { return { verb: a.action === 'create' ? 'Membuat kontak' : 'Mencari kontak', target: a.query || [a.givenName, a.familyName].filter(Boolean).join(' ') }; },
      run: async function (a) {
        if (a.action === 'create') { await Native.call('contacts.create', a); return { content: 'Kontak dibuat.' }; }
        var c = await Native.call('contacts.search', a);
        return { content: c.length ? JSON.stringify(c, null, 2) : 'Tidak ada kontak yang cocok.' };
      },
    },
    {
      name: 'send_message', kind: 'integration', icon: 'chat', confirm: 'always',
      description: 'Send a message on the user\'s behalf. channel "email" composes in Mail (set send=true to send immediately, otherwise it opens a visible draft); channel "imessage" sends an iMessage to a phone/email. Always summarise the recipient and content first.',
      parameters: { type: 'object', properties: {
        channel: { type: 'string', enum: ['email', 'imessage'] },
        to: { type: 'string', description: 'Recipient (comma/newline separated for email)' },
        cc: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' },
        send: { type: 'boolean', description: 'Email only: send now instead of opening a draft' },
        attachments: { type: 'array', items: { type: 'string' } },
      }, required: ['channel', 'to', 'body'] },
      label: function (a) { return { verb: a.channel === 'imessage' ? 'Kirim iMessage' : (a.send ? 'Kirim email' : 'Buat draf email'), target: a.to || '' }; },
      run: async function (a) {
        if (a.channel === 'imessage') {
          await Native.call('apple.script', { name: 'messages.send', args: [a.to, a.body] });
          return { content: 'iMessage terkirim ke ' + a.to + '.' };
        }
        var args = [(a.to || '').replace(/[,;]/g, '\n'), (a.cc || '').replace(/[,;]/g, '\n'), a.subject || '', a.body || '', a.send ? '1' : '0'];
        (a.attachments || []).forEach(function (p) { args.push(U.resolvePath(null, p, Store.info.home)); });
        var r = await Native.call('apple.script', { name: 'mail.compose', args: args });
        return { content: r.result === 'sent' ? 'Email terkirim ke ' + a.to + '.' : 'Draf email dibuka di Mail untuk ' + a.to + ' — tinggal Anda tinjau & kirim.' };
      },
    },
    {
      name: 'run_shortcut', kind: 'integration', icon: 'zap',
      description: 'Run one of the user\'s macOS Shortcuts by name, optionally with text input. Returns the shortcut\'s output. Use list_shortcuts first if unsure of the name.',
      parameters: { type: 'object', properties: { name: { type: 'string' }, input: { type: 'string' } }, required: ['name'] },
      label: function (a) { return { verb: 'Menjalankan Shortcut', target: a.name || '' }; },
      run: async function (a) {
        var r = await Native.call('shortcuts.run', a);
        return { content: 'Shortcut selesai.' + (r.output ? '\nOutput:\n' + r.output : '') + (r.outputPath ? '\nFile output: ' + r.outputPath : '') };
      },
    },
    {
      name: 'list_shortcuts', kind: 'read', icon: 'list',
      description: 'List the names of the user\'s macOS Shortcuts.',
      parameters: { type: 'object', properties: {} },
      label: function () { return { verb: 'Daftar Shortcuts', target: '' }; },
      run: async function () { var l = await Native.call('shortcuts.list'); return { content: l.length ? l.join('\n') : 'Tidak ada Shortcut.' }; },
    },
    {
      name: 'notify', kind: 'meta', icon: 'bulb',
      description: 'Show a system notification to the user (e.g. when a long task finishes). Keep it short.',
      parameters: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title'] },
      label: function (a) { return { verb: 'Notifikasi', target: a.title || '' }; },
      run: async function (a) { await Native.call('notify.show', a); return { content: 'Notifikasi ditampilkan.' }; },
    },
    {
      name: 'open_preview', kind: 'meta', icon: 'globe',
      description: 'Show a live view in the Sinai Browser panel so the user sees the result: a dev server (http://localhost:5173), a project HTML file or folder (absolute path or path relative to the project, e.g. "index.html" or "dist/" — served directly, no server needed, auto-reloads when files change), or an https URL. Then call browser_check to read the page console and fix errors.',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'http(s) URL, or absolute/project-relative path of an .html file or folder' } }, required: ['url'] },
      label: function (a) { return { verb: 'Membuka live view', target: a.url || '' }; },
      run: async function (a, ctx) {
        var u = String(a.url || '').trim();
        if (!u) throw new Error('url wajib');
        var shown = window.Panel && Panel.openPreview ? Panel.openPreview(u, ctx.conv) : false;
        if (!shown) await Native.call('app.openURL', { url: u }).catch(function () {});
        return { content: shown ? 'Live view shown in the Sinai preview panel: ' + u : 'Opened in the default browser: ' + u };
      },
    },
    {
      name: 'browser_check', kind: 'meta', icon: 'globe',
      description: 'Read the console (errors, warnings, logs) of the page currently open in the Sinai Browser live view, optionally reloading it first. Use after open_preview / after edits to verify a web result runs without errors.',
      parameters: { type: 'object', properties: { reload: { type: 'boolean', description: 'Reload the page first (default true)' }, wait_ms: { type: 'number', description: 'How long to let the page run before reading (default 2000)' } } },
      label: function () { return { verb: 'Memeriksa konsol live view', target: '' }; },
      run: async function (a) {
        if (!window.Browser || !Browser.logs()) return { content: 'No page is open in the Sinai Browser. Call open_preview first.' };
        if (a.reload !== false) Browser.reload();
        await new Promise(function (r) { setTimeout(r, Math.min(15000, Math.max(300, a.wait_ms || 2000))); });
        var r = Browser.logs();
        var errs = r.logs.filter(function (l) { return l.level === 'error'; }), warns = r.logs.filter(function (l) { return l.level === 'warn'; });
        return { content: 'Page: ' + r.url + '\nErrors: ' + errs.length + ', warnings: ' + warns.length + ', logs: ' + r.logs.length +
          (r.logs.length ? '\n' + r.logs.slice(-40).map(function (l) { return '[' + l.level + '] ' + l.text; }).join('\n') : '\n(console clean)') };
      },
    },
    {
      name: 'open_app', kind: 'integration', icon: 'external',
      description: 'Open something on the user\'s device: an installed application by name (e.g. "Safari", "Visual Studio Code", "Finder"), a file or folder with its default app (absolute path), or a URL in the default browser. Optional `app` opens the target with that application.',
      parameters: { type: 'object', properties: {
        target: { type: 'string', description: 'App name, absolute path, or URL' },
        app: { type: 'string', description: 'Optional application to open the path/URL with' },
      }, required: ['target'] },
      label: function (a) { return { verb: 'Membuka', target: (a.app ? a.app + ' · ' : '') + (a.target || '') }; },
      run: async function (a, ctx) {
        var t = String(a.target || '').trim(), app = String(a.app || '').trim();
        if (!t) throw new Error('target wajib');
        var q = function (x) { return '"' + String(x).replace(/(["\\$`])/g, '\\$1') + '"'; };
        var isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(t), isPath = /^[\/~]|^[A-Za-z]:[\/]/.test(t);
        if (!app && isUrl && /^(https?|mailto):/i.test(t)) { await Native.call('app.openURL', { url: t }); return { content: 'Opened ' + t }; }
        if (!app && isPath) {
          var ok = await Native.call('app.openPath', { path: t });
          if (!ok) throw new Error('Tidak ada aplikasi untuk membuka ' + t);
          return { content: 'Opened ' + t + ' with its default app.' };
        }
        var out = '';
        var cmd = U.isMac() ? (app ? 'open -a ' + q(app) + ' ' + q(t) : 'open -a ' + q(t))
          : U.isWin() ? 'cmd //c start "" ' + (app ? q(app) + ' ' : '') + q(t)
          : (app ? q(app) + ' ' + q(t) : '(gtk-launch ' + q(t) + ' || ' + q(t).toLowerCase() + ')') + ' >/dev/null 2>&1 &';
        var r = await Native.exec({ command: cmd, cwd: ctx.conv && ctx.conv.workspace || undefined, timeout: 20 }, function (stream, data) { out += data; }).promise;
        if (r.code) throw new Error('Gagal membuka "' + (app || t) + '" (exit ' + r.code + ')' + (out.trim() ? ': ' + out.trim().slice(0, 300) : ''));
        return { content: 'Opened ' + (app ? t + ' with ' + app : t) + '.' };
      },
    },
    {
      name: 'scan_dev_servers', kind: 'read', icon: 'globe',
      description: 'Detect local development servers by scanning common localhost ports (3000, 5173, 8080, …). Returns the ports that are listening so you can preview or curl them.',
      parameters: { type: 'object', properties: { ports: { type: 'array', items: { type: 'integer' } } } },
      label: function () { return { verb: 'Memindai dev server', target: 'localhost' }; },
      run: async function (a) {
        var r = await Native.call('net.scanDev', a || {});
        return { content: r.servers.length ? 'Dev server aktif:\n' + r.servers.map(function (s) { return '- ' + s.url; }).join('\n') : 'Tidak ada dev server yang terdeteksi di port umum.' };
      },
    },
    {
      name: 'pdf_tools', kind: 'write', icon: 'file',
      description: 'Edit PDFs: op "merge" (paths[] → one PDF), "split" (path + pages like "1-3,5"), "watermark"/"stamp" (path + text), "encrypt" (path + newPassword). Saves the result (savePath to write directly, otherwise a Save dialog). For locked input PDFs pass password.',
      parameters: { type: 'object', properties: {
        op: { type: 'string', enum: ['merge', 'split', 'watermark', 'stamp', 'encrypt'] },
        path: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } },
        pages: { type: 'string' }, text: { type: 'string' }, opacity: { type: 'number' },
        password: { type: 'string' }, newPassword: { type: 'string' }, savePath: { type: 'string' }, name: { type: 'string' },
      }, required: ['op'] },
      label: function (a) { return { verb: 'PDF ' + (a.op || ''), target: U.basename(a.path || (a.paths && a.paths[0]) || '') }; },
      targetPath: function (a, ctx) { return a.savePath ? ctx.abs(a.savePath) : null; },
      run: async function (a, ctx) {
        var args = Object.assign({}, a);
        if (a.path) args.path = ctx.abs(a.path);
        if (a.paths) args.paths = a.paths.map(function (p) { return ctx.abs(p); });
        if (a.savePath) args.savePath = ctx.abs(a.savePath);
        var out = await Native.call('pdf.edit', args);
        return out ? { content: 'PDF disimpan: ' + out } : { content: 'Dibatalkan (tidak ada file disimpan).' };
      },
    },
    {
      name: 'convert_image', kind: 'write', icon: 'image',
      get description() { return 'Convert an image file to another format: ' + (U.isMac() ? 'jpeg, png, heic, tiff, gif, bmp, or pdf' : 'jpeg, png, webp, tiff, bmp, or pdf') + '.' + this._desc; },
      _desc: ' Provide path and format; savePath to write directly, otherwise a Save dialog appears.',
      parameters: { type: 'object', properties: {
        path: { type: 'string' }, format: { type: 'string' }, quality: { type: 'number' }, savePath: { type: 'string' }, name: { type: 'string' },
      }, required: ['path', 'format'] },
      label: function (a) { return { verb: 'Konversi gambar', target: U.basename(a.path || '') + ' → ' + (a.format || '') }; },
      targetPath: function (a, ctx) { return a.savePath ? ctx.abs(a.savePath) : null; },
      run: async function (a, ctx) {
        var out = await Native.call('export.image', { path: ctx.abs(a.path), format: a.format, quality: a.quality, savePath: a.savePath ? ctx.abs(a.savePath) : undefined, name: a.name });
        return out ? { content: 'Gambar disimpan: ' + out } : { content: 'Dibatalkan.' };
      },
    },
  ];

  var byName = {};
  TOOLS.forEach(function (t) { byName[t.name] = t; });

  function defs(names) {
    return names.map(function (n) { return byName[n]; }).filter(Boolean)
      .map(function (t) { return { name: t.name, description: t.description, parameters: t.parameters }; });
  }

  var INTEGRATION = ['calendar', 'reminders', 'contacts', 'send_message', 'run_shortcut', 'list_shortcuts', 'notify', 'scan_dev_servers', 'pdf_tools', 'convert_image'];
  // Apple-app integrations exist only in the macOS host; the generic tools work everywhere.
  var INTEGRATION_ANY_OS = ['notify', 'scan_dev_servers', 'pdf_tools', 'convert_image'];
  function integrationsOn() { return Store.settings.integrations !== false; }
  function integrationTools() { return integrationsOn() ? (U.feature('integrations') ? INTEGRATION : INTEGRATION_ANY_OS) : []; }

  window.Tools = {
    get: function (n) { return byName[n] || null; },
    all: TOOLS,
    forCode: function () { return defs(['read_file', 'write_file', 'edit_file', 'list_directory', 'glob', 'grep', 'run_command', 'todo_write', 'task', 'web_search', 'web_fetch', 'search_conversations', 'delete_path', 'move_path', 'create_file', 'generate_image', 'ask_user', 'skill', 'save_skill', 'open_preview', 'browser_check', 'open_app'].concat(integrationTools())); },
    forPlan: function () { return defs(['read_file', 'list_directory', 'glob', 'grep', 'task', 'web_search', 'web_fetch', 'todo_write', 'exit_plan_mode', 'ask_user', 'skill']); },
    forSubagent: function () { return defs(['read_file', 'list_directory', 'glob', 'grep', 'web_search', 'web_fetch']); },
    forWorker: function (exec) { return defs(['read_file', 'list_directory', 'glob', 'grep', 'web_search', 'web_fetch', 'write_file', 'edit_file'].concat(exec ? ['run_command'] : [])); },
    forChat: function (web) { return defs(['create_file', 'generate_image', 'ask_user', 'skill', 'save_skill', 'search_conversations'].concat(web ? ['web_search', 'web_fetch'] : []).concat(Store.settings.memory && Store.settings.memory.enabled === false ? [] : ['memory']).concat(integrationTools())); },
    defs: defs,
    isSafeCommand: isSafeCommand,
    dangerReason: dangerReason, dangerLevel: dangerLevel,
  };
})();
