/**
 * tools/office/shared/office-ai.js — panel AI bersama Sinerli Dokum, Sinerli Hitara, Sinerli Present.
 *
 * Satu panel untuk ketiga aplikasi. Yang berbeda per aplikasi hanyalah ADAPTOR:
 * bagaimana "yang sedang dipilih" dibaca (sel, paragraf, atau kotak teks) dan
 * bagaimana hasilnya ditulis balik sebagai satu langkah undo. Lihat pemanggilan
 * SO.ai.register() di sinedoc-ai.js / sineex-ai.js / sineslide-ai.js.
 *
 * Alur kerjanya sengaja: PILIH → JALANKAN → TINJAU → TERAPKAN.
 * Hasil AI tidak pernah langsung menimpa pekerjaan orang. Selain lebih aman,
 * peninjauan juga membuat pemakaian token terasa jujur: pengguna melihat persis
 * apa yang dibayar sebelum menerimanya.
 *
 * Irit token ditegakkan di server (tools/office/api/ai.php); di sini kita hanya
 * membantu: potongan kosong tidak dikirim, jumlah potongan dibatasi, dan sisa
 * kuota selalu terlihat sebelum tombol ditekan.
 */
(function (global) {
    'use strict';

    var SO = global.SO;
    if (!SO) return;

    var MAX_ITEMS = 60;          // cerminan OAI_MAX_ITEMS di server
    var API = SO.root + 'tools/office/api/ai.php';

    /**
     * Mode yang ditawarkan panel.
     *   apply  : hasilnya boleh menimpa dokumen (false = hanya dibaca)
     *   needs  : 'items' wajib ada yang dipilih, 'prompt' wajib ada instruksi
     *   apps   : dibatasi ke aplikasi tertentu bila diisi
     */
    var MODES = [
        { id: 'fix',       icon: 'fa-spell-check',          label: 'c_ai_m_fix',       apply: true,  needs: 'items' },
        { id: 'rewrite',   icon: 'fa-wand-magic-sparkles',  label: 'c_ai_m_rewrite',   apply: true,  needs: 'items' },
        { id: 'shorten',   icon: 'fa-compress',             label: 'c_ai_m_shorten',   apply: true,  needs: 'items' },
        { id: 'expand',    icon: 'fa-up-right-and-down-left-from-center', label: 'c_ai_m_expand', apply: true, needs: 'items' },
        { id: 'tone',      icon: 'fa-masks-theater',        label: 'c_ai_m_tone',      apply: true,  needs: 'both' },
        { id: 'translate', icon: 'fa-language',             label: 'c_ai_m_translate', apply: true,  needs: 'both' },
        { id: 'summarize', icon: 'fa-list-ul',              label: 'c_ai_m_summarize', apply: false, needs: 'items' },
        { id: 'formula',   icon: 'fa-square-root-variable', label: 'c_ai_m_formula',   apply: true,  needs: 'prompt', apps: ['sineex'] },
        { id: 'explain',   icon: 'fa-circle-question',      label: 'c_ai_m_explain',   apply: false, needs: 'items', apps: ['sineex'] },
        { id: 'custom',    icon: 'fa-pen-to-square',        label: 'c_ai_m_custom',    apply: true,  needs: 'both' }
    ];

    function modeById(id) {
        for (var i = 0; i < MODES.length; i++) if (MODES[i].id === id) return MODES[i];
        return null;
    }

    var ai = SO.ai = {
        adapter: null,
        quota: null,
        mode: 'fix',
        busy: false,
        last: null          // {mode, items, results}
    };

    /** Aplikasi memanggil ini sekali saat boot. */
    ai.register = function (adapter) {
        ai.adapter = adapter;
        ai.modes = MODES.filter(function (m) { return !m.apps || m.apps.indexOf(adapter.app) !== -1; });
        if (ai.modes.indexOf(modeById(ai.mode)) === -1) ai.mode = ai.modes[0].id;
    };

    // ============================================================ jaringan
    function request(body) {
        return fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': SO.ctx.apiKey || '' },
            credentials: 'same-origin',
            body: JSON.stringify(body)
        }).then(function (res) {
            return res.text().then(function (txt) {
                var data = null;
                try { data = JSON.parse(txt); } catch (e) {}
                if (!data) throw new Error(SO.t('c_err_server') + ' (' + res.status + ')');
                if (!data.success) {
                    var err = new Error(data.message || SO.t('c_err_server'));
                    err.code = data.code;
                    err.quota = data.quota;
                    throw err;
                }
                return data;
            });
        });
    }

    ai.fetchQuota = function () {
        if (!SO.ctx.apiKey) return Promise.resolve(null);
        return request({ action: 'quota' }).then(function (d) {
            ai.quota = d.quota;
            ai.topup = d.topup;
            paintQuota();
            return d.quota;
        }).catch(function () {
            if (panel && els.quota) els.quota.textContent = SO.t('c_ai_quota_unknown');
            return null;
        });
    };

    // =============================================================== panel
    var panel = null, els = {};

    function fmt(n) { return n == null ? '∞' : SO.fmtNum(n); }

    function build() {
        if (panel) return panel;
        panel = SO.el('aside', { class: 'so-ai', hidden: true });
        panel.innerHTML =
            '<div class="so-ai-head">' +
                '<i class="fas fa-wand-magic-sparkles"></i>' +
                '<h3 data-lang="c_ai_title"></h3>' +
                '<button type="button" class="so-tb-btn so-ai-close" data-lang-title="c_close"><i class="fas fa-xmark"></i></button>' +
            '</div>' +
            '<div class="so-ai-body">' +
                '<div class="so-ai-target"></div>' +
                '<div class="so-ai-modes"></div>' +
                '<textarea class="so-ai-prompt" rows="2"></textarea>' +
                '<button type="button" class="so-btn is-primary so-ai-run"><i class="fas fa-bolt"></i><span data-lang="c_ai_run"></span></button>' +
                '<div class="so-ai-results"></div>' +
            '</div>' +
            '<div class="so-ai-foot">' +
                '<div class="so-ai-bar"><span></span></div>' +
                // Teks awal diisi supaya kaki panel tidak tampil kosong selama
                // sisa kuota masih diambil — dan tetap masuk akal bila
                // pengambilannya gagal (mis. sedang luring).
                '<div class="so-ai-quota" data-lang="c_ai_quota_loading"></div>' +
                '<a class="so-ai-topup" target="_blank" rel="noopener"><i class="fas fa-plus"></i> <span data-lang="c_ai_topup"></span></a>' +
            '</div>';
        document.body.appendChild(panel);

        els = {
            target:  panel.querySelector('.so-ai-target'),
            modes:   panel.querySelector('.so-ai-modes'),
            prompt:  panel.querySelector('.so-ai-prompt'),
            run:     panel.querySelector('.so-ai-run'),
            results: panel.querySelector('.so-ai-results'),
            bar:     panel.querySelector('.so-ai-bar span'),
            quota:   panel.querySelector('.so-ai-quota'),
            topup:   panel.querySelector('.so-ai-topup')
        };

        panel.querySelector('.so-ai-close').addEventListener('click', function () { ai.close(); });
        els.run.addEventListener('click', function () { ai.run(); });
        els.prompt.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ai.run(); }
        });
        els.topup.href = SO.root + 'Dashboard/profile#ai-tokens';

        SO.onLang(function () { if (panel && !panel.hidden) { SO.applyI18n(panel); paintModes(); paintTarget(); paintQuota(); } });
        return panel;
    }

    function paintModes() {
        els.modes.innerHTML = '';
        (ai.modes || MODES).forEach(function (m) {
            var b = SO.el('button', {
                type: 'button',
                class: 'so-ai-mode' + (m.id === ai.mode ? ' is-active' : ''),
                html: '<i class="fas ' + m.icon + '"></i><span>' + SO.esc(SO.t(m.label)) + '</span>'
            });
            b.addEventListener('click', function () {
                ai.mode = m.id;
                paintModes();
                paintTarget();
                els.prompt.focus();
            });
            els.modes.appendChild(b);
        });
        var m = modeById(ai.mode);
        els.prompt.placeholder = SO.t(
            m && m.id === 'formula'   ? 'c_ai_ph_formula' :
            m && m.id === 'translate' ? 'c_ai_ph_translate' :
            m && m.id === 'tone'      ? 'c_ai_ph_tone' : 'c_ai_ph_default'
        );
    }

    /** Ringkasan apa yang akan dikerjakan, dibaca ulang dari adaptor tiap kali. */
    function paintTarget() {
        if (!ai.adapter) return;
        var m = modeById(ai.mode);
        var sel = collect();
        if (m && m.needs === 'prompt') {
            els.target.className = 'so-ai-target';
            els.target.innerHTML = '<i class="fas fa-location-crosshairs"></i> ' + SO.esc(sel && sel.label ? sel.label : SO.t('c_ai_target_cursor'));
            return;
        }
        if (!sel || !sel.items.length) {
            els.target.className = 'so-ai-target is-empty';
            els.target.innerHTML = '<i class="fas fa-hand-pointer"></i> ' + SO.esc(SO.t('c_ai_select_first'));
            return;
        }
        var over = sel.truncated ? ' ' + SO.t('c_ai_limit_note', { n: MAX_ITEMS }) : '';
        els.target.className = 'so-ai-target';
        els.target.innerHTML = '<i class="fas fa-object-group"></i> ' +
            SO.esc(SO.t('c_ai_target_n', { n: sel.items.length })) +
            (sel.label ? ' <b>' + SO.esc(sel.label) + '</b>' : '') + SO.esc(over);
    }

    function paintQuota() {
        if (!panel) return;
        if (!ai.quota) {
            els.quota.textContent = SO.t(SO.ctx.apiKey ? 'c_ai_quota_loading' : 'c_ai_quota_signin');
            return;
        }
        var q = ai.quota;
        if (!q.enabled) {
            // Paket Free belum punya jatah sama sekali. Menggambar bar "0 / 0"
            // hanya membingungkan; yang berguna adalah tahu dari paket mana
            // fitur ini tersedia.
            els.bar.style.width = '0%';
            els.quota.textContent = SO.t('c_ai_quota_locked');
            els.topup.hidden = true;
            return;
        }
        if (q.unlimited) {
            els.bar.style.width = '0%';
            els.quota.textContent = SO.t('c_ai_quota_unlimited');
            els.topup.hidden = true;
            return;
        }
        var pct = q.limit ? Math.min(100, Math.round(q.used / q.limit * 100)) : 100;
        els.bar.style.width = pct + '%';
        els.bar.parentNode.classList.toggle('is-low', q.limit > 0 && q.remaining / q.limit < 0.15);
        els.quota.textContent = SO.t('c_ai_quota_text', { used: fmt(q.used), limit: fmt(q.limit) }) +
            (q.topup > 0 ? ' · ' + SO.t('c_ai_quota_topup', { n: fmt(q.topup) }) : '');
        els.topup.hidden = false;
    }

    /** Membaca pilihan dari adaptor dan memangkasnya ke batas server. */
    function collect() {
        if (!ai.adapter || !ai.adapter.collect) return null;
        var sel;
        try { sel = ai.adapter.collect(ai.mode); } catch (e) { console.error(e); return null; }
        if (!sel) return null;
        sel.items = (sel.items || []).filter(function (it) { return it && String(it.text || '').trim() !== ''; });
        if (sel.items.length > MAX_ITEMS) {
            sel.items = sel.items.slice(0, MAX_ITEMS);
            sel.truncated = true;
        }
        return sel;
    }

    ai.open = function (mode) {
        build();
        if (mode) ai.mode = mode;
        panel.hidden = false;
        document.body.classList.add('so-ai-open');
        SO.applyI18n(panel);
        paintModes();
        paintTarget();
        paintQuota();
        ai.fetchQuota();
        setTimeout(function () { els.prompt.focus(); }, 40);
    };

    ai.close = function () {
        if (!panel) return;
        panel.hidden = true;
        document.body.classList.remove('so-ai-open');
        if (ai.adapter && ai.adapter.focus) ai.adapter.focus();
    };

    ai.toggle = function (mode) {
        if (panel && !panel.hidden && (!mode || mode === ai.mode)) ai.close();
        else ai.open(mode);
    };

    /** Menyegarkan ringkasan pilihan saat panel terbuka (dipanggil aplikasi). */
    ai.refreshTarget = function () {
        if (panel && !panel.hidden) paintTarget();
    };

    // ============================================================ menjalankan
    ai.run = function (mode, instruction) {
        build();
        if (mode) { ai.mode = mode; paintModes(); }
        if (instruction != null) els.prompt.value = instruction;
        if (ai.busy) return;

        var m = modeById(ai.mode);
        var prompt = els.prompt.value.trim();
        var sel = collect();

        if ((m.needs === 'items' || m.needs === 'both') && (!sel || !sel.items.length)) {
            SO.toast('c_ai_select_first', { type: 'warn' });
            paintTarget();
            return;
        }
        if ((m.needs === 'prompt' || m.needs === 'both') && !prompt) {
            SO.toast('c_ai_prompt_first', { type: 'warn' });
            els.prompt.focus();
            return;
        }

        ai.busy = true;
        els.run.disabled = true;
        els.run.classList.add('is-busy');
        els.results.innerHTML = '<div class="so-ai-loading"><i class="fas fa-circle-notch"></i> ' + SO.esc(SO.t('c_ai_working')) + '</div>';

        request({
            action: 'edit',
            app: ai.adapter.app,
            mode: ai.mode,
            lang: SO.lang(),
            instruction: prompt,
            items: (sel && sel.items) || [],
            context: (sel && sel.context) || {}
        }).then(function (data) {
            ai.quota = data.quota || ai.quota;
            paintQuota();
            ai.last = { mode: ai.mode, items: (sel && sel.items) || [], results: data.results, apply: m.apply };
            paintResults(data);
        }).catch(function (err) {
            if (err.quota) { ai.quota = err.quota; paintQuota(); }
            els.results.innerHTML = '';
            if (err.code === 'upgrade_required') showUpgrade();
            else SO.toast(err.message || 'c_err_generic', { type: 'error' });
        }).then(function () {
            ai.busy = false;
            els.run.disabled = false;
            els.run.classList.remove('is-busy');
        });
    };

    // Angka paket datang dari server (quota.plans) karena admin bisa
    // mengubahnya; nilai cadangan hanya dipakai bila kuota belum sempat dimuat.
    function upgradeVars() {
        var p = (ai.quota && ai.quota.plans) || {};
        return {
            prem: p.premium != null ? p.premium : 100000,
            plus: p.premium_plus != null ? p.premium_plus : 200000,
            topup: p.topup_tokens != null ? p.topup_tokens : 50000,
            price: 'Rp' + SO.fmtNum(p.topup_price != null ? p.topup_price : 10000)
        };
    }

    function showUpgrade() {
        SO.dialog({
            title: 'c_ai_upgrade_title',
            width: 460,
            body: '<p style="margin:4px 0 10px;line-height:1.6">' + SO.esc(SO.t('c_ai_upgrade_body', upgradeVars())) + '</p>',
            buttons: [
                { label: 'c_cancel', value: false },
                { label: 'c_ai_upgrade_cta', primary: true, icon: 'fa-crown', value: true }
            ]
        }).then(function (go) {
            if (go) global.open(SO.root + 'Dashboard/subscribe', '_blank', 'noopener');
        });
    }

    function paintResults(data) {
        var m = modeById(ai.last.mode);
        var items = ai.last.items;
        var results = ai.last.results || [];

        if (!results.length) {
            els.results.innerHTML = '<div class="so-ai-empty">' + SO.esc(SO.t('c_ai_no_result')) + '</div>';
            return;
        }

        var wrap = SO.el('div', { class: 'so-ai-out' });
        var head = SO.el('div', { class: 'so-ai-out-head' });
        head.innerHTML = '<span>' + SO.esc(SO.t('c_ai_result_n', { n: results.length })) + '</span>' +
            (data.cached ? '<span class="so-ai-badge" title="' + SO.esc(SO.t('c_ai_cached_tip')) + '">' + SO.esc(SO.t('c_ai_cached')) + '</span>'
                         : '<span class="so-ai-badge">' + SO.esc(SO.t('c_ai_tokens_n', { n: fmt(data.tokens_charged || 0) })) + '</span>');
        wrap.appendChild(head);

        if (data.truncated) {
            wrap.appendChild(SO.el('div', { class: 'so-ai-warn', text: SO.t('c_ai_truncated') }));
        }

        // id dipakai untuk memetakan hasil kembali ke tempatnya; yang DITAMPILKAN
        // adalah label bila adaptor menyediakannya — "Judul" jauh lebih berguna
        // daripada id internal seperti "ex5n6sd2872".
        var byId = {}, labelById = {};
        items.forEach(function (it) {
            byId[it.id] = it.text;
            labelById[it.id] = it.label || it.id;
        });

        results.forEach(function (r, i) {
            var card = SO.el('div', { class: 'so-ai-card' });
            var top = SO.el('label', { class: 'so-ai-card-head' });
            var cb = SO.el('input', { type: 'checkbox' });
            cb.checked = true;
            cb.dataset.idx = i;
            if (!m.apply) cb.style.display = 'none';
            top.appendChild(cb);
            top.appendChild(SO.el('span', { class: 'so-ai-card-id', text: String(labelById[r.id] || r.id) }));
            card.appendChild(top);
            var before = byId[r.id];
            if (before != null && before !== r.text) {
                card.appendChild(SO.el('div', { class: 'so-ai-before', text: before }));
            }
            card.appendChild(SO.el('div', { class: 'so-ai-after', text: r.text }));
            wrap.appendChild(card);
        });

        if (m.apply) {
            var foot = SO.el('div', { class: 'so-ai-out-foot' });
            var apply = SO.el('button', { type: 'button', class: 'so-btn is-primary', html: '<i class="fas fa-check"></i>' + SO.esc(SO.t('c_ai_apply')) });
            var discard = SO.el('button', { type: 'button', class: 'so-btn', text: SO.t('c_ai_discard') });
            apply.addEventListener('click', function () {
                var picked = [];
                SO.$$('input[type=checkbox]', wrap).forEach(function (c) {
                    if (c.checked) picked.push(results[+c.dataset.idx]);
                });
                if (!picked.length) { SO.toast('c_ai_pick_first', { type: 'warn' }); return; }
                var ok = false;
                try { ok = ai.adapter.apply(picked, ai.last.mode) !== false; } catch (e) { console.error(e); ok = false; }
                if (ok) {
                    SO.toast('c_ai_applied', { type: 'success', vars: { n: picked.length } });
                    els.results.innerHTML = '';
                    paintTarget();
                } else {
                    SO.toast('c_ai_apply_failed', { type: 'error' });
                }
            });
            discard.addEventListener('click', function () { els.results.innerHTML = ''; });
            foot.appendChild(apply);
            foot.appendChild(discard);
            wrap.appendChild(foot);
        } else {
            var copy = SO.el('button', { type: 'button', class: 'so-btn', html: '<i class="fas fa-copy"></i>' + SO.esc(SO.t('c_ai_copy')) });
            copy.addEventListener('click', function () {
                var txt = results.map(function (r) { return r.text; }).join('\n\n');
                if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { SO.toast('c_ai_copied', { type: 'success' }); });
            });
            var foot2 = SO.el('div', { class: 'so-ai-out-foot' });
            foot2.appendChild(copy);
            wrap.appendChild(foot2);
        }

        els.results.innerHTML = '';
        els.results.appendChild(wrap);
    }

    /** Definisi grup ribbon "AI" — sama untuk ketiga aplikasi. */
    SO.aiRibbonTab = function (app) {
        var quick = MODES.filter(function (m) {
            return ['fix', 'rewrite', 'shorten', 'expand'].indexOf(m.id) !== -1 && (!m.apps || m.apps.indexOf(app) !== -1);
        });
        var extra = MODES.filter(function (m) {
            return ['tone', 'translate', 'summarize', 'formula', 'explain'].indexOf(m.id) !== -1 && (!m.apps || m.apps.indexOf(app) !== -1);
        });
        return {
            id: 'ai', label: 'c_ai_tab', groups: [
                { label: 'c_ai_grp_assistant', items: [
                    { lg: true, cmd: 'aiPanel', icon: 'fa-wand-magic-sparkles', label: 'c_ai_open', desc: 'c_ai_open_desc' }
                ] },
                { label: 'c_ai_grp_quick', items: quick.map(function (m) {
                    return { lg: true, cmd: 'aiMode', value: m.id, icon: m.icon, label: m.label };
                }) },
                { label: 'c_ai_grp_more', items: [
                    { t: 'drop', lg: true, icon: 'fa-ellipsis', label: 'c_more', menu: extra.map(function (m) {
                        return { label: m.label, icon: m.icon, cmd: 'aiMode', value: m.id };
                    }) },
                    { lg: true, cmd: 'aiQuota', icon: 'fa-gauge-high', label: 'c_ai_quota_btn' }
                ] }
            ]
        };
    };
})(window);
