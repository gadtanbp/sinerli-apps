/**
 * Sinerli Hitara — adaptor panel AI (lihat tools/office/shared/office-ai.js).
 *
 * Yang dikirim ke server adalah SEL, bukan lembar kerja. Satu sel = satu
 * "bagian" yang dijawab terpisah, sehingga hasilnya bisa ditimpa per sel dan
 * dibatalkan sekali tekan Ctrl+Z. Sel kosong tidak pernah ikut dikirim —
 * seleksi persegi yang separuh kosong tidak perlu dibayar dengan token.
 *
 * Konteks yang ikut hanya baris judul kolom (maksimal 12 kolom). Sedikit, tapi
 * itulah yang membuat AI paham "kolom D itu Total, bukan angka acak".
 */
(function (global) {
    'use strict';

    var App = global.SineEX, F = global.SXF;
    if (!App || !SO.ai) return;

    var MAX_CELLS = 60;      // cerminan OAI_MAX_ITEMS di server

    function sheet() { return App.sheet(); }

    function norm(rg) {
        return {
            r1: Math.min(rg.r1, rg.r2), c1: Math.min(rg.c1, rg.c2),
            r2: Math.max(rg.r1, rg.r2), c2: Math.max(rg.c1, rg.c2)
        };
    }

    /** Label seleksi untuk panel: "A2:C9" atau "A2:C9 +1". */
    function selLabel() {
        var rgs = App.sel.ranges.map(norm);
        var first = rgs[0];
        var label = F.addr(first.r1, first.c1) + (first.r1 === first.r2 && first.c1 === first.c2 ? '' : ':' + F.addr(first.r2, first.c2));
        return rgs.length > 1 ? label + ' +' + (rgs.length - 1) : label;
    }

    /**
     * Baris judul kolom yang tersentuh seleksi. Diambil dari baris tepat di atas
     * seleksi bila ada isinya; kalau tidak, dari baris pertama seleksi itu
     * sendiri. Dibatasi 12 kolom agar tetap murah.
     */
    function headerContext(rg) {
        var sh = sheet();
        var out = [];
        var headRow = rg.r1 > 0 ? rg.r1 - 1 : rg.r1;
        for (var c = rg.c1; c <= rg.c2 && out.length < 12; c++) {
            var txt = String(App.wb.editText(sh, headRow, c) || '').trim();
            if (txt) out.push(F.colName(c) + '=' + txt.slice(0, 40));
        }
        return out;
    }

    function collect(mode) {
        var rg = norm(App.selRange());

        if (mode === 'formula') {
            return {
                items: [],
                label: F.addr(App.sel.active.r, App.sel.active.c),
                context: { sheet: sheet().name, headers: headerContext(rg) }
            };
        }

        var sh = sheet();
        var items = [];
        var truncated = false;
        App.sel.ranges.forEach(function (raw) {
            var r = norm(raw);
            for (var row = r.r1; row <= r.r2; row++) {
                for (var col = r.c1; col <= r.c2; col++) {
                    if (items.length >= MAX_CELLS) { truncated = true; return; }
                    var txt = App.wb.editText(sh, row, col);
                    if (txt === '' || txt == null) continue;
                    // Mode "jelaskan rumus" hanya relevan untuk sel berisi rumus.
                    if (mode === 'explain' && String(txt).charAt(0) !== '=') continue;
                    items.push({ id: F.addr(row, col), text: String(txt) });
                }
            }
        });

        return {
            items: items,
            truncated: truncated,
            label: selLabel(),
            context: { sheet: sh.name, headers: headerContext(rg) }
        };
    }

    function apply(results, mode) {
        var sh = sheet();

        if (mode === 'formula') {
            var a = App.sel.active;
            if (!results.length) return false;
            return App.change('ai-formula', function () {
                App.wb.setInput(sh, a.r, a.c, results[0].text);
            });
        }

        return App.change('ai-edit', function () {
            results.forEach(function (r) {
                var p = F.parseAddr(String(r.id));
                if (!p) return;
                App.wb.setInput(sh, p.r, p.c, r.text);
            });
        });
    }

    SO.ai.register({
        app: 'sineex',
        collect: collect,
        apply: apply,
        focus: function () { App.focusGrid(); }
    });

    // Panel selalu menampilkan seleksi yang SEKARANG, bukan yang tadi.
    var origSelChanged = App.onSelectionChanged;
    App.onSelectionChanged = function () {
        var r = origSelChanged.apply(this, arguments);
        SO.ai.refreshTarget();
        return r;
    };
})(window);
