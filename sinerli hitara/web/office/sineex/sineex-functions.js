/**
 * Sinerli Hitara — pustaka fungsi lembar kerja. Mendaftarkan fungsi ke SXF.FN.
 * Konvensi: fungsi menerima argumen yang sudah dievaluasi (skalar, RangeRef,
 * atau Arr) kecuali ditandai lazy. Galat dilempar sebagai XErr dan diubah
 * menjadi nilai galat oleh evaluator.
 */
(function (root) {
    'use strict';

    var F = (typeof module !== 'undefined' && module.exports) ? require('./sineex-formula.js') : root.SXF;
    var E = F.E, XErr = F.XErr, Arr = F.Arr, RangeRef = F.RangeRef;
    var toNum = F.toNum, toStr = F.toStr, toBool = F.toBool;

    function def(names, fn, opts) {
        names.split(',').forEach(function (n) { F.FN[n.trim()] = Object.assign({ fn: fn }, opts || {}); });
    }
    function isRange(v) { return v instanceof RangeRef || v instanceof Arr; }
    function S(v, ctx) { return F.scalar(v, ctx); }
    function num(v, ctx) { return toNum(S(v, ctx)); }
    function str(v, ctx) { return toStr(S(v, ctx)); }
    function bool(v, ctx) { return toBool(S(v, ctx)); }
    function opt(args, i, dflt, ctx, conv) {
        if (i >= args.length || args[i] === null || args[i] === undefined) return dflt;
        return conv ? conv(args[i], ctx) : S(args[i], ctx);
    }
    function grid(v, ctx) {
        if (v instanceof RangeRef) return ctx.rangeValues(v);
        if (v instanceof Arr) return v.rows;
        return [[v]];
    }
    function flatVals(v, ctx) {
        var g = grid(v, ctx);
        // Rentang satu kolom (A:A, B2:B900): kolom kunci yang sudah di-cache
        // selama recalc(). Hasilnya hanya dibaca oleh pemanggil (filter/map).
        if (v instanceof RangeRef && ctx.rangeFirstCol && g.length && g[0].length === 1) return ctx.rangeFirstCol(v, g);
        var out = [];
        g.forEach(function (row) { row.forEach(function (x) { out.push(x); }); });
        return out;
    }

    /**
     * Mengumpulkan angka. mode: 'num' (dalam rentang hanya angka), 'a' (teks=0,
     * boolean=1/0). Argumen langsung selalu dikonversi.
     */
    function collect(args, ctx, mode) {
        var out = [];
        args.forEach(function (a) {
            if (a === null || a === undefined) return;
            if (isRange(a)) {
                flatVals(a, ctx).forEach(function (v) {
                    if (v instanceof XErr) throw v;
                    if (typeof v === 'number') out.push(v);
                    else if (mode === 'a' && v !== null && v !== undefined) out.push(typeof v === 'boolean' ? (v ? 1 : 0) : 0);
                });
            } else {
                if (a instanceof XErr) throw a;
                out.push(toNum(a));
            }
        });
        return out;
    }
    F.collect = collect;

    function roundTo(x, d) {
        if (!isFinite(x)) return x;
        var sgn = x < 0 ? -1 : 1;
        var r = Number(Math.round(Number(Math.abs(x) + 'e' + d)) + 'e' + (-d));
        return isNaN(r) ? sgn * Math.round(Math.abs(x) * Math.pow(10, d)) / Math.pow(10, d) : sgn * r;
    }
    F.roundTo = roundTo;

    // ============================================================ kriteria
    function wildcardRegex(pat) {
        var re = '';
        for (var i = 0; i < pat.length; i++) {
            var ch = pat[i];
            if (ch === '~' && i + 1 < pat.length) { re += pat[i + 1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); i++; }
            else if (ch === '*') re += '[\\s\\S]*';
            else if (ch === '?') re += '[\\s\\S]';
            else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
        return new RegExp('^' + re + '$', 'i');
    }
    F.wildcardRegex = wildcardRegex;

    F.criteria = function (crit) {
        if (typeof crit === 'number') return function (v) { return typeof v === 'number' ? Math.abs(v - crit) < 1e-12 : (typeof v === 'string' && F.numberFromString(v) === crit); };
        if (typeof crit === 'boolean') return function (v) { return v === crit; };
        if (crit === null || crit === undefined) return function (v) { return v === null || v === ''; };
        if (crit instanceof XErr) return function (v) { return v === crit; };
        var m = /^(<=|>=|<>|<|>|=)?([\s\S]*)$/.exec(String(crit));
        var op = m[1] || '=';
        var rhs = m[2];
        var n = rhs.trim() === '' ? null : F.numberFromString(rhs);
        var up = rhs.toUpperCase();
        if (n !== null) {
            return function (v) {
                var x = typeof v === 'number' ? v : (op === '=' || op === '<>') && typeof v === 'string' ? F.numberFromString(v) : null;
                if (x === null || x === undefined) return op === '<>';
                switch (op) {
                    case '=': return Math.abs(x - n) < 1e-12;
                    case '<>': return Math.abs(x - n) >= 1e-12;
                    case '<': return x < n;
                    case '>': return x > n;
                    case '<=': return x <= n;
                    case '>=': return x >= n;
                }
                return false;
            };
        }
        if (up === 'TRUE' || up === 'FALSE') {
            var b = up === 'TRUE';
            return function (v) { return op === '<>' ? v !== b : v === b; };
        }
        if (rhs === '') {
            return op === '<>' ? function (v) { return v !== null && v !== undefined && v !== ''; } : function (v) { return v === null || v === undefined || v === ''; };
        }
        if (op === '=' || op === '<>') {
            var re = /[*?~]/.test(rhs) ? wildcardRegex(rhs) : null;
            var eq = re ? null : eqTo(rhs);
            return function (v) {
                var s = v === null || v === undefined ? '' : typeof v === 'string' ? v : null;
                var hit = s !== null && (re ? re.test(s) : eq(s));
                return op === '=' ? hit : !hit;
            };
        }
        return function (v) {
            if (typeof v !== 'string') return false;
            var a = v.toLowerCase(), c = rhs.toLowerCase();
            return op === '<' ? a < c : op === '>' ? a > c : op === '<=' ? a <= c : a >= c;
        };
    };

    // ========================================================= matematika
    def('SUM', function (a, ctx) { return collect(a, ctx).reduce(function (s, x) { return s + x; }, 0); });
    def('PRODUCT', function (a, ctx) { var v = collect(a, ctx); return v.length ? v.reduce(function (s, x) { return s * x; }, 1) : 0; });
    def('SUMSQ', function (a, ctx) { return collect(a, ctx).reduce(function (s, x) { return s + x * x; }, 0); });
    def('AVERAGE', function (a, ctx) { var v = collect(a, ctx); if (!v.length) throw E.DIV0; return v.reduce(function (s, x) { return s + x; }, 0) / v.length; });
    def('AVERAGEA', function (a, ctx) { var v = collect(a, ctx, 'a'); if (!v.length) throw E.DIV0; return v.reduce(function (s, x) { return s + x; }, 0) / v.length; });
    def('MIN', function (a, ctx) { var v = collect(a, ctx); return v.length ? Math.min.apply(null, v) : 0; });
    def('MAX', function (a, ctx) { var v = collect(a, ctx); return v.length ? Math.max.apply(null, v) : 0; });
    def('MINA', function (a, ctx) { var v = collect(a, ctx, 'a'); return v.length ? Math.min.apply(null, v) : 0; });
    def('MAXA', function (a, ctx) { var v = collect(a, ctx, 'a'); return v.length ? Math.max.apply(null, v) : 0; });
    def('COUNT', function (a, ctx) {
        var n = 0;
        a.forEach(function (x) {
            if (isRange(x)) flatVals(x, ctx).forEach(function (v) { if (typeof v === 'number') n++; });
            else if (typeof x === 'number' || (typeof x === 'string' && F.numberFromString(x) !== null) || typeof x === 'boolean') n++;
        });
        return n;
    });
    def('COUNTA', function (a, ctx) {
        var n = 0;
        a.forEach(function (x) {
            if (isRange(x)) flatVals(x, ctx).forEach(function (v) { if (v !== null && v !== undefined) n++; });
            else if (x !== null && x !== undefined) n++;
        });
        return n;
    });
    def('COUNTBLANK', function (a, ctx) { return flatVals(a[0], ctx).filter(function (v) { return v === null || v === ''; }).length; }, { min: 1, max: 1 });
    function median(v) {
        if (!v.length) throw E.NUM;
        v = v.slice().sort(function (x, y) { return x - y; });
        var m = v.length >> 1;
        return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    }
    def('MEDIAN', function (a, ctx) { return median(collect(a, ctx)); });
    def('MODE,MODE.SNGL', function (a, ctx) {
        var v = collect(a, ctx), counts = {}, best = null, bestN = 1;
        v.forEach(function (x) { counts[x] = (counts[x] || 0) + 1; if (counts[x] > bestN) { bestN = counts[x]; best = x; } });
        if (best === null) throw E.NA;
        return best;
    });
    function variance(v, sample) {
        var n = v.length;
        if (n < (sample ? 2 : 1)) throw E.DIV0;
        var mean = v.reduce(function (s, x) { return s + x; }, 0) / n;
        return v.reduce(function (s, x) { return s + (x - mean) * (x - mean); }, 0) / (sample ? n - 1 : n);
    }
    def('VAR,VAR.S', function (a, ctx) { return variance(collect(a, ctx), true); });
    def('VARP,VAR.P', function (a, ctx) { return variance(collect(a, ctx), false); });
    def('STDEV,STDEV.S', function (a, ctx) { return Math.sqrt(variance(collect(a, ctx), true)); });
    def('STDEVP,STDEV.P', function (a, ctx) { return Math.sqrt(variance(collect(a, ctx), false)); });
    def('GEOMEAN', function (a, ctx) { var v = collect(a, ctx); if (!v.length || v.some(function (x) { return x <= 0; })) throw E.NUM; return Math.exp(v.reduce(function (s, x) { return s + Math.log(x); }, 0) / v.length); });
    F.FN.LARGE = { fn: function (a, ctx) { var v = collect([a[0]], ctx).sort(function (x, y) { return y - x; }); var k = Math.ceil(num(a[1], ctx)); if (k < 1 || k > v.length) throw E.NUM; return v[k - 1]; }, min: 2, max: 2 };
    F.FN.SMALL = { fn: function (a, ctx) { var v = collect([a[0]], ctx).sort(function (x, y) { return x - y; }); var k = Math.ceil(num(a[1], ctx)); if (k < 1 || k > v.length) throw E.NUM; return v[k - 1]; }, min: 2, max: 2 };
    function rank(a, ctx, avg) {
        var x = num(a[0], ctx);
        var v = collect([a[1]], ctx);
        var asc = opt(a, 2, 0, ctx, num) !== 0;
        if (v.indexOf(x) === -1 && !v.some(function (y) { return Math.abs(y - x) < 1e-12; })) throw E.NA;
        var better = v.filter(function (y) { return asc ? y < x : y > x; }).length;
        if (!avg) return better + 1;
        var ties = v.filter(function (y) { return Math.abs(y - x) < 1e-12; }).length;
        return better + (ties + 1) / 2;
    }
    def('RANK,RANK.EQ', function (a, ctx) { return rank(a, ctx, false); }, { min: 2, max: 3 });
    def('RANK.AVG', function (a, ctx) { return rank(a, ctx, true); }, { min: 2, max: 3 });
    function percentile(v, p) {
        if (!v.length || p < 0 || p > 1) throw E.NUM;
        v = v.slice().sort(function (x, y) { return x - y; });
        var h = (v.length - 1) * p, lo = Math.floor(h);
        return lo + 1 < v.length ? v[lo] + (h - lo) * (v[lo + 1] - v[lo]) : v[lo];
    }
    def('PERCENTILE,PERCENTILE.INC', function (a, ctx) { return percentile(collect([a[0]], ctx), num(a[1], ctx)); }, { min: 2, max: 2 });
    def('QUARTILE,QUARTILE.INC', function (a, ctx) { var q = Math.floor(num(a[1], ctx)); if (q < 0 || q > 4) throw E.NUM; return percentile(collect([a[0]], ctx), q / 4); }, { min: 2, max: 2 });

    function unary(name, fn, check) {
        def(name, function (a, ctx) {
            return F.elementwise(a[0], null, function (x) {
                if (x instanceof XErr) return x;
                var n = toNum(x);
                if (check && !check(n)) throw E.NUM;
                var r = fn(n);
                if (!isFinite(r)) throw E.NUM;
                return r;
            }, ctx);
        }, { min: 1, max: 1 });
    }
    unary('ABS', Math.abs);
    unary('SQRT', Math.sqrt, function (n) { return n >= 0; });
    unary('EXP', Math.exp);
    unary('LN', Math.log, function (n) { return n > 0; });
    unary('LOG10', Math.log10, function (n) { return n > 0; });
    unary('INT', Math.floor);
    unary('SIGN', function (n) { return n > 0 ? 1 : n < 0 ? -1 : 0; });
    unary('SIN', Math.sin); unary('COS', Math.cos); unary('TAN', Math.tan);
    unary('ASIN', Math.asin, function (n) { return n >= -1 && n <= 1; });
    unary('ACOS', Math.acos, function (n) { return n >= -1 && n <= 1; });
    unary('ATAN', Math.atan);
    unary('SINH', Math.sinh); unary('COSH', Math.cosh); unary('TANH', Math.tanh);
    unary('DEGREES', function (n) { return n * 180 / Math.PI; });
    unary('RADIANS', function (n) { return n * Math.PI / 180; });
    unary('EVEN', function (n) { var c = Math.ceil(Math.abs(n)); if (c % 2) c++; return n < 0 ? -c : c; });
    unary('ODD', function (n) { var c = Math.ceil(Math.abs(n)); if (c % 2 === 0) c++; return n < 0 ? -c : c; });
    unary('FACT', function (n) { n = Math.floor(n); var r = 1; for (var i = 2; i <= n; i++) r *= i; return r; }, function (n) { return n >= 0 && n <= 170; });

    def('ATAN2', function (a, ctx) { var x = num(a[0], ctx), y = num(a[1], ctx); if (x === 0 && y === 0) throw E.DIV0; return Math.atan2(y, x); }, { min: 2, max: 2 });
    def('PI', function () { return Math.PI; }, { max: 0 });
    def('LOG', function (a, ctx) { var x = num(a[0], ctx), b = opt(a, 1, 10, ctx, num); if (x <= 0 || b <= 0 || b === 1) throw E.NUM; return Math.log(x) / Math.log(b); }, { min: 1, max: 2 });
    def('POWER', function (a, ctx) { var r = Math.pow(num(a[0], ctx), num(a[1], ctx)); if (!isFinite(r)) throw E.NUM; return r; }, { min: 2, max: 2 });
    def('MOD', function (a, ctx) { var n = num(a[0], ctx), d = num(a[1], ctx); if (d === 0) throw E.DIV0; var r = n - d * Math.floor(n / d); return Math.abs(r) < 1e-12 ? 0 : roundTo(r, 12); }, { min: 2, max: 2 });
    def('QUOTIENT', function (a, ctx) { var d = num(a[1], ctx); if (d === 0) throw E.DIV0; return Math.trunc(num(a[0], ctx) / d); }, { min: 2, max: 2 });
    def('ROUND', function (a, ctx) { return F.elementwise(a[0], null, function (x) { return roundTo(toNum(x), Math.trunc(opt(a, 1, 0, ctx, num))); }, ctx); }, { min: 1, max: 2 });
    def('ROUNDUP', function (a, ctx) { var x = num(a[0], ctx), d = Math.trunc(opt(a, 1, 0, ctx, num)), p = Math.pow(10, d); var r = Math.ceil(roundTo(Math.abs(x) * p, 9)) / p; return x < 0 ? -r : r; }, { min: 1, max: 2 });
    def('ROUNDDOWN,TRUNC', function (a, ctx) { var x = num(a[0], ctx), d = Math.trunc(opt(a, 1, 0, ctx, num)), p = Math.pow(10, d); var r = Math.floor(roundTo(Math.abs(x) * p, 9)) / p; return x < 0 ? -r : r; }, { min: 1, max: 2 });
    def('MROUND', function (a, ctx) { var x = num(a[0], ctx), m = num(a[1], ctx); if (m === 0) return 0; if (x * m < 0) throw E.NUM; return roundTo(Math.round(x / m) * m, 10); }, { min: 2, max: 2 });
    def('CEILING,CEILING.MATH', function (a, ctx) { var x = num(a[0], ctx), s = opt(a, 1, x < 0 ? -1 : 1, ctx, num); if (s === 0) return 0; return roundTo(Math.ceil(roundTo(x / s, 9)) * s, 10); }, { min: 1, max: 3 });
    def('FLOOR,FLOOR.MATH', function (a, ctx) { var x = num(a[0], ctx), s = opt(a, 1, x < 0 ? -1 : 1, ctx, num); if (s === 0) throw E.DIV0; return roundTo(Math.floor(roundTo(x / s, 9)) * s, 10); }, { min: 1, max: 3 });
    function gcd(x, y) { x = Math.abs(Math.floor(x)); y = Math.abs(Math.floor(y)); while (y) { var t = y; y = x % y; x = t; } return x; }
    def('GCD', function (a, ctx) { return collect(a, ctx).reduce(gcd, 0); });
    def('LCM', function (a, ctx) { return collect(a, ctx).reduce(function (l, x) { x = Math.floor(x); return l === 0 || x === 0 ? 0 : Math.abs(l * x) / gcd(l, x); }, 1); });
    def('COMBIN', function (a, ctx) { var n = Math.floor(num(a[0], ctx)), k = Math.floor(num(a[1], ctx)); if (k < 0 || n < k) throw E.NUM; var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }, { min: 2, max: 2 });
    def('PERMUT', function (a, ctx) { var n = Math.floor(num(a[0], ctx)), k = Math.floor(num(a[1], ctx)); if (k < 0 || n < k) throw E.NUM; var r = 1; for (var i = 0; i < k; i++) r *= n - i; return r; }, { min: 2, max: 2 });
    def('RAND', function () { return Math.random(); }, { max: 0, volatile: true });
    def('RANDBETWEEN', function (a, ctx) { var lo = Math.ceil(num(a[0], ctx)), hi = Math.floor(num(a[1], ctx)); if (lo > hi) throw E.NUM; return lo + Math.floor(Math.random() * (hi - lo + 1)); }, { min: 2, max: 2, volatile: true });
    def('SUMPRODUCT', function (a, ctx) {
        var grids = a.map(function (x) { return grid(x, ctx); });
        var h = grids[0].length, w = grids[0][0] ? grids[0][0].length : 0;
        if (grids.some(function (g) { return g.length !== h || (g[0] || []).length !== w; })) throw E.VALUE;
        var s = 0;
        for (var r = 0; r < h; r++) for (var c = 0; c < w; c++) {
            var p = 1;
            for (var k = 0; k < grids.length; k++) {
                var v = grids[k][r][c];
                if (v instanceof XErr) throw v;
                p *= typeof v === 'number' ? v : typeof v === 'boolean' && a.length === 1 ? +v : 0;
            }
            s += p;
        }
        return s;
    }, { min: 1 });

    function ifsCollect(a, ctx, startPairs, valueRange) {
        var target = valueRange ? grid(valueRange, ctx) : null;
        var pairs = [];
        for (var i = startPairs; i + 1 < a.length; i += 2) pairs.push({ g: grid(a[i], ctx), pred: F.criteria(S(a[i + 1], ctx)) });
        if (!pairs.length) throw E.VALUE;
        var h = pairs[0].g.length, w = pairs[0].g[0].length;
        var out = [];
        for (var r = 0; r < h; r++) for (var c = 0; c < w; c++) {
            var ok = pairs.every(function (p) { return p.g[r] && p.pred(p.g[r][c]); });
            if (ok) out.push(target ? (target[r] ? target[r][c] : null) : true);
        }
        return out;
    }
    def('COUNTIF', function (a, ctx) { var pred = F.criteria(S(a[1], ctx)); return flatVals(a[0], ctx).filter(pred).length; }, { min: 2, max: 2 });
    def('COUNTIFS', function (a, ctx) { return ifsCollect(a, ctx, 0, null).length; }, { min: 2 });
    function sumIf(a, ctx) {
        var pred = F.criteria(S(a[1], ctx));
        var crit = grid(a[0], ctx);
        var sumG = a.length > 2 && a[2] !== null ? grid(a[2], ctx) : crit;
        var out = [];
        crit.forEach(function (row, r) { row.forEach(function (v, c) { if (pred(v)) { var x = sumG[r] ? sumG[r][c] : null; if (typeof x === 'number') out.push(x); } }); });
        return out;
    }
    def('SUMIF', function (a, ctx) { return sumIf(a, ctx).reduce(function (s, x) { return s + x; }, 0); }, { min: 2, max: 3 });
    def('AVERAGEIF', function (a, ctx) { var v = sumIf(a, ctx); if (!v.length) throw E.DIV0; return v.reduce(function (s, x) { return s + x; }, 0) / v.length; }, { min: 2, max: 3 });
    function numsOf(list) { return list.filter(function (x) { return typeof x === 'number'; }); }
    def('SUMIFS', function (a, ctx) { return numsOf(ifsCollect(a, ctx, 1, a[0])).reduce(function (s, x) { return s + x; }, 0); }, { min: 3 });
    def('AVERAGEIFS', function (a, ctx) { var v = numsOf(ifsCollect(a, ctx, 1, a[0])); if (!v.length) throw E.DIV0; return v.reduce(function (s, x) { return s + x; }, 0) / v.length; }, { min: 3 });
    def('MINIFS', function (a, ctx) { var v = numsOf(ifsCollect(a, ctx, 1, a[0])); return v.length ? Math.min.apply(null, v) : 0; }, { min: 3 });
    def('MAXIFS', function (a, ctx) { var v = numsOf(ifsCollect(a, ctx, 1, a[0])); return v.length ? Math.max.apply(null, v) : 0; }, { min: 3 });

    function pairs(a, ctx) {
        var x = flatVals(a[1], ctx), y = flatVals(a[0], ctx);
        if (x.length !== y.length) throw E.NA;
        var px = [], py = [];
        for (var i = 0; i < x.length; i++) if (typeof x[i] === 'number' && typeof y[i] === 'number') { px.push(x[i]); py.push(y[i]); }
        if (px.length < 2) throw E.DIV0;
        return { x: px, y: py };
    }
    function stats(p) {
        var n = p.x.length, mx = 0, my = 0;
        for (var i = 0; i < n; i++) { mx += p.x[i]; my += p.y[i]; }
        mx /= n; my /= n;
        var sxy = 0, sxx = 0, syy = 0;
        for (var j = 0; j < n; j++) { sxy += (p.x[j] - mx) * (p.y[j] - my); sxx += (p.x[j] - mx) * (p.x[j] - mx); syy += (p.y[j] - my) * (p.y[j] - my); }
        return { mx: mx, my: my, sxy: sxy, sxx: sxx, syy: syy };
    }
    def('SLOPE', function (a, ctx) { var s = stats(pairs(a, ctx)); if (!s.sxx) throw E.DIV0; return s.sxy / s.sxx; }, { min: 2, max: 2 });
    def('INTERCEPT', function (a, ctx) { var s = stats(pairs(a, ctx)); if (!s.sxx) throw E.DIV0; return s.my - s.sxy / s.sxx * s.mx; }, { min: 2, max: 2 });
    def('CORREL,PEARSON', function (a, ctx) { var s = stats(pairs(a, ctx)); if (!s.sxx || !s.syy) throw E.DIV0; return s.sxy / Math.sqrt(s.sxx * s.syy); }, { min: 2, max: 2 });
    def('RSQ', function (a, ctx) { var s = stats(pairs(a, ctx)); if (!s.sxx || !s.syy) throw E.DIV0; return s.sxy * s.sxy / (s.sxx * s.syy); }, { min: 2, max: 2 });
    def('FORECAST,FORECAST.LINEAR', function (a, ctx) { var x = num(a[0], ctx); var s = stats(pairs([a[1], a[2]], ctx)); if (!s.sxx) throw E.DIV0; var b = s.sxy / s.sxx; return s.my - b * s.mx + b * x; }, { min: 3, max: 3 });

    def('SUBTOTAL', function (a, ctx) {
        var code = Math.floor(num(a[0], ctx));
        var ignoreHidden = code > 100;
        var fnNum = code % 100;
        var names = { 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV', 8: 'STDEVP', 9: 'SUM', 10: 'VAR', 11: 'VARP' };
        if (!names[fnNum]) throw E.VALUE;
        var args = a.slice(1).map(function (ref) {
            if (!(ref instanceof RangeRef)) return ref;
            var g = ctx.rangeValues(ref).map(function (row, ri) {
                var rr = ref.r1 + ri;
                return row.map(function (v, ci) {
                    if (ctx.isRowHidden && ctx.isRowHidden(ref.sheetId, rr, ignoreHidden)) return null;
                    if (ctx.isSubtotalCell && ctx.isSubtotalCell(ref.sheetId, rr, ref.c1 + ci)) return null;
                    return v;
                });
            });
            return new Arr(g);
        });
        return F.FN[names[fnNum]].fn(args, ctx);
    }, { min: 2 });

    def('MMULT', function (a, ctx) {
        var A = grid(a[0], ctx), B = grid(a[1], ctx);
        if (A[0].length !== B.length) throw E.VALUE;
        // Batas kerja (baris × kolom × panjang dalam) supaya satu rumus tidak
        // bisa membekukan tab: 5000×5000 × 5000 = 125 miliar perkalian.
        if (A.length * B[0].length > F.MAX_ARRAY || A.length * B[0].length * B.length > 50000000) throw E.NUM;
        var out = [];
        for (var i = 0; i < A.length; i++) {
            out.push([]);
            for (var j = 0; j < B[0].length; j++) {
                var s = 0;
                for (var k = 0; k < B.length; k++) s += toNum(A[i][k]) * toNum(B[k][j]);
                out[i].push(s);
            }
        }
        return new Arr(out);
    }, { min: 2, max: 2 });
    def('TRANSPOSE', function (a, ctx) {
        var g = grid(a[0], ctx);
        return new Arr(g[0].map(function (_, c) { return g.map(function (row) { return row[c]; }); }));
    }, { min: 1, max: 1 });
    def('SEQUENCE', function (a, ctx) {
        var rows = Math.floor(num(a[0], ctx)), cols = Math.floor(opt(a, 1, 1, ctx, num));
        var start = opt(a, 2, 1, ctx, num), step = opt(a, 3, 1, ctx, num);
        if (rows < 1 || cols < 1 || rows * cols > 1000000) throw E.VALUE;
        var out = [], k = 0;
        for (var r = 0; r < rows; r++) { out.push([]); for (var c = 0; c < cols; c++) out[r].push(start + step * k++); }
        return new Arr(out);
    }, { min: 1, max: 4 });
    def('RANDARRAY', function (a, ctx) {
        var rows = Math.floor(opt(a, 0, 1, ctx, num)), cols = Math.floor(opt(a, 1, 1, ctx, num));
        var lo = opt(a, 2, 0, ctx, num), hi = opt(a, 3, 1, ctx, num), whole = opt(a, 4, false, ctx, bool);
        // Tanpa batas ini =RANDARRAY(1E6;1E6) = 10¹² iterasi → tab macet selamanya
        // (dan RANDARRAY volatil: terulang di setiap suntingan).
        if (rows < 1 || cols < 1 || rows * cols > 1000000) throw E.VALUE;
        var out = [];
        for (var r = 0; r < rows; r++) { out.push([]); for (var c = 0; c < cols; c++) out[r].push(whole ? Math.floor(lo + Math.random() * (hi - lo + 1)) : lo + Math.random() * (hi - lo)); }
        return new Arr(out);
    }, { max: 5, volatile: true });

    // ============================================================ logika
    def('IF', function (nodes, ctx, ev) {
        var c = S(ev(nodes[0]), ctx);
        if (c instanceof XErr) return c;
        var t = toBool(c);
        if (t) return nodes.length > 1 ? ev(nodes[1]) : true;
        return nodes.length > 2 ? ev(nodes[2]) : false;
    }, { lazy: true, min: 1, max: 3 });
    def('IFS', function (nodes, ctx, ev) {
        for (var i = 0; i + 1 < nodes.length; i += 2) {
            var c = S(ev(nodes[i]), ctx);
            if (c instanceof XErr) return c;
            if (toBool(c)) return ev(nodes[i + 1]);
        }
        throw E.NA;
    }, { lazy: true, min: 2 });
    def('IFERROR', function (nodes, ctx, ev) {
        var v = ev(nodes[0]);
        var sv = v instanceof RangeRef && v.h() === 1 && v.w() === 1 ? S(v, ctx) : v;
        if (sv instanceof XErr) return ev(nodes[1]);
        if (sv instanceof Arr) return new Arr(sv.rows.map(function (row) { return row.map(function (x) { return x instanceof XErr ? S(ev(nodes[1]), ctx) : x; }); }));
        return v;
    }, { lazy: true, min: 2, max: 2 });
    def('IFNA', function (nodes, ctx, ev) {
        var v = ev(nodes[0]);
        var sv = v instanceof RangeRef && v.h() === 1 && v.w() === 1 ? S(v, ctx) : v;
        return sv === E.NA ? ev(nodes[1]) : v;
    }, { lazy: true, min: 2, max: 2 });
    function logicals(a, ctx) {
        var out = [];
        a.forEach(function (x) {
            if (isRange(x)) flatVals(x, ctx).forEach(function (v) { if (v instanceof XErr) throw v; if (typeof v === 'boolean' || typeof v === 'number') out.push(!!v); });
            else out.push(toBool(x));
        });
        if (!out.length) throw E.VALUE;
        return out;
    }
    def('AND', function (a, ctx) { return logicals(a, ctx).every(Boolean); }, { min: 1 });
    def('OR', function (a, ctx) { return logicals(a, ctx).some(Boolean); }, { min: 1 });
    def('XOR', function (a, ctx) { return logicals(a, ctx).filter(Boolean).length % 2 === 1; }, { min: 1 });
    def('NOT', function (a, ctx) { return !bool(a[0], ctx); }, { min: 1, max: 1 });
    def('TRUE', function () { return true; }, { max: 0 });
    def('FALSE', function () { return false; }, { max: 0 });
    def('SWITCH', function (nodes, ctx, ev) {
        var v = S(ev(nodes[0]), ctx);
        if (v instanceof XErr) return v;
        var i = 1;
        for (; i + 1 < nodes.length; i += 2) {
            var c = S(ev(nodes[i]), ctx);
            if (F.compare('=', v, c) === true) return ev(nodes[i + 1]);
        }
        if (i < nodes.length) return ev(nodes[i]);
        throw E.NA;
    }, { lazy: true, min: 3 });
    def('CHOOSE', function (nodes, ctx, ev) {
        var idx = Math.floor(toNum(S(ev(nodes[0]), ctx)));
        if (idx < 1 || idx >= nodes.length) throw E.VALUE;
        return ev(nodes[idx]);
    }, { lazy: true, min: 2 });

    // ============================================================== teks
    function textArgs(a, ctx) {
        var out = [];
        a.forEach(function (x) {
            if (isRange(x)) flatVals(x, ctx).forEach(function (v) { if (v instanceof XErr) throw v; out.push(toStr(v)); });
            else out.push(toStr(x));
        });
        return out;
    }
    def('CONCAT,CONCATENATE', function (a, ctx) { return textArgs(a, ctx).join(''); });
    def('TEXTJOIN', function (a, ctx) {
        var delim = str(a[0], ctx), skip = bool(a[1], ctx);
        var parts = textArgs(a.slice(2), ctx);
        if (skip) parts = parts.filter(function (p) { return p !== ''; });
        return parts.join(delim);
    }, { min: 3 });
    def('LEFT', function (a, ctx) { var n = opt(a, 1, 1, ctx, num); if (n < 0) throw E.VALUE; return str(a[0], ctx).slice(0, n); }, { min: 1, max: 2 });
    def('RIGHT', function (a, ctx) { var n = opt(a, 1, 1, ctx, num); if (n < 0) throw E.VALUE; var s = str(a[0], ctx); return n === 0 ? '' : s.slice(-n); }, { min: 1, max: 2 });
    def('MID', function (a, ctx) { var st = Math.floor(num(a[1], ctx)), n = Math.floor(num(a[2], ctx)); if (st < 1 || n < 0) throw E.VALUE; return str(a[0], ctx).substr(st - 1, n); }, { min: 3, max: 3 });
    def('LEN', function (a, ctx) { return F.elementwise(a[0], null, function (x) { return toStr(x).length; }, ctx); }, { min: 1, max: 1 });
    def('UPPER', function (a, ctx) { return F.elementwise(a[0], null, function (x) { return toStr(x).toUpperCase(); }, ctx); }, { min: 1, max: 1 });
    def('LOWER', function (a, ctx) { return F.elementwise(a[0], null, function (x) { return toStr(x).toLowerCase(); }, ctx); }, { min: 1, max: 1 });
    def('PROPER', function (a, ctx) { return str(a[0], ctx).toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, function (m, p, c) { return p + c.toUpperCase(); }); }, { min: 1, max: 1 });
    def('TRIM', function (a, ctx) { return F.elementwise(a[0], null, function (x) { return toStr(x).replace(/ +/g, ' ').trim(); }, ctx); }, { min: 1, max: 1 });
    def('CLEAN', function (a, ctx) { return str(a[0], ctx).replace(/[\x00-\x1f]/g, ''); }, { min: 1, max: 1 });
    def('SUBSTITUTE', function (a, ctx) {
        var s = str(a[0], ctx), from = str(a[1], ctx), to = str(a[2], ctx);
        if (!from) return s;
        if (a.length > 3) {
            var inst = Math.floor(num(a[3], ctx)), idx = -1;
            if (inst < 1) throw E.VALUE;
            for (var i = 0; i < inst; i++) { idx = s.indexOf(from, idx + 1); if (idx === -1) return s; }
            return s.slice(0, idx) + to + s.slice(idx + from.length);
        }
        return s.split(from).join(to);
    }, { min: 3, max: 4 });
    def('REPLACE', function (a, ctx) { var s = str(a[0], ctx), st = Math.floor(num(a[1], ctx)), n = Math.floor(num(a[2], ctx)); if (st < 1 || n < 0) throw E.VALUE; return s.slice(0, st - 1) + str(a[3], ctx) + s.slice(st - 1 + n); }, { min: 4, max: 4 });
    def('FIND', function (a, ctx) { var f = str(a[0], ctx), s = str(a[1], ctx), st = opt(a, 2, 1, ctx, num); var i = s.indexOf(f, st - 1); if (i === -1 || st < 1) throw E.VALUE; return i + 1; }, { min: 2, max: 3 });
    def('SEARCH', function (a, ctx) {
        var f = str(a[0], ctx), s = str(a[1], ctx), st = opt(a, 2, 1, ctx, num);
        if (st < 1) throw E.VALUE;
        var re = new RegExp(wildcardRegex(f).source.slice(1, -1), 'i');
        var m = re.exec(s.slice(st - 1));
        if (!m) throw E.VALUE;
        return m.index + st;
    }, { min: 2, max: 3 });
    def('TEXT', function (a, ctx) { var v = S(a[0], ctx); if (v instanceof XErr) throw v; var fmt = str(a[1], ctx); if (typeof v === 'string') { var n = F.numberFromString(v); if (n !== null) v = n; } return F.format(v, fmt).text; }, { min: 2, max: 2 });
    def('VALUE', function (a, ctx) { var v = S(a[0], ctx); if (typeof v === 'number') return v; var p = F.parseInput(toStr(v)); if (typeof p.v !== 'number') throw E.VALUE; return p.v; }, { min: 1, max: 1 });
    def('NUMBERVALUE', function (a, ctx) {
        var s = str(a[0], ctx), dec = opt(a, 1, F.locale.decimal, ctx, str), grp = opt(a, 2, F.locale.group, ctx, str);
        s = s.split(grp).join('').replace(dec, '.').replace(/\s/g, '');
        var pct = (s.match(/%/g) || []).length;
        var n = parseFloat(s.replace(/%/g, ''));
        if (isNaN(n) || !/^[+-]?[\d.]+(e[+-]?\d+)?%*$/i.test(s)) throw E.VALUE;
        return n / Math.pow(100, pct);
    }, { min: 1, max: 3 });
    // Seperti Excel: hasil lebih dari 32.767 karakter = #VALUE! (dulu teks 32 ribu
    // karakter × 32 ribu = string 1 miliar karakter → memori habis).
    def('REPT', function (a, ctx) { var n = Math.floor(num(a[1], ctx)), s = str(a[0], ctx); if (n < 0 || n > 32767 || s.length * n > 32767) throw E.VALUE; return s.repeat(n); }, { min: 2, max: 2 });
    def('EXACT', function (a, ctx) { return str(a[0], ctx) === str(a[1], ctx); }, { min: 2, max: 2 });
    def('CHAR,UNICHAR', function (a, ctx) { var n = Math.floor(num(a[0], ctx)); if (n < 1) throw E.VALUE; return String.fromCodePoint(n); }, { min: 1, max: 1 });
    def('CODE,UNICODE', function (a, ctx) { var s = str(a[0], ctx); if (!s) throw E.VALUE; return s.codePointAt(0); }, { min: 1, max: 1 });
    def('T', function (a, ctx) { var v = S(a[0], ctx); return typeof v === 'string' ? v : ''; }, { min: 1, max: 1 });
    def('N', function (a, ctx) { var v = S(a[0], ctx); if (v instanceof XErr) throw v; return typeof v === 'number' ? v : typeof v === 'boolean' ? +v : 0; }, { min: 1, max: 1 });
    def('FIXED', function (a, ctx) { var d = opt(a, 1, 2, ctx, num), noComma = opt(a, 2, false, ctx, bool); return F.format(roundTo(num(a[0], ctx), d), (noComma ? '0' : '#,##0') + (d > 0 ? '.' + '0'.repeat(d) : '')).text; }, { min: 1, max: 3 });
    def('DOLLAR', function (a, ctx) { var d = opt(a, 1, 2, ctx, num); var sym = F.locale.code === 'id-ID' ? '"Rp"' : '$'; return F.format(roundTo(num(a[0], ctx), d), sym + '#,##0' + (d > 0 ? '.' + '0'.repeat(d) : '')).text; }, { min: 1, max: 2 });
    function textBA(a, ctx, before) {
        var s = str(a[0], ctx), d = str(a[1], ctx), inst = Math.floor(opt(a, 2, 1, ctx, num));
        if (!d || inst === 0) throw E.VALUE;
        var idx;
        if (inst > 0) { idx = -1; for (var i = 0; i < inst; i++) { idx = s.indexOf(d, idx + 1); if (idx === -1) break; } }
        else { idx = s.length; for (var j = 0; j < -inst; j++) { idx = s.lastIndexOf(d, idx - 1); if (idx === -1) break; } }
        if (idx === -1) { if (a.length > 5) return S(a[5], ctx); throw E.NA; }
        return before ? s.slice(0, idx) : s.slice(idx + d.length);
    }
    def('TEXTBEFORE', function (a, ctx) { return textBA(a, ctx, true); }, { min: 2, max: 6 });
    def('TEXTAFTER', function (a, ctx) { return textBA(a, ctx, false); }, { min: 2, max: 6 });
    def('TEXTSPLIT', function (a, ctx) {
        var s = str(a[0], ctx), cd = opt(a, 1, null, ctx), rd = opt(a, 2, null, ctx);
        var rows = rd !== null && rd !== '' ? s.split(toStr(rd)) : [s];
        var grid2 = rows.map(function (r) { return cd !== null && cd !== '' ? r.split(toStr(cd)) : [r]; });
        var w = Math.max.apply(null, grid2.map(function (r) { return r.length; }));
        return new Arr(grid2.map(function (r) { while (r.length < w) r.push(E.NA); return r; }));
    }, { min: 2, max: 6 });

    // ======================================================== informasi
    function isFn(name, test) { def(name, function (a, ctx) { return F.elementwise(a[0], null, test, ctx); }, { min: 1, max: 1 }); }
    function rawScalar(a, ctx) { return a[0] instanceof RangeRef ? S(a[0], ctx) : a[0]; }
    def('ISBLANK', function (a, ctx) { var v = rawScalar(a, ctx); return v === null || v === undefined; }, { min: 1, max: 1 });
    def('ISNUMBER', function (a, ctx) { return typeof rawScalar(a, ctx) === 'number'; }, { min: 1, max: 1 });
    def('ISTEXT', function (a, ctx) { return typeof rawScalar(a, ctx) === 'string'; }, { min: 1, max: 1 });
    def('ISNONTEXT', function (a, ctx) { return typeof rawScalar(a, ctx) !== 'string'; }, { min: 1, max: 1 });
    def('ISLOGICAL', function (a, ctx) { return typeof rawScalar(a, ctx) === 'boolean'; }, { min: 1, max: 1 });
    def('ISERROR', function (a, ctx) { return rawScalar(a, ctx) instanceof XErr; }, { min: 1, max: 1 });
    def('ISERR', function (a, ctx) { var v = rawScalar(a, ctx); return v instanceof XErr && v !== E.NA; }, { min: 1, max: 1 });
    def('ISNA', function (a, ctx) { return rawScalar(a, ctx) === E.NA; }, { min: 1, max: 1 });
    def('ISEVEN', function (a, ctx) { return Math.floor(Math.abs(num(a[0], ctx))) % 2 === 0; }, { min: 1, max: 1 });
    def('ISODD', function (a, ctx) { return Math.floor(Math.abs(num(a[0], ctx))) % 2 === 1; }, { min: 1, max: 1 });
    def('ISREF', function (a) { return a[0] instanceof RangeRef; }, { min: 1, max: 1 });
    def('ISFORMULA', function (a, ctx) { if (!(a[0] instanceof RangeRef)) throw E.VALUE; return !!(ctx.isFormula && ctx.isFormula(a[0].sheetId, a[0].r1, a[0].c1)); }, { min: 1, max: 1 });
    def('NA', function () { throw E.NA; }, { max: 0 });
    def('TYPE', function (a, ctx) { var v = a[0]; if (isRange(v) && !(v instanceof RangeRef && v.h() === 1 && v.w() === 1)) return 64; v = rawScalar(a, ctx); return typeof v === 'number' || v === null ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 4 : 16; }, { min: 1, max: 1 });
    def('ERROR.TYPE', function (a, ctx) { var v = rawScalar(a, ctx); var codes = ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A']; if (!(v instanceof XErr)) throw E.NA; var i = codes.indexOf(v.code); return i === -1 ? 8 : i + 1; }, { min: 1, max: 1 });
    isFn('ISFINITE_INTERNAL', function () { return true; });

    // ========================================================== pencarian
    function lookupEq(a, b) {
        if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
        return F.compare('=', a, b) === true && typeof a === typeof b;
    }
    /**
     * lookupEq(v, x) dengan x tetap. Ribuan VLOOKUP teks masing-masing memindai
     * ribuan baris; toLowerCase() dua sisi di setiap perbandingan membuat jutaan
     * string sementara per hitung ulang. Di sini x cukup dikecilkan sekali, dan
     * untuk x ASCII panjang yang berbeda pasti tidak sama (huruf kecil tidak
     * pernah mengubah panjang hasil yang ASCII), jadi dilewati tanpa alokasi.
     */
    function eqTo(x) {
        if (typeof x !== 'string') return function (v) { return lookupEq(v, x); };
        var xl = x.toLowerCase(), ascii = !/[^\x00-\x7f]/.test(x);
        return function (v) {
            return typeof v === 'string' && (v === x || ((!ascii || v.length === x.length) && v.toLowerCase() === xl));
        };
    }
    function matchExact(list, x, wildcard) {
        var re = wildcard && typeof x === 'string' && /[*?~]/.test(x) ? wildcardRegex(x) : null;
        var eq = re ? null : eqTo(x);
        for (var i = 0; i < list.length; i++) {
            var v = list[i];
            if (re ? (typeof v === 'string' && re.test(v)) : eq(v)) return i;
        }
        return -1;
    }
    function matchApprox(list, x, desc) {
        // Pencarian biner: posisi terakhir dengan nilai <= x (atau >= x untuk urutan menurun).
        var lo = 0, hi = list.length - 1, found = -1;
        while (lo <= hi) {
            var mid = (lo + hi) >> 1;
            var v = list[mid];
            if (v === null || typeof v !== typeof x) {
                // Lewati sel yang tipenya berbeda secara linear.
                var j = mid;
                while (j <= hi && (list[j] === null || typeof list[j] !== typeof x)) j++;
                if (j > hi) { hi = mid - 1; continue; }
                v = list[j];
                mid = j;
            }
            var cmpLE = desc ? F.compare('>=', v, x) : F.compare('<=', v, x);
            if (cmpLE) { found = mid; lo = mid + 1; } else hi = mid - 1;
        }
        return found;
    }
    F.matchExact = matchExact;

    function vh(a, ctx, vertical) {
        var x = S(a[0], ctx);
        if (x instanceof XErr) throw x;
        var g = grid(a[1], ctx);
        var idx = Math.floor(num(a[2], ctx));
        var approx = a.length > 3 && a[3] !== null ? bool(a[3], ctx) : true;
        var keys = !vertical ? g[0] : a[1] instanceof RangeRef && ctx.rangeFirstCol ? ctx.rangeFirstCol(a[1], g) : g.map(function (r) { return r[0]; });
        if (idx < 1 || idx > (vertical ? g[0].length : g.length)) throw idx < 1 ? E.VALUE : E.REF;
        var pos = approx ? matchApprox(keys, x) : matchExact(keys, x, true);
        if (pos === -1) throw E.NA;
        var v = vertical ? g[pos][idx - 1] : g[idx - 1][pos];
        return v === undefined ? null : v;
    }
    F.FN.VLOOKUP = { fn: function (a, ctx) { return vh(a, ctx, true); }, min: 3, max: 4 };
    F.FN.HLOOKUP = { fn: function (a, ctx) { return vh(a, ctx, false); }, min: 3, max: 4 };
    def('LOOKUP', function (a, ctx) {
        var x = S(a[0], ctx);
        var g = grid(a[1], ctx);
        var vertical = g.length >= (g[0] || []).length;
        var keys = vertical ? g.map(function (r) { return r[0]; }) : g[0];
        var pos = matchApprox(keys, x);
        if (pos === -1) throw E.NA;
        if (a.length > 2) { var res = flatVals(a[2], ctx); return res[pos] === undefined ? E.NA : res[pos]; }
        return vertical ? g[pos][g[0].length - 1] : g[g.length - 1][pos];
    }, { min: 2, max: 3 });
    def('MATCH', function (a, ctx) {
        var x = S(a[0], ctx);
        if (x instanceof XErr) throw x;
        var list = flatVals(a[1], ctx);
        var type = a.length > 2 && a[2] !== null ? Math.sign(num(a[2], ctx)) : 1;
        var pos = type === 0 ? matchExact(list, x, true) : matchApprox(list, x, type < 0);
        if (pos === -1) throw E.NA;
        return pos + 1;
    }, { min: 2, max: 3 });
    def('XMATCH', function (a, ctx) {
        var x = S(a[0], ctx), list = flatVals(a[1], ctx);
        var mode = opt(a, 2, 0, ctx, num), search = opt(a, 3, 1, ctx, num);
        var pos = xfind(list, x, mode, search);
        if (pos === -1) throw E.NA;
        return pos + 1;
    }, { min: 2, max: 4 });
    function xfind(list, x, mode, search) {
        var order = [];
        for (var i = 0; i < list.length; i++) order.push(i);
        if (search < 0) order.reverse();
        var re = mode === 2 && typeof x === 'string' ? wildcardRegex(x) : null;
        var eq = re ? null : eqTo(x);
        var best = -1;
        for (var k = 0; k < order.length; k++) {
            var idx = order[k], v = list[idx];
            if (re ? (typeof v === 'string' && re.test(v)) : eq(v)) return idx;
            if (mode === -1 && v !== null && typeof v === typeof x && F.compare('<', v, x) && (best === -1 || F.compare('>', v, list[best]))) best = idx;
            if (mode === 1 && v !== null && typeof v === typeof x && F.compare('>', v, x) && (best === -1 || F.compare('<', v, list[best]))) best = idx;
        }
        return best;
    }
    def('XLOOKUP', function (a, ctx) {
        var x = S(a[0], ctx);
        if (x instanceof XErr) throw x;
        var lg = grid(a[1], ctx), rg = grid(a[2], ctx);
        var vertical = lg.length > 1 || (lg[0] || []).length === 1;
        var list = !vertical ? lg[0] : a[1] instanceof RangeRef && ctx.rangeFirstCol ? ctx.rangeFirstCol(a[1], lg) : lg.map(function (r) { return r[0]; });
        var pos = xfind(list, x, opt(a, 4, 0, ctx, num), opt(a, 5, 1, ctx, num));
        if (pos === -1) {
            if (a.length > 3 && a[3] !== null) return a[3];
            throw E.NA;
        }
        if (vertical) {
            if (!rg[pos]) throw E.VALUE;
            return rg[0].length === 1 ? rg[pos][0] : new Arr([rg[pos]]);
        }
        if (rg.length === 1) return rg[0][pos];
        return new Arr(rg.map(function (r) { return [r[pos]]; }));
    }, { min: 3, max: 6 });
    def('INDEX', function (a, ctx) {
        var ref = a[0];
        var r = Math.floor(opt(a, 1, 0, ctx, num)), c = Math.floor(opt(a, 2, 0, ctx, num));
        if (r < 0 || c < 0) throw E.VALUE;
        if (ref instanceof RangeRef) {
            var h = ref.h(), w = ref.w();
            if (h === 1 && a.length === 2) { c = r; r = 1; }
            if (r > h || c > w) throw E.REF;
            if (r === 0 && c === 0) return ref;
            if (r === 0) return new RangeRef(ref.sheetId, ref.r1, ref.c1 + c - 1, ref.r2, ref.c1 + c - 1);
            if (c === 0) return w === 1 ? new RangeRef(ref.sheetId, ref.r1 + r - 1, ref.c1, ref.r1 + r - 1, ref.c1) : new RangeRef(ref.sheetId, ref.r1 + r - 1, ref.c1, ref.r1 + r - 1, ref.c2);
            return new RangeRef(ref.sheetId, ref.r1 + r - 1, ref.c1 + c - 1, ref.r1 + r - 1, ref.c1 + c - 1);
        }
        var g = grid(ref, ctx);
        if (g.length === 1 && a.length === 2) { c = r; r = 1; }
        if (r === 0) r = 1;
        if (c === 0) c = 1;
        if (!g[r - 1] || g[r - 1][c - 1] === undefined) throw E.REF;
        return g[r - 1][c - 1];
    }, { min: 2, max: 4 });
    def('ROW', function (a, ctx) { if (!a.length || a[0] === null) return ctx.row + 1; if (!(a[0] instanceof RangeRef)) throw E.VALUE; return a[0].r1 + 1; }, { max: 1 });
    def('COLUMN', function (a, ctx) { if (!a.length || a[0] === null) return ctx.col + 1; if (!(a[0] instanceof RangeRef)) throw E.VALUE; return a[0].c1 + 1; }, { max: 1 });
    def('ROWS', function (a, ctx) { return a[0] instanceof RangeRef ? a[0].h() : grid(a[0], ctx).length; }, { min: 1, max: 1 });
    def('COLUMNS', function (a, ctx) { return a[0] instanceof RangeRef ? a[0].w() : (grid(a[0], ctx)[0] || []).length; }, { min: 1, max: 1 });
    def('ADDRESS', function (a, ctx) {
        var r = Math.floor(num(a[0], ctx)) - 1, c = Math.floor(num(a[1], ctx)) - 1, abs = opt(a, 2, 1, ctx, num), a1 = opt(a, 3, true, ctx, bool), sheet = opt(a, 4, null, ctx, str);
        if (r < 0 || c < 0) throw E.VALUE;
        var ref = a1 ? F.addr(r, c, abs === 1 || abs === 2, abs === 1 || abs === 3) : 'R' + (r + 1) + 'C' + (c + 1);
        return (sheet ? F.quoteSheet(sheet) + '!' : '') + ref;
    }, { min: 2, max: 5 });
    def('INDIRECT', function (a, ctx) {
        var txt = str(a[0], ctx);
        var p = F.parseRange(txt);
        if (!p) {
            var named = ctx.resolveName ? ctx.resolveName(txt) : null;
            if (named instanceof RangeRef) return named;
            throw E.REF;
        }
        var sid = p.sheet ? ctx.sheetByName(p.sheet) : ctx.sheetId;
        if (sid === null || sid === undefined) throw E.REF;
        return new RangeRef(sid, p.r1, p.c1, p.r2, p.c2);
    }, { min: 1, max: 2, volatile: true });
    def('OFFSET', function (a, ctx) {
        var ref = a[0];
        if (!(ref instanceof RangeRef)) throw E.VALUE;
        var dr = Math.floor(num(a[1], ctx)), dc = Math.floor(num(a[2], ctx));
        var h = Math.floor(opt(a, 3, ref.h(), ctx, num)), w = Math.floor(opt(a, 4, ref.w(), ctx, num));
        var r1 = ref.r1 + dr, c1 = ref.c1 + dc;
        if (r1 < 0 || c1 < 0 || h < 1 || w < 1) throw E.REF;
        return new RangeRef(ref.sheetId, r1, c1, r1 + h - 1, c1 + w - 1);
    }, { min: 3, max: 5, volatile: true });
    def('HYPERLINK', function (a, ctx) { return a.length > 1 ? S(a[1], ctx) : str(a[0], ctx); }, { min: 1, max: 2 });

    def('FILTER', function (a, ctx) {
        var g = grid(a[0], ctx), inc = grid(a[1], ctx);
        var byRow = inc.length === g.length;
        var out = [];
        if (byRow) g.forEach(function (row, r) { var m = inc[r][0]; if (m instanceof XErr) throw m; if (toBool(m === null ? false : m)) out.push(row); });
        else {
            var cols = [];
            (inc[0] || []).forEach(function (m, c) { if (toBool(m === null ? false : m)) cols.push(c); });
            if (cols.length) out = g.map(function (row) { return cols.map(function (c) { return row[c]; }); });
        }
        if (!out.length) { if (a.length > 2) return S(a[2], ctx); throw E.CALC; }
        return new Arr(out);
    }, { min: 2, max: 3 });
    def('SORT', function (a, ctx) {
        var g = grid(a[0], ctx).map(function (r) { return r.slice(); });
        var idx = Math.floor(opt(a, 1, 1, ctx, num)) - 1, order = opt(a, 2, 1, ctx, num), byCol = opt(a, 3, false, ctx, bool);
        if (byCol) g = g[0].map(function (_, c) { return g.map(function (r) { return r[c]; }); });
        g.sort(function (x, y) {
            var p = x[idx], q = y[idx];
            if (p === null && q === null) return 0;
            if (p === null) return 1;
            if (q === null) return -1;
            var c = F.compare('<', p, q) ? -1 : F.compare('>', p, q) ? 1 : 0;
            return order < 0 ? -c : c;
        });
        if (byCol) g = g[0].map(function (_, c) { return g.map(function (r) { return r[c]; }); });
        return new Arr(g);
    }, { min: 1, max: 4 });
    def('UNIQUE', function (a, ctx) {
        var g = grid(a[0], ctx);
        var once = opt(a, 2, false, ctx, bool);
        var counts = {}, order = [];
        g.forEach(function (row) {
            var key = JSON.stringify(row.map(function (v) { return typeof v === 'string' ? v.toLowerCase() : v; }));
            if (!counts[key]) { counts[key] = { n: 0, row: row }; order.push(key); }
            counts[key].n++;
        });
        var rows = order.filter(function (k) { return !once || counts[k].n === 1; }).map(function (k) { return counts[k].row; });
        if (!rows.length) throw E.CALC;
        return new Arr(rows);
    }, { min: 1, max: 3 });

    // ========================================================== tanggal
    function serialArg(v, ctx) {
        var x = S(v, ctx);
        if (typeof x === 'string') { var d = F.parseDateText(x); if (d === null) throw E.VALUE; return d; }
        var n = toNum(x);
        if (n < 0) throw E.NUM;
        return n;
    }
    def('TODAY', function () { return Math.floor(F.nowSerial()); }, { max: 0, volatile: true });
    def('NOW', function () { return F.nowSerial(); }, { max: 0, volatile: true });
    def('DATE', function (a, ctx) {
        var y = Math.floor(num(a[0], ctx)), m = Math.floor(num(a[1], ctx)), d = Math.floor(num(a[2], ctx));
        if (y < 1900) y += 1900;
        var dt = new Date(Date.UTC(y, m - 1, 1));
        var s = F.dateToSerial(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1) + d - 1;
        if (s < 0) throw E.NUM;
        return s;
    }, { min: 3, max: 3 });
    def('TIME', function (a, ctx) { var t = (num(a[0], ctx) * 3600 + num(a[1], ctx) * 60 + num(a[2], ctx)) / 86400; if (t < 0) throw E.NUM; return t - Math.floor(t); }, { min: 3, max: 3 });
    def('YEAR', function (a, ctx) { return F.serialToDate(serialArg(a[0], ctx)).y; }, { min: 1, max: 1 });
    def('MONTH', function (a, ctx) { return F.serialToDate(serialArg(a[0], ctx)).m; }, { min: 1, max: 1 });
    def('DAY', function (a, ctx) { return F.serialToDate(serialArg(a[0], ctx)).d; }, { min: 1, max: 1 });
    def('HOUR', function (a, ctx) { return F.serialToDate(serialArg(a[0], ctx)).H; }, { min: 1, max: 1 });
    def('MINUTE', function (a, ctx) { return F.serialToDate(serialArg(a[0], ctx)).M; }, { min: 1, max: 1 });
    def('SECOND', function (a, ctx) { return F.serialToDate(serialArg(a[0], ctx)).S; }, { min: 1, max: 1 });
    def('WEEKDAY', function (a, ctx) {
        var dow = F.serialToDate(serialArg(a[0], ctx)).dow;
        var t = opt(a, 1, 1, ctx, num);
        if (t === 1 || t === 17) return dow + 1;
        if (t === 2 || t === 11) return ((dow + 6) % 7) + 1;
        if (t === 3) return (dow + 6) % 7;
        if (t >= 12 && t <= 16) return ((dow - (t - 10) + 7) % 7) + 1;
        throw E.NUM;
    }, { min: 1, max: 2 });
    def('WEEKNUM', function (a, ctx) {
        var s = Math.floor(serialArg(a[0], ctx)), t = opt(a, 1, 1, ctx, num);
        var dt = F.serialToDate(s);
        var jan1 = F.dateToSerial(dt.y, 1, 1);
        var startDow = t === 2 || t === 11 ? 1 : 0;
        var jan1dow = F.serialToDate(jan1).dow;
        var offset = (jan1dow - startDow + 7) % 7;
        return Math.floor((s - jan1 + offset) / 7) + 1;
    }, { min: 1, max: 2 });
    def('ISOWEEKNUM', function (a, ctx) {
        var s = Math.floor(serialArg(a[0], ctx));
        var dt = F.serialToDate(s);
        var dow = (dt.dow + 6) % 7;
        var thursday = s - dow + 3;
        var ty = F.serialToDate(thursday).y;
        return Math.floor((thursday - F.dateToSerial(ty, 1, 1)) / 7) + 1;
    }, { min: 1, max: 1 });
    function addMonths(s, n) {
        var dt = F.serialToDate(s);
        var total = dt.y * 12 + dt.m - 1 + n;
        var y = Math.floor(total / 12), m = total % 12 + 1;
        var dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
        return F.dateToSerial(y, m, Math.min(dt.d, dim));
    }
    def('EDATE', function (a, ctx) { return addMonths(Math.floor(serialArg(a[0], ctx)), Math.trunc(num(a[1], ctx))); }, { min: 2, max: 2 });
    def('EOMONTH', function (a, ctx) {
        var dt = F.serialToDate(Math.floor(serialArg(a[0], ctx)));
        var total = dt.y * 12 + dt.m - 1 + Math.trunc(num(a[1], ctx));
        var y = Math.floor(total / 12), m = total % 12 + 1;
        return F.dateToSerial(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate());
    }, { min: 2, max: 2 });
    def('DAYS', function (a, ctx) { return Math.floor(serialArg(a[0], ctx)) - Math.floor(serialArg(a[1], ctx)); }, { min: 2, max: 2 });
    def('DATEDIF', function (a, ctx) {
        var s1 = Math.floor(serialArg(a[0], ctx)), s2 = Math.floor(serialArg(a[1], ctx)), u = str(a[2], ctx).toUpperCase();
        if (s1 > s2) throw E.NUM;
        var d1 = F.serialToDate(s1), d2 = F.serialToDate(s2);
        var months = (d2.y - d1.y) * 12 + d2.m - d1.m - (d2.d < d1.d ? 1 : 0);
        switch (u) {
            case 'D': return s2 - s1;
            case 'M': return months;
            case 'Y': return Math.floor(months / 12);
            case 'YM': return months % 12;
            case 'MD': var ref = addMonths(s1, months); return s2 - ref;
            case 'YD': var yref = addMonths(s1, Math.floor(months / 12) * 12); return s2 - yref;
        }
        throw E.NUM;
    }, { min: 3, max: 3 });
    function holidaysSet(v, ctx) {
        var set = {};
        if (v !== undefined && v !== null) flatVals(v, ctx).forEach(function (h) { if (typeof h === 'number') set[Math.floor(h)] = true; });
        return set;
    }
    function isWorkday(s, hol) { var dow = F.serialToDate(s).dow; return dow !== 0 && dow !== 6 && !hol[s]; }
    def('NETWORKDAYS', function (a, ctx) {
        var s1 = Math.floor(serialArg(a[0], ctx)), s2 = Math.floor(serialArg(a[1], ctx));
        var hol = holidaysSet(a[2], ctx);
        var sign = 1;
        if (s1 > s2) { var t = s1; s1 = s2; s2 = t; sign = -1; }
        if (s2 - s1 > 100000) throw E.NUM;
        var n = 0;
        for (var s = s1; s <= s2; s++) if (isWorkday(s, hol)) n++;
        return sign * n;
    }, { min: 2, max: 3 });
    def('WORKDAY', function (a, ctx) {
        var s = Math.floor(serialArg(a[0], ctx)), days = Math.trunc(num(a[1], ctx));
        var hol = holidaysSet(a[2], ctx);
        var step = days < 0 ? -1 : 1;
        var left = Math.abs(days);
        if (left > 100000) throw E.NUM;
        while (left > 0) { s += step; if (isWorkday(s, hol)) left--; }
        return s;
    }, { min: 2, max: 3 });
    def('DATEVALUE', function (a, ctx) { var d = F.parseDateText(str(a[0], ctx)); if (d === null) throw E.VALUE; return Math.floor(d); }, { min: 1, max: 1 });
    def('TIMEVALUE', function (a, ctx) { var d = F.parseDateText(str(a[0], ctx)); if (d === null) throw E.VALUE; return d - Math.floor(d); }, { min: 1, max: 1 });
    def('YEARFRAC', function (a, ctx) {
        var s1 = Math.floor(serialArg(a[0], ctx)), s2 = Math.floor(serialArg(a[1], ctx)), basis = opt(a, 2, 0, ctx, num);
        if (s1 > s2) { var t = s1; s1 = s2; s2 = t; }
        var d1 = F.serialToDate(s1), d2 = F.serialToDate(s2);
        if (basis === 0 || basis === 4) {
            var dd1 = Math.min(d1.d, 30), dd2 = d2.d;
            if (basis === 0 && dd2 === 31 && dd1 >= 30) dd2 = 30;
            if (basis === 4) dd2 = Math.min(dd2, 30);
            return ((d2.y - d1.y) * 360 + (d2.m - d1.m) * 30 + (dd2 - dd1)) / 360;
        }
        if (basis === 2) return (s2 - s1) / 360;
        if (basis === 3) return (s2 - s1) / 365;
        return (s2 - s1) / 365.25;
    }, { min: 2, max: 3 });

    // ========================================================= keuangan
    function pmt(rate, nper, pv, fv, type) {
        if (rate === 0) return -(pv + fv) / nper;
        var pow = Math.pow(1 + rate, nper);
        return -(rate * (fv + pv * pow)) / ((1 + rate * type) * (pow - 1));
    }
    function fvf(rate, nper, p, pv, type) {
        if (rate === 0) return -(pv + p * nper);
        var pow = Math.pow(1 + rate, nper);
        return -(pv * pow + p * (1 + rate * type) * (pow - 1) / rate);
    }
    def('PMT', function (a, ctx) { var n = num(a[1], ctx); if (n === 0) throw E.NUM; return pmt(num(a[0], ctx), n, num(a[2], ctx), opt(a, 3, 0, ctx, num), opt(a, 4, 0, ctx, num) ? 1 : 0); }, { min: 3, max: 5 });
    def('FV', function (a, ctx) { return fvf(num(a[0], ctx), num(a[1], ctx), num(a[2], ctx), opt(a, 3, 0, ctx, num), opt(a, 4, 0, ctx, num) ? 1 : 0); }, { min: 3, max: 5 });
    def('PV', function (a, ctx) {
        var r = num(a[0], ctx), n = num(a[1], ctx), p = num(a[2], ctx), fv = opt(a, 3, 0, ctx, num), t = opt(a, 4, 0, ctx, num) ? 1 : 0;
        if (r === 0) return -(fv + p * n);
        var pow = Math.pow(1 + r, n);
        return -(fv + p * (1 + r * t) * (pow - 1) / r) / pow;
    }, { min: 3, max: 5 });
    def('NPER', function (a, ctx) {
        var r = num(a[0], ctx), p = num(a[1], ctx), pv = num(a[2], ctx), fv = opt(a, 3, 0, ctx, num), t = opt(a, 4, 0, ctx, num) ? 1 : 0;
        if (r === 0) { if (p === 0) throw E.NUM; return -(pv + fv) / p; }
        var z = p * (1 + r * t) / r;
        var v = (-fv + z) / (pv + z);
        if (v <= 0) throw E.NUM;
        return Math.log(v) / Math.log(1 + r);
    }, { min: 3, max: 5 });
    function ipmt(r, per, n, pv, fv, t) {
        var p = pmt(r, n, pv, fv, t);
        var interest = per === 1 ? (t ? 0 : -pv * r) : (t ? fvf(r, per - 2, p, pv, 1) - p : fvf(r, per - 1, p, pv, 0)) * r;
        return interest;
    }
    def('IPMT', function (a, ctx) { var per = num(a[1], ctx), n = num(a[2], ctx); if (per < 1 || per > n) throw E.NUM; return ipmt(num(a[0], ctx), per, n, num(a[3], ctx), opt(a, 4, 0, ctx, num), opt(a, 5, 0, ctx, num) ? 1 : 0); }, { min: 4, max: 6 });
    def('PPMT', function (a, ctx) { var r = num(a[0], ctx), per = num(a[1], ctx), n = num(a[2], ctx), pv = num(a[3], ctx), fv = opt(a, 4, 0, ctx, num), t = opt(a, 5, 0, ctx, num) ? 1 : 0; if (per < 1 || per > n) throw E.NUM; return pmt(r, n, pv, fv, t) - ipmt(r, per, n, pv, fv, t); }, { min: 4, max: 6 });
    def('RATE', function (a, ctx) {
        var n = num(a[0], ctx), p = num(a[1], ctx), pv = num(a[2], ctx), fv = opt(a, 3, 0, ctx, num), t = opt(a, 4, 0, ctx, num) ? 1 : 0, guess = opt(a, 5, 0.1, ctx, num);
        var r = guess;
        for (var i = 0; i < 100; i++) {
            var y = pv * Math.pow(1 + r, n) + p * (1 + r * t) * (Math.pow(1 + r, n) - 1) / (r || 1e-10) + fv;
            var dr = 1e-6;
            var r2 = r + dr;
            var y2 = pv * Math.pow(1 + r2, n) + p * (1 + r2 * t) * (Math.pow(1 + r2, n) - 1) / r2 + fv;
            var deriv = (y2 - y) / dr;
            if (!deriv) break;
            var nr = r - y / deriv;
            if (!isFinite(nr)) throw E.NUM;
            if (Math.abs(nr - r) < 1e-10) return nr;
            r = nr;
        }
        throw E.NUM;
    }, { min: 3, max: 6 });
    def('NPV', function (a, ctx) {
        var r = num(a[0], ctx);
        return collect(a.slice(1), ctx).reduce(function (s, v, i) { return s + v / Math.pow(1 + r, i + 1); }, 0);
    }, { min: 2 });
    def('IRR', function (a, ctx) {
        var v = collect([a[0]], ctx), r = opt(a, 1, 0.1, ctx, num);
        if (!v.some(function (x) { return x > 0; }) || !v.some(function (x) { return x < 0; })) throw E.NUM;
        for (var i = 0; i < 200; i++) {
            var f = 0, df = 0;
            for (var k = 0; k < v.length; k++) { f += v[k] / Math.pow(1 + r, k); df -= k * v[k] / Math.pow(1 + r, k + 1); }
            if (!df) break;
            var nr = r - f / df;
            if (!isFinite(nr) || nr <= -1) throw E.NUM;
            if (Math.abs(nr - r) < 1e-10) return nr;
            r = nr;
        }
        throw E.NUM;
    }, { min: 1, max: 2 });
    def('SLN', function (a, ctx) { var life = num(a[2], ctx); if (life === 0) throw E.DIV0; return (num(a[0], ctx) - num(a[1], ctx)) / life; }, { min: 3, max: 3 });
    def('SYD', function (a, ctx) { var c = num(a[0], ctx), s = num(a[1], ctx), l = num(a[2], ctx), p = num(a[3], ctx); if (l <= 0 || p < 1 || p > l) throw E.NUM; return (c - s) * (l - p + 1) * 2 / (l * (l + 1)); }, { min: 4, max: 4 });
    def('EFFECT', function (a, ctx) { var r = num(a[0], ctx), n = Math.floor(num(a[1], ctx)); if (r <= 0 || n < 1) throw E.NUM; return Math.pow(1 + r / n, n) - 1; }, { min: 2, max: 2 });

    delete F.FN.ISFINITE_INTERNAL;

    /**
     * Metadata ringkas untuk pelengkap otomatis dan dialog "Sisipkan Fungsi".
     * [nama, kategori, sintaks]. Deskripsi diambil dari kamus (x_fn_<nama>).
     */
    F.FN_INFO = [
        ['SUM', 'math', 'SUM(number1, [number2], …)'], ['AVERAGE', 'stat', 'AVERAGE(number1, [number2], …)'], ['COUNT', 'stat', 'COUNT(value1, [value2], …)'],
        ['COUNTA', 'stat', 'COUNTA(value1, [value2], …)'], ['MAX', 'stat', 'MAX(number1, [number2], …)'], ['MIN', 'stat', 'MIN(number1, [number2], …)'],
        ['IF', 'logic', 'IF(logical_test, value_if_true, [value_if_false])'], ['IFS', 'logic', 'IFS(test1, value1, [test2, value2], …)'],
        ['IFERROR', 'logic', 'IFERROR(value, value_if_error)'], ['AND', 'logic', 'AND(logical1, [logical2], …)'], ['OR', 'logic', 'OR(logical1, [logical2], …)'],
        ['NOT', 'logic', 'NOT(logical)'], ['SWITCH', 'logic', 'SWITCH(expression, value1, result1, …, [default])'],
        ['VLOOKUP', 'lookup', 'VLOOKUP(lookup_value, table_array, col_index, [range_lookup])'], ['HLOOKUP', 'lookup', 'HLOOKUP(lookup_value, table_array, row_index, [range_lookup])'],
        ['XLOOKUP', 'lookup', 'XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode])'],
        ['INDEX', 'lookup', 'INDEX(array, row_num, [column_num])'], ['MATCH', 'lookup', 'MATCH(lookup_value, lookup_array, [match_type])'],
        ['FILTER', 'lookup', 'FILTER(array, include, [if_empty])'], ['SORT', 'lookup', 'SORT(array, [sort_index], [sort_order], [by_col])'], ['UNIQUE', 'lookup', 'UNIQUE(array, [by_col], [exactly_once])'],
        ['SUMIF', 'math', 'SUMIF(range, criteria, [sum_range])'], ['SUMIFS', 'math', 'SUMIFS(sum_range, criteria_range1, criteria1, …)'],
        ['COUNTIF', 'stat', 'COUNTIF(range, criteria)'], ['COUNTIFS', 'stat', 'COUNTIFS(criteria_range1, criteria1, …)'],
        ['AVERAGEIF', 'stat', 'AVERAGEIF(range, criteria, [average_range])'], ['AVERAGEIFS', 'stat', 'AVERAGEIFS(average_range, criteria_range1, criteria1, …)'],
        ['ROUND', 'math', 'ROUND(number, num_digits)'], ['ROUNDUP', 'math', 'ROUNDUP(number, num_digits)'], ['ROUNDDOWN', 'math', 'ROUNDDOWN(number, num_digits)'],
        ['SUMPRODUCT', 'math', 'SUMPRODUCT(array1, [array2], …)'], ['ABS', 'math', 'ABS(number)'], ['MOD', 'math', 'MOD(number, divisor)'], ['POWER', 'math', 'POWER(number, power)'],
        ['SQRT', 'math', 'SQRT(number)'], ['INT', 'math', 'INT(number)'], ['RAND', 'math', 'RAND()'], ['RANDBETWEEN', 'math', 'RANDBETWEEN(bottom, top)'], ['SUBTOTAL', 'math', 'SUBTOTAL(function_num, ref1, …)'],
        ['MEDIAN', 'stat', 'MEDIAN(number1, …)'], ['MODE', 'stat', 'MODE(number1, …)'], ['STDEV', 'stat', 'STDEV(number1, …)'], ['LARGE', 'stat', 'LARGE(array, k)'], ['SMALL', 'stat', 'SMALL(array, k)'], ['RANK', 'stat', 'RANK(number, ref, [order])'],
        ['CONCAT', 'text', 'CONCAT(text1, [text2], …)'], ['TEXTJOIN', 'text', 'TEXTJOIN(delimiter, ignore_empty, text1, …)'], ['LEFT', 'text', 'LEFT(text, [num_chars])'], ['RIGHT', 'text', 'RIGHT(text, [num_chars])'],
        ['MID', 'text', 'MID(text, start_num, num_chars)'], ['LEN', 'text', 'LEN(text)'], ['UPPER', 'text', 'UPPER(text)'], ['LOWER', 'text', 'LOWER(text)'], ['PROPER', 'text', 'PROPER(text)'], ['TRIM', 'text', 'TRIM(text)'],
        ['SUBSTITUTE', 'text', 'SUBSTITUTE(text, old_text, new_text, [instance])'], ['FIND', 'text', 'FIND(find_text, within_text, [start_num])'], ['SEARCH', 'text', 'SEARCH(find_text, within_text, [start_num])'],
        ['TEXT', 'text', 'TEXT(value, format_text)'], ['VALUE', 'text', 'VALUE(text)'], ['TEXTSPLIT', 'text', 'TEXTSPLIT(text, col_delimiter, [row_delimiter])'],
        ['TODAY', 'date', 'TODAY()'], ['NOW', 'date', 'NOW()'], ['DATE', 'date', 'DATE(year, month, day)'], ['YEAR', 'date', 'YEAR(serial_number)'], ['MONTH', 'date', 'MONTH(serial_number)'], ['DAY', 'date', 'DAY(serial_number)'],
        ['WEEKDAY', 'date', 'WEEKDAY(serial_number, [return_type])'], ['DATEDIF', 'date', 'DATEDIF(start_date, end_date, unit)'], ['EDATE', 'date', 'EDATE(start_date, months)'], ['EOMONTH', 'date', 'EOMONTH(start_date, months)'],
        ['NETWORKDAYS', 'date', 'NETWORKDAYS(start_date, end_date, [holidays])'], ['WORKDAY', 'date', 'WORKDAY(start_date, days, [holidays])'],
        ['PMT', 'finance', 'PMT(rate, nper, pv, [fv], [type])'], ['FV', 'finance', 'FV(rate, nper, pmt, [pv], [type])'], ['PV', 'finance', 'PV(rate, nper, pmt, [fv], [type])'],
        ['NPV', 'finance', 'NPV(rate, value1, …)'], ['IRR', 'finance', 'IRR(values, [guess])'], ['RATE', 'finance', 'RATE(nper, pmt, pv, [fv], [type], [guess])'],
        ['ISBLANK', 'info', 'ISBLANK(value)'], ['ISNUMBER', 'info', 'ISNUMBER(value)'], ['ISTEXT', 'info', 'ISTEXT(value)'], ['ISERROR', 'info', 'ISERROR(value)'],
        ['SEQUENCE', 'math', 'SEQUENCE(rows, [columns], [start], [step])'], ['TRANSPOSE', 'lookup', 'TRANSPOSE(array)'], ['INDIRECT', 'lookup', 'INDIRECT(ref_text)'], ['OFFSET', 'lookup', 'OFFSET(reference, rows, cols, [height], [width])']
    ];

    if (typeof module !== 'undefined' && module.exports) module.exports = F;
})(typeof window !== 'undefined' ? window : globalThis);
