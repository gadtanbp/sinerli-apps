/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Markdown rendering: marked + highlight.js, sanitised by DOMPurify.
   Raw HTML from the model is always shown as text, and remote images are
   never loaded (they become links), so model output cannot run code or leak data. */
(function () {
  'use strict';
  var esc = U.esc;
  var hlCache = new Map();
  var PREVIEWABLE = { html: 1, svg: 1, xml: 0 };

  function highlight(code, lang) {
    var key = lang + '\u0000' + code;
    var hit = hlCache.get(key);
    if (hit) return hit;
    var out;
    try {
      if (lang && window.hljs && hljs.getLanguage(lang)) out = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
      else out = esc(code);
    } catch (e) { out = esc(code); }
    if (hlCache.size > 300) hlCache.delete(hlCache.keys().next().value);
    hlCache.set(key, out);
    return out;
  }

  var ALIASES = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', zsh: 'bash', shell: 'bash', console: 'bash', yml: 'yaml', md: 'markdown', 'objective-c': 'objectivec', objc: 'objectivec', rb: 'ruby', rs: 'rust', kt: 'kotlin', cs: 'csharp', 'c++': 'cpp', htm: 'html', jsx: 'javascript', tsx: 'typescript', vue: 'xml', svelte: 'xml', golang: 'go', ps1: 'powershell', dockerfile: 'bash', toml: 'ini', env: 'ini' };

  var renderer = {
    code: function (token) {
      var raw = (token.lang || '').trim().split(/\s+/)[0].toLowerCase();
      var lang = ALIASES[raw] || raw;
      var text = token.text || '';
      var body = highlight(text, lang === 'html' || lang === 'svg' ? 'xml' : lang);
      var actions = '<button data-act="copy-code">' + U.icon('copy') + '<span>Salin</span></button>';
      if (PREVIEWABLE[raw]) actions = '<button data-act="preview-code">' + U.icon('play') + '<span>Pratinjau</span></button>' + actions;
      return '<div class="codeblock" data-lang="' + esc(raw) + '"><div class="cb-head"><span>' + esc(raw || 'teks') +
        '</span><div class="cb-actions">' + actions + '</div></div><pre><code>' + body + '</code></pre></div>';
    },
    html: function (token) {
      return esc(typeof token === 'string' ? token : (token.text || token.raw || ''));
    },
    image: function (token) {
      var href = token.href || '';
      if (/^data:image\//i.test(href)) return '<img src="' + esc(href) + '" alt="' + esc(token.text || '') + '">';
      return '<a class="ext-img" href="' + esc(href) + '" data-ext="1">' + U.icon('image') + esc(token.text || 'gambar') + '</a>';
    },
    link: function (token) {
      var inner = this.parser.parseInline(token.tokens || []);
      var href = token.href || '';
      if (!/^(https?:|mailto:)/i.test(href)) return inner;
      return '<a href="' + esc(href) + '" data-ext="1" title="' + esc(href) + '">' + inner + '</a>';
    },
  };

  marked.use({ gfm: true, breaks: false, renderer: renderer });

  var PURIFY = {
    ADD_ATTR: ['data-act', 'data-lang', 'data-ext', 'target'],
    FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed', 'audio', 'video', 'source', 'link', 'meta', 'base'],
    FORBID_ATTR: ['style', 'srcset'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|data:image\/(?:png|jpe?g|gif|webp);|#)/i,
  };

  /* Close a dangling code fence so half-streamed code renders as code. */
  function closeOpenFence(md) {
    var count = 0, re = /^ {0,3}(```|~~~)/gm;
    while (re.exec(md)) count++;
    return count % 2 === 1 ? md + '\n```' : md;
  }

  function render(md, opts) {
    md = String(md || '');
    if (opts && opts.streaming) md = closeOpenFence(md);
    var html;
    try { html = marked.parse(md); } catch (e) { html = '<p>' + esc(md) + '</p>'; }
    return DOMPurify.sanitize(html, PURIFY);
  }

  window.MD = { render: render, highlight: highlight };
})();
