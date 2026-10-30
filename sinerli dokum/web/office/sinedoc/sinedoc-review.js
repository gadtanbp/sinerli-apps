/**
 * Sinerli Dokum — tinjauan & alat: komentar, lacak perubahan, cari/ganti,
 * hitung kata, baca/dikte, simbol, rumus, pewarna format, cetak, ekspor/impor,
 * panel navigasi.
 */
(function (global) {
    'use strict';

    var App = global.SineDoc;
    var C = App.cmd;
    var editor = App.editor;
    var exec = C.exec;

    function authorName() { return SO.ctx.name || SO.ctx.email || SO.t('d_you'); }
    function unwrap(el) {
        var parent = el.parentNode;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        el.remove();
        parent.normalize();
    }
    function initials(name) {
        return String(name || '?').split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(function (s) { return s[0].toUpperCase(); }).join('') || '?';
    }

    // ============================================================ comments
    C.addComment = function () {
        var sel = App.restoreRange();
        if (sel.isCollapsed) {
            try { sel.modify('move', 'backward', 'word'); sel.modify('extend', 'forward', 'word'); } catch (e) {}
        }
        var r = App.range();
        if (!r || r.collapsed || !r.toString().trim()) { SO.toast('d_comment_select', { type: 'warn' }); return; }
        var id = SO.uid('c');
        App.change(function () {
            C.splitSelectionText(r).forEach(function (n) {
                var span = SO.el('span', { class: 'sd-comment', 'data-cid': id });
                n.parentNode.insertBefore(span, n);
                span.appendChild(n);
            });
            App.comments.push({ id: id, author: authorName(), email: SO.ctx.email || '', time: Date.now(), text: '', resolved: false, replies: [] });
        });
        C._editingComment = id;
        C.togglePane('sdCommentPane', true);
        C.focusComment(id, false);
    };

    function commentSpans(id) { return SO.$$('.sd-comment[data-cid="' + id + '"]', editor); }

    function orderedComments() {
        var order = {};
        SO.$$('.sd-comment', editor).forEach(function (s, i) {
            var id = s.getAttribute('data-cid');
            if (order[id] === undefined) order[id] = i;
        });
        return App.comments.slice().sort(function (a, b) {
            var oa = order[a.id] === undefined ? 1e9 : order[a.id];
            var ob = order[b.id] === undefined ? 1e9 : order[b.id];
            return oa - ob || a.time - b.time;
        });
    }

    C.renderComments = function () {
        var body = document.getElementById('sdCommentBody');
        if (!body || document.getElementById('sdCommentPane').hidden) return;
        body.innerHTML = '';
        var tools = SO.el('div', { style: { display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' } });
        var addBtn = SO.el('button', { type: 'button', class: 'so-btn is-sm is-primary', html: '<i class="fas fa-comment-medical"></i>' + SO.esc(SO.t('d_new_comment')) });
        addBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });
        addBtn.addEventListener('click', C.addComment);
        tools.appendChild(addBtn);
        body.appendChild(tools);
        // Komentar yang teksnya sudah terhapus disembunyikan (seperti Word); undo mengembalikannya.
        var list = orderedComments().filter(function (c) { return commentSpans(c.id).length || C._editingComment === c.id; });
        if (!list.length) {
            body.appendChild(SO.el('div', { class: 'so-empty-note', text: SO.t('d_comments_empty') }));
            return;
        }
        list.forEach(function (c) {
            var spans = commentSpans(c.id);
            var quote = spans.map(function (s) { return s.textContent; }).join('').trim();
            var card = SO.el('div', { class: 'sd-cmt' + (c.resolved ? ' is-resolved' : ''), dataset: { cid: c.id } });
            card.innerHTML = '<div class="sd-cmt-head"><div class="sd-cmt-avatar">' + SO.esc(initials(c.author)) + '</div><div class="sd-cmt-author">' + SO.esc(c.author) + '</div><div class="sd-cmt-time">' + SO.esc(SO.fmtDate(c.time, { dateStyle: 'short', timeStyle: 'short' })) + '</div></div>' +
                '<div class="sd-cmt-quote">' + SO.esc(quote || SO.t('d_comment_orphan')) + '</div>';
            var editing = C._editingComment === c.id || !c.text;
            if (editing) {
                var ta = SO.el('textarea', { placeholder: SO.t('d_comment_ph') });
                ta.value = c.text || '';
                card.appendChild(ta);
                var acts = SO.el('div', { class: 'sd-cmt-actions' });
                var save = SO.el('button', { type: 'button', class: 'so-btn is-sm is-primary', text: SO.t('c_save') });
                var cancel = SO.el('button', { type: 'button', class: 'so-btn is-sm', text: SO.t('c_cancel') });
                save.addEventListener('click', function () {
                    var v = ta.value.trim();
                    if (!v) { ta.focus(); return; }
                    C._editingComment = null;
                    App.change(function () { c.text = v; c.time = c.time || Date.now(); });
                    C.renderComments();
                });
                cancel.addEventListener('click', function () {
                    C._editingComment = null;
                    if (!c.text) C.deleteComment(c.id); else C.renderComments();
                });
                ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && SO.mod(e)) save.click(); });
                acts.appendChild(save);
                acts.appendChild(cancel);
                card.appendChild(acts);
                setTimeout(function () { if (C._editingComment === c.id) ta.focus(); }, 30);
            } else {
                card.appendChild(SO.el('div', { class: 'sd-cmt-text', text: c.text }));
                (c.replies || []).forEach(function (rep) {
                    var rp = SO.el('div', { class: 'sd-cmt-reply' });
                    rp.innerHTML = '<div class="sd-cmt-head"><div class="sd-cmt-avatar" style="width:20px;height:20px;flex-basis:20px;font-size:9px">' + SO.esc(initials(rep.author)) + '</div><div class="sd-cmt-author">' + SO.esc(rep.author) + '</div><div class="sd-cmt-time">' + SO.esc(SO.fmtDate(rep.time, { dateStyle: 'short', timeStyle: 'short' })) + '</div></div>';
                    rp.appendChild(SO.el('div', { class: 'sd-cmt-text', text: rep.text }));
                    card.appendChild(rp);
                });
                var a2 = SO.el('div', { class: 'sd-cmt-actions' });
                var mk = function (label, icon, fn) {
                    var b = SO.el('button', { type: 'button', class: 'so-btn is-sm', html: '<i class="fas ' + icon + '"></i>' + SO.esc(SO.t(label)) });
                    b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
                    a2.appendChild(b);
                };
                mk('d_reply', 'fa-reply', function () {
                    SO.prompt('d_reply', '', { title: 'd_reply', type: 'text' }).then(function (v) {
                        if (!v || !v.trim()) return;
                        App.change(function () { c.replies = (c.replies || []).concat([{ author: authorName(), time: Date.now(), text: v.trim() }]); });
                        C.renderComments();
                    });
                });
                mk(c.resolved ? 'd_reopen' : 'd_resolve', c.resolved ? 'fa-rotate-left' : 'fa-check', function () {
                    App.change(function () {
                        c.resolved = !c.resolved;
                        commentSpans(c.id).forEach(function (s) { s.classList.toggle('is-resolved', c.resolved); });
                    });
                    C.renderComments();
                });
                mk('d_edit', 'fa-pen', function () { C._editingComment = c.id; C.renderComments(); });
                mk('c_delete', 'fa-trash', function () { C.deleteComment(c.id); });
                card.appendChild(a2);
            }
            card.addEventListener('click', function (e) {
                if (e.target.closest('button,textarea')) return;
                C.focusComment(c.id, true);
            });
            body.appendChild(card);
        });
        if (C._activeComment) C.focusComment(C._activeComment, false);
    };
    C.commentsRefreshSoon = SO.debounce(function () { if (!C._editingComment) C.renderComments(); }, 600);

    C.deleteComment = function (id) {
        App.change(function () {
            commentSpans(id).forEach(unwrap);
            App.comments = App.comments.filter(function (c) { return c.id !== id; });
        });
        C.renderComments();
    };

    C.deleteAllComments = function () {
        if (!App.comments.length) return;
        SO.confirm('d_delete_all_comments', { danger: true, okLabel: 'c_delete' }).then(function (ok) {
            if (!ok) return;
            App.change(function () {
                SO.$$('.sd-comment', editor).forEach(unwrap);
                App.comments = [];
            });
            C.renderComments();
        });
    };

    C.focusComment = function (id, scroll) {
        C._activeComment = id;
        SO.$$('.sd-comment.is-active', editor).forEach(function (s) { s.classList.remove('is-active'); });
        var spans = commentSpans(id);
        spans.forEach(function (s) { s.classList.add('is-active'); });
        SO.$$('.sd-cmt', document.getElementById('sdCommentBody')).forEach(function (card) {
            var on = card.dataset.cid === id;
            card.classList.toggle('is-active', on);
            if (on && !scroll) card.scrollIntoView({ block: 'nearest' });
        });
        if (scroll && spans[0]) App.scrollToElement(spans[0]);
        if (document.getElementById('sdCommentPane').hidden && !scroll) C.togglePane('sdCommentPane', true);
    };

    C.onSelectionForComments = function (node) {
        var s = node && node.closest && node.closest('.sd-comment');
        if (s && s.getAttribute('data-cid') !== C._activeComment && !document.getElementById('sdCommentPane').hidden) C.focusComment(s.getAttribute('data-cid'), false);
    };

    C.stepComment = function (dir) {
        var list = orderedComments().filter(function (c) { return commentSpans(c.id).length; });
        if (!list.length) { SO.toast('d_comments_empty'); return; }
        var idx = list.map(function (c) { return c.id; }).indexOf(C._activeComment);
        var next = list[(idx + dir + list.length) % list.length];
        C.togglePane('sdCommentPane', true);
        C.focusComment(next.id, true);
    };

    // ====================================================== track changes
    C.toggleTrack = function () {
        App.track = !App.track;
        SO.toast(App.track ? 'd_track_on' : 'd_track_off', { type: 'info' });
        C.updateRibbon();
        App.updateStatus();
    };

    function stampChange(el) {
        el.setAttribute('data-author', authorName());
        el.setAttribute('data-time', new Date().toISOString());
    }

    function insertTracked(text) {
        var sel = getSelection();
        var r = sel.getRangeAt(0);
        var del = App.closestInEditor(r.startContainer, 'del.sd-del');
        if (del) { r.setStartBefore(del); r.collapse(true); }
        var ins = App.closestInEditor(r.startContainer, 'ins.sd-ins');
        var me = authorName();
        var caretNode, caretOff;
        if (ins && ins.getAttribute('data-author') === me && r.startContainer.nodeType === 3) {
            r.startContainer.insertData(r.startOffset, text);
            caretNode = r.startContainer;
            caretOff = r.startOffset + text.length;
        } else {
            var prev = null;
            if (r.startContainer.nodeType === 1) prev = r.startContainer.childNodes[r.startOffset - 1];
            else if (r.startOffset === 0) prev = r.startContainer.previousSibling;
            if (prev && prev.nodeType === 1 && prev.matches('ins.sd-ins') && prev.getAttribute('data-author') === me) {
                var last = prev.lastChild;
                if (!last || last.nodeType !== 3) { last = document.createTextNode(''); prev.appendChild(last); }
                last.appendData(text);
                caretNode = last;
                caretOff = last.length;
            } else {
                var el = document.createElement('ins');
                el.className = 'sd-ins';
                stampChange(el);
                el.textContent = text;
                r.insertNode(el);
                caretNode = el.firstChild;
                caretOff = text.length;
            }
        }
        var nr = document.createRange();
        nr.setStart(caretNode, caretOff);
        nr.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nr);
    }

    /** Menandai rentang sebagai dihapus. Mengembalikan false bila tidak ada teks. */
    function markDeleted(range, dir) {
        var nodes = C.splitSelectionText(range).filter(function (n) { return App.inEditor(n); });
        var imgs = SO.$$('img', editor).filter(function (img) { return range.intersectsNode(img); });
        if (!nodes.length && !imgs.length) return false;
        var first = null, last = null;
        var anchorBefore = null;
        nodes.concat(imgs).forEach(function (n) {
            var insP = n.parentNode && n.parentNode.closest('ins.sd-ins');
            if (insP && App.inEditor(insP)) {
                if (!anchorBefore) { anchorBefore = document.createTextNode(''); insP.parentNode.insertBefore(anchorBefore, insP); }
                n.remove();
                if (!insP.textContent && !insP.querySelector('img')) insP.remove();
                return;
            }
            var existing = n.parentNode && n.parentNode.closest('del.sd-del');
            if (existing) { first = first || existing; last = existing; return; }
            var d = document.createElement('del');
            d.className = 'sd-del';
            stampChange(d);
            n.parentNode.insertBefore(d, n);
            d.appendChild(n);
            first = first || d;
            last = d;
        });
        var sel = getSelection();
        var nr = document.createRange();
        if (first) {
            if (dir === 'forward') nr.setStartAfter(last); else nr.setStartBefore(first);
        } else if (anchorBefore && anchorBefore.isConnected) {
            nr.setStartAfter(anchorBefore);
        } else return true;
        nr.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nr);
        return true;
    }

    C.trackBeforeInput = function (e) {
        if (!App.track || App.composing) return;
        var t = e.inputType;
        if (t === 'insertText' || t === 'insertReplacementText') {
            var data = e.data != null ? e.data : (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
            if (!data) return;
            e.preventDefault();
            App.change(function () {
                var sel = getSelection();
                var r = sel.getRangeAt(0);
                if (!r.collapsed) markDeleted(r.cloneRange(), 'forward');
                insertTracked(data);
            }, { merge: 'typing' });
            return;
        }
        if (/^delete/.test(t) && t !== 'deleteByDrag' && t !== 'deleteByCut') {
            var ranges = e.getTargetRanges ? e.getTargetRanges() : [];
            var r2;
            if (ranges.length) {
                r2 = document.createRange();
                r2.setStart(ranges[0].startContainer, ranges[0].startOffset);
                r2.setEnd(ranges[0].endContainer, ranges[0].endOffset);
            } else {
                r2 = getSelection().getRangeAt(0).cloneRange();
            }
            if (!r2.toString()) return; // batas paragraf: biarkan peramban menggabungkan
            var dir = /Forward/.test(t) ? 'forward' : 'backward';
            // Teks yang sudah ditandai dihapus: lompati saja.
            var within = C.splitSelectionText(r2.cloneRange()).every(function (n) { return n.parentNode.closest('del.sd-del'); });
            e.preventDefault();
            if (within) {
                var d = App.closestInEditor(dir === 'forward' ? r2.endContainer : r2.startContainer, 'del.sd-del');
                if (d) {
                    var nr = document.createRange();
                    if (dir === 'forward') nr.setStartAfter(d); else nr.setStartBefore(d);
                    nr.collapse(true);
                    getSelection().removeAllRanges();
                    getSelection().addRange(nr);
                }
                return;
            }
            App.change(function () { markDeleted(r2, dir); }, { merge: 'typing' });
        }
    };

    function changes() { return SO.$$('ins.sd-ins, del.sd-del', editor); }

    function changeAtCaret() {
        var r = App.range();
        if (!r) return null;
        var here = App.closestInEditor(r.startContainer, 'ins.sd-ins, del.sd-del');
        if (here) return here;
        var list = changes();
        for (var i = 0; i < list.length; i++) {
            var cmp = r.comparePoint ? (function () { try { return r.comparePoint(list[i], 0); } catch (e) { return 1; } })() : 1;
            if (cmp >= 0) return list[i];
        }
        return list[0] || null;
    }

    function selectChange(el) {
        if (!el) return;
        App.scrollToElement(el);
        var r = document.createRange();
        r.selectNodeContents(el);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        App.rememberRange();
    }

    C.acceptReject = function (accept, scope) {
        if (scope === 'all') {
            if (!changes().length) { SO.toast('d_no_changes'); return; }
            App.change(function () {
                SO.$$('ins.sd-ins', editor).forEach(function (el) { if (accept) unwrap(el); else el.remove(); });
                SO.$$('del.sd-del', editor).forEach(function (el) { if (accept) el.remove(); else unwrap(el); });
            });
            SO.toast(accept ? 'd_accepted_all' : 'd_rejected_all', { type: 'success' });
            return;
        }
        var el = changeAtCaret();
        if (!el) { SO.toast('d_no_changes'); return; }
        var list = changes();
        var next = list[list.indexOf(el) + 1];
        App.change(function () {
            var isIns = el.tagName === 'INS';
            if (isIns === accept) unwrap(el); else el.remove();
        });
        if (next && next.isConnected) selectChange(next);
    };

    C.stepChange = function (dir) {
        var list = changes();
        if (!list.length) { SO.toast('d_no_changes'); return; }
        var cur = changeAtCaret();
        var idx = list.indexOf(cur);
        var r = App.range();
        var inside = r && App.closestInEditor(r.startContainer, 'ins.sd-ins, del.sd-del');
        var target = dir > 0 ? (inside ? list[idx + 1] : list[idx]) : list[idx - 1];
        selectChange(target || list[dir > 0 ? 0 : list.length - 1]);
    };

    C.toggleMarkup = function () {
        editor.classList.toggle('hide-markup');
        App.scheduleLayout();
        App.ribbon.setActive('markup', !editor.classList.contains('hide-markup'));
    };

    // ======================================================= find/replace
    var find = { matches: [], cur: -1, opts: {} };

    function buildTextMap() {
        var segs = [];
        var text = '';
        var lastBlock = null;
        var walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                return n.parentNode.closest('[contenteditable="false"], .sd-gap, del.sd-del') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }
        });
        var n;
        while ((n = walker.nextNode())) {
            var block = n.parentNode.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,pre,blockquote,div');
            if (lastBlock && block !== lastBlock) text += '\n';
            lastBlock = block;
            segs.push({ node: n, start: text.length, end: text.length + n.length });
            text += n.data;
        }
        return { text: text, segs: segs };
    }

    function locate(segs, pos, isEnd) {
        var lo = 0, hi = segs.length - 1;
        while (lo <= hi) {
            var mid = (lo + hi) >> 1;
            var s = segs[mid];
            if (pos < s.start) hi = mid - 1;
            else if (pos > s.end || (!isEnd && pos === s.end && mid < segs.length - 1 && segs[mid + 1].start === pos)) lo = mid + 1;
            else return { node: s.node, offset: pos - s.start };
        }
        return null;
    }

    function buildRegex(q, o) {
        var src = o.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (o.whole) src = '(?<![\\p{L}\\p{N}_])(?:' + src + ')(?![\\p{L}\\p{N}_])';
        try { return new RegExp(src, 'gu' + (o.matchCase ? '' : 'i')); } catch (e) { return null; }
    }

    C.search = function (q, opts) {
        find.query = q;
        find.opts = opts || find.opts;
        find.matches = [];
        if (!q) { C.paintFind(); return 0; }
        var re = buildRegex(q, find.opts);
        if (!re) { C.paintFind(); return -1; }
        var map = buildTextMap();
        var m;
        var guard = 0;
        while ((m = re.exec(map.text)) && guard++ < 5000) {
            if (!m[0].length) { re.lastIndex++; continue; }
            var a = locate(map.segs, m.index, false);
            var b = locate(map.segs, m.index + m[0].length, true);
            if (!a || !b) continue;
            var r = document.createRange();
            try { r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset); } catch (e) { continue; }
            find.matches.push({ range: r, text: m[0], index: m.index, context: map.text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40), ctxStart: Math.max(0, m.index - 40) });
        }
        if (find.cur >= find.matches.length) find.cur = find.matches.length - 1;
        if (find.cur < 0 && find.matches.length) {
            // Mulai dari hasil pertama setelah kursor.
            var sel = App.range();
            find.cur = 0;
            if (sel) {
                for (var i = 0; i < find.matches.length; i++) {
                    try { if (find.matches[i].range.compareBoundaryPoints(Range.START_TO_START, sel) >= 0) { find.cur = i; break; } } catch (e) {}
                }
            }
        }
        C.paintFind();
        return find.matches.length;
    };

    C.paintFind = function () {
        if (global.CSS && CSS.highlights && global.Highlight) {
            CSS.highlights.set('sd-find', new Highlight(...find.matches.map(function (m) { return m.range; })));
            var cur = find.matches[find.cur];
            if (cur) CSS.highlights.set('sd-find-current', new Highlight(cur.range)); else CSS.highlights.delete('sd-find-current');
        }
        var count = document.getElementById('sdFindCount');
        if (count) {
            count.textContent = !find.query ? '' : find.matches.length ? SO.t('d_find_count', { n: find.cur + 1, total: find.matches.length }) : SO.t('d_find_none');
        }
        var results = document.getElementById('sdFindResults');
        if (results) {
            results.innerHTML = '';
            find.matches.slice(0, 200).forEach(function (m, i) {
                var b = SO.el('button', { type: 'button', class: 'sd-find-result' + (i === find.cur ? ' is-current' : '') });
                var pre = m.context.slice(0, m.index - m.ctxStart).replace(/\n/g, ' ');
                var post = m.context.slice(m.index - m.ctxStart + m.text.length).replace(/\n/g, ' ');
                b.innerHTML = (m.ctxStart > 0 ? '…' : '') + SO.esc(pre) + '<mark>' + SO.esc(m.text) + '</mark>' + SO.esc(post) + '…';
                b.addEventListener('click', function () { find.cur = i; C.paintFind(); C.revealMatch(true); });
                results.appendChild(b);
            });
        }
    };

    C.clearFind = function () {
        find.matches = [];
        find.query = '';
        if (global.CSS && CSS.highlights) { CSS.highlights.delete('sd-find'); CSS.highlights.delete('sd-find-current'); }
    };

    C.revealMatch = function (selectIt) {
        var m = find.matches[find.cur];
        if (!m) return;
        var rect = m.range.getBoundingClientRect();
        var sr = App.scroller.getBoundingClientRect();
        if (rect.top < sr.top + 60 || rect.bottom > sr.bottom - 40) App.scroller.scrollTop += rect.top - sr.top - sr.height / 3;
        if (selectIt || !(global.CSS && CSS.highlights)) {
            var sel = getSelection();
            sel.removeAllRanges();
            sel.addRange(m.range.cloneRange());
            App.rememberRange();
        }
    };

    C.findStep = function (dir) {
        if (!find.matches.length) { C.search(find.query); if (!find.matches.length) return; }
        find.cur = (find.cur + dir + find.matches.length) % find.matches.length;
        C.paintFind();
        C.revealMatch(false);
    };

    function replacementFor(m, rep) {
        if (!find.opts.regex) return rep;
        var re = buildRegex(find.query, find.opts);
        return re ? m.text.replace(new RegExp(re.source, re.flags.replace('g', '')), rep) : rep;
    }

    function replaceOne(m, rep) {
        var r = m.range;
        if (App.track) {
            var sel = getSelection();
            markDeleted(r.cloneRange(), 'forward');
            if (rep) insertTracked(rep);
            return;
        }
        r.deleteContents();
        if (rep) r.insertNode(document.createTextNode(rep));
    }

    C.replaceCurrent = function (rep) {
        var m = find.matches[find.cur];
        if (!m) { C.findStep(1); return; }
        App.change(function () { replaceOne(m, replacementFor(m, rep)); });
        var keep = find.cur;
        C.search(find.query);
        find.cur = Math.min(keep, find.matches.length - 1);
        C.paintFind();
        C.revealMatch(false);
    };

    C.replaceAll = function (rep) {
        var list = find.matches.slice();
        if (!list.length) { SO.toast('d_find_none'); return; }
        App.change(function () {
            for (var i = list.length - 1; i >= 0; i--) replaceOne(list[i], replacementFor(list[i], rep));
        });
        SO.toast('d_replaced_n', { type: 'success', vars: { n: list.length } });
        find.cur = -1;
        C.search(find.query);
    };

    C.renderFind = function (focusReplace) {
        var body = document.getElementById('sdFindBody');
        if (!body) return;
        if (!body.firstChild) {
            body.innerHTML =
                '<div class="so-field"><label for="sdFindInput">' + SO.esc(SO.t('d_find')) + '</label><input class="so-input" id="sdFindInput" type="search" autocomplete="off" spellcheck="false"></div>' +
                '<div class="sd-find-count" id="sdFindCount"></div>' +
                '<div class="so-field"><label for="sdReplaceInput">' + SO.esc(SO.t('d_replace_with')) + '</label><input class="so-input" id="sdReplaceInput" type="text" autocomplete="off" spellcheck="false"></div>' +
                '<div style="display:flex;flex-direction:column;gap:6px;margin:10px 0 4px">' +
                '<label class="so-field is-inline"><input type="checkbox" id="sdFindCase"><span>' + SO.esc(SO.t('d_match_case')) + '</span></label>' +
                '<label class="so-field is-inline"><input type="checkbox" id="sdFindWhole"><span>' + SO.esc(SO.t('d_whole_word')) + '</span></label>' +
                '<label class="so-field is-inline"><input type="checkbox" id="sdFindRegex"><span>' + SO.esc(SO.t('d_use_regex')) + '</span></label></div>' +
                '<div class="sd-find-btns">' +
                '<button type="button" class="so-btn is-sm" id="sdFindPrev" aria-label="prev"><i class="fas fa-chevron-up"></i></button>' +
                '<button type="button" class="so-btn is-sm" id="sdFindNext" aria-label="next"><i class="fas fa-chevron-down"></i></button>' +
                '<button type="button" class="so-btn is-sm" id="sdReplaceOne">' + SO.esc(SO.t('d_replace')) + '</button>' +
                '<button type="button" class="so-btn is-sm is-primary" id="sdReplaceAll">' + SO.esc(SO.t('d_replace_all')) + '</button></div>' +
                '<div class="sd-find-results" id="sdFindResults"></div>';
            var input = body.querySelector('#sdFindInput');
            var run = function () {
                find.cur = -1;
                C.search(input.value, { matchCase: body.querySelector('#sdFindCase').checked, whole: body.querySelector('#sdFindWhole').checked, regex: body.querySelector('#sdFindRegex').checked });
                C.revealMatch(false);
            };
            input.addEventListener('input', SO.debounce(run, 180));
            ['#sdFindCase', '#sdFindWhole', '#sdFindRegex'].forEach(function (s) { body.querySelector(s).addEventListener('change', run); });
            input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); C.findStep(e.shiftKey ? -1 : 1); } });
            body.querySelector('#sdReplaceInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); C.replaceCurrent(e.target.value); } });
            body.querySelector('#sdFindPrev').addEventListener('click', function () { C.findStep(-1); });
            body.querySelector('#sdFindNext').addEventListener('click', function () { C.findStep(1); });
            body.querySelector('#sdReplaceOne').addEventListener('click', function () { C.replaceCurrent(body.querySelector('#sdReplaceInput').value); });
            body.querySelector('#sdReplaceAll').addEventListener('click', function () { C.replaceAll(body.querySelector('#sdReplaceInput').value); });
            SO.onLang(function () { body.innerHTML = ''; if (!document.getElementById('sdFindPane').hidden) C.renderFind(); });
        }
        var sel = getSelection();
        var input2 = body.querySelector('#sdFindInput');
        if (sel.rangeCount && !sel.isCollapsed && App.inEditor(sel.anchorNode) && sel.toString().length < 120 && sel.toString().indexOf('\n') === -1) {
            input2.value = sel.toString();
        }
        setTimeout(function () {
            var target = focusReplace ? body.querySelector('#sdReplaceInput') : input2;
            target.focus();
            if (!focusReplace) input2.select();
        }, 20);
        if (input2.value) { find.cur = -1; C.search(input2.value, find.opts); }
    };
    C.findRefreshSoon = SO.debounce(function () { if (find.query) { var keep = find.cur; C.search(find.query); find.cur = Math.min(keep, find.matches.length - 1); C.paintFind(); } }, 350);

    C.openFind = function (replace) {
        App.rememberRange();
        C.togglePane('sdFindPane', true);
        C.renderFind(replace);
    };

    // ========================================================= word count
    C.wordCount = function () {
        var text = App.plainText();
        var sel = getSelection();
        var selText = sel.rangeCount && !sel.isCollapsed && App.inEditor(sel.anchorNode) ? sel.toString() : '';
        var paras = SO.$$('p,h1,h2,h3,h4,li,pre,blockquote', editor).filter(function (p) { return p.textContent.trim() && !p.closest('[contenteditable="false"]'); }).length;
        function row(label, all, part) {
            return '<tr><td>' + SO.esc(SO.t(label)) + '</td>' + (selText ? '<td>' + SO.fmtNum(part) + '</td>' : '') + '<td>' + SO.fmtNum(all) + '</td></tr>';
        }
        var html = '<table class="sd-wc-table">' +
            (selText ? '<tr><td></td><td style="font-weight:500;color:var(--so-muted)">' + SO.esc(SO.t('d_selection')) + '</td><td style="font-weight:500;color:var(--so-muted)">' + SO.esc(SO.t('d_document')) + '</td></tr>' : '') +
            '<tr><td>' + SO.esc(SO.t('d_pages')) + '</td>' + (selText ? '<td>-</td>' : '') + '<td>' + SO.fmtNum(App.pageCount) + '</td></tr>' +
            row('d_words', App.countWords(text), App.countWords(selText)) +
            row('d_chars_no_space', text.replace(/\s/g, '').length, selText.replace(/\s/g, '').length) +
            row('d_chars_with_space', text.replace(/\n/g, '').length, selText.replace(/\n/g, '').length) +
            row('d_paragraphs', paras, selText ? selText.split(/\n+/).filter(function (x) { return x.trim(); }).length : 0) +
            '<tr><td>' + SO.esc(SO.t('d_reading_time')) + '</td>' + (selText ? '<td>-</td>' : '') + '<td>' + SO.esc(SO.t('d_minutes', { n: Math.max(1, Math.round(App.countWords(text) / 200)) })) + '</td></tr>' +
            '</table>';
        SO.dialog({ title: 'd_word_count', body: html, buttons: [{ label: 'c_close', primary: true }] });
    };

    // ============================================================= speech
    C.readAloud = function () {
        if (!global.speechSynthesis) { SO.toast('d_speech_unsupported', { type: 'warn' }); return; }
        if (speechSynthesis.speaking) { speechSynthesis.cancel(); App.ribbon.setActive('readAloud', false); return; }
        var sel = getSelection();
        var text = sel.rangeCount && !sel.isCollapsed && App.inEditor(sel.anchorNode) ? sel.toString() : App.plainText();
        text = text.trim();
        if (!text) return;
        var lang = App.settings.proofLang || SO.locale();
        var voices = speechSynthesis.getVoices();
        var voice = voices.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(lang.slice(0, 2).toLowerCase()) === 0; })[0];
        var chunks = text.match(/[^.!?。！？\n]+[.!?。！？]*\s*|\n+/g) || [text];
        var merged = [];
        chunks.forEach(function (c) {
            if (!c.trim()) return;
            if (merged.length && (merged[merged.length - 1] + c).length < 220) merged[merged.length - 1] += c; else merged.push(c);
        });
        App.ribbon.setActive('readAloud', true);
        merged.forEach(function (c, i) {
            var u = new SpeechSynthesisUtterance(c);
            u.lang = lang;
            if (voice) u.voice = voice;
            if (i === merged.length - 1) u.onend = function () { App.ribbon.setActive('readAloud', false); };
            u.onerror = function () { App.ribbon.setActive('readAloud', false); };
            speechSynthesis.speak(u);
        });
    };

    var recog = null;
    C.dictate = function () {
        var SR = global.SpeechRecognition || global.webkitSpeechRecognition;
        if (!SR) { SO.toast('d_dictation_unsupported', { type: 'warn' }); return; }
        if (recog) { recog._stop = true; recog.stop(); recog = null; App.ribbon.setActive('dictate', false); return; }
        App.rememberRange();
        recog = new SR();
        recog.lang = App.settings.proofLang || SO.locale();
        recog.continuous = true;
        recog.interimResults = false;
        recog.onresult = function (ev) {
            for (var i = ev.resultIndex; i < ev.results.length; i++) {
                if (!ev.results[i].isFinal) continue;
                var txt = ev.results[i][0].transcript;
                App.restoreRange();
                App.change(function () { exec('insertText', txt.replace(/^\s+/, '') + ' '); }, { merge: 'typing' });
            }
        };
        recog.onerror = function (ev) {
            if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') SO.toast('d_dictation_denied', { type: 'error' });
        };
        var self = recog;
        recog.onend = function () {
            if (self._stop || recog !== self) return;
            try { self.start(); } catch (e) { recog = null; App.ribbon.setActive('dictate', false); }
        };
        try { recog.start(); App.ribbon.setActive('dictate', true); SO.toast('d_dictation_on'); } catch (e) { recog = null; }
    };

    // ============================================================ symbols
    var SYMBOLS = {
        d_sym_common: '©®™°±×÷≠≈≤≥∞√∑∏∫∂∆∇∈∉∩∪⊂⊃∀∃¬∧∨⇒⇔‰§¶†‡•…–—‘’“”«»¿¡',
        d_sym_currency: '€£¥₹₩₽₺₿¢$Rp',
        d_sym_arrows: '←↑→↓↔↕↖↗↘↙⇐⇑⇒⇓⇔➔➜➤▶◀▲▼►◄',
        d_sym_greek: 'αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ',
        d_sym_shapes: '■□▪▫▬▲△▼▽◆◇○●◎★☆♠♣♥♦✓✔✕✖✗✘☐☑☒',
        d_sym_math: '½⅓⅔¼¾⅛¹²³⁴⁵⁶⁷⁸⁹⁰₀₁₂₃₄₅₆₇₈₉∠⊥∥≡∝∴∵ℕℤℚℝℂ',
        d_sym_emoji: '😀😁😂🤣😊😍😎🤔😢😡👍👎👏🙏💪🎉🔥⭐✅❌⚠️💡📌📎📅📈📉💰🏆🚀❤️💙💚'
    };

    C.symbolDialog = function () {
        App.rememberRange();
        SO.dialog({
            title: 'd_symbol', width: 520,
            body: function (body) {
                var tabs = SO.el('div', { class: 'so-tabs-inline' });
                var grid = SO.el('div', { class: 'sd-symbols' });
                function show(key) {
                    SO.$$('button', tabs).forEach(function (b) { b.classList.toggle('is-active', b.dataset.k === key); });
                    grid.innerHTML = '';
                    var chars = key === 'd_sym_currency' ? ['€', '£', '¥', '₹', '₩', '₽', '₺', '₿', '¢', '$', 'Rp'] : Array.from(SYMBOLS[key]);
                    chars.forEach(function (ch) {
                        if (ch === '️') return;
                        var b = SO.el('button', { type: 'button', text: ch, title: ch });
                        b.addEventListener('click', function () {
                            App.restoreRange();
                            App.change(function () { exec('insertText', ch); });
                            App.rememberRange();
                        });
                        grid.appendChild(b);
                    });
                }
                Object.keys(SYMBOLS).forEach(function (k) {
                    var b = SO.el('button', { type: 'button', text: SO.t(k), dataset: { k: k } });
                    b.addEventListener('click', function () { show(k); });
                    tabs.appendChild(b);
                });
                body.appendChild(tabs);
                body.appendChild(grid);
                show('d_sym_common');
            },
            buttons: [{ label: 'c_close', primary: true }]
        });
    };

    // ========================================================== equations
    C.renderEquations = function (root) {
        var eqs = SO.$$('.sd-eq', root || editor).filter(function (eq) { return !eq.querySelector('.katex'); });
        if (!eqs.length) return;
        SO.load('katex').then(function (katex) {
            eqs.forEach(function (eq) {
                try { eq.innerHTML = katex.renderToString(eq.getAttribute('data-latex') || '', { throwOnError: false, displayMode: eq.classList.contains('is-block') }); }
                catch (e) { eq.textContent = eq.getAttribute('data-latex'); }
            });
            App.scheduleLayout();
            if (App.lastSnap) App.lastSnap.html = SDLayout.cleanHtml(editor);
        }).catch(function () {});
    };

    var EQ_SNIPPETS = [
        ['\\frac{a}{b}', 'a/b'], ['x^{2}', 'x²'], ['x_{i}', 'xᵢ'], ['\\sqrt{x}', '√x'], ['\\sum_{i=1}^{n}', 'Σ'], ['\\int_{a}^{b}', '∫'],
        ['\\lim_{x \\to \\infty}', 'lim'], ['\\alpha', 'α'], ['\\beta', 'β'], ['\\pi', 'π'], ['\\theta', 'θ'], ['\\Delta', 'Δ'],
        ['\\pm', '±'], ['\\times', '×'], ['\\leq', '≤'], ['\\geq', '≥'], ['\\neq', '≠'], ['\\infty', '∞'],
        ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', '[ ]'], ['x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', 'abc'], ['E = mc^2', 'E=mc²']
    ];

    C.equation = function (existing) {
        App.rememberRange();
        SO.load('katex').then(function (katex) {
            SO.dialog({
                title: 'd_equation', width: 560,
                body: function (body, dlg) {
                    body.innerHTML = '<div class="so-field"><label>LaTeX</label><textarea class="so-input" id="sdEqSrc" rows="3" spellcheck="false" style="font-family:Roboto Mono,monospace"></textarea></div>' +
                        '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px" id="sdEqSnips"></div>' +
                        '<label class="so-field is-inline" style="margin-top:10px"><input type="checkbox" id="sdEqBlock"><span>' + SO.esc(SO.t('d_equation_block')) + '</span></label>' +
                        '<div class="sd-eq-preview" id="sdEqPrev"></div>';
                    var src = dlg.$('#sdEqSrc');
                    var prev = dlg.$('#sdEqPrev');
                    src.value = existing ? existing.getAttribute('data-latex') : 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}';
                    dlg.$('#sdEqBlock').checked = existing ? existing.classList.contains('is-block') : false;
                    var render = function () {
                        try { prev.innerHTML = katex.renderToString(src.value, { throwOnError: true, displayMode: true }); }
                        catch (e) { prev.innerHTML = '<span style="color:var(--so-danger);font-size:12px">' + SO.esc(e.message) + '</span>'; }
                    };
                    src.addEventListener('input', render);
                    EQ_SNIPPETS.forEach(function (s) {
                        var b = SO.el('button', { type: 'button', class: 'so-btn is-sm', text: s[1], title: s[0] });
                        b.addEventListener('click', function () {
                            var st = src.selectionStart, en = src.selectionEnd;
                            src.value = src.value.slice(0, st) + s[0] + src.value.slice(en);
                            src.focus();
                            src.selectionStart = src.selectionEnd = st + s[0].length;
                            render();
                        });
                        dlg.$('#sdEqSnips').appendChild(b);
                    });
                    render();
                },
                enterSubmits: false,
                buttons: [
                    existing ? { label: 'c_delete', value: 'del' } : null,
                    { label: 'c_cancel', value: null },
                    { label: existing ? 'c_ok' : 'd_insert', primary: true, value: 'ok', onClick: function (dlg) { C._eq = { src: dlg.$('#sdEqSrc').value.trim(), block: dlg.$('#sdEqBlock').checked }; } }
                ].filter(Boolean)
            }).then(function (v) {
                if (v === 'del' && existing) { App.change(function () { existing.remove(); }); return; }
                if (v !== 'ok' || !C._eq.src) return;
                var html = katex.renderToString(C._eq.src, { throwOnError: false, displayMode: C._eq.block });
                if (existing) {
                    App.change(function () {
                        existing.setAttribute('data-latex', C._eq.src);
                        existing.classList.toggle('is-block', C._eq.block);
                        existing.innerHTML = html;
                    });
                    return;
                }
                App.change(function () {
                    var span = SO.el('span', { class: 'sd-eq' + (C._eq.block ? ' is-block' : ''), contenteditable: 'false', 'data-latex': C._eq.src, html: html });
                    C.insertInline(span);
                });
            });
        }).catch(function (e) { SO.toast(e.message, { type: 'error' }); });
    };

    // ===================================================== format painter
    function qs(c) { try { return document.queryCommandState(c); } catch (e) { return false; } }

    C.painter = function (sticky) {
        if (App.painter) { App.painter = null; editor.style.cursor = ''; C.updateRibbon(); return; }
        var r = App.range();
        if (!r) return;
        var node = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
        var cs = getComputedStyle(node);
        var bg = null;
        var n = node;
        while (n && n !== editor && !bg) {
            var b = getComputedStyle(n).backgroundColor;
            if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b) && !/^(P|LI|TD|TH|DIV|H\d)$/.test(n.tagName)) bg = b;
            n = n.parentNode;
        }
        var deco = cs.textDecorationLine || cs.textDecoration || '';
        App.painter = {
            sticky: !!sticky,
            st: {
                bold: parseInt(cs.fontWeight, 10) >= 600, italic: cs.fontStyle === 'italic',
                underline: /underline/.test(deco), strike: /line-through/.test(deco),
                color: SO.toHex(cs.color) || '#000000', bg: bg ? SO.toHex(bg) : null,
                font: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
                size: Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2 + 'pt'
            }
        };
        editor.style.cursor = 'copy';
        SO.toast(sticky ? 'd_painter_sticky' : 'd_painter_hint');
        C.updateRibbon();
    };

    C.applyPainter = function () {
        var p = App.painter;
        if (!p) return;
        var sel = getSelection();
        if (!sel.rangeCount || sel.isCollapsed || !App.inEditor(sel.anchorNode)) return;
        var st = p.st;
        App.change(function () {
            exec('styleWithCSS', true);
            [['bold', st.bold], ['italic', st.italic], ['underline', st.underline], ['strikeThrough', st.strike]].forEach(function (x) {
                if (qs(x[0]) !== x[1]) exec(x[0]);
            });
            exec('fontName', st.font);
            exec('foreColor', st.color);
            exec('hiliteColor', st.bg || 'transparent');
            exec('fontSize', '7');
            SO.$$('span[style*="xxx-large"], font[size="7"]', editor).forEach(function (el) { el.style.fontSize = st.size; el.removeAttribute('size'); });
        });
        if (!p.sticky) { App.painter = null; editor.style.cursor = ''; C.updateRibbon(); }
    };
    editor.addEventListener('mouseup', function () { if (App.painter) setTimeout(C.applyPainter, 0); });

    // ============================================================ print
    C.print = function () {
        App.layoutNow();
        var g = App.geometry();
        var root = document.getElementById('sdPrintRoot');
        SDLayout.buildPrintPages(root, editor, App.hfLayer, App.pagesEl, App.pageCount, g, { hideComments: true });
        var style = document.getElementById('sdPageStyle');
        if (!style) { style = document.createElement('style'); style.id = 'sdPageStyle'; document.head.appendChild(style); }
        style.textContent = '@page { size: ' + (g.pageW / SDLayout.MM).toFixed(1) + 'mm ' + (g.pageH / SDLayout.MM).toFixed(1) + 'mm; margin: 0; }';
        var imgs = SO.$$('img', root).filter(function (i) { return !i.complete; });
        var go = function () {
            var cleanup = function () { root.innerHTML = ''; };
            global.addEventListener('afterprint', cleanup, { once: true });
            setTimeout(function () { global.print(); }, 50);
        };
        if (!imgs.length) go();
        else Promise.all(imgs.map(function (i) { return new Promise(function (res) { i.onload = i.onerror = res; }); })).then(go);
    };

    // ============================================================ export
    function cleanClone() {
        var clone = editor.cloneNode(true);
        SDLayout.cleanNode(clone);
        SO.$$('.sd-comment', clone).forEach(unwrap);
        return clone;
    }

    C.exportAs = function (fmt) {
        var name = SO.safeName(App.getTitle(), 'Sinerli Dokum');
        var busy;
        var fail = function (err) { if (busy) busy.done(); console.error(err); SO.toast((err && err.message) || 'd_err_export', { type: 'error' }); };
        App.layoutNow();
        if (fmt === 'docx') {
            busy = SO.busy('d_exporting');
            SDExport.docx(App).then(function (blob) { busy.done(); SO.download(blob, name + '.docx'); SO.toast('d_exported', { type: 'success' }); }).catch(fail);
        } else if (fmt === 'pdf') {
            busy = SO.busy('d_exporting');
            SDExport.pdf(App, function (i, n) { busy.set(SO.t('d_pdf_progress', { i: i, n: n })); })
                .then(function (blob) { busy.done(); SO.download(blob, name + '.pdf'); SO.toast('d_exported', { type: 'success' }); }).catch(fail);
        } else if (fmt === 'html') {
            busy = SO.busy('d_exporting');
            var clone = cleanClone();
            Promise.all(SO.$$('img', clone).map(function (img) {
                return App.assets.dataUrl(img.getAttribute('data-asset') || img.getAttribute('src')).then(function (d) { if (d) img.setAttribute('src', d); img.removeAttribute('data-asset'); });
            })).then(function () {
                SO.$$('[contenteditable]', clone).forEach(function (el) { el.removeAttribute('contenteditable'); });
                busy.done();
                SO.download(SDIO.exportHtml(clone.innerHTML, App.settings, App.getTitle()), name + '.html', 'text/html;charset=utf-8');
            }).catch(fail);
        } else if (fmt === 'txt') {
            var c2 = cleanClone();
            SO.$$('del.sd-del, .sd-toc', c2).forEach(function (n) { n.remove(); });
            SO.download('﻿' + SDIO.htmlToText(c2), name + '.txt', 'text/plain;charset=utf-8');
        } else if (fmt === 'md') {
            var c3 = cleanClone();
            SO.$$('del.sd-del, .sd-toc, .sd-notes', c3).forEach(function (n) { n.remove(); });
            SO.download(SDIO.htmlToMarkdown(c3), name + '.md', 'text/markdown;charset=utf-8');
        } else if (fmt === 'sinedoc') {
            App.serialize().then(function (content) {
                content.name = App.getTitle();
                SO.download(JSON.stringify(content), name + '.sinedoc', 'application/json');
            }).catch(fail);
        }
    };

    C.importFile = function (file) {
        var busy = SO.busy('c_opening');
        SDIO.importFile(file).then(function (res) {
            busy.done();
            App.session.newKey();
            if (res.content) App.loadDocument(res.content, res.name);
            else App.loadDocument({ html: res.html }, res.name);
            App.session.markDirty();
            SO.toast(res.warnings ? 'd_import_warn' : 'd_imported', { type: res.warnings ? 'warn' : 'success' });
        }).catch(function (err) { busy.done(); SO.toast(err.message || 'c_err_load', { type: 'error' }); });
    };

    C.insertFromFile = function () {
        App.rememberRange();
        SO.pickFile('.docx,.txt,.md,.html,.htm').then(function (f) {
            if (!f) return;
            var busy = SO.busy('c_opening');
            SDIO.importFile(f).then(function (res) {
                busy.done();
                if (!res.html) return;
                var tmp = document.createElement('div');
                tmp.innerHTML = res.html;
                App.adoptImages(tmp);
                App.restoreRange();
                App.change(function () { exec('insertHTML', tmp.innerHTML); });
            }).catch(function (err) { busy.done(); SO.toast(err.message, { type: 'error' }); });
        });
    };

    // ======================================================== nav pane
    C.renderNav = function () {
        var body = document.getElementById('sdNavBody');
        if (!body || document.getElementById('sdNavPane').hidden) return;
        var hs = C.headings(4);
        body.innerHTML = '';
        if (!hs.length) { body.appendChild(SO.el('div', { class: 'so-empty-note', text: SO.t('d_nav_empty') })); return; }
        var r = App.range();
        var current = null;
        if (r) {
            hs.forEach(function (h) {
                try { if (r.comparePoint(h, 0) <= 0 || h.contains(r.startContainer)) current = h; } catch (e) {}
            });
        }
        var seen = {};
        hs.forEach(function (h) {
            var id = h.getAttribute('data-hid');
            if (!id || seen[id]) { id = SO.uid('h'); h.setAttribute('data-hid', id); }
            seen[id] = true;
            var b = SO.el('button', { type: 'button', class: 'sd-nav-item lvl-' + h.tagName[1] + (h === current ? ' is-current' : ''), text: h.textContent.trim(), title: h.textContent.trim() });
            b.addEventListener('click', function () { C.gotoHeading(id); });
            body.appendChild(b);
        });
    };
    C.renderNavSoon = SO.debounce(C.renderNav, 400);
    document.addEventListener('selectionchange', SO.debounce(function () {
        if (!document.getElementById('sdNavPane').hidden && App.inEditor(getSelection().anchorNode)) C.renderNav();
    }, 500));

    C.spell = function () {
        App.settings.spellcheck = !(App.settings.spellcheck !== false);
        editor.spellcheck = App.settings.spellcheck;
        // Chrome baru menggambar ulang garis ejaan setelah fokus berpindah.
        editor.blur();
        setTimeout(function () { editor.focus({ preventScroll: true }); App.restoreRange(); }, 0);
        C.updateRibbon();
    };

    C.proofLang = function (lang) {
        App.change(function () { App.settings.proofLang = lang; });
        editor.setAttribute('lang', lang);
        SO.toast('d_proof_lang_set');
    };
})(window);
