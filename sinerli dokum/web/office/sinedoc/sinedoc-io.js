/**
 * Sinerli Dokum — sanitasi, impor berkas, templat, dan ekspor teks (HTML/TXT/MD).
 * Ekspor DOCX & PDF ada di sinedoc-export.js.
 */
(function (global) {
    'use strict';

    var ALLOWED_TAGS = {
        P: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, BLOCKQUOTE: 1, PRE: 1, CODE: 1, DIV: 1, SPAN: 1, BR: 1, HR: 1,
        B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, DEL: 1, INS: 1, SUB: 1, SUP: 1, MARK: 1, SMALL: 1, FONT: 1,
        A: 1, IMG: 1, UL: 1, OL: 1, LI: 1, TABLE: 1, THEAD: 1, TBODY: 1, TFOOT: 1, TR: 1, TD: 1, TH: 1, COLGROUP: 1, COL: 1,
        CAPTION: 1, FIGURE: 1, FIGCAPTION: 1
    };
    var DROP_WITH_CONTENT = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, NOSCRIPT: 1, TEMPLATE: 1, META: 1, LINK: 1, TITLE: 1, HEAD: 1, SVG: 1, CANVAS: 1, VIDEO: 1, AUDIO: 1, INPUT: 1, BUTTON: 1, SELECT: 1, TEXTAREA: 1, FORM: 1 };
    var ALLOWED_STYLES = ['font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'color', 'background-color', 'font-size', 'font-family', 'text-align', 'margin-left', 'text-indent', 'line-height', 'vertical-align', 'width', 'list-style-type', 'margin-top', 'margin-bottom'];
    var SD_CLASSES = /^(sd-[a-z0-9-]+|is-resolved|has-rule|lvl-\d)$/;

    function sanitizeStyle(el, keepMargins) {
        var st = el.style;
        var out = [];
        ALLOWED_STYLES.forEach(function (p) {
            if ((p === 'margin-top' || p === 'margin-bottom') && !keepMargins) return;
            var v = st.getPropertyValue(p);
            if (!v || /expression|url\(|javascript/i.test(v)) return;
            if (p === 'color' && /^(windowtext|black|rgb\(0, 0, 0\))$/i.test(v)) return;
            if (p === 'background-color' && /^(transparent|rgba\(0, 0, 0, 0\)|white|rgb\(255, 255, 255\))$/i.test(v)) return;
            if (p === 'width' && !/^(IMG|TD|TH|COL|TABLE)$/.test(el.tagName)) return;
            if (p === 'font-family') v = v.replace(/mso-[^;]+/g, '');
            out.push(p + ':' + v);
        });
        if (out.length) el.setAttribute('style', out.join(';')); else el.removeAttribute('style');
    }

    /**
     * Membersihkan HTML dari luar (tempel, impor): buang skrip, atribut event,
     * kelas Word/Google, dan gaya yang merusak tata letak halaman.
     * opts.trusted = HTML milik Sinerli Dokum sendiri (kelas sd-* dan data-* dipertahankan).
     */
    function sanitize(html, opts) {
        opts = opts || {};
        var docu = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
        var body = docu.body;
        (function clean(node) {
            var kids = Array.prototype.slice.call(node.childNodes);
            kids.forEach(function (n) {
                if (n.nodeType === 8) { n.remove(); return; }
                if (n.nodeType !== 1) return;
                var tag = n.tagName;
                if (DROP_WITH_CONTENT[tag] || /^(O|W|V|M):/i.test(n.nodeName)) { n.remove(); return; }
                if (!ALLOWED_TAGS[tag]) {
                    clean(n);
                    var frag = docu.createDocumentFragment();
                    while (n.firstChild) frag.appendChild(n.firstChild);
                    n.replaceWith(frag);
                    return;
                }
                Array.prototype.slice.call(n.attributes).forEach(function (a) {
                    var name = a.name.toLowerCase();
                    if (name === 'style') return;
                    if (name === 'class') {
                        var keep = (a.value || '').split(/\s+/).filter(function (c) { return opts.trusted ? SD_CLASSES.test(c) : /^sd-(title|subtitle|nospace|checklist|img-[a-z]+|noborder|box|cols)$/.test(c); });
                        if (keep.length) n.setAttribute('class', keep.join(' ')); else n.removeAttribute('class');
                        return;
                    }
                    if (name === 'href' && tag === 'A') {
                        if (/^\s*(javascript|data|vbscript):/i.test(a.value)) n.removeAttribute('href');
                        return;
                    }
                    if (name === 'src' && tag === 'IMG') {
                        if (!/^(data:image\/|blob:|https?:)/i.test(a.value)) n.removeAttribute('src');
                        return;
                    }
                    if ((name === 'colspan' || name === 'rowspan') && /^(TD|TH)$/.test(tag)) return;
                    if (name === 'alt' || name === 'title' || (name === 'target' && tag === 'A')) return;
                    if (tag === 'FONT' && (name === 'color' || name === 'face')) return;
                    if (opts.trusted && (/^data-/.test(name) || name === 'contenteditable')) return;
                    if (name === 'start' && tag === 'OL') return;
                    n.removeAttribute(a.name);
                });
                if (tag === 'A' && n.getAttribute('href')) { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); }
                sanitizeStyle(n, opts.trusted);
                if (tag === 'FONT') {
                    var span = docu.createElement('span');
                    if (n.getAttribute('color')) span.style.color = n.getAttribute('color');
                    if (n.getAttribute('face')) span.style.fontFamily = n.getAttribute('face');
                    if (n.getAttribute('style')) span.setAttribute('style', (span.getAttribute('style') || '') + ';' + n.getAttribute('style'));
                    while (n.firstChild) span.appendChild(n.firstChild);
                    n.replaceWith(span);
                    clean(span);
                    return;
                }
                clean(n);
                if (tag === 'SPAN' && !n.attributes.length) {
                    var f2 = docu.createDocumentFragment();
                    while (n.firstChild) f2.appendChild(n.firstChild);
                    n.replaceWith(f2);
                }
            });
        })(body);
        wrapLooseInline(body, docu);
        return body.innerHTML;
    }

    var BLOCK_TAGS = /^(P|H[1-6]|BLOCKQUOTE|PRE|DIV|UL|OL|TABLE|HR|FIGURE)$/;
    /** Teks/inline langsung di akar editor dibungkus <p> supaya pagination bekerja per blok. */
    function wrapLooseInline(root, docu) {
        docu = docu || document;
        var buf = [];
        function flush(before) {
            if (!buf.length) return;
            var onlyWhitespace = buf.every(function (n) { return n.nodeType === 3 && !n.textContent.trim(); });
            if (onlyWhitespace) { buf.forEach(function (n) { n.remove(); }); buf = []; return; }
            var p = docu.createElement('p');
            root.insertBefore(p, before || null);
            buf.forEach(function (n) { p.appendChild(n); });
            if (p.lastChild && p.lastChild.nodeName === 'BR' && p.childNodes.length > 1) p.lastChild.remove();
            buf = [];
        }
        Array.prototype.slice.call(root.childNodes).forEach(function (n) {
            if (n.nodeType === 1 && (BLOCK_TAGS.test(n.tagName) || n.classList.contains('sd-page-break'))) flush(n);
            else if (n.nodeType === 1 || n.nodeType === 3) buf.push(n);
        });
        flush(null);
    }

    function escHtml(s) { return SO.esc(s); }

    function textToHtml(text) {
        return text.replace(/\r\n?/g, '\n').split('\n').map(function (line) {
            return '<p>' + (line ? escHtml(line).replace(/\t/g, '&emsp;') : '<br>') + '</p>';
        }).join('');
    }

    // --------------------------------------------------------------- Markdown
    function mdInline(s) {
        s = escHtml(s);
        s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
        s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, src) { return /^(https?:|data:image\/)/.test(src) ? '<img alt="' + alt + '" src="' + src + '">' : m; });
        s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, txt, href) { return /^(https?:|mailto:|#)/.test(href) ? '<a href="' + href + '">' + txt + '</a>' : m; });
        s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/__([^_]+)__/g, '<b>$1</b>');
        s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, '$1<i>$2</i>');
        s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
        return s;
    }

    function markdownToHtml(md) {
        var lines = md.replace(/\r\n?/g, '\n').split('\n');
        var out = [];
        var i = 0;
        while (i < lines.length) {
            var line = lines[i];
            if (/^```/.test(line)) {
                var code = [];
                i++;
                while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
                i++;
                out.push('<pre>' + escHtml(code.join('\n')) + '</pre>');
                continue;
            }
            var h = /^(#{1,6})\s+(.*)$/.exec(line);
            if (h) { var lv = Math.min(4, h[1].length); out.push('<h' + lv + '>' + mdInline(h[2]) + '</h' + lv + '>'); i++; continue; }
            if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
            if (/^>\s?/.test(line)) {
                var q = [];
                while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
                out.push('<blockquote><p>' + q.map(mdInline).join('<br>') + '</p></blockquote>');
                continue;
            }
            if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-+/.test(lines[i + 1])) {
                var rows = [];
                while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
                var cells = function (r) { return r.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return mdInline(c.trim()); }); };
                var tbl = '<table><tbody><tr>' + cells(rows[0]).map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr>';
                rows.slice(2).forEach(function (r) { tbl += '<tr>' + cells(r).map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; });
                out.push(tbl + '</tbody></table>');
                continue;
            }
            var li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
            if (li) {
                var ordered = /\d/.test(li[2]);
                var items = [];
                while (i < lines.length) {
                    var m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
                    if (!m || /\d/.test(m[2]) !== ordered) break;
                    var task = /^\[( |x|X)\]\s+(.*)$/.exec(m[3]);
                    items.push(task ? { html: mdInline(task[2]), checked: task[1] !== ' ' } : { html: mdInline(m[3]) });
                    i++;
                }
                var isTask = items.some(function (x) { return x.checked !== undefined; });
                out.push((ordered ? '<ol>' : '<ul' + (isTask ? ' class="sd-checklist"' : '') + '>') +
                    items.map(function (x) { return '<li' + (x.checked !== undefined ? ' data-checked="' + x.checked + '"' : '') + '>' + x.html + '</li>'; }).join('') +
                    (ordered ? '</ol>' : '</ul>'));
                continue;
            }
            if (!line.trim()) { i++; continue; }
            var para = [];
            while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s)/.test(lines[i])) { para.push(lines[i]); i++; }
            out.push('<p>' + para.map(mdInline).join('<br>') + '</p>');
        }
        return out.join('');
    }

    function htmlToMarkdown(root) {
        function inline(node) {
            var s = '';
            node.childNodes.forEach(function (n) {
                if (n.nodeType === 3) { s += n.textContent.replace(/([*_`\[\]])/g, '\\$1'); return; }
                if (n.nodeType !== 1 || n.classList.contains('sd-gap')) return;
                var t = n.tagName, inner = inline(n);
                var cs = n.style;
                if (t === 'BR') s += '  \n';
                else if (t === 'B' || t === 'STRONG' || parseInt(cs.fontWeight, 10) >= 600) s += inner.trim() ? '**' + inner + '**' : inner;
                else if (t === 'I' || t === 'EM' || cs.fontStyle === 'italic') s += inner.trim() ? '*' + inner + '*' : inner;
                else if (t === 'S' || t === 'STRIKE' || t === 'DEL') s += '~~' + inner + '~~';
                else if (t === 'CODE') s += '`' + n.textContent + '`';
                else if (t === 'A') s += '[' + inner + '](' + (n.getAttribute('href') || '') + ')';
                else if (t === 'IMG') s += '![' + (n.getAttribute('alt') || '') + '](' + (/^https?:/.test(n.src) ? n.src : 'image') + ')';
                else s += inner;
            });
            return s;
        }
        function block(node, depth) {
            var out = [];
            node.childNodes.forEach(function (n) {
                if (n.nodeType === 3) { if (n.textContent.trim()) out.push(n.textContent.trim()); return; }
                if (n.nodeType !== 1) return;
                var t = n.tagName;
                if (/^H[1-6]$/.test(t)) out.push(new Array(+t[1] + 1).join('#') + ' ' + inline(n).trim());
                else if (t === 'P' && n.classList.contains('sd-title')) out.push('# ' + inline(n).trim());
                else if (t === 'P' || (t === 'DIV' && !n.classList.contains('sd-toc') && !n.classList.contains('sd-notes'))) {
                    if (n.classList.contains('sd-page-break')) out.push('---');
                    else if (n.querySelector('p, h1, h2, h3, ul, ol, table')) out.push(block(n, depth));
                    else out.push(inline(n).trim());
                }
                else if (t === 'BLOCKQUOTE') out.push(block(n, depth).split('\n').map(function (l) { return '> ' + l; }).join('\n'));
                else if (t === 'PRE') out.push('```\n' + n.textContent + '\n```');
                else if (t === 'HR') out.push('---');
                else if (t === 'UL' || t === 'OL') {
                    var idx = 1;
                    var task = n.classList.contains('sd-checklist');
                    out.push(Array.prototype.filter.call(n.children, function (c) { return c.tagName === 'LI'; }).map(function (li) {
                        var nested = Array.prototype.filter.call(li.children, function (c) { return c.tagName === 'UL' || c.tagName === 'OL'; });
                        var clone = li.cloneNode(true);
                        SO.$$('ul, ol', clone).forEach(function (x) { x.remove(); });
                        var prefix = new Array(depth + 1).join('   ') + (t === 'OL' ? (idx++) + '. ' : '- ') + (task ? '[' + (li.getAttribute('data-checked') === 'true' ? 'x' : ' ') + '] ' : '');
                        var s = prefix + inline(clone).trim();
                        nested.forEach(function (nl) { var wrap = document.createElement('div'); wrap.appendChild(nl.cloneNode(true)); s += '\n' + block(wrap, depth + 1); });
                        return s;
                    }).join('\n'));
                }
                else if (t === 'TABLE') {
                    var rows = Array.prototype.filter.call(n.rows, function (r) { return !r.classList.contains('sd-row-gap'); });
                    if (!rows.length) return;
                    var md = rows.map(function (r) { return '| ' + Array.prototype.map.call(r.cells, function (c) { return inline(c).replace(/\n/g, ' ').replace(/\|/g, '\\|').trim(); }).join(' | ') + ' |'; });
                    var cols = rows[0].cells.length;
                    md.splice(1, 0, '|' + new Array(cols + 1).join(' --- |'));
                    out.push(md.join('\n'));
                }
            });
            return out.filter(Boolean).join(depth ? '\n' : '\n\n');
        }
        return block(root, 0) + '\n';
    }

    // ---------------------------------------------------------------- import
    function importFile(file) {
        var name = file.name.replace(/\.[^.]+$/, '');
        var ext = (file.name.split('.').pop() || '').toLowerCase();
        if (ext === 'docx') {
            return SO.load('mammoth').then(function (mammoth) {
                return SO.readFile(file, 'arraybuffer').then(function (buf) {
                    return mammoth.convertToHtml({ arrayBuffer: buf }, {
                        styleMap: [
                            "p[style-name='Title'] => p.sd-title:fresh",
                            "p[style-name='Subtitle'] => p.sd-subtitle:fresh",
                            "p[style-name='Quote'] => blockquote:fresh",
                            "p[style-name='Intense Quote'] => blockquote:fresh",
                            "p[style-name='No Spacing'] => p.sd-nospace:fresh",
                            "u => u", "strike => s"
                        ],
                        convertImage: mammoth.images.imgElement(function (image) {
                            return image.read('base64').then(function (b64) { return { src: 'data:' + image.contentType + ';base64,' + b64 }; });
                        })
                    });
                }).then(function (res) {
                    var warnings = (res.messages || []).filter(function (m) { return m.type === 'warning'; }).length;
                    return { html: sanitize(res.value), name: name, warnings: warnings };
                });
            });
        }
        if (ext === 'sinedoc' || ext === 'json') {
            return SO.readFile(file, 'text').then(function (txt) {
                var data = JSON.parse(txt);
                if (!data || data.app !== 'sinedoc') throw new Error(SO.t('c_err_wrong_type'));
                return { content: data, name: data.name || name };
            });
        }
        if (ext === 'doc' || ext === 'rtf' || ext === 'odt' || ext === 'pdf') {
            return Promise.reject(new Error(SO.t('d_err_format', { ext: '.' + ext })));
        }
        return SO.readFile(file, 'text').then(function (txt) {
            if (ext === 'html' || ext === 'htm') {
                var d = new DOMParser().parseFromString(txt, 'text/html');
                var title = d.querySelector('title');
                return { html: sanitize(d.body ? d.body.innerHTML : txt), name: (title && title.textContent.trim()) || name };
            }
            if (ext === 'md' || ext === 'markdown') return { html: sanitize(markdownToHtml(txt)), name: name };
            return { html: textToHtml(txt), name: name };
        });
    }

    // ------------------------------------------------------------- templates
    function T(k) { return SO.esc(SO.t(k)); }

    function thumbLines(title, color, extra) {
        return '<div class="sd-tpl-thumb"' + (extra || '') + '><b' + (color ? ' style="color:' + color + '"' : '') + '>' + T(title) + '</b>';
    }
    var TEMPLATES = [
        { id: 'blank', label: 'd_tpl_blank', desc: 'd_tpl_blank_desc', get thumb() { return '<div class="sd-tpl-thumb"></div>'; } },
        { id: 'letter', label: 'd_tpl_letter', desc: 'd_tpl_letter_desc', get thumb() { return thumbLines('d_tpl_letter') + '<i style="width:40%"></i><i style="width:60%;margin-top:10px"></i><i></i><i></i><i style="width:70%"></i><i style="width:30%;margin-top:10px"></i></div>'; } },
        { id: 'resume', label: 'd_tpl_resume', desc: 'd_tpl_resume_desc', get thumb() { return thumbLines('d_tpl_resume', '', ' style="border-top:6px solid #2b579a"') + '<i style="width:50%"></i><i style="margin-top:8px"></i><i style="width:80%"></i><i style="margin-top:8px"></i><i style="width:60%"></i></div>'; } },
        { id: 'report', label: 'd_tpl_report', desc: 'd_tpl_report_desc', get thumb() { return '<div class="sd-tpl-thumb" style="display:flex;flex-direction:column;justify-content:center;background:linear-gradient(#fff 60%,#eef3fb)"><b style="font-size:10px">' + T('d_tpl_report') + '</b><i style="width:60%"></i><i style="width:40%"></i></div>'; } },
        { id: 'notes', label: 'd_tpl_notes', desc: 'd_tpl_notes_desc', get thumb() { return thumbLines('d_tpl_notes') + '<i style="width:50%"></i><i style="width:90%;height:14px;margin:6px 0"></i><i></i><i style="width:80%"></i></div>'; } },
        { id: 'proposal', label: 'd_tpl_proposal', desc: 'd_tpl_proposal_desc', get thumb() { return thumbLines('d_tpl_proposal', '#c4462a') + '<i></i><i style="width:75%"></i><i style="width:30%;margin-top:6px;background:#1f3864"></i><i></i><i style="width:70%"></i></div>'; } }
    ];

    function templateContent(id) {
        var today = new Intl.DateTimeFormat(SO.locale(), { dateStyle: 'long' }).format(new Date());
        var user = SO.ctx.name || SO.t('d_tpl_your_name');
        switch (id) {
            case 'letter':
                return {
                    name: SO.t('d_tpl_letter'),
                    html: '<p style="text-align:right">' + SO.esc(today) + '</p>' +
                        '<p class="sd-nospace"><b>' + T('d_tpl_to') + '</b></p><p class="sd-nospace">' + T('d_tpl_recipient') + '</p><p>' + T('d_tpl_address') + '</p>' +
                        '<p><b>' + T('d_tpl_subject') + '</b></p>' +
                        '<p>' + T('d_tpl_greeting') + '</p>' +
                        '<p style="text-align:justify">' + T('d_tpl_letter_p1') + '</p>' +
                        '<p style="text-align:justify">' + T('d_tpl_letter_p2') + '</p>' +
                        '<p>' + T('d_tpl_closing') + '</p><p><br></p><p><br></p>' +
                        '<p class="sd-nospace"><b>' + SO.esc(user) + '</b></p><p>' + T('d_tpl_position') + '</p>',
                    settings: { hf: { header: '<p style="text-align:center"><b>' + T('d_tpl_company') + '</b></p><p style="text-align:center;font-size:9pt">' + T('d_tpl_company_addr') + '</p>' } }
                };
            case 'resume':
                return {
                    name: SO.t('d_tpl_resume'),
                    html: '<p class="sd-title" style="color:#2b579a">' + SO.esc(user) + '</p>' +
                        '<p class="sd-subtitle">' + T('d_tpl_role') + ' · email@contoh.com · +62 812 0000 0000</p>' +
                        '<h2>' + T('d_tpl_profile') + '</h2><p style="text-align:justify">' + T('d_tpl_profile_body') + '</p>' +
                        '<h2>' + T('d_tpl_experience') + '</h2>' +
                        '<h3>' + T('d_tpl_job1') + '</h3><p class="sd-nospace" style="color:#595959"><i>2023 – ' + T('d_tpl_present') + '</i></p>' +
                        '<ul><li>' + T('d_tpl_bullet1') + '</li><li>' + T('d_tpl_bullet2') + '</li></ul>' +
                        '<h3>' + T('d_tpl_job2') + '</h3><p class="sd-nospace" style="color:#595959"><i>2020 – 2023</i></p>' +
                        '<ul><li>' + T('d_tpl_bullet3') + '</li></ul>' +
                        '<h2>' + T('d_tpl_education') + '</h2><p><b>' + T('d_tpl_school') + '</b><br>2016 – 2020</p>' +
                        '<h2>' + T('d_tpl_skills') + '</h2>' +
                        '<table class="sd-noborder"><tbody><tr><td><ul><li>Microsoft Office / Sinerli Dokum</li><li>' + T('d_tpl_skill1') + '</li></ul></td><td><ul><li>' + T('d_tpl_skill2') + '</li><li>' + T('d_tpl_skill3') + '</li></ul></td></tr></tbody></table>',
                    settings: { margins: { top: 18, bottom: 18, left: 20, right: 20 } }
                };
            case 'report':
                return {
                    name: SO.t('d_tpl_report'),
                    html: '<p><br></p><p><br></p><p><br></p><p class="sd-title" style="text-align:center;font-size:32pt;color:#1f3864">' + T('d_tpl_report_title') + '</p>' +
                        '<p class="sd-subtitle" style="text-align:center">' + T('d_tpl_report_sub') + '</p><p><br></p>' +
                        '<p style="text-align:center">' + SO.esc(user) + '<br>' + SO.esc(today) + '</p>' +
                        '<div class="sd-page-break" contenteditable="false"></div>' +
                        '<div class="sd-toc" contenteditable="false" data-toc="1"></div>' +
                        '<div class="sd-page-break" contenteditable="false"></div>' +
                        '<h1>1. ' + T('d_tpl_intro') + '</h1><p style="text-align:justify">' + T('d_tpl_lorem') + '</p>' +
                        '<h2>1.1 ' + T('d_tpl_background') + '</h2><p style="text-align:justify">' + T('d_tpl_lorem') + '</p>' +
                        '<h2>1.2 ' + T('d_tpl_goals') + '</h2><ol><li>' + T('d_tpl_goal1') + '</li><li>' + T('d_tpl_goal2') + '</li></ol>' +
                        '<h1>2. ' + T('d_tpl_results') + '</h1><p>' + T('d_tpl_lorem') + '</p>' +
                        '<table><tbody><tr><th>' + T('d_tpl_col_item') + '</th><th>' + T('d_tpl_col_target') + '</th><th>' + T('d_tpl_col_actual') + '</th></tr>' +
                        '<tr><td>A</td><td>100</td><td>96</td></tr><tr><td>B</td><td>80</td><td>88</td></tr></tbody></table>' +
                        '<h1>3. ' + T('d_tpl_conclusion') + '</h1><p style="text-align:justify">' + T('d_tpl_lorem') + '</p>',
                    settings: { hf: { differentFirst: true, footer: '<p style="text-align:center"><span class="sd-field" data-field="page">1</span></p>', header: '<p style="text-align:right;color:#7f7f7f">' + T('d_tpl_report_title') + '</p>' } }
                };
            case 'notes':
                return {
                    name: SO.t('d_tpl_notes'),
                    html: '<h1>' + T('d_tpl_notes_title') + '</h1>' +
                        '<table class="sd-noborder"><tbody><tr><td style="width:30%"><b>' + T('d_tpl_date') + '</b></td><td>' + SO.esc(today) + '</td></tr>' +
                        '<tr><td><b>' + T('d_tpl_attendees') + '</b></td><td>' + SO.esc(user) + ', …</td></tr>' +
                        '<tr><td><b>' + T('d_tpl_location') + '</b></td><td>Online</td></tr></tbody></table>' +
                        '<h2>' + T('d_tpl_agenda') + '</h2><ol><li>' + T('d_tpl_agenda1') + '</li><li>' + T('d_tpl_agenda2') + '</li></ol>' +
                        '<h2>' + T('d_tpl_discussion') + '</h2><p>…</p>' +
                        '<h2>' + T('d_tpl_actions') + '</h2><ul class="sd-checklist"><li data-checked="false">' + T('d_tpl_action1') + '</li><li data-checked="false">' + T('d_tpl_action2') + '</li></ul>'
                };
            case 'proposal':
                return {
                    name: SO.t('d_tpl_proposal'),
                    html: '<p class="sd-title" style="color:#c4462a">' + T('d_tpl_proposal_title') + '</p><p class="sd-subtitle">' + SO.esc(user) + ' · ' + SO.esc(today) + '</p>' +
                        '<div class="sd-box"><p class="sd-nospace"><b>' + T('d_tpl_summary') + '</b></p><p class="sd-nospace">' + T('d_tpl_summary_body') + '</p></div>' +
                        '<h1>1. ' + T('d_tpl_background') + '</h1><p style="text-align:justify">' + T('d_tpl_lorem') + '</p>' +
                        '<h1>2. ' + T('d_tpl_scope') + '</h1><ul><li>' + T('d_tpl_goal1') + '</li><li>' + T('d_tpl_goal2') + '</li></ul>' +
                        '<h1>3. ' + T('d_tpl_budget') + '</h1>' +
                        '<table><tbody><tr><th>' + T('d_tpl_col_item') + '</th><th style="width:30%">' + T('d_tpl_cost') + '</th></tr><tr><td>' + T('d_tpl_phase1') + '</td><td>Rp 5.000.000</td></tr><tr><td>' + T('d_tpl_phase2') + '</td><td>Rp 7.500.000</td></tr><tr><td><b>Total</b></td><td><b>Rp 12.500.000</b></td></tr></tbody></table>' +
                        '<h1>4. ' + T('d_tpl_timeline') + '</h1><p>' + T('d_tpl_lorem') + '</p>'
                };
            default:
                return { name: SO.t('c_untitled'), html: '<p><br></p>' };
        }
    }

    function exportHtml(html, settings, title) {
        var css = '' +
            'body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.15;max-width:' + (settings.contentWmm || 160) + 'mm;margin:24px auto;padding:0 16px;color:#000;background:' + (settings.pageColor || '#fff') + '}' +
            'p{margin:0 0 6pt}h1{font-size:20pt;color:#1f3864}h2{font-size:16pt;color:#2f5496}h3{font-size:13pt;color:#1f3864}h4{font-size:11pt;font-style:italic;color:#2f5496}' +
            '.sd-title{font-size:28pt}.sd-subtitle{font-size:15pt;color:#595959}.sd-nospace{margin:0}' +
            'blockquote{margin:8pt 24pt;padding-left:12pt;border-left:3px solid #bfbfbf;color:#404040;font-style:italic}' +
            'pre{font-family:Consolas,monospace;background:#f4f4f4;padding:6pt 8pt;white-space:pre-wrap}' +
            'table{border-collapse:collapse;width:100%}td,th{border:1px solid #a6a6a6;padding:3pt 5pt;vertical-align:top}th{background:#f2f2f2;text-align:left}' +
            'table.sd-noborder td,table.sd-noborder th{border-color:transparent}img{max-width:100%;height:auto}' +
            '.sd-img-left{float:left;margin:2pt 10pt 6pt 0}.sd-img-right{float:right;margin:2pt 0 6pt 10pt}.sd-img-center{display:block;margin:4pt auto}' +
            '.sd-page-break{page-break-after:always;height:0}.sd-box{border:1px solid #8eaadb;background:#f3f7fd;padding:8pt 10pt;border-radius:4px}' +
            '.sd-cols[data-cols="2"]{column-count:2}.sd-cols[data-cols="3"]{column-count:3}ul.sd-checklist{list-style:none;padding-left:4px}' +
            'ul.sd-checklist li::before{content:"☐ "}ul.sd-checklist li[data-checked="true"]::before{content:"☑ "}' +
            'del.sd-del{color:#c42b1c}ins.sd-ins{color:#1b6ac9}.sd-toc-row{display:flex;gap:4px}.sd-toc-row .t-dots{flex:1;border-bottom:1px dotted #777}';
        return '<!DOCTYPE html>\n<html lang="' + SO.lang() + '">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' + SO.esc(title) + '</title>\n<meta name="generator" content="Sinerli Dokum - Sinerli">\n<style>' + css + '</style>\n</head>\n<body>\n' + html + '\n</body>\n</html>\n';
    }

    function htmlToText(root) {
        var out = [];
        function walk(node, prefix) {
            node.childNodes.forEach(function (n) {
                if (n.nodeType === 3) { out.push(n.textContent); return; }
                if (n.nodeType !== 1 || n.classList.contains('sd-gap') || n.classList.contains('sd-row-gap')) return;
                var t = n.tagName;
                if (t === 'BR') { out.push('\n'); return; }
                if (t === 'LI') {
                    var ol = n.parentNode && n.parentNode.tagName === 'OL';
                    var idx = Array.prototype.indexOf.call(n.parentNode.children, n) + 1;
                    out.push((prefix || '') + (ol ? idx + '. ' : '• '));
                    walk(n, (prefix || '') + '    ');
                    out.push('\n');
                    return;
                }
                if (t === 'TD' || t === 'TH') { walk(n, prefix); out.push('\t'); return; }
                if (t === 'TR') { walk(n, prefix); out.push('\n'); return; }
                if (t === 'IMG') return;
                if (n.classList.contains('sd-page-break')) { out.push('\f\n'); return; }
                walk(n, prefix);
                if (/^(P|H[1-6]|DIV|BLOCKQUOTE|PRE|TABLE|UL|OL)$/.test(t)) out.push('\n');
            });
        }
        walk(root, '');
        return out.join('').replace(/\t\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    }

    global.SDIO = {
        sanitize: sanitize, wrapLooseInline: wrapLooseInline, textToHtml: textToHtml,
        markdownToHtml: markdownToHtml, htmlToMarkdown: htmlToMarkdown, htmlToText: htmlToText,
        importFile: importFile, TEMPLATES: TEMPLATES, templateContent: templateContent, exportHtml: exportHtml
    };
})(window);
