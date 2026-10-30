/**
 * Sinerli Present — adaptor panel AI (lihat tools/office/shared/office-ai.js).
 *
 * "Bagian" di sini adalah KOTAK TEKS: judul, isi, dan bentuk berteks pada slide
 * yang sedang dibuka. Bila pengguna memilih beberapa objek, hanya objek itu yang
 * dikirim; bila tidak memilih apa pun, seluruh teks slide yang sedang terbuka
 * dipakai — itulah yang orang maksud dengan "rapikan slide ini".
 *
 * Daftar berbutir dipertahankan sebagai daftar: bila kotak aslinya <ul>/<ol>,
 * hasilnya ditulis ulang sebagai daftar juga, satu baris = satu butir.
 */
(function (global) {
    'use strict';

    var App = global.SineSlide, M = global.SSM;
    if (!App || !SO.ai) return;

    var MAX_BOXES = 40;
    var wasBullets = {};   // id → apakah kotak ini semula berupa daftar

    function textEls(list) {
        return (list || []).filter(function (e) {
            return e && typeof e.html === 'string' && !M.isEmptyHtml(e.html);
        });
    }

    function label(e) {
        if (e.ph === 'title' || e.ph === 'ctrTitle') return SO.t('s_ai_box_title');
        if (e.ph === 'body' || e.ph === 'subTitle') return SO.t('s_ai_box_body');
        return SO.t('s_text_box');
    }

    function collect() {
        var slide = App.slide();
        if (!slide) return { items: [], label: '' };

        var picked = textEls(App.selected());
        var usingSlide = false;
        if (!picked.length) {
            picked = textEls(slide.els);
            usingSlide = true;
        }

        var items = [];
        var truncated = false;
        wasBullets = {};
        picked.forEach(function (e) {
            if (items.length >= MAX_BOXES) { truncated = true; return; }
            wasBullets[e.id] = /<(ul|ol)\b/i.test(e.html);
            // id internal dipakai untuk menulis balik; label untuk dibaca manusia.
            items.push({ id: e.id, label: label(e), text: M.htmlToText(e.html) });
        });

        return {
            items: items,
            truncated: truncated,
            label: usingSlide
                ? SO.t('s_ai_whole_slide', { n: App.cur + 1 })
                : items.map(label).slice(0, 3).join(', '),
            context: { title: App.getTitle ? App.getTitle() : '' }
        };
    }

    function apply(results) {
        var slide = App.slide();
        if (!slide) return false;
        return App.change('ai-edit', function () {
            results.forEach(function (r) {
                var e = M.findEl(slide, r.id);
                if (!e) return;
                e.html = M.textToHtml(r.text, !!wasBullets[r.id]);
            });
        }, { render: 'slide' });
    }

    SO.ai.register({
        app: 'sineslide',
        collect: collect,
        apply: apply,
        focus: function () { if (App.el && App.el.wrap) App.el.wrap.focus(); }
    });

    var origSelect = App.select;
    if (typeof origSelect === 'function') {
        App.select = function () {
            var r = origSelect.apply(this, arguments);
            SO.ai.refreshTarget();
            return r;
        };
    }
})(window);
