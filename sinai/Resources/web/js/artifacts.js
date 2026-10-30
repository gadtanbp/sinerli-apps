/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Artifacts: self-contained content the model creates (web pages, React apps,
   SVG, diagrams, documents, slide decks, code) shown in a live canvas.
   The model writes  <artifact id=".." type=".." title="..">…</artifact>  and
   edits with  <artifact_edit id=".."><find>…</find><replace>…</replace></artifact_edit>.
   Versions are derived from the conversation, so regenerate/edit/rewind just work. */
(function () {
  'use strict';

  var TYPES = {
    html: { label: 'Halaman web', icon: 'globe', ext: 'html', visual: true },
    react: { label: 'Aplikasi React', icon: 'code', ext: 'jsx', visual: true },
    svg: { label: 'Gambar SVG', icon: 'image', ext: 'svg', visual: true },
    mermaid: { label: 'Diagram', icon: 'layers', ext: 'mmd', visual: true },
    slides: { label: 'Presentasi', icon: 'play', ext: 'md', visual: true },
    board: { label: 'Board', icon: 'layers', ext: 'json', visual: true },
    '3d': { label: 'Scene 3D', icon: 'box', ext: 'js', visual: true },
    markdown: { label: 'Dokumen', icon: 'file', ext: 'md', visual: true },
    code: { label: 'Kode', icon: 'code', ext: 'txt', visual: false },
    file: { label: 'File', icon: 'file', ext: '', visual: true },
  };

  function normalizeType(t) {
    t = String(t || '').toLowerCase().trim();
    if (/^(3d|three|threejs|three\.js|scene|webgl|3d-scene|model)$/.test(t)) return '3d';
    if (/react|jsx|tsx/.test(t)) return 'react';
    if (/board|whiteboard|kanban|mind ?map|moodboard|canvas|space|flowboard/.test(t)) return 'board';
    if (/svg/.test(t)) return 'svg';
    if (/mermaid|diagram/.test(t)) return 'mermaid';
    if (/slide|deck|presentation|ppt/.test(t)) return 'slides';
    if (/markdown|text\/md|^md$|document|^doc$/.test(t)) return 'markdown';
    if (/html/.test(t)) return 'html';
    if (/code|python|javascript|typescript/.test(t)) return 'code';
    return t && TYPES[t] ? t : 'html';
  }

  function slug(s) {
    return String(s || 'artifact').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'artifact';
  }

  function parseAttrs(s) {
    var out = {}, re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, m;
    while ((m = re.exec(s))) out[m[1].toLowerCase()] = m[2] != null ? m[2] : m[3];
    return out;
  }

  /* Models sometimes wrap the body in a Markdown fence; remove it. */
  function stripFence(body, complete) {
    var b = body.replace(/^\s*\n/, '');
    var m = /^\s*```[\w+-]*[ \t]*\n/.exec(b);
    if (m) {
      b = b.slice(m[0].length);
      if (complete) b = b.replace(/\n?```\s*$/, '');
      else b = b.replace(/\n?```\s*$/, '');
    }
    return complete ? b.replace(/\s+$/, '') + '\n' : b;
  }

  function parsePairs(body) {
    var pairs = [], re = /<find>([\s\S]*?)<\/find>\s*<replace>([\s\S]*?)<\/replace>/g, m;
    while ((m = re.exec(body))) pairs.push({ find: m[1].replace(/^\n/, '').replace(/\n$/, ''), replace: m[2].replace(/^\n/, '').replace(/\n$/, '') });
    return pairs;
  }

  function partialTagLen(text) {
    var tags = ['<artifact', '<artifact_edit'];
    for (var k = Math.min(14, text.length); k > 0; k--) {
      var tail = text.slice(-k);
      if (tags.some(function (t) { return t.indexOf(tail) === 0; })) return k;
    }
    return 0;
  }

  /* Code belongs in the canvas, not the chat: every fenced block becomes an
     artifact the user can export as a file. A file call a model wrote as text
     (DSML, <function_calls>…) is shown as the file it describes, never as markup. */
  var FENCE_MIN = 1;
  var LANGS = { js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript', py: 'Python', python: 'Python',
    html: 'HTML', css: 'CSS', jsx: 'React', tsx: 'React', json: 'JSON', sql: 'SQL', sh: 'Shell', bash: 'Shell', zsh: 'Shell', shell: 'Shell',
    php: 'PHP', java: 'Java', kotlin: 'Kotlin', swift: 'Swift', go: 'Go', rust: 'Rust', ruby: 'Ruby', c: 'C', cpp: 'C++', 'c++': 'C++',
    csharp: 'C#', cs: 'C#', dart: 'Dart', yaml: 'YAML', yml: 'YAML', xml: 'XML', svg: 'SVG', mermaid: 'Diagram' };
  var LEAK_RE = /<\s*[|｜]\s*DSML\s*[|｜]|<[|｜]tool[▁_ ]calls?[▁_ ]begin[|｜]>|<function_calls>|<invoke\s+name=|<tool_call[\s>]/;

  function fenceType(lang, code) {
    var l = lang.toLowerCase(), head = code.slice(0, 400);
    if (l === 'mermaid') return 'mermaid';
    if (l === 'svg' || /^\s*<svg[\s>]/i.test(head)) return 'svg';
    if (/^(html?|xml)?$/.test(l) && /<!doctype html|<html[\s>]|<body[\s>]/i.test(head)) return 'html';
    if (/^(jsx|tsx)$/.test(l) && /export\s+default/.test(code)) return 'react';
    return 'code';
  }

  /* Splits a text segment into text and code-artifact segments. key keeps ids stable per message block. */
  function splitFences(text, key, counter) {
    var leak = LEAK_RE.exec(text), leaked = leak ? leakedSegs(text.slice(leak.index), key, counter) : [];
    if (leak) text = text.slice(0, leak.index);
    var out = [], re = /^ {0,3}(`{3,}|~{3,})[ \t]*([\w#+.-]*)([^\n]*)\n/gm, m, i = 0;
    while ((m = re.exec(text))) {
      var fence = m[1], start = m.index + m[0].length;
      var close = new RegExp('^ {0,3}' + fence[0] + '{' + fence.length + ',}[ \\t]*$', 'm');
      var rest = text.slice(start), cm = close.exec(rest);
      var code = cm ? rest.slice(0, cm.index) : rest;
      var end = cm ? start + cm.index + cm[0].length : text.length;
      if (code.split('\n').filter(function (l) { return l.trim(); }).length < FENCE_MIN) { re.lastIndex = end; continue; }
      if (m.index > i) out.push({ kind: 'text', text: text.slice(i, m.index) });
      var info = fenceInfo(m[2] || '', m[3] || ''), lang = info.lang, type = fenceType(lang, code), n = counter.n++;
      out.push({ kind: 'artifact', id: slug('kode-' + key + '-' + n), type: type, fence: true, language: lang, filename: info.filename,
        title: info.filename || (type === 'html' ? 'Halaman web' : type === 'svg' ? 'Gambar SVG' : type === 'mermaid' ? 'Diagram' : type === 'react' ? 'Aplikasi React' : ('Kode ' + (LANGS[lang] || lang || '')).trim()),
        content: code.replace(/\s+$/, '') + '\n', complete: !!cm });
      i = end;
      re.lastIndex = end;
    }
    if (i < text.length) out.push({ kind: 'text', text: text.slice(i) });
    return out.concat(leaked);
  }

  var EXT_LANG = { py: 'python', js: 'javascript', mjs: 'javascript', ts: 'typescript', htm: 'html', md: 'markdown', yml: 'yaml', rb: 'ruby', rs: 'rust', kt: 'kotlin', sh: 'shell' };
  /* ```python main.py  ·  ```js title="app.js"  ·  ```index.html  → language + file name */
  function fenceInfo(word, rest) {
    var lang = word.toLowerCase(), filename = '';
    var fm = /(?:title|file(?:name)?)\s*=\s*["']?([^"'\s]+)/i.exec(rest) || /^\s*([\w./-]+\.\w{1,8})\s*$/.exec(rest);
    if (fm) filename = fm[1].split('/').pop();
    if (/\.\w{1,8}$/.test(lang) && !filename) { filename = word; lang = ''; }
    if (!lang && filename) { var e = filename.split('.').pop().toLowerCase(); lang = EXT_LANG[e] || e; }
    return { lang: lang, filename: filename };
  }

  /* create_file calls written as text → the document / deck / page they carry. */
  function leakedSegs(raw, key, counter) {
    var calls = window.Providers && Providers.parseLeakedCalls ? Providers.parseLeakedCalls(raw) : [];
    var out = [];
    calls.forEach(function (c) {
      var a = c.args || {}, title = a.title || a.filename || 'File';
      var body = typeof a.html === 'string' && a.html ? a.html : typeof a.content === 'string' ? a.content : '';
      if (!body) return;
      var type = a.html ? (/^\s*<svg[\s>]/i.test(body) ? 'svg' : 'html')
        : a.kind === 'presentation' ? 'slides' : a.kind === 'document' ? 'markdown' : fenceType('', body);
      out.push({ kind: 'artifact', id: slug('file-' + key + '-' + counter.n++), type: type, title: title, filename: a.filename || '',
        language: type === 'code' ? 'text' : '', format: a.format || '', args: a, content: body.replace(/\s+$/, '') + '\n', complete: !c.unclosed });
    });
    return out;
  }

  /* opts.fences: also move code fences to the canvas; opts.key: id prefix (message + block). */
  function parse(text, opts) {
    var segs = parseTags(text);
    if (!opts || !opts.fences) return segs;
    var counter = { n: 0 }, out = [];
    segs.forEach(function (s) {
      if (s.kind === 'text') out.push.apply(out, splitFences(s.text, opts.key || 'x', counter));
      else out.push(s);
    });
    return out;
  }

  function parseTags(text) {
    text = String(text || '');
    if (text.indexOf('<artifact') < 0) {
      var k0 = partialTagLen(text);
      return [{ kind: 'text', text: k0 ? text.slice(0, -k0) : text }];
    }
    var segs = [], i = 0, re = /<(artifact_edit|artifact)\b([^>]*)>/g, m;
    while ((m = re.exec(text))) {
      if (m.index < i) continue;
      if (m.index > i) segs.push({ kind: 'text', text: text.slice(i, m.index) });
      var tag = m[1], attrs = parseAttrs(m[2]);
      var close = '</' + tag + '>';
      var start = m.index + m[0].length;
      var end = text.indexOf(close, start);
      var complete = end >= 0;
      var body = complete ? text.slice(start, end) : text.slice(start);
      if (tag === 'artifact') {
        var type = normalizeType(attrs.type);
        if (type === 'code' && attrs.language && /^(html?)$/i.test(attrs.language)) type = 'html';
        segs.push({ kind: 'artifact', id: slug(attrs.id || attrs.identifier || attrs.title), type: type, title: attrs.title || 'Artifact',
          language: attrs.language || '', content: stripFence(body, complete), complete: complete });
      } else {
        segs.push({ kind: 'edit', id: slug(attrs.id || attrs.identifier), pairs: parsePairs(body), complete: complete });
      }
      i = complete ? end + close.length : text.length;
      re.lastIndex = i;
    }
    if (i < text.length) {
      var rest = text.slice(i), k = partialTagLen(rest);
      segs.push({ kind: 'text', text: k ? rest.slice(0, -k) : rest });
    }
    return segs;
  }

  function hasArtifacts(text, opts) {
    text = String(text || '');
    if (text.indexOf('<artifact') >= 0) return true;
    return !!(opts && opts.fences) && (/^ {0,3}(`{3,}|~{3,})/m.test(text) || LEAK_RE.test(text));
  }

  function applyEdit(content, pairs) {
    var out = content;
    for (var i = 0; i < pairs.length; i++) {
      var f = pairs[i].find, r = pairs[i].replace;
      if (!f) return { error: 'Teks <find> kosong' };
      var first = out.indexOf(f);
      if (first < 0) {
        // tolerate trailing-whitespace differences per line
        var norm = function (s) { return s.split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).join('\n'); };
        var nOut = norm(out), nF = norm(f);
        var idx = nOut.indexOf(nF);
        if (idx < 0) return { error: 'Teks yang dicari tidak ditemukan: "' + f.slice(0, 80) + '"' };
        out = nOut.slice(0, idx) + r + nOut.slice(idx + nF.length);
        continue;
      }
      if (out.indexOf(f, first + f.length) >= 0) return { error: 'Teks yang dicari muncul lebih dari sekali: "' + f.slice(0, 80) + '"' };
      out = out.slice(0, first) + r + out.slice(first + f.length);
    }
    return { content: out };
  }

  var cache = new WeakMap();

  /* All artifacts of a conversation with their version history. */
  function collect(conv) {
    var files = 0;
    var sig = conv.messages.length + ':' + conv.messages.reduce(function (n, m) {
      if (m.role !== 'assistant') return n;
      return n + (m.content || []).reduce(function (a, b) {
        if (b.type === 'tool_call' && b.name === 'create_file' && b.display && b.display.type === 'file') files++;
        return a + (b.type === 'text' ? (b.text || '').length : 0);
      }, 0);
    }, 0) + ':' + files;
    var hit = cache.get(conv);
    if (hit && hit.sig === sig) return hit.value;
    var byId = {}, order = [], errors = [];
    var fences = conv.mode !== 'code';
    conv.messages.forEach(function (m) {
      if (m.role !== 'assistant') return;
      (m.content || []).forEach(function (b, bi) {
        // Real files made with create_file: one artifact per name+format, versions = re-creations.
        if (b.type === 'tool_call' && b.name === 'create_file' && b.display && b.display.type === 'file') {
          var d = b.display, fa = byId[d.id];
          if (!fa) { fa = byId[d.id] = { id: d.id, type: 'file', title: d.title || d.name, kind: d.kind, format: d.format, versions: [] }; order.push(d.id); }
          fa.title = d.title || d.name;
          fa.versions.push({ content: '', file: d, args: b.args || {}, msgId: m.id, complete: true });
          return;
        }
        var po = { fences: fences, key: m.id + '-' + bi };
        if (b.type !== 'text' || !hasArtifacts(b.text, po)) return;
        parse(b.text, po).forEach(function (s) {
          if (s.kind === 'artifact') {
            var a = byId[s.id];
            if (!a) { a = byId[s.id] = { id: s.id, type: s.type, title: s.title, language: s.language, filename: s.filename, format: s.format, args: s.args, versions: [] }; order.push(s.id); }
            a.type = s.type; a.title = s.title || a.title; a.language = s.language || a.language;
            a.versions.push({ content: s.content, msgId: m.id, complete: s.complete, streaming: !s.complete && !!m.streaming });
          } else if (s.kind === 'edit') {
            var t = byId[s.id];
            if (!s.complete) { if (t) t.editing = m.streaming ? m.id : null; return; }
            if (!t || !t.versions.length) { errors.push({ msgId: m.id, id: s.id, error: 'Artifact "' + s.id + '" belum ada' }); return; }
            var base = t.versions[t.versions.length - 1].content;
            var res = applyEdit(base, s.pairs);
            if (res.error) { errors.push({ msgId: m.id, id: s.id, error: res.error }); return; }
            t.editing = null;
            t.versions.push({ content: res.content, msgId: m.id, complete: true, edit: true });
          }
        });
      });
    });
    var value = { byId: byId, list: order.map(function (id) { return byId[id]; }), errors: errors };
    cache.set(conv, { sig: sig, value: value });
    return value;
  }

  // ------------------------------------------------------------------ preview documents

  var LIB = 'sinai-preview://lib/';
  var CDN = {
    tailwind: 'https://cdn.tailwindcss.com/3.4.16',
    babel: 'https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.10/babel.min.js',
    shims: 'https://cdn.jsdelivr.net/npm/es-module-shims@1.10.1/dist/es-module-shims.js',
    mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js',
    marked: 'https://cdn.jsdelivr.net/npm/marked@15.0.12/lib/marked.umd.js',
  };

  function jsString(s) {
    return JSON.stringify(String(s)).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  }
  function escHtml(s) { return U.esc(s); }

  /* Error reporting + click-to-select element inspector, talking to the app via postMessage. */
  function bootScript() {
    return '<script>(function(){' +
      'function send(m){try{m.__gx=1;parent.postMessage(m,"*")}catch(e){}}' +
      'window.__gxReport=function(msg){send({type:"error",message:String(msg)})};' +
      'window.addEventListener("error",function(e){send({type:"error",message:String(e.message||e)+(e.lineno?" (baris "+e.lineno+")":"")})});' +
      'window.addEventListener("unhandledrejection",function(e){var r=e.reason;send({type:"error",message:"Unhandled: "+(r&&r.message||r)})});' +
      'var on=false,box=null,tip=null;' +
      'function css(el,s){for(var k in s)el.style[k]=s[k]}' +
      'function ensure(){if(box)return;box=document.createElement("div");tip=document.createElement("div");' +
      'css(box,{position:"fixed",pointerEvents:"none",zIndex:2147483646,outline:"2px solid #6e6bff",background:"rgba(110,107,255,.10)",borderRadius:"3px",transition:"all .06s"});' +
      'css(tip,{position:"fixed",pointerEvents:"none",zIndex:2147483647,background:"#6e6bff",color:"#fff",font:"11px -apple-system,sans-serif",padding:"2px 6px",borderRadius:"4px"});' +
      'document.documentElement.appendChild(box);document.documentElement.appendChild(tip)}' +
      'function hide(){if(box){box.style.display="none";tip.style.display="none"}}' +
      'function path(el){var p=[];while(el&&el.nodeType===1&&p.length<5&&el!==document.body){var s=el.tagName.toLowerCase();' +
      'if(el.id){s+="#"+el.id;p.unshift(s);break}var c=(el.getAttribute("class")||"").trim().split(/\\s+/).filter(Boolean).slice(0,2);if(c.length)s+="."+c.join(".");' +
      'var par=el.parentElement;if(par){var sib=[].filter.call(par.children,function(x){return x.tagName===el.tagName});if(sib.length>1)s+=":nth-of-type("+(sib.indexOf(el)+1)+")"}' +
      'p.unshift(s);el=el.parentElement}return p.join(" > ")}' +
      'document.addEventListener("mouseover",function(e){if(!on)return;ensure();var r=e.target.getBoundingClientRect();' +
      'css(box,{display:"block",left:r.left+"px",top:r.top+"px",width:r.width+"px",height:r.height+"px"});' +
      'tip.textContent=e.target.tagName.toLowerCase()+(e.target.id?"#"+e.target.id:"");css(tip,{display:"block",left:r.left+"px",top:Math.max(0,r.top-20)+"px"})},true);' +
      'document.addEventListener("click",function(e){if(!on)return;e.preventDefault();e.stopPropagation();var el=e.target;' +
      'send({type:"pick",selector:path(el),tag:el.tagName.toLowerCase(),text:(el.innerText||el.textContent||"").trim().slice(0,240),html:(el.outerHTML||"").slice(0,1600)})},true);' +
      'window.addEventListener("message",function(e){var d=e.data||{};if(d.__gxCmd==="inspect"){on=!!d.on;if(!on)hide();document.documentElement.style.cursor=on?"crosshair":""}});' +
      'send({type:"ready"})})();<\/script>';
  }

  function wrapHtml(content, opts) {
    var boot = opts.export ? '' : bootScript();
    var c = String(content || '');
    if (!/<html[\s>]/i.test(c) && !/<!doctype/i.test(c)) {
      c = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + c + '</body></html>';
    }
    if (/<head[^>]*>/i.test(c)) return c.replace(/<head[^>]*>/i, function (m) { return m + '<meta charset="utf-8">' + boot; });
    return c.replace(/<html[^>]*>/i, function (m) { return m + '<head><meta charset="utf-8">' + boot + '</head>'; });
  }

  function bareImports(src) {
    var specs = {}, re = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g, m;
    while ((m = re.exec(src))) {
      var s = m[1] || m[2];
      if (s && !/^(\.|\/|https?:|data:|blob:)/.test(s)) specs[s] = 1;
    }
    return Object.keys(specs);
  }

  function reactDoc(src, opts) {
    var exp = !!opts.export;
    var map = exp ? {
      react: 'https://esm.sh/react@18.3.1', 'react-dom': 'https://esm.sh/react-dom@18.3.1',
      'react-dom/client': 'https://esm.sh/react-dom@18.3.1/client', 'react/jsx-runtime': 'https://esm.sh/react@18.3.1/jsx-runtime',
    } : {
      react: LIB + 'react-shim.js', 'react-dom': LIB + 'react-dom-shim.js', 'react-dom/client': LIB + 'react-dom-client-shim.js',
      'react/jsx-runtime': LIB + 'jsx-runtime-shim.js', 'react/jsx-dev-runtime': LIB + 'jsx-runtime-shim.js',
    };
    var specs = bareImports(src), usesThree = specs.some(function (s) { return /^three(\/|$)|^@react-three\//.test(s); });
    if (usesThree && !exp) { map.three = LIB + 'three/three.module.min.js'; map['three/addons/'] = LIB + 'three/addons/'; map['three/examples/jsm/'] = LIB + 'three/addons/'; }
    specs.forEach(function (s) {
      if (map[s] || (!exp && usesThree && /^three\//.test(s))) return;
      map[s] = 'https://esm.sh/' + s + (exp ? '?deps=react@18.3.1,react-dom@18.3.1' + (usesThree ? ',three@' + THREE_VER : '') : '?external=react,react-dom' + (usesThree ? ',three' : ''));
    });
    var head = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      (exp ? '' : bootScript()) +
      '<script src="' + (exp ? CDN.tailwind : LIB + 'tailwind.js') + '"><\/script>' +
      (exp ? '' : '<script src="' + LIB + 'react.min.js"><\/script><script src="' + LIB + 'react-dom.min.js"><\/script>') +
      '<script src="' + (exp ? CDN.babel : LIB + 'babel.min.js') + '"><\/script>' +
      '<script type="importmap-shim">' + JSON.stringify({ imports: map }).replace(/</g, '\\u003c') + '<\/script>' +
      '<script>window.esmsInitOptions={shimMode:true};<\/script>' +
      '<script src="' + (exp ? CDN.shims : LIB + 'es-module-shims.js') + '"><\/script>' +
      '<style>html,body{margin:0;min-height:100%;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}' +
      '#gx-err{font:13px/1.5 ui-monospace,Menlo,monospace;color:#b42318;background:#fef3f2;border:1px solid #fecdca;border-radius:10px;padding:14px;margin:16px;white-space:pre-wrap}</style>' +
      '</head><body><div id="root"></div><script>(async function(){try{' +
      'var src=' + jsString(src) + ';' +
      'if(!/import\\s+React\\b|import\\s+\\*\\s+as\\s+React\\b/.test(src))src="import React from \\"react\\";\\n"+src;' +
      'var code=Babel.transform(src,{filename:"App.tsx",presets:[["typescript",{isTSX:true,allExtensions:true}],["react",{runtime:"classic"}]]}).code;' +
      'var url=URL.createObjectURL(new Blob([code],{type:"text/javascript"}));' +
      'var mod=await importShim(url);var React=await importShim("react");React=React.default||React;' +
      'var C=mod.default||Object.keys(mod).map(function(k){return mod[k]}).filter(function(v){return typeof v==="function"})[0];' +
      'if(!C)throw new Error("Komponen harus di-export default.");' +
      'var client=await importShim("react-dom/client");(client.createRoot||client.default.createRoot)(document.getElementById("root")).render(React.createElement(C));' +
      '}catch(e){var d=document.createElement("div");d.id="gx-err";d.textContent=(e&&e.message)||String(e);document.body.appendChild(d);if(window.__gxReport)window.__gxReport((e&&e.message)||e)}})();<\/script></body></html>';
    return head;
  }

  function svgDoc(src, opts) {
    return '<!doctype html><html><head><meta charset="utf-8">' + (opts.export ? '' : bootScript()) +
      '<style>html,body{margin:0;background:#fff}body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;box-sizing:border-box}svg{width:100%;max-width:760px;height:auto;max-height:calc(100vh - 48px)}</style></head><body>' +
      src + '</body></html>';
  }

  function mermaidDoc(src, opts) {
    return '<!doctype html><html><head><meta charset="utf-8">' + (opts.export ? '' : bootScript()) +
      '<script src="' + (opts.export ? CDN.mermaid : LIB + 'mermaid.min.js') + '"><\/script>' +
      '<style>html,body{margin:0;background:#fff}body{display:flex;justify-content:center;padding:28px;font-family:-apple-system,sans-serif}.mermaid{width:100%;text-align:center}.mermaid svg{width:100%;max-width:980px!important;height:auto}</style></head><body>' +
      '<pre class="mermaid">' + escHtml(src) + '</pre><script>try{mermaid.initialize({startOnLoad:false,theme:"default",securityLevel:"strict",fontFamily:"-apple-system,sans-serif"});' +
      'mermaid.run().catch(function(e){if(window.__gxReport)window.__gxReport("Mermaid: "+(e.message||e));document.body.insertAdjacentHTML("beforeend","<pre style=\\"color:#b42318\\">"+String(e.message||e).replace(/</g,"&lt;")+"</pre>")})}catch(e){if(window.__gxReport)window.__gxReport(e.message)}<\/script></body></html>';
  }

  var DOC_CSS = 'html{background:#fff}body{margin:0 auto;max-width:780px;padding:56px 48px 80px;font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1b1c2b}' +
    'h1{font-size:2.1em;line-height:1.2;margin:0 0 .6em;letter-spacing:-.02em}h2{font-size:1.45em;margin:1.6em 0 .5em}h3{font-size:1.15em;margin:1.4em 0 .4em}' +
    'code{font:.88em ui-monospace,Menlo,monospace;background:#f2f3f7;padding:.1em .35em;border-radius:5px}pre{background:#f6f7fb;padding:14px 16px;border-radius:10px;overflow:auto}pre code{background:none;padding:0}' +
    'blockquote{margin:0 0 1em;padding:.2em 1em;border-left:3px solid #6e6bff;color:#555;background:#f7f7fd}table{border-collapse:collapse;margin:0 0 1em;width:100%}th,td{border:1px solid #e3e5ee;padding:7px 10px;text-align:left}th{background:#f6f7fb}' +
    'img{max-width:100%}hr{border:0;height:1px;background:#e5e7ef;margin:2em 0}a{color:#4b48d6}@media print{body{padding:0}}';

  function markdownDoc(src, opts) {
    return '<!doctype html><html><head><meta charset="utf-8">' + (opts.export ? '' : bootScript()) +
      '<script src="' + (opts.export ? CDN.marked : LIB + 'marked.js') + '"><\/script><style>' + DOC_CSS + '</style></head><body><article id="doc"></article>' +
      '<script>document.getElementById("doc").innerHTML=marked.parse(' + jsString(src) + ',{gfm:true});<\/script></body></html>';
  }

  /* Slides use Sinai's deck designer (deck.js): automatic theme + layouts. */
  function slidesDoc(src, opts) {
    return Deck.html(src, { print: !!opts.print, boot: opts.export ? '' : bootScript() });
  }

  function codeDoc(src, lang) {
    return '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff}pre{margin:0;padding:24px;font:13px/1.6 ui-monospace,Menlo,monospace;white-space:pre-wrap}</style></head><body><pre>' +
      escHtml(src) + '</pre></body></html>';
  }

  /* ---------------- 3D (three.js, offline) ----------------
     A '3d' artifact is a JavaScript module. Unless it builds its own renderer,
     Sinai prepares: THREE, scene, camera, renderer, controls (orbit), helpers
       add(obj), animate(fn(t, dt)), load(url) → Promise<Object3D>, fit(obj),
       light(preset), ground(); other addons via import "three/addons/...". */
  var THREE_VER = '0.170.0';
  function threeMap(exp) {
    var base = exp ? 'https://cdn.jsdelivr.net/npm/three@' + THREE_VER + '/' : LIB + 'three/';
    return { imports: {
      three: exp ? base + 'build/three.module.min.js' : base + 'three.module.min.js',
      'three/addons/': exp ? base + 'examples/jsm/' : base + 'addons/',
      'three/examples/jsm/': exp ? base + 'examples/jsm/' : base + 'addons/',
    } };
  }
  function threeHead(opts, title) {
    var exp = !!opts.export;
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + (title ? '<title>' + escHtml(title) + '</title>' : '') +
      (exp ? '' : bootScript()) +
      '<script type="importmap-shim">' + JSON.stringify(threeMap(exp)) + '<\/script>' +
      '<script>window.esmsInitOptions={shimMode:true};<\/script>' +
      '<script src="' + (exp ? CDN.shims : LIB + 'es-module-shims.js') + '"><\/script>' +
      '<style>html,body{margin:0;height:100%;overflow:hidden;background:#0f1117;color:#e8e8f0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
      'canvas{display:block;outline:none}#gx-err{position:fixed;left:12px;right:12px;bottom:12px;font:12px/1.5 ui-monospace,Menlo,monospace;color:#ffd7d7;background:rgba(120,20,20,.85);border-radius:10px;padding:12px;white-space:pre-wrap;z-index:9}' +
      '#gx-hud{position:fixed;left:10px;top:10px;font-size:11px;opacity:.55;pointer-events:none;z-index:5}</style></head>';
  }
  var THREE_RUNTIME = 'import * as THREE from "three";import{OrbitControls}from"three/addons/controls/OrbitControls.js";import{RoomEnvironment}from"three/addons/environments/RoomEnvironment.js";' +
    'const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);' +
    'renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.appendChild(renderer.domElement);' +
    'const scene=new THREE.Scene();scene.background=new THREE.Color(0x14161f);const pm=new THREE.PMREMGenerator(renderer);scene.environment=pm.fromScene(new RoomEnvironment(),0.04).texture;' +
    'const camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,0.01,5000);camera.position.set(3,2.2,4);' +
    'const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.set(0,0.6,0);' +
    'const hemi=new THREE.HemisphereLight(0xffffff,0x334455,0.6);scene.add(hemi);const sun=new THREE.DirectionalLight(0xffffff,2.2);sun.position.set(5,8,4);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);' +
    'Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10});scene.add(sun);' +
    'const loops=[];const clock=new THREE.Clock();function animate(fn){loops.push(fn)}function add(...o){o.forEach(x=>scene.add(x));return o[0]}' +
    'function ground(size=20,color=0x1d2030){const g=new THREE.Mesh(new THREE.CircleGeometry(size,64),new THREE.MeshStandardMaterial({color,roughness:.95}));g.rotation.x=-Math.PI/2;g.receiveShadow=true;scene.add(g);return g}' +
    'function fit(obj,pad=1.4){const b=new THREE.Box3().setFromObject(obj);if(b.isEmpty())return;const s=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());const r=Math.max(s.x,s.y,s.z)*pad;' +
    'controls.target.copy(c);camera.position.copy(c).add(new THREE.Vector3(r*.9,r*.6,r*1.1));camera.near=r/500;camera.far=r*200;camera.updateProjectionMatrix();controls.update()}' +
    'async function load(url,opts={}){const ext=(opts.ext||url.split("?")[0].split(".").pop()).toLowerCase();let o;' +
    'if(ext==="glb"||ext==="gltf"){const{GLTFLoader}=await importShim("three/addons/loaders/GLTFLoader.js");const g=await new GLTFLoader().loadAsync(url);o=g.scene;o.userData.animations=g.animations;if(g.animations&&g.animations.length){const mx=new THREE.AnimationMixer(o);g.animations.forEach(a=>mx.clipAction(a).play());animate((t,dt)=>mx.update(dt))}}' +
    'else if(ext==="obj"){const{OBJLoader}=await importShim("three/addons/loaders/OBJLoader.js");o=await new OBJLoader().loadAsync(url)}' +
    'else if(ext==="fbx"){const{FBXLoader}=await importShim("three/addons/loaders/FBXLoader.js");o=await new FBXLoader().loadAsync(url);if(o.animations&&o.animations.length){const mx=new THREE.AnimationMixer(o);o.animations.forEach(a=>mx.clipAction(a).play());animate((t,dt)=>mx.update(dt))}}' +
    'else if(ext==="stl"||ext==="ply"){const L=ext==="stl"?(await importShim("three/addons/loaders/STLLoader.js")).STLLoader:(await importShim("three/addons/loaders/PLYLoader.js")).PLYLoader;const geo=await new L().loadAsync(url);geo.computeVertexNormals();' +
    'o=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0xb8c0d8,roughness:.45,metalness:.1,vertexColors:!!geo.attributes.color}))}else throw new Error("Format 3D tidak didukung: "+ext);' +
    'o.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true}});scene.add(o);if(opts.fit!==false)fit(o);return o}' +
    'function light(p){if(p==="studio"){scene.background=new THREE.Color(0xeeeef2);hemi.intensity=.9}else if(p==="night"){scene.background=new THREE.Color(0x05060a);hemi.intensity=.15;sun.intensity=.6}}' +
    'addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});' +
    'let paused=false;document.addEventListener("visibilitychange",()=>{paused=document.hidden});' +
    'renderer.setAnimationLoop(()=>{if(paused)return;const dt=Math.min(clock.getDelta(),.1),t=clock.elapsedTime;for(const f of loops){try{f(t,dt)}catch(e){console.error(e)}}controls.update();renderer.render(scene,camera)});' +
    'window.__gx3d={THREE,scene,camera,renderer,controls};';
  function errCatch() {
    return '.catch(function(e){var d=document.createElement("div");d.id="gx-err";d.textContent=(e&&e.message)||String(e);document.body.appendChild(d);if(window.__gxReport)window.__gxReport((e&&e.message)||e)})';
  }

  function threeDoc(src, opts, title) {
    var code = String(src || '');
    if (/<html[\s>]|<!doctype/i.test(code)) { // a full HTML page: just provide the offline import map
      var head = '<script type="importmap-shim">' + JSON.stringify(threeMap(!!opts.export)) + '<\/script><script>window.esmsInitOptions={shimMode:true};<\/script><script src="' + (opts.export ? CDN.shims : LIB + 'es-module-shims.js') + '"><\/script>';
      code = code.replace(/<script\s+type=["']importmap["'][\s\S]*?<\/script>/i, '').replace(/<script\s+type=["']module["']/gi, '<script type="module-shim"');
      return wrapHtml(/<head[^>]*>/i.test(code) ? code.replace(/<head[^>]*>/i, function (m) { return m + head; }) : head + code, opts);
    }
    var own = /new\s+(THREE\.)?WebGLRenderer\s*\(/.test(code);
    // user code imports are hoisted; strip duplicate `import * as THREE` when we provide it
    var imports = [], body = code.replace(/^\s*import\s[^;]*?from\s*['"][^'"]+['"]\s*;?|^\s*import\s*['"][^'"]+['"]\s*;?/gm, function (m) { imports.push(m.trim()); return ''; });
    if (!own) imports = imports.filter(function (l) { return !(/^import\s+\*\s+as\s+THREE\s+from\s*['"]three['"]/.test(l) || /\b(OrbitControls|RoomEnvironment)\b/.test(l)); });
    var mod = own ? code : imports.join('\n') + '\n' + THREE_RUNTIME + '\n' + '{\n' + body + '\n}\nexport{};';
    return threeHead(opts, title) + '<body><div id="gx-hud">' + (own ? '' : 'Seret: putar · Scroll: zoom · Klik kanan: geser') + '</div><script>(function(){var src=' + jsString(mod) + ';' +
      'var url=URL.createObjectURL(new Blob([src],{type:"text/javascript"}));importShim(url)' + errCatch() + '})();<\/script></body></html>';
  }

  /* Viewer for a 3D model file (glb/gltf/obj/stl/ply/fbx) served at `url`. */
  function modelViewer(url, ext, name) {
    var code = 'const o=await load(' + JSON.stringify(url) + ',{ext:' + JSON.stringify(ext) + '});ground(Math.max(10,new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).length()*2)).position.y=new THREE.Box3().setFromObject(o).min.y;' +
      'const info=document.getElementById("gx-hud");let v=0,t=0;o.traverse(m=>{if(m.isMesh){t++;v+=m.geometry.attributes.position.count}});info.textContent=' + JSON.stringify(name || 'Model') + '+" · "+t+" mesh · "+v.toLocaleString()+" titik · seret untuk memutar";';
    return threeDoc(code, {}, name);
  }

  function slideCount(src) { return String(src || '').split(/\n-{3,}\s*\n/).length; }

  /* Full HTML document for a version. opts: {export, print} */
  function document_(art, content, opts) {
    opts = opts || {};
    switch (art.type) {
      case 'react': return reactDoc(content, opts);
      case 'svg': return svgDoc(content, opts);
      case 'mermaid': return mermaidDoc(content, opts);
      case 'markdown': return markdownDoc(content, opts);
      case 'slides': return slidesDoc(content, opts);
      case 'board': return Board.html(content, { boot: opts.export ? '' : bootScript(), export: !!opts.export });
      case '3d': return threeDoc(content, opts, art.title);
      case 'code': return codeDoc(content, art.language);
      default: return wrapHtml(content, opts);
    }
  }

  function extFor(art) {
    if (art.type === 'file') return art.format || '';
    if (art.type === 'code') {
      var l = (art.language || '').toLowerCase();
      var map = { python: 'py', javascript: 'js', typescript: 'ts', ruby: 'rb', rust: 'rs', kotlin: 'kt', csharp: 'cs', 'c++': 'cpp', cpp: 'cpp', shell: 'sh', bash: 'sh', yaml: 'yml', markdown: 'md' };
      return map[l] || l || 'txt';
    }
    return TYPES[art.type] ? TYPES[art.type].ext : 'txt';
  }

  window.Artifacts = {
    TYPES: TYPES, parse: parse, collect: collect, hasArtifacts: hasArtifacts, document: document_, extFor: extFor,
    slideCount: slideCount, applyEdit: applyEdit, normalizeType: normalizeType, modelViewer: modelViewer, MODEL_EXT: /\.(glb|gltf|obj|stl|ply|fbx)$/i,
  };
})();
