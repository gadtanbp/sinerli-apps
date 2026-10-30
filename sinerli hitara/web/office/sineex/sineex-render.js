/**
 * Sinerli Hitara — penggambar kanvas lembar kerja.
 * Area dibagi empat wilayah (sudut beku, baris beku, kolom beku, utama) supaya
 * freeze pane bekerja tanpa elemen DOM tambahan.
 */
(function (global) {
    'use strict';

    var App = global.SineEX, F = global.SXF, M = global.SXM;
    var ACCENT = '#0f766e';
    var SEL_FILL = 'rgba(15, 118, 110, 0.10)';
    var GRID = '#e1e1e1';
    var HEAD_BG = '#f6f7fa', HEAD_SEL = '#dcefeb', HEAD_FULL = '#bfe2db', HEAD_LINE = '#d9dce5', HEAD_TEXT = '#4a5068';
    var REF_COLORS = ['#2F6FDE', '#D9480F', '#7B2FBF', '#0B8A6A', '#C2185B', '#B08900', '#1565C0', '#6D4C41'];
    App.REF_COLORS = REF_COLORS;

    var ctx = App.el.canvas.getContext('2d', { alpha: false });
    var dpr = 1;
    var fontCache = {};

    function fontFor(s, z) {
        var fs = (s.fs || 10) * 96 / 72 * z;
        var key = (s.i ? 'i' : '') + (s.b ? 'b' : '') + fs.toFixed(2) + (s.ff || 'Arial');
        if (!fontCache[key]) fontCache[key] = (s.i ? 'italic ' : '') + (s.b ? '700 ' : '400 ') + fs.toFixed(2) + 'px ' + SO.fontStack(s.ff || 'Arial');
        return fontCache[key];
    }
    App.fontFor = fontFor;

    function geom() {
        var sh = App.sheet();
        var z = sh.zoom;
        var sc = App.el.scroll;
        var g = {
            sh: sh, z: z, W: sc.clientWidth, H: sc.clientHeight,
            hw: App.headerW(), hh: App.headerH(),
            fc: sh.freeze.c, fr: sh.freeze.r,
            sx: sc.scrollLeft, sy: sc.scrollTop
        };
        g.fw = sh.cols.pos(g.fc) * z;
        g.fh = sh.rows.pos(g.fr) * z;
        return g;
    }
    App.geom = geom;

    /** Koordinat layar (relatif grid) kolom/baris. */
    function xOf(g, c) { return g.hw + g.sh.cols.pos(c) * g.z - (c < g.fc ? 0 : g.sx); }
    function yOf(g, r) { return g.hh + g.sh.rows.pos(r) * g.z - (r < g.fr ? 0 : g.sy); }

    App.cellRect = function (r, c, useMerge) {
        var g = geom();
        var sh = g.sh;
        var r2 = r, c2 = c;
        if (useMerge !== false) {
            var m = sh.mergeAt(r, c);
            if (m) { r = m.r1; c = m.c1; r2 = m.r2; c2 = m.c2; }
        }
        var x = xOf(g, c), y = yOf(g, r);
        return { x: x, y: y, w: (sh.cols.pos(c2 + 1) - sh.cols.pos(c)) * g.z, h: (sh.rows.pos(r2 + 1) - sh.rows.pos(r)) * g.z, g: g };
    };

    /** Rentang kolom/baris yang terlihat di satu wilayah. */
    function visible(axis, fromPx, toPx, lo, hi) {
        var out = [];
        if (hi < lo) return out;
        var i = Math.max(lo, axis.indexAt(Math.max(0, fromPx)));
        for (; i <= hi && i < axis.count; i++) {
            if (axis.pos(i) > toPx) break;
            if (axis.size(i) > 0) out.push(i);
        }
        return out;
    }

    function wrapLines(text, maxW) {
        var out = [];
        String(text).split('\n').forEach(function (para) {
            if (!para) { out.push(''); return; }
            var words = para.split(/(\s+)/);
            var line = '';
            words.forEach(function (w) {
                var test = line + w;
                if (ctx.measureText(test).width <= maxW || !line) {
                    // Kata tunggal yang lebih lebar dari sel dipotong per karakter.
                    if (!line && ctx.measureText(w).width > maxW && w.trim()) {
                        var chunk = '';
                        for (var i = 0; i < w.length; i++) {
                            if (ctx.measureText(chunk + w[i]).width > maxW && chunk) { out.push(chunk); chunk = ''; }
                            chunk += w[i];
                        }
                        line = chunk;
                    } else line = test;
                } else {
                    out.push(line.replace(/\s+$/, ''));
                    line = w.trim() ? w : '';
                }
            });
            out.push(line.replace(/\s+$/, ''));
        });
        return out;
    }
    App.wrapLines = function (text, maxW, font) { ctx.font = font; return wrapLines(text, maxW); };

    function setLine(style, color, z) {
        var w = 1;
        ctx.setLineDash([]);
        switch (style) {
            case 'medium': w = 2; break;
            case 'thick': w = 3; break;
            case 'dashed': ctx.setLineDash([4, 2]); break;
            case 'dotted': ctx.setLineDash([1, 2]); break;
            case 'hair': ctx.setLineDash([1, 1]); break;
        }
        ctx.lineWidth = Math.max(1, w * Math.min(z, 1.5));
        ctx.strokeStyle = color || '#000';
        return ctx.lineWidth;
    }

    function drawBorderSide(side, x1, y1, x2, y2, z) {
        if (!side || !side.s || side.s === 'none') return;
        var lw = setLine(side.s, side.c, z);
        var off = lw % 2 ? 0.5 : 0;
        ctx.beginPath();
        if (side.s === 'double') {
            ctx.lineWidth = 1;
            var vertical = x1 === x2;
            ctx.moveTo(Math.round(x1) + (vertical ? -1 : 0) + 0.5, Math.round(y1) + (vertical ? 0 : -1) + 0.5);
            ctx.lineTo(Math.round(x2) + (vertical ? -1 : 0) + 0.5, Math.round(y2) + (vertical ? 0 : -1) + 0.5);
            ctx.moveTo(Math.round(x1) + (vertical ? 1 : 0) + 0.5, Math.round(y1) + (vertical ? 0 : 1) + 0.5);
            ctx.lineTo(Math.round(x2) + (vertical ? 1 : 0) + 0.5, Math.round(y2) + (vertical ? 0 : 1) + 0.5);
        } else {
            ctx.moveTo(Math.round(x1) + off, Math.round(y1) + off);
            ctx.lineTo(Math.round(x2) + off, Math.round(y2) + off);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function isEmptyCell(sh, r, c) {
        var cell = sh.cell(r, c);
        if (cell && (cell.f !== undefined || (cell.v !== null && cell.v !== undefined && cell.v !== ''))) return false;
        if (sh.spillOwner.has(M.key(r, c))) return false;
        return !sh.mergeAt(r, c);
    }

    function drawRegion(g, reg) {
        var sh = g.sh, z = g.z, wb = App.wb;
        if (reg.w <= 0 || reg.h <= 0) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(reg.x0, reg.y0, reg.w, reg.h);
        ctx.clip();

        var colsV = visible(sh.cols, (reg.x0 - g.hw + reg.ox) / z, (reg.x0 + reg.w - g.hw + reg.ox) / z, reg.cLo, reg.cHi);
        var rowsV = visible(sh.rows, (reg.y0 - g.hh + reg.oy) / z, (reg.y0 + reg.h - g.hh + reg.oy) / z, reg.rLo, reg.rHi);
        if (!colsV.length || !rowsV.length) { ctx.restore(); return; }
        var X = function (c) { return g.hw + sh.cols.pos(c) * z - reg.ox; };
        var Y = function (r) { return g.hh + sh.rows.pos(r) * z - reg.oy; };
        var right = X(colsV[colsV.length - 1] + 1), bottom = Y(rowsV[rowsV.length - 1] + 1);
        var left = X(colsV[0]), top = Y(rowsV[0]);

        // 1. garis kisi
        if (sh.showGrid) {
            ctx.strokeStyle = GRID;
            ctx.lineWidth = 1;
            ctx.beginPath();
            colsV.forEach(function (c) { var x = Math.round(X(c + 1)) - 0.5; ctx.moveTo(x, top); ctx.lineTo(x, bottom); });
            rowsV.forEach(function (r) { var y = Math.round(Y(r + 1)) - 0.5; ctx.moveTo(left, y); ctx.lineTo(right, y); });
            ctx.stroke();
        }

        var cf = App.cmd.cfStyle;
        var drawnMerges = new Set();
        var cellsToText = [];
        var borders = [];

        // 2. isian latar & sel gabungan
        rowsV.forEach(function (r) {
            colsV.forEach(function (c) {
                var m = sh.merges.length ? sh.mergeAt(r, c) : null;
                var rr = r, cc = c, x, y, w, h;
                if (m) {
                    var mk = m.r1 + ':' + m.c1;
                    if (drawnMerges.has(mk)) return;
                    drawnMerges.add(mk);
                    rr = m.r1; cc = m.c1;
                    x = X(m.c1); y = Y(m.r1);
                    w = (sh.cols.pos(m.c2 + 1) - sh.cols.pos(m.c1)) * z;
                    h = (sh.rows.pos(m.r2 + 1) - sh.rows.pos(m.r1)) * z;
                } else {
                    x = X(c); y = Y(r); w = sh.cols.size(c) * z; h = sh.rows.size(r) * z;
                }
                var cell = sh.cell(rr, cc);
                var s = (cell && cell.s) || {};
                var cfs = cf ? cf(sh, rr, cc) : null;
                var bg = (cfs && cfs.bg) || s.bg;
                if (bg || m) {
                    ctx.fillStyle = bg || '#fff';
                    ctx.fillRect(Math.round(x), Math.round(y), Math.round(x + w) - Math.round(x) - (m && !bg && sh.showGrid ? 1 : 0), Math.round(y + h) - Math.round(y) - (m && !bg && sh.showGrid ? 1 : 0));
                }
                if (cfs && cfs.bar) {
                    var bw = Math.max(0, (w - 6) * cfs.bar.pct);
                    var grad = ctx.createLinearGradient(x + 3, 0, x + 3 + Math.max(bw, 1), 0);
                    grad.addColorStop(0, cfs.bar.color);
                    grad.addColorStop(1, SO.tint(cfs.bar.color, 0.7));
                    ctx.fillStyle = grad;
                    ctx.fillRect(x + 3, y + 3, bw, Math.max(0, h - 6));
                }
                cellsToText.push({ r: rr, c: cc, x: x, y: y, w: w, h: h, s: s, cell: cell, cfs: cfs, merged: !!m });
                if (s.bd) borders.push({ x: x, y: y, w: w, h: h, bd: s.bd });
            });
        });

        // 3. teks
        cellsToText.forEach(function (it) {
            var d = wb.display(sh, it.r, it.c);
            var cfs = it.cfs;
            if (cfs && cfs.icon) drawCfIcon(cfs.icon, it.x + 3 * z, it.y + it.h / 2, Math.min(11 * z, it.h - 4));
            if (!d.text) return;
            var s = cfs && (cfs.fc || cfs.b || cfs.i) ? Object.assign({}, it.s, { fc: cfs.fc || it.s.fc, b: cfs.b || it.s.b, i: cfs.i || it.s.i }) : it.s;
            ctx.font = fontFor(s, z);
            var color = d.color || s.fc || (it.cell && it.cell.link ? '#0563C1' : '#000');
            ctx.fillStyle = color;
            var pad = 3 * Math.max(z, 0.6) + (s.ind ? s.ind * 9 * z : 0);
            var iconPad = cfs && cfs.icon ? 14 * z : 0;
            // Tombol filter di baris judul memakan ruang kanan sel.
            var btnPad = sh.filter && it.r === sh.filter.r1 && it.c >= sh.filter.c1 && it.c <= sh.filter.c2 ? 18 : 0;
            var align = d.align === 'justify' ? 'left' : d.align;
            var fsPx = (s.fs || 10) * 96 / 72 * z;
            var text = d.text;
            if (s.wr || /\n/.test(text) && s.wr !== false && it.merged) {
                var lines = wrapLines(text, Math.max(4, it.w - pad * 2 - iconPad - btnPad));
                var lh = fsPx * 1.22;
                var totalH = lines.length * lh;
                var ystart = s.va === 'top' ? it.y + 2 : s.va === 'middle' || s.va === 'center' ? it.y + (it.h - totalH) / 2 : it.y + it.h - totalH - 2;
                ctx.save();
                ctx.beginPath();
                ctx.rect(it.x + 1, it.y + 1, it.w - 2, it.h - 2);
                ctx.clip();
                ctx.textBaseline = 'top';
                lines.forEach(function (ln, i) {
                    var ly = ystart + i * lh + (lh - fsPx) / 2;
                    var lx = align === 'right' ? it.x + it.w - pad - btnPad : align === 'center' ? it.x + (it.w - btnPad) / 2 : it.x + pad + iconPad;
                    ctx.textAlign = align;
                    ctx.fillText(ln, lx, ly);
                    decorate(s, ln, lx, ly + fsPx * 0.92, fsPx, align);
                });
                ctx.restore();
                return;
            }
            text = text.replace(/\n/g, ' ');
            var tw = ctx.measureText(text).width;
            var avail = it.w - pad * 2 - iconPad - btnPad;
            var clipX1 = it.x + 1, clipX2 = it.x + it.w - 1 - btnPad;
            if (tw > avail && !btnPad) {
                if (typeof d.v === 'number' && !it.merged && !(s.nf === '@')) {
                    var hashes = Math.max(1, Math.floor(avail / Math.max(1, ctx.measureText('#').width)));
                    text = '#'.repeat(hashes);
                    tw = ctx.measureText(text).width;
                } else if (!it.merged) {
                    // Teks meluap ke sel kosong di sebelahnya.
                    if (align === 'left' || align === 'center') {
                        var cc2 = it.c + 1, need = align === 'center' ? (tw - avail) / 2 : tw - avail;
                        while (need > 0 && cc2 < sh.cols.count && isEmptyCell(sh, it.r, cc2) && cc2 < it.c + 40) {
                            need -= sh.cols.size(cc2) * z;
                            clipX2 = X(cc2 + 1) - 1;
                            cc2++;
                        }
                    }
                    if (align === 'right' || align === 'center') {
                        var cc3 = it.c - 1, need2 = align === 'center' ? (tw - avail) / 2 : tw - avail;
                        while (need2 > 0 && cc3 >= 0 && isEmptyCell(sh, it.r, cc3) && cc3 > it.c - 40) {
                            need2 -= sh.cols.size(cc3) * z;
                            clipX1 = X(cc3) + 1;
                            cc3--;
                        }
                    }
                }
            }
            var tx = align === 'right' ? it.x + it.w - pad - btnPad : align === 'center' ? it.x + (it.w - btnPad) / 2 : it.x + pad + iconPad;
            if (btnPad && align === 'center' && tw > avail) { ctx.textAlign = 'left'; tx = it.x + pad; align = 'left'; }
            var ty;
            ctx.textAlign = align;
            if (s.va === 'top') { ctx.textBaseline = 'top'; ty = it.y + 3 * z; }
            else if (s.va === 'middle' || s.va === 'center') { ctx.textBaseline = 'middle'; ty = it.y + it.h / 2 + 0.5; }
            else { ctx.textBaseline = 'alphabetic'; ty = it.y + it.h - Math.max(3, 4 * z); }
            ctx.save();
            ctx.beginPath();
            ctx.rect(clipX1, it.y, clipX2 - clipX1, it.h);
            ctx.clip();
            ctx.fillText(text, tx, ty);
            var baseY = s.va === 'top' ? ty + fsPx * 0.92 : (s.va === 'middle' || s.va === 'center') ? ty + fsPx * 0.42 : ty + 1;
            decorate(s, text, tx, baseY, fsPx, align, it.cell && it.cell.link && !s.fc);
            ctx.restore();
        });

        // 4. garis tepi
        borders.forEach(function (b) {
            drawBorderSide(b.bd.t, b.x, b.y, b.x + b.w, b.y, z);
            drawBorderSide(b.bd.b, b.x, b.y + b.h - 1, b.x + b.w, b.y + b.h - 1, z);
            drawBorderSide(b.bd.l, b.x, b.y, b.x, b.y + b.h, z);
            drawBorderSide(b.bd.r, b.x + b.w - 1, b.y, b.x + b.w - 1, b.y + b.h, z);
        });

        // 5. penanda catatan & tumpahan
        cellsToText.forEach(function (it) {
            if (it.cell && it.cell.note) {
                ctx.fillStyle = '#D83B01';
                ctx.beginPath();
                ctx.moveTo(it.x + it.w - 7, it.y + 1);
                ctx.lineTo(it.x + it.w - 1, it.y + 1);
                ctx.lineTo(it.x + it.w - 1, it.y + 7);
                ctx.fill();
            }
        });
        var a = App.sel.active;
        var ownerK = sh.spill.has(M.key(a.r, a.c)) ? M.key(a.r, a.c) : sh.spillOwner.get(M.key(a.r, a.c));
        if (ownerK !== undefined && sh.spill.get(ownerK) && !sh.spill.get(ownerK).blocked) {
            var sp = sh.spill.get(ownerK);
            ctx.setLineDash([3, 2]);
            ctx.strokeStyle = '#2F6FDE';
            ctx.lineWidth = 1;
            ctx.strokeRect(Math.round(X(sp.c)) + 0.5, Math.round(Y(sp.r)) + 0.5, (sh.cols.pos(sp.c + sp.w) - sh.cols.pos(sp.c)) * z - 1, (sh.rows.pos(sp.r + sp.h) - sh.rows.pos(sp.r)) * z - 1);
            ctx.setLineDash([]);
        }

        drawSelection(g, reg, X, Y);
        ctx.restore();
    }

    /** Ikon set format bersyarat digambar sebagai vektor agar tajam di semua zoom. */
    function drawCfIcon(icon, x, cy, size) {
        var r = size / 2, cx = x + r;
        ctx.save();
        ctx.fillStyle = icon.color;
        ctx.strokeStyle = icon.color;
        ctx.lineWidth = Math.max(1, size / 10);
        ctx.beginPath();
        switch (icon.ch) {
            case '▲': ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r * 0.8); ctx.lineTo(cx - r, cy + r * 0.8); ctx.closePath(); ctx.fill(); break;
            case '▼': ctx.moveTo(cx - r, cy - r * 0.8); ctx.lineTo(cx + r, cy - r * 0.8); ctx.lineTo(cx, cy + r); ctx.closePath(); ctx.fill(); break;
            case '►': ctx.moveTo(cx - r * 0.8, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx - r * 0.8, cy + r); ctx.closePath(); ctx.fill(); break;
            case '★': case '☆':
                for (var i = 0; i < 10; i++) {
                    var ang = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
                    ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
                }
                ctx.closePath();
                if (icon.ch === '★') ctx.fill(); else ctx.stroke();
                break;
            case '⚑':
                ctx.fillRect(cx - r * 0.7, cy - r, Math.max(1, size / 9), size);
                ctx.moveTo(cx - r * 0.6, cy - r); ctx.lineTo(cx + r, cy - r * 0.45); ctx.lineTo(cx - r * 0.6, cy + r * 0.1); ctx.closePath(); ctx.fill();
                break;
            default: ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }

    function decorate(s, text, x, y, fsPx, align, isLink) {
        if (!s.u && !s.st && !isLink) return;
        var w = ctx.measureText(text).width;
        var x1 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = Math.max(1, fsPx / 14);
        ctx.beginPath();
        if (s.u || isLink) {
            var uy = Math.round(y + 1) + 0.5;
            ctx.moveTo(x1, uy); ctx.lineTo(x1 + w, uy);
            if (s.u === 'double') { ctx.moveTo(x1, uy + 2); ctx.lineTo(x1 + w, uy + 2); }
        }
        if (s.st) { var sy = Math.round(y - fsPx * 0.32) + 0.5; ctx.moveTo(x1, sy); ctx.lineTo(x1 + w, sy); }
        ctx.stroke();
        ctx.restore();
    }

    function rangeScreen(g, rg, X, Y) {
        var sh = g.sh;
        var r2 = Math.min(rg.r2, sh.rows.count - 1), c2 = Math.min(rg.c2, sh.cols.count - 1);
        return { x: X(rg.c1), y: Y(rg.r1), w: (sh.cols.pos(c2 + 1) - sh.cols.pos(rg.c1)) * g.z, h: (sh.rows.pos(r2 + 1) - sh.rows.pos(rg.r1)) * g.z };
    }

    function drawSelection(g, reg, X, Y) {
        var sh = g.sh, z = g.z;
        var sel = App.sel;
        // Rujukan berwarna saat mengedit rumus.
        (App.editRefs || []).forEach(function (ref) {
            if (ref.sheetId !== undefined && ref.sheetId !== sh.id) return;
            var rs = rangeScreen(g, ref, X, Y);
            ctx.fillStyle = ref.color + '1f';
            ctx.fillRect(rs.x, rs.y, rs.w, rs.h);
            ctx.strokeStyle = ref.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(rs.x + 1, rs.y + 1, rs.w - 2, rs.h - 2);
        });
        if (App.editing && App.editing.sheetId !== sh.id) return;
        sel.ranges.forEach(function (rg, i) {
            var rs = rangeScreen(g, rg, X, Y);
            var single = rg.r1 === rg.r2 && rg.c1 === rg.c2 || (function () { var m = sh.mergeAt(rg.r1, rg.c1); return m && m.r1 === rg.r1 && m.c1 === rg.c1 && m.r2 === rg.r2 && m.c2 === rg.c2; })();
            if (!single || sel.ranges.length > 1) {
                ctx.fillStyle = SEL_FILL;
                ctx.fillRect(rs.x, rs.y, rs.w, rs.h);
            }
            if (i === sel.ranges.length - 1) {
                // Sel aktif tetap putih di dalam seleksi.
                if (!single || sel.ranges.length > 1) {
                    redrawActiveCell(g, App.cellRectIn(g, sel.active.r, sel.active.c, X, Y));
                }
                ctx.strokeStyle = ACCENT;
                ctx.lineWidth = 2;
                ctx.strokeRect(Math.round(rs.x), Math.round(rs.y), Math.round(rs.w) - 1, Math.round(rs.h) - 1);
                if (!App.editing) {
                    ctx.fillStyle = ACCENT;
                    ctx.fillRect(Math.round(rs.x + rs.w) - 4, Math.round(rs.y + rs.h) - 4, 6, 6);
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(Math.round(rs.x + rs.w) - 5, Math.round(rs.y + rs.h) - 5, 1, 7);
                    ctx.fillRect(Math.round(rs.x + rs.w) - 5, Math.round(rs.y + rs.h) - 5, 7, 1);
                }
            } else {
                ctx.strokeStyle = ACCENT;
                ctx.lineWidth = 1;
                ctx.strokeRect(Math.round(rs.x) + 0.5, Math.round(rs.y) + 0.5, Math.round(rs.w) - 1, Math.round(rs.h) - 1);
            }
        });
        if (App.fillPreview) {
            var fp = rangeScreen(g, App.fillPreview, X, Y);
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 1;
            ctx.strokeRect(Math.round(fp.x) + 0.5, Math.round(fp.y) + 0.5, Math.round(fp.w) - 1, Math.round(fp.h) - 1);
            ctx.setLineDash([]);
        }
        if (App.clipboard && App.clipboard.sheetId === sh.id && App.clipboard.marquee) {
            var cb = rangeScreen(g, App.clipboard.range, X, Y);
            ctx.setLineDash([5, 3]);
            ctx.lineDashOffset = -App.marchOffset || 0;
            ctx.strokeStyle = ACCENT;
            ctx.lineWidth = 2;
            ctx.strokeRect(Math.round(cb.x) + 1, Math.round(cb.y) + 1, Math.round(cb.w) - 2, Math.round(cb.h) - 2);
            ctx.setLineDash([]);
            ctx.lineDashOffset = 0;
        }
    }

    App.cellRectIn = function (g, r, c, X, Y) {
        var sh = g.sh;
        var m = sh.mergeAt(r, c);
        var r1 = r, c1 = c, r2 = r, c2 = c;
        if (m) { r1 = m.r1; c1 = m.c1; r2 = m.r2; c2 = m.c2; }
        return { r: r1, c: c1, x: X(c1), y: Y(r1), w: (sh.cols.pos(c2 + 1) - sh.cols.pos(c1)) * g.z, h: (sh.rows.pos(r2 + 1) - sh.rows.pos(r1)) * g.z };
    };

    /** Menggambar ulang sel aktif di atas arsiran seleksi. */
    function redrawActiveCell(g, ar) {
        var sh = g.sh;
        var cell = sh.cell(ar.r, ar.c);
        var s = (cell && cell.s) || {};
        var cfs = App.cmd.cfStyle ? App.cmd.cfStyle(sh, ar.r, ar.c) : null;
        ctx.save();
        ctx.beginPath();
        ctx.rect(ar.x, ar.y, ar.w, ar.h);
        ctx.clip();
        ctx.fillStyle = (cfs && cfs.bg) || s.bg || '#fff';
        ctx.fillRect(ar.x, ar.y, ar.w, ar.h);
        var d = App.wb.display(sh, ar.r, ar.c);
        if (d.text) {
            var st = cfs && (cfs.fc || cfs.b) ? Object.assign({}, s, { fc: cfs.fc || s.fc, b: cfs.b || s.b }) : s;
            ctx.font = fontFor(st, g.z);
            ctx.fillStyle = d.color || st.fc || '#000';
            var pad = 3 * Math.max(g.z, 0.6);
            var align = d.align === 'justify' ? 'left' : d.align;
            ctx.textAlign = align;
            if (st.wr) {
                var fsPx = (st.fs || 10) * 96 / 72 * g.z;
                var lines = wrapLines(d.text, Math.max(4, ar.w - pad * 2));
                ctx.textBaseline = 'top';
                var lh = fsPx * 1.22;
                var y0 = st.va === 'top' ? ar.y + 2 : st.va === 'middle' ? ar.y + (ar.h - lines.length * lh) / 2 : ar.y + ar.h - lines.length * lh - 2;
                lines.forEach(function (ln, i) { ctx.fillText(ln, align === 'right' ? ar.x + ar.w - pad : align === 'center' ? ar.x + ar.w / 2 : ar.x + pad, y0 + i * lh); });
            } else {
                if (st.va === 'top') ctx.textBaseline = 'top';
                else if (st.va === 'middle') ctx.textBaseline = 'middle';
                else ctx.textBaseline = 'alphabetic';
                var ty = st.va === 'top' ? ar.y + 3 : st.va === 'middle' ? ar.y + ar.h / 2 : ar.y + ar.h - Math.max(3, 4 * g.z);
                ctx.fillText(d.text, align === 'right' ? ar.x + ar.w - pad : align === 'center' ? ar.x + ar.w / 2 : ar.x + pad, ty);
            }
        }
        ctx.restore();
        if (s.bd) {
            drawBorderSide(s.bd.t, ar.x, ar.y, ar.x + ar.w, ar.y, g.z);
            drawBorderSide(s.bd.b, ar.x, ar.y + ar.h - 1, ar.x + ar.w, ar.y + ar.h - 1, g.z);
            drawBorderSide(s.bd.l, ar.x, ar.y, ar.x, ar.y + ar.h, g.z);
            drawBorderSide(s.bd.r, ar.x + ar.w - 1, ar.y, ar.x + ar.w - 1, ar.y + ar.h, g.z);
        }
    }

    function inAnySel(axis, i) {
        var full = false, part = false;
        App.sel.ranges.forEach(function (rg) {
            if (axis === 'c' ? (i >= rg.c1 && i <= rg.c2) : (i >= rg.r1 && i <= rg.r2)) {
                part = true;
                if (axis === 'c' ? (rg.r1 === 0 && rg.r2 >= F.MAX_ROWS - 1) : (rg.c1 === 0 && rg.c2 >= F.MAX_COLS - 1)) full = true;
            }
        });
        return full ? 2 : part ? 1 : 0;
    }

    function drawHeaders(g) {
        var sh = g.sh, z = g.z;
        if (!sh.showHeaders) return;
        var fs = Math.max(9, Math.min(15, 11.5 * Math.max(0.85, Math.min(z, 1.3))));
        ctx.font = '400 ' + fs + 'px Inter, "Segoe UI", Arial, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        // kolom
        ctx.fillStyle = HEAD_BG;
        ctx.fillRect(0, 0, g.W, g.hh);
        [[0, g.fc - 1, 0], [g.fc, sh.cols.count - 1, g.sx]].forEach(function (part, pi) {
            var x0 = pi === 0 ? g.hw : g.hw + g.fw;
            var wPart = pi === 0 ? g.fw : g.W - g.hw - g.fw;
            if (wPart <= 0) return;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x0, 0, wPart, g.hh);
            ctx.clip();
            visible(sh.cols, (x0 - g.hw + part[2]) / z, (x0 + wPart - g.hw + part[2]) / z, part[0], part[1]).forEach(function (c) {
                var x = g.hw + sh.cols.pos(c) * z - part[2];
                var w = sh.cols.size(c) * z;
                var st = inAnySel('c', c);
                if (st) {
                    ctx.fillStyle = st === 2 ? HEAD_FULL : HEAD_SEL;
                    ctx.fillRect(x, 0, w, g.hh);
                    ctx.fillStyle = ACCENT;
                    ctx.fillRect(x, g.hh - 2, w, 2);
                }
                ctx.fillStyle = st ? '#115e59' : HEAD_TEXT;
                if (w > 14) ctx.fillText(F.colName(c), x + w / 2, g.hh / 2 + 0.5);
                ctx.fillStyle = HEAD_LINE;
                ctx.fillRect(Math.round(x + w) - 1, 3, 1, g.hh - 6);
                if (sh.cols.hidden[c + 1] && c + 1 < sh.cols.count) {
                    ctx.fillStyle = '#888';
                    ctx.fillRect(Math.round(x + w) - 2, 0, 3, g.hh);
                }
            });
            ctx.restore();
        });
        ctx.fillStyle = HEAD_LINE;
        ctx.fillRect(0, g.hh - 1, g.W, 1);
        // baris
        ctx.fillStyle = HEAD_BG;
        ctx.fillRect(0, g.hh, g.hw, g.H - g.hh);
        [[0, g.fr - 1, 0], [g.fr, sh.rows.count - 1, g.sy]].forEach(function (part, pi) {
            var y0 = pi === 0 ? g.hh : g.hh + g.fh;
            var hPart = pi === 0 ? g.fh : g.H - g.hh - g.fh;
            if (hPart <= 0) return;
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, y0, g.hw, hPart);
            ctx.clip();
            visible(sh.rows, (y0 - g.hh + part[2]) / z, (y0 + hPart - g.hh + part[2]) / z, part[0], part[1]).forEach(function (r) {
                var y = g.hh + sh.rows.pos(r) * z - part[2];
                var h = sh.rows.size(r) * z;
                var st = inAnySel('r', r);
                if (st) {
                    ctx.fillStyle = st === 2 ? HEAD_FULL : HEAD_SEL;
                    ctx.fillRect(0, y, g.hw, h);
                    ctx.fillStyle = ACCENT;
                    ctx.fillRect(g.hw - 2, y, 2, h);
                }
                ctx.fillStyle = sh.rows.filtered[r - 0] ? '#0B5CAD' : st ? '#115e59' : HEAD_TEXT;
                if (h > 9) ctx.fillText(String(r + 1), g.hw / 2, y + h / 2 + 0.5);
                ctx.fillStyle = HEAD_LINE;
                ctx.fillRect(3, Math.round(y + h) - 1, g.hw - 6, 1);
                if (sh.rows.isHidden(r + 1) && r + 1 < sh.rows.count) {
                    ctx.fillStyle = '#888';
                    ctx.fillRect(0, Math.round(y + h) - 2, g.hw, 3);
                }
            });
            ctx.restore();
        });
        ctx.fillStyle = HEAD_LINE;
        ctx.fillRect(g.hw - 1, 0, 1, g.H);
        // sudut
        ctx.fillStyle = HEAD_BG;
        ctx.fillRect(0, 0, g.hw - 1, g.hh - 1);
        ctx.fillStyle = '#b9b9b9';
        ctx.beginPath();
        ctx.moveTo(g.hw - 5, g.hh - 14);
        ctx.lineTo(g.hw - 5, g.hh - 5);
        ctx.lineTo(g.hw - 14, g.hh - 5);
        ctx.fill();
    }

    App.draw = function () {
        if (!App.wb) return;
        var g = geom();
        var cv = App.el.canvas;
        var ndpr = global.devicePixelRatio || 1;
        var cw = Math.max(1, Math.round(g.W * ndpr)), ch = Math.max(1, Math.round(g.H * ndpr));
        if (cv.width !== cw || cv.height !== ch || dpr !== ndpr) {
            dpr = ndpr;
            cv.width = cw;
            cv.height = ch;
            cv.style.width = g.W + 'px';
            cv.style.height = g.H + 'px';
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, g.W, g.H);
        var sh = g.sh;
        var lastC = sh.cols.count - 1, lastR = sh.rows.count - 1;
        var regions = [
            { x0: g.hw, y0: g.hh, w: g.fw, h: g.fh, ox: 0, oy: 0, cLo: 0, cHi: g.fc - 1, rLo: 0, rHi: g.fr - 1 },
            { x0: g.hw + g.fw, y0: g.hh, w: g.W - g.hw - g.fw, h: g.fh, ox: g.sx, oy: 0, cLo: g.fc, cHi: lastC, rLo: 0, rHi: g.fr - 1 },
            { x0: g.hw, y0: g.hh + g.fh, w: g.fw, h: g.H - g.hh - g.fh, ox: 0, oy: g.sy, cLo: 0, cHi: g.fc - 1, rLo: g.fr, rHi: lastR },
            { x0: g.hw + g.fw, y0: g.hh + g.fh, w: g.W - g.hw - g.fw, h: g.H - g.hh - g.fh, ox: g.sx, oy: g.sy, cLo: g.fc, cHi: lastC, rLo: g.fr, rHi: lastR }
        ];
        regions.forEach(function (reg) { drawRegion(g, reg); });
        // Garis beku.
        ctx.fillStyle = '#9e9e9e';
        if (g.fc > 0) ctx.fillRect(Math.round(g.hw + g.fw) - 1, g.hh, 1.5, g.H - g.hh);
        if (g.fr > 0) ctx.fillRect(g.hw, Math.round(g.hh + g.fh) - 1, g.W - g.hw, 1.5);
        drawHeaders(g);
        // Area di luar batas lembar.
        var endX = g.hw + sh.cols.total() * g.z - g.sx;
        if (endX < g.W) { ctx.fillStyle = '#ececec'; ctx.fillRect(Math.max(g.hw, endX), g.hh, g.W - endX, g.H - g.hh); }
    };

    /** Hit test koordinat relatif elemen grid. */
    App.hitTest = function (x, y) {
        var g = geom();
        var sh = g.sh, z = g.z;
        var res = { x: x, y: y };
        var sxp = x < g.hw + g.fw ? (x - g.hw) / z : (x - g.hw + g.sx) / z;
        var syp = y < g.hh + g.fh ? (y - g.hh) / z : (y - g.hh + g.sy) / z;
        res.c = SO.clamp(sh.cols.indexAt(Math.max(0, sxp)), 0, sh.cols.count - 1);
        res.r = SO.clamp(sh.rows.indexAt(Math.max(0, syp)), 0, sh.rows.count - 1);
        if (x < g.hw && y < g.hh) { res.area = 'corner'; return res; }
        if (y < g.hh) {
            res.area = 'colhead';
            // Batas ubah ukuran kolom (±4px).
            var cx = xOf(g, res.c);
            var cw = sh.cols.size(res.c) * z;
            if (x > cx + cw - 5) res.resizeCol = res.c;
            else if (x < cx + 4 && res.c > 0) {
                var p = res.c - 1;
                while (p > 0 && sh.cols.size(p) === 0) p--;
                res.resizeCol = p;
            }
            return res;
        }
        if (x < g.hw) {
            res.area = 'rowhead';
            var ry = yOf(g, res.r);
            var rh = sh.rows.size(res.r) * z;
            if (y > ry + rh - 4) res.resizeRow = res.r;
            else if (y < ry + 3 && res.r > 0) {
                var q = res.r - 1;
                while (q > 0 && sh.rows.size(q) === 0) q--;
                res.resizeRow = q;
            }
            return res;
        }
        res.area = 'cell';
        // Pegangan isian di sudut kanan bawah seleksi.
        var rg = App.selRange();
        var bx = xOf(g, Math.min(rg.c2 + 1, sh.cols.count)), by = yOf(g, Math.min(rg.r2 + 1, sh.rows.count));
        if (Math.abs(x - bx) <= 5 && Math.abs(y - by) <= 5 && App.sel.ranges.length === 1) res.fillHandle = true;
        return res;
    };
})(window);
