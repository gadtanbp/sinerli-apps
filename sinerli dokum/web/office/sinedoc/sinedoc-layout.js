/**
 * Sinerli Dokum — tata letak halaman.
 *
 * Editor adalah SATU contentEditable yang mengalir terus ke bawah. Halaman
 * digambar di belakangnya, dan blok yang melewati batas bawah area isi
 * sebuah halaman "didorong" ke awal halaman berikutnya:
 *   - blok utuh (p, h1, tabel pendek, …)  → margin-top tambahan (data-sd-push)
 *   - paragraf lebih panjang dari sisa ruang → <span class="sd-gap"> blok
 *     disisipkan tepat di awal baris yang terpotong
 *   - baris tabel                          → <tr class="sd-row-gap"> pengisi
 *
 * Semua artefak itu dibuang lagi sebelum dokumen disimpan/diekspor
 * (lihat SDLayout.cleanHtml). Karena penyisipan span memecah node teks,
 * posisi kursor disimpan sebagai "unit" (jumlah karakter + awal elemen)
 * yang tidak berubah oleh artefak tata letak.
 */
(function (global) {
    'use strict';

    var MM = 96 / 25.4;
    var PAGE_SIZES = {
        a4: { w: 210, h: 297 }, letter: { w: 215.9, h: 279.4 }, legal: { w: 215.9, h: 355.6 },
        f4: { w: 215, h: 330 }, a5: { w: 148, h: 210 }, a3: { w: 297, h: 420 }, b5: { w: 176, h: 250 }
    };
    var PAGE_GAP = 24;

    function geometry(s) {
        var size = PAGE_SIZES[s.size] || { w: s.customW || 210, h: s.customH || 297 };
        var w = size.w, h = size.h;
        if (s.orientation === 'landscape') { var tmp = w; w = h; h = tmp; }
        var g = {
            pageW: Math.round(w * MM), pageH: Math.round(h * MM),
            mT: Math.round(s.margins.top * MM), mB: Math.round(s.margins.bottom * MM),
            mL: Math.round(s.margins.left * MM), mR: Math.round(s.margins.right * MM),
            headerDist: Math.round((s.headerDist || 12.5) * MM), footerDist: Math.round((s.footerDist || 12.5) * MM),
            gap: PAGE_GAP
        };
        g.contentW = Math.max(120, g.pageW - g.mL - g.mR);
        g.contentH = Math.max(120, g.pageH - g.mT - g.mB);
        g.pitch = g.pageH + g.gap;
        return g;
    }

    // ------------------------------------------------------------ selection
    function isArtifact(n) {
        return n.nodeType === 1 && (
            (n.classList.contains('sd-gap')) ||
            (n.tagName === 'TR' && n.classList.contains('sd-row-gap'))
        );
    }

    function pointToUnits(root, node, offset) {
        var count = 0, found = null;
        function walk(n) {
            if (found !== null || isArtifact(n)) return;
            if (n.nodeType === 3) {
                if (n === node) { found = count + Math.min(offset, n.length); return; }
                count += n.length;
                return;
            }
            if (n.nodeType !== 1) return;
            if (n !== root) count += 1;
            var kids = n.childNodes;
            if (n === node) {
                for (var i = 0; i < kids.length; i++) {
                    if (i === offset) { found = count; return; }
                    walk(kids[i]);
                    if (found !== null) return;
                }
                found = count;
                return;
            }
            for (var j = 0; j < kids.length; j++) { walk(kids[j]); if (found !== null) return; }
        }
        walk(root);
        return found === null ? count : found;
    }

    function unitsToPoint(root, target) {
        var count = 0;
        function walk(n, parent, index) {
            if (isArtifact(n)) return null;
            if (n.nodeType === 3) {
                if (target <= count + n.length) return [n, target - count];
                count += n.length;
                return null;
            }
            if (n.nodeType !== 1) return null;
            if (n !== root) {
                if (count === target && parent) return [parent, index];
                count += 1;
            }
            var kids = n.childNodes;
            for (var i = 0; i < kids.length; i++) {
                var r = walk(kids[i], n, i);
                if (r) return r;
            }
            if (count === target) return [n, kids.length];
            return null;
        }
        return walk(root, null, 0) || [root, root.childNodes.length];
    }

    function saveSelection(root) {
        var sel = global.getSelection();
        if (!sel || !sel.rangeCount) return null;
        if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null;
        return {
            a: pointToUnits(root, sel.anchorNode, sel.anchorOffset),
            f: pointToUnits(root, sel.focusNode, sel.focusOffset)
        };
    }

    function restoreSelection(root, saved) {
        if (!saved) return;
        var a = unitsToPoint(root, saved.a);
        var f = saved.f === saved.a ? a : unitsToPoint(root, saved.f);
        var sel = global.getSelection();
        try { sel.setBaseAndExtent(a[0], a[1], f[0], f[1]); } catch (e) {}
    }

    // ----------------------------------------------------------- pagination
    var SPLIT_CONTAINERS = { UL: 1, OL: 1, BLOCKQUOTE: 1 };
    var TEXT_BLOCKS = { P: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, PRE: 1, LI: 1, DIV: 1 };
    var HEADINGS = { H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1 };

    var WRAP_CHILD = /^(P|H[1-6]|TABLE|UL|OL|DIV|PRE|BLOCKQUOTE|FIGURE|HR)$/;
    /** Pembungkus blok polos (bukan kolom/daftar isi/catatan) yang anaknya berupa blok. */
    function isBlockWrapper(el) {
        if (el.tagName !== 'DIV' && el.tagName !== 'FIGURE') return false;
        if (el.getAttribute('contenteditable') === 'false') return false;
        var cl = el.classList;
        if (cl.contains('sd-cols') || cl.contains('sd-toc') || cl.contains('sd-notes') || cl.contains('sd-page-break')) return false;
        for (var i = 0; i < el.children.length; i++) if (WRAP_CHILD.test(el.children[i].tagName)) return true;
        return false;
    }

    /**
     * Menjaga isi tetap di dalam lebar kertas: indentasi yang ditumpuk berkali-kali
     * dan tabel tempelan dari Word/web dengan lebar kolom dalam px/pt dulu bisa
     * mendorong teks keluar dari tepi kanan kertas.
     */
    function fitWidth(editor, g) {
        var maxIndent = Math.max(0, g.contentW - 96);
        var list = editor.querySelectorAll('[style*="margin-left"], [style*="margin-right"], [style*="text-indent"]');
        for (var i = 0; i < list.length; i++) {
            var b = list[i];
            if (b.tagName === 'TABLE') continue;
            var ml = parseFloat(b.style.marginLeft) || 0;
            var mr = parseFloat(b.style.marginRight) || 0;
            var ti = parseFloat(b.style.textIndent) || 0;
            if (ml > maxIndent) { b.style.marginLeft = maxIndent + 'px'; ml = maxIndent; }
            if (ml + mr > maxIndent) { b.style.marginRight = Math.max(0, maxIndent - ml) + 'px'; }
            if (ti > 0 && ml + ti > maxIndent) b.style.textIndent = Math.max(0, maxIndent - ml) + 'px';
        }
        var tables = editor.querySelectorAll('table');
        for (var t = 0; t < tables.length; t++) {
            var tb = tables[t];
            var host = tb.parentElement;
            var avail = host === editor ? g.contentW : host.clientWidth;
            if (!avail || tb.offsetWidth <= avail + 1) continue;
            var cells = tb.querySelectorAll('td, th, col');
            for (var c = 0; c < cells.length; c++) {
                if (!/%$/.test(cells[c].style.width)) cells[c].style.width = '';
                cells[c].removeAttribute('width');
                if (cells[c].getAttribute('style') === '') cells[c].removeAttribute('style');
            }
            tb.style.width = '';
            tb.style.tableLayout = '';
            tb.removeAttribute('width');
            if (tb.getAttribute('style') === '') tb.removeAttribute('style');
            if (tb.offsetWidth > avail + 1) {
                // Persen yang jumlahnya lebih dari 100% — bagi rata.
                for (var c2 = 0; c2 < cells.length; c2++) cells[c2].style.width = '';
            }
        }
    }

    function clearPushes(editor) {
        var list = editor.querySelectorAll('[data-sd-push]');
        for (var i = 0; i < list.length; i++) {
            var el = list[i];
            el.style.marginTop = el.getAttribute('data-sd-mt') || '';
            el.removeAttribute('data-sd-push');
            el.removeAttribute('data-sd-mt');
            if (el.getAttribute('style') === '') el.removeAttribute('style');
        }
    }

    function removeGaps(editor) {
        var gaps = editor.querySelectorAll('.sd-gap, tr.sd-row-gap');
        if (!gaps.length) return false;
        var parents = [];
        for (var i = 0; i < gaps.length; i++) {
            var p = gaps[i].parentNode;
            gaps[i].remove();
            if (p && parents.indexOf(p) === -1) parents.push(p);
        }
        parents.forEach(function (p) { if (p.isConnected) p.normalize(); });
        return true;
    }

    function textNodesOf(el) {
        var out = [];
        var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentNode;
                while (p && p !== el) {
                    if (p.nodeType === 1 && (p.getAttribute('contenteditable') === 'false' || p.tagName === 'UL' || p.tagName === 'OL' || p.tagName === 'TABLE')) return NodeFilter.FILTER_REJECT;
                    p = p.parentNode;
                }
                return n.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
        var n;
        while ((n = walker.nextNode())) out.push(n);
        return out;
    }

    /**
     * Menghitung dan menerapkan pemutusan halaman.
     * Mengembalikan {pages, blockPage: Map(blok tingkat atas → indeks halaman)}.
     */
    function paginate(editor, g, zoom) {
        zoom = zoom || 1;
        var hadGaps = editor.querySelector('.sd-gap, tr.sd-row-gap') !== null;
        var savedSel = null;
        if (hadGaps) {
            savedSel = saveSelection(editor);
            removeGaps(editor);
        }
        clearPushes(editor);

        var edTop = editor.getBoundingClientRect().top;
        var range = document.createRange();
        var pitch = g.pitch, contentH = g.contentH;
        var shift = 0;
        var pushes = [];      // [el, marginPx]
        var gapsPlan = [];    // {type:'text', node, offset, h} | {type:'row', tr, h, cols}
        var blockPage = new Map();
        var lastBottom = 0;
        var forceNext = false;
        var EPS = 0.5;

        function rectOf(el) {
            var r = el.getBoundingClientRect();
            return { top: (r.top - edTop) / zoom, bottom: (r.bottom - edTop) / zoom, h: r.height / zoom };
        }
        function pageAt(y) { return Math.max(0, Math.floor((y + EPS) / pitch)); }
        function cTop(p) { return p * pitch; }
        function cBot(p) { return p * pitch + contentH; }

        function pushEl(el, natTop, prevNatBottom, delta) {
            // Blok pertama dalam wadah: dorong wadahnya supaya margin tidak runtuh.
            var target = el, tTop = natTop, tPrev = prevNatBottom;
            while (target.parentNode !== editor && !target.previousElementSibling && target.parentNode && target.parentNode.nodeType === 1 && target.parentNode.tagName !== 'TD' && target.parentNode.tagName !== 'TH') {
                target = target.parentNode;
                var pr = target.previousElementSibling ? rectOf(target.previousElementSibling) : null;
                tTop = rectOf(target).top;
                tPrev = pr ? pr.bottom : (target.parentNode === editor ? 0 : rectOf(target.parentNode).top);
            }
            var natGap = Math.max(0, tTop - tPrev);
            for (var i = 0; i < pushes.length; i++) {
                if (pushes[i][0] === target) { pushes[i][1] += delta; shift += delta; return; }
            }
            pushes.push([target, natGap + delta]);
            shift += delta;
        }

        function splitText(el, r, p) {
            // Cari karakter pertama yang barisnya melewati batas bawah halaman p.
            var nodes = textNodesOf(el);
            if (!nodes.length) return false;
            var splits = [];
            var page = p;
            var localShift = shift;
            var ni = 0, off = 0;
            var firstLineTop = null;
            while (ni < nodes.length) {
                var limit = cBot(page) - localShift;
                var hit = null;
                for (; ni < nodes.length; ni++, off = 0) {
                    var tn = nodes[ni];
                    range.setStart(tn, tn.length - 1);
                    range.setEnd(tn, tn.length);
                    var lastRect = range.getBoundingClientRect();
                    if (lastRect.height === 0) continue;
                    if ((lastRect.bottom - edTop) / zoom <= limit + EPS) continue;
                    var lo = off, hi = tn.length - 1;
                    while (lo < hi) {
                        var mid = (lo + hi) >> 1;
                        range.setStart(tn, mid);
                        range.setEnd(tn, mid + 1);
                        var rr = range.getBoundingClientRect();
                        if (rr.height === 0 || (rr.bottom - edTop) / zoom <= limit + EPS) lo = mid + 1; else hi = mid;
                    }
                    range.setStart(tn, lo);
                    range.setEnd(tn, lo + 1);
                    var cr = range.getBoundingClientRect();
                    hit = { node: tn, offset: lo, top: (cr.top - edTop) / zoom };
                    break;
                }
                if (!hit) break;
                if (firstLineTop === null) {
                    range.setStart(nodes[0], 0);
                    range.setEnd(nodes[0], Math.min(1, nodes[0].length));
                    firstLineTop = (range.getBoundingClientRect().top - edTop) / zoom;
                }
                // Baris pertama paragraf sudah tidak muat: jangan pecah, dorong saja.
                if (splits.length === 0 && hit.top <= firstLineTop + 2) return false;
                var h = cTop(page + 1) - (hit.top + localShift);
                if (h <= 0) break;
                splits.push({ type: 'text', node: hit.node, offset: hit.offset, h: h });
                localShift += h;
                page++;
                off = hit.offset + 1;
                if (off >= hit.node.length) { ni++; off = 0; }
                if (splits.length > 400) break;
            }
            if (!splits.length) return false;
            splits.forEach(function (s) { gapsPlan.push(s); });
            shift = localShift;
            return true;
        }

        function splitRows(table, p) {
            var rows = Array.prototype.filter.call(table.rows, function (tr) { return !tr.classList.contains('sd-row-gap'); });
            if (rows.length < 2) return false;
            var any = false;
            var page = p;
            var cols = 1;
            if (rows[0]) cols = Array.prototype.reduce.call(rows[0].cells, function (a, c) { return a + (c.colSpan || 1); }, 0);
            for (var i = 0; i < rows.length; i++) {
                var rr = rectOf(rows[i]);
                var top = rr.top + shift;
                var pg = pageAt(top);
                if (pg > page) page = pg;
                if (top + rr.h > cBot(page) + EPS && top > cTop(page) + EPS && i > 0) {
                    var h = cTop(page + 1) - top;
                    gapsPlan.push({ type: 'row', tr: rows[i], h: h, cols: cols });
                    shift += h;
                    page++;
                    any = true;
                }
            }
            return any;
        }

        function withFloats(el, r) {
            // Gambar mengapung (kiri/kanan) boleh menjulur melewati bawah paragrafnya;
            // hitung ujungnya supaya gambar itu tidak menembus batas kertas.
            var fl = el.querySelectorAll ? el.querySelectorAll('img.sd-img-left, img.sd-img-right') : [];
            if (!fl.length) return r;
            var b = r.bottom;
            for (var i = 0; i < fl.length; i++) b = Math.max(b, rectOf(fl[i]).bottom);
            return b > r.bottom ? { top: r.top, bottom: b, h: b - r.top } : r;
        }

        function place(el, prevNatBottom, depth) {
            if (isArtifact(el)) return;
            var r = withFloats(el, rectOf(el));
            if (r.h === 0 && !el.classList.contains('sd-page-break')) return;
            var top = r.top + shift;
            var p = pageAt(top);
            if (forceNext !== false && depth === 0) {
                var target = forceNext;
                forceNext = false;
                if (p < target) { pushEl(el, r.top, prevNatBottom, cTop(target) - top); top = cTop(target); p = target; }
            }
            if (top > cBot(p) - EPS && r.h > 0) {
                var d0 = cTop(p + 1) - top;
                pushEl(el, r.top, prevNatBottom, d0);
                top += d0;
                p++;
            }
            if (depth === 0) blockPage.set(el, p);
            if (el.classList.contains('sd-page-break')) {
                forceNext = p + 1;
                lastBottom = Math.max(lastBottom, top + r.h);
                return;
            }
            var bottom = top + r.h;
            if (bottom <= cBot(p) + EPS) { lastBottom = Math.max(lastBottom, bottom); return; }

            var tag = el.tagName;
            var fits = r.h <= contentH;
            // Wadah yang bisa dipecah per anak. DIV/FIGURE pembungkus (hasil tempel dari web)
            // dan kotak teks yang lebih tinggi dari satu halaman juga dipecah per anak —
            // kalau tidak, isinya (mis. tabel di dalam <div>) menembus bawah kertas.
            var wrapper = isBlockWrapper(el) && (!el.classList.contains('sd-box') || !fits);
            if (SPLIT_CONTAINERS[tag] || wrapper || (tag === 'LI' && el.querySelector(':scope > ul, :scope > ol'))) {
                var kids = Array.prototype.filter.call(el.children, function (k) { return !isArtifact(k); });
                if (kids.length > 1 || ((tag === 'LI' || wrapper) && kids.length)) {
                    var prevB = r.top;
                    kids.forEach(function (k, idx) {
                        var kr = rectOf(k);
                        place(k, idx === 0 ? prevB : rectOf(kids[idx - 1]).bottom, depth + 1);
                        prevB = kr.bottom;
                    });
                    return;
                }
            }
            var atTop = top <= cTop(p) + EPS;
            if (tag === 'TABLE' && r.h > cBot(p) - top) {
                // Baris pertama sudah menyeberang batas halaman: pindahkan tabelnya dulu,
                // baru pecah per baris dari halaman berikutnya.
                var firstRow = Array.prototype.find.call(el.rows, function (tr) { return !tr.classList.contains('sd-row-gap'); });
                if (!atTop && firstRow) {
                    var fr = rectOf(firstRow);
                    if (fr.top + shift + fr.h > cBot(p) + EPS) {
                        var dt = cTop(p + 1) - top;
                        pushEl(el, r.top, prevNatBottom, dt);
                        top += dt;
                        p++;
                        atTop = true;
                        if (depth === 0) blockPage.set(el, p);
                        if (fits) { lastBottom = Math.max(lastBottom, r.bottom + shift); return; }
                    }
                }
                if (splitRows(el, p)) { lastBottom = Math.max(lastBottom, r.bottom + shift); return; }
            }
            if (TEXT_BLOCKS[tag] && (!HEADINGS[tag] || !fits) && !el.classList.contains('sd-cols') && !el.classList.contains('sd-box') && !el.classList.contains('sd-toc') && el.getAttribute('contenteditable') !== 'false') {
                var remaining = cBot(p) - top;
                // Pecah paragraf bila setidaknya dua baris muat, atau bila memang tidak muat satu halaman.
                if (!fits || remaining > 2.4 * (parseFloat(getComputedStyle(el).lineHeight) || 16)) {
                    if (splitText(el, r, p)) { lastBottom = Math.max(lastBottom, r.bottom + shift); return; }
                    // Paragraf lebih tinggi dari satu halaman dan baris pertamanya terpotong
                    // batas bawah: pindah ke awal halaman berikutnya lalu pecah dari sana.
                    if (!fits && !atTop) {
                        var dp = cTop(p + 1) - top;
                        pushEl(el, r.top, prevNatBottom, dp);
                        if (depth === 0) blockPage.set(el, p + 1);
                        splitText(el, r, p + 1);
                        lastBottom = Math.max(lastBottom, r.bottom + shift);
                        return;
                    }
                }
            }
            if (fits && !atTop) {
                var d = cTop(p + 1) - top;
                // Judul tetap bersama paragraf sesudahnya (keep with next).
                var prev = depth === 0 ? el.previousElementSibling : null;
                if (prev && HEADINGS[prev.tagName] && blockPage.get(prev) === p) {
                    var pr2 = rectOf(prev);
                    var prevTop = pr2.top + shift;
                    if (prevTop > cTop(p) + EPS) {
                        var dh = cTop(p + 1) - prevTop;
                        var pprev = prev.previousElementSibling;
                        pushEl(prev, pr2.top, pprev ? rectOf(pprev).bottom : 0, dh);
                        blockPage.set(prev, p + 1);
                        blockPage.set(el, p + 1);
                        lastBottom = Math.max(lastBottom, r.bottom + shift);
                        return;
                    }
                }
                pushEl(el, r.top, prevNatBottom, d);
                blockPage.set(el, depth === 0 ? p + 1 : blockPage.get(el));
                lastBottom = Math.max(lastBottom, r.bottom + shift);
                return;
            }
            lastBottom = Math.max(lastBottom, bottom);
        }

        var blocks = Array.prototype.filter.call(editor.children, function (k) { return !isArtifact(k); });
        var prevBottom = 0;
        for (var i = 0; i < blocks.length; i++) {
            var nr = rectOf(blocks[i]);
            place(blocks[i], i === 0 ? 0 : prevBottom, 0);
            prevBottom = nr.bottom;
        }
        var pages = Math.max(1, pageAt(Math.max(0, lastBottom - 1)) + 1);
        if (forceNext !== false) pages = Math.max(pages, forceNext + 1);

        // --- terapkan rencana
        if (gapsPlan.length || hadGaps) {
            if (!savedSel) savedSel = saveSelection(editor);
            // Sisipkan dari belakang supaya offset node teks sebelumnya tetap sah.
            for (var gi = gapsPlan.length - 1; gi >= 0; gi--) {
                var gp = gapsPlan[gi];
                if (gp.type === 'text') {
                    var tn = gp.node;
                    var after = gp.offset > 0 ? tn.splitText(gp.offset) : tn;
                    var span = document.createElement('span');
                    span.className = 'sd-gap';
                    span.setAttribute('contenteditable', 'false');
                    span.style.display = 'block';
                    span.style.height = gp.h.toFixed(2) + 'px';
                    after.parentNode.insertBefore(span, after);
                } else {
                    var tr = document.createElement('tr');
                    tr.className = 'sd-row-gap';
                    tr.setAttribute('contenteditable', 'false');
                    var td = document.createElement('td');
                    td.colSpan = gp.cols;
                    td.style.height = gp.h.toFixed(2) + 'px';
                    tr.appendChild(td);
                    gp.tr.parentNode.insertBefore(tr, gp.tr);
                }
            }
        }
        for (var pi = 0; pi < pushes.length; pi++) {
            var pel = pushes[pi][0];
            pel.setAttribute('data-sd-mt', pel.style.marginTop || '');
            pel.setAttribute('data-sd-push', '1');
            pel.style.marginTop = pushes[pi][1].toFixed(2) + 'px';
        }
        if (savedSel && (gapsPlan.length || hadGaps)) restoreSelection(editor, savedSel);
        range.detach && range.detach();
        return { pages: pages, blockPage: blockPage };
    }

    // --------------------------------------------------------- page layers
    function fieldHtml(html, ctx) {
        if (!html) return '';
        return html.replace(/<span class="sd-field" data-field="(\w+)"[^>]*>[\s\S]*?<\/span>/g, function (m, f) {
            var v = f === 'page' ? ctx.page : f === 'pages' ? ctx.pages : f === 'date' ? ctx.date : f === 'title' ? SO.esc(ctx.title) : '';
            return '<span class="sd-field" data-field="' + f + '">' + v + '</span>';
        });
    }

    function hfFor(settings, pageIndex, which) {
        var hf = settings.hf || {};
        if (hf.differentFirst && pageIndex === 0) return which === 'header' ? (hf.firstHeader || '') : (hf.firstFooter || '');
        if (hf.differentOddEven && pageIndex % 2 === 1) return which === 'header' ? (hf.evenHeader || '') : (hf.evenFooter || '');
        return which === 'header' ? (hf.header || '') : (hf.footer || '');
    }

    function pageNumberFor(settings, i) { return (settings.hf && settings.hf.startAt ? settings.hf.startAt : 1) + i; }

    function renderPages(bgLayer, hfLayer, count, g, settings, title, onHfClick) {
        var existing = bgLayer.children.length;
        var date = new Intl.DateTimeFormat(SO.locale(), { dateStyle: 'long' }).format(new Date());
        var key = [g.pageW, g.pageH, g.mT, g.mB, g.mL, g.mR, settings.pageColor, JSON.stringify(settings.border || null), settings.watermark || '', JSON.stringify(settings.hf || {}), title, date, count].join('|');
        if (bgLayer._key === key) return;
        bgLayer._key = key;
        if (existing !== count) { bgLayer.innerHTML = ''; hfLayer.innerHTML = ''; }
        for (var i = 0; i < count; i++) {
            var page = bgLayer.children[i];
            if (!page) { page = document.createElement('div'); page.className = 'sd-page'; bgLayer.appendChild(page); }
            page.style.top = (i * g.pitch) + 'px';
            page.style.width = g.pageW + 'px';
            page.style.height = g.pageH + 'px';
            page.style.background = settings.pageColor || '#fff';
            var inner = '';
            if (settings.watermark) inner += '<div class="sd-watermark" style="font-size:' + Math.round(g.pageW / Math.max(4, settings.watermark.length) * 1.3) + 'px">' + SO.esc(settings.watermark) + '</div>';
            if (settings.border && settings.border.style && settings.border.style !== 'none') {
                var off = Math.round((settings.border.offset || 24));
                inner += '<div class="sd-page-border" style="left:' + off + 'px;top:' + off + 'px;right:' + off + 'px;bottom:' + off + 'px;border:' + (settings.border.width || 1) + 'px ' + settings.border.style + ' ' + (settings.border.color || '#000') + '"></div>';
            }
            inner += '<div class="sd-page-label">' + (i + 1) + '</div>';
            page.innerHTML = inner;

            var ctx = { page: pageNumberFor(settings, i), pages: count, date: date, title: title };
            var head = hfLayer.children[i * 2];
            var foot = hfLayer.children[i * 2 + 1];
            if (!head) {
                head = document.createElement('div'); head.className = 'sd-page-hf is-header';
                foot = document.createElement('div'); foot.className = 'sd-page-hf is-footer';
                head.addEventListener('dblclick', function (e) { onHfClick('header', e); });
                foot.addEventListener('dblclick', function (e) { onHfClick('footer', e); });
                hfLayer.appendChild(head);
                hfLayer.appendChild(foot);
            }
            head.style.left = g.mL + 'px';
            head.style.width = g.contentW + 'px';
            head.style.top = (i * g.pitch + g.headerDist) + 'px';
            head.style.maxHeight = Math.max(18, g.mT - g.headerDist) + 'px';
            head.innerHTML = fieldHtml(hfFor(settings, i, 'header'), ctx);
            head.dataset.page = i;
            foot.style.left = g.mL + 'px';
            foot.style.width = g.contentW + 'px';
            foot.style.top = '';
            var fh = Math.max(18, g.mB - g.footerDist);
            foot.style.maxHeight = fh + 'px';
            foot.style.top = (i * g.pitch + g.pageH - g.footerDist - fh) + 'px';
            foot.style.height = fh + 'px';
            foot.style.display = 'flex';
            foot.style.flexDirection = 'column';
            foot.style.justifyContent = 'flex-end';
            foot.innerHTML = fieldHtml(hfFor(settings, i, 'footer'), ctx);
            foot.dataset.page = i;
        }
    }

    // -------------------------------------------------------- serialization
    /** HTML bersih dari artefak tata letak dan status UI. */
    function cleanHtml(editor) {
        var clone = editor.cloneNode(true);
        cleanNode(clone);
        return clone.innerHTML;
    }

    function cleanNode(root) {
        SO.$$('.sd-gap, tr.sd-row-gap', root).forEach(function (n) { n.remove(); });
        SO.$$('[data-sd-push]', root).forEach(function (el) {
            el.style.marginTop = el.getAttribute('data-sd-mt') || '';
            el.removeAttribute('data-sd-push');
            el.removeAttribute('data-sd-mt');
            if (el.getAttribute('style') === '') el.removeAttribute('style');
        });
        SO.$$('.is-selected, .sd-cell-sel, .is-active', root).forEach(function (el) {
            el.classList.remove('is-selected', 'sd-cell-sel', 'is-active');
            if (!el.className) el.removeAttribute('class');
        });
        // Spasi lebar-nol penahan kursor setelah elemen inline tak-tersunting.
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        var zw = [];
        var t;
        while ((t = walker.nextNode())) if (t.data.indexOf('\u200B') !== -1) zw.push(t);
        zw.forEach(function (n) { n.data = n.data.replace(/\u200B/g, ''); if (!n.data) n.remove(); });
        root.normalize();
        return root;
    }

    /**
     * Halaman cetak: tiap halaman berisi SALINAN editor yang digeser ke atas
     * sejauh halaman sebelumnya dan dipotong ke area isi. Karena tata letak
     * layar sudah menjamin isi halaman N berada di [N×pitch, N×pitch+tinggi isi],
     * hasil cetak identik dengan layar.
     */
    function buildPrintPages(host, editor, hfLayer, bgLayer, count, g, opts) {
        opts = opts || {};
        host.innerHTML = '';
        var editorStyle = getComputedStyle(editor);
        for (var i = 0; i < count; i++) {
            if (opts.pages && opts.pages.indexOf(i) === -1) continue;
            var page = document.createElement('div');
            page.className = 'sd-print-page';
            page.style.width = g.pageW + 'px';
            page.style.height = g.pageH + 'px';
            var bg = bgLayer.children[i];
            page.style.background = bg ? bg.style.background : '#fff';
            if (bg) {
                SO.$$('.sd-watermark, .sd-page-border', bg).forEach(function (n) { page.appendChild(n.cloneNode(true)); });
            }
            var clip = document.createElement('div');
            clip.style.cssText = 'position:absolute;overflow:hidden;left:' + g.mL + 'px;top:' + g.mT + 'px;width:' + g.contentW + 'px;height:' + g.contentH + 'px';
            var body = editor.cloneNode(true);
            body.removeAttribute('id');
            body.removeAttribute('contenteditable');
            body.className = 'sd-print-body';
            body.style.cssText = '--sd-content-h:' + g.contentH + 'px;left:0;top:' + (-i * g.pitch) + 'px;width:' + g.contentW + 'px;font-family:' + editorStyle.fontFamily + ';font-size:' + editorStyle.fontSize + ';line-height:' + editorStyle.lineHeight + ';color:' + editorStyle.color;
            SO.$$('.is-selected, .sd-cell-sel, .is-active', body).forEach(function (el) { el.classList.remove('is-selected', 'sd-cell-sel', 'is-active'); });
            SO.$$('.sd-page-break', body).forEach(function (el) { el.style.visibility = 'hidden'; });
            if (opts.hideComments) SO.$$('.sd-comment', body).forEach(function (el) { el.style.background = 'transparent'; el.style.borderBottom = '0'; });
            clip.appendChild(body);
            page.appendChild(clip);
            var head = hfLayer.children[i * 2], foot = hfLayer.children[i * 2 + 1];
            [head, foot].forEach(function (hf) {
                if (!hf || !hf.innerHTML.trim()) return;
                var c = hf.cloneNode(true);
                c.style.top = (parseFloat(hf.style.top) - i * g.pitch) + 'px';
                c.style.border = '0';
                page.appendChild(c);
            });
            host.appendChild(page);
        }
        return host;
    }

    global.SDLayout = {
        MM: MM, PAGE_SIZES: PAGE_SIZES, geometry: geometry,
        saveSelection: saveSelection, restoreSelection: restoreSelection,
        pointToUnits: pointToUnits, unitsToPoint: unitsToPoint,
        paginate: paginate, fitWidth: fitWidth, clearPushes: clearPushes, removeGaps: removeGaps,
        renderPages: renderPages, fieldHtml: fieldHtml, hfFor: hfFor,
        cleanHtml: cleanHtml, cleanNode: cleanNode, buildPrintPages: buildPrintPages
    };
})(window);
