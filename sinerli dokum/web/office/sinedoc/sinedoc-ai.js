/**
 * Sinerli Dokum — adaptor panel AI (lihat tools/office/shared/office-ai.js).
 *
 * "Bagian" di sini adalah BLOK: paragraf, judul, butir daftar, atau sel tabel
 * yang tersentuh seleksi (App.selectedBlocks()). Mengirim per blok, bukan
 * seluruh dokumen, membuat biaya sebanding dengan yang benar-benar dikerjakan
 * dan hasilnya bisa ditimpa tepat di tempatnya.
 *
 * CATATAN PENTING soal format: AI menerima dan mengembalikan TEKS BIASA. Kalau
 * blok yang dipilih mengandung format di dalam kalimat (tebal, miring, tautan),
 * format itu tidak punya padanan di teks biasa dan akan hilang saat hasilnya
 * diterapkan. Daripada diam-diam merusak dokumen orang, hal ini dikonfirmasi
 * sekali sebelum penerapan pertama. Format tingkat blok (jenis huruf, perataan,
 * gaya judul) tetap utuh karena elemennya sendiri tidak diganti.
 */
(function (global) {
    'use strict';

    var App = global.SineDoc;
    if (!App || !SO.ai) return;

    var MAX_BLOCKS = 60;
    var blockMap = {};          // id → elemen, diisi ulang tiap collect()
    var richConfirmed = false;  // konfirmasi kehilangan format sudah diberikan?

    function blockText(el) {
        return (el.innerText || el.textContent || '').replace(/​/g, '').trim();
    }

    /** Nama blok yang ramah dibaca: "Judul 2", "Butir", "Sel tabel", "Paragraf 3". */
    function blockLabel(el, n) {
        var tag = el.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) return SO.t('d_ai_lbl_heading') + ' ' + tag.charAt(1);
        if (tag === 'li') return SO.t('d_ai_lbl_bullet');
        if (tag === 'td' || tag === 'th') return SO.t('d_ai_lbl_cell');
        if (tag === 'blockquote') return SO.t('d_ai_lbl_quote');
        return SO.t('d_ai_lbl_para') + ' ' + n;
    }

    /** Blok punya format di dalam kalimat yang tidak bisa dibawa teks biasa? */
    function hasInlineFormatting(el) {
        return !!el.querySelector('b,strong,i,em,u,s,strike,a,sub,sup,mark,span[style],font,code');
    }

    function collect(mode) {
        var blocks = App.selectedBlocks() || [];
        blockMap = {};
        var items = [];
        var truncated = false;

        blocks.forEach(function (el, i) {
            if (items.length >= MAX_BLOCKS) { truncated = true; return; }
            var txt = blockText(el);
            if (!txt) return;
            var id = 'B' + (i + 1);
            blockMap[id] = el;
            // Label mengikuti jenis bloknya (Judul 1, Butir, Paragraf …) supaya
            // daftar hasil di panel bisa dicocokkan sekilas dengan dokumen.
            items.push({ id: id, label: blockLabel(el, items.length + 1), text: txt });
        });

        return {
            items: items,
            truncated: truncated,
            label: items.length ? SO.t('d_ai_blocks', { n: items.length }) : '',
            context: { title: App.getTitle() }
        };
    }

    function applyNow(results) {
        return App.change(function () {
            results.forEach(function (r) {
                var el = blockMap[r.id];
                if (!el || !el.isConnected) return;
                // Elemen blok DIPERTAHANKAN (tag, kelas, gaya); hanya isinya yang
                // diganti, sehingga gaya judul/perataan/spasi tidak ikut hilang.
                el.textContent = r.text;
            });
        }) !== false;
    }

    function apply(results) {
        var risky = results.some(function (r) {
            var el = blockMap[r.id];
            return el && hasInlineFormatting(el);
        });

        if (risky && !richConfirmed) {
            // Penerapan ditunda sampai pengguna menjawab; panel diberi tahu bahwa
            // tidak ada yang berubah sekarang supaya ia tidak menghapus hasilnya.
            SO.confirm('d_ai_lose_format', { okLabel: 'c_ai_apply' }).then(function (ok) {
                if (!ok) return;
                richConfirmed = true;
                if (applyNow(results)) {
                    SO.toast('c_ai_applied', { type: 'success', vars: { n: results.length } });
                    SO.ai.close();
                }
            });
            return false;
        }

        return applyNow(results);
    }

    SO.ai.register({
        app: 'sinedoc',
        collect: collect,
        apply: apply,
        focus: function () { App.restoreRange(); }
    });

    // Panel harus mencerminkan seleksi yang sekarang, termasuk saat pengguna
    // menyeret kursor di dokumen sementara panel terbuka.
    document.addEventListener('selectionchange', SO.debounce(function () {
        SO.ai.refreshTarget();
    }, 160));
})(window);
