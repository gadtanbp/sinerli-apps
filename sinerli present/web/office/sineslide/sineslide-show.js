/**
 * Sinerli Present — tayangan slide: layar penuh, transisi, animasi bertahap,
 * navigasi & tautan, tinta (pena/stabilo/penghapus/laser), kisi slide,
 * layar hitam/putih, tampilan penyaji (jendela kedua atau satu layar),
 * latihan pengaturan waktu, dan pratinjau di editor.
 */
(function (global) {
    'use strict';

    var App = global.SineSlide, M = global.SSM, R = global.SSR;
    var C = App.cmd;
    var Show = App.show = {};

    // ============================================================ efek
    function slideBaseTransform(node) { return node.dataset.baseTransform != null ? node.dataset.baseTransform : (node.dataset.baseTransform = node.style.transform || ''); }

    /** Keyframes Web Animations untuk satu efek animasi elemen. */
    function animFrames(a, node, e, deck) {
        var base = slideBaseTransform(node);
        var W = deck.size.w, H = deck.size.h;
        var t = function (s) { return (s + ' ' + base).trim(); };
        var dir = a.dir || 'bottom';
        var off = function () {
            if (dir === 'top') return 'translateY(' + (-(e.y + e.h) - 20) + 'px)';
            if (dir === 'left') return 'translateX(' + (-(e.x + e.w) - 20) + 'px)';
            if (dir === 'right') return 'translateX(' + (W - e.x + 20) + 'px)';
            return 'translateY(' + (H - e.y + 20) + 'px)';
        };
        var wipeFrom = { left: 'inset(0 100% 0 0)', right: 'inset(0 0 0 100%)', top: 'inset(0 0 100% 0)', bottom: 'inset(100% 0 0 0)' }[dir] || 'inset(0 100% 0 0)';
        switch (a.effect) {
            case 'appear': return { frames: [{ opacity: 1 }, { opacity: 1 }], show: true };
            case 'fade': return { frames: [{ opacity: 0 }, { opacity: 1 }], show: true };
            case 'fly': return { frames: [{ transform: t(off()) }, { transform: t('translate(0,0)') }], show: true, easing: 'cubic-bezier(.2,.8,.2,1)' };
            case 'float': return { frames: [{ opacity: 0, transform: t('translateY(' + (dir === 'top' ? -50 : 50) + 'px)') }, { opacity: 1, transform: t('translateY(0)') }], show: true, easing: 'ease-out' };
            case 'wipe': return { frames: [{ clipPath: wipeFrom }, { clipPath: 'inset(0 0 0 0)' }], show: true };
            case 'zoom': return { frames: [{ opacity: 0, transform: t('scale(.3)') }, { opacity: 1, transform: t('scale(1)') }], show: true, easing: 'cubic-bezier(.2,.8,.3,1.1)' };
            case 'bounce': return { frames: [{ opacity: 0, transform: t('translateY(-240px)') }, { opacity: 1, transform: t('translateY(0)'), offset: 0.55 }, { transform: t('translateY(-40px)'), offset: 0.72 }, { transform: t('translateY(0)'), offset: 0.86 }, { transform: t('translateY(-10px)'), offset: 0.93 }, { transform: t('translateY(0)') }], show: true, easing: 'ease-in' };
            case 'grow': return { frames: [{ opacity: 0, transform: t('scale(0) rotate(-90deg)') }, { opacity: 1, transform: t('scale(1) rotate(0deg)') }], show: true, easing: 'ease-out' };
            case 'swivel': return { frames: [{ opacity: 0, transform: t('perspective(900px) rotateY(90deg)') }, { opacity: 1, transform: t('perspective(900px) rotateY(0deg)') }], show: true };
            case 'pulse': return { frames: [{ transform: t('scale(1)') }, { transform: t('scale(1.12)') }, { transform: t('scale(1)') }], iter: a.repeat || 1 };
            case 'spin': return { frames: [{ transform: t('rotate(0deg)') }, { transform: t('rotate(' + (a.amount || 360) + 'deg)') }], iter: a.repeat || 1 };
            case 'growShrink': return { frames: [{ transform: t('scale(1)') }, { transform: t('scale(' + (a.amount ? a.amount / 100 : 1.25) + ')') }], keep: true };
            case 'teeter': return { frames: [0, 6, -6, 6, -6, 0].map(function (d) { return { transform: t('rotate(' + d + 'deg)') }; }), iter: a.repeat || 1 };
            case 'flash': return { frames: [{ opacity: 1 }, { opacity: 0.1 }, { opacity: 1 }, { opacity: 0.1 }, { opacity: 1 }], iter: a.repeat || 1 };
            case 'disappear': return { frames: [{ opacity: 1 }, { opacity: 1 }], hide: true };
            case 'fadeOut': return { frames: [{ opacity: 1 }, { opacity: 0 }], hide: true };
            case 'flyOut': return { frames: [{ transform: t('translate(0,0)') }, { transform: t(off()) }], hide: true, easing: 'cubic-bezier(.6,0,.8,.3)' };
            case 'floatOut': return { frames: [{ opacity: 1, transform: t('translateY(0)') }, { opacity: 0, transform: t('translateY(50px)') }], hide: true };
            case 'zoomOut': return { frames: [{ opacity: 1, transform: t('scale(1)') }, { opacity: 0, transform: t('scale(.3)') }], hide: true };
        }
        return { frames: [{ opacity: 0 }, { opacity: 1 }], show: true };
    }

    /** Langkah klik: [[{anim, start}], …]. Langkah 0 bisa otomatis (tanpa klik). */
    function buildSteps(slide, filterIds) {
        var anims = (slide.anims || []).filter(function (a) { return M.findEl(slide, a.el) && (!filterIds || filterIds.indexOf(a.el) !== -1); });
        var steps = [];
        var cur = null, cursor = 0;
        anims.forEach(function (a, i) {
            var dur = (a.dur || 0) * 1000 * (a.repeat || 1), delay = (a.delay || 0) * 1000;
            if (a.trigger === 'click' || !cur) {
                cur = { items: [], auto: a.trigger !== 'click' && i === 0 };
                steps.push(cur);
                cursor = 0;
                cur.items.push({ a: a, start: delay });
                cursor = delay + dur;
            } else if (a.trigger === 'with') {
                var prevStart = cur.items[cur.items.length - 1].start - ((cur.items[cur.items.length - 1].a.delay || 0) * 1000);
                cur.items.push({ a: a, start: prevStart + delay });
                cursor = Math.max(cursor, prevStart + delay + dur);
            } else {
                cur.items.push({ a: a, start: cursor + delay });
                cursor = cursor + delay + dur;
            }
        });
        return steps;
    }
    Show.buildSteps = buildSteps;

    /** Menerapkan kondisi awal/akhir animasi tanpa efek (untuk langkah yang sudah lewat). */
    function applyState(root, slide, steps, done) {
        var entered = {}, exited = {};
        steps.forEach(function (st, si) {
            st.items.forEach(function (it) {
                var info = M.animInfo(it.a.effect);
                if (!info) return;
                if (info.kind === 'entrance') { if (!(it.a.el in entered)) entered[it.a.el] = si < done; }
                if (info.kind === 'exit' && si < done) exited[it.a.el] = true;
            });
        });
        SO.$$('.ss-el[data-id]', root).forEach(function (n) {
            if (n.classList.contains('is-child')) return;
            var id = n.dataset.id;
            var hidden = (id in entered && !entered[id]) || exited[id];
            n.style.visibility = hidden ? 'hidden' : '';
        });
    }

    function playStep(root, slide, step, deck, speed) {
        var promises = [];
        step.items.forEach(function (it) {
            var node = root.querySelector('.ss-el[data-id="' + it.a.el + '"]:not(.is-child)');
            var e = M.findEl(slide, it.a.el);
            if (!node || !e) return;
            var fx = animFrames(it.a, node, e, deck);
            var dur = Math.max(1, (it.a.dur || 0) * 1000 / (speed || 1));
            var delay = it.start / (speed || 1);
            promises.push(new Promise(function (resolve) {
                setTimeout(function () {
                    if (fx.show) node.style.visibility = '';
                    var anim;
                    try {
                        anim = node.animate(fx.frames, { duration: dur, iterations: fx.iter || 1, easing: fx.easing || 'ease', fill: fx.keep ? 'forwards' : 'none' });
                    } catch (err) { if (fx.hide) node.style.visibility = 'hidden'; resolve(); return; }
                    node._anims = (node._anims || []).concat([anim]);
                    anim.onfinish = function () { if (fx.hide) node.style.visibility = 'hidden'; resolve(); };
                    anim.oncancel = function () { resolve(); };
                }, delay);
            }));
        });
        return Promise.all(promises);
    }

    function finishRunning(root) {
        SO.$$('.ss-el', root).forEach(function (n) { (n._anims || []).forEach(function (a) { try { a.finish(); } catch (e) {} }); n._anims = []; });
    }

    /** Transisi antar lapisan slide. */
    function runTransition(box, oldLayer, newLayer, tr) {
        var type = tr && tr.type;
        if (!oldLayer || !type || type === 'none') { if (oldLayer) oldLayer.remove(); return Promise.resolve(); }
        var dur = Math.max(100, (tr.dur == null ? 0.7 : tr.dur) * 1000);
        var dir = tr.dir || 'left';
        var dx = dir === 'right' ? -100 : dir === 'left' ? 100 : 0, dy = dir === 'down' ? -100 : dir === 'up' ? 100 : 0;
        var tIn = 'translate(' + dx + '%,' + dy + '%)', tOut = 'translate(' + (-dx) + '%,' + (-dy) + '%)';
        var opts = { duration: dur, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' };
        var anims = [];
        var wipe = { left: 'inset(0 0 0 100%)', right: 'inset(0 100% 0 0)', up: 'inset(100% 0 0 0)', down: 'inset(0 0 100% 0)' }[dir];
        box.classList.add('is-transitioning');
        switch (type) {
            case 'fade': anims.push(newLayer.animate([{ opacity: 0 }, { opacity: 1 }], opts)); break;
            case 'morph':
                anims.push(newLayer.animate([{ opacity: 0, transform: 'scale(1.03)' }, { opacity: 1, transform: 'scale(1)' }], opts));
                anims.push(oldLayer.animate([{ opacity: 1 }, { opacity: 0 }], opts));
                break;
            case 'push':
                anims.push(newLayer.animate([{ transform: tIn }, { transform: 'translate(0,0)' }], opts));
                anims.push(oldLayer.animate([{ transform: 'translate(0,0)' }, { transform: tOut }], opts));
                break;
            case 'wipe': anims.push(newLayer.animate([{ clipPath: wipe }, { clipPath: 'inset(0 0 0 0)' }], opts)); break;
            case 'split': anims.push(newLayer.animate([{ clipPath: dir === 'up' || dir === 'down' ? 'inset(50% 0 50% 0)' : 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0 0 0)' }], opts)); break;
            case 'cover': anims.push(newLayer.animate([{ transform: tIn }, { transform: 'translate(0,0)' }], opts)); break;
            case 'reveal':
                oldLayer.style.zIndex = 2;
                anims.push(oldLayer.animate([{ transform: 'translate(0,0)' }, { transform: tOut }], opts));
                break;
            case 'zoom':
                anims.push(newLayer.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], opts));
                anims.push(oldLayer.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.25)' }], opts));
                break;
            case 'flip':
                box.style.perspective = '2000px';
                anims.push(oldLayer.animate([{ transform: 'rotateY(0deg)', offset: 0 }, { transform: 'rotateY(-90deg)', offset: 0.5, opacity: 1 }, { transform: 'rotateY(-90deg)', opacity: 0, offset: 1 }], opts));
                anims.push(newLayer.animate([{ transform: 'rotateY(90deg)', opacity: 0, offset: 0 }, { transform: 'rotateY(90deg)', opacity: 1, offset: 0.5 }, { transform: 'rotateY(0deg)', offset: 1 }], opts));
                break;
            case 'cube':
                box.style.perspective = '2400px';
                oldLayer.style.transformOrigin = dx >= 0 ? '0% 50%' : '100% 50%';
                newLayer.style.transformOrigin = dx >= 0 ? '100% 50%' : '0% 50%';
                anims.push(oldLayer.animate([{ transform: 'translateX(0) rotateY(0deg)' }, { transform: 'translateX(' + (dx >= 0 ? -100 : 100) + '%) rotateY(' + (dx >= 0 ? 90 : -90) + 'deg)' }], opts));
                anims.push(newLayer.animate([{ transform: 'translateX(' + (dx >= 0 ? 100 : -100) + '%) rotateY(' + (dx >= 0 ? -90 : 90) + 'deg)' }, { transform: 'translateX(0) rotateY(0deg)' }], opts));
                break;
            default: anims.push(newLayer.animate([{ opacity: 0 }, { opacity: 1 }], opts));
        }
        return Promise.all(anims.map(function (a) { return a.finished.catch(function () {}); })).then(function () {
            anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
            oldLayer.remove();
            box.style.perspective = '';
            box.classList.remove('is-transitioning');
        });
    }

    // =========================================================== tayangan
    var S = null;

    function visibleIndices() {
        var out = [];
        App.deck.slides.forEach(function (s, i) { if (!s.hidden || App.deck.settings.showHidden) out.push(i); });
        return out;
    }

    Show.start = function (from, opts) {
        opts = opts || {};
        if (S) return;
        if (App.editing) C.endEdit();
        var deck = App.deck;
        var vis = visibleIndices();
        if (!vis.length) { SO.toast('s_all_hidden', { type: 'warn' }); return; }
        var startIdx = from == null ? vis[0] : from;
        if (vis.indexOf(startIdx) === -1) startIdx = vis.filter(function (i) { return i >= startIdx; })[0] != null ? vis.filter(function (i) { return i >= startIdx; })[0] : vis[0];
        var root = SO.el('div', { class: 'ss-show' + (opts.reading ? ' is-reading' : '') + (opts.presenterInline ? ' is-presenter' : ''), tabindex: '-1' });
        var area = SO.el('div', { class: 'ss-show-area' });
        var box = SO.el('div', { class: 'ss-show-box' });
        var ink = SO.el('canvas', { class: 'ss-ink' });
        var laser = SO.el('div', { class: 'ss-laser', hidden: true });
        box.appendChild(ink);
        area.appendChild(box);
        area.appendChild(laser);
        root.appendChild(area);
        var cover = SO.el('div', { class: 'ss-show-cover', hidden: true });
        root.appendChild(cover);
        var bar = SO.el('div', { class: 'ss-show-bar' });
        root.appendChild(bar);
        var endScreen = SO.el('div', { class: 'ss-show-end', hidden: true, text: SO.t('s_show_end') });
        root.appendChild(endScreen);
        document.body.appendChild(root);
        App.showing = true;

        S = {
            root: root, area: area, box: box, ink: ink, laser: laser, cover: cover, bar: bar, endScreen: endScreen, deck: deck,
            index: startIdx, step: 0, steps: [], layer: null, opts: opts, tool: null, inks: {}, busy: false,
            startedAt: Date.now(), slideStart: Date.now(), timings: {}, pausedAt: null
        };
        buildBar();
        if (opts.presenterInline) buildInlinePresenter();
        if (!opts.reading && !opts.noFullscreen && root.requestFullscreen) root.requestFullscreen().catch(function () {});
        root.focus();
        layout();
        showSlide(startIdx, { transition: false });
        if (opts.presenter) openPresenterWindow();
        root.addEventListener('keydown', onKey);
        root.addEventListener('click', onClick);
        root.addEventListener('contextmenu', onContext);
        root.addEventListener('wheel', onWheel, { passive: true });
        root.addEventListener('pointermove', onMove);
        ink.addEventListener('pointerdown', inkDown);
        ink.addEventListener('pointermove', inkMove);
        ink.addEventListener('pointerup', inkUp);
        global.addEventListener('resize', layout);
        document.addEventListener('fullscreenchange', onFsChange);
        S.tick = setInterval(tick, 500);
    };

    function onFsChange() {
        if (S && !document.fullscreenElement && S.hadFullscreen && !S.opts.reading) Show.end();
        if (S && document.fullscreenElement) S.hadFullscreen = true;
    }

    function layout() {
        if (!S) return;
        var area = S.area;
        var W = S.deck.size.w, H = S.deck.size.h;
        var aw = area.clientWidth, ah = area.clientHeight;
        var scale = Math.min(aw / W, ah / H);
        S.scale = scale;
        Object.assign(S.box.style, { width: W * scale + 'px', height: H * scale + 'px', left: (aw - W * scale) / 2 + 'px', top: (ah - H * scale) / 2 + 'px' });
        SO.$$('.ss-show-layer > .ss-slide', S.box).forEach(function (n) { n.style.transform = 'scale(' + scale + ')'; });
        var dpr = global.devicePixelRatio || 1;
        S.ink.width = Math.round(W * scale * dpr);
        S.ink.height = Math.round(H * scale * dpr);
        S.ink.style.width = W * scale + 'px';
        S.ink.style.height = H * scale + 'px';
        redrawInk();
    }

    function makeLayer(i) {
        var slide = S.deck.slides[i];
        var layer = SO.el('div', { class: 'ss-show-layer' });
        var node = R.renderSlide(S.deck, slide, { mode: 'show', index: i });
        node.style.transform = 'scale(' + S.scale + ')';
        node.style.transformOrigin = '0 0';
        layer.appendChild(node);
        S.box.insertBefore(layer, S.ink);
        R.fitText(node);
        return layer;
    }

    function showSlide(i, o) {
        o = o || {};
        var slide = S.deck.slides[i];
        if (!slide) return;
        S.endScreen.hidden = true;
        recordTiming();
        var old = S.layer;
        if (old) finishRunning(old);
        S.index = i;
        S.slideStart = Date.now();
        S.steps = buildSteps(slide);
        S.step = o.atEnd ? S.steps.length : 0;
        var layer = makeLayer(i);
        S.layer = layer;
        applyState(layer, slide, S.steps, S.step);
        redrawInk();
        clearTimeout(S.autoTimer);
        var tr = o.transition === false ? null : slide.transition;
        S.busy = true;
        runTransition(S.box, old, layer, tr).then(function () {
            S.busy = false;
            if (!S || S.layer !== layer) return;
            if (S.steps[0] && S.steps[0].auto && S.step === 0) nextStep();
            scheduleAuto();
        });
        syncPresenter();
        updateBar();
    }

    function scheduleAuto() {
        clearTimeout(S.autoTimer);
        var tr = S.deck.slides[S.index].transition;
        if (S.opts.rehearse || !tr || tr.after == null || tr.after === '') return;
        S.autoTimer = setTimeout(function () { if (S) Show.next(true); }, Math.max(0, +tr.after) * 1000);
    }

    function nextStep() {
        var step = S.steps[S.step];
        if (!step) return false;
        S.step++;
        var layer = S.layer;
        playStep(layer, S.deck.slides[S.index], step, S.deck).then(function () {
            if (S && S.layer === layer && S.steps[S.step] && S.steps[S.step].auto) nextStep();
        });
        syncPresenter();
        return true;
    }

    Show.next = function (skipSteps) {
        if (!S) return;
        if (S.cover.dataset.mode) { S.cover.hidden = true; S.cover.dataset.mode = ''; return; }
        if (!S.endScreen.hidden) { Show.end(); return; }
        if (!skipSteps && S.step < S.steps.length) {
            if (S.busy) { finishRunning(S.box); }
            nextStep();
            return;
        }
        var vis = visibleIndices();
        var pos = vis.indexOf(S.index);
        var nxt = vis[pos + 1];
        if (nxt == null) {
            if (S.deck.settings.loop) { showSlide(vis[0]); return; }
            recordTiming();
            if (S.opts.reading) { Show.end(); return; }
            S.endScreen.hidden = false;
            clearTimeout(S.autoTimer);
            return;
        }
        showSlide(nxt);
    };
    Show.prev = function () {
        if (!S) return;
        if (!S.endScreen.hidden) { S.endScreen.hidden = true; return; }
        if (S.step > 0) {
            finishRunning(S.layer);
            S.step--;
            applyState(S.layer, S.deck.slides[S.index], S.steps, S.step);
            syncPresenter();
            return;
        }
        var vis = visibleIndices();
        var pos = vis.indexOf(S.index);
        if (pos > 0) showSlide(vis[pos - 1], { transition: false, atEnd: true });
    };
    Show.goto = function (i) { if (S && App.deck.slides[i]) showSlide(i, { transition: false }); };

    Show.end = function () {
        if (!S) return;
        var s = S;
        recordTiming();
        S = null;
        App.showing = false;
        clearInterval(s.tick);
        clearTimeout(s.autoTimer);
        global.removeEventListener('resize', layout);
        document.removeEventListener('fullscreenchange', onFsChange);
        if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
        s.root.remove();
        if (s.presenter && !s.presenter.closed) s.presenter.close();
        var target = s.index;
        if (s.opts.rehearse) {
            SO.confirm('s_keep_timings', { vars: { time: fmtTime(Date.now() - s.startedAt) }, okLabel: 's_keep', cancelLabel: 's_discard' }).then(function (ok) {
                if (!ok) return;
                App.change('rehearse', function () {
                    Object.keys(s.timings).forEach(function (id) {
                        var sl = App.deck.slides.filter(function (x) { return x.id === id; })[0];
                        if (sl) sl.transition = Object.assign({ type: 'none' }, sl.transition || {}, { after: Math.round(s.timings[id] / 100) / 10 });
                    });
                }, { render: 'all' });
            });
        }
        App.goto(target, { force: true });
        C.focusCanvas();
    };

    function recordTiming() {
        if (!S || !S.deck.slides[S.index]) return;
        var id = S.deck.slides[S.index].id;
        S.timings[id] = (S.timings[id] || 0) + (Date.now() - S.slideStart);
        S.slideStart = Date.now();
    }

    function fmtTime(ms) {
        var s = Math.floor(ms / 1000);
        var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
        return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    }

    // ============================================================ input
    var typed = '';
    function onKey(ev) {
        if (!S) return;
        var k = ev.key;
        if (/^\d$/.test(k)) { typed += k; return; }
        if (k === 'Enter' && typed) { ev.preventDefault(); var n = parseInt(typed, 10) - 1; typed = ''; if (App.deck.slides[n]) Show.goto(n); return; }
        typed = '';
        var mod = ev.ctrlKey || ev.metaKey;
        if (mod && (k === 'p' || k === 'P')) { ev.preventDefault(); setTool(S.tool === 'pen' ? null : 'pen'); return; }
        if (mod && (k === 'l' || k === 'L')) { ev.preventDefault(); setTool(S.tool === 'laser' ? null : 'laser'); return; }
        if (mod && (k === 'e' || k === 'E')) { ev.preventDefault(); setTool(S.tool === 'eraser' ? null : 'eraser'); return; }
        if (mod && (k === 'i' || k === 'I')) { ev.preventDefault(); setTool(S.tool === 'highlighter' ? null : 'highlighter'); return; }
        switch (k) {
            case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter': case 'n': case 'N':
                ev.preventDefault(); Show.next(); break;
            case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': case 'p': case 'P':
                ev.preventDefault(); Show.prev(); break;
            case 'Home': ev.preventDefault(); Show.goto(visibleIndices()[0]); break;
            case 'End': ev.preventDefault(); var v = visibleIndices(); Show.goto(v[v.length - 1]); break;
            case 'Escape':
                ev.preventDefault();
                if (!S.grid.hidden) { S.grid.hidden = true; return; }
                if (S.tool) { setTool(null); return; }
                Show.end();
                break;
            case 'b': case 'B': case '.': toggleCover('black'); break;
            case 'w': case 'W': case ',': toggleCover('white'); break;
            case 'e': case 'E': clearInk(); break;
            case 'g': case 'G': case '-': toggleGrid(); break;
            case 'f': case 'F': if (document.fullscreenElement) document.exitFullscreen().catch(function () {}); else S.root.requestFullscreen().catch(function () {}); break;
            case 'h': case 'H': { var vv = visibleIndices(); var nx = S.index + 1; if (App.deck.slides[nx]) showSlide(nx); else if (vv.length) Show.next(); } break;
        }
    }
    function onClick(ev) {
        if (!S || S.tool) return;
        if (ev.target.closest('.ss-show-bar, .ss-show-grid, .ss-pres-side, iframe, video, .so-menu')) return;
        var a = ev.target.closest('a[href], [data-link]');
        if (a) {
            ev.preventDefault();
            var href = a.getAttribute('href') || a.dataset.link;
            var m = /^#slide-(.+)$/.exec(href);
            if (m) { var idx = App.deck.slides.map(function (s) { return s.id; }).indexOf(m[1]); if (idx >= 0) Show.goto(idx); }
            else if (/^(https?:|mailto:)/i.test(href)) global.open(href, '_blank', 'noopener');
            return;
        }
        if (ev.target.closest('.ss-show-area, .ss-show-end, .ss-show-cover') && ev.button === 0) Show.next();
    }
    function onWheel(ev) {
        if (!S || ev.target.closest('.ss-show-grid, .ss-pres-notes')) return;
        var now = Date.now();
        if (now - (S.lastWheel || 0) < 350) return;
        S.lastWheel = now;
        if (ev.deltaY > 0) Show.next(); else if (ev.deltaY < 0) Show.prev();
    }
    function onMove(ev) {
        if (!S) return;
        S.root.classList.add('show-bar');
        clearTimeout(S.barTimer);
        S.barTimer = setTimeout(function () { if (S) S.root.classList.remove('show-bar'); }, 2500);
        if (S.tool === 'laser') {
            S.laser.hidden = false;
            var r = S.area.getBoundingClientRect();
            S.laser.style.left = ev.clientX - r.left + 'px';
            S.laser.style.top = ev.clientY - r.top + 'px';
        }
    }
    function onContext(ev) {
        ev.preventDefault();
        if (!S) return;
        SO.contextMenu(ev, [
            { label: 's_next', icon: 'fa-forward', onClick: Show.next },
            { label: 's_previous', icon: 'fa-backward', onClick: Show.prev },
            { label: 's_see_all', icon: 'fa-table-cells-large', onClick: toggleGrid },
            { sep: true },
            { label: 's_pen', icon: 'fa-pen', checked: S.tool === 'pen', onClick: function () { setTool('pen'); } },
            { label: 's_highlighter', icon: 'fa-highlighter', checked: S.tool === 'highlighter', onClick: function () { setTool('highlighter'); } },
            { label: 's_laser', icon: 'fa-location-crosshairs', checked: S.tool === 'laser', onClick: function () { setTool('laser'); } },
            { label: 's_eraser', icon: 'fa-eraser', checked: S.tool === 'eraser', onClick: function () { setTool('eraser'); } },
            { label: 's_clear_ink', icon: 'fa-trash', onClick: clearInk },
            { label: 's_arrow_pointer', icon: 'fa-arrow-pointer', checked: !S.tool, onClick: function () { setTool(null); } },
            { sep: true },
            { label: 's_black_screen', icon: 'fa-square', onClick: function () { toggleCover('black'); } },
            { label: 's_white_screen', icon: 'fa-square', onClick: function () { toggleCover('white'); } },
            { sep: true },
            { label: 's_end_show', icon: 'fa-xmark', onClick: Show.end }
        ]);
    }

    function toggleCover(mode) {
        var c = S.cover;
        if (c.dataset.mode === mode) { c.hidden = true; c.dataset.mode = ''; return; }
        c.dataset.mode = mode;
        c.className = 'ss-show-cover is-' + mode;
        c.hidden = false;
    }

    function toggleGrid() {
        if (!S.grid) return;
        if (!S.grid.hidden) { S.grid.hidden = true; return; }
        S.grid.innerHTML = '';
        App.deck.slides.forEach(function (sl, i) {
            var item = SO.el('button', { type: 'button', class: 'ss-show-grid-item' + (i === S.index ? ' is-current' : '') + (sl.hidden ? ' is-hidden' : '') });
            item.appendChild(R.thumb(App.deck, sl, i, 220));
            item.appendChild(SO.el('span', { text: String(i + 1) }));
            item.addEventListener('click', function (ev) { ev.stopPropagation(); S.grid.hidden = true; Show.goto(i); });
            S.grid.appendChild(item);
        });
        S.grid.hidden = false;
        R.fitText(S.grid);
    }

    function buildBar() {
        var bar = S.bar;
        var mk = function (icon, tip, fn) {
            var b = SO.el('button', { type: 'button', 'data-tip': tip, 'aria-label': SO.t(tip), html: '<i class="fas ' + icon + '"></i>' });
            b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(b); });
            bar.appendChild(b);
            return b;
        };
        mk('fa-backward', 's_previous', Show.prev);
        mk('fa-forward', 's_next', function () { Show.next(); });
        S.penBtn = mk('fa-pen', 's_ink_tools', function (b) {
            SO.menu(b, [
                { label: 's_laser', icon: 'fa-location-crosshairs', checked: S.tool === 'laser', onClick: function () { setTool('laser'); } },
                { label: 's_pen', icon: 'fa-pen', checked: S.tool === 'pen', onClick: function () { setTool('pen'); } },
                { label: 's_highlighter', icon: 'fa-highlighter', checked: S.tool === 'highlighter', onClick: function () { setTool('highlighter'); } },
                { label: 's_eraser', icon: 'fa-eraser', checked: S.tool === 'eraser', onClick: function () { setTool('eraser'); } },
                { label: 's_clear_ink', icon: 'fa-trash', onClick: clearInk },
                { sep: true },
                { head: 's_ink_color' },
                { custom: function (box, close) {
                    box.className = 'ss-ink-colors';
                    ['#E81123', '#FFB900', '#107C10', '#0078D7', '#000000', '#FFFFFF'].forEach(function (c) {
                        var sw = SO.el('button', { type: 'button', style: { background: c }, class: (S.inkColor || '#E81123') === c ? 'is-active' : '' });
                        sw.addEventListener('click', function () { S.inkColor = c; if (!S.tool || S.tool === 'eraser' || S.tool === 'laser') setTool('pen'); close(); });
                        box.appendChild(sw);
                    });
                } },
                { sep: true },
                { label: 's_arrow_pointer', icon: 'fa-arrow-pointer', checked: !S.tool, onClick: function () { setTool(null); } }
            ]);
        });
        mk('fa-table-cells-large', 's_see_all', toggleGrid);
        mk('fa-square', 's_black_screen', function () { toggleCover('black'); });
        S.counter = SO.el('span', { class: 'ss-show-count' });
        bar.appendChild(S.counter);
        S.timer = SO.el('span', { class: 'ss-show-timer', hidden: !S.opts.rehearse });
        bar.appendChild(S.timer);
        mk('fa-xmark', 's_end_show', Show.end);
        S.grid = SO.el('div', { class: 'ss-show-grid', hidden: true });
        S.root.appendChild(S.grid);
    }
    function updateBar() {
        if (!S) return;
        S.counter.textContent = SO.t('s_status_slide', { n: S.index + 1, total: S.deck.slides.length });
    }
    function tick() {
        if (!S) return;
        if (S.timer && !S.timer.hidden) S.timer.textContent = fmtTime(Date.now() - S.slideStart) + ' · ' + fmtTime(Date.now() - S.startedAt);
        syncPresenterClock();
    }

    // ============================================================= tinta
    function setTool(tool) {
        S.tool = tool;
        S.root.classList.toggle('is-inking', tool === 'pen' || tool === 'highlighter' || tool === 'eraser');
        S.root.classList.toggle('is-laser', tool === 'laser');
        S.laser.hidden = tool !== 'laser';
        S.penBtn.classList.toggle('is-active', !!tool);
    }
    function inkList() {
        var id = S.deck.slides[S.index].id;
        return S.inks[id] = S.inks[id] || [];
    }
    function inkPoint(ev) {
        var r = S.ink.getBoundingClientRect();
        return { x: (ev.clientX - r.left) / S.scale, y: (ev.clientY - r.top) / S.scale };
    }
    function inkDown(ev) {
        if (!S.tool || S.tool === 'laser') return;
        ev.preventDefault();
        ev.stopPropagation();
        S.ink.setPointerCapture(ev.pointerId);
        var p = inkPoint(ev);
        if (S.tool === 'eraser') { S.erasing = true; eraseAt(p); return; }
        S.stroke = { tool: S.tool, color: S.tool === 'highlighter' ? '#FFE600' : (S.inkColor || '#E81123'), w: S.tool === 'highlighter' ? 22 : 3.5, pts: [p] };
        inkList().push(S.stroke);
    }
    function inkMove(ev) {
        if (!S) return;
        var p = inkPoint(ev);
        if (S.erasing) { eraseAt(p); return; }
        if (!S.stroke) return;
        S.stroke.pts.push(p);
        redrawInk();
    }
    function inkUp() { if (!S) return; S.stroke = null; S.erasing = false; }
    function eraseAt(p) {
        var list = inkList();
        var r = 14;
        for (var i = list.length - 1; i >= 0; i--) {
            if (list[i].pts.some(function (q) { return Math.abs(q.x - p.x) < r && Math.abs(q.y - p.y) < r; })) list.splice(i, 1);
        }
        redrawInk();
    }
    function clearInk() { if (!S) return; S.inks[S.deck.slides[S.index].id] = []; redrawInk(); }
    function redrawInk() {
        if (!S || !S.deck.slides[S.index]) return;
        var ctx = S.ink.getContext('2d');
        var dpr = global.devicePixelRatio || 1;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, S.ink.width, S.ink.height);
        ctx.setTransform(S.scale * dpr, 0, 0, S.scale * dpr, 0, 0);
        (S.inks[S.deck.slides[S.index].id] || []).forEach(function (st) {
            ctx.save();
            ctx.globalAlpha = st.tool === 'highlighter' ? 0.4 : 1;
            ctx.globalCompositeOperation = st.tool === 'highlighter' ? 'multiply' : 'source-over';
            ctx.strokeStyle = st.color;
            ctx.lineWidth = st.w;
            ctx.lineCap = st.tool === 'highlighter' ? 'butt' : 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            st.pts.forEach(function (q, i) { if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
            if (st.pts.length === 1) ctx.lineTo(st.pts[0].x + 0.1, st.pts[0].y);
            ctx.stroke();
            ctx.restore();
        });
    }

    // ======================================================== penyaji
    function presenterContent(doc, container) {
        var el = function (tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
        var wrap = el('div', 'ss-pres');
        var main = el('div', 'ss-pres-main');
        var cur = el('div', 'ss-pres-cur');
        main.appendChild(cur);
        var tools = el('div', 'ss-pres-tools');
        var mkBtn = function (icon, label, fn) { var b = el('button', 'so-btn is-sm'); b.innerHTML = '<i class="fas ' + icon + '"></i> ' + SO.esc(SO.t(label)); b.addEventListener('click', fn); tools.appendChild(b); return b; };
        mkBtn('fa-backward', 's_previous', Show.prev);
        mkBtn('fa-forward', 's_next', function () { Show.next(); });
        mkBtn('fa-table-cells-large', 's_see_all', function () { if (S) toggleGrid(); });
        mkBtn('fa-square', 's_black_screen', function () { if (S) toggleCover('black'); });
        mkBtn('fa-xmark', 's_end_show', Show.end);
        main.appendChild(tools);
        var side = el('div', 'ss-pres-side');
        var clock = el('div', 'ss-pres-clock');
        var timer = el('div', 'ss-pres-timer');
        var tbtns = el('div', 'ss-pres-timer-btns');
        var pause = el('button', 'so-btn is-sm'); pause.innerHTML = '<i class="fas fa-pause"></i>';
        pause.addEventListener('click', function () {
            if (!S) return;
            if (S.pausedAt) { S.startedAt += Date.now() - S.pausedAt; S.pausedAt = null; pause.innerHTML = '<i class="fas fa-pause"></i>'; }
            else { S.pausedAt = Date.now(); pause.innerHTML = '<i class="fas fa-play"></i>'; }
        });
        var reset = el('button', 'so-btn is-sm'); reset.innerHTML = '<i class="fas fa-rotate-left"></i>';
        reset.addEventListener('click', function () { if (S) { S.startedAt = Date.now(); S.pausedAt = null; } });
        tbtns.appendChild(pause); tbtns.appendChild(reset);
        side.appendChild(clock);
        side.appendChild(timer);
        side.appendChild(tbtns);
        side.appendChild(el('div', 'ss-pres-label', SO.t('s_next_slide')));
        var next = el('div', 'ss-pres-next');
        side.appendChild(next);
        side.appendChild(el('div', 'ss-pres-label', SO.t('s_notes')));
        var notes = el('div', 'ss-pres-notes');
        side.appendChild(notes);
        var count = el('div', 'ss-pres-count');
        side.appendChild(count);
        wrap.appendChild(main);
        wrap.appendChild(side);
        container.appendChild(wrap);
        return { cur: cur, next: next, notes: notes, clock: clock, timer: timer, count: count, doc: doc };
    }

    function renderPresenter(P) {
        if (!S || !P) return;
        var doc = P.doc;
        var curHidden = P.cur.parentNode.hidden;
        var place = function (target, idx, final) {
            target.innerHTML = '';
            var sl = S.deck.slides[idx];
            if (!sl) { target.appendChild(doc.createTextNode(SO.t('s_show_end'))); return; }
            var w = target.clientWidth || 400;
            var scale = Math.min(w / S.deck.size.w, (target.clientHeight || w * 0.56) / S.deck.size.h);
            var box = doc.createElement('div');
            box.className = 'ss-pres-thumb';
            box.style.width = S.deck.size.w * scale + 'px';
            box.style.height = S.deck.size.h * scale + 'px';
            var node = R.renderSlide(S.deck, sl, { mode: 'thumb', index: idx });
            node.style.transform = 'scale(' + scale + ')';
            node.style.transformOrigin = '0 0';
            if (!final) applyState(node, sl, S.steps, S.step);
            box.appendChild(doc === document ? node : doc.adoptNode(node));
            target.appendChild(box);
            R.fitText(node);
        };
        if (!curHidden) place(P.cur, S.index, false);
        var vis = visibleIndices();
        place(P.next, S.step < S.steps.length ? S.index : vis[vis.indexOf(S.index) + 1], S.step < S.steps.length);
        var notes = S.deck.slides[S.index].notes || '';
        P.notes.textContent = notes || SO.t('s_no_notes');
        P.notes.classList.toggle('is-empty', !notes);
        P.count.textContent = SO.t('s_status_slide', { n: S.index + 1, total: S.deck.slides.length });
    }
    function syncPresenter() {
        if (!S) return;
        if (S.presenterP && S.presenter && !S.presenter.closed) renderPresenter(S.presenterP);
        if (S.inlineP) renderPresenter(S.inlineP);
    }
    function syncPresenterClock() {
        if (!S) return;
        [S.presenterP, S.inlineP].forEach(function (P) {
            if (!P) return;
            P.clock.textContent = new Intl.DateTimeFormat(SO.locale(), { timeStyle: 'short' }).format(new Date());
            P.timer.textContent = fmtTime((S.pausedAt || Date.now()) - S.startedAt);
        });
    }

    function buildInlinePresenter() {
        var side = SO.el('div', { class: 'ss-pres-inline' });
        S.root.appendChild(side);
        S.root.classList.add('is-presenter');
        var P = presenterContent(document, side);
        // Slide saat ini tampil di area utama; kolom kanan untuk slide berikut & catatan.
        P.cur.parentNode.hidden = true;
        S.inlineP = P;
    }

    function openPresenterWindow() {
        var win = null;
        try { win = global.open('', 'sineslide_presenter', 'width=1180,height=740'); } catch (e) {}
        if (!win) { SO.toast('s_popup_blocked', { type: 'warn', ms: 5000 }); buildInlinePresenter(); layout(); syncPresenter(); return; }
        var doc = win.document;
        doc.open();
        doc.write('<!doctype html><html><head><meta charset="utf-8"><title>' + SO.esc(SO.t('s_presenter_view')) + '</title></head><body class="so-app ss-app ss-pres-body"></body></html>');
        doc.close();
        SO.$$('link[rel="stylesheet"]').forEach(function (l) { var n = doc.createElement('link'); n.rel = 'stylesheet'; n.href = l.href; doc.head.appendChild(n); });
        var P = presenterContent(doc, doc.body);
        S.presenter = win;
        S.presenterP = P;
        doc.addEventListener('keydown', onKey);
        win.addEventListener('resize', function () { syncPresenter(); });
        win.addEventListener('beforeunload', function () { if (S) S.presenterP = null; });
        setTimeout(syncPresenter, 300);
    }

    // ======================================================== pratinjau
    Show.previewTransition = function (i) {
        var s = App.deck.slides[i];
        var host = App.el.host;
        var node = host.firstChild;
        if (!s || !node || !s.transition || s.transition.type === 'none') return;
        var prev = App.deck.slides[i - 1] || { id: 'blank', els: [], layout: 'blank' };
        var oldNode = R.renderSlide(App.deck, prev, { mode: 'thumb', index: i - 1 });
        oldNode.style.transform = node.style.transform;
        oldNode.style.transformOrigin = '0 0';
        var box = SO.el('div', { class: 'ss-preview-box', style: { width: host.style.width, height: host.style.height } });
        var oldLayer = SO.el('div', { class: 'ss-show-layer' });
        var newLayer = SO.el('div', { class: 'ss-show-layer' });
        oldLayer.appendChild(oldNode);
        var clone = R.renderSlide(App.deck, s, { mode: 'thumb', index: i });
        clone.style.transform = node.style.transform;
        clone.style.transformOrigin = '0 0';
        newLayer.appendChild(clone);
        box.appendChild(oldLayer);
        box.appendChild(newLayer);
        host.appendChild(box);
        R.fitText(box);
        runTransition(box, oldLayer, newLayer, s.transition).then(function () { box.remove(); });
    };

    Show.previewAnims = function (ids) {
        if (App.editing) C.endEdit();
        var s = App.slide();
        App.renderStage();
        var root = App.el.host.firstChild;
        if (!root) return;
        var steps = buildSteps(s, ids);
        if (!steps.length) return;
        App.el.overlay.style.visibility = 'hidden';
        applyState(root, s, steps, 0);
        steps.reduce(function (p, st) { return p.then(function () { return playStep(root, s, st, App.deck).then(function () { return SO.sleep(250); }); }); }, SO.sleep(200))
            .then(function () { return SO.sleep(400); })
            .then(function () { App.el.overlay.style.visibility = ''; App.renderStage(); });
    };
})(window);
