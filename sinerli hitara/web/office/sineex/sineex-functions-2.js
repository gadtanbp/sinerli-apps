/**
 * Sinerli Hitara — pustaka fungsi bagian 2: LET/LAMBDA, larik dinamis (TAKE, VSTACK, …),
 * statistik & distribusi, teknik, keuangan lanjutan, regex, dan metadata sintaks
 * untuk semua fungsi. Konvensi sama dengan sineex-functions.js.
 */
(function (root) {
    'use strict';

    var F = (typeof module !== 'undefined' && module.exports) ? require('./sineex-functions.js') : root.SXF;
    var E = F.E, XErr = F.XErr, Arr = F.Arr, RangeRef = F.RangeRef, Lambda = F.Lambda;
    var toNum = F.toNum, toStr = F.toStr, toBool = F.toBool;

    function def(names, fn, opts) {
        names.split(',').forEach(function (n) { F.FN[n.trim()] = Object.assign({ fn: fn }, opts || {}); });
    }
    function S(v, ctx) { return F.scalar(v, ctx); }
    function num(v, ctx) { var x = S(v, ctx); if (x instanceof XErr) throw x; return toNum(x); }
    function str(v, ctx) { var x = S(v, ctx); if (x instanceof XErr) throw x; return toStr(x); }
    function bool(v, ctx) { var x = S(v, ctx); if (x instanceof XErr) throw x; return toBool(x); }
    function has(args, i) { return i < args.length && args[i] !== null && args[i] !== undefined; }
    function opt(args, i, dflt, ctx, conv) { return has(args, i) ? (conv ? conv(args[i], ctx) : S(args[i], ctx)) : dflt; }
    function grid(v, ctx) {
        if (v instanceof RangeRef) return ctx.rangeValues(v);
        if (v instanceof Arr) return v.rows;
        if (v instanceof XErr) throw v;
        return [[v]];
    }
    function flat(v, ctx) { var out = []; grid(v, ctx).forEach(function (row) { row.forEach(function (x) { out.push(x); }); }); return out; }
    function nums(args, ctx) { return F.collect(args, ctx); }
    function arr(rows) { if (!rows.length || !rows[0].length) throw E.CALC; return new Arr(rows); }
    function transpose(g) { return g[0].map(function (_, c) { return g.map(function (row) { return row[c]; }); }); }
    function sum(v) { return v.reduce(function (s, x) { return s + x; }, 0); }
    function mean(v) { if (!v.length) throw E.DIV0; return sum(v) / v.length; }
    function lambdaArg(v) { if (!(v instanceof Lambda)) throw E.VALUE; return v; }
    /** Hasil LAMBDA per elemen harus skalar (larik bersarang → #CALC!). */
    function lambdaScalar(res, ctx) {
        if (res instanceof RangeRef) { if (res.h() !== 1 || res.w() !== 1) throw E.CALC; return S(res, ctx); }
        if (res instanceof Arr) { if (res.h() !== 1 || res.w() !== 1) throw E.CALC; return res.get(0, 0); }
        if (res instanceof Lambda) throw E.CALC;
        return res === undefined ? null : res;
    }

    // ================================================== LET, LAMBDA & kawan
    def('LET', function (nodes, ctx) {
        if (nodes.length < 3 || nodes.length % 2 === 0) throw E.VALUE;
        var child = Object.create(ctx);
        child.vars = Object.assign({}, ctx.vars || {});
        child.omitted = Object.assign({}, ctx.omitted || {});
        for (var i = 0; i + 1 < nodes.length; i += 2) {
            if (nodes[i].type !== 'name') throw E.NAME;
            var key = nodes[i].v.toUpperCase();
            child.vars[key] = F.evaluate(nodes[i + 1], child);
            child.omitted[key] = false;
        }
        return F.evaluate(nodes[nodes.length - 1], child);
    }, { lazy: true, min: 3 });
    def('LAMBDA', function (nodes, ctx) {
        var params = nodes.slice(0, -1).map(function (n) {
            if (n.type !== 'name') throw E.VALUE;
            return n.v.toUpperCase();
        });
        return new Lambda(params, nodes[nodes.length - 1], ctx);
    }, { lazy: true, min: 1 });
    def('ISOMITTED', function (nodes, ctx) {
        var n = nodes[0];
        return n.type === 'name' && !!(ctx.omitted && ctx.omitted[n.v.toUpperCase()]);
    }, { lazy: true, min: 1, max: 1 });
    def('BYROW', function (a, ctx) {
        var g = grid(a[0], ctx), fn = lambdaArg(a[1]);
        return arr(g.map(function (row) { return [lambdaScalar(fn.invoke([new Arr([row])]), ctx)]; }));
    }, { min: 2, max: 2 });
    def('BYCOL', function (a, ctx) {
        var g = grid(a[0], ctx), fn = lambdaArg(a[1]);
        return arr([g[0].map(function (_, c) { return lambdaScalar(fn.invoke([new Arr(g.map(function (row) { return [row[c]]; }))]), ctx); })]);
    }, { min: 2, max: 2 });
    def('MAP', function (a, ctx) {
        var fn = lambdaArg(a[a.length - 1]);
        var grids = a.slice(0, -1).map(function (x) { return grid(x, ctx); });
        if (!grids.length) throw E.VALUE;
        var h = grids[0].length, w = grids[0][0].length;
        return arr(grids[0].map(function (row, r) {
            return row.map(function (_, c) {
                return lambdaScalar(fn.invoke(grids.map(function (g) { return g[r] && g[r][c] !== undefined ? g[r][c] : E.NA; })), ctx);
            });
        }).slice(0, h).map(function (row) { return row.slice(0, w); }));
    }, { min: 2 });
    def('REDUCE', function (a, ctx) {
        var acc = has(a, 0) ? S(a[0], ctx) : 0;
        var fn = lambdaArg(a[2]);
        flat(a[1], ctx).forEach(function (v) { acc = fn.invoke([acc, v]); if (acc instanceof RangeRef) acc = acc.h() === 1 && acc.w() === 1 ? S(acc, ctx) : new Arr(ctx.rangeValues(acc)); });
        return acc;
    }, { min: 3, max: 3 });
    def('SCAN', function (a, ctx) {
        var acc = has(a, 0) ? S(a[0], ctx) : 0;
        var fn = lambdaArg(a[2]);
        return arr(grid(a[1], ctx).map(function (row) {
            return row.map(function (v) { acc = lambdaScalar(fn.invoke([acc, v]), ctx); return acc; });
        }));
    }, { min: 3, max: 3 });
    def('MAKEARRAY', function (a, ctx) {
        var rows = Math.floor(num(a[0], ctx)), cols = Math.floor(num(a[1], ctx)), fn = lambdaArg(a[2]);
        if (rows < 1 || cols < 1 || rows * cols > 1000000) throw E.VALUE;
        var out = [];
        for (var r = 0; r < rows; r++) { out.push([]); for (var c = 0; c < cols; c++) out[r].push(lambdaScalar(fn.invoke([r + 1, c + 1]), ctx)); }
        return new Arr(out);
    }, { min: 3, max: 3 });

    // ==================================================== larik dinamis
    function pickIndex(i, n) {
        i = Math.trunc(i);
        if (i === 0 || Math.abs(i) > n) throw E.VALUE;
        return i > 0 ? i - 1 : n + i;
    }
    def('CHOOSECOLS', function (a, ctx) {
        var g = grid(a[0], ctx), w = g[0].length;
        var idx = [];
        a.slice(1).forEach(function (x) { flat(x, ctx).forEach(function (v) { idx.push(pickIndex(toNum(v), w)); }); });
        return arr(g.map(function (row) { return idx.map(function (c) { return row[c]; }); }));
    }, { min: 2 });
    def('CHOOSEROWS', function (a, ctx) {
        var g = grid(a[0], ctx), h = g.length;
        var out = [];
        a.slice(1).forEach(function (x) { flat(x, ctx).forEach(function (v) { out.push(g[pickIndex(toNum(v), h)]); }); });
        return arr(out);
    }, { min: 2 });
    function sliceAxis(list, n, take) {
        n = Math.trunc(n);
        if (take) return n >= 0 ? list.slice(0, n) : list.slice(Math.max(0, list.length + n));
        return n >= 0 ? list.slice(n) : list.slice(0, Math.max(0, list.length + n));
    }
    function takeDrop(take) {
        return function (a, ctx) {
            var g = grid(a[0], ctx);
            if (has(a, 1)) g = sliceAxis(g, num(a[1], ctx), take);
            if (has(a, 2)) { var n = num(a[2], ctx); g = g.map(function (row) { return sliceAxis(row, n, take); }); }
            return arr(g);
        };
    }
    def('TAKE', takeDrop(true), { min: 2, max: 3 });
    def('DROP', takeDrop(false), { min: 2, max: 3 });
    def('VSTACK', function (a, ctx) {
        var gs = a.map(function (x) { return grid(x, ctx); });
        var w = Math.max.apply(null, gs.map(function (g) { return g[0].length; }));
        var out = [];
        gs.forEach(function (g) { g.forEach(function (row) { var r = row.slice(); while (r.length < w) r.push(E.NA); out.push(r); }); });
        return arr(out);
    }, { min: 1 });
    def('HSTACK', function (a, ctx) {
        var gs = a.map(function (x) { return grid(x, ctx); });
        var h = Math.max.apply(null, gs.map(function (g) { return g.length; }));
        var out = [];
        for (var r = 0; r < h; r++) {
            var row = [];
            gs.forEach(function (g) { var w = g[0].length; for (var c = 0; c < w; c++) row.push(g[r] ? g[r][c] : E.NA); });
            out.push(row);
        }
        return arr(out);
    }, { min: 1 });
    function toVector(a, ctx) {
        var g = grid(a[0], ctx), ignore = Math.floor(opt(a, 1, 0, ctx, num)), byCol = opt(a, 2, false, ctx, bool);
        if (byCol) g = transpose(g);
        var out = [];
        g.forEach(function (row) {
            row.forEach(function (v) {
                if ((ignore & 1) && (v === null || v === undefined || v === '')) return;
                if ((ignore & 2) && v instanceof XErr) return;
                out.push(v === undefined ? null : v);
            });
        });
        if (!out.length) throw E.CALC;
        return out;
    }
    def('TOCOL', function (a, ctx) { return new Arr(toVector(a, ctx).map(function (v) { return [v]; })); }, { min: 1, max: 3 });
    def('TOROW', function (a, ctx) { return new Arr([toVector(a, ctx)]); }, { min: 1, max: 3 });
    function wrap(byRows) {
        return function (a, ctx) {
            var g = grid(a[0], ctx);
            if (g.length !== 1 && g[0].length !== 1) throw E.VALUE;
            var v = flat(a[0], ctx), n = Math.floor(num(a[1], ctx)), pad = has(a, 2) ? S(a[2], ctx) : E.NA;
            if (n < 1) throw E.NUM;
            // Setiap potongan diisi sampai n; n raksasa = loop pengisian tak berujung.
            if (Math.ceil(v.length / n) * n > 1000000) throw E.NUM;
            var out = [];
            for (var i = 0; i < v.length; i += n) { var chunk = v.slice(i, i + n); while (chunk.length < n) chunk.push(pad); out.push(chunk); }
            return arr(byRows ? out : transpose(out));
        };
    }
    def('WRAPROWS', wrap(true), { min: 2, max: 3 });
    def('WRAPCOLS', wrap(false), { min: 2, max: 3 });
    def('EXPAND', function (a, ctx) {
        var g = grid(a[0], ctx);
        var h = has(a, 1) ? Math.floor(num(a[1], ctx)) : g.length, w = has(a, 2) ? Math.floor(num(a[2], ctx)) : g[0].length;
        if (h < g.length || w < g[0].length) throw E.VALUE;
        if (h * w > 1000000) throw E.VALUE; // =EXPAND(A1;1E7;1E7) dulu = 10¹⁴ iterasi
        var pad = has(a, 3) ? S(a[3], ctx) : E.NA;
        var out = [];
        for (var r = 0; r < h; r++) { out.push([]); for (var c = 0; c < w; c++) out[r].push(g[r] && c < g[r].length ? g[r][c] : pad); }
        return arr(out);
    }, { min: 2, max: 4 });
    def('SORTBY', function (a, ctx) {
        var g = grid(a[0], ctx);
        var keys = [];
        for (var i = 1; i < a.length; i += 2) {
            var kv = flat(a[i], ctx);
            if (kv.length !== g.length) throw E.VALUE;
            keys.push({ v: kv, order: has(a, i + 1) ? num(a[i + 1], ctx) : 1 });
        }
        var idx = g.map(function (_, r) { return r; });
        idx.sort(function (x, y) {
            for (var k = 0; k < keys.length; k++) {
                var p = keys[k].v[x], q = keys[k].v[y];
                if (p === null && q === null) continue;
                if (p === null) return 1;
                if (q === null) return -1;
                var c = F.compare('<', p, q) ? -1 : F.compare('>', p, q) ? 1 : 0;
                if (c) return keys[k].order < 0 ? -c : c;
            }
            return x - y;
        });
        return arr(idx.map(function (r) { return g[r]; }));
    }, { min: 2 });
    def('FREQUENCY', function (a, ctx) {
        var data = nums([a[0]], ctx);
        var bins = nums([a[1]], ctx);
        var order = bins.map(function (b, i) { return i; }).sort(function (x, y) { return bins[x] - bins[y]; });
        var counts = bins.map(function () { return 0; }).concat([0]);
        data.forEach(function (d) {
            for (var k = 0; k < order.length; k++) if (d <= bins[order[k]]) { counts[order[k]]++; return; }
            counts[bins.length]++;
        });
        return new Arr(counts.map(function (n) { return [n]; }));
    }, { min: 2, max: 2 });

    // ======================================================== informasi
    def('FORMULATEXT', function (a, ctx) {
        if (!(a[0] instanceof RangeRef)) throw E.NA;
        var t = ctx.formulaText ? ctx.formulaText(a[0].sheetId, a[0].r1, a[0].c1) : null;
        if (t === null) throw E.NA;
        return t;
    }, { min: 1, max: 1 });
    def('SHEET', function (a, ctx) {
        if (!ctx.sheetIndex) throw E.NA;
        if (!has(a, 0)) return ctx.sheetIndex(ctx.sheetId);
        if (a[0] instanceof RangeRef) return ctx.sheetIndex(a[0].sheetId);
        var sid = ctx.sheetByName(str(a[0], ctx));
        if (sid === null || sid === undefined) throw E.NA;
        return ctx.sheetIndex(sid);
    }, { max: 1 });
    def('SHEETS', function (a, ctx) { return ctx.sheetCount ? (has(a, 0) ? 1 : ctx.sheetCount()) : 1; }, { max: 1 });

    // ========================================================= tanggal
    function serialArg(v, ctx) {
        var x = S(v, ctx);
        if (x instanceof XErr) throw x;
        if (typeof x === 'string') { var d = F.parseDateText(x); if (d === null) throw E.VALUE; return Math.floor(d); }
        var n = toNum(x);
        if (n < 0) throw E.NUM;
        return Math.floor(n);
    }
    /** Pola akhir pekan INTL → larik 7 boolean (Senin..Minggu). */
    function weekendMask(v, ctx) {
        if (v === null || v === undefined) return [false, false, false, false, false, true, true];
        var x = S(v, ctx);
        if (typeof x === 'string') {
            if (!/^[01]{7}$/.test(x) || x === '1111111') throw E.VALUE;
            return x.split('').map(function (ch) { return ch === '1'; });
        }
        var n = Math.floor(toNum(x));
        var mask = [false, false, false, false, false, false, false];
        if (n >= 1 && n <= 7) { mask[(n + 4) % 7] = true; mask[(n + 5) % 7] = true; }
        else if (n >= 11 && n <= 17) mask[(n - 11 + 6) % 7] = true;
        else throw E.NUM;
        return mask;
    }
    function holidays(v, ctx) {
        var set = {};
        if (v !== null && v !== undefined) flat(v, ctx).forEach(function (h) { if (typeof h === 'number') set[Math.floor(h)] = true; });
        return set;
    }
    function isWork(s, mask, hol) { var dow = F.serialToDate(s).dow; return !mask[(dow + 6) % 7] && !hol[s]; }
    def('NETWORKDAYS.INTL', function (a, ctx) {
        var s1 = serialArg(a[0], ctx), s2 = serialArg(a[1], ctx), mask = weekendMask(a[2], ctx), hol = holidays(a[3], ctx);
        var sign = 1;
        if (s1 > s2) { var t = s1; s1 = s2; s2 = t; sign = -1; }
        if (s2 - s1 > 100000) throw E.NUM;
        var n = 0;
        for (var s = s1; s <= s2; s++) if (isWork(s, mask, hol)) n++;
        return sign * n;
    }, { min: 2, max: 4 });
    def('WORKDAY.INTL', function (a, ctx) {
        var s = serialArg(a[0], ctx), days = Math.trunc(num(a[1], ctx)), mask = weekendMask(a[2], ctx), hol = holidays(a[3], ctx);
        var step = days < 0 ? -1 : 1, left = Math.abs(days);
        if (left > 100000) throw E.NUM;
        while (left > 0) { s += step; if (isWork(s, mask, hol)) left--; }
        return s;
    }, { min: 2, max: 4 });
    def('DAYS360', function (a, ctx) {
        var d1 = F.serialToDate(serialArg(a[0], ctx)), d2 = F.serialToDate(serialArg(a[1], ctx)), eu = opt(a, 2, false, ctx, bool);
        var dd1 = d1.d, dd2 = d2.d;
        if (eu) { if (dd1 === 31) dd1 = 30; if (dd2 === 31) dd2 = 30; }
        else {
            var lastFeb = function (d) { return d.m === 2 && new Date(Date.UTC(d.y, 2, 0)).getUTCDate() === d.d; };
            if (lastFeb(d1)) { if (lastFeb(d2)) dd2 = 30; dd1 = 30; }
            if (dd1 === 31) dd1 = 30;
            if (dd2 === 31 && dd1 >= 30) dd2 = 30;
        }
        return (d2.y - d1.y) * 360 + (d2.m - d1.m) * 30 + (dd2 - dd1);
    }, { min: 2, max: 3 });

    // ======================================================== keuangan
    def('XNPV', function (a, ctx) {
        var r = num(a[0], ctx), v = flat(a[1], ctx).map(toNum), d = flat(a[2], ctx).map(toNum);
        if (v.length !== d.length || !v.length) throw E.NUM;
        return v.reduce(function (s, x, i) { return s + x / Math.pow(1 + r, (d[i] - d[0]) / 365); }, 0);
    }, { min: 3, max: 3 });
    def('XIRR', function (a, ctx) {
        var v = flat(a[0], ctx).map(toNum), d = flat(a[1], ctx).map(toNum), r = opt(a, 2, 0.1, ctx, num);
        if (v.length !== d.length || !v.some(function (x) { return x > 0; }) || !v.some(function (x) { return x < 0; })) throw E.NUM;
        for (var i = 0; i < 200; i++) {
            var f = 0, df = 0;
            for (var k = 0; k < v.length; k++) {
                var t = (d[k] - d[0]) / 365;
                f += v[k] / Math.pow(1 + r, t);
                df -= t * v[k] / Math.pow(1 + r, t + 1);
            }
            if (!df) break;
            var nr = r - f / df;
            if (!isFinite(nr) || nr <= -1) throw E.NUM;
            if (Math.abs(nr - r) < 1e-10) return nr;
            r = nr;
        }
        throw E.NUM;
    }, { min: 2, max: 3 });
    def('MIRR', function (a, ctx) {
        var v = nums([a[0]], ctx), fr = num(a[1], ctx), rr = num(a[2], ctx), n = v.length;
        var pos = 0, neg = 0;
        v.forEach(function (x, i) { if (x > 0) pos += x * Math.pow(1 + rr, n - 1 - i); else neg += x / Math.pow(1 + fr, i); });
        if (!pos || !neg) throw E.DIV0;
        return Math.pow(-pos / neg, 1 / (n - 1)) - 1;
    }, { min: 3, max: 3 });
    def('DB', function (a, ctx) {
        var cost = num(a[0], ctx), salvage = num(a[1], ctx), life = num(a[2], ctx), period = num(a[3], ctx), month = opt(a, 4, 12, ctx, num);
        if (cost < 0 || salvage < 0 || life <= 0 || period <= 0 || month < 1 || month > 12 || period > life + 1) throw E.NUM;
        var rate = cost === 0 ? 1 : Math.round((1 - Math.pow(salvage / cost, 1 / life)) * 1000) / 1000;
        var total = 0, dep = 0;
        for (var p = 1; p <= period; p++) {
            if (p === 1) dep = cost * rate * month / 12;
            else if (p === Math.floor(life) + 1) dep = (cost - total) * rate * (12 - month) / 12;
            else dep = (cost - total) * rate;
            total += dep;
        }
        return dep;
    }, { min: 4, max: 5 });
    def('DDB', function (a, ctx) {
        var cost = num(a[0], ctx), salvage = num(a[1], ctx), life = num(a[2], ctx), period = num(a[3], ctx), factor = opt(a, 4, 2, ctx, num);
        if (cost < 0 || salvage < 0 || life <= 0 || period <= 0 || period > life || factor <= 0) throw E.NUM;
        var acc = 0, dep = 0;
        for (var p = 1; p <= Math.ceil(period); p++) {
            dep = Math.max(0, Math.min((cost - acc) * factor / life, cost - salvage - acc));
            acc += dep;
        }
        return dep;
    }, { min: 4, max: 5 });
    function cumulative(principal) {
        return function (a, ctx) {
            var r = num(a[0], ctx), n = num(a[1], ctx), pv = num(a[2], ctx), s = Math.floor(num(a[3], ctx)), e = Math.floor(num(a[4], ctx)), t = num(a[5], ctx);
            if (r <= 0 || n <= 0 || pv <= 0 || s < 1 || e < s || e > n || (t !== 0 && t !== 1)) throw E.NUM;
            var fn = F.FN[principal ? 'PPMT' : 'IPMT'].fn, total = 0;
            for (var p = s; p <= e; p++) total += fn([r, p, n, pv, 0, t], ctx);
            return total;
        };
    }
    def('CUMIPMT', cumulative(false), { min: 6, max: 6 });
    def('CUMPRINC', cumulative(true), { min: 6, max: 6 });
    def('NOMINAL', function (a, ctx) { var e = num(a[0], ctx), n = Math.floor(num(a[1], ctx)); if (e <= 0 || n < 1) throw E.NUM; return n * (Math.pow(1 + e, 1 / n) - 1); }, { min: 2, max: 2 });
    def('RRI', function (a, ctx) { var n = num(a[0], ctx), pv = num(a[1], ctx), fv = num(a[2], ctx); if (n <= 0 || pv === 0) throw E.NUM; return Math.pow(fv / pv, 1 / n) - 1; }, { min: 3, max: 3 });
    def('PDURATION', function (a, ctx) { var r = num(a[0], ctx), pv = num(a[1], ctx), fv = num(a[2], ctx); if (r <= 0 || pv <= 0 || fv <= 0) throw E.NUM; return (Math.log(fv) - Math.log(pv)) / Math.log(1 + r); }, { min: 3, max: 3 });

    // ================================================ statistik & distribusi
    function erfPhi(x) {
        if (x !== x) throw E.NUM; // NaN: NaN !== NaN, loop di bawah tidak akan pernah berhenti
        if (x < -8) return 0;
        if (x > 8) return 1;
        var s = x, t = 0, b = x, q = x * x, i = 1;
        while (s !== t && i < 2000) { t = s; i += 2; b *= q / i; s = t + b; }
        return 0.5 + s * Math.exp(-0.5 * q - 0.91893853320467274178);
    }
    function normInv(p) {
        if (p <= 0 || p >= 1) throw E.NUM;
        var aa = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
        var bb = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
        var cc = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
        var dd = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
        var q, r, x;
        if (p < 0.02425) {
            q = Math.sqrt(-2 * Math.log(p));
            x = (((((cc[0] * q + cc[1]) * q + cc[2]) * q + cc[3]) * q + cc[4]) * q + cc[5]) / ((((dd[0] * q + dd[1]) * q + dd[2]) * q + dd[3]) * q + 1);
        } else if (p <= 1 - 0.02425) {
            q = p - 0.5; r = q * q;
            x = (((((aa[0] * r + aa[1]) * r + aa[2]) * r + aa[3]) * r + aa[4]) * r + aa[5]) * q / (((((bb[0] * r + bb[1]) * r + bb[2]) * r + bb[3]) * r + bb[4]) * r + 1);
        } else {
            q = Math.sqrt(-2 * Math.log(1 - p));
            x = -(((((cc[0] * q + cc[1]) * q + cc[2]) * q + cc[3]) * q + cc[4]) * q + cc[5]) / ((((dd[0] * q + dd[1]) * q + dd[2]) * q + dd[3]) * q + 1);
        }
        // Satu langkah Halley untuk presisi penuh.
        var e = erfPhi(x) - p;
        var u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
        return x - u / (1 + x * u / 2);
    }
    function normPdf(z) { return Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI); }
    var LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    function gammaFn(x) {
        if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
        x -= 1;
        var s = 0.99999999999980993, t = x + 7.5;
        for (var i = 0; i < 8; i++) s += LANCZOS[i] / (x + i + 1);
        return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * s;
    }
    function gammaLn(x) {
        if (x <= 0) throw E.NUM;
        if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - gammaLn(1 - x);
        x -= 1;
        var s = 0.99999999999980993, t = x + 7.5;
        for (var i = 0; i < 8; i++) s += LANCZOS[i] / (x + i + 1);
        return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(s);
    }
    function combin(n, k) { return Math.exp(gammaLn(n + 1) - gammaLn(k + 1) - gammaLn(n - k + 1)); }

    def('NORM.DIST,NORMDIST', function (a, ctx) {
        var x = num(a[0], ctx), m = num(a[1], ctx), sd = num(a[2], ctx), cum = bool(a[3], ctx);
        if (sd <= 0) throw E.NUM;
        var z = (x - m) / sd;
        return cum ? erfPhi(z) : normPdf(z) / sd;
    }, { min: 4, max: 4 });
    def('NORM.S.DIST', function (a, ctx) { var z = num(a[0], ctx); return bool(a[1], ctx) ? erfPhi(z) : normPdf(z); }, { min: 2, max: 2 });
    def('NORMSDIST', function (a, ctx) { return erfPhi(num(a[0], ctx)); }, { min: 1, max: 1 });
    def('NORM.INV,NORMINV', function (a, ctx) { var sd = num(a[2], ctx); if (sd <= 0) throw E.NUM; return num(a[1], ctx) + sd * normInv(num(a[0], ctx)); }, { min: 3, max: 3 });
    def('NORM.S.INV,NORMSINV', function (a, ctx) { return normInv(num(a[0], ctx)); }, { min: 1, max: 1 });
    def('STANDARDIZE', function (a, ctx) { var sd = num(a[2], ctx); if (sd <= 0) throw E.NUM; return (num(a[0], ctx) - num(a[1], ctx)) / sd; }, { min: 3, max: 3 });
    def('CONFIDENCE.NORM,CONFIDENCE', function (a, ctx) {
        var al = num(a[0], ctx), sd = num(a[1], ctx), n = Math.floor(num(a[2], ctx));
        if (al <= 0 || al >= 1 || sd <= 0 || n < 1) throw E.NUM;
        return normInv(1 - al / 2) * sd / Math.sqrt(n);
    }, { min: 3, max: 3 });
    def('BINOM.DIST,BINOMDIST', function (a, ctx) {
        var k = Math.floor(num(a[0], ctx)), n = Math.floor(num(a[1], ctx)), p = num(a[2], ctx), cum = bool(a[3], ctx);
        if (k < 0 || k > n || p < 0 || p > 1) throw E.NUM;
        var pmf = function (i) { return combin(n, i) * Math.pow(p, i) * Math.pow(1 - p, n - i); };
        if (!cum) return pmf(k);
        var s = 0;
        for (var i = 0; i <= k; i++) s += pmf(i);
        return Math.min(1, s);
    }, { min: 4, max: 4 });
    def('POISSON.DIST,POISSON', function (a, ctx) {
        var x = Math.floor(num(a[0], ctx)), m = num(a[1], ctx), cum = bool(a[2], ctx);
        if (x < 0 || m < 0) throw E.NUM;
        var pmf = function (i) { return Math.exp(i * Math.log(m || 1e-300) - m - gammaLn(i + 1)); };
        if (m === 0) return 1;
        if (!cum) return pmf(x);
        var s = 0;
        for (var i = 0; i <= x; i++) s += pmf(i);
        return Math.min(1, s);
    }, { min: 3, max: 3 });
    def('EXPON.DIST,EXPONDIST', function (a, ctx) {
        var x = num(a[0], ctx), l = num(a[1], ctx), cum = bool(a[2], ctx);
        if (x < 0 || l <= 0) throw E.NUM;
        return cum ? 1 - Math.exp(-l * x) : l * Math.exp(-l * x);
    }, { min: 3, max: 3 });
    def('GAMMA', function (a, ctx) { var x = num(a[0], ctx); if (x <= 0 && x === Math.floor(x)) throw E.NUM; var g = gammaFn(x); if (!isFinite(g)) throw E.NUM; return g; }, { min: 1, max: 1 });
    def('GAMMALN,GAMMALN.PRECISE', function (a, ctx) { return gammaLn(num(a[0], ctx)); }, { min: 1, max: 1 });

    function pairArrays(a, ctx) {
        var x = flat(a[0], ctx), y = flat(a[1], ctx);
        if (x.length !== y.length) throw E.NA;
        var px = [], py = [];
        for (var i = 0; i < x.length; i++) if (typeof x[i] === 'number' && typeof y[i] === 'number') { px.push(x[i]); py.push(y[i]); }
        return { x: px, y: py };
    }
    function covariance(sample) {
        return function (a, ctx) {
            var p = pairArrays(a, ctx), n = p.x.length;
            if (n < (sample ? 2 : 1)) throw E.DIV0;
            var mx = mean(p.x), my = mean(p.y), s = 0;
            for (var i = 0; i < n; i++) s += (p.x[i] - mx) * (p.y[i] - my);
            return s / (sample ? n - 1 : n);
        };
    }
    def('COVARIANCE.S', covariance(true), { min: 2, max: 2 });
    def('COVARIANCE.P,COVAR', covariance(false), { min: 2, max: 2 });
    def('STEYX', function (a, ctx) {
        var p = pairArrays(a, ctx), n = p.x.length;
        if (n < 3) throw E.DIV0;
        var mx = mean(p.y), my = mean(p.x), sxx = 0, syy = 0, sxy = 0;
        for (var i = 0; i < n; i++) { var dx = p.y[i] - mx, dy = p.x[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
        if (!sxx) throw E.DIV0;
        return Math.sqrt((syy - sxy * sxy / sxx) / (n - 2));
    }, { min: 2, max: 2 });
    /** Regresi linear sederhana untuk TREND/GROWTH (satu variabel x). */
    function linearFit(ys, xs) {
        var n = ys.length, mx = mean(xs), my = mean(ys), sxx = 0, sxy = 0;
        for (var i = 0; i < n; i++) { sxx += (xs[i] - mx) * (xs[i] - mx); sxy += (xs[i] - mx) * (ys[i] - my); }
        var b = sxx ? sxy / sxx : 0;
        return { b: b, a: my - b * mx };
    }
    function trendLike(expo) {
        return function (a, ctx) {
            var yg = grid(a[0], ctx);
            var ys = flat(a[0], ctx).map(toNum);
            if (expo) ys = ys.map(function (y) { if (y <= 0) throw E.NUM; return Math.log(y); });
            var xs = has(a, 1) ? flat(a[1], ctx).map(toNum) : ys.map(function (_, i) { return i + 1; });
            if (xs.length !== ys.length) throw E.REF;
            var fit = linearFit(ys, xs);
            if (has(a, 3) && !bool(a[3], ctx)) { var sxy = 0, sxx = 0; xs.forEach(function (x, i) { sxy += x * ys[i]; sxx += x * x; }); fit = { a: 0, b: sxx ? sxy / sxx : 0 }; }
            var newG = has(a, 2) ? grid(a[2], ctx) : (has(a, 1) ? grid(a[1], ctx) : yg.map(function (row, r) { return row.map(function (_, c) { return r * row.length + c + 1; }); }));
            return new Arr(newG.map(function (row) { return row.map(function (x) { var v = fit.a + fit.b * toNum(x); return expo ? Math.exp(v) : v; }); }));
        };
    }
    def('TREND', trendLike(false), { min: 1, max: 4 });
    def('GROWTH', trendLike(true), { min: 1, max: 4 });

    function sortedNums(a, ctx) { return nums(a, ctx).sort(function (x, y) { return x - y; }); }
    def('KURT', function (a, ctx) {
        var v = nums(a, ctx), n = v.length;
        if (n < 4) throw E.DIV0;
        var m = mean(v), s2 = v.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (n - 1);
        if (!s2) throw E.DIV0;
        var s4 = v.reduce(function (s, x) { return s + Math.pow((x - m) / Math.sqrt(s2), 4); }, 0);
        return n * (n + 1) / ((n - 1) * (n - 2) * (n - 3)) * s4 - 3 * (n - 1) * (n - 1) / ((n - 2) * (n - 3));
    });
    def('SKEW', function (a, ctx) {
        var v = nums(a, ctx), n = v.length;
        if (n < 3) throw E.DIV0;
        var m = mean(v), sd = Math.sqrt(v.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (n - 1));
        if (!sd) throw E.DIV0;
        return n / ((n - 1) * (n - 2)) * v.reduce(function (s, x) { return s + Math.pow((x - m) / sd, 3); }, 0);
    });
    def('AVEDEV', function (a, ctx) { var v = nums(a, ctx), m = mean(v); return v.reduce(function (s, x) { return s + Math.abs(x - m); }, 0) / v.length; });
    def('DEVSQ', function (a, ctx) { var v = nums(a, ctx); if (!v.length) return 0; var m = mean(v); return v.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0); });
    def('HARMEAN', function (a, ctx) { var v = nums(a, ctx); if (!v.length || v.some(function (x) { return x <= 0; })) throw E.NUM; return v.length / v.reduce(function (s, x) { return s + 1 / x; }, 0); });
    def('TRIMMEAN', function (a, ctx) {
        var v = sortedNums([a[0]], ctx), p = num(a[1], ctx);
        if (p < 0 || p >= 1 || !v.length) throw E.NUM;
        var k = Math.floor(v.length * p / 2);
        return mean(v.slice(k, v.length - k));
    }, { min: 2, max: 2 });
    function percentileExc(v, p) {
        var n = v.length;
        if (!n || p <= 0 || p >= 1) throw E.NUM;
        var h = (n + 1) * p;
        if (h < 1 || h > n) throw E.NUM;
        var lo = Math.floor(h);
        return lo >= n ? v[n - 1] : v[lo - 1] + (h - lo) * (v[lo] - v[lo - 1]);
    }
    def('PERCENTILE.EXC', function (a, ctx) { return percentileExc(sortedNums([a[0]], ctx), num(a[1], ctx)); }, { min: 2, max: 2 });
    def('QUARTILE.EXC', function (a, ctx) { var q = Math.floor(num(a[1], ctx)); if (q < 1 || q > 3) throw E.NUM; return percentileExc(sortedNums([a[0]], ctx), q / 4); }, { min: 2, max: 2 });
    function percentRank(exc) {
        return function (a, ctx) {
            var v = sortedNums([a[0]], ctx), x = num(a[1], ctx), sig = Math.floor(opt(a, 2, 3, ctx, num));
            var n = v.length;
            if (!n || sig < 1 || x < v[0] || x > v[n - 1]) throw E.NA;
            var below = 0;
            while (below < n && v[below] < x) below++;
            var rank;
            if (below < n && v[below] === x) rank = exc ? (below + 1) / (n + 1) : (n === 1 ? 1 : below / (n - 1));
            else {
                var lo = v[below - 1], hi = v[below];
                var r0 = exc ? below / (n + 1) : (below - 1) / (n - 1), r1 = exc ? (below + 1) / (n + 1) : below / (n - 1);
                rank = r0 + (x - lo) / (hi - lo) * (r1 - r0);
            }
            var f = Math.pow(10, sig);
            return Math.floor(rank * f + 1e-9) / f;
        };
    }
    def('PERCENTRANK,PERCENTRANK.INC', percentRank(false), { min: 2, max: 3 });
    def('PERCENTRANK.EXC', percentRank(true), { min: 2, max: 3 });
    def('PERCENTOF', function (a, ctx) { var t = sum(nums([a[1]], ctx)); if (!t) throw E.DIV0; return sum(nums([a[0]], ctx)) / t; }, { min: 2, max: 2 });

    def('AGGREGATE', function (a, ctx) {
        var fnNum = Math.floor(num(a[0], ctx)), option = Math.floor(num(a[1], ctx));
        var names = { 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV.S', 8: 'STDEV.P', 9: 'SUM', 10: 'VAR.S', 11: 'VAR.P', 12: 'MEDIAN', 13: 'MODE.SNGL', 14: 'LARGE', 15: 'SMALL', 16: 'PERCENTILE.INC', 17: 'QUARTILE.INC', 18: 'PERCENTILE.EXC', 19: 'QUARTILE.EXC' };
        if (!names[fnNum] || option < 0 || option > 7 || !F.FN[names[fnNum]]) throw E.VALUE;
        var ignoreErr = option === 2 || option === 3 || option === 6 || option === 7;
        var ignoreHidden = option === 1 || option === 3 || option === 5 || option === 7;
        var ignoreNested = option <= 3;
        var filterRef = function (ref) {
            if (!(ref instanceof RangeRef)) {
                if (ref instanceof Arr && ignoreErr) return new Arr(ref.rows.map(function (row) { return row.map(function (v) { return v instanceof XErr ? null : v; }); }));
                return ref;
            }
            return new Arr(ctx.rangeValues(ref).map(function (row, ri) {
                var rr = ref.r1 + ri;
                var hidden = ctx.isRowHidden && ctx.isRowHidden(ref.sheetId, rr, ignoreHidden);
                return row.map(function (v, ci) {
                    if (hidden && ignoreHidden) return null;
                    if (ignoreNested && ctx.isFormula && ctx.formulaText && ctx.isFormula(ref.sheetId, rr, ref.c1 + ci) && /(SUBTOTAL|AGGREGATE)\s*\(/i.test(ctx.formulaText(ref.sheetId, rr, ref.c1 + ci))) return null;
                    if (ignoreErr && v instanceof XErr) return null;
                    return v;
                });
            }));
        };
        var args = fnNum >= 14 ? [filterRef(a[2]), a[3]] : a.slice(2).map(filterRef);
        return F.FN[names[fnNum]].fn(args, ctx);
    }, { min: 3 });

    // ========================================================= matriks
    function squareMatrix(v, ctx) {
        var g = grid(v, ctx);
        if (g.length !== g[0].length) throw E.VALUE;
        return g.map(function (row) { return row.map(function (x) { if (typeof x !== 'number') throw E.VALUE; return x; }); });
    }
    def('MDETERM', function (a, ctx) {
        var m = squareMatrix(a[0], ctx), n = m.length, det = 1;
        for (var i = 0; i < n; i++) {
            var p = i;
            for (var r = i + 1; r < n; r++) if (Math.abs(m[r][i]) > Math.abs(m[p][i])) p = r;
            if (Math.abs(m[p][i]) < 1e-15) return 0;
            if (p !== i) { var t = m[p]; m[p] = m[i]; m[i] = t; det = -det; }
            det *= m[i][i];
            for (var r2 = i + 1; r2 < n; r2++) {
                var f = m[r2][i] / m[i][i];
                for (var c = i; c < n; c++) m[r2][c] -= f * m[i][c];
            }
        }
        return det;
    }, { min: 1, max: 1 });
    def('MINVERSE', function (a, ctx) {
        var m = squareMatrix(a[0], ctx), n = m.length;
        var aug = m.map(function (row, i) { return row.concat(row.map(function (_, j) { return i === j ? 1 : 0; })); });
        for (var i = 0; i < n; i++) {
            var p = i;
            for (var r = i + 1; r < n; r++) if (Math.abs(aug[r][i]) > Math.abs(aug[p][i])) p = r;
            if (Math.abs(aug[p][i]) < 1e-15) throw E.NUM;
            var t = aug[p]; aug[p] = aug[i]; aug[i] = t;
            var piv = aug[i][i];
            for (var c = 0; c < 2 * n; c++) aug[i][c] /= piv;
            for (var r2 = 0; r2 < n; r2++) {
                if (r2 === i) continue;
                var f = aug[r2][i];
                for (var c2 = 0; c2 < 2 * n; c2++) aug[r2][c2] -= f * aug[i][c2];
            }
        }
        return new Arr(aug.map(function (row) { return row.slice(n); }));
    }, { min: 1, max: 1 });
    def('MUNIT', function (a, ctx) {
        var n = Math.floor(num(a[0], ctx));
        if (n < 1 || n > 1000) throw E.VALUE;
        var out = [];
        for (var i = 0; i < n; i++) { out.push([]); for (var j = 0; j < n; j++) out[i].push(i === j ? 1 : 0); }
        return new Arr(out);
    }, { min: 1, max: 1 });

    // ======================================================= trigonometri
    def('COT', function (a, ctx) { var t = Math.tan(num(a[0], ctx)); if (!t) throw E.DIV0; return 1 / t; }, { min: 1, max: 1 });
    def('SEC', function (a, ctx) { return 1 / Math.cos(num(a[0], ctx)); }, { min: 1, max: 1 });
    def('CSC', function (a, ctx) { var s = Math.sin(num(a[0], ctx)); if (!s) throw E.DIV0; return 1 / s; }, { min: 1, max: 1 });
    def('ACOT', function (a, ctx) { return Math.PI / 2 - Math.atan(num(a[0], ctx)); }, { min: 1, max: 1 });
    def('COTH', function (a, ctx) { var t = Math.tanh(num(a[0], ctx)); if (!t) throw E.DIV0; return 1 / t; }, { min: 1, max: 1 });
    def('SECH', function (a, ctx) { return 1 / Math.cosh(num(a[0], ctx)); }, { min: 1, max: 1 });
    def('CSCH', function (a, ctx) { var s = Math.sinh(num(a[0], ctx)); if (!s) throw E.DIV0; return 1 / s; }, { min: 1, max: 1 });
    def('ACOSH', function (a, ctx) { var x = num(a[0], ctx); if (x < 1) throw E.NUM; return Math.acosh(x); }, { min: 1, max: 1 });
    def('ASINH', function (a, ctx) { return Math.asinh(num(a[0], ctx)); }, { min: 1, max: 1 });
    def('ATANH', function (a, ctx) { var x = num(a[0], ctx); if (Math.abs(x) >= 1) throw E.NUM; return Math.atanh(x); }, { min: 1, max: 1 });
    def('SQRTPI', function (a, ctx) { var x = num(a[0], ctx); if (x < 0) throw E.NUM; return Math.sqrt(x * Math.PI); }, { min: 1, max: 1 });

    // =========================================================== teknik
    function parseBase(text, radix, maxLen, bits) {
        var s = String(text).trim().toUpperCase();
        if (!s) return 0;
        if (s.length > maxLen) throw E.NUM;
        var n = parseInt(s, radix);
        if (isNaN(n) || !new RegExp('^[' + '0123456789ABCDEF'.slice(0, radix) + ']+$').test(s)) throw E.NUM;
        if (s.length === maxLen && n >= Math.pow(2, bits - 1)) n -= Math.pow(2, bits);
        return n;
    }
    function toBase(n, radix, places, bits) {
        n = Math.trunc(n);
        var lim = Math.pow(2, bits - 1);
        if (n < -lim || n >= lim) throw E.NUM;
        if (n < 0) return (Math.pow(2, bits) + n).toString(radix).toUpperCase();
        var s = n.toString(radix).toUpperCase();
        if (places !== null) { if (places < s.length || places > 10) throw E.NUM; while (s.length < places) s = '0' + s; }
        return s;
    }
    var BASES = { BIN: [2, 10], OCT: [8, 30], DEC: [10, 0], HEX: [16, 40] };
    ['BIN', 'OCT', 'HEX'].forEach(function (from) {
        ['BIN', 'OCT', 'DEC', 'HEX'].forEach(function (to) {
            if (from === to) return;
            def(from + '2' + to, function (a, ctx) {
                var v = S(a[0], ctx);
                var n = parseBase(typeof v === 'number' ? String(v) : toStr(v), BASES[from][0], 10, BASES[from][1]);
                if (to === 'DEC') return n;
                return toBase(n, BASES[to][0], has(a, 1) ? Math.floor(num(a[1], ctx)) : null, BASES[to][1]);
            }, { min: 1, max: to === 'DEC' ? 1 : 2 });
        });
    });
    ['BIN', 'OCT', 'HEX'].forEach(function (to) {
        def('DEC2' + to, function (a, ctx) { return toBase(num(a[0], ctx), BASES[to][0], has(a, 1) ? Math.floor(num(a[1], ctx)) : null, BASES[to][1]); }, { min: 1, max: 2 });
    });
    def('BASE', function (a, ctx) {
        var n = num(a[0], ctx), radix = Math.floor(num(a[1], ctx)), minLen = Math.floor(opt(a, 2, 0, ctx, num));
        if (n < 0 || n >= Math.pow(2, 53) || radix < 2 || radix > 36 || minLen < 0 || minLen > 255) throw E.NUM;
        var s = Math.trunc(n).toString(radix).toUpperCase();
        while (s.length < minLen) s = '0' + s;
        return s;
    }, { min: 2, max: 3 });
    def('DECIMAL', function (a, ctx) {
        var s = str(a[0], ctx).trim().toUpperCase(), radix = Math.floor(num(a[1], ctx));
        if (radix < 2 || radix > 36) throw E.NUM;
        var digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, radix);
        var n = 0;
        for (var i = 0; i < s.length; i++) { var d = digits.indexOf(s[i]); if (d < 0) throw E.NUM; n = n * radix + d; }
        return n;
    }, { min: 2, max: 2 });
    def('ROMAN', function (a, ctx) {
        var n = Math.trunc(num(a[0], ctx));
        if (n < 0 || n > 3999) throw E.VALUE;
        var map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
        var out = '';
        map.forEach(function (m) { while (n >= m[0]) { out += m[1]; n -= m[0]; } });
        return out;
    }, { min: 1, max: 2 });
    def('ARABIC', function (a, ctx) {
        var s = str(a[0], ctx).trim().toUpperCase(), neg = false;
        if (s.charAt(0) === '-') { neg = true; s = s.slice(1); }
        if (!/^[MDCLXVI]*$/.test(s)) throw E.VALUE;
        var val = { M: 1000, D: 500, C: 100, L: 50, X: 10, V: 5, I: 1 }, n = 0;
        for (var i = 0; i < s.length; i++) { var v = val[s[i]], nx = val[s[i + 1]] || 0; n += v < nx ? -v : v; }
        return neg ? -n : n;
    }, { min: 1, max: 1 });

    // ============================================================= teks
    def('ENCODEURL', function (a, ctx) { return encodeURIComponent(str(a[0], ctx)); }, { min: 1, max: 1 });
    function valueText(v, strict) {
        if (v === null || v === undefined) return '';
        if (v instanceof XErr) return v.code || String(v);
        if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
        if (typeof v === 'number') return F.general(v);
        return strict ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    }
    def('VALUETOTEXT', function (a, ctx) { return valueText(S(a[0], ctx), opt(a, 1, 0, ctx, num) === 1); }, { min: 1, max: 2 });
    def('ARRAYTOTEXT', function (a, ctx) {
        var g = grid(a[0], ctx), strict = opt(a, 1, 0, ctx, num) === 1;
        if (!strict) return g.map(function (row) { return row.map(function (v) { return valueText(v, false); }).join(', '); }).join(', ');
        return '{' + g.map(function (row) { return row.map(function (v) { return valueText(v, true); }).join(','); }).join(';') + '}';
    }, { min: 1, max: 2 });
    function regex(pattern, flags) {
        try { return new RegExp(pattern, flags); } catch (e) { throw E.VALUE; }
    }
    def('REGEXTEST', function (a, ctx) {
        return regex(str(a[1], ctx), opt(a, 2, 0, ctx, num) === 1 ? 'i' : '').test(str(a[0], ctx));
    }, { min: 2, max: 3 });
    def('REGEXEXTRACT', function (a, ctx) {
        var text = str(a[0], ctx), mode = Math.floor(opt(a, 2, 0, ctx, num)), ci = opt(a, 3, 0, ctx, num) === 1 ? 'i' : '';
        if (mode === 1) {
            var all = text.match(regex(str(a[1], ctx), 'g' + ci));
            if (!all) throw E.NA;
            return new Arr(all.map(function (m) { return [m]; }));
        }
        var m = regex(str(a[1], ctx), ci).exec(text);
        if (!m) throw E.NA;
        if (mode === 2) { if (m.length < 2) throw E.VALUE; return new Arr([m.slice(1).map(function (x) { return x === undefined ? '' : x; })]); }
        return m[0];
    }, { min: 2, max: 4 });
    def('REGEXREPLACE', function (a, ctx) {
        var text = str(a[0], ctx), rep = str(a[2], ctx), occ = Math.floor(opt(a, 3, 0, ctx, num)), ci = opt(a, 4, 0, ctx, num) === 1 ? 'i' : '';
        var re = regex(str(a[1], ctx), 'g' + ci);
        if (!occ) return text.replace(re, rep);
        var matches = [], m;
        while ((m = re.exec(text)) !== null) { matches.push({ i: m.index, s: m[0] }); if (!m[0].length) re.lastIndex++; }
        var target = occ > 0 ? matches[occ - 1] : matches[matches.length + occ];
        if (!target) return text;
        return text.slice(0, target.i) + target.s.replace(regex(str(a[1], ctx), ci), rep) + text.slice(target.i + target.s.length);
    }, { min: 3, max: 5 });

    // ============================================== metadata semua fungsi
    var INFO = [
        ['LET', 'logic', 'LET(name1, value1, [name2, value2, …], calculation)'], ['LAMBDA', 'logic', 'LAMBDA([parameter1, …], calculation)'],
        ['BYROW', 'logic', 'BYROW(array, lambda(row))'], ['BYCOL', 'logic', 'BYCOL(array, lambda(column))'], ['MAP', 'logic', 'MAP(array1, [array2, …], lambda)'],
        ['REDUCE', 'logic', 'REDUCE([initial_value], array, lambda(accumulator, value))'], ['SCAN', 'logic', 'SCAN([initial_value], array, lambda(accumulator, value))'],
        ['MAKEARRAY', 'logic', 'MAKEARRAY(rows, columns, lambda(row, col))'], ['ISOMITTED', 'logic', 'ISOMITTED(argument)'], ['XOR', 'logic', 'XOR(logical1, [logical2], …)'],
        ['IFNA', 'logic', 'IFNA(value, value_if_na)'], ['TRUE', 'logic', 'TRUE()'], ['FALSE', 'logic', 'FALSE()'], ['CHOOSE', 'lookup', 'CHOOSE(index_num, value1, [value2], …)'],
        ['CHOOSECOLS', 'lookup', 'CHOOSECOLS(array, col_num1, [col_num2], …)'], ['CHOOSEROWS', 'lookup', 'CHOOSEROWS(array, row_num1, [row_num2], …)'],
        ['TAKE', 'lookup', 'TAKE(array, rows, [columns])'], ['DROP', 'lookup', 'DROP(array, rows, [columns])'], ['VSTACK', 'lookup', 'VSTACK(array1, [array2], …)'],
        ['HSTACK', 'lookup', 'HSTACK(array1, [array2], …)'], ['TOCOL', 'lookup', 'TOCOL(array, [ignore], [scan_by_column])'], ['TOROW', 'lookup', 'TOROW(array, [ignore], [scan_by_column])'],
        ['WRAPROWS', 'lookup', 'WRAPROWS(vector, wrap_count, [pad_with])'], ['WRAPCOLS', 'lookup', 'WRAPCOLS(vector, wrap_count, [pad_with])'],
        ['EXPAND', 'lookup', 'EXPAND(array, rows, [columns], [pad_with])'], ['SORTBY', 'lookup', 'SORTBY(array, by_array1, [sort_order1], …)'],
        ['XMATCH', 'lookup', 'XMATCH(lookup_value, lookup_array, [match_mode], [search_mode])'], ['LOOKUP', 'lookup', 'LOOKUP(lookup_value, lookup_vector, [result_vector])'],
        ['ROW', 'lookup', 'ROW([reference])'], ['ROWS', 'lookup', 'ROWS(array)'], ['COLUMN', 'lookup', 'COLUMN([reference])'], ['COLUMNS', 'lookup', 'COLUMNS(array)'],
        ['ADDRESS', 'lookup', 'ADDRESS(row_num, column_num, [abs_num], [a1], [sheet_text])'], ['HYPERLINK', 'lookup', 'HYPERLINK(link_location, [friendly_name])'],
        ['FORMULATEXT', 'lookup', 'FORMULATEXT(reference)'], ['MMULT', 'math', 'MMULT(array1, array2)'], ['MDETERM', 'math', 'MDETERM(array)'], ['MINVERSE', 'math', 'MINVERSE(array)'], ['MUNIT', 'math', 'MUNIT(dimension)'],
        ['RANDARRAY', 'math', 'RANDARRAY([rows], [columns], [min], [max], [whole_number])'], ['PRODUCT', 'math', 'PRODUCT(number1, [number2], …)'], ['SUMSQ', 'math', 'SUMSQ(number1, [number2], …)'],
        ['AGGREGATE', 'math', 'AGGREGATE(function_num, options, ref1, [ref2], …)'], ['TRUNC', 'math', 'TRUNC(number, [num_digits])'], ['SIGN', 'math', 'SIGN(number)'], ['PI', 'math', 'PI()'],
        ['EXP', 'math', 'EXP(number)'], ['LN', 'math', 'LN(number)'], ['LOG', 'math', 'LOG(number, [base])'], ['LOG10', 'math', 'LOG10(number)'], ['FACT', 'math', 'FACT(number)'],
        ['GCD', 'math', 'GCD(number1, [number2], …)'], ['LCM', 'math', 'LCM(number1, [number2], …)'], ['QUOTIENT', 'math', 'QUOTIENT(numerator, denominator)'], ['MROUND', 'math', 'MROUND(number, multiple)'],
        ['CEILING', 'math', 'CEILING(number, significance)'], ['CEILING.MATH', 'math', 'CEILING.MATH(number, [significance], [mode])'], ['FLOOR', 'math', 'FLOOR(number, significance)'],
        ['FLOOR.MATH', 'math', 'FLOOR.MATH(number, [significance], [mode])'], ['EVEN', 'math', 'EVEN(number)'], ['ODD', 'math', 'ODD(number)'], ['COMBIN', 'math', 'COMBIN(number, number_chosen)'], ['PERMUT', 'stat', 'PERMUT(number, number_chosen)'],
        ['DEGREES', 'math', 'DEGREES(angle)'], ['RADIANS', 'math', 'RADIANS(angle)'], ['SIN', 'math', 'SIN(number)'], ['COS', 'math', 'COS(number)'], ['TAN', 'math', 'TAN(number)'],
        ['ASIN', 'math', 'ASIN(number)'], ['ACOS', 'math', 'ACOS(number)'], ['ATAN', 'math', 'ATAN(number)'], ['ATAN2', 'math', 'ATAN2(x_num, y_num)'], ['SINH', 'math', 'SINH(number)'], ['COSH', 'math', 'COSH(number)'], ['TANH', 'math', 'TANH(number)'],
        ['ASINH', 'math', 'ASINH(number)'], ['ACOSH', 'math', 'ACOSH(number)'], ['ATANH', 'math', 'ATANH(number)'], ['COT', 'math', 'COT(number)'], ['SEC', 'math', 'SEC(number)'], ['CSC', 'math', 'CSC(number)'],
        ['ACOT', 'math', 'ACOT(number)'], ['COTH', 'math', 'COTH(number)'], ['SECH', 'math', 'SECH(number)'], ['CSCH', 'math', 'CSCH(number)'], ['SQRTPI', 'math', 'SQRTPI(number)'],
        ['ROMAN', 'math', 'ROMAN(number, [form])'], ['ARABIC', 'math', 'ARABIC(text)'], ['BASE', 'math', 'BASE(number, radix, [min_length])'], ['DECIMAL', 'math', 'DECIMAL(text, radix)'],
        ['BIN2DEC', 'math', 'BIN2DEC(number)'], ['BIN2HEX', 'math', 'BIN2HEX(number, [places])'], ['BIN2OCT', 'math', 'BIN2OCT(number, [places])'], ['DEC2BIN', 'math', 'DEC2BIN(number, [places])'],
        ['DEC2HEX', 'math', 'DEC2HEX(number, [places])'], ['DEC2OCT', 'math', 'DEC2OCT(number, [places])'], ['HEX2BIN', 'math', 'HEX2BIN(number, [places])'], ['HEX2DEC', 'math', 'HEX2DEC(number)'],
        ['HEX2OCT', 'math', 'HEX2OCT(number, [places])'], ['OCT2BIN', 'math', 'OCT2BIN(number, [places])'], ['OCT2DEC', 'math', 'OCT2DEC(number)'], ['OCT2HEX', 'math', 'OCT2HEX(number, [places])'],
        ['AVERAGEA', 'stat', 'AVERAGEA(value1, [value2], …)'], ['MAXA', 'stat', 'MAXA(value1, [value2], …)'], ['MINA', 'stat', 'MINA(value1, [value2], …)'],
        ['MAXIFS', 'stat', 'MAXIFS(max_range, criteria_range1, criteria1, …)'], ['MINIFS', 'stat', 'MINIFS(min_range, criteria_range1, criteria1, …)'], ['COUNTBLANK', 'stat', 'COUNTBLANK(range)'],
        ['MODE.SNGL', 'stat', 'MODE.SNGL(number1, [number2], …)'], ['RANK.EQ', 'stat', 'RANK.EQ(number, ref, [order])'], ['RANK.AVG', 'stat', 'RANK.AVG(number, ref, [order])'],
        ['STDEV.S', 'stat', 'STDEV.S(number1, [number2], …)'], ['STDEV.P', 'stat', 'STDEV.P(number1, [number2], …)'], ['STDEVP', 'stat', 'STDEVP(number1, [number2], …)'],
        ['VAR', 'stat', 'VAR(number1, [number2], …)'], ['VAR.S', 'stat', 'VAR.S(number1, [number2], …)'], ['VAR.P', 'stat', 'VAR.P(number1, [number2], …)'], ['VARP', 'stat', 'VARP(number1, [number2], …)'],
        ['PERCENTILE', 'stat', 'PERCENTILE(array, k)'], ['PERCENTILE.INC', 'stat', 'PERCENTILE.INC(array, k)'], ['PERCENTILE.EXC', 'stat', 'PERCENTILE.EXC(array, k)'],
        ['QUARTILE', 'stat', 'QUARTILE(array, quart)'], ['QUARTILE.INC', 'stat', 'QUARTILE.INC(array, quart)'], ['QUARTILE.EXC', 'stat', 'QUARTILE.EXC(array, quart)'],
        ['PERCENTRANK', 'stat', 'PERCENTRANK(array, x, [significance])'], ['PERCENTRANK.INC', 'stat', 'PERCENTRANK.INC(array, x, [significance])'], ['PERCENTRANK.EXC', 'stat', 'PERCENTRANK.EXC(array, x, [significance])'],
        ['GEOMEAN', 'stat', 'GEOMEAN(number1, [number2], …)'], ['HARMEAN', 'stat', 'HARMEAN(number1, [number2], …)'], ['TRIMMEAN', 'stat', 'TRIMMEAN(array, percent)'],
        ['AVEDEV', 'stat', 'AVEDEV(number1, [number2], …)'], ['DEVSQ', 'stat', 'DEVSQ(number1, [number2], …)'], ['KURT', 'stat', 'KURT(number1, [number2], …)'], ['SKEW', 'stat', 'SKEW(number1, [number2], …)'],
        ['CORREL', 'stat', 'CORREL(array1, array2)'], ['PEARSON', 'stat', 'PEARSON(array1, array2)'], ['RSQ', 'stat', 'RSQ(known_ys, known_xs)'], ['SLOPE', 'stat', 'SLOPE(known_ys, known_xs)'],
        ['INTERCEPT', 'stat', 'INTERCEPT(known_ys, known_xs)'], ['STEYX', 'stat', 'STEYX(known_ys, known_xs)'], ['FORECAST', 'stat', 'FORECAST(x, known_ys, known_xs)'],
        ['FORECAST.LINEAR', 'stat', 'FORECAST.LINEAR(x, known_ys, known_xs)'], ['TREND', 'stat', 'TREND(known_ys, [known_xs], [new_xs], [const])'], ['GROWTH', 'stat', 'GROWTH(known_ys, [known_xs], [new_xs], [const])'],
        ['COVARIANCE.S', 'stat', 'COVARIANCE.S(array1, array2)'], ['COVARIANCE.P', 'stat', 'COVARIANCE.P(array1, array2)'], ['FREQUENCY', 'stat', 'FREQUENCY(data_array, bins_array)'],
        ['NORM.DIST', 'stat', 'NORM.DIST(x, mean, standard_dev, cumulative)'], ['NORM.INV', 'stat', 'NORM.INV(probability, mean, standard_dev)'], ['NORM.S.DIST', 'stat', 'NORM.S.DIST(z, cumulative)'],
        ['NORM.S.INV', 'stat', 'NORM.S.INV(probability)'], ['STANDARDIZE', 'stat', 'STANDARDIZE(x, mean, standard_dev)'], ['CONFIDENCE.NORM', 'stat', 'CONFIDENCE.NORM(alpha, standard_dev, size)'],
        ['BINOM.DIST', 'stat', 'BINOM.DIST(number_s, trials, probability_s, cumulative)'], ['POISSON.DIST', 'stat', 'POISSON.DIST(x, mean, cumulative)'], ['EXPON.DIST', 'stat', 'EXPON.DIST(x, lambda, cumulative)'],
        ['GAMMA', 'stat', 'GAMMA(number)'], ['GAMMALN', 'stat', 'GAMMALN(number)'], ['PERCENTOF', 'stat', 'PERCENTOF(data_subset, data_all)'],
        ['CONCATENATE', 'text', 'CONCATENATE(text1, [text2], …)'], ['REPLACE', 'text', 'REPLACE(old_text, start_num, num_chars, new_text)'], ['REPT', 'text', 'REPT(text, number_times)'],
        ['EXACT', 'text', 'EXACT(text1, text2)'], ['CLEAN', 'text', 'CLEAN(text)'], ['CHAR', 'text', 'CHAR(number)'], ['CODE', 'text', 'CODE(text)'], ['UNICHAR', 'text', 'UNICHAR(number)'], ['UNICODE', 'text', 'UNICODE(text)'],
        ['FIXED', 'text', 'FIXED(number, [decimals], [no_commas])'], ['DOLLAR', 'text', 'DOLLAR(number, [decimals])'], ['NUMBERVALUE', 'text', 'NUMBERVALUE(text, [decimal_separator], [group_separator])'],
        ['T', 'text', 'T(value)'], ['TEXTBEFORE', 'text', 'TEXTBEFORE(text, delimiter, [instance_num], [match_mode], [match_end], [if_not_found])'],
        ['TEXTAFTER', 'text', 'TEXTAFTER(text, delimiter, [instance_num], [match_mode], [match_end], [if_not_found])'], ['ENCODEURL', 'text', 'ENCODEURL(text)'],
        ['VALUETOTEXT', 'text', 'VALUETOTEXT(value, [format])'], ['ARRAYTOTEXT', 'text', 'ARRAYTOTEXT(array, [format])'], ['REGEXTEST', 'text', 'REGEXTEST(text, pattern, [case_sensitivity])'],
        ['REGEXEXTRACT', 'text', 'REGEXEXTRACT(text, pattern, [return_mode], [case_sensitivity])'], ['REGEXREPLACE', 'text', 'REGEXREPLACE(text, pattern, replacement, [occurrence], [case_sensitivity])'],
        ['TIME', 'date', 'TIME(hour, minute, second)'], ['HOUR', 'date', 'HOUR(serial_number)'], ['MINUTE', 'date', 'MINUTE(serial_number)'], ['SECOND', 'date', 'SECOND(serial_number)'],
        ['DATEVALUE', 'date', 'DATEVALUE(date_text)'], ['TIMEVALUE', 'date', 'TIMEVALUE(time_text)'], ['DAYS', 'date', 'DAYS(end_date, start_date)'], ['DAYS360', 'date', 'DAYS360(start_date, end_date, [method])'],
        ['WEEKNUM', 'date', 'WEEKNUM(serial_number, [return_type])'], ['ISOWEEKNUM', 'date', 'ISOWEEKNUM(date)'], ['YEARFRAC', 'date', 'YEARFRAC(start_date, end_date, [basis])'],
        ['NETWORKDAYS.INTL', 'date', 'NETWORKDAYS.INTL(start_date, end_date, [weekend], [holidays])'], ['WORKDAY.INTL', 'date', 'WORKDAY.INTL(start_date, days, [weekend], [holidays])'],
        ['NPER', 'finance', 'NPER(rate, pmt, pv, [fv], [type])'], ['IPMT', 'finance', 'IPMT(rate, per, nper, pv, [fv], [type])'], ['PPMT', 'finance', 'PPMT(rate, per, nper, pv, [fv], [type])'],
        ['CUMIPMT', 'finance', 'CUMIPMT(rate, nper, pv, start_period, end_period, type)'], ['CUMPRINC', 'finance', 'CUMPRINC(rate, nper, pv, start_period, end_period, type)'],
        ['XNPV', 'finance', 'XNPV(rate, values, dates)'], ['XIRR', 'finance', 'XIRR(values, dates, [guess])'], ['MIRR', 'finance', 'MIRR(values, finance_rate, reinvest_rate)'],
        ['SLN', 'finance', 'SLN(cost, salvage, life)'], ['SYD', 'finance', 'SYD(cost, salvage, life, per)'], ['DB', 'finance', 'DB(cost, salvage, life, period, [month])'], ['DDB', 'finance', 'DDB(cost, salvage, life, period, [factor])'],
        ['EFFECT', 'finance', 'EFFECT(nominal_rate, npery)'], ['NOMINAL', 'finance', 'NOMINAL(effect_rate, npery)'], ['RRI', 'finance', 'RRI(nper, pv, fv)'], ['PDURATION', 'finance', 'PDURATION(rate, pv, fv)'],
        ['ISERR', 'info', 'ISERR(value)'], ['ISNA', 'info', 'ISNA(value)'], ['ISLOGICAL', 'info', 'ISLOGICAL(value)'], ['ISNONTEXT', 'info', 'ISNONTEXT(value)'], ['ISEVEN', 'info', 'ISEVEN(number)'],
        ['ISODD', 'info', 'ISODD(number)'], ['ISREF', 'info', 'ISREF(value)'], ['ISFORMULA', 'info', 'ISFORMULA(reference)'], ['ERROR.TYPE', 'info', 'ERROR.TYPE(error_val)'], ['TYPE', 'info', 'TYPE(value)'],
        ['N', 'info', 'N(value)'], ['NA', 'info', 'NA()'], ['SHEET', 'info', 'SHEET([value])'], ['SHEETS', 'info', 'SHEETS([reference])']
    ];
    var known = {};
    F.FN_INFO.forEach(function (x) { known[x[0]] = true; });
    INFO.forEach(function (x) { if (!known[x[0]] && F.FN[x[0]]) { F.FN_INFO.push(x); known[x[0]] = true; } });

    if (typeof module !== 'undefined' && module.exports) module.exports = F;
})(typeof window !== 'undefined' ? window : globalThis);
