/**
 * Sinerli Present — panel samping (Format objek/latar, Seleksi, Animasi, Komentar,
 * Cari & Ganti) serta dialog font, tautan, header-footer, dan ukuran slide.
 */
(function (global) {
    'use strict';

    var App = global.SineSlide, M = global.SSM, R = global.SSR;
    var C = App.cmd;

    var CM = 2.54 / 96;
    function toCm(px) { return Math.round(px * CM * 100) / 100; }
    function fromCm(cm) { return cm / CM; }

    // ========================================================== kontrol
    function section(body, title, open) {
        var d = SO.el('details', { class: 'ss-sec' });
        if (open !== false) d.open = true;
        d.appendChild(SO.el('summary', { text: SO.t(title) }));
        var inner = SO.el('div', { class: 'ss-sec-body' });
        d.appendChild(inner);
        body.appendChild(d);
        return inner;
    }
    function row(parent, label, control) {
        var r = SO.el('label', { class: 'ss-row' });
        r.appendChild(SO.el('span', { class: 'ss-row-label', text: SO.t(label) }));
        r.appendChild(control);
        parent.appendChild(r);
        return r;
    }
    function colorBtn(value, onPick, opts) {
        opts = opts || {};
        var pal = App.pal();
        var b = SO.el('button', { type: 'button', class: 'ss-color-btn' });
        var paint = function (v) {
            var hex = M.color(v, pal);
            b.innerHTML = '<span class="sw" style="background:' + (hex || 'transparent') + '"></span><span>' + SO.esc(hex ? hex : SO.t('c_no_color')) + '</span><i class="fas fa-caret-down"></i>';
        };
        paint(value);
        b.addEventListener('click', function () {
            SO.colorPicker(b, {
                value: M.color(value, pal), allowNone: opts.allowNone, noneLabel: opts.noneLabel, themeColors: M.themeSwatches(pal),
                onPick: function (c) { value = c; paint(c); onPick(c); }
            });
        });
        return b;
    }
    function num(value, opts, onChange) {
        var i = SO.el('input', { class: 'so-input ss-num', type: 'number', min: opts.min, max: opts.max, step: opts.step || 1 });
        i.value = value == null ? '' : value;
        i.addEventListener('change', function () { var v = parseFloat(i.value); if (!isNaN(v)) onChange(SO.clamp(v, opts.min == null ? -1e9 : opts.min, opts.max == null ? 1e9 : opts.max)); });
        return i;
    }
    function range(value, opts, onChange) {
        var wrap = SO.el('div', { class: 'ss-range' });
        var i = SO.el('input', { type: 'range', min: opts.min, max: opts.max, step: opts.step || 1 });
        i.value = value;
        var out = SO.el('span', { text: value + (opts.unit || '') });
        i.addEventListener('input', function () { out.textContent = i.value + (opts.unit || ''); onChange(+i.value); });
        wrap.appendChild(i);
        wrap.appendChild(out);
        return wrap;
    }
    function select(options, value, onChange) {
        var s = SO.el('select', { class: 'so-select' });
        options.forEach(function (o) { s.appendChild(SO.el('option', { value: o[0], text: o[2] ? o[1] : SO.t(o[1]) })); });
        s.value = value == null ? options[0][0] : value;
        s.addEventListener('change', function () { onChange(s.value); });
        return s;
    }
    function check(label, value, onChange) {
        var l = SO.el('label', { class: 'so-field is-inline ss-check' });
        var cb = SO.el('input', { type: 'checkbox' });
        cb.checked = !!value;
        cb.addEventListener('change', function () { onChange(cb.checked); });
        l.appendChild(cb);
        l.appendChild(SO.el('span', { text: SO.t(label) }));
        return l;
    }
    function btn(label, icon, onClick, cls) {
        var b = SO.el('button', { type: 'button', class: 'so-btn is-sm ' + (cls || ''), html: (icon ? '<i class="fas ' + icon + '"></i> ' : '') + SO.esc(SO.t(label)) });
        b.addEventListener('click', onClick);
        return b;
    }

    function mutate(label, fn, merge) {
        var els = App.selected();
        if (App.editing) C.commitText();
        App.change(label, function () { els.forEach(fn); }, { merge: merge, render: App.editing ? 'thumb' : 'slide' });
    }

    // ========================================================== format pane
    C.refreshPane = function () {
        if (App.el.pane.hidden || !App._paneRender) return;
        var ae = document.activeElement;
        if (ae && App.el.pane.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
        var body = App.el.paneBody;
        var scroll = body.scrollTop;
        var openSecs = SO.$$('details.ss-sec', body).map(function (d) { return d.open; });
        body.innerHTML = '';
        App._paneRender(body);
        SO.$$('details.ss-sec', body).forEach(function (d, i) { if (openSecs[i] !== undefined) d.open = openSecs[i]; });
        body.scrollTop = scroll;
    };

    C.openFormatPane = function (focus) {
        if (App.paneOpen('format') && !focus) { App.closePane(); return; }
        App.openPane('format', 's_format_pane', function (body) { renderFormat(body, focus); focus = null; });
    };

    function fillControls(parent, e, key, allowPicture) {
        var fill = e[key] || { type: 'none' };
        row(parent, 's_fill_type', select([['none', 's_fill_none'], ['solid', 's_fill_solid'], ['gradient', 's_fill_gradient']], fill.type, function (v) {
            mutate('fill', function (x) {
                var cur = x[key] || {};
                x[key] = v === 'none' ? { type: 'none' } : { type: v, color: cur.color || 'theme:accent1', color2: cur.color2 || 'theme:accent2', angle: cur.angle == null ? 90 : cur.angle, opacity: cur.opacity };
            });
        }));
        if (fill.type === 'solid' || fill.type === 'gradient') {
            row(parent, fill.type === 'gradient' ? 's_color_start' : 's_color', colorBtn(fill.color, function (c) { mutate('fill-color', function (x) { x[key] = Object.assign({}, x[key], { color: c || 'theme:accent1' }); }); }));
            if (fill.type === 'gradient') {
                row(parent, 's_color_end', colorBtn(fill.color2, function (c) { mutate('fill-color', function (x) { x[key] = Object.assign({}, x[key], { color2: c || 'theme:accent2' }); }); }));
                row(parent, 's_angle', range(fill.angle == null ? 90 : fill.angle, { min: 0, max: 360, step: 5, unit: '°' }, function (v) { mutate('fill-angle', function (x) { x[key].angle = v; }, 'fill-angle'); }));
            }
            row(parent, 's_transparency', range(Math.round((1 - (fill.opacity == null ? 1 : fill.opacity)) * 100), { min: 0, max: 100, unit: '%' }, function (v) { mutate('fill-opacity', function (x) { x[key].opacity = v ? 1 - v / 100 : undefined; }, 'fill-opacity'); }));
        }
    }

    function lineControls(parent, e) {
        var ln = e.line || { type: 'none' };
        var isLine = e.type === 'line';
        if (!isLine) row(parent, 's_line_type', select([['none', 's_line_none'], ['solid', 's_line_solid']], ln.type, function (v) {
            mutate('line', function (x) { x.line = v === 'none' ? { type: 'none' } : Object.assign({ color: 'theme:text', w: 1 }, x.line, { type: 'solid' }); });
        }));
        if (ln.type !== 'none' || isLine) {
            row(parent, 's_color', colorBtn(ln.color, function (c) { mutate('line-color', function (x) { x.line = Object.assign({}, x.line, { type: 'solid', color: c || 'theme:text' }); }); }));
            row(parent, 's_width_pt', num(ln.w || 1, { min: 0.25, max: 72, step: 0.25 }, function (v) { mutate('line-width', function (x) { x.line.w = v; }); }));
            row(parent, 's_dash', select([['solid', 's_dash_solid'], ['dash', 's_dash_dash'], ['dot', 's_dash_dot'], ['dashDot', 's_dash_dashdot'], ['longDash', 's_dash_long']], ln.dash || 'solid', function (v) { mutate('line-dash', function (x) { x.line.dash = v; }); }));
        }
        if (isLine) {
            var ends = [['none', 's_end_none'], ['arrow', 's_end_arrow'], ['open', 's_end_open'], ['oval', 's_end_oval'], ['diamond', 's_end_diamond']];
            row(parent, 's_begin_type', select(ends, ln.head || 'none', function (v) { mutate('line-end', function (x) { x.line.head = v; }); }));
            row(parent, 's_end_type', select(ends, ln.tail || 'none', function (v) { mutate('line-end', function (x) { x.line.tail = v; }); }));
        }
    }

    function sizeControls(parent, e) {
        var sel = App.selected();
        var multi = sel.length > 1;
        var bb = multi ? M.bbox(sel) : e;
        var grid = SO.el('div', { class: 'ss-grid2' });
        parent.appendChild(grid);
        row(grid, 's_height_cm', num(toCm(bb.h), { min: 0.05, step: 0.1 }, function (v) {
            var k = fromCm(v) / bb.h;
            mutate('size', function (x) {
                if (x.type === 'line') { x.y2 = x.y1 + (x.y2 - x.y1) * k; M.syncLineBox(x); return; }
                var oh = x.h; x.h = Math.max(4, x.h * k);
                if (x.lockRatio || x.type === 'image' || x.type === 'icon') x.w = x.w * (x.h / oh);
            });
        }));
        row(grid, 's_width_cm', num(toCm(bb.w), { min: 0.05, step: 0.1 }, function (v) {
            var k = fromCm(v) / bb.w;
            mutate('size', function (x) {
                if (x.type === 'line') { x.x2 = x.x1 + (x.x2 - x.x1) * k; M.syncLineBox(x); return; }
                var ow = x.w; x.w = Math.max(4, x.w * k);
                if (x.lockRatio || x.type === 'image' || x.type === 'icon') x.h = x.h * (x.w / ow);
            });
        }));
        if (!multi && e.type !== 'line') {
            row(parent, 's_rotation', num(e.rot || 0, { min: -360, max: 360, step: 1 }, function (v) { mutate('rotation', function (x) { x.rot = ((v % 360) + 360) % 360; }); }));
            parent.appendChild(check('s_lock_ratio', e.lockRatio || e.type === 'image' || e.type === 'icon', function (on) { mutate('ratio', function (x) { x.lockRatio = on || undefined; }); }));
        }
        var g2 = SO.el('div', { class: 'ss-grid2' });
        parent.appendChild(g2);
        row(g2, 's_pos_x_cm', num(toCm(bb.x), { step: 0.1 }, function (v) { var d = fromCm(v) - bb.x; mutate('position', function (x) { C.shiftEl(x, d, 0); }); }));
        row(g2, 's_pos_y_cm', num(toCm(bb.y), { step: 0.1 }, function (v) { var d = fromCm(v) - bb.y; mutate('position', function (x) { C.shiftEl(x, 0, d); }); }));
    }

    function textBoxControls(parent, e) {
        var st = e.st || {};
        row(parent, 's_valign', select([['top', 's_top'], ['middle', 's_middle'], ['bottom', 's_bottom']], st.valign || 'top', function (v) { C.valign(v); }));
        row(parent, 's_autofit', select([['none', 's_autofit_none'], ['shrink', 's_autofit_shrink'], ['grow', 's_autofit_grow']], e.autofit || 'none', function (v) {
            mutate('autofit', function (x) { x.autofit = v; });
            if (v === 'grow') App.selected().forEach(function (x) { C.fitGrowHeight(x); });
        }));
        var ins = e.inset || { l: 9.6, t: 4.8, r: 9.6, b: 4.8 };
        var g = SO.el('div', { class: 'ss-grid2' });
        parent.appendChild(g);
        [['l', 's_inset_left'], ['r', 's_inset_right'], ['t', 's_inset_top'], ['b', 's_inset_bottom']].forEach(function (k) {
            row(g, k[1], num(toCm(ins[k[0]]), { min: 0, max: 10, step: 0.05 }, function (v) { mutate('inset', function (x) { x.inset = Object.assign({ l: 9.6, t: 4.8, r: 9.6, b: 4.8 }, x.inset); x.inset[k[0]] = fromCm(v); }); }));
        });
        row(parent, 's_line_spacing', select([['0.9', '0.9', true], ['1', '1.0', true], ['1.15', '1.15', true], ['1.5', '1.5', true], ['2', '2.0', true], ['2.5', '2.5', true], ['3', '3.0', true]], String(st.lh || 1.15), function (v) { C.lineSpacing(+v); }));
        row(parent, 's_char_spacing', num(st.ls || 0, { min: -5, max: 50, step: 0.5 }, function (v) { mutate('char-spacing', function (x) { x.st = x.st || {}; x.st.ls = v || undefined; }); }));
    }

    function effectControls(parent, e) {
        var sh = e.shadow || (e.st && e.st.shadow);
        row(parent, 's_shadow', select([['none', 's_shadow_none'], ['outer', 's_shadow_outer'], ['soft', 's_shadow_soft'], ['hard', 's_shadow_hard'], ['below', 's_shadow_below']], sh ? (sh.dist === 0 ? 'soft' : sh.blur === 0 ? 'hard' : sh.dist === 10 ? 'below' : 'outer') : 'none', function (v) { C.shadow(v); }));
        row(parent, 's_transparency', range(Math.round((1 - (e.opacity == null ? 1 : e.opacity)) * 100), { min: 0, max: 95, unit: '%' }, function (v) { mutate('opacity', function (x) { x.opacity = v ? 1 - v / 100 : undefined; }, 'opacity'); }));
    }

    function imageControls(parent, e) {
        var fx = e.fx || {};
        row(parent, 's_brightness', range(fx.bright || 0, { min: -100, max: 100, unit: '%' }, function (v) { C.imageFx('bright', v); }));
        row(parent, 's_contrast', range(fx.contrast || 0, { min: -100, max: 100, unit: '%' }, function (v) { C.imageFx('contrast', v); }));
        row(parent, 's_saturation', range(fx.sat == null ? 100 : fx.sat, { min: 0, max: 200, unit: '%' }, function (v) { C.imageFx('sat', v === 100 ? null : v); }));
        row(parent, 's_blur', range(fx.blur || 0, { min: 0, max: 20, unit: 'px' }, function (v) { C.imageFx('blur', v); }));
        parent.appendChild(check('s_grayscale', fx.gray, function (on) { C.imageFx('gray', on); }));
        parent.appendChild(check('s_sepia', fx.sepia, function (on) { C.imageFx('sepia', on); }));
        var cr = e.crop || { l: 0, t: 0, r: 0, b: 0 };
        var g = SO.el('div', { class: 'ss-grid2' });
        parent.appendChild(SO.el('div', { class: 'ss-sub', text: SO.t('s_crop') }));
        parent.appendChild(g);
        [['l', 's_inset_left'], ['r', 's_inset_right'], ['t', 's_inset_top'], ['b', 's_inset_bottom']].forEach(function (k) {
            row(g, k[1], num(Math.round((cr[k[0]] || 0) * 100), { min: 0, max: 90, step: 1 }, function (v) {
                mutate('crop', function (x) { x.crop = Object.assign({ l: 0, t: 0, r: 0, b: 0 }, x.crop); x.crop[k[0]] = v / 100; });
            }));
        });
        var masks = [['rect', 's_sh_rect']].concat(M.SHAPES.filter(function (s) { return s[2] !== 'callout' && s[0] !== 'rect'; }).map(function (s) { return [s[0], s[1]]; }));
        row(parent, 's_crop_to_shape', select(masks, e.mask || 'rect', function (v) { C.changeShape(v); }));
        var bar = SO.el('div', { class: 'ss-btn-row' });
        bar.appendChild(btn('s_change_picture', 'fa-image', C.replaceImage));
        bar.appendChild(btn('s_reset_picture', 'fa-arrows-rotate', C.resetImage));
        parent.appendChild(bar);
        var alt = SO.el('textarea', { class: 'so-input', rows: 2, placeholder: SO.t('s_alt_text_ph') });
        alt.value = e.alt || '';
        alt.addEventListener('change', function () { mutate('alt', function (x) { x.alt = alt.value.trim() || undefined; }); });
        row(parent, 's_alt_text', alt);
    }

    function backgroundControls(body) {
        var s = App.slide();
        var bg = s.bg || { type: 'theme' };
        var sec = section(body, 's_format_background');
        var setBg = function (patch) { C.setBackground(Object.assign({}, bg.type === 'theme' ? {} : bg, patch), false); };
        row(sec, 's_fill_type', select([['theme', 's_bg_theme'], ['solid', 's_fill_solid'], ['gradient', 's_fill_gradient'], ['image', 's_fill_picture']], bg.type, function (v) {
            var pal = App.pal();
            if (v === 'theme') C.setBackground(null, false);
            else if (v === 'image') C.pickBackgroundImage(false);
            else setBg({ type: v, color: bg.color || pal.bg, color2: bg.color2 || pal.accent1, angle: bg.angle == null ? 135 : bg.angle });
        }));
        if (bg.type === 'solid' || bg.type === 'gradient') {
            row(sec, bg.type === 'gradient' ? 's_color_start' : 's_color', colorBtn(bg.color, function (c) { setBg({ color: c || '#FFFFFF' }); }));
            if (bg.type === 'gradient') {
                row(sec, 's_color_end', colorBtn(bg.color2, function (c) { setBg({ color2: c || '#000000' }); }));
                row(sec, 's_angle', range(bg.angle == null ? 135 : bg.angle, { min: 0, max: 360, step: 5, unit: '°' }, function (v) { App.change('bg-angle', function () { s.bg.angle = v; }, { merge: 'bg-angle' }); }));
            }
        }
        if (bg.type === 'image') {
            row(sec, 's_bg_fit', select([['cover', 's_fit_cover'], ['contain', 's_fit_contain'], ['tile', 's_fit_tile']], bg.fit || 'cover', function (v) { setBg({ fit: v }); }));
            row(sec, 's_transparency', range(Math.round((1 - (bg.opacity == null ? 1 : bg.opacity)) * 100), { min: 0, max: 95, unit: '%' }, function (v) { App.change('bg-opacity', function () { s.bg.opacity = v ? 1 - v / 100 : undefined; }, { merge: 'bg-opacity' }); }));
            sec.appendChild(btn('s_change_picture', 'fa-image', function () { C.pickBackgroundImage(false); }));
        }
        sec.appendChild(check('s_hide_decor', s.hideDecor, function () { C.toggleDecor(); }));
        var bar = SO.el('div', { class: 'ss-btn-row' });
        bar.appendChild(btn('s_apply_all', 'fa-clone', function () { C.setBackground(s.bg || null, true); App.change('decor-all', function () { App.deck.slides.forEach(function (x) { x.hideDecor = s.hideDecor; }); }, { render: 'all' }); SO.toast('s_applied_all', { type: 'success' }); }));
        bar.appendChild(btn('s_reset_background', 'fa-arrows-rotate', function () { C.setBackground(null, false); }));
        sec.appendChild(bar);
    }
    C.pickBackgroundImage = function (all) {
        SO.pickFile('image/*').then(function (f) {
            if (!f) return;
            SO.prepareImage(Array.isArray(f) ? f[0] : f, 2400).then(function (res) {
                var rec = App.assets.addDataUrl(res.dataUrl);
                C.setBackground({ type: 'image', image: rec.id, fit: 'cover' }, all);
            }).catch(function (err) { SO.toast(err.message || 'c_err_image', { type: 'error' }); });
        });
    };

    function renderFormat(body, focus) {
        var sel = App.selected();
        if (!sel.length) { backgroundControls(body); return; }
        var e = sel[0];
        var tabs = SO.el('div', { class: 'ss-pane-tabs' });
        body.appendChild(tabs);
        var one = sel.length === 1;
        var sameType = sel.every(function (x) { return x.type === e.type; });
        var titleName = SO.el('div', { class: 'ss-pane-sel', html: '<i class="fas ' + typeIcon(e) + '"></i><span>' + SO.esc(sel.length > 1 ? SO.t('s_status_selected', { n: sel.length }) : elName(e)) + '</span>' });
        tabs.appendChild(titleName);
        if (e.type === 'image' && sameType) imageControls(section(body, 's_picture_adjust'), e);
        if (sameType && (e.type === 'shape' || e.type === 'text')) {
            var fs = section(body, 's_fill');
            fillControls(fs, e, 'fill');
        }
        if (sameType && (e.type === 'shape' || e.type === 'text' || e.type === 'line' || e.type === 'image')) {
            lineControls(section(body, e.type === 'line' ? 's_line' : 's_outline'), e);
        }
        if (sameType && e.type === 'icon') {
            var ic = section(body, 's_icon');
            row(ic, 's_color', colorBtn(e.color, function (c) { mutate('icon-color', function (x) { x.color = c || 'theme:accent1'; }); }));
            ic.appendChild(btn('s_change_icon', 'fa-icons', function () { C.iconDialog(e.id); }));
        }
        if (sameType && e.type === 'math') {
            var mt = section(body, 's_equation');
            row(mt, 's_font_size', num(e.st.fs || 28, { min: 8, max: 200 }, function (v) { mutate('math-size', function (x) { x.st.fs = v; }); }));
            row(mt, 's_color', colorBtn(e.st.color, function (c) { mutate('math-color', function (x) { x.st.color = c || 'theme:text'; }); }));
            mt.appendChild(btn('s_edit_equation', 'fa-square-root-variable', function () { C.equationDialog(e.id); }));
        }
        if (sameType && e.type === 'table') {
            var tb = section(body, 's_table_style');
            row(tb, 's_color', colorBtn(e.tstyle.color, function (c) { mutate('table-color', function (x) { x.tstyle.color = c || 'theme:accent1'; }); }));
            row(tb, 's_border_color', colorBtn(e.tstyle.border, function (c) { mutate('table-border', function (x) { x.tstyle.border = c || 'theme:accent1'; x.tstyle.borders = c ? undefined : 'none'; }); }, { allowNone: true }));
            row(tb, 's_font_size', num(e.st.fs || 16, { min: 6, max: 96 }, function (v) { C.fontSize(v); }));
        }
        effectControls(section(body, 's_effects', false), e);
        sizeControls(section(body, 's_size_position', focus === 'size'), e);
        if (one && C.isTextual(e)) textBoxControls(section(body, 's_text_box', false), e);
        if (one) {
            var misc = section(body, 's_properties', false);
            var name = SO.el('input', { class: 'so-input', type: 'text', value: e.name || '' , placeholder: elName(e) });
            name.addEventListener('change', function () { mutate('rename', function (x) { x.name = name.value.trim() || undefined; }); });
            row(misc, 's_name', name);
            misc.appendChild(check('s_lock', e.locked, function () { C.toggleLock(); }));
        }
    }

    function typeIcon(e) {
        return { text: 'fa-font', shape: 'fa-shapes', line: 'fa-slash', image: 'fa-image', table: 'fa-table', chart: 'fa-chart-column', icon: 'fa-icons', video: 'fa-film', math: 'fa-square-root-variable', group: 'fa-object-group' }[e.type] || 'fa-square';
    }
    function elName(e) {
        if (e.name) return e.name;
        var s = App.slide();
        var same = s.els.filter(function (x) { return x.type === e.type; });
        var label = e.ph ? SO.t('s_ph_name_' + e.ph) : SO.t('s_type_' + e.type);
        return label + ' ' + (same.indexOf(e) + 1);
    }
    C.elName = elName;
    C.typeIcon = typeIcon;

    // ========================================================== seleksi
    C.selectionPane = function () {
        if (App.paneOpen('selection')) { App.closePane(); return; }
        App.openPane('selection', 's_selection_pane', function (body) {
            var s = App.slide();
            var bar = SO.el('div', { class: 'ss-btn-row' });
            bar.appendChild(btn('s_show_all', 'fa-eye', function () { App.change('show-all', function () { s.els.forEach(function (e) { delete e.hidden; }); }); }));
            bar.appendChild(btn('s_hide_all', 'fa-eye-slash', function () { App.change('hide-all', function () { s.els.forEach(function (e) { e.hidden = true; }); App.sel = []; }); }));
            var up = SO.el('button', { type: 'button', class: 'so-btn is-sm', html: '<i class="fas fa-arrow-up"></i>', 'data-tip': 's_bring_forward' });
            up.addEventListener('click', function () { C.order('forward'); });
            var down = SO.el('button', { type: 'button', class: 'so-btn is-sm', html: '<i class="fas fa-arrow-down"></i>', 'data-tip': 's_send_backward' });
            down.addEventListener('click', function () { C.order('backward'); });
            bar.appendChild(up); bar.appendChild(down);
            body.appendChild(bar);
            var list = SO.el('div', { class: 'ss-list' });
            if (!s.els.length) list.appendChild(SO.el('div', { class: 'so-empty-note', text: SO.t('s_no_objects') }));
            s.els.slice().reverse().forEach(function (e) {
                var item = SO.el('div', { class: 'ss-list-item' + (App.sel.indexOf(e.id) !== -1 ? ' is-selected' : '') + (e.hidden ? ' is-muted' : '') });
                item.appendChild(SO.el('i', { class: 'fas ' + typeIcon(e) }));
                item.appendChild(SO.el('span', { class: 'li-name', text: elName(e) }));
                var eye = SO.el('button', { type: 'button', class: 'ss-icon-btn', html: '<i class="fas ' + (e.hidden ? 'fa-eye-slash' : 'fa-eye') + '"></i>', 'data-tip': e.hidden ? 's_show' : 's_hide' });
                eye.addEventListener('click', function (ev) { ev.stopPropagation(); App.change('visibility', function () { e.hidden = !e.hidden || undefined; if (e.hidden) App.sel = App.sel.filter(function (id) { return id !== e.id; }); }); });
                var lock = SO.el('button', { type: 'button', class: 'ss-icon-btn', html: '<i class="fas ' + (e.locked ? 'fa-lock' : 'fa-lock-open') + '"></i>', 'data-tip': e.locked ? 's_unlock' : 's_lock' });
                lock.addEventListener('click', function (ev) { ev.stopPropagation(); App.change('lock', function () { e.locked = !e.locked || undefined; }); });
                item.appendChild(lock);
                item.appendChild(eye);
                item.addEventListener('click', function (ev) { if (!e.hidden) App.select([e.id], { toggle: ev.ctrlKey || ev.metaKey || ev.shiftKey }); });
                item.addEventListener('dblclick', function () {
                    SO.prompt('s_name', elName(e)).then(function (v) { if (v != null) App.change('rename', function () { e.name = v.trim() || undefined; }); });
                });
                list.appendChild(item);
            });
            body.appendChild(list);
        });
    };

    // ========================================================== animasi
    C.animationPane = function () {
        if (App.paneOpen('anim')) { App.closePane(); return; }
        App.openPane('anim', 's_animation_pane', function (body) {
            var s = App.slide();
            var anims = s.anims || [];
            var bar = SO.el('div', { class: 'ss-btn-row' });
            bar.appendChild(btn('s_play_all', 'fa-play', function () { if (App.show) App.show.previewAnims(null); }, 'is-primary'));
            body.appendChild(bar);
            if (!anims.length) { body.appendChild(SO.el('div', { class: 'so-empty-note', text: SO.t('s_no_animations') })); return; }
            var list = SO.el('div', { class: 'ss-list' });
            var step = 0;
            anims.forEach(function (a, i) {
                var e = M.findEl(s, a.el);
                var info = M.animInfo(a.effect) || { label: a.effect, icon: 'fa-star', kind: 'entrance' };
                if (a.trigger === 'click' || i === 0) step++;
                var item = SO.el('div', { class: 'ss-list-item is-anim is-' + info.kind + (App.sel.indexOf(a.el) !== -1 ? ' is-selected' : '') });
                item.appendChild(SO.el('span', { class: 'li-step', text: a.trigger === 'click' ? String(step) : '' }));
                item.appendChild(SO.el('i', { class: 'fas ' + (a.trigger === 'click' ? 'fa-computer-mouse' : a.trigger === 'after' ? 'fa-clock' : 'fa-link'), 'data-tip': 's_trigger_' + a.trigger }));
                item.appendChild(SO.el('span', { class: 'li-name', text: SO.t(info.label) + ' · ' + (e ? elName(e) : '?') }));
                var upB = SO.el('button', { type: 'button', class: 'ss-icon-btn', html: '<i class="fas fa-chevron-up"></i>', 'data-tip': 's_move_earlier' });
                upB.addEventListener('click', function (ev) { ev.stopPropagation(); C.moveAnim(a.id, -1); });
                var dnB = SO.el('button', { type: 'button', class: 'ss-icon-btn', html: '<i class="fas fa-chevron-down"></i>', 'data-tip': 's_move_later' });
                dnB.addEventListener('click', function (ev) { ev.stopPropagation(); C.moveAnim(a.id, 1); });
                var rm = SO.el('button', { type: 'button', class: 'ss-icon-btn', html: '<i class="fas fa-xmark"></i>', 'data-tip': 'c_delete' });
                rm.addEventListener('click', function (ev) { ev.stopPropagation(); C.removeAnims([a.id]); });
                item.appendChild(upB); item.appendChild(dnB); item.appendChild(rm);
                item.addEventListener('click', function () { if (e) App.select([e.id]); App._animFocus = a.id; C.refreshPane(); });
                list.appendChild(item);
            });
            body.appendChild(list);
            var focus = anims.filter(function (a) { return a.id === App._animFocus; })[0] || anims.filter(function (a) { return App.sel.indexOf(a.el) !== -1; })[0];
            if (!focus) return;
            var sec = section(body, 's_animation_options');
            var effects = [];
            Object.keys(M.ANIMS).forEach(function (k) { M.ANIMS[k].forEach(function (x) { effects.push([x[0], x[1]]); }); });
            row(sec, 's_effect', select(effects, focus.effect, function (v) { C.animOpt('effect', v, [focus.id]); }));
            if (/^(fly|float|wipe|flyOut|floatOut)$/.test(focus.effect)) {
                row(sec, 's_direction', select([['bottom', 's_dir_bottom'], ['top', 's_dir_top'], ['left', 's_dir_left'], ['right', 's_dir_right']], focus.dir || 'bottom', function (v) { C.animOpt('dir', v, [focus.id]); }));
            }
            row(sec, 's_start', select([['click', 's_trigger_click'], ['with', 's_trigger_with'], ['after', 's_trigger_after']], focus.trigger, function (v) { C.animOpt('trigger', v, [focus.id]); }));
            row(sec, 's_duration_s', num(focus.dur, { min: 0, max: 60, step: 0.1 }, function (v) { C.animOpt('dur', v, [focus.id]); }));
            row(sec, 's_delay_s', num(focus.delay || 0, { min: 0, max: 60, step: 0.1 }, function (v) { C.animOpt('delay', v, [focus.id]); }));
            if (focus.effect === 'spin') row(sec, 's_amount_deg', num(focus.amount || 360, { min: -3600, max: 3600, step: 15 }, function (v) { C.animOpt('amount', v, [focus.id]); }));
            if (M.animInfo(focus.effect) && M.animInfo(focus.effect).kind === 'emphasis') row(sec, 's_repeat', num(focus.repeat || 1, { min: 1, max: 20 }, function (v) { C.animOpt('repeat', v, [focus.id]); }));
        });
    };

    // ========================================================== komentar
    C.commentsPane = function (focusNew) {
        if (App.paneOpen('comments') && !focusNew) { App.closePane(); return; }
        App.openPane('comments', 's_comments', function (body) {
            var s = App.slide();
            var box = SO.el('div', { class: 'ss-comment-new' });
            var ta = SO.el('textarea', { class: 'so-input', rows: 3, placeholder: SO.t('s_comment_ph') });
            box.appendChild(ta);
            box.appendChild(btn('s_post', 'fa-paper-plane', function () {
                var text = ta.value.trim();
                if (!text) return;
                App.change('comment', function () {
                    s.comments = s.comments || [];
                    s.comments.push({ id: M.uid('c'), author: SO.ctx.name || SO.ctx.email || SO.t('s_you'), text: text, at: Date.now(), el: App.sel[0] || null });
                }, { render: 'thumbs' });
            }, 'is-primary'));
            body.appendChild(box);
            var list = SO.el('div', { class: 'ss-comments' });
            (s.comments || []).slice().reverse().forEach(function (cm) {
                var c = SO.el('div', { class: 'ss-comment' + (cm.done ? ' is-done' : '') });
                var head = SO.el('div', { class: 'cm-head' });
                head.appendChild(SO.el('b', { text: cm.author }));
                head.appendChild(SO.el('small', { text: SO.fmtDate(cm.at) }));
                c.appendChild(head);
                c.appendChild(SO.el('div', { class: 'cm-text', text: cm.text }));
                var acts = SO.el('div', { class: 'cm-acts' });
                acts.appendChild(btn(cm.done ? 's_reopen' : 's_resolve', cm.done ? 'fa-rotate-left' : 'fa-check', function () { App.change('comment-resolve', function () { cm.done = !cm.done || undefined; }, { render: 'none' }); C.refreshPane(); }));
                acts.appendChild(btn('c_delete', 'fa-trash', function () { App.change('comment-delete', function () { s.comments = s.comments.filter(function (x) { return x !== cm; }); }, { render: 'thumbs' }); }));
                if (cm.el && M.findEl(s, cm.el)) acts.appendChild(btn('s_select_object', 'fa-arrow-pointer', function () { App.select([cm.el]); }));
                c.appendChild(acts);
                list.appendChild(c);
            });
            if (!(s.comments || []).length) list.appendChild(SO.el('div', { class: 'so-empty-note', text: SO.t('s_no_comments') }));
            body.appendChild(list);
            if (focusNew) setTimeout(function () { ta.focus(); }, 30);
        });
    };

    // ========================================================== cari & ganti
    function textNodesReplace(html, re, rep) {
        var d = document.createElement('div');
        d.innerHTML = html;
        var count = 0;
        var walker = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
        var n;
        while ((n = walker.nextNode())) {
            var v = n.nodeValue.replace(re, function () { count++; return rep; });
            if (count) n.nodeValue = v;
        }
        return { html: d.innerHTML, count: count };
    }
    C.findPane = function (replace) {
        App.openPane('find', replace ? 's_replace' : 's_find', function (body) {
            var state = App._find = App._find || { q: '', r: '', caseS: false, word: false };
            var q = SO.el('input', { class: 'so-input', type: 'search', placeholder: SO.t('s_find_ph'), value: state.q });
            var rep = SO.el('input', { class: 'so-input', type: 'text', placeholder: SO.t('s_replace_ph'), value: state.r });
            body.appendChild(q);
            body.appendChild(SO.el('div', { style: { height: '8px' } }));
            body.appendChild(rep);
            var opts = SO.el('div', { class: 'ss-btn-row' });
            opts.appendChild(check('s_match_case', state.caseS, function (v) { state.caseS = v; run(); }));
            opts.appendChild(check('s_whole_word', state.word, function (v) { state.word = v; run(); }));
            body.appendChild(opts);
            var acts = SO.el('div', { class: 'ss-btn-row' });
            acts.appendChild(btn('s_replace_all', 'fa-arrows-rotate', function () {
                var re = regex();
                if (!re) return;
                var total = 0;
                App.change('replace-all', function () {
                    App.deck.slides.forEach(function (s) {
                        s.els.forEach(function (e) {
                            if (e.html) { var r = textNodesReplace(e.html, re, rep.value); if (r.count) { e.html = r.html; total += r.count; } }
                            if (e.cells) e.cells.forEach(function (row) { row.forEach(function (c) { if (c.html) { var r2 = textNodesReplace(c.html, re, rep.value); if (r2.count) { c.html = r2.html; total += r2.count; } } }); });
                        });
                        if (s.notes && re.test(s.notes)) { re.lastIndex = 0; s.notes = s.notes.replace(re, function () { total++; return rep.value; }); }
                        re.lastIndex = 0;
                    });
                }, { render: 'all' });
                SO.toast('s_replaced_n', { vars: { n: total }, type: total ? 'success' : 'info' });
                run();
            }));
            body.appendChild(acts);
            var results = SO.el('div', { class: 'ss-list' });
            body.appendChild(results);
            function regex() {
                if (!q.value) return null;
                var src = q.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                if (state.word) src = '(?:^|\\b)' + src + '(?:\\b|$)';
                return new RegExp(src, 'g' + (state.caseS ? '' : 'i'));
            }
            function run() {
                state.q = q.value; state.r = rep.value;
                results.innerHTML = '';
                var re = regex();
                if (!re) return;
                var hits = 0;
                App.deck.slides.forEach(function (s, i) {
                    var check = function (text, elId, label) {
                        re.lastIndex = 0;
                        var m = re.exec(text);
                        if (!m) return;
                        hits++;
                        var start = Math.max(0, m.index - 24);
                        var item = SO.el('div', { class: 'ss-list-item' });
                        item.appendChild(SO.el('span', { class: 'li-step', text: String(i + 1) }));
                        var snip = SO.el('span', { class: 'li-name' });
                        snip.innerHTML = SO.esc((start ? '…' : '') + text.slice(start, m.index)) + '<mark>' + SO.esc(m[0]) + '</mark>' + SO.esc(text.slice(m.index + m[0].length, m.index + m[0].length + 30));
                        item.appendChild(snip);
                        if (label) item.appendChild(SO.el('small', { text: SO.t(label) }));
                        item.addEventListener('click', function () { App.goto(i); if (elId) App.select([elId]); });
                        results.appendChild(item);
                    };
                    s.els.forEach(function (e) {
                        if (e.html) check(M.htmlToText(e.html), e.id);
                        if (e.cells) check(e.cells.map(function (r) { return r.map(function (c) { return M.htmlToText(c.html); }).join(' '); }).join(' '), e.id);
                    });
                    if (s.notes) check(s.notes, null, 's_notes');
                });
                if (!hits) results.appendChild(SO.el('div', { class: 'so-empty-note', text: SO.t('s_no_results') }));
            }
            q.addEventListener('input', SO.debounce(run, 150));
            rep.addEventListener('input', function () { state.r = rep.value; });
            setTimeout(function () { q.focus(); run(); }, 30);
        });
    };

    // ========================================================== dialog
    C.fontDialog = function () {
        var st = C.currentStyle();
        SO.form({
            title: 's_font_dialog', width: 460,
            fields: [
                { type: 'row', fields: [
                    { name: 'ff', label: 's_font', type: 'select', value: st.ff, options: function () { var l = SO.FONTS.slice(); if (st.ff && l.indexOf(st.ff) === -1) l.unshift(st.ff); return l.map(function (f) { return { value: f, text: f }; }); } },
                    { name: 'fs', label: 's_font_size', type: 'number', min: 1, max: 400, step: 0.5, value: st.fs || 18 }
                ] },
                { name: 'color', label: 's_font_color', type: 'color', value: st.color || '#000000' },
                { type: 'row', fields: [
                    { name: 'b', label: 's_bold', type: 'checkbox', value: st.b }, { name: 'i', label: 's_italic', type: 'checkbox', value: st.i },
                    { name: 'u', label: 's_underline', type: 'checkbox', value: st.u }, { name: 's', label: 's_strike', type: 'checkbox', value: st.s }
                ] },
                { name: 'caps', label: 's_all_caps', type: 'checkbox', value: false },
                { name: 'ls', label: 's_char_spacing', type: 'number', min: -5, max: 50, step: 0.5, value: 0 }
            ]
        }).then(function (v) {
            if (!v) return;
            if (v.ff && v.ff !== st.ff) C.fontName(v.ff);
            if (v.fs && v.fs !== st.fs) C.fontSize(v.fs);
            if (v.color && v.color.toUpperCase() !== (st.color || '').toUpperCase()) C.fontColor(v.color.toUpperCase());
            [['b', 'bold'], ['i', 'italic'], ['u', 'underline'], ['s', 'strikeThrough']].forEach(function (k) { if (!!v[k[0]] !== !!st[k[0]]) C.textCmd(k[1]); });
            if (v.caps || v.ls) {
                if (App.editing) { var id = App.editing.id; C.endEdit(); App.select([id]); }
                App.change('font-extra', function () { App.selected().forEach(function (e) { if (!e.st) return; e.st.caps = v.caps || undefined; e.st.ls = v.ls || undefined; }); });
            }
        });
    };

    C.linkDialog = function () {
        var ed = App.editing;
        var sel = window.getSelection();
        var range = ed && ed.tx && sel.rangeCount && ed.tx.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
        var existing = '';
        if (range) { var a = (range.startContainer.nodeType === 3 ? range.startContainer.parentNode : range.startContainer).closest('a'); if (a) existing = a.getAttribute('href'); }
        var target = !ed ? App.selected()[0] : null;
        if (!ed && !target) { SO.toast('s_select_object_first', { type: 'warn' }); return; }
        if (target && target.link) existing = target.link;
        var slides = App.deck.slides.map(function (s, i) { return { value: '#slide-' + s.id, text: (i + 1) + '. ' + (M.slideTitle(s) || SO.t('s_untitled_slide')) }; });
        SO.form({
            title: 's_link', width: 460,
            fields: [
                { name: 'kind', label: 's_link_to', type: 'select', value: /^#slide-/.test(existing) ? 'slide' : 'url', options: [{ value: 'url', label: 's_link_web' }, { value: 'slide', label: 's_link_slide' }] },
                { name: 'url', label: 's_address', type: 'text', value: /^#slide-/.test(existing) ? '' : existing, placeholder: 'https://' },
                { name: 'slide', label: 's_slide', type: 'select', value: existing, options: slides },
                { name: 'text', label: 's_display_text', type: 'text', value: range ? range.toString() : '', placeholder: 's_display_text_ph' }
            ],
            onChange: function (v, dlg, inputs) {
                inputs.url.closest('.so-field').hidden = v.kind !== 'url';
                inputs.slide.closest('.so-field').hidden = v.kind !== 'slide';
                inputs.text.closest('.so-field').hidden = !ed;
            }
        }).then(function (v) {
            if (!v) return;
            var href = v.kind === 'slide' ? v.slide : v.url.trim();
            if (href && v.kind === 'url' && !/^(https?:|mailto:)/i.test(href)) href = 'https://' + href;
            if (ed) {
                ed.tx.focus();
                if (range) { sel.removeAllRanges(); sel.addRange(range); }
                if (!href) { document.execCommand('unlink'); C.commitTextSoon(); return; }
                if (range && range.collapsed) document.execCommand('insertHTML', false, '<a href="' + SO.esc(href) + '">' + SO.esc(v.text || href) + '</a>');
                else document.execCommand('createLink', false, href);
                C.commitTextSoon();
                return;
            }
            App.change('link', function () { App.selected().forEach(function (e) { e.link = href || undefined; }); });
        });
    };

    C.headerFooterDialog = function () {
        var ft = App.deck.footer || {};
        SO.form({
            title: 's_header_footer', width: 460,
            fields: [
                { name: 'date', label: 's_hf_date', type: 'checkbox', value: ft.date },
                { name: 'dateText', label: 's_hf_date_fixed', type: 'text', value: ft.dateText || '', placeholder: 's_hf_date_auto' },
                { name: 'num', label: 's_hf_number', type: 'checkbox', value: ft.num },
                { name: 'show', label: 's_hf_footer', type: 'checkbox', value: !!ft.text },
                { name: 'text', label: 's_hf_footer_text', type: 'text', value: ft.text || '' },
                { name: 'skipTitle', label: 's_hf_skip_title', type: 'checkbox', value: ft.skipTitle !== false }
            ]
        }).then(function (v) {
            if (!v) return;
            App.change('header-footer', function () {
                App.deck.footer = { date: v.date, dateText: v.dateText.trim(), num: v.num, text: v.show ? v.text.trim() : '', show: v.date || v.num || (v.show && !!v.text.trim()), skipTitle: v.skipTitle };
            }, { render: 'all' });
        });
    };

    C.slideSizeDialog = function () {
        var sz = App.deck.size;
        SO.form({
            title: 's_slide_size', width: 440,
            fields: [
                { name: 'preset', label: 's_slide_size', type: 'select', value: sz.id, options: M.SIZES.map(function (s) { return { value: s.id, label: s.label }; }).concat([{ value: 'custom', label: 's_size_custom' }]) },
                { type: 'row', fields: [
                    { name: 'w', label: 's_width_cm', type: 'number', min: 2, max: 150, step: 0.1, value: toCm(sz.w) },
                    { name: 'h', label: 's_height_cm', type: 'number', min: 2, max: 150, step: 0.1, value: toCm(sz.h) }
                ] },
                { name: 'mode', label: 's_scale_content', type: 'select', value: 'fit', options: [{ value: 'fit', label: 's_scale_fit' }, { value: 'maximize', label: 's_scale_max' }] }
            ],
            onChange: function (v, dlg, inputs) {
                var p = M.SIZES.filter(function (s) { return s.id === v.preset; })[0];
                if (p && dlg._last !== v.preset) { inputs.w.value = toCm(p.w); inputs.h.value = toCm(p.h); }
                dlg._last = v.preset;
                inputs.w.disabled = inputs.h.disabled = v.preset !== 'custom';
            }
        }).then(function (v) {
            if (!v) return;
            var p = M.SIZES.filter(function (s) { return s.id === v.preset; })[0];
            var w = p ? p.w : Math.round(fromCm(v.w)), h = p ? p.h : Math.round(fromCm(v.h));
            if (w === sz.w && h === sz.h) return;
            App.change('slide-size', function () { M.resizeDeck(App.deck, w, h, v.mode); }, { render: 'all' });
            setTimeout(function () { App.setZoom(0, true); }, 0);
        });
    };
})(window);
