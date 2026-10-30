/**
 * Sinerli Present — model presentasi: tema, tata letak, geometri bentuk, pabrik
 * elemen, sanitasi teks kaya, dan utilitas dek. Tanpa DOM editor (hanya
 * DOMParser untuk sanitasi) sehingga bisa dipakai render, ekspor, dan impor.
 *
 * Koordinat slide dalam piksel CSS pada 96 dpi (16:9 = 1280×720 = 13,333×7,5 in),
 * ukuran font dalam pt — sama dengan PowerPoint.
 */
(function (global) {
    'use strict';

    var M = global.SSM = {};

    M.SIZES = [
        { id: '16:9', w: 1280, h: 720, label: 's_size_wide' },
        { id: '4:3', w: 960, h: 720, label: 's_size_standard' },
        { id: '16:10', w: 1152, h: 720, label: 's_size_1610' },
        { id: 'a4', w: 1123, h: 794, label: 's_size_a4' },
        { id: '1:1', w: 1080, h: 1080, label: 's_size_square' },
        { id: '9:16', w: 720, h: 1280, label: 's_size_portrait' }
    ];

    M.uid = function (p) { return (p || 'e') + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); };
    M.clone = function (o) { return o == null ? o : JSON.parse(JSON.stringify(o)); };

    // ================================================================ tema
    function dec(svg) { return svg; }
    /** Hiasan latar tema (SVG). kind: 'title' | 'section' | 'content'. */
    var DECOR = {
        none: function () { return ''; },
        band: function (w, h, c, kind) {
            if (kind === 'title') return dec('<rect x="0" y="' + (h * 0.78) + '" width="' + w + '" height="' + (h * 0.22) + '" fill="' + c.accent1 + '"/><rect x="0" y="' + (h * 0.765) + '" width="' + w + '" height="' + (h * 0.015) + '" fill="' + c.accent2 + '"/>');
            return dec('<rect x="0" y="0" width="' + w + '" height="' + (h * 0.018) + '" fill="' + c.accent1 + '"/><rect x="0" y="' + (h - 6) + '" width="' + (w * 0.3) + '" height="6" fill="' + c.accent2 + '"/>');
        },
        sidebar: function (w, h, c, kind) {
            var big = kind === 'title' || kind === 'section';
            var sw = big ? w * 0.05 : w * 0.018;
            return dec('<rect x="0" y="0" width="' + sw + '" height="' + h + '" fill="' + c.accent1 + '"/>' +
                (big ? '<circle cx="' + (w * 0.93) + '" cy="' + (h * 0.88) + '" r="' + (h * 0.14) + '" fill="' + c.accent2 + '" opacity=".85"/>' : ''));
        },
        circles: function (w, h, c, kind) {
            var big = kind === 'title' || kind === 'section';
            return dec('<circle cx="' + (w * 0.96) + '" cy="' + (h * 0.02) + '" r="' + (h * (big ? 0.42 : 0.2)) + '" fill="' + c.accent1 + '" opacity=".9"/>' +
                '<circle cx="' + (w * 0.86) + '" cy="' + (h * (big ? 0.3 : 0.14)) + '" r="' + (h * (big ? 0.12 : 0.06)) + '" fill="' + c.accent2 + '" opacity=".85"/>' +
                '<circle cx="' + (w * 0.03) + '" cy="' + (h * 0.98) + '" r="' + (h * (big ? 0.26 : 0.12)) + '" fill="' + c.accent3 + '" opacity=".75"/>');
        },
        wave: function (w, h, c, kind) {
            var y = kind === 'title' ? h * 0.72 : h * 0.9;
            return dec('<path d="M0 ' + y + ' C ' + (w * 0.25) + ' ' + (y - h * 0.08) + ' ' + (w * 0.5) + ' ' + (y + h * 0.08) + ' ' + w + ' ' + (y - h * 0.04) + ' V ' + h + ' H 0 Z" fill="' + c.accent1 + '" opacity=".95"/>' +
                '<path d="M0 ' + (y + h * 0.05) + ' C ' + (w * 0.3) + ' ' + (y + h * 0.12) + ' ' + (w * 0.6) + ' ' + (y - h * 0.02) + ' ' + w + ' ' + (y + h * 0.06) + ' V ' + h + ' H 0 Z" fill="' + c.accent2 + '" opacity=".8"/>');
        },
        frame: function (w, h, c) {
            var m = Math.min(w, h) * 0.035;
            return dec('<rect x="' + m + '" y="' + m + '" width="' + (w - 2 * m) + '" height="' + (h - 2 * m) + '" fill="none" stroke="' + c.accent1 + '" stroke-width="3"/>');
        },
        corner: function (w, h, c, kind) {
            var s = kind === 'title' ? 0.42 : 0.2;
            return dec('<path d="M' + w + ' 0 L' + (w - h * s * 1.6) + ' 0 L' + w + ' ' + (h * s * 1.6) + ' Z" fill="' + c.accent1 + '"/><path d="M0 ' + h + ' L' + (h * s) + ' ' + h + ' L0 ' + (h - h * s) + ' Z" fill="' + c.accent2 + '"/>');
        },
        dots: function (w, h, c) {
            var out = '';
            for (var i = 0; i < 6; i++) for (var j = 0; j < 4; j++) out += '<circle cx="' + (w - 40 - i * 22) + '" cy="' + (40 + j * 22) + '" r="3.5" fill="' + c.accent1 + '" opacity=".55"/>';
            return dec(out + '<rect x="0" y="' + (h - 10) + '" width="' + w + '" height="10" fill="' + c.accent1 + '"/>');
        },
        lines: function (w, h, c, kind) {
            // Judul slide 'title' rata tengah → garis ikut di tengah, di bawah judul.
            var y = kind === 'title' ? h * 0.535 : h * 0.215;
            var x = kind === 'title' ? w * 0.44 : w * 0.06;
            return dec('<rect x="' + x + '" y="' + y + '" width="' + (w * 0.12) + '" height="5" fill="' + c.accent1 + '"/>');
        }
    };
    M.DECOR = DECOR;

    function theme(id, label, fonts, decor, variants) { return { id: id, label: label, fonts: fonts, decor: decor, variants: variants }; }
    function V(bg, text, title, accents, bg2, muted) { return { bg: bg, bg2: bg2 || null, text: text, title: title || text, muted: muted || null, accents: accents }; }

    M.THEMES = [
        // Tema bawaan tanpa hiasan: garis aksen (oranye) di bawah judul mengganggu slide baru.
        theme('sinerli', 's_theme_sinerli', { h: 'Poppins', b: 'Inter' }, 'none', [
            V('#FFFFFF', '#262626', '#1F2937', ['#C4462A', '#2B579A', '#1D7044', '#F2A900', '#7B3FA0', '#0E9AA7']),
            V('#F7F4EF', '#2D2A26', '#2D2A26', ['#C4462A', '#E08E45', '#6B8F71', '#3E6990', '#AA5042', '#D8A31A']),
            V('#1F2430', '#F2F2F2', '#FFFFFF', ['#FF7A59', '#4FC3F7', '#81C784', '#FFD54F', '#BA68C8', '#4DB6AC']),
            V('#EAF2FB', '#1B2A41', '#10233F', ['#2B579A', '#E36414', '#0F8B8D', '#9A031E', '#5F0F40', '#FB8B24'])
        ]),
        theme('office', 's_theme_office', { h: 'Calibri', b: 'Calibri' }, 'none', [
            V('#FFFFFF', '#262626', '#262626', ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47']),
            V('#262626', '#FFFFFF', '#FFFFFF', ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'])
        ]),
        theme('ocean', 's_theme_ocean', { h: 'Montserrat', b: 'Open Sans' }, 'wave', [
            V('#0B3954', '#F1F7FB', '#FFFFFF', ['#1B98E0', '#13C4A3', '#F4D35E', '#EE964B', '#F95738', '#8EE3EF'], '#087E8B'),
            V('#F3FAFD', '#12355B', '#0B3954', ['#1B98E0', '#13C4A3', '#087E8B', '#EE964B', '#F95738', '#4A6FA5']),
            V('#102A43', '#D9E2EC', '#FFFFFF', ['#3EBD93', '#27AB83', '#F0B429', '#DE911D', '#E12D39', '#47A3F3'], '#243B53')
        ]),
        theme('minimal', 's_theme_minimal', { h: 'Playfair Display', b: 'Lato' }, 'frame', [
            V('#FFFFFF', '#333333', '#111111', ['#111111', '#B08D57', '#7D7D7D', '#C9ADA7', '#4A4E69', '#9A8C98']),
            V('#FAF7F2', '#3B3B3B', '#1B1B1B', ['#8C6A43', '#2F4858', '#86BBD8', '#F6AE2D', '#F26419', '#33658A'])
        ]),
        theme('sunset', 's_theme_sunset', { h: 'Raleway', b: 'Source Sans 3' }, 'circles', [
            V('#FFF4EC', '#3D2B1F', '#7A2E1D', ['#FF6B35', '#F7C59F', '#EF476F', '#FFD166', '#118AB2', '#06D6A0']),
            V('#2B1B2F', '#FBE9E7', '#FFFFFF', ['#FF6B6B', '#FFD93D', '#FF8E3C', '#6BCB77', '#4D96FF', '#C77DFF'], '#46244C')
        ]),
        theme('forest', 's_theme_forest', { h: 'Merriweather', b: 'Roboto' }, 'corner', [
            V('#1E3A2F', '#EEF3EA', '#FFFFFF', ['#8FC93A', '#E4CC37', '#E18335', '#58A4B0', '#D8DBE2', '#A9BD8B'], '#2C5545'),
            V('#F4F7F1', '#23312A', '#1E3A2F', ['#2D6A4F', '#95D5B2', '#D4A373', '#40916C', '#B7B7A4', '#6B705C'])
        ]),
        theme('corporate', 's_theme_corporate', { h: 'Roboto', b: 'Roboto' }, 'band', [
            V('#FFFFFF', '#2E3440', '#0B3C5D', ['#0B3C5D', '#328CC1', '#D9B310', '#1D2731', '#5E81AC', '#88C0D0']),
            V('#FFFFFF', '#2E2E2E', '#7A1F1F', ['#7A1F1F', '#C44536', '#E0A458', '#283D3B', '#197278', '#772E25']),
            V('#FFFFFF', '#2A2A2A', '#1B4332', ['#1B4332', '#40916C', '#FFB703', '#264653', '#2A9D8F', '#E76F51'])
        ]),
        theme('creative', 's_theme_creative', { h: 'Oswald', b: 'Montserrat' }, 'sidebar', [
            V('#FFFFFF', '#2B2B2B', '#2B2B2B', ['#6C63FF', '#FF6584', '#3F3D56', '#F9A826', '#00BFA6', '#2F2E41']),
            V('#FFFDF7', '#1D1D1D', '#1D1D1D', ['#FF5A5F', '#087E8B', '#FFC857', '#3C3C3C', '#9BC53D', '#5BC0EB'])
        ]),
        theme('midnight', 's_theme_midnight', { h: 'Poppins', b: 'Inter' }, 'dots', [
            V('#0F172A', '#E2E8F0', '#FFFFFF', ['#38BDF8', '#A78BFA', '#F472B6', '#FACC15', '#34D399', '#FB923C'], '#1E293B'),
            V('#111111', '#EDEDED', '#FFFFFF', ['#00E5FF', '#FF3D71', '#FFE66D', '#7CFC00', '#B388FF', '#FF9E80'])
        ]),
        theme('pastel', 's_theme_pastel', { h: 'Raleway', b: 'Lato' }, 'circles', [
            V('#FDF6F0', '#4A4A4A', '#5E548E', ['#9F86C0', '#E0B1CB', '#BE95C4', '#A0C4FF', '#FFD6A5', '#CAFFBF']),
            V('#F1FAEE', '#2F3E46', '#354F52', ['#84A98C', '#CAD2C5', '#F4A261', '#E9C46A', '#8ECAE6', '#FFB4A2'])
        ]),
        theme('retro', 's_theme_retro', { h: 'Oswald', b: 'Lora' }, 'band', [
            V('#F4E9D8', '#3D2C29', '#8A3B12', ['#D9822B', '#8A3B12', '#3E6259', '#E3B448', '#6E2594', '#2A6F97']),
            V('#2E282A', '#F4E9D8', '#F2C57C', ['#F2C57C', '#DDAE7E', '#7FB685', '#426A5A', '#EF6F6C', '#5D576B'])
        ]),
        theme('vivid', 's_theme_vivid', { h: 'Montserrat', b: 'Poppins' }, 'none', [
            V('#6A11CB', '#FFFFFF', '#FFFFFF', ['#FFD166', '#06D6A0', '#EF476F', '#118AB2', '#FFFFFF', '#F78C6B'], '#2575FC'),
            V('#FF512F', '#FFFFFF', '#FFFFFF', ['#FFE66D', '#1A535C', '#4ECDC4', '#F7FFF7', '#2B2D42', '#FFB5A7'], '#DD2476'),
            V('#11998E', '#FFFFFF', '#FFFFFF', ['#FFE66D', '#F7B267', '#2D3047', '#FFFFFF', '#E84855', '#1B998B'], '#38EF7D')
        ]),
        theme('mono', 's_theme_mono', { h: 'Inter', b: 'Inter' }, 'lines', [
            V('#F5F5F5', '#1A1A1A', '#000000', ['#000000', '#555555', '#8C8C8C', '#BDBDBD', '#D32F2F', '#1976D2']),
            V('#0A0A0A', '#E0E0E0', '#FFFFFF', ['#FFFFFF', '#9E9E9E', '#616161', '#424242', '#FF5252', '#448AFF'])
        ])
    ];

    M.themeById = function (id) { return M.THEMES.filter(function (t) { return t.id === id; })[0] || M.THEMES[0]; };

    function luminance(hex) {
        var c = SO.hexToRgb(hex) || [255, 255, 255];
        return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    }
    M.luminance = luminance;
    M.isDark = function (hex) { return luminance(hex) < 0.5; };

    /** Palet tema terselesaikan: {bg, bg2, text, title, muted, accent1..6, light, dark, fontH, fontB, decor}. */
    M.resolveTheme = function (deckTheme) {
        deckTheme = deckTheme || { id: 'sinerli', variant: 0 };
        var t = M.themeById(deckTheme.id);
        var v = t.variants[Math.min(deckTheme.variant || 0, t.variants.length - 1)] || t.variants[0];
        var o = deckTheme.colors || {};
        var c = {
            bg: o.bg || v.bg, bg2: o.bg2 !== undefined ? o.bg2 : v.bg2, text: o.text || v.text, title: o.title || v.title,
            fontH: (deckTheme.fonts && deckTheme.fonts.h) || t.fonts.h, fontB: (deckTheme.fonts && deckTheme.fonts.b) || t.fonts.b,
            decor: deckTheme.decor !== undefined ? deckTheme.decor : t.decor
        };
        for (var i = 0; i < 6; i++) c['accent' + (i + 1)] = (o.accents && o.accents[i]) || v.accents[i];
        var dark = M.isDark(c.bg);
        c.muted = o.muted || v.muted || SO.tint(c.text, dark ? -0.3 : 0.35);
        c.light = dark ? SO.tint(c.bg, 0.12) : SO.tint(c.bg, -0.06);
        c.isDark = dark;
        return c;
    };
    /** Token warna 'theme:accent1' → heksadesimal. */
    M.color = function (value, pal) {
        if (!value) return null;
        if (value.indexOf && value.indexOf('theme:') === 0) return pal[value.slice(6)] || '#000000';
        return value;
    };
    M.font = function (value, pal) {
        if (!value) return pal.fontB;
        if (value === 'theme:heading') return pal.fontH;
        if (value === 'theme:body') return pal.fontB;
        return value;
    };
    /** 10 warna tema untuk pemilih warna (sama urutan dengan Office). */
    M.themeSwatches = function (pal) {
        return [pal.bg, pal.text, pal.light, pal.title, pal.accent1, pal.accent2, pal.accent3, pal.accent4, pal.accent5, pal.accent6];
    };

    // =========================================================== bentuk
    function f(n) { return Math.round(n * 100) / 100; }
    function poly(pts) { return 'M' + pts.map(function (p) { return f(p[0]) + ' ' + f(p[1]); }).join(' L') + ' Z'; }
    function norm(pts, w, h) { return poly(pts.map(function (p) { return [p[0] * w, p[1] * h]; })); }
    function ellipsePath(cx, cy, rx, ry) {
        return 'M' + f(cx - rx) + ' ' + f(cy) + ' A' + f(rx) + ' ' + f(ry) + ' 0 1 0 ' + f(cx + rx) + ' ' + f(cy) + ' A' + f(rx) + ' ' + f(ry) + ' 0 1 0 ' + f(cx - rx) + ' ' + f(cy) + ' Z';
    }
    function star(n, inner, w, h) {
        var pts = [], i;
        for (i = 0; i < n * 2; i++) {
            var a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? inner : 0.5;
            pts.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]);
        }
        var minY = Math.min.apply(null, pts.map(function (p) { return p[1]; })), maxY = Math.max.apply(null, pts.map(function (p) { return p[1]; }));
        var minX = Math.min.apply(null, pts.map(function (p) { return p[0]; })), maxX = Math.max.apply(null, pts.map(function (p) { return p[0]; }));
        return norm(pts.map(function (p) { return [(p[0] - minX) / (maxX - minX), (p[1] - minY) / (maxY - minY)]; }), w, h);
    }
    function roundRect(w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        return 'M' + f(r) + ' 0 H' + f(w - r) + ' A' + f(r) + ' ' + f(r) + ' 0 0 1 ' + f(w) + ' ' + f(r) + ' V' + f(h - r) + ' A' + f(r) + ' ' + f(r) + ' 0 0 1 ' + f(w - r) + ' ' + f(h) + ' H' + f(r) + ' A' + f(r) + ' ' + f(r) + ' 0 0 1 0 ' + f(h - r) + ' V' + f(r) + ' A' + f(r) + ' ' + f(r) + ' 0 0 1 ' + f(r) + ' 0 Z';
    }

    /** Definisi bentuk: [id prstGeom, label, kategori, path(w,h,adj)]. */
    M.SHAPES = [
        ['rect', 's_sh_rect', 'basic', function (w, h) { return 'M0 0 H' + f(w) + ' V' + f(h) + ' H0 Z'; }],
        ['roundRect', 's_sh_roundrect', 'basic', function (w, h, adj) { return roundRect(w, h, Math.min(w, h) * (adj == null ? 0.1667 : adj)); }],
        ['ellipse', 's_sh_ellipse', 'basic', function (w, h) { return ellipsePath(w / 2, h / 2, w / 2, h / 2); }],
        ['triangle', 's_sh_triangle', 'basic', function (w, h) { return norm([[0.5, 0], [1, 1], [0, 1]], w, h); }],
        ['rtTriangle', 's_sh_rttriangle', 'basic', function (w, h) { return norm([[0, 0], [1, 1], [0, 1]], w, h); }],
        ['diamond', 's_sh_diamond', 'basic', function (w, h) { return norm([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]], w, h); }],
        ['parallelogram', 's_sh_parallelogram', 'basic', function (w, h) { var a = Math.min(w * 0.25, h * 0.5); return poly([[a, 0], [w, 0], [w - a, h], [0, h]]); }],
        ['trapezoid', 's_sh_trapezoid', 'basic', function (w, h, adj) { var a = Math.min(adj != null ? adj * Math.min(w, h) : Math.min(w * 0.25, h * 0.5), w / 2); return poly([[a, 0], [w - a, 0], [w, h], [0, h]]); }],
        ['pentagon', 's_sh_pentagon', 'basic', function (w, h) { return norm([[0.5, 0], [1, 0.382], [0.809, 1], [0.191, 1], [0, 0.382]], w, h); }],
        ['hexagon', 's_sh_hexagon', 'basic', function (w, h) { var a = Math.min(w * 0.25, h * 0.5); return poly([[a, 0], [w - a, 0], [w, h / 2], [w - a, h], [a, h], [0, h / 2]]); }],
        ['octagon', 's_sh_octagon', 'basic', function (w, h) { var a = Math.min(w, h) * 0.29; return poly([[a, 0], [w - a, 0], [w, a], [w, h - a], [w - a, h], [a, h], [0, h - a], [0, a]]); }],
        ['plus', 's_sh_plus', 'basic', function (w, h) { var a = Math.min(w, h) * 0.25; return poly([[a, 0], [w - a, 0], [w - a, a], [w, a], [w, h - a], [w - a, h - a], [w - a, h], [a, h], [a, h - a], [0, h - a], [0, a], [a, a]]); }],
        ['donut', 's_sh_donut', 'basic', function (w, h) { var t = Math.min(w, h) * 0.25; return ellipsePath(w / 2, h / 2, w / 2, h / 2) + ' ' + ellipsePath(w / 2, h / 2, Math.max(1, w / 2 - t), Math.max(1, h / 2 - t)); }],
        ['can', 's_sh_can', 'basic', function (w, h) { var ry = Math.min(h * 0.12, w * 0.25); return 'M0 ' + f(ry) + ' A' + f(w / 2) + ' ' + f(ry) + ' 0 0 1 ' + f(w) + ' ' + f(ry) + ' V' + f(h - ry) + ' A' + f(w / 2) + ' ' + f(ry) + ' 0 0 1 0 ' + f(h - ry) + ' Z M0 ' + f(ry) + ' A' + f(w / 2) + ' ' + f(ry) + ' 0 0 0 ' + f(w) + ' ' + f(ry); }],
        ['flowChartTerminator', 's_sh_terminator', 'basic', function (w, h) { return roundRect(w, h, Math.min(w, h) / 2); }],
        ['heart', 's_sh_heart', 'symbol', function (w, h) {
            var p = [['M', 0.5, 0.3], ['C', 0.5, 0.15, 0.38, 0, 0.24, 0], ['C', 0.1, 0, 0, 0.12, 0, 0.28], ['C', 0, 0.55, 0.28, 0.72, 0.5, 1], ['C', 0.72, 0.72, 1, 0.55, 1, 0.28], ['C', 1, 0.12, 0.9, 0, 0.76, 0], ['C', 0.62, 0, 0.5, 0.15, 0.5, 0.3]];
            return p.map(function (s) { var out = s[0]; for (var i = 1; i < s.length; i += 2) out += (i > 1 ? ' ' : '') + f(s[i] * w) + ' ' + f(s[i + 1] * h); return out; }).join(' ') + ' Z';
        }],
        ['star5', 's_sh_star5', 'symbol', function (w, h) { return star(5, 0.19, w, h); }],
        ['star6', 's_sh_star6', 'symbol', function (w, h) { return star(6, 0.29, w, h); }],
        ['lightningBolt', 's_sh_lightning', 'symbol', function (w, h) { return norm([[0.39, 0], [0.62, 0.3], [0.53, 0.35], [0.82, 0.62], [0.72, 0.67], [1, 1], [0.44, 0.74], [0.56, 0.69], [0.2, 0.46], [0.31, 0.41], [0, 0.18]], w, h); }],
        ['moon', 's_sh_moon', 'symbol', function (w, h) { return 'M' + f(w) + ' 0 A' + f(w) + ' ' + f(h / 2) + ' 0 0 0 ' + f(w) + ' ' + f(h) + ' A' + f(w * 0.55) + ' ' + f(h / 2) + ' 0 0 1 ' + f(w) + ' 0 Z'; }],
        ['cloud', 's_sh_cloud', 'symbol', function (w, h) {
            var a = function (rx, ry, x, y) { return ' A' + f(rx * w) + ' ' + f(ry * h) + ' 0 0 1 ' + f(x * w) + ' ' + f(y * h); };
            return 'M' + f(0.22 * w) + ' ' + f(0.88 * h) + a(0.2, 0.2, 0.1, 0.5) + a(0.2, 0.22, 0.34, 0.2) + a(0.24, 0.26, 0.74, 0.22) + a(0.2, 0.22, 0.94, 0.58) + a(0.18, 0.2, 0.78, 0.88) + ' Z';
        }],
        ['rightArrow', 's_sh_arrow_right', 'arrow', function (w, h) { var hl = Math.min(w * 0.6, h * 0.5); return poly([[0, h * 0.25], [w - hl, h * 0.25], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, h * 0.75], [0, h * 0.75]]); }],
        ['leftArrow', 's_sh_arrow_left', 'arrow', function (w, h) { var hl = Math.min(w * 0.6, h * 0.5); return poly([[w, h * 0.25], [hl, h * 0.25], [hl, 0], [0, h / 2], [hl, h], [hl, h * 0.75], [w, h * 0.75]]); }],
        ['upArrow', 's_sh_arrow_up', 'arrow', function (w, h) { var hl = Math.min(h * 0.6, w * 0.5); return poly([[w * 0.25, h], [w * 0.25, hl], [0, hl], [w / 2, 0], [w, hl], [w * 0.75, hl], [w * 0.75, h]]); }],
        ['downArrow', 's_sh_arrow_down', 'arrow', function (w, h) { var hl = Math.min(h * 0.6, w * 0.5); return poly([[w * 0.25, 0], [w * 0.25, h - hl], [0, h - hl], [w / 2, h], [w, h - hl], [w * 0.75, h - hl], [w * 0.75, 0]]); }],
        ['leftRightArrow', 's_sh_arrow_lr', 'arrow', function (w, h) { var hl = Math.min(w * 0.3, h * 0.5); return poly([[0, h / 2], [hl, 0], [hl, h * 0.25], [w - hl, h * 0.25], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, h * 0.75], [hl, h * 0.75], [hl, h]]); }],
        ['chevron', 's_sh_chevron', 'arrow', function (w, h) { var a = Math.min(w * 0.5, h * 0.5); return poly([[0, 0], [w - a, 0], [w, h / 2], [w - a, h], [0, h], [a, h / 2]]); }],
        ['homePlate', 's_sh_pentagon_arrow', 'arrow', function (w, h) { var a = Math.min(w * 0.5, h * 0.5); return poly([[0, 0], [w - a, 0], [w, h / 2], [w - a, h], [0, h]]); }],
        ['wedgeRectCallout', 's_sh_callout_rect', 'callout', function (w, h) { return poly([[0, 0], [w, 0], [w, h * 0.78], [w * 0.42, h * 0.78], [w * 0.18, h], [w * 0.25, h * 0.78], [0, h * 0.78]]); }],
        ['wedgeRoundRectCallout', 's_sh_callout_round', 'callout', function (w, h) {
            var bh = h * 0.78, r = Math.min(w, bh) * 0.16;
            return 'M' + f(r) + ' 0 H' + f(w - r) + ' A' + f(r) + ' ' + f(r) + ' 0 0 1 ' + f(w) + ' ' + f(r) + ' V' + f(bh - r) + ' A' + f(r) + ' ' + f(r) + ' 0 0 1 ' + f(w - r) + ' ' + f(bh) +
                ' H' + f(w * 0.42) + ' L' + f(w * 0.18) + ' ' + f(h) + ' L' + f(w * 0.25) + ' ' + f(bh) + ' H' + f(r) + ' A' + f(r) + ' ' + f(r) + ' 0 0 1 0 ' + f(bh - r) + ' V' + f(r) + ' A' + f(r) + ' ' + f(r) + ' 0 0 1 ' + f(r) + ' 0 Z';
        }],
        ['wedgeEllipseCallout', 's_sh_callout_oval', 'callout', function (w, h) {
            return 'M' + f(0.413 * w) + ' ' + f(0.794 * h) + ' A' + f(0.5 * w) + ' ' + f(0.4 * h) + ' 0 1 0 ' + f(0.25 * w) + ' ' + f(0.746 * h) + ' L' + f(0.12 * w) + ' ' + f(h) + ' Z';
        }]
    ];
    M.shapeDef = function (id) { return M.SHAPES.filter(function (s) { return s[0] === id; })[0] || M.SHAPES[0]; };
    M.shapePath = function (id, w, h, adj) { return M.shapeDef(id)[3](Math.max(1, w), Math.max(1, h), adj); };

    // ======================================================= elemen
    M.DEFAULT_TEXT = { ff: 'theme:body', fs: 18, color: 'theme:text', align: 'left', valign: 'top', lh: 1.15 };

    function base(type, x, y, w, h) { return { id: M.uid('e'), type: type, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), rot: 0 }; }

    M.textBox = function (x, y, w, h, html, st) {
        var e = base('text', x, y, w, h);
        e.html = html || '';
        e.st = Object.assign({}, M.DEFAULT_TEXT, st || {});
        e.fill = { type: 'none' };
        e.line = { type: 'none' };
        e.autofit = 'grow';
        return e;
    };
    M.placeholder = function (ph, x, y, w, h, st, html) {
        var e = M.textBox(x, y, w, h, html || '', st);
        e.ph = ph;
        e.autofit = 'shrink';
        return e;
    };
    M.shape = function (shape, x, y, w, h) {
        var e = base('shape', x, y, w, h);
        e.shape = shape;
        e.fill = { type: 'solid', color: 'theme:accent1' };
        e.line = { type: 'solid', color: 'theme:accent1', w: 1 };
        e.html = '';
        e.st = Object.assign({}, M.DEFAULT_TEXT, { color: '#FFFFFF', align: 'center', valign: 'middle' });
        e.autofit = 'none';
        return e;
    };
    M.line = function (x1, y1, x2, y2, arrow) {
        var e = { id: M.uid('e'), type: 'line', x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2), line: { type: 'solid', color: 'theme:accent1', w: 2, dash: 'solid', head: 'none', tail: arrow ? 'arrow' : 'none' } };
        return M.syncLineBox(e);
    };
    /** Kotak pembatas garis dari titik ujungnya. */
    M.syncLineBox = function (e) {
        e.x = Math.min(e.x1, e.x2); e.y = Math.min(e.y1, e.y2);
        e.w = Math.max(1, Math.abs(e.x2 - e.x1)); e.h = Math.max(1, Math.abs(e.y2 - e.y1));
        e.rot = 0;
        return e;
    };
    M.image = function (asset, x, y, w, h) {
        var e = base('image', x, y, w, h);
        e.asset = asset;
        e.line = { type: 'none' };
        return e;
    };
    M.table = function (rows, cols, x, y, w, h) {
        var e = base('table', x, y, w, h);
        e.cells = [];
        for (var r = 0; r < rows; r++) { var row = []; for (var c = 0; c < cols; c++) row.push({ html: '' }); e.cells.push(row); }
        e.colW = []; for (var i = 0; i < cols; i++) e.colW.push(1 / cols);
        e.tstyle = { header: true, banded: true, firstCol: false, color: 'theme:accent1', border: 'theme:accent1' };
        e.st = Object.assign({}, M.DEFAULT_TEXT, { fs: 16 });
        return e;
    };
    M.chart = function (kind, x, y, w, h) {
        var e = base('chart', x, y, w, h);
        e.chart = kind || 'column';
        e.data = { labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Seri 1', values: [4.3, 2.5, 3.5, 4.5] }, { name: 'Seri 2', values: [2.4, 4.4, 1.8, 2.8] }, { name: 'Seri 3', values: [2, 2, 3, 5] }] };
        e.title = '';
        e.legend = 'bottom';
        e.labels = false;
        return e;
    };
    M.icon = function (icon, x, y, s) {
        var e = base('icon', x, y, s, s);
        e.icon = icon;
        e.color = 'theme:accent1';
        return e;
    };
    M.video = function (url, x, y, w, h) {
        var e = base('video', x, y, w, h);
        e.url = url;
        return e;
    };
    M.math = function (latex, x, y, w, h) {
        var e = base('math', x, y, w, h);
        e.latex = latex;
        e.st = { fs: 28, color: 'theme:text' };
        return e;
    };

    // ======================================================= tata letak
    M.LAYOUTS = ['title', 'titleContent', 'section', 'twoContent', 'comparison', 'titleOnly', 'contentCaption', 'pictureCaption', 'blank'];
    M.layoutKind = function (layout) { return layout === 'blank' ? 'blank' : layout === 'title' ? 'title' : layout === 'section' ? 'section' : 'content'; };

    /** Placeholder tata letak untuk ukuran slide W×H. */
    M.layoutElements = function (layout, W, H) {
        var T = function (st) { return Object.assign({ ff: 'theme:heading', color: 'theme:title', lh: 1.05 }, st); };
        var B = function (st) { return Object.assign({ ff: 'theme:body', color: 'theme:text' }, st); };
        var bullets = '<ul><li></li></ul>';
        var s = Math.min(W / 1280, H / 720);
        var fs = function (n) { return Math.max(8, Math.round(n * Math.max(0.6, s))); };
        var els = [];
        var title = function (x, y, w, h, st) { els.push(M.placeholder('title', x, y, w, h, T(st))); };
        var body = function (x, y, w, h, st, ph) { els.push(M.placeholder(ph || 'body', x, y, w, h, B(st), ph === 'subtitle' || ph === 'caption' ? '' : bullets)); };
        switch (layout) {
            case 'title':
                title(W * 0.1, H * 0.2, W * 0.8, H * 0.32, { fs: fs(54), align: 'center', valign: 'bottom', b: true });
                body(W * 0.15, H * 0.56, W * 0.7, H * 0.18, { fs: fs(24), align: 'center', color: 'theme:muted' }, 'subtitle');
                break;
            case 'titleContent':
                title(W * 0.06, H * 0.05, W * 0.88, H * 0.16, { fs: fs(38), valign: 'middle', b: true });
                body(W * 0.06, H * 0.25, W * 0.88, H * 0.67, { fs: fs(24) });
                break;
            case 'section':
                title(W * 0.08, H * 0.3, W * 0.84, H * 0.28, { fs: fs(50), valign: 'bottom', b: true });
                body(W * 0.08, H * 0.6, W * 0.84, H * 0.14, { fs: fs(22), color: 'theme:muted' }, 'subtitle');
                break;
            case 'twoContent':
                title(W * 0.06, H * 0.05, W * 0.88, H * 0.16, { fs: fs(38), valign: 'middle', b: true });
                body(W * 0.06, H * 0.25, W * 0.43, H * 0.67, { fs: fs(22) });
                body(W * 0.51, H * 0.25, W * 0.43, H * 0.67, { fs: fs(22) });
                break;
            case 'comparison':
                title(W * 0.06, H * 0.05, W * 0.88, H * 0.16, { fs: fs(38), valign: 'middle', b: true });
                els.push(M.placeholder('heading', W * 0.06, H * 0.24, W * 0.43, H * 0.09, B({ fs: fs(24), b: true, valign: 'bottom' })));
                body(W * 0.06, H * 0.34, W * 0.43, H * 0.58, { fs: fs(20) });
                els.push(M.placeholder('heading', W * 0.51, H * 0.24, W * 0.43, H * 0.09, B({ fs: fs(24), b: true, valign: 'bottom' })));
                body(W * 0.51, H * 0.34, W * 0.43, H * 0.58, { fs: fs(20) });
                break;
            case 'titleOnly':
                title(W * 0.06, H * 0.05, W * 0.88, H * 0.16, { fs: fs(38), valign: 'middle', b: true });
                break;
            case 'contentCaption':
                title(W * 0.06, H * 0.1, W * 0.32, H * 0.22, { fs: fs(30), valign: 'bottom', b: true });
                body(W * 0.42, H * 0.1, W * 0.52, H * 0.8, { fs: fs(22) });
                body(W * 0.06, H * 0.35, W * 0.32, H * 0.55, { fs: fs(16) }, 'caption');
                break;
            case 'pictureCaption':
                title(W * 0.06, H * 0.1, W * 0.32, H * 0.22, { fs: fs(30), valign: 'bottom', b: true });
                var pic = M.image(null, W * 0.42, H * 0.1, W * 0.52, H * 0.8);
                pic.ph = 'picture';
                els.push(pic);
                body(W * 0.06, H * 0.35, W * 0.32, H * 0.55, { fs: fs(16) }, 'caption');
                break;
        }
        return els;
    };

    M.newSlide = function (layout, W, H) {
        return { id: M.uid('s'), layout: layout || 'titleContent', els: M.layoutElements(layout || 'titleContent', W, H), notes: '', bg: null, transition: null, hidden: false };
    };

    M.newDeck = function (sizeId, themeId) {
        var size = M.SIZES.filter(function (s) { return s.id === sizeId; })[0] || M.SIZES[0];
        return {
            app: 'sineslide', v: 1,
            size: { id: size.id, w: size.w, h: size.h },
            theme: { id: themeId || 'sinerli', variant: 0 },
            footer: { date: false, dateText: '', num: false, text: '', show: false, skipTitle: true },
            settings: { loop: false, advance: 'click', showHidden: false },
            slides: [M.newSlide('title', size.w, size.h)]
        };
    };

    /** Ubah ukuran slide: elemen diskalakan & diposisikan ulang di tengah. */
    M.resizeDeck = function (deck, w, h, mode) {
        var sx = w / deck.size.w, sy = h / deck.size.h;
        var s = mode === 'maximize' ? Math.max(sx, sy) : Math.min(sx, sy);
        var ox = (w - deck.size.w * s) / 2, oy = (h - deck.size.h * s) / 2;
        var scaleEl = function (e) {
            if (e.type === 'line') { e.x1 = e.x1 * s + ox; e.y1 = e.y1 * s + oy; e.x2 = e.x2 * s + ox; e.y2 = e.y2 * s + oy; M.syncLineBox(e); if (e.line) e.line.w = Math.max(0.5, (e.line.w || 1) * s); return; }
            e.x = Math.round(e.x * s + ox); e.y = Math.round(e.y * s + oy); e.w = Math.round(e.w * s); e.h = Math.round(e.h * s);
            if (e.st && e.st.fs) e.st.fs = Math.max(6, Math.round(e.st.fs * s * 2) / 2);
            if (e.children) e.children.forEach(function (c) { c.x *= s; c.y *= s; c.w *= s; c.h *= s; if (c.x1 !== undefined) { c.x1 *= s; c.y1 *= s; c.x2 *= s; c.y2 *= s; } if (c.st && c.st.fs) c.st.fs = Math.max(6, Math.round(c.st.fs * s * 2) / 2); });
            if (e.html && s !== 1) e.html = M.scaleHtmlFonts(e.html, s);
        };
        deck.slides.forEach(function (sl) { sl.els.forEach(scaleEl); });
        deck.size = { id: M.SIZES.filter(function (z) { return z.w === w && z.h === h; }).map(function (z) { return z.id; })[0] || 'custom', w: w, h: h };
    };

    M.scaleHtmlFonts = function (html, s) {
        return String(html).replace(/font-size:\s*([\d.]+)pt/g, function (m, n) { return 'font-size: ' + Math.max(6, Math.round(parseFloat(n) * s * 2) / 2) + 'pt'; });
    };

    // ============================================================ teks
    var ALLOWED = { DIV: 1, P: 1, BR: 1, SPAN: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, SUB: 1, SUP: 1, UL: 1, OL: 1, LI: 1, A: 1, FONT: 1 };
    var STYLE_OK = /^(color|background-color|font-family|font-size|font-weight|font-style|text-decoration|text-decoration-line|text-align|line-height|margin-left|text-transform|letter-spacing)$/;

    /** Membersihkan HTML teks slide (hasil ketik/tempel). */
    M.sanitize = function (html) {
        if (!html) return '';
        var doc;
        try { doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html'); } catch (e) { return ''; }
        var root = doc.body.firstChild;
        (function walk(node) {
            Array.prototype.slice.call(node.childNodes).forEach(function (ch) {
                if (ch.nodeType === 3) return;
                if (ch.nodeType !== 1) { ch.remove(); return; }
                if (!ALLOWED[ch.tagName]) {
                    if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|META|LINK|TITLE|IMG|SVG|VIDEO|AUDIO|CANVAS|INPUT|BUTTON|TEXTAREA|SELECT)$/.test(ch.tagName)) { ch.remove(); return; }
                    var block = /^(H[1-6]|BLOCKQUOTE|PRE|SECTION|ARTICLE|HEADER|FOOTER|TR|TABLE)$/.test(ch.tagName);
                    walk(ch);
                    var frag = doc.createDocumentFragment();
                    while (ch.firstChild) frag.appendChild(ch.firstChild);
                    if (block) { var d = doc.createElement('div'); d.appendChild(frag); ch.replaceWith(d); } else ch.replaceWith(frag);
                    return;
                }
                if (ch.tagName === 'FONT') {
                    var sp = doc.createElement('span');
                    if (ch.getAttribute('color')) sp.style.color = ch.getAttribute('color');
                    if (ch.getAttribute('face')) sp.style.fontFamily = ch.getAttribute('face');
                    while (ch.firstChild) sp.appendChild(ch.firstChild);
                    ch.replaceWith(sp);
                    ch = sp;
                }
                Array.prototype.slice.call(ch.attributes).forEach(function (a) {
                    var n = a.name.toLowerCase();
                    if (n === 'style') {
                        var keep = [];
                        String(a.value).split(';').forEach(function (decl) {
                            var i = decl.indexOf(':');
                            if (i < 0) return;
                            var prop = decl.slice(0, i).trim().toLowerCase(), val = decl.slice(i + 1).trim();
                            if (STYLE_OK.test(prop) && !/url\(|expression|javascript:/i.test(val)) keep.push(prop + ': ' + val);
                        });
                        if (keep.length) ch.setAttribute('style', keep.join('; ')); else ch.removeAttribute('style');
                    } else if (n === 'href' && ch.tagName === 'A') {
                        if (!/^(https?:|mailto:|#slide-)/i.test(a.value.trim())) ch.removeAttribute('href');
                    } else if (!(ch.tagName === 'A' && n === 'target')) ch.removeAttribute(a.name);
                });
                if (ch.tagName === 'A') { ch.setAttribute('target', '_blank'); ch.setAttribute('rel', 'noopener'); }
                walk(ch);
            });
        })(root);
        return root.innerHTML;
    };

    M.htmlToText = function (html) {
        if (!html) return '';
        var d = document.createElement('div');
        d.innerHTML = String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li)>/gi, '\n');
        return d.textContent.replace(/​/g, '').replace(/\n{3,}/g, '\n\n').trim();
    };
    M.textToHtml = function (text, bullets) {
        var lines = String(text || '').replace(/\r/g, '').split('\n');
        var esc = function (s) { return SO.esc(s); };
        if (bullets) return '<ul>' + lines.map(function (l) { return '<li>' + (esc(l) || '<br>') + '</li>'; }).join('') + '</ul>';
        return lines.map(function (l) { return '<div>' + (esc(l) || '<br>') + '</div>'; }).join('');
    };
    M.isEmptyHtml = function (html) {
        return !M.htmlToText(html).replace(/\s/g, '');
    };

    // ============================================================ dek
    M.findEl = function (slide, id) {
        for (var i = 0; i < slide.els.length; i++) if (slide.els[i].id === id) return slide.els[i];
        return null;
    };
    M.bbox = function (els) {
        if (!els.length) return null;
        var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        els.forEach(function (e) {
            var b = M.rotatedBox(e);
            x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
        });
        return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    };
    /** Kotak sejajar sumbu yang melingkupi elemen yang diputar. */
    M.rotatedBox = function (e) {
        if (!e.rot) return { x: e.x, y: e.y, w: e.w, h: e.h };
        var r = e.rot * Math.PI / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
        var w = e.w * c + e.h * s, h = e.w * s + e.h * c;
        return { x: e.x + e.w / 2 - w / 2, y: e.y + e.h / 2 - h / 2, w: w, h: h };
    };
    /** Salinan elemen dengan id baru (termasuk anak grup). */
    M.cloneEl = function (e) {
        var c = M.clone(e);
        c.id = M.uid('e');
        if (c.children) c.children = c.children.map(function (ch) { var x = M.clone(ch); x.id = M.uid('e'); return x; });
        delete c.ph;
        return c;
    };
    M.cloneSlide = function (s) {
        var c = M.clone(s);
        var map = {};
        c.id = M.uid('s');
        c.els.forEach(function (e) {
            var nid = M.uid('e');
            map[e.id] = nid;
            e.id = nid;
            if (e.children) e.children.forEach(function (ch) { ch.id = M.uid('e'); });
        });
        // Animasi ikut disalin dengan id elemen yang baru.
        c.anims = (c.anims || []).filter(function (a) { return map[a.el]; }).map(function (a) { a.id = M.uid('a'); a.el = map[a.el]; return a; });
        (c.comments || []).forEach(function (cm) { cm.id = M.uid('c'); });
        return c;
    };
    /** Semua aset gambar yang dipakai dek. */
    M.assetIds = function (deck) {
        var ids = [];
        var add = function (id) { if (id && ids.indexOf(id) === -1) ids.push(id); };
        deck.slides.forEach(function (s) {
            if (s.bg && s.bg.image) add(s.bg.image);
            s.els.forEach(function (e) {
                if (e.asset) add(e.asset);
                if (e.fill && e.fill.image) add(e.fill.image);
                (e.children || []).forEach(function (c) { if (c.asset) add(c.asset); });
            });
        });
        if (deck.bgImage) add(deck.bgImage);
        return ids;
    };
    M.slideTitle = function (slide) {
        var t = slide.els.filter(function (e) { return e.ph === 'title'; })[0];
        if (!t) t = slide.els.filter(function (e) { return e.html && !M.isEmptyHtml(e.html); })[0];
        return t ? M.htmlToText(t.html).split('\n')[0].slice(0, 80) : '';
    };

    // ==================================================== animasi & transisi
    M.TRANSITIONS = [
        ['none', 's_tr_none', 'fa-ban'], ['fade', 's_tr_fade', 'fa-circle-half-stroke'], ['push', 's_tr_push', 'fa-arrow-right'], ['wipe', 's_tr_wipe', 'fa-arrow-right-long'],
        ['split', 's_tr_split', 'fa-table-columns'], ['reveal', 's_tr_reveal', 'fa-right-long'], ['cover', 's_tr_cover', 'fa-left-long'], ['zoom', 's_tr_zoom', 'fa-magnifying-glass-plus'],
        ['flip', 's_tr_flip', 'fa-rotate'], ['cube', 's_tr_cube', 'fa-cube'], ['morph', 's_tr_morph', 'fa-wand-magic-sparkles']
    ];
    M.ANIMS = {
        entrance: [['appear', 's_an_appear', 'fa-star'], ['fade', 's_an_fade', 'fa-circle-half-stroke'], ['fly', 's_an_fly', 'fa-plane'], ['float', 's_an_float', 'fa-arrow-up'], ['wipe', 's_an_wipe', 'fa-arrow-right-long'],
            ['zoom', 's_an_zoom', 'fa-magnifying-glass-plus'], ['bounce', 's_an_bounce', 'fa-basketball'], ['grow', 's_an_growturn', 'fa-arrows-rotate'], ['swivel', 's_an_swivel', 'fa-arrows-left-right']],
        emphasis: [['pulse', 's_an_pulse', 'fa-heart-pulse'], ['spin', 's_an_spin', 'fa-rotate-right'], ['growShrink', 's_an_grow', 'fa-up-right-and-down-left-from-center'], ['teeter', 's_an_teeter', 'fa-arrows-left-right'], ['flash', 's_an_flash', 'fa-bolt']],
        exit: [['disappear', 's_an_disappear', 'fa-eye-slash'], ['fadeOut', 's_an_fadeout', 'fa-circle-half-stroke'], ['flyOut', 's_an_flyout', 'fa-plane'], ['floatOut', 's_an_floatout', 'fa-arrow-down'], ['zoomOut', 's_an_zoomout', 'fa-magnifying-glass-minus']]
    };
    M.animInfo = function (effect) {
        var out = null;
        Object.keys(M.ANIMS).forEach(function (k) { M.ANIMS[k].forEach(function (a) { if (a[0] === effect) out = { id: a[0], label: a[1], icon: a[2], kind: k }; }); });
        return out;
    };
})(window);
