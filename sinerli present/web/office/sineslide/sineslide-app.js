/**
 * Sinerli Present — status aplikasi: dek aktif, slide & seleksi, riwayat, panel
 * thumbnail, kanvas & zoom, catatan pembicara, tampilan (normal/penyortir/
 * baca), status bar, dan serialisasi.
 */
(function (global) {
    'use strict';

    var M = global.SSM, R = global.SSR;
    var $ = SO.$;

    var App = global.SineSlide = {
        deck: null,
        cur: 0,
        sel: [],
        editing: null,
        view: 'normal',
        zoom: 1,
        fitMode: true,
        cmd: {},
        assets: new SO.Assets(),
        el: {
            workspace: $('#ssWorkspace'), panel: $('#ssSlidePanel'), list: $('#ssSlideList'), main: $('#ssMain'),
            wrap: $('#ssCanvasWrap'), stage: $('#ssStage'), host: $('#ssSlideHost'), overlay: $('#ssOverlay'),
            notes: $('#ssNotes'), notesText: $('#ssNotesText'), notesResize: $('#ssNotesResize'), sorter: $('#ssSorter'),
            pane: $('#ssPane'), paneTitle: $('#ssPaneTitle'), paneBody: $('#ssPaneBody')
        }
    };
    R.assets = App.assets;

    App.history = new SO.History({
        limit: 200,
        onChange: function () {
            if (App.shell) App.shell.setHistory(App.history.canUndo(), App.history.canRedo());
            if (App.ribbon) { App.ribbon.setDisabled('undo', !App.history.canUndo()); App.ribbon.setDisabled('redo', !App.history.canRedo()); }
        }
    });

    App.slide = function () { return App.deck.slides[App.cur]; };
    App.elById = function (id, slide) { return M.findEl(slide || App.slide(), id); };
    App.selected = function () {
        var s = App.slide();
        return App.sel.map(function (id) { return M.findEl(s, id); }).filter(Boolean);
    };
    App.pal = function () { return R.pal(App.deck); };

    // ============================================================ riwayat
    App._snap = '';
    function snapshot() { return JSON.stringify(App.deck); }

    /**
     * Mengubah dek dengan riwayat undo. opts: {merge, render:'slide'|'all'|'thumbs'|'none', slides:[index]}
     */
    App.change = function (label, fn, opts) {
        opts = opts || {};
        var before = App._snap || snapshot();
        var curId = App.slide() ? App.slide().id : null;
        var selBefore = App.sel.slice();
        fn();
        var after = snapshot();
        if (after === before) { App.afterChange(opts, true); return false; }
        App._snap = after;
        var selAfter = App.sel.slice();
        var curAfter = App.slide() ? App.slide().id : null;
        App.history.push({
            label: label, merge: opts.merge, size: before.length + after.length,
            undo: function () { App.restore(before, curId, selBefore); },
            redo: function () { App.restore(after, curAfter, selAfter); }
        });
        App.afterChange(opts);
        if (App.session) App.session.markDirty();
        return true;
    };

    App.restore = function (str, slideId, sel) {
        if (App.editing && App.cmd.endEdit) App.cmd.endEdit(true);
        App.deck = JSON.parse(str);
        App._snap = str;
        var idx = slideId ? App.deck.slides.map(function (s) { return s.id; }).indexOf(slideId) : -1;
        App.cur = SO.clamp(idx >= 0 ? idx : App.cur, 0, App.deck.slides.length - 1);
        var s = App.slide();
        App.sel = (sel || []).filter(function (id) { return !!M.findEl(s, id); });
        App.renderAll();
        if (App.session) App.session.markDirty();
    };

    App.undo = function () {
        if (App.editing && App.cmd.endEdit) App.cmd.endEdit();
        App.history.undo();
    };
    App.redo = function () {
        if (App.editing && App.cmd.endEdit) App.cmd.endEdit();
        App.history.redo();
    };

    App.afterChange = function (opts, noop) {
        opts = opts || {};
        if (noop) { if (App.cmd.updateRibbon) App.cmd.updateRibbonSoon(); return; }
        var r = opts.render || 'slide';
        if (r === 'all') App.renderAll();
        else if (r === 'slide') { App.renderStage(); App.refreshThumb(App.cur); }
        else if (r === 'thumbs') { App.renderThumbs(); App.renderStage(); }
        else if (r === 'thumb') App.refreshThumbSoon(App.cur);
        if (App.cmd.updateRibbonSoon) App.cmd.updateRibbonSoon();
        App.updateStatus();
        if (App.cmd.refreshPane) App.cmd.refreshPane();
    };

    // ============================================================ render
    App.renderAll = function () {
        App.cur = SO.clamp(App.cur, 0, App.deck.slides.length - 1);
        App.renderThumbs();
        App.renderStage();
        App.syncNotes();
        App.updateStatus();
        if (App.view === 'sorter') App.renderSorter();
        if (App.cmd.updateRibbonSoon) App.cmd.updateRibbonSoon();
        if (App.cmd.refreshPane) App.cmd.refreshPane();
    };

    App.renderStage = function () {
        var s = App.slide();
        if (!s) return;
        var host = App.el.host;
        var editingId = App.editing ? App.editing.id : null;
        if (editingId) return App.drawOverlay && App.drawOverlay();
        R.mount(host, App.deck, s, { mode: 'edit', index: App.cur, scale: App.zoom });
        App.layoutStage();
        if (App.drawOverlay) App.drawOverlay();
    };

    App.layoutStage = function () {
        if (!App.deck) return;
        var W = App.deck.size.w * App.zoom, H = App.deck.size.h * App.zoom;
        var wrap = App.el.wrap;
        var padX = Math.max(24, (wrap.clientWidth - W) / 2), padY = Math.max(24, (wrap.clientHeight - H) / 2);
        Object.assign(App.el.stage.style, { width: W + 'px', height: H + 'px', margin: padY + 'px ' + padX + 'px' });
        Object.assign(App.el.host.style, { width: W + 'px', height: H + 'px' });
    };

    App.slideRect = function () { return App.el.host.getBoundingClientRect(); };
    /** Koordinat klien → koordinat slide. */
    App.toSlide = function (clientX, clientY) {
        var r = App.slideRect();
        return { x: (clientX - r.left) / App.zoom, y: (clientY - r.top) / App.zoom };
    };

    App.fitZoom = function () {
        if (!App.deck) return App.zoom;
        var wrap = App.el.wrap;
        var cw = wrap.clientWidth - 48, ch = wrap.clientHeight - 48;
        if (cw < 50 || ch < 50) return App.zoom;
        return SO.clamp(Math.min(cw / App.deck.size.w, ch / App.deck.size.h), 0.1, 4);
    };
    App.setZoom = function (z, fit) {
        App.fitMode = !!fit;
        if (!App.deck) return;
        var prev = App.zoom;
        App.zoom = SO.clamp(fit ? App.fitZoom() : z, 0.1, 4);
        if (App.editing && Math.abs(prev - App.zoom) > 0.001) {
            var node = App.el.host.firstChild;
            if (node) node.style.transform = 'scale(' + App.zoom + ')';
            App.layoutStage();
            if (App.drawOverlay) App.drawOverlay();
        } else App.renderStage();
        App.syncZoomUi();
    };
    App.syncZoomUi = function () {
        var pct = Math.round(App.zoom * 100);
        var r = $('#ssZoomRange'), v = $('#ssZoomVal'), fit = $('#ssZoomFit');
        if (r) r.value = pct;
        if (v) v.textContent = pct + '%';
        if (fit) fit.classList.toggle('is-active', App.fitMode);
    };

    // ======================================================= panel slide
    App.thumbWidth = function () { return Math.max(80, Math.min(220, App.el.list.clientWidth - 46)); };

    function thumbItem(i, width) {
        var s = App.deck.slides[i];
        var item = SO.el('div', { class: 'ss-thumb' + (i === App.cur ? ' is-current' : '') + (s.hidden ? ' is-hidden' : ''), dataset: { index: i }, role: 'option', 'aria-selected': i === App.cur ? 'true' : 'false' });
        var num = SO.el('div', { class: 'ss-thumb-num' });
        num.appendChild(SO.el('span', { text: String(i + 1) }));
        if ((s.transition && s.transition.type && s.transition.type !== 'none') || (s.anims && s.anims.length)) num.appendChild(SO.el('i', { class: 'fas fa-star', 'data-tip': 's_has_motion' }));
        if (s.comments && s.comments.length) num.appendChild(SO.el('i', { class: 'fas fa-comment', 'data-tip': 's_has_comments' }));
        item.appendChild(num);
        var frame = SO.el('div', { class: 'ss-thumb-frame' });
        frame.appendChild(R.thumb(App.deck, s, i, width || App.thumbWidth()));
        item.appendChild(frame);
        return item;
    }

    App.renderThumbs = function () {
        var list = App.el.list;
        var scroll = list.scrollTop;
        // Lebar dibaca SEKALI dan semua thumbnail dirakit di luar DOM: membaca
        // clientWidth setelah tiap sisipan memaksa reflow panel per slide (dek
        // 150 slide ±1 detik membeku di setiap undo/redo).
        var width = App.thumbWidth();
        var frag = document.createDocumentFragment();
        App.deck.slides.forEach(function (s, i) { frag.appendChild(thumbItem(i, width)); });
        list.innerHTML = '';
        list.appendChild(frag);
        R.fitText(list);
        list.scrollTop = scroll;
        App.scrollThumbIntoView();
    };
    App.refreshThumb = function (i) {
        var old = App.el.list.querySelector('.ss-thumb[data-index="' + i + '"]');
        if (!old || !App.deck.slides[i]) { App.renderThumbs(); return; }
        var item = thumbItem(i);
        old.replaceWith(item);
        R.fitText(item);
        if (App.view === 'sorter') App.renderSorter();
    };
    var thumbTimers = {};
    App.refreshThumbSoon = function (i) {
        clearTimeout(thumbTimers[i]);
        thumbTimers[i] = setTimeout(function () {
            if (!App.editing || App.deck.slides[i]) App.refreshThumb(i);
        }, 250);
    };
    App.scrollThumbIntoView = function () {
        var item = App.el.list.querySelector('.ss-thumb.is-current');
        if (!item) return;
        var list = App.el.list;
        if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop - 8;
        else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight + 8;
    };

    App.goto = function (i, opts) {
        opts = opts || {};
        if (!App.deck.slides.length) return;
        i = SO.clamp(i, 0, App.deck.slides.length - 1);
        if (App.editing && App.cmd.endEdit) App.cmd.endEdit();
        var changed = i !== App.cur;
        App.cur = i;
        if (!opts.keepSel) App.sel = [];
        SO.$$('.ss-thumb', App.el.list).forEach(function (t) {
            var on = +t.dataset.index === i;
            t.classList.toggle('is-current', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        App.scrollThumbIntoView();
        if (changed || opts.force) { App.renderStage(); App.syncNotes(); }
        App.updateStatus();
        if (App.cmd.updateRibbonSoon) App.cmd.updateRibbonSoon();
        if (App.cmd.refreshPane) App.cmd.refreshPane();
        if (App.view === 'sorter') SO.$$('.ss-sort-item', App.el.sorter).forEach(function (t) { t.classList.toggle('is-current', +t.dataset.index === i); });
    };

    // ============================================================ seleksi
    App.select = function (ids, opts) {
        opts = opts || {};
        ids = (ids || []).filter(Boolean);
        if (opts.toggle) {
            var next = App.sel.slice();
            ids.forEach(function (id) { var k = next.indexOf(id); if (k === -1) next.push(id); else next.splice(k, 1); });
            ids = next;
        } else if (opts.add) {
            ids = App.sel.concat(ids.filter(function (id) { return App.sel.indexOf(id) === -1; }));
        }
        if (App.editing && !(ids.length === 1 && ids[0] === App.editing.id) && App.cmd.endEdit) App.cmd.endEdit();
        App.sel = ids;
        if (App.drawOverlay) App.drawOverlay();
        if (App.cmd.updateRibbonSoon) App.cmd.updateRibbonSoon();
        if (App.cmd.refreshPane) App.cmd.refreshPane();
        App.updateStatus();
    };

    // ============================================================ catatan
    App.syncNotes = function () {
        var s = App.slide();
        var ta = App.el.notesText;
        if (document.activeElement !== ta) ta.value = s ? s.notes || '' : '';
    };
    App.toggleNotes = function (on) {
        var show = on === undefined ? App.el.notes.hidden : on;
        App.el.notes.hidden = !show;
        App.el.notesResize.hidden = !show;
        try { localStorage.setItem('ss_notes', show ? '1' : '0'); } catch (e) {}
        $('#ssStNotes').classList.toggle('is-active', show);
        if (App.ribbon) App.ribbon.setActive('toggleNotes', show);
        setTimeout(function () { if (App.fitMode) App.setZoom(0, true); }, 0);
    };

    // ============================================================ tampilan
    App.setView = function (view) {
        if (App.editing && App.cmd.endEdit) App.cmd.endEdit();
        App.view = view;
        var sorter = view === 'sorter';
        App.el.sorter.hidden = !sorter;
        App.el.wrap.hidden = sorter;
        App.el.notes.hidden = sorter || App.el.notes.dataset.userHidden === '1';
        App.el.notesResize.hidden = App.el.notes.hidden;
        App.el.panel.hidden = sorter;
        SO.$$('.ss-view-btn').forEach(function (b) { b.classList.toggle('is-active', b.dataset.view === view); });
        if (App.ribbon) { App.ribbon.setActive('viewNormal', view === 'normal'); App.ribbon.setActive('viewSorter', sorter); }
        if (sorter) App.renderSorter();
        else setTimeout(function () { App.setZoom(App.zoom, App.fitMode); }, 0);
    };

    App.renderSorter = function () {
        var box = App.el.sorter;
        box.innerHTML = '';
        var w = App.sorterSize || 220;
        App.deck.slides.forEach(function (s, i) {
            var item = SO.el('div', { class: 'ss-sort-item' + (i === App.cur ? ' is-current' : '') + (s.hidden ? ' is-hidden' : ''), dataset: { index: i }, draggable: 'true' });
            item.appendChild(R.thumb(App.deck, s, i, w));
            var cap = SO.el('div', { class: 'ss-sort-cap' });
            cap.appendChild(SO.el('span', { text: String(i + 1) }));
            if (s.transition && s.transition.type && s.transition.type !== 'none') cap.appendChild(SO.el('i', { class: 'fas fa-star' }));
            if (s.transition && s.transition.after) cap.appendChild(SO.el('small', { text: s.transition.after + 's' }));
            item.appendChild(cap);
            box.appendChild(item);
        });
        R.fitText(box);
    };

    // ============================================================ status
    App.updateStatus = function () {
        var el = $('#ssStSlide');
        if (!el || !App.deck) return;
        el.textContent = SO.t('s_status_slide', { n: App.cur + 1, total: App.deck.slides.length });
        var th = $('#ssStTheme');
        if (th) th.textContent = SO.t(M.themeById(App.deck.theme.id).label);
        var selEl = $('#ssStSel');
        if (selEl) selEl.textContent = App.sel.length > 1 ? SO.t('s_status_selected', { n: App.sel.length }) : '';
    };

    // ======================================================= serialisasi
    App.serialize = function () {
        if (App.editing && App.cmd.commitText) App.cmd.commitText();
        var data = M.clone(App.deck);
        return App.assets.exportMap(M.assetIds(App.deck)).then(function (map) {
            data.assets = map;
            data.cur = App.cur;
            return data;
        });
    };

    /** Memastikan dek dari berkas/versi lama punya struktur minimal. */
    App.normalize = function (deck) {
        if (!deck || !Array.isArray(deck.slides)) return null;
        var d = Object.assign(M.newDeck(), deck);
        d.size = deck.size && deck.size.w ? deck.size : { id: '16:9', w: 1280, h: 720 };
        d.theme = Object.assign({ id: 'sinerli', variant: 0 }, deck.theme || {});
        d.footer = Object.assign({ date: false, num: false, text: '', show: false, skipTitle: true }, deck.footer || {});
        d.settings = Object.assign({ loop: false, advance: 'click', showHidden: false }, deck.settings || {});
        d.slides = deck.slides.map(function (s) {
            s = Object.assign({ id: M.uid('s'), layout: 'blank', els: [], notes: '', anims: [] }, s);
            s.els = (s.els || []).filter(function (e) { return e && e.type; });
            s.els.forEach(function (e) { if (!e.id) e.id = M.uid('e'); if (e.html) e.html = M.sanitize(e.html); });
            return s;
        });
        if (!d.slides.length) d.slides.push(M.newSlide('title', d.size.w, d.size.h));
        delete d.assets;
        delete d.cur;
        return d;
    };

    App.loadDocument = function (content, name) {
        if (App.editing && App.cmd.endEdit) App.cmd.endEdit(true);
        if (content && content.assets) App.assets.importMap(content.assets);
        var deck = content ? App.normalize(content) : null;
        App.deck = deck || M.newDeck('16:9', 'sinerli');
        App.cur = content && content.cur ? SO.clamp(content.cur, 0, App.deck.slides.length - 1) : 0;
        App.sel = [];
        App._snap = snapshot();
        App.history.clear();
        if (App.shell) App.shell.setName(name || SO.t('s_new_deck_name'));
        App.renderAll();
        setTimeout(function () { App.setZoom(App.zoom, App.fitMode); }, 0);
    };

    // ============================================================ panel samping
    App.openPane = function (id, title, render) {
        App.el.pane.hidden = false;
        App.el.pane.dataset.pane = id;
        App.el.paneTitle.textContent = SO.t(title);
        App.el.paneBody.innerHTML = '';
        App._paneRender = render;
        render(App.el.paneBody);
        setTimeout(function () { if (App.fitMode) App.setZoom(0, true); }, 0);
    };
    App.closePane = function () {
        App.el.pane.hidden = true;
        App.el.pane.dataset.pane = '';
        App._paneRender = null;
        setTimeout(function () { if (App.fitMode) App.setZoom(0, true); }, 0);
    };
    App.paneOpen = function (id) { return !App.el.pane.hidden && App.el.pane.dataset.pane === id; };

    global.addEventListener('resize', SO.debounce(function () {
        if (!App.deck) return;
        if (App.view === 'sorter') App.renderSorter();
        else if (App.fitMode) App.setZoom(0, true);
        else { App.layoutStage(); if (App.drawOverlay) App.drawOverlay(); }
    }, 80));
})(window);
