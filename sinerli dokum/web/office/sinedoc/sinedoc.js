/**
 * Sinerli Dokum — inti aplikasi: status dokumen, editor, tata letak, undo,
 * gambar, tempel/seret, status bar, penggaris.
 * Perintah ada di sinedoc-cmds.js, ribbon & boot di sinedoc-ribbon.js.
 */
(function (global) {
    'use strict';

    var $ = SO.$;
    var editor = $('#sdEditor');
    var canvas = $('#sdCanvas');
    var stage = $('#sdStage');
    var scroller = $('#sdScroller');
    var pagesEl = $('#sdPages');
    var overlay = $('#sdOverlay');
    var hfLayer = SO.el('div', { class: 'sd-hf-layer', style: { position: 'absolute', inset: '0', zIndex: '2', pointerEvents: 'none' } });
    canvas.insertBefore(hfLayer, overlay);

    var BLOCK_SEL = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,div:not(.sd-toc):not(.sd-notes):not(.sd-cols):not(.sd-page-break):not(.sd-box),td,th';

    function defaultSettings() {
        return {
            size: 'a4', orientation: 'portrait',
            margins: { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4 },
            headerDist: 12.5, footerDist: 12.5,
            pageColor: '#ffffff', watermark: '', border: null,
            hf: { header: '', footer: '', firstHeader: '', firstFooter: '', evenHeader: '', evenFooter: '', differentFirst: false, differentOddEven: false, startAt: 1 },
            defaultFont: 'Arial', defaultSize: 11, lineHeight: 1.15,
            showMarks: false, spellcheck: true
        };
    }

    var App = global.SineDoc = {
        editor: editor, canvas: canvas, pagesEl: pagesEl, hfLayer: hfLayer, overlay: overlay, scroller: scroller,
        settings: defaultSettings(),
        zoom: 1, pageCount: 1, layout: null,
        comments: [], notes: [],
        track: false, readOnly: false,
        assets: new SO.Assets(),
        savedRange: null,
        composing: false,
        selectedImg: null,
        cmd: {},
        defaultSettings: defaultSettings
    };

    App.geometry = function () { return SDLayout.geometry(App.settings); };
    App.getTitle = function () { return (App.shell && App.shell.getName()) || SO.t('c_untitled'); };

    // ============================================================ geometry
    function applyEditorFrame(g) {
        editor.style.left = g.mL + 'px';
        editor.style.top = g.mT + 'px';
        editor.style.width = g.contentW + 'px';
        editor.style.setProperty('--sd-content-h', g.contentH + 'px');
        editor.style.fontFamily = SO.fontStack(App.settings.defaultFont || 'Arial');
        editor.style.fontSize = (App.settings.defaultSize || 11) + 'pt';
        editor.style.lineHeight = String(App.settings.lineHeight || 1.15);
        hfLayer.style.fontFamily = editor.style.fontFamily;
    }

    function applyZoomFrame(g) {
        var h = App.pageCount * g.pitch - g.gap;
        canvas.style.width = g.pageW + 'px';
        canvas.style.height = h + 'px';
        canvas.style.transform = 'scale(' + App.zoom + ')';
        stage.style.width = Math.ceil(g.pageW * App.zoom) + 'px';
        stage.style.height = Math.ceil(h * App.zoom) + 'px';
        var extra = scroller.clientWidth - stage.offsetWidth;
        stage.style.marginLeft = extra > 32 ? 'auto' : '16px';
        stage.style.marginRight = extra > 32 ? 'auto' : '16px';
    }

    // ============================================================== layout
    var layoutQueued = false;
    var layoutDebounceTimer = null;
    App.scheduleLayout = function (isTyping) {
        if (isTyping) {
            if (layoutDebounceTimer) clearTimeout(layoutDebounceTimer);
            layoutDebounceTimer = setTimeout(function () {
                layoutDebounceTimer = null;
                layoutQueued = false;
                App.layoutNow();
            }, 180);
            return;
        }
        if (layoutQueued) return;
        if (layoutDebounceTimer) { clearTimeout(layoutDebounceTimer); layoutDebounceTimer = null; }
        layoutQueued = true;
        requestAnimationFrame(function () { layoutQueued = false; App.layoutNow(); });
    };

    App.layoutNow = function () {
        if (App.composing) return;
        var g = App.geometry();
        ensureStructure();
        applyEditorFrame(g);
        editor.style.minHeight = g.contentH + 'px';
        SDLayout.fitWidth(editor, g);
        // Mutasi milik paginate (span jeda halaman, pemecahan node teks) bukan
        // perubahan isi — jangan sampai memicu hitung ulang jumlah kata.
        if (textObserver.takeRecords().length) textVersion++;
        var res = SDLayout.paginate(editor, g, App.zoom);
        textObserver.takeRecords();
        App.layout = res;
        App.pageCount = res.pages;
        editor.style.minHeight = ((res.pages - 1) * g.pitch + g.contentH) + 'px';
        applyZoomFrame(g);
        SDLayout.renderPages(pagesEl, hfLayer, res.pages, g, App.settings, App.getTitle(), function (which, e) {
            if (App.cmd.editHeaderFooter) App.cmd.editHeaderFooter(which, +e.currentTarget.dataset.page);
        });
        if (App.cmd.refreshTocPages) App.cmd.refreshTocPages();
        App.updateOverlay();
        App.updateStatus();
        App.drawRuler();
    };

    /** Editor tidak boleh kosong dan teks lepas dibungkus paragraf. */
    function ensureStructure() {
        var first = editor.firstElementChild;
        if (!first) {
            editor.innerHTML = '<p><br></p>';
            return;
        }
        var loose = false;
        editor.childNodes.forEach(function (n) {
            if (n.nodeType === 3 && n.textContent.trim()) loose = true;
            else if (n.nodeType === 1 && /^(SPAN|B|I|U|S|A|BR|IMG|STRONG|EM|FONT|SUP|SUB|CODE|MARK|DEL|INS|SMALL)$/.test(n.tagName)) loose = true;
        });
        if (loose) {
            var sel = SDLayout.saveSelection(editor);
            SDIO.wrapLooseInline(editor);
            SDLayout.restoreSelection(editor, sel);
        }
        SO.$$('.sd-page-break', editor).forEach(function (pb) {
            if (pb.getAttribute('data-label') !== SO.t('d_page_break')) pb.setAttribute('data-label', SO.t('d_page_break'));
            if (pb.getAttribute('contenteditable') !== 'false') pb.setAttribute('contenteditable', 'false');
        });
        var last = editor.lastElementChild;
        if (last && (last.classList.contains('sd-notes') ? (last.previousElementSibling && last.previousElementSibling.getAttribute('contenteditable') === 'false') : last.getAttribute('contenteditable') === 'false' || last.tagName === 'TABLE')) {
            var p = document.createElement('p');
            p.innerHTML = '<br>';
            if (last.classList.contains('sd-notes')) editor.insertBefore(p, last); else editor.appendChild(p);
        }
    }

    // =============================================================== zoom
    App.setZoom = function (z, keepCenter, persist) {
        z = SO.clamp(Math.round(z * 100) / 100, 0.25, 3);
        var prev = App.zoom;
        if (z === prev) return;
        var cy = scroller.scrollTop + scroller.clientHeight / 2;
        var ratio = cy / Math.max(1, stage.offsetHeight + 72);
        App.zoom = z;
        applyZoomFrame(App.geometry());
        $('#sdZoomRange').value = Math.round(z * 100);
        $('#sdZoomVal').textContent = Math.round(z * 100) + '%';
        if (keepCenter !== false) scroller.scrollTop = ratio * (stage.offsetHeight + 72) - scroller.clientHeight / 2;
        if (persist !== false) { try { localStorage.setItem('sd_zoom', String(z)); } catch (e) {} }
        App.updateOverlay();
        App.drawRuler();
    };
    App.fitWidth = function (persist) {
        var g = App.geometry();
        if (scroller.clientWidth < 200) return;
        App.setZoom((scroller.clientWidth - 40) / g.pageW, true, persist);
    };
    App.fitPage = function () {
        var g = App.geometry();
        App.setZoom(Math.min((scroller.clientWidth - 40) / g.pageW, (scroller.clientHeight - 60) / g.pageH));
    };

    // =========================================================== selection
    App.inEditor = function (node) { return node && (node === editor || editor.contains(node)); };

    App.rememberRange = function () {
        var sel = getSelection();
        if (sel.rangeCount && App.inEditor(sel.anchorNode)) App.savedRange = sel.getRangeAt(0).cloneRange();
    };

    /** Mengembalikan fokus & seleksi editor sebelum perintah dari ribbon. */
    App.restoreRange = function () {
        var sel = getSelection();
        var inside = sel.rangeCount && App.inEditor(sel.anchorNode);
        if (document.activeElement !== editor) editor.focus({ preventScroll: true });
        if (!inside && App.savedRange && App.inEditor(App.savedRange.startContainer)) {
            sel.removeAllRanges();
            sel.addRange(App.savedRange);
        } else if (!sel.rangeCount || !App.inEditor(sel.anchorNode)) {
            var r = document.createRange();
            r.selectNodeContents(editor.firstElementChild || editor);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
        }
        return getSelection();
    };

    App.range = function () {
        var sel = getSelection();
        if (sel.rangeCount && App.inEditor(sel.anchorNode)) return sel.getRangeAt(0);
        return App.savedRange;
    };

    App.closestInEditor = function (node, selector) {
        if (!node) return null;
        var el = node.nodeType === 1 ? node : node.parentNode;
        var found = el && el.closest ? el.closest(selector) : null;
        return found && editor.contains(found) && found !== editor ? found : null;
    };

    /** Blok teks paling dalam yang tersentuh seleksi. */
    App.selectedBlocks = function () {
        var r = App.range();
        if (!r) return [];
        var start = App.closestInEditor(r.startContainer, BLOCK_SEL);
        var end = App.closestInEditor(r.endContainer, BLOCK_SEL);
        if (!start) {
            var c = r.startContainer.nodeType === 1 ? r.startContainer.childNodes[r.startOffset] : null;
            start = c && c.nodeType === 1 ? (c.matches(BLOCK_SEL) ? c : c.querySelector(BLOCK_SEL)) : null;
        }
        if (!start) return [];
        if (!end || start === end) return [start];
        var all = SO.$$(BLOCK_SEL, editor).filter(function (el) {
            return !el.querySelector('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,table') && !el.closest('[contenteditable="false"]');
        });
        var out = [];
        var on = false;
        all.forEach(function (el) {
            if (el === start || el.contains(start)) on = true;
            if (on) out.push(el);
            if (el === end || el.contains(end)) on = false;
        });
        return out.length ? out : [start];
    };

    // ============================================================ history
    function takeSnap() {
        return { html: SDLayout.cleanHtml(editor), sel: SDLayout.saveSelection(editor), notes: JSON.stringify(App.notes), comments: JSON.stringify(App.comments), settings: JSON.stringify(App.settings) };
    }
    App.takeSnap = takeSnap;

    function restoreSnap(snap) {
        editor.innerHTML = snap.html;
        App.notes = JSON.parse(snap.notes || '[]');
        App.comments = JSON.parse(snap.comments || '[]');
        App.settings = Object.assign(defaultSettings(), JSON.parse(snap.settings || '{}'));
        App.deselectImage();
        App.layoutNow();
        editor.focus({ preventScroll: true });
        SDLayout.restoreSelection(editor, snap.sel);
        App.lastSnap = snap;
        App.afterChange(true);
        if (App.cmd.renderComments) App.cmd.renderComments();
        App.scrollCaretIntoView();
    }

    App.history = new SO.History({
        limit: 100,
        onChange: function () {
            if (App.shell) App.shell.setHistory(App.history.canUndo(), App.history.canRedo());
            if (App.ribbon) {
                App.ribbon.setDisabled('undo', !App.history.canUndo());
                App.ribbon.setDisabled('redo', !App.history.canRedo());
            }
        }
    });

    var typingSnapTimer = null;
    var pendingTypingMerge = null;

    App.flushTyping = function () {
        if (typingSnapTimer) {
            clearTimeout(typingSnapTimer);
            typingSnapTimer = null;
            App.commitRecordChange(pendingTypingMerge);
            pendingTypingMerge = null;
        }
    };

    App.recordChange = function (merge) {
        if (merge === 'typing') {
            pendingTypingMerge = merge;
            if (typingSnapTimer) clearTimeout(typingSnapTimer);
            typingSnapTimer = setTimeout(function () {
                typingSnapTimer = null;
                App.commitRecordChange(merge);
                pendingTypingMerge = null;
            }, 250);
            return;
        }
        App.flushTyping();
        App.commitRecordChange(merge);
    };

    App.commitRecordChange = function (merge) {
        var before = App.lastSnap;
        var after = takeSnap();
        if (before && before.html === after.html && before.notes === after.notes && before.comments === after.comments && before.settings === after.settings) {
            App.lastSnap.sel = after.sel;
            return;
        }
        App.lastSnap = after;
        if (!before) return;
        App.history.push({
            merge: merge || null,
            size: before.html.length + after.html.length,
            undo: function () { restoreSnap(before); },
            redo: function () { restoreSnap(after); },
            after: after
        });
        // Entri gabungan (mengetik) harus membuka ke status TERAKHIR saat redo.
        var top = App.history.undoStack[App.history.undoStack.length - 1];
        if (top && top.after && top.after !== after && merge && top.merge === merge) {
            top.redo = function () { restoreSnap(after); };
        }
    };

    /** Menjalankan perubahan terprogram sebagai satu langkah undo. */
    App.change = function (fn, opts) {
        opts = opts || {};
        if (App.readOnly && !opts.allowReadOnly) { SO.toast('d_readonly_on', { type: 'warn' }); return; }
        if (!App.lastSnap) App.lastSnap = takeSnap();
        var r = fn();
        App.afterChange(false, opts.merge);
        return r;
    };

    App.afterChange = function (fromHistory, merge) {
        App.scheduleLayout(merge === 'typing');
        if (!fromHistory) App.recordChange(merge);
        if (App.session) App.session.markDirty();
        App.updateStateSoon();
    };

    App.undo = function () { App.flushTyping(); App.history.undo(); };
    App.redo = function () { App.flushTyping(); App.history.redo(); };

    // ============================================================= images
    App.insertImageFiles = function (files) {
        files = Array.prototype.filter.call(files || [], function (f) { return /^image\//.test(f.type); });
        if (!files.length) return Promise.resolve();
        var busy = SO.busy('d_inserting_image');
        var g = App.geometry();
        return Promise.all(files.map(function (f) { return SO.prepareImage(f, 2000); })).then(function (list) {
            busy.done();
            App.restoreRange();
            var html = list.map(function (res) {
                var rec = App.assets.addDataUrl(res.dataUrl);
                var w = res.width ? Math.min(res.width, g.contentW) : Math.round(g.contentW / 2);
                return '<img src="' + rec.url + '" data-asset="' + rec.id + '" alt="" style="width:' + Math.round(w) + 'px">';
            }).join('');
            App.change(function () { document.execCommand('insertHTML', false, html); });
        }).catch(function (err) { busy.done(); SO.toast(err.message || 'c_err_image', { type: 'error' }); });
    };

    /** Mengubah semua <img> data:/eksternal di editor menjadi aset sesi. */
    App.adoptImages = function (root) {
        SO.$$('img', root || editor).forEach(function (img) {
            var src = img.getAttribute('src') || '';
            var assetRef = /^asset:(.+)$/.exec(src);
            if (assetRef) {
                var id = assetRef[1];
                var url = App.assets.url(id);
                if (url) { img.src = url; img.setAttribute('data-asset', id); } else img.remove();
                return;
            }
            if (/^data:image\//.test(src)) {
                var rec = App.assets.addDataUrl(src);
                if (rec) { img.src = rec.url; img.setAttribute('data-asset', rec.id); }
                return;
            }
            if (/^blob:/.test(src)) {
                var existing = App.assets.get(src);
                if (existing) img.setAttribute('data-asset', existing.id);
            }
        });
    };

    App.selectImage = function (img) {
        if (App.selectedImg && App.selectedImg !== img) App.selectedImg.classList.remove('is-selected');
        App.selectedImg = img;
        img.classList.add('is-selected');
        var sel = getSelection();
        var r = document.createRange();
        r.selectNode(img);
        sel.removeAllRanges();
        sel.addRange(r);
        App.updateOverlay();
        App.updateState();
    };

    App.deselectImage = function () {
        if (!App.selectedImg) return;
        App.selectedImg.classList.remove('is-selected');
        App.selectedImg = null;
        App.updateOverlay();
        App.updateState();
    };

    App.updateOverlay = function () {
        var box = overlay.querySelector('.sd-imgsel');
        var img = App.selectedImg;
        if (!img || !img.isConnected) {
            if (box) box.remove();
            if (img && !img.isConnected) App.selectedImg = null;
            return;
        }
        if (!box) {
            box = SO.el('div', { class: 'sd-imgsel' });
            ['nw', 'ne', 'sw', 'se', 'e', 's'].forEach(function (h) {
                var hd = SO.el('div', { class: 'sd-h', dataset: { h: h } });
                hd.addEventListener('pointerdown', startImageResize);
                box.appendChild(hd);
            });
            box.appendChild(SO.el('div', { class: 'sd-size' }));
            overlay.appendChild(box);
        }
        var cr = canvas.getBoundingClientRect();
        var r = img.getBoundingClientRect();
        box.style.left = ((r.left - cr.left) / App.zoom) + 'px';
        box.style.top = ((r.top - cr.top) / App.zoom) + 'px';
        box.style.width = (r.width / App.zoom) + 'px';
        box.style.height = (r.height / App.zoom) + 'px';
        box.querySelector('.sd-size').textContent = Math.round(r.width / App.zoom) + ' × ' + Math.round(r.height / App.zoom) + ' px';
    };

    function startImageResize(e) {
        var img = App.selectedImg;
        if (!img) return;
        e.preventDefault();
        e.stopPropagation();
        var handle = e.currentTarget.dataset.h;
        var startX = e.clientX, startY = e.clientY;
        var r = img.getBoundingClientRect();
        var w0 = r.width / App.zoom, h0 = r.height / App.zoom;
        var ratio = w0 / Math.max(1, h0);
        var maxW = App.geometry().contentW;
        if (!App.lastSnap) App.lastSnap = takeSnap();
        e.currentTarget.setPointerCapture(e.pointerId);
        function move(ev) {
            var dx = (ev.clientX - startX) / App.zoom;
            var dy = (ev.clientY - startY) / App.zoom;
            var w = w0, h = h0;
            if (handle === 'e') w = w0 + dx;
            else if (handle === 's') h = h0 + dy;
            else {
                var sx = handle.indexOf('w') !== -1 ? -dx : dx;
                w = w0 + sx;
                if (!ev.shiftKey) h = w / ratio; else h = h0 + (handle.indexOf('n') !== -1 ? -dy : dy);
            }
            w = SO.clamp(w, 16, maxW);
            h = SO.clamp(h, 16, 4000);
            img.style.width = Math.round(w) + 'px';
            if (handle === 's' || handle === 'e' || ev.shiftKey) img.style.height = Math.round(handle === 'e' ? h0 : h) + 'px';
            else img.style.height = '';
            App.updateOverlay();
        }
        function up() {
            e.target.removeEventListener('pointermove', move);
            e.target.removeEventListener('pointerup', up);
            e.target.removeEventListener('pointercancel', up);
            App.afterChange();
        }
        e.target.addEventListener('pointermove', move);
        e.target.addEventListener('pointerup', up);
        e.target.addEventListener('pointercancel', up);
    }

    // ================================================================ paste
    function handlePaste(e) {
        if (App.readOnly) { e.preventDefault(); return; }
        var cd = e.clipboardData;
        if (!cd) return;
        var files = Array.prototype.slice.call(cd.files || []).filter(function (f) { return /^image\//.test(f.type); });
        var html = cd.getData('text/html');
        var text = cd.getData('text/plain');
        if (files.length && !html) {
            e.preventDefault();
            App.insertImageFiles(files);
            return;
        }
        e.preventDefault();
        if (App.pastePlainNext || (!html && text)) {
            App.pastePlainNext = false;
            var lines = (text || '').replace(/\r\n?/g, '\n');
            App.change(function () {
                if (lines.indexOf('\n') === -1) document.execCommand('insertText', false, lines);
                else document.execCommand('insertHTML', false, SDIO.textToHtml(lines));
            });
            return;
        }
        if (html) {
            var clean = SDIO.sanitize(html, { trusted: /class="sd-/.test(html) });
            var tmp = document.createElement('div');
            tmp.innerHTML = clean;
            App.adoptImages(tmp);
            App.change(function () {
                document.execCommand('insertHTML', false, tmp.innerHTML || SO.esc(text));
            });
            if (tmp.querySelector('.sd-eq') && App.cmd.renderEquations) App.cmd.renderEquations();
        }
    }

    function handleDrop(e) {
        var files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        var imgs = Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type); });
        if (!imgs.length) {
            var docFile = files[0];
            if (/\.(docx|txt|md|html?|sinedoc)$/i.test(docFile.name)) {
                e.preventDefault();
                App.cmd.importFile(docFile);
            }
            return;
        }
        e.preventDefault();
        var pos = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
        if (!pos && document.caretPositionFromPoint) {
            var cp = document.caretPositionFromPoint(e.clientX, e.clientY);
            if (cp) { pos = document.createRange(); pos.setStart(cp.offsetNode, cp.offset); }
        }
        if (pos && App.inEditor(pos.startContainer)) {
            var sel = getSelection();
            sel.removeAllRanges();
            sel.addRange(pos);
            App.rememberRange();
        }
        App.insertImageFiles(imgs);
    }

    // ============================================================ keyboard
    App.shortcuts = {};
    App.bindKey = function (combo, fn) { combo.split(' / ').forEach(function (c) { App.shortcuts[c] = fn; }); };

    function onKeydown(e) {
        if (SO.isDialogOpen() || (App.backstage && App.backstage.isOpen())) return;
        var combo = SO.onKeyCombo(e);
        var fn = App.shortcuts[combo];
        if (fn) {
            var inEditor = App.inEditor(document.activeElement) || document.activeElement === document.body;
            var global_ = /^(Mod\+(S|P|O|N|F1)|Mod\+Shift\+S|F1|Escape)$/.test(combo);
            if (inEditor || global_) {
                if (fn(e) !== false) { e.preventDefault(); e.stopPropagation(); }
                return;
            }
        }
        if (!App.inEditor(e.target)) return;

        if (App.selectedImg && (e.key === 'Delete' || e.key === 'Backspace')) {
            e.preventDefault();
            var img = App.selectedImg;
            App.deselectImage();
            App.change(function () { img.remove(); });
            return;
        }
        if (App.selectedImg && e.key.length === 1 && !SO.mod(e)) App.deselectImage();

        if (e.key === 'Tab' && !e.altKey && !SO.mod(e)) {
            var r = App.range();
            var cell = r && App.closestInEditor(r.startContainer, 'td,th');
            var li = r && App.closestInEditor(r.startContainer, 'li');
            e.preventDefault();
            if (cell) { App.cmd.tableTab(cell, e.shiftKey); return; }
            if (li) { App.change(function () { document.execCommand(e.shiftKey ? 'outdent' : 'indent'); }); return; }
            if (!e.shiftKey) App.change(function () { document.execCommand('insertText', false, '\t'); });
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey && !SO.mod(e)) {
            var rr = App.range();
            var pre = rr && App.closestInEditor(rr.startContainer, 'pre');
            if (pre) { e.preventDefault(); App.change(function () { document.execCommand('insertText', false, '\n'); }); return; }
        }
        if (App.readOnly && !e.ctrlKey && !e.metaKey && (e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete')) {
            e.preventDefault();
        }
    }

    // ============================================================== events
    function onInput(e) {
        if (App.composing) return;
        fixAfterInput(e);
        var type = e.inputType || '';
        var merge = /^insertText|^deleteContent|^deleteWord|^insertReplacementText/.test(type) ? 'typing' : null;
        App.scheduleLayout();
        App.recordChange(merge);
        if (App.session) App.session.markDirty();
        App.updateStateSoon();
        if (App.cmd.onEditorInput) App.cmd.onEditorInput();
    }

    function fixAfterInput(e) {
        // Ukuran huruf yang dipilih saat seleksi kosong (lihat cmds.fontSize).
        if (App.pendingFontSize) {
            SO.$$('span[style*="xxx-large"], font[size="7"]', editor).forEach(function (el) {
                el.style.fontSize = App.pendingFontSize;
                el.removeAttribute('size');
            });
        }
        if (e && e.inputType === 'insertParagraph') {
            var r = App.range();
            var li = r && App.closestInEditor(r.startContainer, 'ul.sd-checklist > li');
            if (li && !li.textContent.trim()) li.setAttribute('data-checked', 'false');
            // Blok baru mewarisi atribut dorongan halaman dari blok yang dipecah.
            SO.$$('[data-sd-push]', editor).forEach(function (el) {
                if (el.previousElementSibling && el.previousElementSibling.getAttribute('data-sd-push') !== null && el.previousElementSibling.style.marginTop === el.style.marginTop) {
                    el.style.marginTop = el.getAttribute('data-sd-mt') || '';
                    el.removeAttribute('data-sd-push');
                    el.removeAttribute('data-sd-mt');
                }
            });
            var block = r && App.closestInEditor(r.startContainer, 'p,h1,h2,h3,h4');
            if (block && block.previousElementSibling && /^H[1-4]$/.test(block.previousElementSibling.tagName) && /^H[1-4]$/.test(block.tagName) && !block.textContent.trim()) {
                // Enter di akhir judul → paragraf Normal (perilaku Word).
                var p = document.createElement('p');
                p.innerHTML = '<br>';
                block.replaceWith(p);
                var rng = document.createRange();
                rng.setStart(p, 0);
                rng.collapse(true);
                getSelection().removeAllRanges();
                getSelection().addRange(rng);
            }
        }
    }

    var stateQueued = false;
    App.updateStateSoon = function () {
        if (stateQueued) return;
        stateQueued = true;
        requestAnimationFrame(function () { stateQueued = false; App.updateState(); });
    };
    App.updateState = function () { if (App.cmd.updateRibbon) App.cmd.updateRibbon(); };

    function onSelectionChange() {
        var sel = getSelection();
        if (!sel.rangeCount || !App.inEditor(sel.anchorNode)) return;
        App.rememberRange();
        if (App.lastSnap && !App.composing) App.lastSnap.sel = SDLayout.saveSelection(editor);
        if (App.selectedImg) {
            var r = sel.getRangeAt(0);
            var node = r.startContainer.childNodes ? r.startContainer.childNodes[r.startOffset] : null;
            if (node !== App.selectedImg) App.deselectImage();
        }
        App.updateStateSoon();
        App.updateStatusSoon();
    }

    function onClick(e) {
        var t = e.target;
        if (t.tagName === 'IMG' && App.inEditor(t)) { App.selectImage(t); return; }
        var li = t.closest && t.closest('ul.sd-checklist > li');
        if (li && App.inEditor(li)) {
            var lr = li.getBoundingClientRect();
            if (e.clientX - lr.left < 22 * App.zoom) {
                App.change(function () { li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true'); });
                return;
            }
        }
        var tocRow = t.closest && t.closest('.sd-toc-row');
        if (tocRow) { App.cmd.gotoHeading(tocRow.getAttribute('data-target')); return; }
        var a = t.closest && t.closest('a[href]');
        if (a && App.inEditor(a) && (SO.mod(e) || App.readOnly)) { global.open(a.href, '_blank', 'noopener'); return; }
        var cm = t.closest && t.closest('.sd-comment');
        if (cm && App.cmd.focusComment) App.cmd.focusComment(cm.getAttribute('data-cid'), false);
        var fn = t.closest && t.closest('.sd-fn');
        if (fn && App.cmd.editNote) { App.cmd.editNote(fn.getAttribute('data-fn')); return; }
        var eq = t.closest && t.closest('.sd-eq');
        if (eq && App.cmd.equation) { App.cmd.equation(eq); return; }
        if (App.painter && App.cmd.applyPainter) setTimeout(App.cmd.applyPainter, 0);
    }

    App.scrollCaretIntoView = function () {
        var sel = getSelection();
        if (!sel.rangeCount) return;
        var r = sel.getRangeAt(0).getBoundingClientRect();
        if (!r || (!r.top && !r.bottom)) {
            var n = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentNode);
            if (n && n.getBoundingClientRect) r = n.getBoundingClientRect(); else return;
        }
        var sr = scroller.getBoundingClientRect();
        if (r.top < sr.top + 40) scroller.scrollTop += r.top - sr.top - 60;
        else if (r.bottom > sr.bottom - 30) scroller.scrollTop += r.bottom - sr.bottom + 60;
    };

    App.scrollToElement = function (el) {
        var sr = scroller.getBoundingClientRect();
        var r = el.getBoundingClientRect();
        scroller.scrollTo({ top: scroller.scrollTop + r.top - sr.top - 80, behavior: 'smooth' });
    };

    // ============================================================ status
    var statusQueued = false;
    App.updateStatusSoon = function () {
        if (statusQueued) return;
        statusQueued = true;
        setTimeout(function () { statusQueued = false; App.updateStatus(); }, 120);
    };

    App.countWords = function (text) {
        text = text || '';
        if (global.Intl && Intl.Segmenter) {
            try {
                var seg = new Intl.Segmenter(SO.locale(), { granularity: 'word' });
                var n = 0;
                for (var s of seg.segment(text)) if (s.isWordLike) n++;
                return n;
            } catch (e) {}
        }
        var m = text.match(/[一-鿿]|[^\s一-鿿]+/g);
        return m ? m.length : 0;
    };

    App.plainText = function () {
        var clone = editor.cloneNode(true);
        SDLayout.cleanNode(clone);
        SO.$$('.sd-toc, .sd-notes, del.sd-del, .sd-page-break', clone).forEach(function (n) { n.remove(); });
        return SDIO.htmlToText(clone);
    };

    App.currentPage = function () {
        var sel = getSelection();
        var g = App.geometry();
        var y = null;
        if (sel.rangeCount && App.inEditor(sel.anchorNode)) {
            var rect = sel.getRangeAt(0).getBoundingClientRect();
            if (rect && (rect.top || rect.bottom)) y = (rect.top - editor.getBoundingClientRect().top) / App.zoom;
        }
        if (y === null) {
            y = (scroller.scrollTop + scroller.clientHeight / 3 - stage.offsetTop) / App.zoom - g.mT;
        }
        return SO.clamp(Math.floor(y / g.pitch) + 1, 1, App.pageCount);
    };

    // Jumlah kata hanya dihitung ulang bila isi editor benar-benar berubah.
    // updateStatus dipanggil tiap 120 ms selama menggulir dan setiap kali kursor
    // bergerak; dulu setiap panggilan mengklon + menyegmentasi seluruh dokumen
    // (dokumen 190 halaman ±200 ms), sehingga gulir dan ketik tersendat.
    var textVersion = 0;
    var wordsCache = { v: -1, n: 0, pending: -1 };
    var selCache = { v: -1, an: null, ao: 0, fn: null, fo: 0, n: 0 };
    var textObserver = new MutationObserver(function () { textVersion++; });
    textObserver.observe(editor, { childList: true, characterData: true, subtree: true });

    // Dokumen besar: segmentasi kata (Intl.Segmenter ±90 ms per 100 ribu kata di
    // laptop, berkali lipat di HP) dikerjakan di Worker. Selama menunggu, status
    // bar menampilkan hitungan sebelumnya.
    var wcWorker = null, wcDone = null;
    function countWordsOffThread(text, done) {
        if (text.length < 20000 || !global.Worker || !global.Intl || !Intl.Segmenter) return done(App.countWords(text));
        try {
            if (!wcWorker) {
                var src = 'onmessage=function(e){var d=e.data,n=0;try{var s=new Intl.Segmenter(d.loc,{granularity:"word"});' +
                    'for(var x of s.segment(d.text))if(x.isWordLike)n++;}catch(err){var m=d.text.match(/[\\u4e00-\\u9fff]|[^\\s\\u4e00-\\u9fff]+/g);n=m?m.length:0;}' +
                    'postMessage(n);};';
                var url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
                wcWorker = new Worker(url);
                URL.revokeObjectURL(url);
                wcWorker.onmessage = function (e) { var f = wcDone; wcDone = null; if (f) f(e.data); };
                wcWorker.onerror = function () { wcWorker = null; var f = wcDone; wcDone = null; if (f) f(App.countWords(App.plainText())); };
            }
            wcDone = done; // hanya permintaan terakhir yang ditunggu
            wcWorker.postMessage({ text: text, loc: SO.locale() });
        } catch (e) {
            done(App.countWords(text));
        }
    }

    App.updateStatus = function () {
        // Perubahan di tugas yang sama (mis. loadDocument → layoutNow) belum
        // sampai ke callback observer; ambil catatannya langsung.
        if (textObserver.takeRecords().length) textVersion++;
        if (wordsCache.v !== textVersion && wordsCache.pending !== textVersion) {
            var v = textVersion, sync = true;
            wordsCache.pending = v;
            countWordsOffThread(App.plainText(), function (n) {
                if (wordsCache.pending !== v) return; // sudah ada versi yang lebih baru
                wordsCache = { v: v, n: n, pending: -1 };
                if (!sync) App.updateStatus();
            });
            sync = false;
        }
        var words = wordsCache.n;
        var sel = getSelection();
        var selWords = 0;
        if (sel.rangeCount && !sel.isCollapsed && App.inEditor(sel.anchorNode)) {
            var c = selCache;
            if (c.v !== textVersion || c.an !== sel.anchorNode || c.ao !== sel.anchorOffset || c.fn !== sel.focusNode || c.fo !== sel.focusOffset) {
                selCache = { v: textVersion, an: sel.anchorNode, ao: sel.anchorOffset, fn: sel.focusNode, fo: sel.focusOffset, n: App.countWords(sel.toString()) };
            }
            selWords = selCache.n;
        }
        // Semua pembacaan (posisi kursor) dulu, baru penulisan — dan hanya bila
        // teksnya berubah: tulis-lalu-baca memaksa reflow di setiap panggilan.
        var pageText = SO.t('d_status_page', { n: App.currentPage(), total: App.pageCount });
        setText($('#sdStPage'), pageText);
        setText($('#sdStWords'), selWords ? SO.t('d_status_words_sel', { n: selWords, total: words }) : SO.t('d_status_words', { n: words }));
        setText($('#sdStLang').querySelector('span'), { id: 'Indonesia', en: 'English', zh: '中文' }[SO.lang()]);
        if ($('#sdStTrack').hidden !== !App.track) $('#sdStTrack').hidden = !App.track;
        App.wordCount = words;
    };
    function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }

    // ============================================================= ruler
    App.drawRuler = function () {
        var wrap = $('#sdRulerWrap');
        var ruler = $('#sdRuler');
        if (wrap.classList.contains('is-hidden') || wrap.offsetParent === null) return;
        var g = App.geometry();
        var z = App.zoom;
        var width = g.pageW * z;
        var left = stage.offsetLeft - scroller.scrollLeft;
        ruler.style.left = left + 'px';
        ruler.style.width = width + 'px';
        var cv = ruler.querySelector('canvas');
        var dpr = global.devicePixelRatio || 1;
        if (!cv) { cv = document.createElement('canvas'); ruler.appendChild(cv); }
        cv.width = Math.round(width * dpr);
        cv.height = Math.round(18 * dpr);
        cv.style.width = width + 'px';
        cv.style.height = '18px';
        var ctx = cv.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#d4d4d4';
        ctx.fillRect(0, 0, width, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(g.mL * z, 0, g.contentW * z, 18);
        ctx.strokeStyle = '#8a8886';
        ctx.fillStyle = '#605e5c';
        ctx.font = '9px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        var cmPx = 37.795 * z;
        var origin = g.mL * z;
        ctx.beginPath();
        for (var k = -Math.floor(origin / (cmPx / 4)); k * cmPx / 4 + origin <= width; k++) {
            var x = Math.round(origin + k * cmPx / 4) + 0.5;
            if (x < 0) continue;
            if (k % 4 === 0) {
                var cm = Math.abs(k / 4);
                var step = cmPx >= 22 ? 1 : cmPx >= 11 ? 2 : 5;
                if (k !== 0 && cm % step === 0) ctx.fillText(String(cm), x, 13);
                else if (k !== 0) { ctx.moveTo(x, 6); ctx.lineTo(x, 12); }
            } else if (cmPx >= 14 || k % 2 === 0) {
                var len = k % 2 === 0 ? 5 : 3;
                ctx.moveTo(x, 9 - len / 2);
                ctx.lineTo(x, 9 + len / 2);
            }
        }
        ctx.stroke();
        // Penanda indentasi paragraf aktif.
        SO.$$('.sd-ruler-marker', ruler).forEach(function (m) { m.remove(); });
        var blocks = App.selectedBlocks();
        var b = blocks[0];
        if (!b || b.closest('td,th')) return;
        var cs = getComputedStyle(b);
        var ml = parseFloat(cs.marginLeft) || 0;
        var ti = parseFloat(cs.textIndent) || 0;
        var mr = parseFloat(cs.marginRight) || 0;
        if (b.tagName === 'LI') {
            var list = b.parentNode;
            ml += parseFloat(getComputedStyle(list).paddingLeft) || 0;
        }
        var mk = function (cls, px, prop) {
            var m = SO.el('div', { class: 'sd-ruler-marker ' + cls, style: { left: px + 'px' }, 'data-tip': 'd_ruler_' + prop });
            m.addEventListener('pointerdown', function (ev) { startRulerDrag(ev, m, prop, blocks); });
            ruler.appendChild(m);
        };
        mk('is-first', (g.mL + ml + ti) * z, 'first');
        mk('is-left', (g.mL + ml) * z, 'left');
        mk('is-right', (g.mL + g.contentW - mr) * z, 'right');
    };

    function startRulerDrag(e, marker, prop, blocks) {
        e.preventDefault();
        var g = App.geometry();
        var ruler = $('#sdRuler');
        var rr = ruler.getBoundingClientRect();
        marker.setPointerCapture(e.pointerId);
        var guide = SO.el('div', { class: 'sd-ruler-guide' });
        scroller.appendChild(guide);
        if (!App.lastSnap) App.lastSnap = takeSnap();
        function valueAt(ev) {
            var x = (ev.clientX - rr.left) / App.zoom - g.mL;
            return Math.round(x / 9.45) * 9.45; // 0,25 cm
        }
        var measured = null;
        function move(ev) {
            var v = valueAt(ev);
            marker.style.left = ((g.mL + v) * App.zoom) + 'px';
            guide.style.left = (ev.clientX - scroller.getBoundingClientRect().left + scroller.scrollLeft) + 'px';
            guide.style.top = scroller.scrollTop + 'px';
            guide.style.height = scroller.clientHeight + 'px';
            // Padding daftar & margin kiri tidak berubah selama menyeret: dibaca
            // sekali. Dulu getComputedStyle dipanggil per paragraf SETELAH menulis
            // gaya paragraf sebelumnya → reflow per paragraf di setiap gerakan mouse.
            if (!measured) {
                measured = blocks.map(function (b) {
                    var listPad = b.tagName === 'LI' ? (parseFloat(getComputedStyle(b.parentNode).paddingLeft) || 0) : 0;
                    return { listPad: listPad, ml: (parseFloat(getComputedStyle(b).marginLeft) || 0) + listPad };
                });
            }
            blocks.forEach(function (b, bi) {
                var listPad = measured[bi].listPad;
                if (prop === 'left') {
                    var ti = parseFloat(b.style.textIndent) || 0;
                    b.style.marginLeft = Math.max(0, Math.round(v - listPad)) + 'px';
                    b.style.textIndent = ti ? ti + 'px' : '';
                } else if (prop === 'first') {
                    b.style.textIndent = Math.round(v - measured[bi].ml) + 'px';
                } else {
                    b.style.marginRight = Math.max(0, Math.round(g.contentW - v)) + 'px';
                }
            });
        }
        function up() {
            marker.removeEventListener('pointermove', move);
            marker.removeEventListener('pointerup', up);
            guide.remove();
            App.afterChange();
            App.drawRuler();
        }
        marker.addEventListener('pointermove', move);
        marker.addEventListener('pointerup', up);
    }

    // ===================================================== serialization
    App.serialize = function () {
        var clone = editor.cloneNode(true);
        SDLayout.cleanNode(clone);
        var ids = [];
        SO.$$('img', clone).forEach(function (img) {
            var rec = App.assets.get(img.getAttribute('data-asset')) || App.assets.get(img.getAttribute('src'));
            if (rec) {
                img.setAttribute('src', 'asset:' + rec.id);
                img.setAttribute('data-asset', rec.id);
                if (ids.indexOf(rec.id) === -1) ids.push(rec.id);
            }
        });
        // Rumus disimpan sebagai LaTeX saja; KaTeX menggambar ulang saat dibuka.
        SO.$$('.sd-eq', clone).forEach(function (eq) { eq.textContent = eq.getAttribute('data-latex') || eq.textContent; });
        // Catatan kaki yang rujukannya sudah dihapus tidak ikut disimpan.
        var usedNotes = SO.$$('.sd-fn', clone).map(function (n) { return n.getAttribute('data-fn'); });
        var usedComments = SO.$$('.sd-comment', clone).map(function (n) { return n.getAttribute('data-cid'); });
        var hfHtml = JSON.stringify(App.settings.hf || {});
        return App.assets.exportMap(ids).then(function (map) {
            return {
                app: 'sinedoc', version: 1,
                html: clone.innerHTML,
                assets: map,
                settings: JSON.parse(JSON.stringify(App.settings)),
                notes: App.notes.filter(function (n) { return usedNotes.indexOf(n.id) !== -1; }),
                comments: App.comments.filter(function (c) { return usedComments.indexOf(c.id) !== -1 || hfHtml.indexOf(c.id) !== -1; })
            };
        });
    };

    App.loadDocument = function (content, name) {
        App.deselectImage();
        if (typeof content === 'string') content = { html: content };
        content = content || {};
        App.assets.importMap(content.assets || {});
        App.settings = Object.assign(defaultSettings(), content.settings || {});
        App.settings.margins = Object.assign(defaultSettings().margins, (content.settings || {}).margins || {});
        App.settings.hf = Object.assign(defaultSettings().hf, (content.settings || {}).hf || {});
        App.notes = content.notes || [];
        App.comments = content.comments || [];
        App.track = false;
        var html = content.html != null ? SDIO.sanitize(content.html, { trusted: true }) : '<p><br></p>';
        editor.innerHTML = html || '<p><br></p>';
        App.adoptImages(editor);
        editor.classList.toggle('show-marks', !!App.settings.showMarks);
        editor.spellcheck = App.settings.spellcheck !== false;
        if (App.shell) App.shell.setName(name || SO.t('c_untitled'));
        editor.setAttribute('lang', App.settings.proofLang || (SO.lang() === 'zh' ? 'zh-CN' : SO.lang()));
        if (App.cmd.renderEquations) App.cmd.renderEquations();
        if (App.cmd.renderToc) SO.$$('.sd-toc', editor).forEach(function (t) { App.cmd.renderToc(t); });
        App.layoutNow();
        if (App.cmd.renderNotes) App.cmd.renderNotes();
        App.history.clear();
        App.lastSnap = takeSnap();
        if (App.cmd.renderComments) App.cmd.renderComments();
        scroller.scrollTop = 0;
        var r = document.createRange();
        var first = editor.querySelector('p,h1,h2,h3,h4,li,td') || editor;
        r.selectNodeContents(first);
        r.collapse(true);
        var sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        App.rememberRange();
        App.updateState();
        App.updateStatus();
    };

    // ============================================================= wiring
    App.initEditor = function () {
        try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
        try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
        editor.setAttribute('data-placeholder', SO.t('d_placeholder'));
        editor.addEventListener('input', onInput);
        editor.addEventListener('keydown', onKeydown);
        document.addEventListener('keydown', function (e) { if (!App.inEditor(e.target)) onKeydown(e); });
        editor.addEventListener('paste', handlePaste);
        editor.addEventListener('drop', handleDrop);
        editor.addEventListener('click', onClick);
        editor.addEventListener('compositionstart', function () { App.composing = true; });
        editor.addEventListener('compositionend', function () {
            App.composing = false;
            App.scheduleLayout();
            App.recordChange('typing');
            if (App.session) App.session.markDirty();
        });
        editor.addEventListener('beforeinput', function (e) {
            if (e.inputType === 'historyUndo') { e.preventDefault(); App.undo(); return; }
            if (e.inputType === 'historyRedo') { e.preventDefault(); App.redo(); return; }
            if (App.readOnly) { e.preventDefault(); return; }
            if (App.cmd.trackBeforeInput) App.cmd.trackBeforeInput(e);
        });
        editor.addEventListener('dragover', function (e) {
            if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1) e.preventDefault();
        });
        editor.addEventListener('mousedown', function (e) {
            if (e.target.tagName === 'IMG') {
                // Jangan biarkan peramban memulai seret gambar bawaan.
                e.preventDefault();
                App.selectImage(e.target);
            }
        });
        editor.addEventListener('contextmenu', function (e) { if (App.cmd.contextMenu) App.cmd.contextMenu(e); });
        // Gambar yang selesai dimuat SETELAH halaman dihitung (buka dokumen, undo,
        // gambar dari URL) mengubah tinggi isi — tanpa ini teks di bawahnya bisa
        // menembus batas kertas sampai pengguna mengetik lagi.
        editor.addEventListener('load', function (e) { if (e.target && e.target.tagName === 'IMG') App.scheduleLayout(); }, true);
        editor.addEventListener('error', function (e) { if (e.target && e.target.tagName === 'IMG') App.scheduleLayout(); }, true);
        document.addEventListener('selectionchange', onSelectionChange);
        scroller.addEventListener('scroll', SO.throttleFrame(function () {
            App.drawRuler();
            App.updateStatusSoon();
        }));
        scroller.addEventListener('wheel', function (e) {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            App.setZoom(App.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
        }, { passive: false });
        scroller.addEventListener('mousedown', function (e) {
            // Klik di area abu-abu/margin → taruh kursor di akhir baris terdekat.
            if (e.target === scroller || e.target === stage || e.target === canvas) {
                if (App.selectedImg) App.deselectImage();
                editor.focus({ preventScroll: true });
            }
        });
        global.addEventListener('resize', SO.debounce(function () {
            applyZoomFrame(App.geometry());
            App.drawRuler();
            App.updateOverlay();
        }, 100));
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { App.scheduleLayout(); });
        if (document.fonts) document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', function () { App.scheduleLayout(); });

        $('#sdZoomRange').addEventListener('input', function (e) { App.setZoom(+e.target.value / 100); });
        $('#sdZoomIn').addEventListener('click', function () { App.setZoom(App.zoom + 0.1); });
        $('#sdZoomOut').addEventListener('click', function () { App.setZoom(App.zoom - 0.1); });
        $('#sdZoomVal').addEventListener('click', function () { App.cmd.zoomDialog(); });
        $('#sdStWords').addEventListener('click', function () { App.cmd.wordCount(); });
        $('#sdStPage').addEventListener('click', function () { App.cmd.gotoPage(); });
        $('#sdStFocus').addEventListener('click', function () { App.cmd.focusMode(true); });
        SO.$$('.sd-pane-close').forEach(function (b) {
            b.addEventListener('click', function () { App.cmd.togglePane(b.getAttribute('data-close'), false); });
        });
        SO.onLang(function () {
            editor.setAttribute('data-placeholder', SO.t('d_placeholder'));
            SO.$$('.sd-page-break', editor).forEach(function (pb) { pb.setAttribute('data-label', SO.t('d_page_break')); });
            App.updateStatus();
            if (App.cmd.renderComments) App.cmd.renderComments();
            if (App.cmd.renderNav) App.cmd.renderNav();
        });
    };

    var savedZoom = 1;
    try { savedZoom = parseFloat(localStorage.getItem('sd_zoom')) || 1; } catch (e) {}
    if (savedZoom < 0.3) savedZoom = 1;
    App.initialZoom = savedZoom;
})(window);
