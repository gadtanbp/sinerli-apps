/**
 * Sinerli Office — inti bersama Sinerli Dokum, Sinerli Hitara, dan Sinerli Present.
 *
 * Isi:
 *   - utilitas DOM & i18n (kamus di office-i18n.js, format [id, en, zh])
 *   - tooltip, menu tarik-turun, pemilih warna, dialog, toast
 *   - pembangun Ribbon deklaratif (tab → grup → kontrol)
 *   - pemuat pustaka CDN malas (docx, SheetJS, PptxGenJS, Chart.js, …)
 *   - penyimpanan: draf lokal (IndexedDB), riwayat versi, cloud (api/projects.php)
 *   - DocSession (autosave) dan Backstage (menu File)
 *
 * Skrip biasa (bukan modul) supaya bisa dimuat tanpa bundler dan dibaca
 * berurutan oleh skrip aplikasi.
 */
(function (global) {
    'use strict';

    var SO = global.SO = global.SO || {};
    var doc = document;
    var LANGS = ['id', 'en', 'zh'];
    var LOCALES = { id: 'id-ID', en: 'en-US', zh: 'zh-CN' };

    SO.root = global.SO_ROOT || '../../../';
    SO.isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
    SO.isTouch = ('ontouchstart' in global) || navigator.maxTouchPoints > 0;

    // ================================================================ utils
    SO.$ = function (sel, root) { return (root || doc).querySelector(sel); };
    SO.$$ = function (sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); };

    /** Membuat elemen: SO.el('button', {class:'x', onclick: fn, dataset:{a:1}}, 'teks', childNode) */
    SO.el = function (tag, attrs) {
        var node = doc.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                var v = attrs[k];
                if (v === undefined || v === null || v === false) return;
                if (k === 'class') node.className = v;
                else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
                else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
                else if (k === 'html') node.innerHTML = v;
                else if (k === 'text') node.textContent = v;
                else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
                else if (v === true) node.setAttribute(k, '');
                else node.setAttribute(k, v);
            });
        }
        for (var i = 2; i < arguments.length; i++) {
            var c = arguments[i];
            if (c === null || c === undefined || c === false) continue;
            if (Array.isArray(c)) c.forEach(function (cc) { if (cc) node.append(cc); });
            else node.append(c);
        }
        return node;
    };

    SO.esc = function (s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };
    SO.uid = function (prefix) {
        return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    };
    SO.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
    SO.debounce = function (fn, ms) {
        var t = null;
        var d = function () {
            var args = arguments, self = this;
            clearTimeout(t);
            t = setTimeout(function () { t = null; fn.apply(self, args); }, ms);
        };
        d.cancel = function () { clearTimeout(t); t = null; };
        d.flush = function () { if (t) { clearTimeout(t); t = null; fn(); } };
        return d;
    };
    SO.throttleFrame = function (fn) {
        var queued = false;
        return function () {
            if (queued) return;
            queued = true;
            requestAnimationFrame(function () { queued = false; fn(); });
        };
    };
    SO.mod = function (e) { return SO.isMac ? e.metaKey : e.ctrlKey; };
    SO.keyLabel = function (combo) {
        if (!combo) return '';
        if (SO.isMac) {
            return combo.replace(/Mod\+/g, '⌘').replace(/Ctrl\+/g, '⌃').replace(/Shift\+/g, '⇧')
                .replace(/Alt\+/g, '⌥');
        }
        return combo.replace(/Mod\+/g, 'Ctrl+');
    };
    SO.deepClone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };
    SO.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    // ================================================================= i18n
    SO.lang = function () {
        var l = null;
        try { l = localStorage.getItem('sinerli_lang'); } catch (e) {}
        return LANGS.indexOf(l) !== -1 ? l : 'id';
    };
    SO.locale = function () { return LOCALES[SO.lang()]; };

    /** Terjemahan. Kunci yang tidak ada di kamus dikembalikan apa adanya. */
    SO.t = function (key, vars) {
        if (key == null) return '';
        var dict = global.SO_I18N || {};
        var entry = dict[key];
        var s;
        if (Array.isArray(entry)) s = entry[LANGS.indexOf(SO.lang())] || entry[0];
        else s = String(key);
        if (vars) {
            s = s.replace(/\{(\w+)\}/g, function (m, k) {
                if (vars[k] == null) return m;
                return typeof vars[k] === 'number' ? SO.fmtNum(vars[k]) : vars[k];
            });
        }
        return s;
    };
    SO.has = function (key) { return !!(global.SO_I18N && global.SO_I18N[key]); };
    SO.fmtNum = function (n, opts) {
        try { return new Intl.NumberFormat(SO.locale(), opts).format(n); } catch (e) { return String(n); }
    };
    SO.fmtDate = function (d, opts) {
        try {
            return new Intl.DateTimeFormat(SO.locale(), opts || { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
        } catch (e) { return String(d); }
    };

    SO.applyI18n = function (root) {
        root = root || doc;
        SO.$$('[data-lang]', root).forEach(function (n) {
            var s = SO.t(n.getAttribute('data-lang'));
            if (s.indexOf('<') !== -1) n.innerHTML = s; else n.textContent = s;
        });
        SO.$$('[data-lang-ph]', root).forEach(function (n) { n.setAttribute('placeholder', SO.t(n.getAttribute('data-lang-ph'))); });
        SO.$$('[data-lang-title]', root).forEach(function (n) {
            var s = SO.t(n.getAttribute('data-lang-title'));
            n.setAttribute('title', s);
            n.setAttribute('aria-label', s);
        });
        SO.$$('[data-lang-aria]', root).forEach(function (n) { n.setAttribute('aria-label', SO.t(n.getAttribute('data-lang-aria'))); });
        // Tombol ikon di HTML (status bar, tampilan slide) hanya punya data-tip;
        // tooltip itu tidak terbaca pembaca layar. Nama aksesibel diambil dari
        // teks tooltip yang sama. Tombol yang punya label sendiri tidak disentuh.
        SO.$$('button[data-tip]', root).forEach(function (n) {
            if (n.hasAttribute('data-lang-aria') || n.textContent.trim()) return;
            if (n.hasAttribute('aria-label') && !n.hasAttribute('data-tip-aria')) return;
            n.setAttribute('aria-label', SO.t(n.getAttribute('data-tip')));
            n.setAttribute('data-tip-aria', '');
        });
    };

    SO.setLang = function (lang) {
        if (LANGS.indexOf(lang) === -1) return;
        try { localStorage.setItem('sinerli_lang', lang); } catch (e) {}
        doc.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : lang);
        SO.applyI18n(doc);
        doc.dispatchEvent(new CustomEvent('sinerli:langchange', { detail: { lang: lang } }));
    };
    SO.onLang = function (cb) { doc.addEventListener('sinerli:langchange', cb); };

    // ========================================================== konteks user
    SO.ctx = (function () {
        var p = new URLSearchParams(global.location.search);
        var profile = null;
        try { profile = JSON.parse(localStorage.getItem('sinerli_user_profile') || 'null'); } catch (e) {}
        var apiKey = '';
        try { apiKey = localStorage.getItem('sinerli_api_key') || ''; } catch (e) {}
        var email = p.get('userId') || (profile && profile.email) || '';
        var plan = p.get('plan') || '';
        if (!plan && profile && profile.uid) {
            try { plan = localStorage.getItem('sinerli_tier_' + profile.uid) || ''; } catch (e) {}
        }
        return {
            params: p,
            email: email,
            plan: plan || 'free',
            apiKey: apiKey,
            name: (profile && (profile.name || profile.displayName)) || (email ? email.split('@')[0] : ''),
            photo: (profile && profile.photoURL) || '',
            projectId: p.get('id') || '',
            draft: p.get('draft') || '',
            // Token tautan berbagi (App Grafik): dikirim ke server saat membuka/
            // menyimpan projek milik orang lain. Kosong untuk projek sendiri.
            share: /^[a-f0-9]{32}$/i.test(p.get('share') || '') ? p.get('share').toLowerCase() : ''
        };
    })();

    SO.updateUrl = function (changes) {
        var p = new URLSearchParams(global.location.search);
        Object.keys(changes).forEach(function (k) {
            if (changes[k] === null || changes[k] === undefined || changes[k] === '') p.delete(k);
            else p.set(k, changes[k]);
        });
        var q = p.toString();
        try { history.replaceState(null, '', global.location.pathname + (q ? '?' + q : '')); } catch (e) {}
    };

    // ============================================================== tooltip
    (function initTooltip() {
        var timer = null, tipEl = null, target = null;
        function hide() {
            clearTimeout(timer);
            target = null;
            if (tipEl) { tipEl.remove(); tipEl = null; }
        }
        function show(t) {
            if (!t.isConnected) return;
            var label = SO.t(t.getAttribute('data-tip'));
            var key = t.getAttribute('data-tip-key');
            var desc = t.getAttribute('data-tip-desc');
            tipEl = SO.el('div', { class: 'so-tooltip', role: 'tooltip' });
            tipEl.innerHTML = '<b>' + SO.esc(label) + (key ? '<span class="tt-short">(' + SO.esc(SO.keyLabel(key)) + ')</span>' : '') + '</b>' +
                (desc ? '<span class="tt-desc">' + SO.esc(SO.t(desc)) + '</span>' : '');
            doc.body.appendChild(tipEl);
            var r = t.getBoundingClientRect();
            var w = tipEl.offsetWidth, h = tipEl.offsetHeight;
            var x = SO.clamp(r.left + r.width / 2 - w / 2, 6, innerWidth - w - 6);
            var y = r.bottom + 6;
            if (y + h > innerHeight - 6) y = r.top - h - 6;
            tipEl.style.left = x + 'px';
            tipEl.style.top = y + 'px';
        }
        doc.addEventListener('mouseover', function (e) {
            if (SO.isTouch && e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
            var t = e.target.closest && e.target.closest('[data-tip]');
            if (t === target) return;
            hide();
            if (!t || doc.querySelector('.so-menu')) return;
            target = t;
            timer = setTimeout(function () { show(t); }, 600);
        });
        doc.addEventListener('mousedown', hide, true);
        doc.addEventListener('keydown', hide, true);
        global.addEventListener('scroll', hide, true);
        SO.hideTooltip = hide;
    })();

    // ================================================================ menus
    var openMenus = [];

    function closeMenusFrom(level) {
        while (openMenus.length > level) {
            var m = openMenus.pop();
            m.el.remove();
            if (m.onClose) m.onClose();
        }
    }
    SO.closeMenus = function () { closeMenusFrom(0); };

    function anchorRect(anchor) {
        if (!anchor) return { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 2, bottom: innerHeight / 2, width: 0, height: 0 };
        if (anchor.getBoundingClientRect) return anchor.getBoundingClientRect();
        if (anchor.x !== undefined && anchor.left === undefined) {
            return { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y, width: 0, height: 0 };
        }
        return anchor;
    }

    function positionPopup(el, anchor, opts) {
        var r = anchorRect(anchor);
        var w = el.offsetWidth, h = el.offsetHeight;
        var x, y;
        if (opts.side === 'right') {
            x = r.right - 2; y = r.top - 4;
            if (x + w > innerWidth - 6) x = r.left - w + 2;
            if (y + h > innerHeight - 6) y = Math.max(6, innerHeight - h - 6);
        } else {
            x = opts.align === 'right' ? r.right - w : r.left;
            y = r.bottom + 2;
            if (y + h > innerHeight - 6) {
                if (r.top - h - 2 >= 6) y = r.top - h - 2;
                else y = Math.max(6, innerHeight - h - 6);
            }
        }
        x = SO.clamp(x, 6, Math.max(6, innerWidth - w - 6));
        el.style.left = Math.round(x) + 'px';
        el.style.top = Math.round(y) + 'px';
    }

    function resolveItems(items) {
        return (typeof items === 'function' ? items() : items) || [];
    }

    /**
     * Menu tarik-turun.
     * item: {label|text, icon, key, cmd, value, checked, disabled, danger, sep, head,
     *        submenu, onClick(item), custom(el, close), style, labelHtml}
     */
    SO.menu = function (anchor, items, opts) {
        opts = opts || {};
        var level = opts._level || 0;
        closeMenusFrom(level);
        SO.hideTooltip();

        var el = SO.el('div', { class: 'so-menu' + (opts.className ? ' ' + opts.className : ''), role: 'menu' });
        if (opts.minWidth) el.style.minWidth = opts.minWidth + 'px';
        var buttons = [];
        var entry = { el: el, onClose: opts.onClose };

        function activate(item) {
            if (item.disabled) return;
            SO.closeMenus();
            if (item.onClick) item.onClick(item);
            else if (item.cmd && opts.onCommand) opts.onCommand(item.cmd, item.value, item);
        }

        resolveItems(items).forEach(function (item) {
            if (!item) return;
            if (item.sep) { el.appendChild(SO.el('div', { class: 'so-menu-sep' })); return; }
            if (item.head) { el.appendChild(SO.el('div', { class: 'so-menu-head', text: SO.t(item.head) })); return; }
            if (item.custom) {
                var box = SO.el('div', { class: 'so-menu-custom' });
                item.custom(box, SO.closeMenus);
                el.appendChild(box);
                return;
            }
            var cls = 'so-menu-item' + (item.checked ? ' is-checked' : '') + (item.danger ? ' is-danger' : '');
            var btn = SO.el('button', { type: 'button', class: cls, role: 'menuitem', disabled: !!item.disabled });
            var label = item.text != null ? SO.esc(item.text) : SO.esc(SO.t(item.label));
            btn.innerHTML = '<span class="mi-icon">' + (item.icon && !item.checked ? '<i class="' + (item.icon.indexOf(' ') === -1 ? 'fas ' : '') + item.icon + '"></i>' : '') + '</span>' +
                '<span class="mi-label"' + (item.style ? ' style="' + SO.esc(item.style) + '"' : '') + '>' + (item.labelHtml || label) + '</span>' +
                (item.key ? '<span class="mi-short">' + SO.esc(SO.keyLabel(item.key)) + '</span>' : '') +
                (item.submenu ? '<span class="mi-sub"><i class="fas fa-chevron-right"></i></span>' : '');
            btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
            if (item.submenu) {
                var openSub = function () {
                    if (btn._subOpen && openMenus.length > level + 1) return;
                    btn._subOpen = true;
                    SO.menu(btn, item.submenu, Object.assign({}, opts, {
                        _level: level + 1, side: 'right', className: null, minWidth: null,
                        onClose: function () { btn._subOpen = false; }
                    }));
                };
                btn.addEventListener('mouseenter', openSub);
                btn.addEventListener('click', openSub);
            } else {
                btn.addEventListener('mouseenter', function () { closeMenusFrom(level + 1); });
                btn.addEventListener('click', function () { activate(item); });
            }
            btn._item = item;
            buttons.push(btn);
            el.appendChild(btn);
        });

        doc.body.appendChild(el);
        openMenus.push(entry);
        positionPopup(el, anchor, opts);

        el.addEventListener('keydown', function (e) {
            var enabled = buttons.filter(function (b) { return !b.disabled; });
            var idx = enabled.indexOf(doc.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); (enabled[(idx + 1) % enabled.length] || enabled[0]).focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); (enabled[(idx - 1 + enabled.length) % enabled.length] || enabled[0]).focus(); }
            else if (e.key === 'ArrowRight' && doc.activeElement && doc.activeElement._item && doc.activeElement._item.submenu) { e.preventDefault(); doc.activeElement.click(); }
            else if (e.key === 'ArrowLeft' && level > 0) { e.preventDefault(); closeMenusFrom(level); }
        });
        if (opts.focus) { var first = buttons.filter(function (b) { return !b.disabled; })[0]; if (first) first.focus(); }
        return { el: el, close: function () { closeMenusFrom(level); } };
    };

    doc.addEventListener('mousedown', function (e) {
        if (!openMenus.length) return;
        if (e.target.closest && e.target.closest('.so-menu')) return;
        SO.closeMenus();
    }, true);
    doc.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && openMenus.length) { e.preventDefault(); e.stopPropagation(); closeMenusFrom(openMenus.length - 1); }
    }, true);
    global.addEventListener('resize', function () { SO.closeMenus(); });
    global.addEventListener('blur', function () { SO.closeMenus(); });

    /** Menu konteks di posisi kursor. */
    SO.contextMenu = function (e, items, opts) {
        e.preventDefault();
        return SO.menu({ x: e.clientX, y: e.clientY }, items, opts);
    };

    // ========================================================= color picker
    var THEME_BASE = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];
    var STANDARD = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];

    function hexToRgb(hex) {
        var h = String(hex || '').replace('#', '');
        if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
        var n = parseInt(h, 16);
        if (isNaN(n) || h.length !== 6) return null;
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(function (v) { return ('0' + Math.round(SO.clamp(v, 0, 255)).toString(16)).slice(-2); }).join('').toUpperCase();
    }
    SO.hexToRgb = hexToRgb;
    SO.rgbToHex = rgbToHex;
    /** Menormalkan warna CSS apa pun (rgb(), nama) ke #RRGGBB, atau null. */
    SO.toHex = function (css) {
        if (!css) return null;
        css = String(css).trim();
        if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(css)) { var rgb = hexToRgb(css); return rgbToHex(rgb[0], rgb[1], rgb[2]); }
        var m = css.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i);
        if (m) {
            if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
            return rgbToHex(+m[1], +m[2], +m[3]);
        }
        var c = doc.createElement('canvas').getContext('2d');
        c.fillStyle = '#010203';
        c.fillStyle = css;
        return c.fillStyle === '#010203' && css.toLowerCase() !== '#010203' ? null : SO.toHex(c.fillStyle);
    };
    function tint(hex, amount) {
        var c = hexToRgb(hex);
        if (!c) return hex;
        if (amount >= 0) return rgbToHex(c[0] + (255 - c[0]) * amount, c[1] + (255 - c[1]) * amount, c[2] + (255 - c[2]) * amount);
        return rgbToHex(c[0] * (1 + amount), c[1] * (1 + amount), c[2] * (1 + amount));
    }
    SO.tint = tint;

    function recentColors() {
        try { return JSON.parse(localStorage.getItem('so_recent_colors') || '[]'); } catch (e) { return []; }
    }
    function pushRecent(c) {
        if (!c) return;
        var list = recentColors().filter(function (x) { return x !== c; });
        list.unshift(c);
        try { localStorage.setItem('so_recent_colors', JSON.stringify(list.slice(0, 10))); } catch (e) {}
    }

    /** Pemilih warna ala Office. opts: {value, allowNone, noneLabel, autoLabel, themeColors, onPick(color|null)} */
    SO.colorPicker = function (anchor, opts) {
        opts = opts || {};
        var current = (opts.value || '').toUpperCase();
        return SO.menu(anchor, [{
            custom: function (box, close) {
                box.className = 'so-colorpick';
                function pick(c) { pushRecent(c); close(); if (opts.onPick) opts.onPick(c); }
                function swatch(c, title) {
                    var b = SO.el('button', { type: 'button', class: 'so-swatch' + (c.toUpperCase() === current ? ' is-current' : ''), title: title || c, style: { background: c } });
                    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
                    b.addEventListener('click', function () { pick(c.toUpperCase()); });
                    return b;
                }
                if (opts.autoLabel) {
                    var auto = SO.el('button', { type: 'button', class: 'so-menu-item' });
                    auto.innerHTML = '<span class="mi-icon"><span style="display:inline-block;width:14px;height:14px;background:#000;border-radius:2px"></span></span><span class="mi-label">' + SO.esc(SO.t(opts.autoLabel)) + '</span>';
                    auto.addEventListener('mousedown', function (e) { e.preventDefault(); });
                    auto.addEventListener('click', function () { close(); if (opts.onPick) opts.onPick('auto'); });
                    box.appendChild(auto);
                }
                var base = opts.themeColors || THEME_BASE;
                box.appendChild(SO.el('div', { class: 'so-colorpick-title', text: SO.t('c_theme_colors') }));
                var g1 = SO.el('div', { class: 'so-colorpick-grid' });
                base.forEach(function (c) { g1.appendChild(swatch(c)); });
                box.appendChild(g1);
                var g2 = SO.el('div', { class: 'so-colorpick-grid is-shades', style: { marginTop: '4px' } });
                [0.8, 0.6, 0.4, -0.25, -0.5].forEach(function (amt) {
                    base.forEach(function (c, i) {
                        // Putih hanya bisa digelapkan, hitam hanya bisa diterangkan.
                        var a = amt;
                        if (i === 0) a = [-0.05, -0.15, -0.25, -0.35, -0.5][[0.8, 0.6, 0.4, -0.25, -0.5].indexOf(amt)];
                        if (i === 1) a = [0.5, 0.35, 0.25, 0.15, 0.05][[0.8, 0.6, 0.4, -0.25, -0.5].indexOf(amt)];
                        g2.appendChild(swatch(tint(c, a)));
                    });
                });
                box.appendChild(g2);
                box.appendChild(SO.el('div', { class: 'so-colorpick-title', style: { marginTop: '8px' }, text: SO.t('c_standard_colors') }));
                var g3 = SO.el('div', { class: 'so-colorpick-grid' });
                STANDARD.forEach(function (c) { g3.appendChild(swatch(c)); });
                box.appendChild(g3);
                var rec = recentColors();
                if (rec.length) {
                    box.appendChild(SO.el('div', { class: 'so-colorpick-title', style: { marginTop: '8px' }, text: SO.t('c_recent_colors') }));
                    var g4 = SO.el('div', { class: 'so-colorpick-grid' });
                    rec.forEach(function (c) { g4.appendChild(swatch(c)); });
                    box.appendChild(g4);
                }
                var actions = SO.el('div', { class: 'so-colorpick-actions' });
                if (opts.allowNone) {
                    var none = SO.el('button', { type: 'button', class: 'so-menu-item' });
                    none.innerHTML = '<span class="mi-icon"><i class="fas fa-ban"></i></span><span class="mi-label">' + SO.esc(SO.t(opts.noneLabel || 'c_no_color')) + '</span>';
                    none.addEventListener('mousedown', function (e) { e.preventDefault(); });
                    none.addEventListener('click', function () { close(); if (opts.onPick) opts.onPick(null); });
                    actions.appendChild(none);
                }
                var more = SO.el('button', { type: 'button', class: 'so-menu-item' });
                more.innerHTML = '<span class="mi-icon"><i class="fas fa-palette"></i></span><span class="mi-label">' + SO.esc(SO.t('c_more_colors')) + '</span>';
                var native = SO.el('input', { type: 'color', value: /^#[0-9A-F]{6}$/i.test(current) ? current.toLowerCase() : '#000000', style: { position: 'absolute', opacity: 0, width: '1px', height: '1px', pointerEvents: 'none' } });
                native.addEventListener('change', function () { pick(native.value.toUpperCase()); });
                more.addEventListener('mousedown', function (e) { e.preventDefault(); });
                more.addEventListener('click', function () { native.click(); });
                actions.appendChild(more);
                actions.appendChild(native);
                box.appendChild(actions);
            }
        }], { className: 'so-menu-color' });
    };

    // =============================================================== dialogs
    var dialogStack = [];

    /**
     * Dialog modal. Mengembalikan Promise yang selesai dengan nilai tombol.
     * opts: {title, body (string HTML | Node | fn(bodyEl, dlg)), width, buttons:[{label, primary, danger, value, onClick(dlg)}], onOpen(dlg), dismissible}
     */
    SO.dialog = function (opts) {
        return new Promise(function (resolve) {
            SO.closeMenus();
            var overlay = SO.el('div', { class: 'so-overlay' });
            var box = SO.el('div', { class: 'so-dialog', role: 'dialog', 'aria-modal': 'true' });
            if (opts.width) box.style.maxWidth = typeof opts.width === 'number' ? opts.width + 'px' : opts.width;
            var head = SO.el('div', { class: 'so-dialog-head' },
                SO.el('h2', { class: 'so-dialog-title', text: SO.t(opts.title || '') }));
            var closeBtn = SO.el('button', { type: 'button', class: 'so-dialog-close', 'aria-label': SO.t('c_close'), html: '<i class="fas fa-xmark"></i>' });
            head.appendChild(closeBtn);
            var body = SO.el('div', { class: 'so-dialog-body' });
            box.appendChild(head);
            box.appendChild(body);
            var prevFocus = doc.activeElement;
            var done = false;
            var dlg = {
                el: box, body: body, overlay: overlay,
                $: function (s) { return box.querySelector(s); },
                $$: function (s) { return SO.$$(s, box); },
                close: function (val) {
                    if (done) return;
                    done = true;
                    overlay.remove();
                    dialogStack.splice(dialogStack.indexOf(dlg), 1);
                    if (opts.onClose) opts.onClose(val);
                    if (prevFocus && prevFocus.focus && prevFocus.isConnected) { try { prevFocus.focus({ preventScroll: true }); } catch (e) {} }
                    resolve(val);
                }
            };
            if (typeof opts.body === 'function') opts.body(body, dlg);
            else if (opts.body instanceof Node) body.appendChild(opts.body);
            else if (opts.body != null) body.innerHTML = opts.body;

            var buttons = opts.buttons || [{ label: 'c_ok', primary: true, value: true }];
            if (buttons.length) {
                var foot = SO.el('div', { class: 'so-dialog-foot' });
                buttons.forEach(function (b) {
                    var btn = SO.el('button', {
                        type: 'button',
                        class: 'so-btn' + (b.primary ? ' is-primary' : '') + (b.danger ? ' is-danger' : ''),
                        html: (b.icon ? '<i class="fas ' + b.icon + '"></i>' : '') + SO.esc(SO.t(b.label))
                    });
                    if (b.primary) btn.dataset.primary = '1';
                    btn.addEventListener('click', function () {
                        if (b.onClick && b.onClick(dlg) === false) return;
                        dlg.close(b.value !== undefined ? b.value : null);
                    });
                    foot.appendChild(btn);
                });
                box.appendChild(foot);
            }
            closeBtn.addEventListener('click', function () { dlg.close(null); });
            overlay.addEventListener('mousedown', function (e) {
                if (e.target === overlay && opts.dismissible !== false) dlg.close(null);
            });
            box.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dlg.close(null); }
                else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && !e.isComposing) {
                    var p = box.querySelector('[data-primary]');
                    if (p && opts.enterSubmits !== false) { e.preventDefault(); p.click(); }
                }
            });
            overlay.appendChild(box);
            doc.body.appendChild(overlay);
            dialogStack.push(dlg);
            if (opts.onOpen) opts.onOpen(dlg);
            var focusable = box.querySelector('[autofocus], .so-dialog-body input:not([type=hidden]):not([type=checkbox]):not([type=color]), .so-dialog-body textarea, .so-dialog-body select');
            setTimeout(function () {
                if (focusable) { focusable.focus(); if (focusable.select && focusable.type !== 'number') focusable.select(); }
                else { var p = box.querySelector('[data-primary]') || closeBtn; p.focus(); }
            }, 30);
        });
    };
    SO.isDialogOpen = function () { return dialogStack.length > 0; };

    SO.alert = function (msg, title) {
        return SO.dialog({ title: title || 'c_app_notice', body: '<p style="margin:6px 0 4px;white-space:pre-line">' + SO.esc(SO.t(msg)) + '</p>', buttons: [{ label: 'c_ok', primary: true, value: true }] });
    };
    SO.confirm = function (msg, opts) {
        opts = opts || {};
        return SO.dialog({
            title: opts.title || 'c_confirm',
            body: '<p style="margin:6px 0 4px;white-space:pre-line">' + SO.esc(SO.t(msg, opts.vars)) + '</p>',
            buttons: [
                { label: opts.cancelLabel || 'c_cancel', value: false },
                { label: opts.okLabel || 'c_ok', primary: !opts.danger, danger: !!opts.danger, value: true }
            ]
        }).then(function (v) { return v === true; });
    };
    SO.prompt = function (label, value, opts) {
        opts = opts || {};
        return SO.form({ title: opts.title || label, okLabel: opts.okLabel, fields: [{ name: 'v', label: label, type: opts.type || 'text', value: value == null ? '' : value, placeholder: opts.placeholder }] })
            .then(function (r) { return r ? r.v : null; });
    };

    function buildField(f, values) {
        if (f.type === 'row') {
            var row = SO.el('div', { class: 'so-form-row' });
            f.fields.forEach(function (sub) { row.appendChild(buildField(sub, values)); });
            return row;
        }
        if (f.type === 'html') return SO.el('div', { html: typeof f.html === 'function' ? f.html() : f.html });
        var id = SO.uid('f');
        var wrap = SO.el('div', { class: 'so-field' + (f.type === 'checkbox' ? ' is-inline' : '') });
        var input;
        if (f.type === 'select') {
            input = SO.el('select', { class: 'so-select', id: id, name: f.name });
            (typeof f.options === 'function' ? f.options() : f.options).forEach(function (o) {
                if (typeof o !== 'object') o = { value: o, label: String(o) };
                var opt = SO.el('option', { value: o.value, text: o.text != null ? o.text : SO.t(o.label) });
                if (String(o.value) === String(f.value)) opt.selected = true;
                input.appendChild(opt);
            });
        } else if (f.type === 'textarea') {
            input = SO.el('textarea', { class: 'so-input', id: id, name: f.name, rows: f.rows || 4, placeholder: f.placeholder ? SO.t(f.placeholder) : null });
            input.value = f.value == null ? '' : f.value;
        } else if (f.type === 'checkbox') {
            input = SO.el('input', { type: 'checkbox', id: id, name: f.name });
            input.checked = !!f.value;
        } else {
            input = SO.el('input', {
                class: 'so-input', id: id, name: f.name, type: f.type || 'text',
                min: f.min, max: f.max, step: f.step, placeholder: f.placeholder ? SO.t(f.placeholder) : null,
                autocomplete: 'off', spellcheck: f.spellcheck === false ? 'false' : null
            });
            if (f.type === 'color') input.value = (SO.toHex(f.value) || '#000000').toLowerCase();
            else input.value = f.value == null ? '' : f.value;
        }
        if (f.required) input.required = true;
        values[f.name] = input;
        var lab = SO.el('label', { for: id, text: SO.t(f.label || '') });
        if (f.type === 'checkbox') { wrap.appendChild(input); wrap.appendChild(lab); }
        else { if (f.label) wrap.appendChild(lab); wrap.appendChild(input); }
        if (f.hint) wrap.appendChild(SO.el('div', { class: 'so-field-hint', text: SO.t(f.hint) }));
        return wrap;
    }

    /** Formulir dalam dialog. Mengembalikan objek nilai, atau null bila dibatalkan. */
    SO.form = function (opts) {
        var inputs = {};
        function read() {
            var out = {};
            Object.keys(inputs).forEach(function (k) {
                var i = inputs[k];
                if (i.type === 'checkbox') out[k] = i.checked;
                else if (i.type === 'number') out[k] = i.value === '' ? null : parseFloat(i.value);
                else out[k] = i.value;
            });
            return out;
        }
        return SO.dialog({
            title: opts.title, width: opts.width || 440,
            body: function (body, dlg) {
                var form = SO.el('div', { class: 'so-form' });
                if (opts.intro) form.appendChild(SO.el('p', { style: { margin: '0 0 2px', color: 'var(--so-muted)' }, text: SO.t(opts.intro) }));
                opts.fields.forEach(function (f) { form.appendChild(buildField(f, inputs)); });
                body.appendChild(form);
                if (opts.onChange) {
                    form.addEventListener('input', function () { opts.onChange(read(), dlg, inputs); });
                    form.addEventListener('change', function () { opts.onChange(read(), dlg, inputs); });
                    setTimeout(function () { opts.onChange(read(), dlg, inputs); }, 0);
                }
                if (opts.onBuild) opts.onBuild(dlg, inputs);
            },
            buttons: [
                { label: 'c_cancel', value: null },
                {
                    label: opts.okLabel || 'c_ok', primary: true, value: 'ok',
                    onClick: function () {
                        if (opts.validate) {
                            var err = opts.validate(read());
                            if (err) { SO.toast(err, { type: 'error' }); return false; }
                        }
                    }
                }
            ]
        }).then(function (v) { return v === 'ok' ? read() : null; });
    };

    // ================================================================ toast
    var toastBox = null;
    SO.toast = function (msg, opts) {
        opts = opts || {};
        if (!toastBox) { toastBox = SO.el('div', { class: 'so-toasts', 'aria-live': 'polite' }); doc.body.appendChild(toastBox); }
        var type = opts.type || 'info';
        var icon = { info: 'fa-circle-info', success: 'fa-circle-check', error: 'fa-circle-exclamation', warn: 'fa-triangle-exclamation' }[type];
        var t = SO.el('div', { class: 'so-toast is-' + type, role: 'status' });
        t.innerHTML = '<i class="fas ' + icon + '"></i><span>' + SO.esc(SO.t(msg, opts.vars)) + '</span>';
        if (opts.action) {
            var a = SO.el('button', { type: 'button', class: 'so-btn is-sm', style: { marginLeft: '6px' }, text: SO.t(opts.action.label) });
            a.addEventListener('click', function () { opts.action.onClick(); t.remove(); });
            t.appendChild(a);
        }
        toastBox.appendChild(t);
        setTimeout(function () {
            t.classList.add('is-hiding');
            setTimeout(function () { t.remove(); }, 250);
        }, opts.ms || (type === 'error' ? 5000 : 2800));
        return t;
    };

    SO.busy = function (msg) {
        var el = SO.el('div', { class: 'so-busy' }, SO.el('div', { class: 'so-busy-box', html: '<i class="fas fa-circle-notch"></i><span>' + SO.esc(SO.t(msg || 'c_working')) + '</span>' }));
        doc.body.appendChild(el);
        return {
            set: function (m) { el.querySelector('span').textContent = SO.t(m); },
            done: function () { el.remove(); }
        };
    };

    // =============================================================== ribbon
    function iconHtml(icon) {
        if (!icon) return '';
        if (icon.charAt(0) === '<') return icon;
        return '<i class="' + (icon.indexOf('fa-') === 0 ? 'fas ' : '') + icon + '"></i>';
    }
    SO.iconHtml = iconHtml;

    /**
     * Ribbon deklaratif.
     * spec: {tabs:[{id,label,contextual,groups:[{label, items:[...]}]}], onCommand(cmd, value, ctrl), onFile()}
     */
    function Ribbon(root, spec) {
        this.root = root;
        this.spec = spec;
        this.reg = {};
        this.tabs = {};
        this.panels = {};
        this.active = null;
        // item spesifikasi → elemen DOM-nya; dipakai "Cari fitur" untuk menunjuk letak tombol.
        this.itemEls = typeof Map === 'function' ? new Map() : null;
        SO.activeRibbon = this;
        this.build();
    }

    /** Ikon bawaan per id tab. Spesifikasi tab boleh menimpanya lewat `icon`. */
    var TAB_ICONS = {
        home: 'fa-house', insert: 'fa-circle-plus', layout: 'fa-ruler-combined', page: 'fa-ruler-combined',
        references: 'fa-book-bookmark', formulas: 'fa-square-root-variable', data: 'fa-database',
        design: 'fa-palette', transitions: 'fa-right-left', animations: 'fa-wand-sparkles', show: 'fa-circle-play',
        review: 'fa-spell-check', view: 'fa-eye', ai: 'fa-robot',
        table: 'fa-table', tableDesign: 'fa-table', picture: 'fa-image', pictureFormat: 'fa-image',
        chart: 'fa-chart-column', chartDesign: 'fa-chart-column', shapeFormat: 'fa-shapes'
    };

    function tabInner(icon, labelKey) {
        return (icon ? '<i class="fas ' + icon + ' so-tab-ic" aria-hidden="true"></i>' : '') +
            '<span data-lang="' + SO.esc(labelKey) + '">' + SO.esc(SO.t(labelKey)) + '</span>';
    }

    Ribbon.prototype.exec = function (cmd, value, ctrl) {
        if (!cmd) return;
        SO.hideTooltip();
        if (this.spec.onCommand) this.spec.onCommand(cmd, value, ctrl);
    };

    Ribbon.prototype.register = function (cmd, entry) {
        if (!cmd) return;
        (this.reg[cmd] = this.reg[cmd] || []).push(entry);
    };

    Ribbon.prototype.build = function () {
        var self = this;
        var root = this.root;
        root.classList.add('so-ribbon');
        root.innerHTML = '';
        var tabsEl = SO.el('div', { class: 'so-tabs', role: 'tablist' });
        var panelsEl = SO.el('div', { class: 'so-panels' });
        if (this.spec.onFile) {
            // Label ada di <span data-lang> supaya ganti bahasa tidak menghapus ikonnya.
            var fileTab = SO.el('button', { type: 'button', class: 'so-tab so-tab-file', 'data-tip': 'c_file_tip', html: tabInner('fa-bars', 'c_file') });
            fileTab.addEventListener('click', function () { self.spec.onFile(); });
            tabsEl.appendChild(fileTab);
            tabsEl.appendChild(SO.el('span', { class: 'so-tabs-sep', 'aria-hidden': 'true' }));
        }
        this.spec.tabs.forEach(function (tab) {
            var tb = SO.el('button', { type: 'button', class: 'so-tab' + (tab.contextual ? ' is-contextual' : ''), role: 'tab', html: tabInner(tab.icon || TAB_ICONS[tab.id], tab.label), dataset: { tab: tab.id } });
            tb.addEventListener('mousedown', function (e) { e.preventDefault(); });
            tb.addEventListener('click', function () {
                if (root.classList.contains('is-collapsed')) {
                    if (self.active === tab.id && root.classList.contains('is-peek')) { root.classList.remove('is-peek'); return; }
                    self.select(tab.id);
                    root.classList.add('is-peek');
                    return;
                }
                self.select(tab.id);
            });
            tb.addEventListener('dblclick', function () { self.toggleCollapse(); });
            if (tab.contextual) tb.hidden = true;
            tabsEl.appendChild(tb);
            self.tabs[tab.id] = tb;
            var panel = SO.el('div', { class: 'so-panel', role: 'tabpanel', dataset: { tab: tab.id } });
            tab.groups.forEach(function (g) {
                var group = SO.el('div', { class: 'so-group' });
                var gb = SO.el('div', { class: 'so-group-body' });
                g.items.forEach(function (it) { self.renderItem(it, gb); });
                group.appendChild(gb);
                if (g.label) group.appendChild(SO.el('div', { class: 'so-group-label', 'data-lang': g.label, text: SO.t(g.label) }));
                panel.appendChild(group);
            });
            panelsEl.appendChild(panel);
            self.panels[tab.id] = panel;
        });
        tabsEl.appendChild(SO.el('div', { class: 'so-tabs-spacer' }));
        var toggle = SO.el('button', { type: 'button', class: 'so-ribbon-toggle', 'aria-label': SO.t('c_ribbon_toggle'), 'data-tip': 'c_ribbon_toggle', 'data-tip-key': 'Mod+F1', html: '<i class="fas fa-chevron-up"></i>' });
        toggle.addEventListener('click', function () { self.toggleCollapse(); });
        this.toggleBtn = toggle;
        tabsEl.appendChild(toggle);
        root.appendChild(tabsEl);
        root.appendChild(panelsEl);
        var first = this.spec.tabs.filter(function (t) { return !t.contextual; })[0];
        if (first) this.select(first.id);
        var collapsed = false;
        try { collapsed = localStorage.getItem('so_ribbon_collapsed') === '1'; } catch (e) {}
        if (collapsed) this.toggleCollapse(true);
        doc.addEventListener('mousedown', function (e) {
            if (root.classList.contains('is-peek') && !root.contains(e.target) && !(e.target.closest && e.target.closest('.so-menu'))) root.classList.remove('is-peek');
        });
    };

    Ribbon.prototype.toggleCollapse = function (force) {
        var c = typeof force === 'boolean' ? force : !this.root.classList.contains('is-collapsed');
        this.root.classList.toggle('is-collapsed', c);
        this.root.classList.remove('is-peek');
        this.toggleBtn.innerHTML = '<i class="fas fa-chevron-' + (c ? 'down' : 'up') + '"></i>';
        try { localStorage.setItem('so_ribbon_collapsed', c ? '1' : '0'); } catch (e) {}
        global.dispatchEvent(new Event('resize'));
    };

    Ribbon.prototype.select = function (id) {
        var self = this;
        Object.keys(this.tabs).forEach(function (k) {
            self.tabs[k].classList.toggle('is-active', k === id);
            self.tabs[k].setAttribute('aria-selected', k === id ? 'true' : 'false');
            self.panels[k].classList.toggle('is-active', k === id);
        });
        this.active = id;
        if (this.spec.onTab) this.spec.onTab(id);
    };

    Ribbon.prototype.showContextual = function (id, visible, autoSelect) {
        var tb = this.tabs[id];
        if (!tb) return;
        var was = !tb.hidden;
        tb.hidden = !visible;
        if (!visible && this.active === id) {
            var first = this.spec.tabs.filter(function (t) { return !t.contextual; })[0];
            this.select(first.id);
        }
        if (visible && !was && autoSelect) this.select(id);
    };

    Ribbon.prototype.renderItem = function (it, parent) {
        var self = this;
        if (!it) return;
        var t = it.t || 'btn';
        var el;
        if (t === 'rows') {
            el = SO.el('div', { class: 'so-rows' });
            it.rows.forEach(function (r) {
                var row = SO.el('div', { class: 'so-row' });
                r.forEach(function (sub) { self.renderItem(sub, row); });
                el.appendChild(row);
            });
        } else if (t === 'col') {
            el = SO.el('div', { class: 'so-col' });
            it.items.forEach(function (sub) { self.renderItem(sub, el); });
        } else if (t === 'sep') {
            el = SO.el('span', { style: { width: '1px', height: '20px', background: 'var(--so-border)', margin: '0 3px' } });
        } else if (t === 'btn' || t === 'drop') {
            el = this.makeButton(it, t === 'drop');
            if (t === 'drop') {
                el.addEventListener('click', function () {
                    SO.menu(el, it.menu, { onCommand: function (c, v, item) { self.exec(c, v, item); }, minWidth: it.menuWidth });
                });
            } else {
                el.addEventListener('click', function () { self.exec(it.cmd, it.value, el); });
                this.register(it.cmd, { type: 'btn', el: el, item: it });
            }
        } else if (t === 'split') {
            el = SO.el('div', { class: 'so-split' + (it.lg ? ' is-lg' : '') });
            var main = this.makeButton(Object.assign({}, it, { lg: false, showLabel: it.lg ? false : it.showLabel }), false);
            if (it.lg) {
                main.innerHTML = iconHtml(it.icon);
                main.style.minWidth = '52px';
                main.querySelector('i') && (main.querySelector('i').style.fontSize = '22px');
            }
            var arrow = SO.el('button', { type: 'button', class: 'so-rb so-split-arrow', 'aria-label': SO.t(it.label), 'data-tip': it.tip || it.label });
            arrow.innerHTML = it.lg ? '<span class="so-rb-label" data-lang="' + it.label + '">' + SO.esc(SO.t(it.label)) + '</span><i class="fas fa-caret-down so-caret"></i>' : '<i class="fas fa-caret-down so-caret"></i>';
            arrow.addEventListener('mousedown', function (e) { e.preventDefault(); });
            main.addEventListener('click', function () { self.exec(it.cmd, it.value, main); });
            arrow.addEventListener('click', function () {
                SO.menu(el, it.menu, { onCommand: function (c, v, item) { self.exec(c, v, item); }, minWidth: it.menuWidth });
            });
            el.appendChild(main);
            el.appendChild(arrow);
            this.register(it.cmd, { type: 'btn', el: main, item: it });
        } else if (t === 'color') {
            el = SO.el('div', { class: 'so-split' });
            var cmain = this.makeButton(Object.assign({}, it, { lg: false }), false);
            cmain.classList.add('has-colorbar');
            var bar = SO.el('span', { class: 'so-colorbar' });
            var entry = { type: 'color', el: cmain, bar: bar, value: it.value || '#FF0000', item: it };
            bar.style.background = entry.value || 'transparent';
            cmain.appendChild(bar);
            var carrow = SO.el('button', { type: 'button', class: 'so-rb so-split-arrow', 'aria-label': SO.t(it.label), 'data-tip': it.tip || it.label, html: '<i class="fas fa-caret-down so-caret"></i>' });
            carrow.addEventListener('mousedown', function (e) { e.preventDefault(); });
            cmain.addEventListener('click', function () { self.exec(it.cmd, entry.value, cmain); });
            carrow.addEventListener('click', function () {
                if (it.beforeOpen) it.beforeOpen();
                SO.colorPicker(el, {
                    value: entry.value, allowNone: it.allowNone, noneLabel: it.noneLabel, autoLabel: it.autoLabel,
                    themeColors: it.themeColors ? it.themeColors() : null,
                    onPick: function (c) {
                        entry.value = c;
                        bar.style.background = c && c !== 'auto' ? c : (c === 'auto' ? '#000' : 'transparent');
                        self.exec(it.cmd, c, cmain);
                    }
                });
            });
            el.appendChild(cmain);
            el.appendChild(carrow);
            this.register(it.cmd, entry);
        } else if (t === 'select') {
            el = SO.el('div', { class: 'so-combo', style: { width: (it.width || 120) + 'px' } });
            var input = SO.el('input', { class: 'so-input', type: 'text', style: { width: '100%' }, 'aria-label': SO.t(it.label || it.tip), 'data-tip': it.tip || it.label, spellcheck: 'false', autocomplete: 'off' });
            if (!it.editable) input.readOnly = true;
            var btn = SO.el('button', { type: 'button', class: 'so-combo-btn', tabindex: '-1', 'aria-label': SO.t(it.label || it.tip), html: '<i class="fas fa-chevron-down"></i>' });
            var sentry = { type: 'select', el: el, input: input, item: it };
            function openList() {
                if (it.beforeOpen) it.beforeOpen();
                var opts = typeof it.options === 'function' ? it.options() : it.options;
                SO.menu(el, opts.map(function (o) {
                    if (typeof o !== 'object') o = { value: o };
                    return {
                        text: o.text != null ? o.text : (o.label ? SO.t(o.label) : String(o.value)),
                        style: o.style, checked: String(o.value) === String(sentry.value),
                        onClick: function () { sentry.value = o.value; input.value = o.text != null ? o.text : (o.label ? SO.t(o.label) : String(o.value)); self.exec(it.cmd, o.value, el); }
                    };
                }), { minWidth: Math.max(el.offsetWidth, it.menuWidth || 0), className: 'so-menu-list' });
            }
            btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
            btn.addEventListener('click', openList);
            if (!it.editable) input.addEventListener('click', openList);
            input.addEventListener('mousedown', function () { if (it.beforeOpen) it.beforeOpen(); });
            input.addEventListener('focus', function () { if (it.beforeOpen) it.beforeOpen(); });
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    sentry.value = input.value;
                    self.exec(it.cmd, input.value, el);
                } else if (e.key === 'Escape') {
                    input.value = sentry.value == null ? '' : sentry.display || sentry.value;
                    if (it.onEscape) it.onEscape();
                } else if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); openList(); }
            });
            el.appendChild(input);
            el.appendChild(btn);
            this.register(it.cmd, sentry);
        } else if (t === 'num') {
            el = SO.el('input', { class: 'so-input', type: 'number', min: it.min, max: it.max, step: it.step || 1, style: { width: (it.width || 60) + 'px' }, 'data-tip': it.tip || it.label, 'aria-label': SO.t(it.label || it.tip) });
            el.addEventListener('change', function () { self.exec(it.cmd, parseFloat(el.value), el); });
            this.register(it.cmd, { type: 'num', el: el, input: el, item: it });
        } else if (t === 'check') {
            el = SO.el('label', { class: 'so-rb', style: { gap: '6px' }, 'data-tip': it.tip || it.label });
            var cb = SO.el('input', { type: 'checkbox', style: { accentColor: 'var(--so-accent)', margin: 0 } });
            el.appendChild(cb);
            el.appendChild(SO.el('span', { class: 'so-rb-label', 'data-lang': it.label, text: SO.t(it.label) }));
            cb.addEventListener('change', function () { self.exec(it.cmd, cb.checked, el); });
            this.register(it.cmd, { type: 'check', el: el, input: cb, item: it });
        } else if (t === 'gallery') {
            el = SO.el('div', { class: 'so-gallery', style: it.width ? { maxWidth: it.width + 'px' } : null });
            var itemsBox = SO.el('div', { class: 'so-gallery-items' });
            var gentry = { type: 'gallery', el: el, items: itemsBox, item: it };
            var renderGallery = function () {
                itemsBox.innerHTML = '';
                var list = typeof it.items === 'function' ? it.items() : it.items;
                list.forEach(function (g) {
                    var gi = SO.el('button', { type: 'button', class: 'so-gallery-item', dataset: { value: g.value }, 'data-tip': g.label });
                    gi.innerHTML = '<span class="gi-preview" style="' + SO.esc(g.style || '') + '">' + SO.esc(g.preview != null ? SO.t(g.preview) : SO.t(g.label)) + '</span>' + (g.preview != null ? '' : '');
                    gi.addEventListener('mousedown', function (e) { e.preventDefault(); });
                    gi.addEventListener('click', function () { self.exec(it.cmd, g.value, gi); });
                    itemsBox.appendChild(gi);
                });
            };
            renderGallery();
            gentry.render = renderGallery;
            var more = SO.el('button', { type: 'button', class: 'so-gallery-more', html: '<i class="fas fa-caret-down"></i>', 'aria-label': SO.t('c_more') });
            more.addEventListener('mousedown', function (e) { e.preventDefault(); });
            more.addEventListener('click', function () {
                var list = typeof it.items === 'function' ? it.items() : it.items;
                var menuItems = list.map(function (g) { return { text: SO.t(g.label), style: g.style, cmd: it.cmd, value: g.value }; });
                if (it.extraMenu) menuItems = menuItems.concat([{ sep: true }]).concat(typeof it.extraMenu === 'function' ? it.extraMenu() : it.extraMenu);
                SO.menu(el, menuItems, { onCommand: function (c, v, item) { self.exec(c, v, item); }, minWidth: 220 });
            });
            el.appendChild(itemsBox);
            el.appendChild(more);
            this.register(it.cmd, gentry);
        } else if (t === 'custom') {
            el = SO.el('div', { style: { display: 'flex', alignItems: 'center' } });
            it.render(el, this);
        }
        if (el) {
            if (it.id) el.id = it.id;
            if (it.hideMobile) el.classList.add('so-tb-hide-mobile');
            parent.appendChild(el);
            if (this.itemEls) this.itemEls.set(it, el);
        }
        return el;
    };

    Ribbon.prototype.makeButton = function (it, caret) {
        var showLabel = it.lg || it.showLabel;
        var b = SO.el('button', {
            type: 'button', class: 'so-rb' + (it.lg ? ' is-lg' : ''),
            'data-tip': it.tip || it.label, 'data-tip-key': it.key || null, 'data-tip-desc': it.desc || null,
            'aria-label': SO.t(it.label || it.tip), dataset: it.cmd ? { cmd: it.cmd } : null
        });
        b.innerHTML = iconHtml(it.icon) +
            (showLabel ? '<span class="so-rb-label" data-lang="' + SO.esc(it.label) + '">' + SO.esc(SO.t(it.label)) + '</span>' : '') +
            (caret ? '<i class="fas fa-caret-down so-caret"></i>' : '');
        b.addEventListener('mousedown', function (e) { e.preventDefault(); });
        return b;
    };

    Ribbon.prototype.each = function (cmd, fn) { (this.reg[cmd] || []).forEach(fn); };
    Ribbon.prototype.setActive = function (cmd, on) {
        this.each(cmd, function (e) {
            if (e.type === 'btn') { e.el.classList.toggle('is-active', !!on); e.el.setAttribute('aria-pressed', on ? 'true' : 'false'); }
            if (e.type === 'check') e.input.checked = !!on;
        });
    };
    Ribbon.prototype.setDisabled = function (cmd, dis) {
        this.each(cmd, function (e) {
            if (e.el.tagName === 'BUTTON' || e.el.tagName === 'INPUT') e.el.disabled = !!dis;
            if (e.input) e.input.disabled = !!dis;
            if (e.el.parentNode && e.el.parentNode.classList.contains('so-split')) SO.$$('button', e.el.parentNode).forEach(function (b) { b.disabled = !!dis; });
        });
    };
    Ribbon.prototype.setValue = function (cmd, value, display) {
        this.each(cmd, function (e) {
            if (e.type === 'select') {
                if (doc.activeElement === e.input) return;
                e.value = value;
                e.display = display;
                var opts = typeof e.item.options === 'function' ? null : e.item.options;
                var label = display;
                if (label == null && opts) {
                    var o = opts.filter(function (x) { return String(typeof x === 'object' ? x.value : x) === String(value); })[0];
                    if (o) label = typeof o === 'object' ? (o.text != null ? o.text : (o.label ? SO.t(o.label) : String(o.value))) : String(o);
                }
                e.input.value = label != null ? label : (value == null ? '' : value);
            } else if (e.type === 'num') {
                if (doc.activeElement !== e.input) e.input.value = value == null ? '' : value;
            } else if (e.type === 'check') {
                e.input.checked = !!value;
            } else if (e.type === 'gallery') {
                SO.$$('.so-gallery-item', e.items).forEach(function (g) { g.classList.toggle('is-active', g.dataset.value === String(value)); });
            }
        });
    };
    Ribbon.prototype.setColor = function (cmd, color) {
        this.each(cmd, function (e) {
            if (e.type !== 'color') return;
            e.value = color;
            e.bar.style.background = color || 'transparent';
        });
    };
    Ribbon.prototype.relabel = function () { SO.applyI18n(this.root); };

    // ======================================================== cari fitur
    // Ribbon punya ratusan tombol dan banyak yang hanya berupa ikon. "Cari fitur"
    // membuat semuanya bisa ditemukan lewat nama — dalam ketiga bahasa sekaligus,
    // jadi "bold" tetap menemukan "Tebal" saat antarmuka berbahasa Indonesia —
    // lalu menjalankannya DARI tombol aslinya dan menyorot letaknya, supaya lain
    // kali pengguna tahu harus mengeklik di mana.

    /** Semua teks sebuah kunci kamus (id/en/zh) untuk dicocokkan. */
    function allLangs(key) {
        var entry = key != null && global.SO_I18N ? global.SO_I18N[key] : null;
        return Array.isArray(entry) ? entry.join(' ') : String(key == null ? '' : key);
    }
    function normText(s) {
        s = String(s || '').toLowerCase();
        try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
        return s.replace(/[…]/g, '').replace(/\s+/g, ' ').trim();
    }

    /** Daftar datar semua perintah yang bisa dijalankan saat ini. */
    Ribbon.prototype.commandIndex = function () {
        var self = this;
        var out = [];
        var seen = {};

        function add(entry) {
            if (!entry.labelText) return;
            // Menu yang sama sering muncul di dua tempat (mis. Tempel); cukup sekali.
            var sig = entry.tab.id + '|' + entry.labelText + '|' + (entry.cmd || '') + '|' + (entry.value == null ? '' : String(entry.value));
            if (seen[sig]) return;
            seen[sig] = true;
            entry.hay = normText(entry.labelText + ' ' + entry.allText + ' ' + (entry.parentText || ''));
            out.push(entry);
        }

        function menuEntries(menu, base, parentLabel, depth) {
            var list;
            try { list = typeof menu === 'function' ? menu() : menu; } catch (e) { list = null; }
            var found = 0;
            (list || []).forEach(function (m) {
                if (!m || m.sep || m.head || m.custom || m.disabled) return;
                if (m.submenu) {
                    if (depth < 1) found += menuEntries(m.submenu, base, m.text != null ? m.text : SO.t(m.label), depth + 1);
                    return;
                }
                if (!m.cmd && !m.onClick) return;
                var labelText = m.text != null ? String(m.text) : SO.t(m.label);
                add(Object.assign({}, base, {
                    kind: 'menu', item: m, cmd: m.cmd, value: m.value,
                    icon: m.icon || base.icon, key: m.key || null,
                    labelText: labelText, allText: m.text != null ? m.text : allLangs(m.label),
                    parentText: parentLabel
                }));
                found++;
            });
            return found;
        }

        function walk(items, tab, group) {
            (items || []).forEach(function (it) {
                if (!it) return;
                var t = it.t || 'btn';
                if (t === 'rows') { it.rows.forEach(function (r) { walk(r, tab, group); }); return; }
                if (t === 'col') { walk(it.items, tab, group); return; }
                if (t === 'sep' || t === 'custom') return;
                var key = it.label || it.tip;
                var base = {
                    tab: tab, group: group, spec: it, type: t,
                    el: self.itemEls ? self.itemEls.get(it) : null,
                    icon: it.icon, key: it.key || null,
                    labelText: SO.t(key), allText: allLangs(key) + ' ' + (it.desc ? allLangs(it.desc) : '')
                };
                if (t === 'drop') {
                    add(Object.assign({}, base, { kind: 'open' }));
                    menuEntries(it.menu, base, SO.t(key), 0);
                } else if (t === 'split') {
                    add(Object.assign({}, base, { kind: 'exec', cmd: it.cmd, value: it.value }));
                    menuEntries(it.menu, base, SO.t(key), 0);
                } else if (t === 'btn') {
                    if (it.cmd) add(Object.assign({}, base, { kind: 'click' }));
                } else {
                    // select, num, color, check, gallery: tunjukkan kontrolnya.
                    add(Object.assign({}, base, { kind: 'focus' }));
                }
            });
        }

        this.spec.tabs.forEach(function (tab) {
            var tb = self.tabs[tab.id];
            if (tab.contextual && tb && tb.hidden) return; // hanya berlaku saat objeknya dipilih
            tab.groups.forEach(function (g) { walk(g.items, tab, g); });
        });
        return out;
    };

    /** Pindah ke tab pemilik tombol, gulir ke tombolnya, lalu sorot sebentar. */
    Ribbon.prototype.reveal = function (tabId, el) {
        if (this.active !== tabId) this.select(tabId);
        if (this.root.classList.contains('is-collapsed')) this.root.classList.add('is-peek');
        if (!el || !el.isConnected) return;
        var target = el.parentNode && el.parentNode.classList && el.parentNode.classList.contains('so-split') ? el.parentNode : el;
        try { target.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
        target.classList.remove('so-flash');
        void target.offsetWidth; // mulai ulang animasi bila tombol yang sama dipilih dua kali
        target.classList.add('so-flash');
        setTimeout(function () { target.classList.remove('so-flash'); }, 1700);
    };

    Ribbon.prototype.runEntry = function (e) {
        var self = this;
        var el = e.el;
        this.reveal(e.tab.id, el);
        var spec = e.spec;
        if (e.kind === 'click') {
            if (el && !el.disabled) el.click();
        } else if (e.kind === 'exec') {
            var main = el && el.querySelector ? el.querySelector('.so-rb') : null;
            if (!(main && main.disabled)) self.exec(e.cmd, e.value, main || el);
        } else if (e.kind === 'menu') {
            if (e.item.onClick) e.item.onClick(e.item);
            else self.exec(e.cmd, e.value, e.item);
        } else if (e.kind === 'open') {
            if (el && !el.disabled) el.click();
        } else if (e.kind === 'focus' && el) {
            if (e.type === 'check') { var cb = el.querySelector('input'); if (cb && !cb.disabled) cb.click(); }
            else if (e.type === 'color') { var arrow = el.querySelector('.so-split-arrow'); if (arrow && !arrow.disabled) arrow.click(); }
            else if (e.type === 'select') {
                var inp = el.querySelector('input');
                if (spec.editable && inp) { inp.focus(); inp.select(); }
                else { var b = el.querySelector('.so-combo-btn'); if (b) b.click(); }
            } else if (e.type === 'gallery') { var more = el.querySelector('.so-gallery-more'); if (more) more.click(); }
            else if (e.type === 'num') { el.focus(); if (el.select) el.select(); }
        }
    };

    /** Palet "Cari fitur". */
    Ribbon.prototype.openSearch = function (initial) {
        var self = this;
        if (doc.querySelector('.so-cmdk-overlay')) return;
        SO.closeMenus();
        SO.hideTooltip();

        // Simpan fokus & seleksi dokumen; dikembalikan sebelum perintah dijalankan,
        // supaya "Tebal" mengenai teks yang tadi dipilih, bukan kotak pencarian.
        var prevFocus = doc.activeElement;
        var sel = global.getSelection ? global.getSelection() : null;
        var range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;

        var index = this.commandIndex();
        var overlay = SO.el('div', { class: 'so-cmdk-overlay' });
        var box = SO.el('div', { class: 'so-cmdk', role: 'dialog', 'aria-modal': 'true', 'aria-label': SO.t('c_search_title') });
        var head = SO.el('div', { class: 'so-cmdk-head', html: '<i class="fas fa-magnifying-glass" aria-hidden="true"></i>' });
        var input = SO.el('input', { class: 'so-cmdk-input', type: 'text', placeholder: SO.t('c_search_ph_long'), 'aria-label': SO.t('c_search_title'), autocomplete: 'off', spellcheck: 'false' });
        var closeBtn = SO.el('button', { type: 'button', class: 'so-dialog-close', 'aria-label': SO.t('c_close'), html: '<i class="fas fa-xmark"></i>' });
        head.appendChild(input);
        head.appendChild(closeBtn);
        var list = SO.el('div', { class: 'so-cmdk-list', role: 'listbox' });
        var foot = SO.el('div', { class: 'so-cmdk-foot', html:
            '<span><span class="so-kbd">↑</span> <span class="so-kbd">↓</span> ' + SO.esc(SO.t('c_search_nav')) + '</span>' +
            '<span><span class="so-kbd">Enter</span> ' + SO.esc(SO.t('c_search_run')) + '</span>' +
            '<span><span class="so-kbd">Esc</span> ' + SO.esc(SO.t('c_close')) + '</span>' });
        box.appendChild(head);
        box.appendChild(list);
        box.appendChild(foot);
        overlay.appendChild(box);
        doc.body.appendChild(overlay);

        var shown = [];
        var focusIdx = 0;

        function close(restore) {
            overlay.remove();
            doc.removeEventListener('keydown', onKey, true);
            if (!restore) return;
            if (prevFocus && prevFocus !== doc.body && prevFocus.isConnected && prevFocus.focus) {
                try { prevFocus.focus({ preventScroll: true }); } catch (err) {}
            }
            if (range && sel && prevFocus && prevFocus.contains && prevFocus.contains(range.startContainer)) {
                try { sel.removeAllRanges(); sel.addRange(range); } catch (err) {}
            }
        }

        function highlight(text, q) {
            var safe = SO.esc(text);
            if (!q) return safe;
            var i = normText(text).indexOf(q);
            // normText bisa mengubah panjang teks (diakritik); sorot hanya bila posisinya aman.
            if (i < 0 || normText(text).length !== text.length) return safe;
            return SO.esc(text.slice(0, i)) + '<mark>' + SO.esc(text.slice(i, i + q.length)) + '</mark>' + SO.esc(text.slice(i + q.length));
        }

        function score(e, q, words) {
            var label = normText(e.labelText);
            if (label === q) return 100;
            if (label.indexOf(q) === 0) return 80;
            if ((' ' + label).indexOf(' ' + q) !== -1) return 65;
            if (label.indexOf(q) !== -1) return 50;
            if (!words.every(function (w) { return e.hay.indexOf(w) !== -1; })) return 0;
            return (' ' + e.hay).indexOf(' ' + words[0]) !== -1 ? 30 : 20;
        }

        function iconFor(e) {
            var ic = e.icon;
            if (!ic) return '<i class="fas ' + (e.kind === 'menu' ? 'fa-angle-right' : 'fa-circle-dot') + '"></i>';
            return iconHtml(ic);
        }

        function render() {
            var q = normText(input.value);
            var words = q.split(' ').filter(Boolean);
            list.innerHTML = '';
            if (!q) {
                // Tanpa kata kunci: tampilkan isi tab yang sedang terbuka sebagai titik awal.
                var activeTab = self.spec.tabs.filter(function (t) { return t.id === self.active; })[0];
                shown = index.filter(function (e) { return e.tab.id === self.active && e.kind !== 'menu'; }).slice(0, 30);
                if (activeTab && shown.length) list.appendChild(SO.el('div', { class: 'so-cmdk-section', text: SO.t('c_search_in_tab', { tab: SO.t(activeTab.label) }) }));
            } else {
                shown = index
                    .map(function (e) { return { e: e, s: score(e, q, words) }; })
                    .filter(function (x) { return x.s > 0; })
                    .sort(function (a, b) { return b.s - a.s || a.e.labelText.length - b.e.labelText.length; })
                    .slice(0, 40)
                    .map(function (x) { return x.e; });
            }
            if (!shown.length) {
                list.appendChild(SO.el('div', { class: 'so-cmdk-empty', text: SO.t(q ? 'c_search_empty' : 'c_search_hint') }));
                return;
            }
            focusIdx = 0;
            shown.forEach(function (e, i) {
                var path = SO.t(e.tab.label) + (e.group.label ? ' › ' + SO.t(e.group.label) : '') + (e.parentText ? ' › ' + e.parentText : '');
                var btn = SO.el('button', { type: 'button', class: 'so-cmdk-item' + (i === 0 ? ' is-focus' : ''), role: 'option', id: 'so-cmdk-' + i });
                btn.innerHTML = '<span class="so-cmdk-ic">' + iconFor(e) + '</span>' +
                    '<span class="so-cmdk-text"><div class="so-cmdk-label">' + highlight(e.labelText, q) + '</div>' +
                    '<div class="so-cmdk-path">' + SO.esc(path) + '</div></span>' +
                    (e.key ? '<span class="so-kbd so-cmdk-key">' + SO.esc(SO.keyLabel(e.key.split(' / ')[0])) + '</span>' : '');
                btn.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
                btn.addEventListener('mousemove', function () { if (focusIdx !== i) setFocus(i); });
                btn.addEventListener('click', function () { run(i); });
                list.appendChild(btn);
            });
        }

        function setFocus(i) {
            var items = SO.$$('.so-cmdk-item', list);
            if (!items.length) return;
            focusIdx = (i + items.length) % items.length;
            items.forEach(function (b, k) { b.classList.toggle('is-focus', k === focusIdx); });
            items[focusIdx].scrollIntoView({ block: 'nearest' });
            input.setAttribute('aria-activedescendant', items[focusIdx].id);
        }

        function run(i) {
            var e = shown[i];
            if (!e) return;
            close(true);
            try { self.runEntry(e); } catch (err) { console.error(err); SO.toast('c_err_generic', { type: 'error' }); }
        }

        function onKey(ev) {
            // Palet ini modal: pintasan aplikasi (panah memindah sel, Ctrl+B, …) tidak boleh ikut jalan.
            ev.stopPropagation();
            if (ev.key === 'Escape') { ev.preventDefault(); close(true); }
            else if (ev.key === 'ArrowDown') { ev.preventDefault(); setFocus(focusIdx + 1); }
            else if (ev.key === 'ArrowUp') { ev.preventDefault(); setFocus(focusIdx - 1); }
            else if (ev.key === 'Enter' && doc.activeElement === input) { ev.preventDefault(); run(focusIdx); }
        }

        input.addEventListener('input', render);
        closeBtn.addEventListener('click', function () { close(true); });
        overlay.addEventListener('mousedown', function (ev) { if (ev.target === overlay) { ev.preventDefault(); close(true); } });
        doc.addEventListener('keydown', onKey, true);
        if (initial) input.value = initial;
        render();
        input.focus();
    };

    // Ctrl/Cmd + / membuka "Cari fitur" di aplikasi mana pun yang punya ribbon.
    doc.addEventListener('keydown', function (e) {
        if (!SO.mod(e) || e.altKey || e.shiftKey || (e.key !== '/' && e.code !== 'Slash')) return;
        if (!SO.activeRibbon || SO.isDialogOpen()) return;
        e.preventDefault();
        SO.activeRibbon.openSearch();
    });
    SO.Ribbon = Ribbon;

    // ========================================================== lazy loader
    var LIBS = {
        docx: { urls: ['core/vendor/docx.umd.js'], ready: function () { return global.docx; } },
        xlsx: { urls: ['core/vendor/xlsx.bundle.js'], ready: function () { return global.XLSX; } },
        pptx: { urls: ['core/vendor/pptxgen.bundle.js'], ready: function () { return global.PptxGenJS; } },
        jszip: { urls: ['core/vendor/jszip.min.js', 'core/vendor/jszip.min.js'], ready: function () { return global.JSZip; } },
        html2canvas: { urls: ['core/vendor/html2canvas.min.js', 'core/vendor/html2canvas.min.js'], ready: function () { return global.html2canvas; } },
        jspdf: { urls: ['core/vendor/jspdf.umd.min.js', 'core/vendor/jspdf.umd.min.js'], ready: function () { return global.jspdf; } },
        chart: { urls: ['core/vendor/chart.umd.js', 'core/vendor/chart.umd.js'], ready: function () { return global.Chart; } },
        mammoth: { urls: ['core/vendor/mammoth.browser.min.js', 'core/vendor/mammoth.browser.min.js'], ready: function () { return global.mammoth; } },
        katex: {
            urls: ['core/vendor/katex/katex.min.js', 'core/vendor/katex/katex.min.js'],
            css: 'core/vendor/katex/katex.min.css',
            ready: function () { return global.katex; }
        }
    };
    var loading = {};

    function injectScript(url) {
        return new Promise(function (resolve, reject) {
            var s = doc.createElement('script');
            s.src = url;
            s.async = true;
            s.onload = function () { resolve(); };
            s.onerror = function () { s.remove(); reject(new Error('load ' + url)); };
            doc.head.appendChild(s);
        });
    }

    SO.load = function (name) {
        var lib = LIBS[name];
        if (!lib) return Promise.reject(new Error('Unknown lib ' + name));
        if (lib.ready()) return Promise.resolve(lib.ready());
        if (loading[name]) return loading[name];
        if (lib.css && !doc.querySelector('link[data-lib="' + name + '"]')) {
            doc.head.appendChild(SO.el('link', { rel: 'stylesheet', href: lib.css, 'data-lib': name }));
        }
        var i = 0;
        loading[name] = new Promise(function (resolve, reject) {
            (function next() {
                if (i >= lib.urls.length) { loading[name] = null; reject(new Error(SO.t('c_err_lib'))); return; }
                injectScript(lib.urls[i++]).then(function () {
                    if (lib.ready()) resolve(lib.ready()); else next();
                }, next);
            })();
        });
        return loading[name];
    };

    // ================================================================ files
    SO.safeName = function (name, fallback) {
        var n = String(name || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim();
        return (n || fallback || 'Sinerli').slice(0, 120);
    };

    SO.download = function (data, filename, mime) {
        var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
        var url = URL.createObjectURL(blob);
        var a = SO.el('a', { href: url, download: filename, style: { display: 'none' } });
        doc.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
    };

    SO.pickFile = function (accept, multiple) {
        return new Promise(function (resolve) {
            var input = SO.el('input', { type: 'file', accept: accept || '', style: { display: 'none' } });
            if (multiple) input.multiple = true;
            input.addEventListener('change', function () {
                var files = Array.prototype.slice.call(input.files || []);
                input.remove();
                resolve(multiple ? files : (files[0] || null));
            });
            input.addEventListener('cancel', function () { input.remove(); resolve(multiple ? [] : null); });
            doc.body.appendChild(input);
            input.click();
        });
    };

    SO.readFile = function (file, as) {
        return new Promise(function (resolve, reject) {
            var r = new FileReader();
            r.onload = function () { resolve(r.result); };
            r.onerror = function () { reject(r.error); };
            if (as === 'arraybuffer') r.readAsArrayBuffer(file);
            else if (as === 'dataurl') r.readAsDataURL(file);
            else r.readAsText(file);
        });
    };

    SO.dataUrlToBlob = function (dataUrl) {
        var m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
        if (!m) return null;
        var mime = m[1] || 'application/octet-stream';
        if (m[2]) {
            var bin = atob(m[3]);
            var arr = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return new Blob([arr], { type: mime });
        }
        return new Blob([decodeURIComponent(m[3])], { type: mime });
    };

    SO.blobToDataUrl = function (blob) {
        return new Promise(function (resolve, reject) {
            var r = new FileReader();
            r.onload = function () { resolve(r.result); };
            r.onerror = function () { reject(r.error); };
            r.readAsDataURL(blob);
        });
    };

    SO.loadImage = function (src) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
            img.onload = function () { resolve(img); };
            img.onerror = function () { reject(new Error(SO.t('c_err_image'))); };
            img.src = src;
        });
    };

    /**
     * Mengecilkan gambar besar sebelum disisipkan supaya dokumen tetap ringan
     * saat disimpan ke cloud. Mempertahankan transparansi untuk PNG/GIF/WebP.
     */
    SO.prepareImage = function (file, maxDim) {
        maxDim = maxDim || 1920;
        return SO.readFile(file, 'dataurl').then(function (dataUrl) {
            if (/^data:image\/svg/i.test(dataUrl)) return { dataUrl: dataUrl, width: 0, height: 0 };
            return SO.loadImage(dataUrl).then(function (img) {
                var w = img.naturalWidth, h = img.naturalHeight;
                var scale = Math.min(1, maxDim / Math.max(w, h));
                var keepAlpha = !/jpe?g/i.test(file.type || '');
                if (scale === 1 && dataUrl.length < 1.2 * 1024 * 1024) return { dataUrl: dataUrl, width: w, height: h };
                var c = doc.createElement('canvas');
                c.width = Math.max(1, Math.round(w * scale));
                c.height = Math.max(1, Math.round(h * scale));
                var ctx = c.getContext('2d');
                if (!keepAlpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
                ctx.drawImage(img, 0, 0, c.width, c.height);
                var out = keepAlpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.88);
                if (keepAlpha && out.length > 2.5 * 1024 * 1024) out = c.toDataURL('image/webp', 0.9);
                return { dataUrl: out, width: c.width, height: c.height };
            });
        });
    };

    /** Mengubah gambar apa pun (blob URL, data URL) menjadi PNG data URL — dipakai eksportir. */
    SO.toPngDataUrl = function (src) {
        return SO.loadImage(src).then(function (img) {
            var c = doc.createElement('canvas');
            c.width = img.naturalWidth || 1;
            c.height = img.naturalHeight || 1;
            c.getContext('2d').drawImage(img, 0, 0);
            return { dataUrl: c.toDataURL('image/png'), width: c.width, height: c.height };
        });
    };

    // =============================================================== assets
    /**
     * Penyimpan gambar sesi. Editor memakai blob: URL yang pendek sehingga
     * snapshot undo tidak menggandakan data base64 berukuran megabyte.
     * Saat disimpan, blob URL ditukar menjadi rujukan "asset:ID" + peta data URL.
     */
    function Assets() { this.byId = {}; this.byUrl = {}; }
    Assets.prototype.addDataUrl = function (dataUrl, id) {
        id = id || SO.uid('img');
        if (this.byId[id]) return this.byId[id];
        var blob = SO.dataUrlToBlob(dataUrl);
        if (!blob) return null;
        var url = URL.createObjectURL(blob);
        var rec = { id: id, url: url, blob: blob, dataUrl: dataUrl };
        this.byId[id] = rec;
        this.byUrl[url] = rec;
        return rec;
    };
    Assets.prototype.addBlob = function (blob) {
        var id = SO.uid('img');
        var url = URL.createObjectURL(blob);
        var rec = { id: id, url: url, blob: blob, dataUrl: null };
        this.byId[id] = rec;
        this.byUrl[url] = rec;
        return rec;
    };
    Assets.prototype.get = function (idOrUrl) { return this.byId[idOrUrl] || this.byUrl[idOrUrl] || null; };
    Assets.prototype.url = function (id) { var r = this.byId[id]; return r ? r.url : ''; };
    Assets.prototype.dataUrl = function (idOrUrl) {
        var rec = this.get(idOrUrl);
        if (!rec) return Promise.resolve(/^data:/.test(idOrUrl) ? idOrUrl : null);
        if (rec.dataUrl) return Promise.resolve(rec.dataUrl);
        return SO.blobToDataUrl(rec.blob).then(function (d) { rec.dataUrl = d; return d; });
    };
    /** Peta {id: dataUrl} hanya untuk id yang dipakai. */
    Assets.prototype.exportMap = function (ids) {
        var self = this, out = {};
        return Promise.all(ids.map(function (id) {
            return self.dataUrl(id).then(function (d) { if (d) out[id] = d; });
        })).then(function () { return out; });
    };
    Assets.prototype.importMap = function (map) {
        var self = this;
        Object.keys(map || {}).forEach(function (id) { if (!self.byId[id]) self.addDataUrl(map[id], id); });
    };
    SO.Assets = Assets;

    // ========================================================= local store
    var DB_NAME = 'sinerli_office';
    var dbPromise = null;
    var memStore = { drafts: {}, versions: [] };

    function openDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve) {
            if (!global.indexedDB) { resolve(null); return; }
            var req;
            try { req = indexedDB.open(DB_NAME, 1); } catch (e) { resolve(null); return; }
            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'key' });
                if (!db.objectStoreNames.contains('versions')) {
                    var vs = db.createObjectStore('versions', { keyPath: 'vid', autoIncrement: true });
                    vs.createIndex('key', 'key', { unique: false });
                }
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { resolve(null); };
            req.onblocked = function () { resolve(null); };
        });
        return dbPromise;
    }

    function idb(storeName, mode, fn) {
        return openDb().then(function (db) {
            if (!db) return fn(null);
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(storeName, mode);
                var store = tx.objectStore(storeName);
                var result;
                Promise.resolve(fn(store, function (r) { result = r; })).catch(reject);
                tx.oncomplete = function () { resolve(result); };
                tx.onerror = function () { reject(tx.error); };
                tx.onabort = function () { reject(tx.error); };
            });
        });
    }

    function reqP(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }

    SO.store = {
        putDraft: function (rec) {
            return idb('drafts', 'readwrite', function (s) {
                if (!s) { memStore.drafts[rec.key] = rec; return; }
                s.put(rec);
            });
        },
        getDraft: function (key) {
            return idb('drafts', 'readonly', function (s, set) {
                if (!s) { return memStore.drafts[key] || null; }
                return reqP(s.get(key)).then(function (r) { set(r || null); });
            }).then(function (r) { return r === undefined ? null : r; });
        },
        delDraft: function (key) {
            return idb('drafts', 'readwrite', function (s) {
                if (!s) { delete memStore.drafts[key]; return; }
                s.delete(key);
            });
        },
        listDrafts: function (app) {
            return idb('drafts', 'readonly', function (s, set) {
                if (!s) return Object.keys(memStore.drafts).map(function (k) { return memStore.drafts[k]; });
                return reqP(s.getAll()).then(function (all) { set(all); });
            }).then(function (all) {
                return (all || []).filter(function (d) { return !app || d.app === app; })
                    .sort(function (a, b) { return b.updatedAt - a.updatedAt; });
            });
        },
        addVersion: function (rec, keep) {
            keep = keep || 25;
            return idb('versions', 'readwrite', function (s) {
                if (!s) { memStore.versions.push(rec); return; }
                s.add(rec);
                var idx = s.index('key');
                return reqP(idx.getAllKeys(rec.key)).then(function (keys) {
                    keys.sort(function (a, b) { return a - b; });
                    keys.slice(0, Math.max(0, keys.length - keep)).forEach(function (k) { s.delete(k); });
                });
            });
        },
        /** Penyimpanan penuh: sisakan `keep` versi terbaru per dokumen. */
        trimVersions: function (keep) {
            return idb('versions', 'readwrite', function (s) {
                if (!s) { memStore.versions = memStore.versions.slice(-keep); return; }
                return reqP(s.getAll()).then(function (all) {
                    var byKey = {};
                    all.forEach(function (v) { (byKey[v.key] = byKey[v.key] || []).push(v); });
                    Object.keys(byKey).forEach(function (k) {
                        var list = byKey[k].sort(function (a, b) { return b.at - a.at; });
                        list.slice(keep).forEach(function (v) { s.delete(v.vid); });
                    });
                });
            });
        },
        listVersions: function (key) {
            return idb('versions', 'readonly', function (s, set) {
                if (!s) return memStore.versions.filter(function (v) { return v.key === key; });
                return reqP(s.index('key').getAll(key)).then(function (r) { set(r); });
            }).then(function (r) { return (r || []).sort(function (a, b) { return b.at - a.at; }); });
        }
    };

    // ================================================================ cloud
    SO.cloud = {
        available: function () { return !!SO.ctx.apiKey; },
        endpoint: function () { return SO.root + 'api/projects.php'; },
        /** Kunci API bisa diperbarui Dashboard di tab lain; baca ulang sebelum menyerah pada 401. */
        refreshKey: function () {
            var k = '';
            try { k = localStorage.getItem('sinerli_api_key') || ''; } catch (e) {}
            if (k && k !== SO.ctx.apiKey) { SO.ctx.apiKey = k; return true; }
            return false;
        },
        /**
         * Galat yang dilempar membawa {status, code, data, network} supaya
         * DocSession bisa membedakan "coba lagi nanti" dari "jangan diulang".
         */
        _req: function (url, opts) {
            opts = opts || {};
            var headers = Object.assign({ 'X-API-Key': SO.ctx.apiKey }, opts.headers || {});
            var ctrl = global.AbortController ? new AbortController() : null;
            var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeout || 60000) : null;
            var init = Object.assign({}, opts, { headers: headers, credentials: 'same-origin' });
            delete init.timeout;
            if (ctrl) init.signal = ctrl.signal;
            return fetch(url, init).then(function (res) {
                if (timer) clearTimeout(timer);
                return res.text().then(function (txt) {
                    var data = null;
                    try { data = JSON.parse(txt); } catch (e) {}
                    if (!res.ok || !data || !data.success) {
                        var err = new Error((data && (data.error || data.message)) || (SO.t('c_err_server') + ' (' + res.status + ')'));
                        err.status = res.status;
                        err.code = (data && data.code) || (res.status === 413 ? 'too_large' : (res.status === 401 ? 'bad_key' : ''));
                        err.data = data;
                        throw err;
                    }
                    return data;
                });
            }, function (e) {
                if (timer) clearTimeout(timer);
                var err = new Error(SO.t(SO.net.online() ? 'c_err_network' : 'c_err_offline'));
                err.network = true;
                err.cause = e;
                throw err;
            });
        },
        _shareQ: function () { return SO.ctx.share ? '&share=' + encodeURIComponent(SO.ctx.share) : ''; },
        load: function (id) {
            return this._req(this.endpoint() + '?id=' + encodeURIComponent(id) + this._shareQ()).then(function (data) {
                var p = (data.projects || []).filter(function (x) { return String(x.id) === String(id); })[0];
                if (!p) { var e = new Error(SO.t('c_err_not_found')); e.code = 'not_found'; throw e; }
                if (typeof p.content === 'string') {
                    try { p.content = JSON.parse(p.content); } catch (e) { p.content = null; p.contentBroken = true; }
                }
                p.revision = parseInt(p.revision, 10) || 0;
                return p;
            });
        },
        head: function (id) {
            return this._req(this.endpoint() + '?action=head&id=' + encodeURIComponent(id) + this._shareQ(), { timeout: 15000 }).then(function (d) { return d.project; });
        },
        versions: function (id) {
            return this._req(this.endpoint() + '?action=versions&id=' + encodeURIComponent(id));
        },
        version: function (vid) {
            return this._req(this.endpoint() + '?action=version&vid=' + encodeURIComponent(vid)).then(function (d) {
                var v = d.version;
                if (typeof v.content === 'string') { try { v.content = JSON.parse(v.content); } catch (e) { v.content = null; } }
                return v;
            });
        },
        list: function (type) {
            return this._req(this.endpoint() + '?meta=1&type=' + encodeURIComponent(type)).then(function (data) {
                return (data.projects || []).filter(function (p) { return p.type === type; });
            });
        },
        save: function (payload) {
            var extra = SO.ctx.share && payload.filename ? { share_token: SO.ctx.share } : {};
            var body = JSON.stringify(Object.assign({ user_email: SO.ctx.email, canvas_width: 0, canvas_height: 0 }, payload, extra));
            return this._req(this.endpoint(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: body,
                // Unggahan besar di jaringan lambat butuh waktu lebih lama.
                timeout: 60000 + Math.round(body.length / 40)
            });
        }
    };

    // =========================================================== pengaman
    /**
     * Blok pengamanan proyek, dipakai DocSession (App Grafik, Sinerli Dokum, Sinerli Hitara,
     * Sinerli Present) dan Notepad:
     *   - SO.net        : status online/offline
     *   - SO.hashText   : sidik isi (SHA-256 bila tersedia) untuk deteksi "tidak berubah"
     *   - SO.bus        : pesan antartab (BroadcastChannel, cadangan localStorage)
     *   - SO.openDocs   : daftar dokumen terbuka per tab + detak jantung, supaya
     *                     tab yang crash/ditutup dengan perubahan belum tersinkron
     *                     bisa ditawarkan untuk dipulihkan saat aplikasi dibuka lagi
     *   - SO.requestPersist : minta penyimpanan perangkat tidak dibersihkan otomatis
     */
    SO.tabId = SO.uid('tab');

    SO.net = {
        online: function () { return navigator.onLine !== false; },
        on: function (cb) {
            global.addEventListener('online', function () { cb(true); });
            global.addEventListener('offline', function () { cb(false); });
        }
    };

    function weakHash(str) {
        function cyrb(seed) {
            var h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
            for (var i = 0; i < str.length; i++) {
                var ch = str.charCodeAt(i);
                h1 = Math.imul(h1 ^ ch, 2654435761);
                h2 = Math.imul(h2 ^ ch, 1597334677);
            }
            h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
            h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
            return ('00000000' + (h2 >>> 0).toString(16)).slice(-8) + ('00000000' + (h1 >>> 0).toString(16)).slice(-8);
        }
        return cyrb(1) + cyrb(7);
    }
    SO.hashText = function (str) {
        str = String(str == null ? '' : str);
        try {
            if (global.crypto && global.crypto.subtle && global.TextEncoder && global.isSecureContext !== false) {
                return global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
                    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
                }).catch(function () { return weakHash(str); });
            }
        } catch (e) {}
        return Promise.resolve(weakHash(str));
    };

    SO.bus = (function () {
        var listeners = [];
        var bc = null;
        try { if (global.BroadcastChannel) bc = new BroadcastChannel('sinerli-docs'); } catch (e) {}
        function deliver(msg) {
            if (!msg || msg.from === SO.tabId) return;
            listeners.slice().forEach(function (fn) { try { fn(msg); } catch (e) { console.warn(e); } });
        }
        if (bc) bc.onmessage = function (e) { deliver(e.data); };
        else global.addEventListener('storage', function (e) {
            if (e.key === 'so_bus' && e.newValue) { try { deliver(JSON.parse(e.newValue)); } catch (x) {} }
        });
        return {
            post: function (msg) {
                msg.from = SO.tabId;
                msg.at = Date.now();
                if (bc) { try { bc.postMessage(msg); } catch (e) {} return; }
                try { localStorage.setItem('so_bus', JSON.stringify(msg)); localStorage.removeItem('so_bus'); } catch (e) {}
            },
            on: function (fn) { listeners.push(fn); }
        };
    })();

    var OPEN_DOCS_KEY = 'so_open_docs';
    SO.openDocs = {
        read: function () {
            try { return JSON.parse(localStorage.getItem(OPEN_DOCS_KEY) || '{}') || {}; } catch (e) { return {}; }
        },
        write: function (map) {
            try { localStorage.setItem(OPEN_DOCS_KEY, JSON.stringify(map)); } catch (e) {}
        },
        /** info = {app, key, name, dirty, closed} — null menghapus entri tab ini. */
        update: function (info, tab) {
            tab = tab || SO.tabId;
            var m = this.read();
            var now = Date.now();
            if (info === null) delete m[tab];
            else m[tab] = Object.assign(m[tab] || {}, info, { beat: now });
            Object.keys(m).forEach(function (k) {
                var age = now - (m[k].beat || 0);
                // Entri tanpa perubahan tertunda hanya berguna selama tab hidup.
                if (age > 21 * 864e5 || (!m[k].dirty && age > 2 * 864e5)) delete m[k];
            });
            this.write(m);
        },
        remove: function (tab) { this.update(null, tab); }
    };

    var persistAsked = false;
    SO.requestPersist = function () {
        if (persistAsked) return;
        persistAsked = true;
        try {
            // Firefox menampilkan izin untuk persist(); di sana draf tetap aman
            // selama penyimpanan tidak penuh, jadi tidak perlu mengganggu pengguna.
            if (/firefox/i.test(navigator.userAgent)) return;
            if (navigator.storage && navigator.storage.persist && navigator.storage.persisted) {
                navigator.storage.persisted().then(function (p) { if (!p) return navigator.storage.persist(); }).catch(function () {});
            }
        } catch (e) {}
    };

    function isQuotaError(e) {
        return !!e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(String(e.message || '')));
    }

    SO.downloadJson = function (obj, filename) {
        SO.download(new Blob([JSON.stringify(obj)], { type: 'application/json' }), filename, 'application/json');
    };

    // =========================================================== DocSession
    /**
     * Mengelola siklus hidup dokumen: buka, autosave draf lokal, simpan cloud,
     * riwayat versi, pengamanan (offline, konflik, crash, tab ganda), dan
     * indikator status.
     *
     * opts: {app, type, ext, getContent(): Promise|obj, getName(), setName(n),
     *        getThumbnail(): Promise<dataUrl|null>, applyContent(content, name),
     *        onStatus(state, extra), extraPayload(): obj, backup(): void,
     *        autoCreateCloud: bool (bawaan true)}
     *
     * Aplikasi WAJIB memanggil session.loaded() setelah isi hasil boot() berhasil
     * dipasang, atau session.loadFailed(err) bila gagal. Sebelum itu tidak ada
     * simpanan cloud otomatis — dokumen yang gagal dimuat tidak boleh menimpa
     * versi baiknya di server.
     *
     * Status: new · local · local-pending · cloud · saved · unsaved · saving ·
     *         offline · retrying · conflict · auth · error · protected · locked · storage
     */
    var RETRY_DELAYS = [5, 15, 30, 60, 120, 300];

    function DocSession(opts) {
        this.o = opts;
        this.meta = this._blankMeta();
        this.dirty = false;          // ada perubahan yang belum ditulis ke draf lokal
        this.cloudDirty = false;     // ada perubahan yang belum sampai ke cloud
        this.hasEdits = false;       // dokumen pernah diubah di sesi ini
        this.firstEditAt = 0;
        this.saving = false;
        this.ready = false;          // isi hasil boot sudah dipasang (loaded())
        this.protected = false;      // gagal muat: jangan timpa apa pun
        this.locked = false;         // tab lain mengambil alih dokumen ini
        this.conflict = null;
        this.lastVersionAt = Date.now();
        this.lastThumbAt = 0;
        this.lastLocalAt = 0;
        this.state = 'new';
        this.stateExtra = '';
        this._retryN = 0;
        this._retryTimer = null;
        this._retryAt = 0;
        this._wantCloud = false;
        this.autoCloud = true;
        try { this.autoCloud = localStorage.getItem('so_auto_cloud') !== '0'; } catch (e) {}
        var self = this;
        SO.activeSession = this;
        this._localDebounced = SO.debounce(function () { self.saveLocal(); }, 700);
        this._cloudDebounced = SO.debounce(function () { self.saveCloud({ auto: true }); }, 4000);
        this._createDebounced = SO.debounce(function () { self.saveCloud({ auto: true }); }, 20000);

        global.addEventListener('beforeunload', function (e) {
            if (self.locked) return;
            self._localDebounced.flush();
            var unsyncedCloud = self.cloudDirty && SO.cloud.available() && !self.protected && (self.meta.filename || self.hasEdits);
            if (self.dirty || unsyncedCloud) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
        // pagehide = satu-satunya peristiwa yang andal di HP saat tab ditutup/diganti.
        global.addEventListener('pagehide', function () {
            if (self.locked) { SO.openDocs.remove(); return; }
            self._localDebounced.flush();
            self._registry(true);
            // Penulisan draf yang masih berjalan tidak boleh mendaftarkan tab ini lagi
            // sebagai "terbuka" setelah ditutup rapi (alarm pemulihan palsu).
            self._closing = true;
        });
        global.addEventListener('pageshow', function (e) {
            if (e.persisted) { self._closing = false; self._registry(false); self.claimTab(); }
        });
        doc.addEventListener('visibilitychange', function () {
            if (doc.visibilityState === 'hidden') {
                self._localDebounced.flush();
                if (self.cloudDirty && self.meta.filename && self.autoCloud && self.ready) self._cloudDebounced.flush();
                self._registry(false);
            } else {
                self._registry(false);
                self.claimTab();
                self.checkRemote();
            }
        });
        SO.net.on(function (online) {
            if (!online) { if (self.cloudDirty || self.meta.filename) self.setStatus('offline'); return; }
            if (self.state === 'offline') self.setStatus(self.cloudDirty ? 'unsaved' : (self.meta.filename ? 'saved' : 'local'));
            if (self.cloudDirty && self.ready && (self.meta.filename || self._wantCloud)) {
                self._retryN = 0;
                self.saveCloud({ auto: true, retry: true });
            }
        });
        SO.bus.on(function (msg) { self._onBus(msg); });
        this._beat = setInterval(function () {
            if (doc.visibilityState === 'visible') self._registry(false);
        }, 5000);
        this._remoteTimer = setInterval(function () {
            if (doc.visibilityState === 'visible') self.checkRemote();
        }, 60000);
        SO.guardErrors(this);
    }

    DocSession.prototype._blankMeta = function () {
        return { key: '', cloudId: '', filename: '', createdAt: Date.now(), lastCloud: 0, revision: 0, syncedHash: '', syncedName: '' };
    };

    DocSession.prototype.setStatus = function (state, extra) {
        this.state = state;
        this.stateExtra = extra || '';
        if (this.o.onStatus) this.o.onStatus(state, extra);
        doc.dispatchEvent(new CustomEvent('so:status', { detail: { state: state, extra: extra, session: this } }));
    };

    DocSession.prototype._idleStatus = function () {
        if (this.protected) return 'protected';
        if (this.locked) return 'locked';
        if (this.conflict) return 'conflict';
        if (!SO.net.online() && (this.cloudDirty || this.meta.filename)) return 'offline';
        if (this.meta.filename) return this.cloudDirty ? 'unsaved' : 'saved';
        return this.hasEdits || this.meta.key.indexOf('local:') === 0 && this.lastLocalAt ? 'local' : 'new';
    };

    /**
     * Entri tab ini di SO.openDocs. Ditutup dengan rapi tanpa perubahan yang
     * belum sampai ke cloud → entri dihapus. Masih ada yang belum tersinkron
     * (atau tab crash, sehingga pagehide tidak sempat jalan) → entri tertinggal
     * dan ditawarkan untuk dipulihkan saat aplikasi dibuka lagi. Tamu (tanpa
     * cloud) hanya ditawari setelah crash; drafnya tetap ada di daftar draf.
     */
    DocSession.prototype._registry = function (closing) {
        if (!this.meta.key || this.locked || this._closing || this.readOnly) return;
        var unsynced = this.hasEdits && this.cloudDirty && !this.protected;
        if (closing && (!unsynced || !SO.cloud.available())) {
            SO.openDocs.remove();
            return;
        }
        SO.openDocs.update({
            app: this.o.app, key: this.meta.key, name: this.o.getName ? this.o.getName() : '',
            dirty: unsynced, closed: !!closing
        });
    };

    DocSession.prototype.newKey = function () {
        this.meta = this._blankMeta();
        this.meta.key = 'local:' + SO.uid();
        this.dirty = false;
        this.cloudDirty = false;
        this.hasEdits = false;
        this.conflict = null;
        this.protected = false;
        this.protectedMeta = null;
        SO.updateUrl({ id: null, draft: this.meta.key.slice(6), action: null, recover: null });
        this.setStatus('new');
        this.claimTab();
    };

    /** Menentukan dokumen awal dari URL. Mengembalikan {content, name} atau null (dokumen baru). */
    DocSession.prototype.boot = function () {
        var self = this;
        var ctx = SO.ctx;
        if (ctx.projectId && SO.cloud.available()) {
            return this.openCloud(ctx.projectId, { recover: ctx.params.get('recover') === '1' }).catch(function (err) {
                // Cloud tidak terjangkau (offline/server galat): pakai draf perangkat bila ada.
                return SO.store.getDraft('cloud:' + ctx.projectId).then(function (d) {
                    if (d && d.content && (err.network || err.status >= 500 || !err.status)) {
                        self._adoptDraft(d);
                        self.setStatus(SO.net.online() ? 'retrying' : 'offline');
                        SO.toast('c_opened_offline_copy', { type: 'warn', ms: 6000 });
                        return { content: d.content, name: d.name };
                    }
                    SO.toast(err.message || 'c_err_load', { type: 'error' });
                    if (err.code === 'not_found' || err.status === 404) { self.newKey(); return null; }
                    // Galat lain (mis. isi rusak): jangan diam-diam membuat dokumen baru
                    // di atas id yang sama — tandai terlindungi.
                    self.meta = self._blankMeta();
                    self.meta.key = 'cloud:' + ctx.projectId;
                    self.meta.cloudId = String(ctx.projectId);
                    self.loadFailed(err);
                    return null;
                });
            });
        }
        if (ctx.draft) {
            return SO.store.getDraft('local:' + ctx.draft).then(function (d) {
                if (!d || d.app !== self.o.app) { self.newKey(); return null; }
                self._adoptDraft(d);
                self.setStatus('local');
                return { content: d.content, name: d.name };
            }).catch(function () { self.newKey(); return null; });
        }
        this.newKey();
        return Promise.resolve(null);
    };

    DocSession.prototype._adoptDraft = function (d) {
        this.meta = {
            key: d.key, cloudId: d.cloudId || '', filename: d.filename || '',
            createdAt: d.createdAt || d.updatedAt, lastCloud: d.syncedAt || 0,
            revision: d.revision || 0, syncedHash: d.syncedHash || '', syncedName: d.syncedName || ''
        };
        this.cloudDirty = d.unsynced !== false;
        this.hasEdits = !!d.unsynced;
        this.lastLocalAt = d.updatedAt || 0;
        SO.updateUrl(d.cloudId ? { id: d.cloudId, draft: null, recover: null } : { id: null, draft: d.key.slice(6), recover: null });
        this.claimTab();
    };

    DocSession.prototype.openCloud = function (id, opts) {
        opts = opts || {};
        var self = this;
        var busy = SO.busy('c_opening');
        return SO.cloud.load(id).then(function (p) {
            if (p.type !== self.o.type) throw new Error(SO.t('c_err_wrong_type'));
            var key = 'cloud:' + p.id;
            return SO.store.getDraft(key).then(function (draft) {
                var cloudTime = new Date(String(p.lastModified).replace(' ', 'T')).getTime() || 0;
                self.meta = {
                    key: key, cloudId: String(p.id), filename: p.filename, createdAt: cloudTime, lastCloud: cloudTime,
                    revision: p.revision || 0, syncedHash: p.content_hash || '', syncedName: p.name
                };
                self.cloudDirty = false;
                self.hasEdits = false;
                self.conflict = null;
                self.protected = false;
                self.protectedMeta = null;
                SO.updateUrl({ id: p.id, draft: null, action: null, recover: null });
                self.setStatus('cloud');
                self.claimTab();

                var cloudResult = { content: p.content, name: p.name };
                if (p.contentBroken) {
                    // Isi di server tidak bisa dibaca. Draf perangkat (bila ada) lebih berharga.
                    if (draft && draft.content) {
                        busy.done();
                        SO.toast('c_cloud_broken_used_draft', { type: 'warn', ms: 8000 });
                        self.cloudDirty = true;
                        self.hasEdits = true;
                        self.setStatus('unsaved');
                        return { content: draft.content, name: draft.name || p.name };
                    }
                    var e = new Error(SO.t('c_err_content_broken'));
                    e.code = 'content_broken';
                    throw e;
                }
                if (!draft || !draft.content) return cloudResult;

                var draftUnsynced = draft.unsynced === true ||
                    (draft.unsynced === undefined && draft.updatedAt > cloudTime + 5000);
                if (!draftUnsynced) return cloudResult;

                var sameBase = !draft.revision || draft.revision === self.meta.revision;
                var useDraft = function () {
                    self.cloudDirty = true;
                    self.hasEdits = true;
                    self.setStatus('unsaved');
                    // Versi cloud yang dilewati tetap dicatat di perangkat.
                    SO.store.addVersion({ key: key, app: self.o.app, name: p.name, content: p.content, at: Date.now(), label: 'c_ver_label_cloud' });
                    return { content: draft.content, name: draft.name || p.name };
                };
                if (opts.recover || sameBase) {
                    busy.done();
                    if (!opts.recover) {
                        SO.toast('c_unsynced_restored', {
                            type: 'info', ms: 9000,
                            action: { label: 'c_use_cloud', onClick: function () { self.reloadFromCloud(); } }
                        });
                    }
                    return useDraft();
                }
                // Draf dibuat di atas revisi lama, dan cloud sudah berubah dari tempat lain.
                busy.done();
                return SO.dialog({
                    title: 'c_restore_draft', width: 480,
                    body: '<p style="margin:6px 0 4px;white-space:pre-line">' + SO.esc(SO.t('c_draft_vs_cloud_conflict', {
                        draft: SO.fmtDate(draft.updatedAt), cloud: SO.fmtDate(cloudTime)
                    })) + '</p>',
                    buttons: [
                        { label: 'c_use_cloud', value: 'cloud' },
                        { label: 'c_use_draft', primary: true, value: 'draft' }
                    ],
                    dismissible: false
                }).then(function (choice) {
                    if (choice === 'draft') {
                        // Revisi terbaru dianggap dasar supaya simpanan berikutnya tidak konflik lagi;
                        // isi cloud yang tertimpa tetap tercatat di riwayat versi server.
                        return useDraft();
                    }
                    SO.store.addVersion({ key: key, app: self.o.app, name: draft.name, content: draft.content, at: draft.updatedAt, label: 'c_ver_label_device' });
                    return cloudResult;
                });
            });
        }).finally(function () { busy.done(); });
    };

    /** Aplikasi memanggil ini setelah isi hasil boot()/openCloud() terpasang dengan benar. */
    DocSession.prototype.loaded = function () {
        var self = this;
        this.ready = true;
        if (this.readOnly) { this.setStatus('readonly'); return; }
        this.setStatus(this._idleStatus());
        this.claimTab();
        this._registry(false);
        this._startLive();
        if (this.cloudDirty && this.meta.filename) this._cloudDebounced();
        setTimeout(function () { SO.checkRecovery(self); }, 900);
    };

    /**
     * Isi dokumen gagal dipasang. Sesi berpindah ke kunci draf baru supaya draf
     * asli tidak tertimpa, simpan cloud otomatis dimatikan, dan pengguna diberi
     * jalan keluar (muat ulang, riwayat versi).
     */
    DocSession.prototype.loadFailed = function (err) {
        console.error('[SO] dokumen gagal dimuat', err);
        this.protected = true;
        this.ready = true;
        this.protectedMeta = SO.deepClone(this.meta);
        var old = this.meta;
        this.meta = this._blankMeta();
        this.meta.key = 'local:' + SO.uid();
        this.meta.recoveredFrom = old.key;
        this.cloudDirty = false;
        this.setStatus('protected', err && err.message);
        var self = this;
        SO.dialog({
            title: 'c_protected_title', width: 480,
            body: '<p style="margin:6px 0 4px;white-space:pre-line">' + SO.esc(SO.t('c_protected_body')) + '</p>' +
                (err && err.message ? '<p style="margin:8px 0 0;color:var(--so-muted);font-size:12px">' + SO.esc(err.message) + '</p>' : ''),
            buttons: [
                { label: 'c_bs_versions', value: 'versions' },
                { label: 'c_reload', primary: true, value: 'reload' }
            ]
        }).then(function (v) {
            if (v === 'reload') global.location.reload();
            else if (v === 'versions') SO.versionsDialog(self);
        });
    };

    DocSession.prototype.markDirty = function () {
        // Mode lihat/komentar (projek bersama): tidak ada yang disimpan, di mana pun.
        if (this.locked || this.readOnly || this._applyingRemote) return;
        var now = Date.now();
        this.dirty = true;
        this.cloudDirty = true;
        if (!this.hasEdits) { this.hasEdits = true; this.firstEditAt = now; SO.requestPersist(); }
        this._editSeq = (this._editSeq || 0) + 1;
        if (!this._applyingRemote) {
            this._lastEditAt = now;
            if (this._live && this._peers) this._liveDebounced();
        }
        if (!this.saving && ['offline', 'conflict', 'protected', 'auth', 'retrying', 'storage'].indexOf(this.state) === -1) {
            this.setStatus(this.meta.filename ? 'unsaved' : 'local-pending');
        }
        this._localDebounced();
        if (!this.ready || this.protected || this.conflict || !this.autoCloud || !SO.cloud.available()) return;
        if (this.meta.filename) this._cloudDebounced();
        else if (this.o.autoCreateCloud !== false) this._createDebounced();
    };

    DocSession.prototype.snapshot = function () {
        var self = this;
        return Promise.resolve(this.o.getContent()).then(function (content) {
            return { content: content, name: self.o.getName() };
        });
    };

    DocSession.prototype.saveLocal = function () {
        var self = this;
        if (!this.meta.key || this.locked || this.readOnly) return Promise.resolve();
        return this.snapshot().then(function (snap) {
            var now = Date.now();
            var rec = {
                key: self.meta.key, app: self.o.app, name: snap.name, content: snap.content,
                updatedAt: now, createdAt: self.meta.createdAt, cloudId: self.meta.cloudId, filename: self.meta.filename,
                revision: self.meta.revision, syncedHash: self.meta.syncedHash, syncedName: self.meta.syncedName,
                syncedAt: self.meta.lastCloud, unsynced: !!(self.cloudDirty || !self.meta.filename)
            };
            self.dirty = false;
            var put = function () {
                var jobs = [SO.store.putDraft(rec)];
                if (now - self.lastVersionAt > 5 * 60 * 1000 && self.hasEdits) {
                    self.lastVersionAt = now;
                    jobs.push(SO.store.addVersion({ key: self.meta.key, app: self.o.app, name: snap.name, content: snap.content, at: now }));
                }
                return Promise.all(jobs);
            };
            return put().catch(function (e) {
                if (!isQuotaError(e)) throw e;
                // Penyimpanan perangkat penuh: rampingkan riwayat lokal lalu coba sekali lagi.
                return SO.store.trimVersions(3).then(put);
            }).then(function () {
                self.lastLocalAt = now;
                if (self.state === 'storage') self.setStatus(self._idleStatus());
                else if (!self.meta.filename && ['saving', 'offline', 'retrying', 'protected', 'auth', 'conflict'].indexOf(self.state) === -1) self.setStatus('local');
                self._registry(false);
            });
        }).catch(function (e) {
            console.warn('[SO] draf gagal disimpan', e);
            self.dirty = true;
            if (isQuotaError(e)) {
                self.setStatus('storage');
                if (!self._quotaWarned) {
                    self._quotaWarned = true;
                    SO.toast('c_storage_full', { type: 'error', ms: 9000, action: self.o.backup ? { label: 'c_download_backup', onClick: function () { self.o.backup(); } } : null });
                }
            } else if (!self._snapWarned) {
                self._snapWarned = true;
                SO.toast('c_err_snapshot', { type: 'error', ms: 7000 });
            }
        });
    };

    DocSession.prototype._clearRetry = function () {
        if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
        this._retryAt = 0;
    };

    DocSession.prototype._scheduleRetry = function () {
        var self = this;
        this._clearRetry();
        if (!SO.net.online()) return; // peristiwa 'online' yang akan memicu ulang
        var delay = RETRY_DELAYS[Math.min(this._retryN, RETRY_DELAYS.length - 1)] * 1000;
        this._retryN++;
        this._retryAt = Date.now() + delay;
        this._retryTimer = setTimeout(function () {
            self._retryTimer = null;
            self.saveCloud({ auto: true, retry: true });
        }, delay);
    };

    /** Simpan ke Sinerli Cloud. opts: {auto, copy, name, force, reason, retry} */
    DocSession.prototype.saveCloud = function (opts) {
        opts = opts || {};
        var self = this;
        if (this.locked) return Promise.resolve(false);
        if (this.readOnly) {
            if (!opts.auto) SO.toast('c_readonly_nosave', { type: 'warn', ms: 5000 });
            return Promise.resolve(false);
        }
        if (!this.ready && opts.auto) return Promise.resolve(false);
        if (this.protected && !opts.copy && !opts.force) {
            if (!opts.auto) SO.toast('c_protected_nosave', { type: 'warn', ms: 6000 });
            return Promise.resolve(false);
        }
        if (!SO.cloud.available()) {
            if (!opts.auto) SO.alert('c_login_required', 'c_save_cloud');
            return Promise.resolve(false);
        }
        if (!opts.auto) this._wantCloud = true;
        if (this.conflict && opts.auto && !opts.force) return Promise.resolve(false);
        if (this.saving) {
            this._pendingCloud = this._pendingCloud === 'manual' || !opts.auto ? 'manual' : 'auto';
            return Promise.resolve(false);
        }
        if (opts.auto && !this.cloudDirty) return Promise.resolve(false);
        if (opts.auto && !this.meta.filename && !this._wantCloud &&
            !(this.o.autoCreateCloud !== false && this.autoCloud && this.hasEdits)) return Promise.resolve(false);
        if (!SO.net.online()) {
            this.setStatus('offline');
            if (!opts.auto) SO.toast('c_offline_saved_device', { type: 'warn', ms: 6000 });
            return Promise.resolve(false);
        }

        this._clearRetry();
        this._cloudDebounced.cancel();
        this._createDebounced.cancel();
        this.saving = true;
        this.setStatus('saving');
        var now = Date.now();
        var wantThumb = !opts.auto || now - this.lastThumbAt > 60 * 1000 || !this.meta.filename;
        var editSeq = this._editSeq || 0;
        var snap, hash;

        return this.snapshot().then(function (s) {
            snap = s;
            return SO.hashText(JSON.stringify(s.content));
        }).then(function (h) {
            hash = h;
            var name = opts.name || snap.name;
            // Tidak ada yang berubah sejak simpanan terakhir: cukup tandai tersimpan.
            if (!opts.copy && !opts.force && self.meta.filename && h === self.meta.syncedHash && name === self.meta.syncedName) {
                return { localUnchanged: true };
            }
            var thumbP = wantThumb && self.o.getThumbnail ? Promise.resolve(self.o.getThumbnail()).catch(function () { return null; }) : Promise.resolve(undefined);
            return thumbP.then(function (thumb) {
                if (thumb) self.lastThumbAt = now;
                var payload = {
                    name: name, type: self.o.type, content: snap.content,
                    filename: opts.copy ? '' : self.meta.filename,
                    content_hash: h,
                    reason: opts.reason || (opts.auto ? 'auto' : 'manual')
                };
                if (!opts.copy && self.meta.filename && self.meta.revision) payload.base_revision = self.meta.revision;
                if (opts.force) payload.force = true;
                if (thumb !== undefined && thumb !== null) payload.thumbnail = thumb;
                else if (self._lastThumb) payload.thumbnail = self._lastThumb;
                if (thumb) self._lastThumb = thumb;
                if (self.o.extraPayload) Object.assign(payload, self.o.extraPayload() || {});
                self.cloudDirty = false;
                return SO.cloud.save(payload);
            });
        }).then(function (res) {
            var oldKey = self.meta.key;
            if (!res.localUnchanged) {
                if (opts.copy) {
                    self.meta = self._blankMeta();
                    self.meta.createdAt = Date.now();
                }
                self.meta.filename = res.filename || self.meta.filename;
                if (res.id) {
                    self.meta.cloudId = String(res.id);
                    self.meta.key = 'cloud:' + res.id;
                    SO.updateUrl({ id: res.id, draft: null, recover: null });
                    SO.ctx.projectId = String(res.id);
                    self._startLive();
                }
                if (res.revision) self.meta.revision = res.revision;
                self.meta.syncedHash = hash;
                self.meta.syncedName = opts.name || snap.name;
                if (opts.copy && self.o.setName && opts.name) self.o.setName(opts.name);
            } else {
                self.cloudDirty = false;
            }
            self.meta.lastCloud = Date.now();
            // Ada suntingan selama permintaan berjalan → masih kotor.
            if ((self._editSeq || 0) !== editSeq) self.cloudDirty = true;
            self.conflict = null;
            self.protected = false;
            self._retryN = 0;
            self._wantCloud = false;
            if (oldKey !== self.meta.key) {
                if (oldKey.indexOf('local:') === 0 && !opts.copy) SO.store.delDraft(oldKey);
                SO.openDocs.update({ key: self.meta.key });
                self.claimTab();
            }
            self.saving = false;
            self.setStatus(self.cloudDirty ? 'unsaved' : 'saved');
            self.saveLocal();
            if (!opts.auto) SO.toast(opts.copy ? 'c_saved_copy' : 'c_saved_cloud', { type: 'success' });
            if (self._pendingCloud) {
                var manual = self._pendingCloud === 'manual';
                self._pendingCloud = null;
                if (self.cloudDirty) { if (manual) self.saveCloud(); else self._cloudDebounced(); }
            }
            return true;
        }).catch(function (err) {
            self.saving = false;
            self.cloudDirty = true;
            self._pendingCloud = null;
            self.saveLocal();
            if (err.code === 'conflict') {
                if (SO.ctx.share || self._coEdit) {
                    if (err.data && err.data.revision) self.meta.revision = err.data.revision;
                    return self.saveCloud({ auto: true, force: true });
                }
                self.conflict = err.data || {};
                self.setStatus('conflict');
                SO.conflictDialog(self);
                return false;
            }
            if (err.status === 401 || err.code === 'bad_key' || err.code === 'no_key') {
                if (SO.cloud.refreshKey()) { self._retryN = 0; self._scheduleRetry(); self.setStatus('retrying'); }
                else {
                    self.setStatus('auth');
                    if (!opts.auto || !self._authWarned) { self._authWarned = true; SO.toast('c_err_auth_saved_local', { type: 'error', ms: 9000 }); }
                }
                return false;
            }
            if (err.code === 'too_large' || err.status === 413) {
                self.setStatus('error', SO.t('c_err_too_large'));
                if (!opts.auto || !self._largeWarned) { self._largeWarned = true; SO.alert('c_err_too_large'); }
                return false;
            }
            if (err.code === 'empty_content' || err.status === 403 || err.status === 422) {
                self.setStatus('error', err.message);
                if (!opts.auto) SO.toast(err.message || 'c_err_save', { type: 'error', ms: 7000 });
                return false;
            }
            // Jaringan / server sibuk: tetap aman di perangkat, coba lagi bertahap.
            self.setStatus(SO.net.online() ? 'retrying' : 'offline', err.message);
            self._scheduleRetry();
            if (!opts.auto) SO.toast(SO.t('c_saved_local_retry'), { type: 'warn', ms: 6000 });
            else console.warn('[SO] autosave cloud gagal', err);
            return false;
        });
    };

    /** Memuat ulang isi terbaru dari cloud (setelah konflik / perubahan dari perangkat lain). */
    DocSession.prototype.reloadFromCloud = function (opts) {
        opts = opts || {};
        var self = this;
        if (!this.meta.cloudId || !this.o.applyContent) return Promise.resolve(false);
        var busy = opts.quiet ? { done: function () {} } : SO.busy('c_opening');
        return this.snapshot().then(function (snap) {
            return SO.store.addVersion({ key: self.meta.key, app: self.o.app, name: snap.name, content: snap.content, at: Date.now(), label: 'c_ver_label_before_reload' });
        }).catch(function () {}).then(function () {
            return SO.cloud.load(self.meta.cloudId);
        }).then(function (p) {
            if (p.contentBroken) throw new Error(SO.t('c_err_content_broken'));
            self.o.applyContent(p.content, p.name);
            var t = new Date(String(p.lastModified).replace(' ', 'T')).getTime() || Date.now();
            Object.assign(self.meta, { revision: p.revision || 0, syncedHash: p.content_hash || '', syncedName: p.name, lastCloud: t, filename: p.filename });
            self.cloudDirty = false;
            self.dirty = false;
            self.conflict = null;
            self._remoteNotified = 0;
            self.setStatus('saved');
            self.saveLocal();
            if (!opts.quiet) SO.toast('c_loaded_latest', { type: 'success' });
            return true;
        }).catch(function (err) {
            if (!opts.quiet) SO.toast(err.message || 'c_err_load', { type: 'error' });
            return false;
        }).finally(function () { busy.done(); });
    };

    /** Memulihkan isi versi (lokal atau server) — isi saat ini dicatat dulu sebagai versi. */
    DocSession.prototype.restoreContent = function (content, name) {
        var self = this;
        if (!this.o.applyContent) return Promise.reject(new Error('applyContent'));
        return this.snapshot().then(function (snap) {
            if (!self.protected) {
                return SO.store.addVersion({ key: self.meta.key, app: self.o.app, name: snap.name, content: snap.content, at: Date.now(), label: 'c_ver_label_before_restore' });
            }
        }).catch(function () {}).then(function () {
            if (self.protected && self.protectedMeta) {
                // Memulihkan dokumen yang tadinya gagal dimuat: kembali memakai identitas aslinya.
                self.meta = self.protectedMeta;
                self.protectedMeta = null;
                self.protected = false;
                SO.updateUrl(self.meta.cloudId ? { id: self.meta.cloudId, draft: null } : { draft: self.meta.key.slice(6) });
            }
            self.o.applyContent(content, name);
            self.markDirty();
            if (self.meta.filename && SO.cloud.available()) return self.saveCloud({ auto: false, reason: 'restore', force: !!self.conflict });
        }).then(function () {
            SO.toast('c_version_restored', { type: 'success' });
        });
    };

    /** Cek murah apakah cloud punya revisi lebih baru (disimpan dari perangkat/tab lain). */
    DocSession.prototype.checkRemote = function () {
        var self = this;
        if (!this.ready || this.locked || this.saving || !this.meta.cloudId || !SO.cloud.available() || !SO.net.online()) return;
        var minInterval = (SO.ctx.share || this._coEdit) ? 4000 : 20000;
        if (this._checkingRemote || Date.now() - (this._lastRemoteCheck || 0) < minInterval) return;
        this._checkingRemote = true;
        this._lastRemoteCheck = Date.now();
        SO.cloud.head(this.meta.cloudId).then(function (p) {
            if (!p || !(p.revision > self.meta.revision) || self.saving) return;
            if (self.meta.syncedHash && p.content_hash === self.meta.syncedHash) { self.meta.revision = p.revision; return; }
            if (self._remoteNotified === p.revision) return;
            // Isi terbaru sudah tiba lewat siaran langsung — tidak perlu memuat
            // ulang seluruh dokumen (yang mereset posisi gulir/kursor).
            if (!self.cloudDirty && self._live && Date.now() - (self._liveAppliedAt || 0) < 15000) {
                Object.assign(self.meta, { revision: p.revision, syncedHash: p.content_hash || self.meta.syncedHash });
                return;
            }
            self._remoteNotified = p.revision;
            if (self.cloudDirty) {
                if (SO.ctx.share || self._coEdit) {
                    self.saveCloud({ auto: true, force: true });
                } else {
                    self.conflict = { revision: p.revision, lastModified: p.lastModified };
                    self.setStatus('conflict');
                    SO.conflictDialog(self);
                }
            } else {
                if (SO.ctx.share || self._coEdit) {
                    self.reloadFromCloud({ quiet: true });
                } else {
                    SO.toast('c_remote_newer', {
                        type: 'info', ms: 12000,
                        action: { label: 'c_load_latest', onClick: function () { self.reloadFromCloud(); } }
                    });
                }
            }
        }).catch(function () {}).finally(function () { self._checkingRemote = false; });
    };

    DocSession.prototype.flush = function () {
        if (this.readOnly) return Promise.resolve([]);
        this._localDebounced.flush();
        var p = [];
        if (this.cloudDirty && this.meta.filename && SO.cloud.available() && this.ready && !this.protected && !this.conflict && !this.locked) {
            this._cloudDebounced.cancel();
            p.push(this.saveCloud({ auto: true }));
        }
        return Promise.all(p);
    };

    DocSession.prototype.setAutoCloud = function (on) {
        this.autoCloud = !!on;
        try { localStorage.setItem('so_auto_cloud', on ? '1' : '0'); } catch (e) {}
        if (on && this.cloudDirty && this.meta.filename) this._cloudDebounced();
    };

    // ------------------------------------------------------------- tab ganda
    DocSession.prototype.claimTab = function () {
        if (!this.meta.key || this.locked || this.readOnly) return;
        SO.bus.post({ type: 'claim', key: this.meta.key, app: this.o.app });
    };

    DocSession.prototype._onBus = function (msg) {
        var self = this;
        if (!this.meta.key || msg.key !== this.meta.key) return;
        if (msg.type === 'claim' && !this.locked) {
            // Tab lain baru membuka dokumen yang sama: beri tahu dia.
            SO.bus.post({ type: 'held', key: this.meta.key, to: msg.from, edits: this.hasEdits });
        } else if (msg.type === 'held' && msg.to === SO.tabId && !this.locked && !this._tabDialog && Date.now() - (this._tookOverAt || 0) > 8000) {
            this._tabDialog = true;
            SO.dialog({
                title: 'c_tab_dup_title', width: 460,
                body: '<p style="margin:6px 0 4px;white-space:pre-line">' + SO.esc(SO.t('c_tab_dup_body')) + '</p>',
                buttons: [
                    { label: 'c_tab_close_here', value: 'leave' },
                    { label: 'c_tab_edit_here', primary: true, value: 'take' }
                ],
                dismissible: false
            }).then(function (v) {
                self._tabDialog = false;
                if (v === 'leave') { self.lock(true); return; }
                self._tookOverAt = Date.now();
                self._awaitRelease = true;
                SO.bus.post({ type: 'takeover', key: self.meta.key });
                // Tab lain menyimpan dulu (lalu mengirim 'released'); cadangan bila tidak menjawab.
                self._releaseTimer = setTimeout(function () { self._afterRelease(); }, 6000);
            });
        } else if (msg.type === 'released' && this._awaitRelease) {
            clearTimeout(this._releaseTimer);
            this._afterRelease();
        } else if (msg.type === 'takeover' && !this.locked) {
            var key = this.meta.key;
            Promise.resolve(this.dirty ? this.saveLocal() : null).then(function () {
                return self.flush();
            }).catch(function () {}).then(function () {
                SO.bus.post({ type: 'released', key: key });
                self.lock(false);
            });
        }
    };

    /** Setelah tab lain melepas dokumen: muat isi terakhirnya (kalau tab ini belum menyunting). */
    DocSession.prototype._afterRelease = function () {
        var self = this;
        this._awaitRelease = false;
        if (this.hasEdits || !this.o.applyContent) return;
        if (this.meta.cloudId && SO.cloud.available() && SO.net.online()) { this.reloadFromCloud(); return; }
        SO.store.getDraft(this.meta.key).then(function (d) {
            if (d && d.content) { self.o.applyContent(d.content, d.name); self.cloudDirty = d.unsynced !== false; }
        });
    };

    /** Tab ini berhenti menyunting dokumen (tab lain mengambil alih). */
    DocSession.prototype.lock = function (byChoice) {
        var self = this;
        this._localDebounced.flush();
        this.locked = true;
        this._clearRetry();
        this._cloudDebounced.cancel();
        this._createDebounced.cancel();
        SO.openDocs.remove();
        this.setStatus('locked');
        var ov = SO.el('div', { class: 'so-lock-overlay', role: 'dialog', 'aria-modal': 'true' });
        ov.innerHTML = '<div class="so-lock-box"><i class="fas fa-clone"></i><h2></h2><p></p><div class="so-lock-actions"></div></div>';
        ov.querySelector('h2').textContent = SO.t('c_tab_locked_title');
        ov.querySelector('p').textContent = SO.t(byChoice ? 'c_tab_locked_choice' : 'c_tab_locked_body');
        var acts = ov.querySelector('.so-lock-actions');
        var back = SO.el('a', { class: 'so-btn', href: SO.root + 'Dashboard/', text: SO.t('c_back_dashboard') });
        var here = SO.el('button', { type: 'button', class: 'so-btn is-primary', text: SO.t('c_tab_edit_here') });
        here.addEventListener('click', function () {
            SO.bus.post({ type: 'takeover', key: self.meta.key });
            setTimeout(function () { global.location.reload(); }, 900);
        });
        acts.appendChild(back);
        acts.appendChild(here);
        doc.body.appendChild(ov);
    };

    // ------------------------------------------------------ siaran langsung
    /**
     * Co-editing langsung: saat ada peserta lain membuka dokumen yang sama,
     * setiap suntingan dikirim sebagai snapshot utuh lewat SO.CollabOps
     * (api/collab_ops.php) ~0,4 detik setelah berhenti mengetik, dan
     * snapshot dari peserta lain dipasang otomatis tanpa muat ulang halaman.
     * Checkpoint cloud (saveCloud/checkRemote) tetap jalan sebagai sumber
     * kebenaran; ini hanya mempercepat tampilnya perubahan.
     *
     * opts aplikasi (opsional): applyLive(content, name) — pasang isi tanpa
     * mereset tampilan; liveBusy() — true bila pengguna sedang menyunting
     * sesuatu yang akan rusak kalau isi diganti (sel/teks yang sedang diedit).
     */
    var LIVE_MAX_BYTES = 1500000;

    DocSession.prototype._startLive = function () {
        var self = this;
        if (this._live || !SO.CollabOps || !this.meta.cloudId || this.protected || this.locked || !SO.cloud.available()) return;
        this._live = true;
        this._peers = 0;
        this._liveDebounced = SO.debounce(function () { self._pushLive(); }, 400);
        SO.CollabOps.start('project', this.meta.cloudId, {
            skipBacklog: true,
            onOps: function (ops) {
                var last = null;
                ops.forEach(function (o) { if (o.op === 'snapshot' && o.value) last = o; });
                if (last) self._applyLive(last.value);
            },
            onPresence: function (list) {
                var before = self._peers;
                self._peers = (list || []).length;
                // Peserta baru bergabung selagi ada suntingan yang belum tersimpan ke cloud: kirim keadaan sekarang.
                if (!before && self._peers && self.cloudDirty && self.hasEdits) self._liveDebounced();
            }
        });
    };

    DocSession.prototype._pushLive = function () {
        var self = this;
        if (!this._live || !this._peers || this.readOnly || this.locked || this.protected || !this.ready) return;
        this.snapshot().then(function (s) {
            if (JSON.stringify(s.content).length > LIVE_MAX_BYTES) return; // terlalu besar: andalkan checkpoint cloud
            SO.CollabOps.pushOp({ op: 'snapshot', path: ['doc'], value: { content: s.content, name: s.name } });
        }).catch(function () {});
    };

    DocSession.prototype._applyLive = function (v) {
        var self = this;
        if (!this.ready || this.locked || this.protected || !v || !v.content) return;
        clearTimeout(this._liveApplyTimer);
        var busy = Date.now() - (this._lastEditAt || 0) < 1200 || (this.o.liveBusy && this.o.liveBusy());
        if (busy) {
            // Pengguna sedang mengetik: tunda sebentar supaya kursornya tidak loncat.
            this._liveApplyTimer = setTimeout(function () { self._applyLive(v); }, 700);
            return;
        }
        this._applyingRemote = true;
        try {
            (this.o.applyLive || this.o.applyContent)(v.content, v.name);
        } catch (e) {
            console.warn('[SO] gagal memasang perubahan langsung', e);
        } finally {
            this._applyingRemote = false;
        }
        this._liveAppliedAt = Date.now();
        this.saveLocal();
    };

    SO.DocSession = DocSession;

    // ------------------------------------------------------ galat tak tertangkap
    /**
     * Galat JavaScript di tengah penyuntingan tidak boleh membuat pekerjaan
     * hilang: draf lokal langsung ditulis, lalu pengguna diberi tahu (sekali)
     * bahwa pekerjaannya aman dan boleh memuat ulang.
     */
    SO.guardErrors = function (session) {
        if (SO._errorsGuarded) return;
        SO._errorsGuarded = true;
        var warned = false;
        function onError(msg) {
            msg = String(msg || '');
            if (/ResizeObserver loop|Script error\.?$|Non-Error promise rejection|AbortError|NotAllowedError|The play\(\) request/i.test(msg)) return;
            var s = SO.activeSession || session;
            try { if (s && s.ready && !s.locked) { s.dirty = true; s._localDebounced.flush(); } } catch (e) {}
            if (warned) return;
            warned = true;
            SO.toast('c_crash_saved', {
                type: 'warn', ms: 9000,
                action: { label: 'c_reload', onClick: function () { (s ? s.flush() : Promise.resolve()).then(function () { global.location.reload(); }); } }
            });
        }
        global.addEventListener('error', function (e) {
            if (e.target && e.target !== global) return; // gagal muat <img>/<script> bukan galat kode
            onError(e.message);
        });
        global.addEventListener('unhandledrejection', function (e) {
            var r = e.reason;
            if (r && (r.network || r.status || r.name === 'AbortError')) return; // galat jaringan sudah ditangani
            if (r instanceof Error && /^(TypeError|ReferenceError|RangeError|SyntaxError)$/.test(r.name)) onError(r.name + ': ' + r.message);
        });
    };

    // ------------------------------------------------------------ pemulihan
    /**
     * Dipanggil sekali setelah dokumen termuat. Mencari draf aplikasi yang sama
     * dari tab yang crash atau ditutup sebelum tersinkron, lalu menawarkannya.
     */
    SO.checkRecovery = function (session) {
        if (SO._recoveryChecked || session.locked) return;
        SO._recoveryChecked = true;
        var app = session.o.app;
        var map = SO.openDocs.read();
        var now = Date.now();
        var live = {};
        Object.keys(map).forEach(function (t) {
            var r = map[t];
            if (t !== SO.tabId && !r.closed && now - (r.beat || 0) < 15000) live[r.key] = true;
        });
        var cand = {};
        Object.keys(map).forEach(function (t) {
            var r = map[t];
            if (t === SO.tabId || r.app !== app || !r.dirty || !r.key) return;
            var stale = r.closed || now - (r.beat || 0) >= 15000;
            if (!stale || live[r.key] || r.key === session.meta.key || (session.meta.recoveredFrom && r.key === session.meta.recoveredFrom)) return;
            if (!cand[r.key] || cand[r.key].beat < r.beat) cand[r.key] = { tab: t, beat: r.beat };
        });
        var keys = Object.keys(cand);
        if (!keys.length) return;
        Promise.all(keys.map(function (k) {
            return SO.store.getDraft(k).then(function (d) {
                if (!d || !d.content || d.unsynced === false) { SO.openDocs.remove(cand[k].tab); return null; }
                return { draft: d, tab: cand[k].tab };
            }).catch(function () { return null; });
        })).then(function (items) {
            items = items.filter(Boolean).sort(function (a, b) { return b.draft.updatedAt - a.draft.updatedAt; }).slice(0, 8);
            if (!items.length) return;
            SO.dialog({
                title: 'c_recover_title', width: 520,
                body: function (body, dlg) {
                    body.appendChild(SO.el('p', { style: { margin: '4px 0 12px', color: 'var(--so-muted)' }, text: SO.t('c_recover_body') }));
                    var list = SO.el('div', { class: 'so-recover-list' });
                    items.forEach(function (it) {
                        var d = it.draft;
                        var row = SO.el('div', { class: 'so-recover-row' });
                        row.innerHTML = '<i class="fas ' + (d.cloudId ? 'fa-cloud-arrow-up' : 'fa-hard-drive') + '"></i>' +
                            '<div class="rr-text"><div class="rr-name"></div><div class="rr-meta"></div></div>';
                        row.querySelector('.rr-name').textContent = d.name || SO.t('c_untitled');
                        row.querySelector('.rr-meta').textContent = SO.t(d.cloudId ? 'c_recover_unsynced' : 'c_recover_local') + ' · ' + SO.fmtDate(d.updatedAt);
                        var openB = SO.el('button', { type: 'button', class: 'so-btn is-sm is-primary', text: SO.t('c_open') });
                        var skipB = SO.el('button', { type: 'button', class: 'so-btn is-sm', text: SO.t('c_dismiss') });
                        openB.addEventListener('click', function () {
                            SO.openDocs.remove(it.tab);
                            dlg.close(null);
                            session.flush().then(function () {
                                var q = new URLSearchParams(global.location.search);
                                q.delete('id'); q.delete('draft'); q.delete('action'); q.delete('panel');
                                if (d.cloudId) { q.set('id', d.cloudId); q.set('recover', '1'); }
                                else q.set('draft', d.key.slice(6));
                                global.location.href = global.location.pathname + '?' + q.toString();
                            });
                        });
                        skipB.addEventListener('click', function () {
                            SO.openDocs.remove(it.tab);
                            row.remove();
                            if (!list.children.length) dlg.close(null);
                        });
                        row.appendChild(openB);
                        row.appendChild(skipB);
                        list.appendChild(row);
                    });
                    body.appendChild(list);
                    body.appendChild(SO.el('p', { style: { margin: '12px 0 0', fontSize: '12px', color: 'var(--so-muted)' }, text: SO.t('c_recover_hint') }));
                },
                buttons: [{ label: 'c_later', value: null }]
            });
        });
    };

    // ------------------------------------------------------------- konflik
    SO.conflictDialog = function (session) {
        if (session._conflictOpen) return;
        session._conflictOpen = true;
        var c = session.conflict || {};
        var when = c.lastModified ? SO.fmtDate(String(c.lastModified).replace(' ', 'T')) : '';
        SO.dialog({
            title: 'c_conflict_title', width: 520, dismissible: false,
            body: function (body, dlg) {
                body.appendChild(SO.el('p', { style: { margin: '4px 0 12px', whiteSpace: 'pre-line' }, text: SO.t('c_conflict_body', { when: when || '-' }) }));
                var list = SO.el('div', { class: 'so-bs-list so-conflict-list' });
                [
                    ['mine', 'fa-floppy-disk', 'c_conflict_keep_mine', 'c_conflict_keep_mine_desc'],
                    ['theirs', 'fa-cloud-arrow-down', 'c_conflict_load_theirs', 'c_conflict_load_theirs_desc'],
                    ['copy', 'fa-copy', 'c_conflict_save_copy', 'c_conflict_save_copy_desc']
                ].forEach(function (o) {
                    if (o[0] === 'theirs' && !session.o.applyContent) return;
                    var b = SO.el('button', { type: 'button', class: 'so-bs-row', html: '<i class="fas ' + o[1] + '"></i><div class="br-text"><div class="br-title">' + SO.esc(SO.t(o[2])) + '</div><div class="br-desc">' + SO.esc(SO.t(o[3])) + '</div></div>' });
                    b.addEventListener('click', function () { dlg.close(o[0]); });
                    list.appendChild(b);
                });
                body.appendChild(list);
            },
            buttons: [{ label: 'c_decide_later', value: 'later' }]
        }).then(function (v) {
            session._conflictOpen = false;
            if (v === 'mine') session.saveCloud({ force: true, reason: 'manual' });
            else if (v === 'theirs') session.reloadFromCloud();
            else if (v === 'copy') {
                var n = (session.o.getName ? session.o.getName() : '') + ' (' + SO.t('c_conflict_suffix') + ')';
                session.conflict = null;
                session.saveCloud({ copy: true, name: n });
            }
        });
    };

    // ------------------------------------------------------ riwayat versi
    /**
     * Dialog riwayat versi gabungan: versi di perangkat (IndexedDB) dan versi di
     * server (tabel doc_versions). opts.inline = elemen tujuan (menu Berkas).
     */
    SO.renderVersions = function (session, box, onDone) {
        var meta = session.protected && session.protectedMeta ? session.protectedMeta : session.meta;
        box.innerHTML = '<div class="so-bs-empty">' + SO.esc(SO.t('c_loading')) + '</div>';
        var localP = session.flush().catch(function () {}).then(function () {
            return Promise.all([SO.store.listVersions(meta.key), meta.recoveredFrom ? SO.store.listVersions(meta.recoveredFrom) : []]);
        }).then(function (r) { return r[0].concat(r[1]); }).catch(function () { return []; });
        var serverP = (meta.cloudId && SO.cloud.available())
            ? SO.cloud.versions(meta.cloudId).then(function (d) { return d.versions || []; }).catch(function (e) { return { error: e }; })
            : Promise.resolve([]);
        return Promise.all([localP, serverP]).then(function (res) {
            var rows = [];
            res[0].forEach(function (v) { rows.push({ src: 'local', at: v.at, name: v.name, label: v.label, v: v }); });
            var serverErr = res[1] && res[1].error;
            if (!serverErr) res[1].forEach(function (v) {
                rows.push({ src: 'cloud', at: new Date(String(v.created_at).replace(' ', 'T')).getTime() || 0, name: v.name, bytes: v.content_bytes, reason: v.reason, v: v });
            });
            rows.sort(function (a, b) { return b.at - a.at; });
            box.innerHTML = '';
            if (serverErr) box.appendChild(SO.el('div', { class: 'so-bs-empty', text: SO.t('c_versions_server_err') + ' ' + (serverErr.message || '') }));
            if (!rows.length) { box.appendChild(SO.el('div', { class: 'so-bs-empty', text: SO.t('c_versions_empty') })); return; }
            rows.forEach(function (r) {
                var el = SO.el('div', { class: 'so-bs-row so-ver-row' });
                var badge = r.src === 'cloud' ? '<span class="so-ver-badge is-cloud"><i class="fas fa-cloud"></i>' + SO.esc(SO.t('c_ver_src_cloud')) + '</span>'
                    : '<span class="so-ver-badge"><i class="fas fa-laptop"></i>' + SO.esc(SO.t('c_ver_src_device')) + '</span>';
                var desc = [r.name || ''];
                if (r.label) desc.push(SO.t(r.label));
                if (r.reason && r.reason !== 'auto') desc.push(SO.t('c_ver_reason_' + r.reason));
                if (r.bytes) desc.push(SO.fmtNum(Math.max(1, Math.round(r.bytes / 1024))) + ' KB');
                el.innerHTML = '<i class="fas fa-clock"></i><div class="br-text"><div class="br-title">' + SO.esc(SO.fmtDate(r.at, { dateStyle: 'medium', timeStyle: 'short' })) + ' ' + badge + '</div><div class="br-desc">' + SO.esc(desc.filter(Boolean).join(' · ')) + '</div></div>';
                var btn = SO.el('button', { type: 'button', class: 'so-btn is-sm', text: SO.t('c_restore') });
                btn.addEventListener('click', function () {
                    SO.confirm('c_restore_confirm').then(function (ok) {
                        if (!ok) return;
                        var contentP = r.src === 'cloud' ? SO.cloud.version(r.v.id).then(function (v) { return { content: v.content, name: v.name }; })
                            : Promise.resolve({ content: r.v.content, name: r.v.name });
                        var busy = SO.busy('c_working');
                        contentP.then(function (c) {
                            if (c.content == null) throw new Error(SO.t('c_err_content_broken'));
                            busy.done();
                            if (onDone) onDone();
                            return session.restoreContent(c.content, c.name);
                        }).catch(function (err) {
                            busy.done();
                            SO.toast(err.message || 'c_err_load', { type: 'error' });
                        });
                    });
                });
                el.appendChild(btn);
                box.appendChild(el);
            });
        });
    };

    SO.versionsDialog = function (session) {
        return SO.dialog({
            title: 'c_bs_versions', width: 620,
            body: function (body, dlg) {
                body.appendChild(SO.el('p', { style: { margin: '2px 0 12px', color: 'var(--so-muted)' }, text: SO.t('c_versions_desc') }));
                var box = SO.el('div', { class: 'so-bs-list so-ver-list' });
                body.appendChild(box);
                SO.renderVersions(session, box, function () { dlg.close(null); });
            },
            buttons: [{ label: 'c_close', value: null }]
        });
    };

    // --------------------------------------------------- panel status simpan
    SO.SAVE_STATES = {
        'new': ['fa-file', 'c_status_new'],
        'local': ['fa-hard-drive', 'c_status_local'],
        'local-pending': ['fa-hard-drive', 'c_status_local'],
        'cloud': ['fa-cloud', 'c_status_saved'],
        'saved': ['fa-cloud', 'c_status_saved'],
        'unsaved': ['fa-pen', 'c_status_unsaved'],
        'saving': ['fa-circle-notch', 'c_status_saving'],
        'error': ['fa-triangle-exclamation', 'c_status_error'],
        'offline': ['fa-plane', 'c_status_offline'],
        'retrying': ['fa-rotate', 'c_status_retrying'],
        'conflict': ['fa-code-branch', 'c_status_conflict'],
        'auth': ['fa-user-lock', 'c_status_auth'],
        'protected': ['fa-shield-halved', 'c_status_protected'],
        'locked': ['fa-clone', 'c_status_locked'],
        'storage': ['fa-database', 'c_status_storage'],
        'readonly': ['fa-eye', 'c_status_readonly']
    };

    SO.renderSaveState = function (el, state, extra) {
        var m = SO.SAVE_STATES[state] || SO.SAVE_STATES['new'];
        el.className = (el.dataset.baseClass || 'so-savestate') + ' is-' + (SO.SAVE_STATES[state] ? state : 'new');
        el.innerHTML = '<i class="fas ' + m[0] + '"></i><span>' + SO.esc(SO.t(m[1])) + '</span>';
        el.setAttribute('data-tip', extra || m[1]);
        el.setAttribute('aria-label', SO.t(m[1]));
    };

    /** Panel kecil saat status simpan diklik: rincian, simpan sekarang, versi, cadangan. */
    SO.saveStatePopover = function (anchor, session) {
        session = session || SO.activeSession;
        if (!session || session.readOnly) return;
        var st = session.state;
        var m = SO.SAVE_STATES[st] || SO.SAVE_STATES['new'];
        SO.menu(anchor, [{
            custom: function (box, close) {
                box.className = 'so-safe-pop';
                var head = SO.el('div', { class: 'ssp-head is-' + st, html: '<i class="fas ' + m[0] + '"></i><div><b></b><span></span></div>' });
                head.querySelector('b').textContent = SO.t(m[1]);
                head.querySelector('span').textContent = SO.t('c_state_desc_' + st.replace('-', '_'), {
                    s: session._retryAt ? Math.max(1, Math.round((session._retryAt - Date.now()) / 1000)) : 5
                });
                box.appendChild(head);
                if (session.stateExtra && ['error', 'retrying', 'protected'].indexOf(st) !== -1) {
                    box.appendChild(SO.el('div', { class: 'ssp-err', text: session.stateExtra }));
                }
                var kv = SO.el('dl', { class: 'ssp-kv' });
                kv.appendChild(SO.el('dt', { text: SO.t('c_ssp_device') }));
                kv.appendChild(SO.el('dd', { text: session.lastLocalAt ? SO.fmtDate(session.lastLocalAt, { timeStyle: 'short', dateStyle: 'short' }) : '-' }));
                kv.appendChild(SO.el('dt', { text: SO.t('c_ssp_cloud') }));
                kv.appendChild(SO.el('dd', { text: session.meta.lastCloud ? SO.fmtDate(session.meta.lastCloud, { timeStyle: 'short', dateStyle: 'short' }) : SO.t(SO.cloud.available() ? 'c_ssp_not_yet' : 'c_ssp_login') }));
                box.appendChild(kv);
                var acts = SO.el('div', { class: 'ssp-actions' });
                function act(icon, label, fn, primary) {
                    var b = SO.el('button', { type: 'button', class: 'so-btn is-sm' + (primary ? ' is-primary' : ''), html: '<i class="fas ' + icon + '"></i>' + SO.esc(SO.t(label)) });
                    b.addEventListener('click', function () { close(); fn(); });
                    acts.appendChild(b);
                }
                if (st === 'conflict') act('fa-code-branch', 'c_conflict_resolve', function () { SO.conflictDialog(session); }, true);
                else if (st === 'protected') act('fa-rotate-right', 'c_reload', function () { global.location.reload(); }, true);
                else if (SO.cloud.available()) act('fa-cloud-arrow-up', 'c_save_now', function () { session._retryN = 0; session.saveCloud(); }, true);
                act('fa-clock-rotate-left', 'c_bs_versions', function () { SO.versionsDialog(session); });
                if (session.o.backup) act('fa-download', 'c_download_backup', function () { session.o.backup(); });
                box.appendChild(acts);
                var auto = SO.el('label', { class: 'ssp-auto' });
                var cb = SO.el('input', { type: 'checkbox' });
                cb.checked = session.autoCloud;
                cb.addEventListener('change', function () { session.setAutoCloud(cb.checked); });
                auto.appendChild(cb);
                auto.appendChild(SO.el('span', { text: SO.t('c_autosave_cloud') }));
                box.appendChild(auto);
            }
        }], { className: 'so-menu-safe', minWidth: 290 });
    };

    // ============================================================== History
    /** Tumpukan undo/redo generik. entry: {undo(), redo(), label, merge, size} */
    function History(opts) {
        opts = opts || {};
        this.limit = opts.limit || 150;
        this.maxSize = opts.maxSize || 60 * 1024 * 1024;
        this.onChange = opts.onChange || function () {};
        this.undoStack = [];
        this.redoStack = [];
    }
    History.prototype.push = function (entry) {
        entry.time = Date.now();
        var top = this.undoStack[this.undoStack.length - 1];
        if (entry.merge && top && top.merge === entry.merge && entry.time - top.time < 1200) {
            top.redo = entry.redo;
            top.time = entry.time;
            if (entry.after !== undefined) top.after = entry.after;
        } else {
            this.undoStack.push(entry);
        }
        this.redoStack = [];
        var total = 0;
        for (var i = this.undoStack.length - 1; i >= 0; i--) {
            total += this.undoStack[i].size || 0;
            if (total > this.maxSize && i < this.undoStack.length - 1) { this.undoStack.splice(0, i + 1); break; }
        }
        if (this.undoStack.length > this.limit) this.undoStack.splice(0, this.undoStack.length - this.limit);
        this.onChange();
    };
    History.prototype.undo = function () {
        var e = this.undoStack.pop();
        if (!e) return false;
        e.undo();
        this.redoStack.push(e);
        this.onChange();
        return true;
    };
    History.prototype.redo = function () {
        var e = this.redoStack.pop();
        if (!e) return false;
        e.redo();
        this.undoStack.push(e);
        this.onChange();
        return true;
    };
    History.prototype.canUndo = function () { return this.undoStack.length > 0; };
    History.prototype.canRedo = function () { return this.redoStack.length > 0; };
    History.prototype.clear = function () { this.undoStack = []; this.redoStack = []; this.onChange(); };
    SO.History = History;

    // ================================================================ shell
    /**
     * Title bar + layar muat. opts: {app, name, icon, onSave, onUndo, onRedo, onRename, onBack, primaryAction}
     */
    SO.createShell = function (opts) {
        var bar = SO.$('#soTitlebar');
        bar.className = 'so-titlebar';
        var dashUrl = global.SN ? 'index.html?panel=open' : SO.root + 'Dashboard/';
        var tier = SO.ctx.plan || 'free';
        var tierLabel = { free: 'FREE', premium: 'PREMIUM', premium_plus: 'PREMIUM PLUS', admin: 'ADMIN' }[tier] || 'FREE';
        // Susunan: kembali · logo · nama dokumen (+ status simpan) · urungkan/ulangi ·
        // kotak "Cari fitur" · bahasa · paket · Simpan · avatar.
        bar.innerHTML =
            '<a class="so-tb-btn so-tb-back" id="soBack" href="' + dashUrl + '" data-tip="c_back_dashboard" data-lang-aria="c_back_dashboard"><i class="fas fa-arrow-left"></i></a>' +
            '<div class="so-brand"><div class="so-brand-logo' + (opts.logo ? ' has-img' : '') + '" aria-hidden="true">' +
                (opts.logo ? '<img src="' + SO.esc(opts.logo) + '" alt="">' : '<i class="fas ' + opts.icon + '"></i>') + '</div></div>' +
            '<div class="so-docmeta">' +
            '<input class="so-docname" id="soDocName" type="text" spellcheck="false" autocomplete="off" data-lang-aria="c_doc_name" data-tip="c_rename_tip">' +
            '<div class="so-docsub"><span class="so-brand-name">' + SO.esc(opts.name) + '</span>' +
            '<span class="so-savestate" id="soSaveState"><i class="fas fa-circle-check"></i><span></span></span></div>' +
            '</div>' +
            '<div class="so-tb-history">' +
            '<button class="so-tb-btn" id="soQUndo" type="button" data-tip="c_undo" data-tip-key="Mod+Z" data-lang-aria="c_undo"><i class="fas fa-rotate-left"></i></button>' +
            '<button class="so-tb-btn so-tb-hide-mobile" id="soQRedo" type="button" data-tip="c_redo" data-tip-key="Mod+Y" data-lang-aria="c_redo"><i class="fas fa-rotate-right"></i></button>' +
            '</div>' +
            '<div class="so-tb-center">' +
            '<button class="so-search-trigger" id="soSearchBtn" type="button" data-tip="c_search_tip" data-tip-key="Mod+/" data-lang-aria="c_search_title">' +
            '<i class="fas fa-magnifying-glass" aria-hidden="true"></i><span class="so-search-ph" data-lang="c_search_ph"></span>' +
            '<span class="so-kbd">' + SO.esc(SO.keyLabel('Mod+/')) + '</span></button>' +
            '</div>' +
            '<div class="so-tb-right">' +
            '<div class="so-collab-stack" id="soCollabAvatars"></div>' +
            '<button class="so-btn-share" id="soShareBtn" type="button"><i class="fas fa-user-plus"></i> <span>Bagikan</span></button>' +
            '<select class="so-lang" id="soLang" data-lang-aria="c_language"><option value="id">ID</option><option value="en">EN</option></select>' +
            '<span data-sinerli-tutorial-slot></span>' +
            '<span class="so-plan' + (tier !== 'free' ? ' is-paid' : '') + '">' + tierLabel + '</span>' +
            '<button class="so-tb-btn so-tb-show-mobile" id="soQSave" type="button" data-tip="c_save" data-tip-key="Mod+S" data-lang-aria="c_save"><i class="fas fa-floppy-disk"></i></button>' +
            '<button class="so-btn-primary-tb so-tb-hide-mobile" id="soSaveCloudBtn" type="button" data-tip="c_save_cloud" data-tip-key="Mod+S"><i class="fas fa-cloud-arrow-up"></i><span data-lang="c_save"></span></button>' +
            '<span id="snAcctSlot"></span>' +
            '</div>';
        var nameInput = SO.$('#soDocName');
        var lang = SO.$('#soLang');
        lang.value = SO.lang();
        lang.addEventListener('change', function () { SO.setLang(lang.value); });
        var committed = '';
        nameInput.addEventListener('focus', function () { committed = nameInput.value; });
        nameInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); }
            if (e.key === 'Escape') { nameInput.value = committed; nameInput.blur(); }
        });
        nameInput.addEventListener('blur', function () {
            var v = nameInput.value.trim();
            if (!v) { nameInput.value = committed; return; }
            if (v !== committed && opts.onRename) opts.onRename(v);
        });
        SO.$('#soSearchBtn').addEventListener('mousedown', function (e) { e.preventDefault(); });
        SO.$('#soSearchBtn').addEventListener('click', function () { if (SO.activeRibbon) SO.activeRibbon.openSearch(); });
        SO.$('#soQSave').addEventListener('click', function () { if (opts.onSave) opts.onSave(); });
        SO.$('#soSaveCloudBtn').addEventListener('click', function () { if (opts.onSave) opts.onSave(); });
        SO.$('#soQUndo').addEventListener('mousedown', function (e) { e.preventDefault(); });
        SO.$('#soQRedo').addEventListener('mousedown', function (e) { e.preventDefault(); });
        SO.$('#soQUndo').addEventListener('click', function () { if (opts.onUndo) opts.onUndo(); });
        SO.$('#soQRedo').addEventListener('click', function () { if (opts.onRedo) opts.onRedo(); });
        SO.$('#soBack').addEventListener('click', function (e) {
            if (!opts.onBack) return;
            e.preventDefault();
            Promise.resolve(opts.onBack()).then(function () { global.location.href = dashUrl; });
        });
        SO.applyI18n(bar);

        var stateEl = SO.$('#soSaveState');
        // Status simpan bisa diklik: rincian, simpan sekarang, riwayat versi, cadangan.
        stateEl.setAttribute('role', 'button');
        stateEl.tabIndex = 0;
        stateEl.addEventListener('click', function () { SO.saveStatePopover(stateEl); });
        stateEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); SO.saveStatePopover(stateEl); } });
        var shell = {
            setName: function (n) { nameInput.value = n; doc.title = n + ' - ' + opts.name; },
            getName: function () { return nameInput.value.trim(); },
            setHistory: function (canUndo, canRedo) {
                SO.$('#soQUndo').disabled = !canUndo;
                SO.$('#soQRedo').disabled = !canRedo;
            },
            setStatus: function (state, extra) {
                SO.renderSaveState(stateEl, state, extra);
                var btn = SO.$('#soSaveCloudBtn');
                btn.querySelector('span').textContent = SO.t(state === 'saved' || state === 'cloud' ? 'c_saved' : 'c_save');
            },
            hideLoading: function () {
                var l = SO.$('#soLoading');
                if (l) { l.classList.add('is-done'); setTimeout(function () { l.remove(); }, 300); }
            }
        };
        SO.onLang(function () { shell.setStatus(shell._state || 'new'); lang.value = SO.lang(); });
        var origSet = shell.setStatus;
        shell.setStatus = function (s, e) { shell._state = s; origSet(s, e); };
        return shell;
    };

    // ============================================================ backstage
    /**
     * Menu File layar penuh. app: {
     *   type, appName, icon, templates:[{id,label,icon,thumb}], createFrom(templateId),
     *   openAccept, importFile(file), exportFormats:[{id,label,desc,icon}], exportAs(id),
     *   print(), info(): [[labelKey, value]], renderOptions(el), loadDraft(draft), loadCloud(project)
     * }
     */
    function Backstage(session, shell, app) {
        this.session = session;
        this.shell = shell;
        this.app = app;
        this.el = null;
    }

    Backstage.prototype.open = function (section) {
        var self = this;
        SO.closeMenus();
        if (this.el) this.close();
        var el = SO.el('div', { class: 'so-backstage', role: 'dialog', 'aria-modal': 'true' });
        var nav = SO.el('nav', { class: 'so-bs-nav' });
        var main = SO.el('div', { class: 'so-bs-main' });
        var sections = [
            ['back', 'fa-arrow-left', 'c_back_to_doc'],
            ['new', 'fa-file-circle-plus', 'c_bs_new'],
            ['open', 'fa-folder-open', 'c_bs_open'],
            ['save', 'fa-floppy-disk', 'c_bs_save'],
            ['export', 'fa-file-export', 'c_bs_export'],
            ['print', 'fa-print', 'c_bs_print'],
            ['sep'],
            ['versions', 'fa-clock-rotate-left', 'c_bs_versions'],
            ['info', 'fa-circle-info', 'c_bs_info'],
            ['options', 'fa-gear', 'c_bs_options'],
            ['sep'],
            ['close', 'fa-right-from-bracket', 'c_bs_close']
        ];
        var navButtons = {};
        sections.forEach(function (s) {
            if (s[0] === 'sep') { nav.appendChild(SO.el('div', { class: 'so-bs-sep' })); return; }
            var b = SO.el('button', { type: 'button', class: s[0] === 'back' ? 'so-bs-back' : '', html: '<i class="fas ' + s[1] + '"></i>' + (s[2] ? '<span>' + SO.esc(SO.t(s[2])) + '</span>' : ''), 'aria-label': SO.t(s[2] || 'c_back') });
            b.addEventListener('click', function () {
                if (s[0] === 'back') { self.close(); return; }
                if (s[0] === 'close') { self.close(); SO.$('#soBack').click(); return; }
                if (s[0] === 'print') { self.close(); self.app.print(); return; }
                self.show(s[0]);
            });
            navButtons[s[0]] = b;
            nav.appendChild(b);
        });
        el.appendChild(nav);
        el.appendChild(main);
        el.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !SO.isDialogOpen()) { e.preventDefault(); self.close(); } });
        doc.body.appendChild(el);
        this.el = el;
        this.main = main;
        this.navButtons = navButtons;
        el.tabIndex = -1;
        el.focus();
        this.show(section || 'new');
    };

    /**
     * Dashboard bisa meminta bagian menu Berkas tertentu lewat ?panel=…
     * (mis. "Unduh / Ekspor" di menu titik-tiga kartu projek). Parameternya
     * dibuang setelah dipakai supaya memuat ulang halaman tidak membukanya lagi.
     */
    Backstage.prototype.openFromUrl = function () {
        var panel = SO.ctx.params.get('panel');
        if (!panel) return false;
        SO.ctx.params.delete('panel');
        SO.updateUrl({ panel: null });
        if (['export', 'save', 'info', 'versions'].indexOf(panel) === -1) return false;
        this.open(panel);
        return true;
    };

    Backstage.prototype.close = function () {
        if (!this.el) return;
        this.el.remove();
        this.el = null;
        if (this.app.onBackstageClose) this.app.onBackstageClose();
    };
    Backstage.prototype.isOpen = function () { return !!this.el; };

    Backstage.prototype.show = function (id) {
        var self = this;
        Object.keys(this.navButtons).forEach(function (k) { self.navButtons[k].classList.toggle('is-active', k === id); });
        var main = this.main;
        main.innerHTML = '';
        var app = this.app;
        var session = this.session;

        if (id === 'new') {
            main.appendChild(SO.el('h2', { text: SO.t('c_bs_new') }));
            var cards = SO.el('div', { class: 'so-bs-cards' });
            app.templates.forEach(function (tpl) {
                var c = SO.el('button', { type: 'button', class: 'so-bs-card' });
                c.innerHTML = '<div class="bc-thumb">' + (tpl.thumb || '<i class="fas ' + (tpl.icon || app.icon) + '"></i>') + '</div>' +
                    '<div class="bc-name">' + SO.esc(SO.t(tpl.label)) + '</div>' +
                    '<div class="bc-meta">' + SO.esc(SO.t(tpl.desc || 'c_template')) + '</div>';
                c.addEventListener('click', function () {
                    session.flush().then(function () {
                        self.close();
                        app.createFrom(tpl.id);
                    });
                });
                cards.appendChild(c);
            });
            main.appendChild(cards);
            this.renderRecent(main);
        } else if (id === 'open') {
            main.appendChild(SO.el('h2', { text: SO.t('c_bs_open') }));
            var list = SO.el('div', { class: 'so-bs-list' });
            var dev = SO.el('button', { type: 'button', class: 'so-bs-row', html: '<i class="fas fa-laptop"></i><div class="br-text"><div class="br-title">' + SO.esc(SO.t('c_open_device')) + '</div><div class="br-desc">' + SO.esc(app.openAcceptLabel || app.openAccept) + '</div></div>' });
            dev.addEventListener('click', function () {
                SO.pickFile(app.openAccept).then(function (f) {
                    if (!f) return;
                    session.flush().then(function () {
                        self.close();
                        app.importFile(f);
                    });
                });
            });
            list.appendChild(dev);
            main.appendChild(list);
            this.renderRecent(main, true);
        } else if (id === 'save') {
            main.appendChild(SO.el('h2', { text: SO.t('c_bs_save') }));
            var slist = SO.el('div', { class: 'so-bs-list' });
            var row1 = SO.el('button', { type: 'button', class: 'so-bs-row', html: '<i class="fas fa-cloud-arrow-up"></i><div class="br-text"><div class="br-title">' + SO.esc(SO.t('c_save_cloud')) + '</div><div class="br-desc">' + SO.esc(SO.t(SO.cloud.available() ? 'c_save_cloud_desc' : 'c_login_required')) + '</div></div>' });
            row1.addEventListener('click', function () { self.close(); session.saveCloud(); });
            var row2 = SO.el('button', { type: 'button', class: 'so-bs-row', html: '<i class="fas fa-copy"></i><div class="br-text"><div class="br-title">' + SO.esc(SO.t('c_save_copy')) + '</div><div class="br-desc">' + SO.esc(SO.t('c_save_copy_desc')) + '</div></div>' });
            row2.addEventListener('click', function () {
                SO.prompt('c_copy_name', self.shell.getName() + ' (' + SO.t('c_copy') + ')').then(function (n) {
                    if (!n) return;
                    self.close();
                    session.saveCloud({ copy: true, name: n.trim() });
                });
            });
            var row3 = SO.el('button', { type: 'button', class: 'so-bs-row', html: '<i class="fas fa-download"></i><div class="br-text"><div class="br-title">' + SO.esc(SO.t('c_download_copy')) + '</div><div class="br-desc">' + SO.esc(SO.t('c_download_copy_desc')) + '</div></div>' });
            row3.addEventListener('click', function () { self.show('export'); });
            slist.appendChild(row1); slist.appendChild(row2); slist.appendChild(row3);
            if (session.o.backup) {
                var row4 = SO.el('button', { type: 'button', class: 'so-bs-row', html: '<i class="fas fa-shield-halved"></i><div class="br-text"><div class="br-title">' + SO.esc(SO.t('c_download_backup')) + '</div><div class="br-desc">' + SO.esc(SO.t('c_download_backup_desc')) + '</div></div>' });
                row4.addEventListener('click', function () { self.close(); session.o.backup(); });
                slist.appendChild(row4);
            }
            main.appendChild(slist);
            var auto = SO.el('label', { class: 'so-field is-inline', style: { marginTop: '18px' } });
            var cb = SO.el('input', { type: 'checkbox' });
            cb.checked = session.autoCloud;
            cb.addEventListener('change', function () { session.setAutoCloud(cb.checked); });
            auto.appendChild(cb);
            auto.appendChild(SO.el('span', { text: SO.t('c_autosave_cloud') }));
            main.appendChild(auto);
        } else if (id === 'export') {
            main.appendChild(SO.el('h2', { text: SO.t('c_bs_export') }));
            var elist = SO.el('div', { class: 'so-bs-list' });
            app.exportFormats.forEach(function (f) {
                var r = SO.el('button', { type: 'button', class: 'so-bs-row', html: '<i class="' + (f.icon.indexOf(' ') === -1 ? 'fas ' : '') + f.icon + '"></i><div class="br-text"><div class="br-title">' + SO.esc(SO.t(f.label)) + '</div><div class="br-desc">' + SO.esc(SO.t(f.desc)) + '</div></div>' });
                r.addEventListener('click', function () { self.close(); app.exportAs(f.id); });
                elist.appendChild(r);
            });
            main.appendChild(elist);
        } else if (id === 'versions') {
            main.appendChild(SO.el('h2', { text: SO.t('c_bs_versions') }));
            main.appendChild(SO.el('p', { style: { color: 'var(--so-muted)', marginTop: '-10px' }, text: SO.t('c_versions_desc') }));
            var vbox = SO.el('div', { class: 'so-bs-list so-ver-list' });
            main.appendChild(vbox);
            SO.renderVersions(session, vbox, function () { self.close(); });
        } else if (id === 'info') {
            main.appendChild(SO.el('h2', { text: SO.t('c_bs_info') }));
            var dl = SO.el('dl', { class: 'so-kv' });
            var rows = [
                ['c_info_name', this.shell.getName()],
                ['c_info_app', app.appName],
                ['c_info_location', SO.t(session.meta.filename ? 'c_loc_cloud' : 'c_loc_local')],
                ['c_info_owner', SO.ctx.email || '-'],
                ['c_info_created', SO.fmtDate(session.meta.createdAt)],
                ['c_info_saved', session.meta.lastCloud ? SO.fmtDate(session.meta.lastCloud) : '-']
            ].concat(app.info ? app.info() : []);
            rows.forEach(function (r) {
                dl.appendChild(SO.el('dt', { text: SO.t(r[0]) }));
                dl.appendChild(SO.el('dd', { text: r[1] }));
            });
            main.appendChild(dl);
        } else if (id === 'options') {
            main.appendChild(SO.el('h2', { text: SO.t('c_bs_options') }));
            var form = SO.el('div', { class: 'so-form', style: { maxWidth: '420px' } });
            var lf = SO.el('div', { class: 'so-field' });
            lf.appendChild(SO.el('label', { text: SO.t('c_language') }));
            var sel = SO.el('select', { class: 'so-select', html: '<option value="id">Bahasa Indonesia</option><option value="en">English</option>' });
            sel.value = SO.lang();
            sel.addEventListener('change', function () { SO.setLang(sel.value); SO.$('#soLang').value = sel.value; self.show('options'); });
            lf.appendChild(sel);
            form.appendChild(lf);
            var af = SO.el('label', { class: 'so-field is-inline' });
            var acb = SO.el('input', { type: 'checkbox' });
            acb.checked = session.autoCloud;
            acb.addEventListener('change', function () { session.setAutoCloud(acb.checked); });
            af.appendChild(acb);
            af.appendChild(SO.el('span', { text: SO.t('c_autosave_cloud') }));
            form.appendChild(af);
            main.appendChild(form);
            if (app.renderOptions) {
                main.appendChild(SO.el('h3', { text: app.appName }));
                var box = SO.el('div', { class: 'so-form', style: { maxWidth: '420px' } });
                app.renderOptions(box);
                main.appendChild(box);
            }
            main.appendChild(SO.el('h3', { text: SO.t('c_shortcuts') }));
            var sc = SO.el('dl', { class: 'so-kv' });
            (app.shortcuts || []).forEach(function (s) {
                sc.appendChild(SO.el('dt', { html: s[0].split(' / ').map(function (k) { return '<span class="so-kbd">' + SO.esc(SO.keyLabel(k)) + '</span>'; }).join(' ') }));
                sc.appendChild(SO.el('dd', { text: SO.t(s[1]) }));
            });
            main.appendChild(sc);
        }
    };

    Backstage.prototype.renderRecent = function (main, withLocal) {
        var self = this;
        var app = this.app;
        var session = this.session;
        main.appendChild(SO.el('h3', { text: SO.t('c_recent_cloud') }));
        var cloudBox = SO.el('div', { class: 'so-bs-cards' });
        main.appendChild(cloudBox);
        if (!SO.cloud.available()) {
            cloudBox.outerHTML = '<div class="so-bs-empty">' + SO.esc(SO.t('c_login_required')) + '</div>';
        } else {
            cloudBox.innerHTML = '<div class="so-bs-empty">' + SO.esc(SO.t('c_loading')) + '</div>';
            SO.cloud.list(app.type).then(function (list) {
                cloudBox.innerHTML = '';
                if (!list.length) { cloudBox.innerHTML = '<div class="so-bs-empty" style="grid-column:1/-1">' + SO.esc(SO.t('c_no_files')) + '</div>'; return; }
                list.slice(0, withLocal ? 60 : 12).forEach(function (p) {
                    var c = SO.el('button', { type: 'button', class: 'so-bs-card' });
                    var thumb = p.thumbnail && /^data:image\//.test(p.thumbnail) ? '<img alt="" src="' + p.thumbnail + '">' : '<i class="fas ' + app.icon + '"></i>';
                    c.innerHTML = '<div class="bc-thumb">' + thumb + '</div><div class="bc-name"></div><div class="bc-meta"></div>';
                    c.querySelector('.bc-name').textContent = p.name;
                    c.querySelector('.bc-meta').textContent = SO.fmtDate(String(p.lastModified).replace(' ', 'T'));
                    if (String(p.id) === session.meta.cloudId) c.style.borderColor = 'var(--so-accent)';
                    c.addEventListener('click', function () {
                        session.flush().then(function () {
                            self.close();
                            return session.openCloud(p.id);
                        }).then(function (res) {
                            if (res) app.loadDocument(res.content, res.name);
                        }).catch(function (err) { SO.toast(err.message, { type: 'error' }); });
                    });
                    cloudBox.appendChild(c);
                });
            }).catch(function (err) {
                cloudBox.innerHTML = '<div class="so-bs-empty" style="grid-column:1/-1">' + SO.esc(err.message) + '</div>';
            });
        }
        if (!withLocal) return;
        main.appendChild(SO.el('h3', { text: SO.t('c_local_drafts') }));
        var localBox = SO.el('div', { class: 'so-bs-list', html: '<div class="so-bs-empty">' + SO.esc(SO.t('c_loading')) + '</div>' });
        main.appendChild(localBox);
        SO.store.listDrafts(app.app).then(function (drafts) {
            drafts = drafts.filter(function (d) { return d.key.indexOf('local:') === 0; });
            localBox.innerHTML = '';
            if (!drafts.length) { localBox.innerHTML = '<div class="so-bs-empty">' + SO.esc(SO.t('c_no_drafts')) + '</div>'; return; }
            drafts.slice(0, 30).forEach(function (d) {
                var r = SO.el('div', { class: 'so-bs-row', html: '<i class="fas fa-hard-drive"></i><div class="br-text"><div class="br-title"></div><div class="br-desc"></div></div>' });
                r.querySelector('.br-title').textContent = d.name || SO.t('c_untitled');
                r.querySelector('.br-desc').textContent = SO.fmtDate(d.updatedAt);
                var openB = SO.el('button', { type: 'button', class: 'so-btn is-sm', text: SO.t('c_open') });
                var delB = SO.el('button', { type: 'button', class: 'so-btn is-sm', html: '<i class="fas fa-trash"></i>', 'aria-label': SO.t('c_delete') });
                openB.addEventListener('click', function () {
                    session.flush().then(function () {
                        self.close();
                        session._adoptDraft(d);
                        session.setStatus('local');
                        app.loadDocument(d.content, d.name);
                    });
                });
                delB.addEventListener('click', function () {
                    SO.confirm('c_delete_draft_confirm', { danger: true, okLabel: 'c_delete' }).then(function (ok) {
                        if (!ok) return;
                        SO.store.delDraft(d.key).then(function () { r.remove(); });
                    });
                });
                r.appendChild(openB);
                r.appendChild(delB);
                localBox.appendChild(r);
            });
        });
    };
    SO.Backstage = Backstage;

    // ============================================================== fonts
    SO.FONTS = [
        'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Caveat', 'Comic Sans MS', 'Consolas', 'Courier New',
        'Garamond', 'Georgia', 'Helvetica', 'Impact', 'Inter', 'Lato', 'Lora', 'Merriweather', 'Montserrat',
        'Noto Sans SC', 'Open Sans', 'Oswald', 'Palatino Linotype', 'Playfair Display', 'Poppins', 'Raleway',
        'Roboto', 'Roboto Mono', 'Segoe UI', 'Source Sans 3', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'
    ];
    SO.fontStack = function (name) {
        var generic = /mono|consolas|courier/i.test(name) ? 'monospace' : (/georgia|times|garamond|cambria|palatino|merriweather|lora|playfair/i.test(name) ? 'serif' : 'sans-serif');
        return '"' + String(name).replace(/"/g, '') + '", ' + generic;
    };
    SO.FONT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 60, 72, 96];

    SO.onKeyCombo = function (e) {
        var parts = [];
        if (SO.mod(e)) parts.push('Mod');
        if (e.shiftKey) parts.push('Shift');
        if (e.altKey) parts.push('Alt');
        var k = e.key;
        if (k.length === 1) k = k.toUpperCase();
        if (e.code && /^Key[A-Z]$/.test(e.code) && (e.altKey || SO.mod(e))) k = e.code.slice(3);
        if (e.code && /^Digit\d$/.test(e.code) && (e.altKey || SO.mod(e))) k = e.code.slice(5);
        parts.push(k);
        return parts.join('+');
    };

    doc.documentElement.setAttribute('lang', SO.lang() === 'zh' ? 'zh-CN' : SO.lang());
})(window);
