/**
 * Sinerli Present — definisi ribbon, pintasan keyboard, templat presentasi, menu
 * File (backstage), dan boot aplikasi.
 */
(function (global) {
    'use strict';

    var App = global.SineSlide, M = global.SSM, R = global.SSR;
    var C = App.cmd;

    App.getTitle = function () { return (App.shell && App.shell.getName()) || SO.t('c_untitled'); };

    // ======================================================= menu bantu
    function fontOptions() {
        var pal = App.pal();
        var list = [{ value: pal.fontH, text: pal.fontH + ' (' + SO.t('s_headings') + ')', style: 'font-family:' + SO.fontStack(pal.fontH) }, { value: pal.fontB, text: pal.fontB + ' (' + SO.t('s_body') + ')', style: 'font-family:' + SO.fontStack(pal.fontB) }];
        return list.concat(SO.FONTS.map(function (f) { return { value: f, text: f, style: 'font-family:' + SO.fontStack(f) }; }));
    }
    var SIZE_OPTS = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96].map(function (s) { return { value: s, text: String(s) }; });

    function shapeGrid(onPick) {
        return function () {
            var cats = [['s_shcat_lines', 'line'], ['s_shcat_basic', 'basic'], ['s_shcat_arrows', 'arrow'], ['s_shcat_symbols', 'symbol'], ['s_shcat_callouts', 'callout']];
            return [{
                custom: function (box, close) {
                    box.className = 'ss-shape-menu';
                    cats.forEach(function (c) {
                        box.appendChild(SO.el('div', { class: 'ss-shape-menu-head', text: SO.t(c[0]) }));
                        var grid = SO.el('div', { class: 'ss-shape-menu-grid' });
                        var items = c[1] === 'line'
                            ? [['line', 's_sh_line', '<path d="M3 17 L17 3" stroke="currentColor" stroke-width="1.6"/>'], ['arrowLine', 's_sh_arrow_line', '<path d="M3 17 L15 5" stroke="currentColor" stroke-width="1.6"/><path d="M17 3 L10 5 L15 10 Z" fill="currentColor"/>'], ['textbox', 's_text_box', '<rect x="3" y="4" width="14" height="12" fill="none" stroke="currentColor" stroke-dasharray="2 1.5"/><path d="M7 8h6M10 8v6" stroke="currentColor" stroke-width="1.4"/>']]
                            : M.SHAPES.filter(function (s) { return s[2] === c[1]; }).map(function (s) { return [s[0], s[1], '<path d="' + M.shapePath(s[0], 16, 14) + '" transform="translate(2 3)" fill="none" stroke="currentColor" stroke-width="1.2"/>']; });
                        items.forEach(function (it) {
                            var b = SO.el('button', { type: 'button', 'data-tip': it[1], html: '<svg viewBox="0 0 20 20" width="20" height="20">' + it[2] + '</svg>' });
                            b.addEventListener('mousedown', function (e) { e.preventDefault(); });
                            b.addEventListener('click', function () { close(); onPick(it[0]); });
                            grid.appendChild(b);
                        });
                        box.appendChild(grid);
                    });
                }
            }];
        };
    }
    function drawShape(id) {
        if (id === 'line') C.beginDraw({ type: 'line' });
        else if (id === 'arrowLine') C.beginDraw({ type: 'line', arrow: true });
        else if (id === 'textbox') C.beginDraw({ type: 'text' });
        else C.beginDraw({ type: 'shape', shape: id });
    }
    function quickStyleMenu() {
        var pal = App.pal();
        return [{
            custom: function (box, close) {
                box.className = 'ss-qs-menu';
                C.QUICK_STYLES.forEach(function (q) {
                    var fill = q.fill.type === 'gradient' ? 'linear-gradient(135deg,' + M.color(q.fill.color, pal) + ',' + M.color(q.fill.color2, pal) + ')' : q.fill.opacity ? R.rgba(M.color(q.fill.color, pal), q.fill.opacity) : M.color(q.fill.color, pal);
                    var b = SO.el('button', { type: 'button', text: 'Abc', style: { background: fill, color: M.color(q.text, pal), border: q.line.type === 'none' ? '1px solid transparent' : '2px solid ' + M.color(q.line.color, pal) } });
                    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
                    b.addEventListener('click', function () { close(); C.quickStyle(q.id); });
                    box.appendChild(b);
                });
            }
        }];
    }
    function transitionItems() {
        return M.TRANSITIONS.map(function (t) { return { value: t[0], label: t[1], preview: t[1], style: '' }; });
    }
    function animItems() {
        var out = [];
        Object.keys(M.ANIMS).forEach(function (k) { M.ANIMS[k].forEach(function (a) { out.push({ value: a[0], label: a[1], style: k === 'entrance' ? 'color:#107c10' : k === 'emphasis' ? 'color:#b58300' : 'color:#c42b1c' }); }); });
        return out;
    }
    function themeItems() {
        return M.THEMES.map(function (t) {
            var v = t.variants[0];
            return { value: t.id, label: t.label, preview: t.label, style: 'background:' + (v.bg2 ? 'linear-gradient(135deg,' + v.bg + ',' + v.bg2 + ')' : v.bg) + ';color:' + v.accents[0] + ';font-family:' + SO.fontStack(t.fonts.h) + ';font-weight:700;border-bottom:4px solid ' + v.accents[1] };
        });
    }
    function variantItems() {
        if (!App.deck) return [];
        var t = M.themeById(App.deck.theme.id);
        return t.variants.map(function (v, i) {
            return { value: String(i), label: 's_variant_n', preview: '▮▮▮▮', style: 'background:' + v.bg + ';color:' + v.accents[0] + ';letter-spacing:-2px;text-shadow:7px 0 ' + v.accents[1] + ',14px 0 ' + v.accents[2] };
        });
    }
    var FONT_PAIRS = [['Poppins', 'Inter'], ['Montserrat', 'Open Sans'], ['Playfair Display', 'Lato'], ['Merriweather', 'Roboto'], ['Oswald', 'Source Sans 3'], ['Raleway', 'Lora'], ['Roboto', 'Roboto'], ['Calibri', 'Calibri'], ['Georgia', 'Verdana'], ['Noto Sans SC', 'Noto Sans SC']];
    var PALETTES = [
        ['s_pal_office', ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47']], ['s_pal_blue', ['#0F6FC6', '#009DD9', '#0BD0D9', '#10CF9B', '#7CCA62', '#A5C249']],
        ['s_pal_green', ['#549E39', '#8AB833', '#C0CF3A', '#029676', '#4AB5C4', '#0989B1']], ['s_pal_warm', ['#E48312', '#BD582C', '#865640', '#9B8357', '#C2BC80', '#94A088']],
        ['s_pal_red', ['#A5300F', '#D55816', '#E19825', '#B19C7D', '#7F5F52', '#B27D49']], ['s_pal_violet', ['#8064A2', '#4BACC6', '#F79646', '#9BBB59', '#C0504D', '#4F81BD']],
        ['s_pal_pastel', ['#9F86C0', '#E0B1CB', '#A0C4FF', '#FFD6A5', '#CAFFBF', '#FDFFB6']], ['s_pal_gray', ['#262626', '#595959', '#7F7F7F', '#A6A6A6', '#BFBFBF', '#D9D9D9']]
    ];

    // =========================================================== tab
    var TABS = [
        {
            id: 'home', label: 's_tab_home', groups: [
                { label: 's_grp_clipboard', items: [
                    { t: 'split', lg: true, cmd: 'paste', icon: 'fa-paste', label: 's_paste', key: 'Mod+V', menu: [{ label: 's_paste', icon: 'fa-paste', cmd: 'paste' }, { label: 's_paste_text', icon: 'fa-font', cmd: 'pasteText' }] },
                    { t: 'col', items: [
                        { cmd: 'cut', icon: 'fa-scissors', label: 's_cut', showLabel: true, key: 'Mod+X' },
                        { cmd: 'copy', icon: 'fa-copy', label: 'c_copy_cmd', showLabel: true, key: 'Mod+C' },
                        { cmd: 'painter', icon: 'fa-paintbrush', label: 's_painter', showLabel: true, desc: 's_painter_desc' }
                    ] }
                ] },
                { label: 's_grp_slides', items: [
                    { t: 'split', lg: true, cmd: 'newSlide', icon: 'fa-square-plus', label: 's_new_slide', key: 'Mod+M', menu: function () { return C.layoutMenu(false).concat([{ sep: true }, { label: 's_duplicate_slide', icon: 'fa-clone', cmd: 'duplicateSlide' }]); }, menuWidth: 260 },
                    { t: 'col', items: [
                        { t: 'drop', icon: 'fa-table-columns', label: 's_layout', showLabel: true, menu: function () { return C.layoutMenu(true); }, menuWidth: 260 },
                        { cmd: 'resetSlide', icon: 'fa-arrows-rotate', label: 's_reset', showLabel: true },
                        { cmd: 'deleteSlide', icon: 'fa-trash-can', label: 's_delete_slide_short', showLabel: true }
                    ] }
                ] },
                { label: 's_grp_font', items: [
                    { t: 'rows', rows: [
                        [{ t: 'select', cmd: 'fontName', label: 's_font', width: 150, editable: true, options: fontOptions, menuWidth: 240 }, { t: 'select', cmd: 'fontSize', label: 's_font_size', width: 58, editable: true, options: SIZE_OPTS }, { cmd: 'growFont', icon: 'fa-arrow-up', label: 's_grow_font', key: 'Mod+]' }, { cmd: 'shrinkFont', icon: 'fa-arrow-down', label: 's_shrink_font', key: 'Mod+[' }, { cmd: 'clearFormat', icon: 'fa-text-slash', label: 's_clear_format' }],
                        [{ cmd: 'bold', icon: 'fa-bold', label: 's_bold', key: 'Mod+B' }, { cmd: 'italic', icon: 'fa-italic', label: 's_italic', key: 'Mod+I' }, { cmd: 'underline', icon: 'fa-underline', label: 's_underline', key: 'Mod+U' }, { cmd: 'strikeThrough', icon: 'fa-strikethrough', label: 's_strike' },
                            { cmd: 'textShadow', icon: 'fa-s', label: 's_text_shadow' },
                            { t: 'drop', cmd: 'changeCase', icon: 'fa-font', label: 's_change_case', menu: [{ label: 's_case_sentence', cmd: 'case', value: 'sentence' }, { label: 's_case_lower', cmd: 'case', value: 'lower' }, { label: 's_case_upper', cmd: 'case', value: 'upper' }, { label: 's_case_title', cmd: 'case', value: 'title' }, { label: 's_case_toggle', cmd: 'case', value: 'toggle' }] },
                            { t: 'color', cmd: 'fontColor', icon: 'fa-font', label: 's_font_color', value: '#C00000', autoLabel: 's_automatic', themeColors: function () { return M.themeSwatches(App.pal()); } },
                            { t: 'color', cmd: 'highlight', icon: 'fa-highlighter', label: 's_highlight', value: '#FFFF00', allowNone: true, noneLabel: 's_no_highlight' },
                            { cmd: 'fontDialog', icon: 'fa-up-right-from-square', label: 's_font_dialog' }]
                    ] }
                ] },
                { label: 's_grp_paragraph', items: [
                    { t: 'rows', rows: [
                        [{ t: 'split', cmd: 'bullets', icon: 'fa-list-ul', label: 's_bullets', menu: [{ label: 's_bullet_disc', cmd: 'bulletStyle', value: 'disc' }, { label: 's_bullet_circle', cmd: 'bulletStyle', value: 'circle' }, { label: 's_bullet_square', cmd: 'bulletStyle', value: 'square' }, { label: 's_none', cmd: 'noBullets' }] },
                            { t: 'split', cmd: 'numbering', icon: 'fa-list-ol', label: 's_numbering', menu: [{ label: '1. 2. 3.', cmd: 'numberStyle', value: 'decimal' }, { label: 'a. b. c.', cmd: 'numberStyle', value: 'lower-alpha' }, { label: 'A. B. C.', cmd: 'numberStyle', value: 'upper-alpha' }, { label: 'i. ii. iii.', cmd: 'numberStyle', value: 'lower-roman' }, { label: 's_none', cmd: 'noBullets' }] },
                            { cmd: 'indentLess', icon: 'fa-outdent', label: 's_indent_less' }, { cmd: 'indentMore', icon: 'fa-indent', label: 's_indent_more' },
                            { t: 'drop', cmd: 'lineSpacing', icon: 'fa-text-height', label: 's_line_spacing', menu: [0.9, 1, 1.15, 1.5, 2, 2.5, 3].map(function (v) { return { text: String(v).replace('.', SO.lang() === 'id' ? ',' : '.'), cmd: 'lineSpacingSet', value: v }; }) }],
                        [{ cmd: 'align_left', icon: 'fa-align-left', label: 's_align_text_left', key: 'Mod+L' }, { cmd: 'align_center', icon: 'fa-align-center', label: 's_align_text_center', key: 'Mod+E' }, { cmd: 'align_right', icon: 'fa-align-right', label: 's_align_text_right', key: 'Mod+R' }, { cmd: 'align_justify', icon: 'fa-align-justify', label: 's_justify', key: 'Mod+J' },
                            { t: 'drop', cmd: 'valign', icon: 'fa-arrows-up-down', label: 's_valign', menu: [{ label: 's_top', icon: 'fa-arrow-up', cmd: 'valignSet', value: 'top' }, { label: 's_middle', icon: 'fa-arrows-up-down', cmd: 'valignSet', value: 'middle' }, { label: 's_bottom', icon: 'fa-arrow-down', cmd: 'valignSet', value: 'bottom' }] }]
                    ] }
                ] },
                { label: 's_grp_drawing', items: [
                    { t: 'drop', lg: true, icon: 'fa-shapes', label: 's_shapes', menu: shapeGrid(drawShape) },
                    { t: 'drop', lg: true, cmd: 'arrange', icon: 'fa-layer-group', label: 's_arrange', menu: function () { return C.orderMenu().concat([{ sep: true }, { label: 's_group', icon: 'fa-object-group', cmd: 'group' }, { label: 's_ungroup', icon: 'fa-object-ungroup', cmd: 'ungroup' }, { sep: true }, { label: 's_align', icon: 'fa-align-center', submenu: C.alignMenu() }, { label: 's_rotate', icon: 'fa-rotate', submenu: C.rotateMenu() }, { sep: true }, { label: 's_selection_pane', icon: 'fa-layer-group', cmd: 'selectionPane' }]); } },
                    { t: 'drop', lg: true, icon: 'fa-wand-magic-sparkles', label: 's_quick_styles', menu: quickStyleMenu },
                    { t: 'col', items: [
                        { t: 'color', cmd: 'shapeFill', icon: 'fa-fill-drip', label: 's_shape_fill', value: '#4472C4', allowNone: true, noneLabel: 's_no_fill', themeColors: function () { return M.themeSwatches(App.pal()); } },
                        { t: 'color', cmd: 'shapeOutline', icon: 'fa-pen', label: 's_shape_outline', value: '#262626', allowNone: true, noneLabel: 's_no_outline', themeColors: function () { return M.themeSwatches(App.pal()); } },
                        { t: 'drop', cmd: 'shapeEffects', icon: 'fa-clone', label: 's_shape_effects', menu: [{ label: 's_shadow_none', cmd: 'shadow', value: 'none' }, { label: 's_shadow_outer', cmd: 'shadow', value: 'outer' }, { label: 's_shadow_soft', cmd: 'shadow', value: 'soft' }, { label: 's_shadow_hard', cmd: 'shadow', value: 'hard' }, { label: 's_shadow_below', cmd: 'shadow', value: 'below' }] }
                    ] }
                ] },
                { label: 's_grp_editing', items: [
                    { t: 'col', items: [
                        { cmd: 'find', icon: 'fa-magnifying-glass', label: 's_find', showLabel: true, key: 'Mod+F' },
                        { cmd: 'replace', icon: 'fa-arrows-rotate', label: 's_replace', showLabel: true, key: 'Mod+H' },
                        { t: 'drop', icon: 'fa-arrow-pointer', label: 's_select', showLabel: true, menu: [{ label: 's_select_all', icon: 'fa-object-group', cmd: 'selectAll', key: 'Mod+A' }, { label: 's_selection_pane', icon: 'fa-layer-group', cmd: 'selectionPane' }] }
                    ] }
                ] }
            ]
        },
        {
            id: 'insert', label: 's_tab_insert', groups: [
                { label: 's_grp_slides', items: [{ t: 'split', lg: true, cmd: 'newSlide', icon: 'fa-square-plus', label: 's_new_slide', menu: function () { return C.layoutMenu(false); }, menuWidth: 260 }] },
                { label: 's_grp_tables', items: [{ t: 'drop', lg: true, icon: 'fa-table', label: 's_table', menu: function () { return C.tableGridMenu(); } }] },
                { label: 's_grp_images', items: [
                    { cmd: 'insertImage', lg: true, icon: 'fa-image', label: 's_pictures' },
                    { cmd: 'insertIcon', lg: true, icon: 'fa-icons', label: 's_icons' }
                ] },
                { label: 's_grp_illustrations', items: [
                    { t: 'drop', lg: true, icon: 'fa-shapes', label: 's_shapes', menu: shapeGrid(drawShape) },
                    { t: 'drop', lg: true, icon: 'fa-sitemap', label: 's_smartart', menu: function () { return C.SMARTART.map(function (x) { return { label: x[1], icon: x[2], cmd: 'smartart', value: x[0] }; }); } },
                    { t: 'drop', lg: true, icon: 'fa-chart-column', label: 's_chart', menu: function () { return C.CHART_TYPES.map(function (x) { return { label: x[1], icon: x[2], cmd: 'insertChart', value: x[0] }; }); } }
                ] },
                { label: 's_grp_text', items: [
                    { cmd: 'textBox', lg: true, icon: 'fa-i-cursor', label: 's_text_box' },
                    { t: 'drop', lg: true, icon: 'fa-a', label: 's_wordart', menu: function () { return [1, 2, 3, 4].map(function (i) { return { label: 's_wordart_' + i, cmd: 'wordart', value: i }; }); } },
                    { t: 'col', items: [
                        { cmd: 'headerFooter', icon: 'fa-grip-lines', label: 's_header_footer', showLabel: true },
                        { cmd: 'insertDate', icon: 'fa-calendar-day', label: 's_date_time', showLabel: true },
                        { cmd: 'slideNumber', icon: 'fa-hashtag', label: 's_slide_number', showLabel: true }
                    ] }
                ] },
                { label: 's_grp_symbols', items: [
                    { cmd: 'equation', lg: true, icon: 'fa-square-root-variable', label: 's_equation' },
                    { cmd: 'symbol', lg: true, icon: 'fa-infinity', label: 's_symbol' }
                ] },
                { label: 's_grp_media', items: [{ cmd: 'video', lg: true, icon: 'fa-film', label: 's_video' }] },
                { label: 's_grp_links', items: [
                    { cmd: 'link', lg: true, icon: 'fa-link', label: 's_link', key: 'Mod+K' },
                    { cmd: 'addComment', lg: true, icon: 'fa-comment', label: 's_comment' }
                ] }
            ]
        },
        {
            id: 'design', label: 's_tab_design', groups: [
                { label: 's_grp_themes', items: [{ t: 'gallery', cmd: 'themeGallery', items: themeItems, width: 420 }] },
                { label: 's_grp_variants', items: [{ t: 'gallery', cmd: 'variantGallery', items: variantItems, width: 230, extraMenu: function () {
                    return [
                        { label: 's_theme_colors', icon: 'fa-palette', submenu: PALETTES.map(function (p) { return { label: p[0], labelHtml: '<span class="ss-pal-mini">' + p[1].map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</span>' + SO.esc(SO.t(p[0])), onClick: function () { App.change('palette', function () { App.deck.theme.colors = Object.assign({}, App.deck.theme.colors || {}, { accents: p[1].slice() }); }, { render: 'all' }); } }; }).concat([{ sep: true }, { label: 's_reset_colors', onClick: function () { App.change('palette', function () { delete App.deck.theme.colors; }, { render: 'all' }); } }]) },
                        { label: 's_theme_fonts', icon: 'fa-font', submenu: FONT_PAIRS.map(function (fp) { return { text: fp[0] + ' / ' + fp[1], style: 'font-family:' + SO.fontStack(fp[0]), onClick: function () { C.setThemeFonts(fp[0], fp[1]); } }; }).concat([{ sep: true }, { label: 's_reset_fonts', onClick: function () { C.setThemeFonts(null); } }]) }
                    ];
                } }] },
                { label: 's_grp_customize', items: [
                    { t: 'drop', lg: true, icon: 'fa-expand', label: 's_slide_size', menu: function () {
                        return M.SIZES.slice(0, 3).map(function (s) { return { label: s.label, checked: App.deck.size.id === s.id, cmd: 'slideSizePreset', value: s.id }; }).concat([{ sep: true }, { label: 's_custom_size', icon: 'fa-sliders', cmd: 'slideSize' }]);
                    } },
                    { cmd: 'formatBackground', lg: true, icon: 'fa-fill-drip', label: 's_format_background' },
                    { cmd: 'toggleDecor', lg: true, icon: 'fa-shapes', label: 's_hide_decor' }
                ] }
            ]
        },
        {
            id: 'transitions', label: 's_tab_transitions', groups: [
                { label: 's_grp_preview', items: [{ cmd: 'previewTransition', lg: true, icon: 'fa-play', label: 's_preview' }] },
                { label: 's_grp_transition', items: [
                    { t: 'gallery', cmd: 'transitionGallery', items: transitionItems, width: 460 },
                    { t: 'drop', lg: true, icon: 'fa-sliders', label: 's_effect_options', menu: [{ label: 's_dir_from_right', cmd: 'trDir', value: 'left' }, { label: 's_dir_from_left', cmd: 'trDir', value: 'right' }, { label: 's_dir_from_bottom', cmd: 'trDir', value: 'up' }, { label: 's_dir_from_top', cmd: 'trDir', value: 'down' }] }
                ] },
                { label: 's_grp_timing', items: [
                    { t: 'rows', rows: [
                        [{ t: 'custom', render: function (el) { el.appendChild(SO.el('span', { class: 'ss-rb-label', text: SO.t('s_duration_s') })); } }, { t: 'num', cmd: 'trDuration', label: 's_duration_s', min: 0.1, max: 30, step: 0.1, width: 64 }],
                        [{ t: 'check', cmd: 'trOnClick', label: 's_on_click' }],
                        [{ t: 'custom', render: function (el) { el.appendChild(SO.el('span', { class: 'ss-rb-label', text: SO.t('s_after_s') })); } }, { t: 'num', cmd: 'trAfter', label: 's_after_s', min: 0, max: 3600, step: 0.5, width: 64 }]
                    ] },
                    { cmd: 'applyTransitionAll', lg: true, icon: 'fa-clone', label: 's_apply_all' }
                ] }
            ]
        },
        {
            id: 'animations', label: 's_tab_animations', groups: [
                { label: 's_grp_preview', items: [{ cmd: 'previewAnims', lg: true, icon: 'fa-play', label: 's_preview' }] },
                { label: 's_grp_animation', items: [
                    { t: 'gallery', cmd: 'animGallery', items: animItems, width: 420 },
                    { t: 'drop', lg: true, cmd: 'animOptions', icon: 'fa-sliders', label: 's_effect_options', menu: [{ label: 's_dir_bottom', cmd: 'animDir', value: 'bottom' }, { label: 's_dir_top', cmd: 'animDir', value: 'top' }, { label: 's_dir_left', cmd: 'animDir', value: 'left' }, { label: 's_dir_right', cmd: 'animDir', value: 'right' }] }
                ] },
                { label: 's_grp_advanced', items: [
                    { cmd: 'animationPane', lg: true, icon: 'fa-list-ol', label: 's_animation_pane' },
                    { cmd: 'removeAnim', lg: true, icon: 'fa-ban', label: 's_remove_animation' }
                ] },
                { label: 's_grp_timing', items: [
                    { t: 'rows', rows: [
                        [{ t: 'custom', render: function (el) { el.appendChild(SO.el('span', { class: 'ss-rb-label', text: SO.t('s_start') })); } }, { t: 'select', cmd: 'animTrigger', label: 's_start', width: 150, options: [{ value: 'click', label: 's_trigger_click' }, { value: 'with', label: 's_trigger_with' }, { value: 'after', label: 's_trigger_after' }] }],
                        [{ t: 'custom', render: function (el) { el.appendChild(SO.el('span', { class: 'ss-rb-label', text: SO.t('s_duration_s') })); } }, { t: 'num', cmd: 'animDuration', label: 's_duration_s', min: 0, max: 60, step: 0.1, width: 64 }],
                        [{ t: 'custom', render: function (el) { el.appendChild(SO.el('span', { class: 'ss-rb-label', text: SO.t('s_delay_s') })); } }, { t: 'num', cmd: 'animDelay', label: 's_delay_s', min: 0, max: 60, step: 0.1, width: 64 }]
                    ] }
                ] }
            ]
        },
        {
            id: 'show', label: 's_tab_slideshow', groups: [
                { label: 's_grp_start', items: [
                    { cmd: 'showStart', lg: true, icon: 'fa-play', label: 's_from_beginning', key: 'F5' },
                    { cmd: 'showCurrent', lg: true, icon: 'fa-circle-play', label: 's_from_current', key: 'Shift+F5' },
                    { t: 'split', lg: true, cmd: 'presenter', icon: 'fa-person-chalkboard', label: 's_presenter_view', menu: [{ label: 's_presenter_window', icon: 'fa-window-restore', cmd: 'presenter' }, { label: 's_presenter_inline', icon: 'fa-table-columns', cmd: 'presenterInline' }] }
                ] },
                { label: 's_grp_setup', items: [
                    { cmd: 'hideSlide', lg: true, icon: 'fa-eye-slash', label: 's_hide_slide' },
                    { cmd: 'rehearse', lg: true, icon: 'fa-stopwatch', label: 's_rehearse' },
                    { t: 'col', items: [
                        { t: 'check', cmd: 'loopShow', label: 's_loop_show' },
                        { t: 'check', cmd: 'showHidden', label: 's_show_hidden' }
                    ] }
                ] }
            ]
        },
        {
            id: 'review', label: 's_tab_review', groups: [
                { label: 's_grp_proofing', items: [
                    { cmd: 'spelling', lg: true, icon: 'fa-spell-check', label: 's_spelling' },
                    { cmd: 'stats', lg: true, icon: 'fa-chart-simple', label: 's_statistics' }
                ] },
                { label: 's_grp_comments', items: [
                    { cmd: 'addComment', lg: true, icon: 'fa-comment-medical', label: 's_new_comment' },
                    { cmd: 'commentsPane', lg: true, icon: 'fa-comments', label: 's_show_comments' }
                ] }
            ]
        },
        {
            id: 'view', label: 's_tab_view', groups: [
                { label: 's_grp_views', items: [
                    { cmd: 'viewNormal', lg: true, icon: 'fa-display', label: 's_view_normal' },
                    { cmd: 'viewSorter', lg: true, icon: 'fa-table-cells-large', label: 's_view_sorter' },
                    { cmd: 'viewReading', lg: true, icon: 'fa-book-open', label: 's_view_reading' }
                ] },
                { label: 's_grp_show', items: [
                    { t: 'col', items: [
                        { t: 'check', cmd: 'toggleGrid', label: 's_gridlines' },
                        { t: 'check', cmd: 'toggleGuides', label: 's_guides' },
                        { t: 'check', cmd: 'toggleRuler', label: 's_snap' }
                    ] },
                    { t: 'col', items: [{ t: 'check', cmd: 'toggleNotes', label: 's_notes' }] }
                ] },
                { label: 's_grp_zoom', items: [
                    { cmd: 'zoomDialog', lg: true, icon: 'fa-magnifying-glass', label: 'c_zoom' },
                    { cmd: 'zoomFit', lg: true, icon: 'fa-expand', label: 's_fit_window' }
                ] },
                { label: 's_grp_panes', items: [
                    { cmd: 'selectionPane', lg: true, icon: 'fa-layer-group', label: 's_selection_pane' },
                    { cmd: 'formatPane', lg: true, icon: 'fa-sliders', label: 's_format_pane' }
                ] }
            ]
        },
        SO.aiRibbonTab('sineslide'),
        {
            id: 'shapeFormat', label: 's_tab_shape_format', contextual: true, groups: [
                { label: 's_grp_insert_shapes', items: [{ t: 'drop', lg: true, icon: 'fa-shapes', label: 's_shapes', menu: shapeGrid(drawShape) }, { t: 'drop', lg: true, icon: 'fa-draw-polygon', label: 's_change_shape', menu: shapeGrid(function (id) { if (!/^(line|arrowLine|textbox)$/.test(id)) C.changeShape(id); }) }] },
                { label: 's_grp_shape_styles', items: [
                    { t: 'drop', lg: true, icon: 'fa-wand-magic-sparkles', label: 's_quick_styles', menu: quickStyleMenu },
                    { t: 'col', items: [
                        { t: 'color', cmd: 'shapeFill', icon: 'fa-fill-drip', label: 's_shape_fill', showLabel: true, value: '#4472C4', allowNone: true, noneLabel: 's_no_fill', themeColors: function () { return M.themeSwatches(App.pal()); } },
                        { t: 'color', cmd: 'shapeOutline', icon: 'fa-pen', label: 's_shape_outline', showLabel: true, value: '#262626', allowNone: true, noneLabel: 's_no_outline', themeColors: function () { return M.themeSwatches(App.pal()); } },
                        { t: 'drop', icon: 'fa-clone', label: 's_shape_effects', showLabel: true, menu: [{ label: 's_shadow_none', cmd: 'shadow', value: 'none' }, { label: 's_shadow_outer', cmd: 'shadow', value: 'outer' }, { label: 's_shadow_soft', cmd: 'shadow', value: 'soft' }, { label: 's_shadow_hard', cmd: 'shadow', value: 'hard' }, { label: 's_shadow_below', cmd: 'shadow', value: 'below' }] }
                    ] },
                    { t: 'col', items: [
                        { t: 'drop', icon: 'fa-grip-lines', label: 's_weight', showLabel: true, menu: [0.5, 1, 1.5, 2.25, 3, 4.5, 6, 9].map(function (w) { return { text: w + ' pt', cmd: 'outlineWidth', value: w }; }) },
                        { t: 'drop', icon: 'fa-ellipsis', label: 's_dash', showLabel: true, menu: [['solid', 's_dash_solid'], ['dash', 's_dash_dash'], ['dot', 's_dash_dot'], ['dashDot', 's_dash_dashdot'], ['longDash', 's_dash_long']].map(function (d) { return { label: d[1], cmd: 'outlineDash', value: d[0] }; }) },
                        { t: 'drop', icon: 'fa-arrow-right-long', label: 's_arrows', showLabel: true, menu: [
                            { label: 's_arrow_end', cmd: 'arrows', value: 'none|arrow' }, { label: 's_arrow_start', cmd: 'arrows', value: 'arrow|none' }, { label: 's_arrow_both', cmd: 'arrows', value: 'arrow|arrow' },
                            { label: 's_arrow_open', cmd: 'arrows', value: 'none|open' }, { label: 's_arrow_oval', cmd: 'arrows', value: 'oval|oval' }, { label: 's_arrow_none', cmd: 'arrows', value: 'none|none' }
                        ] }
                    ] }
                ] },
                { label: 's_grp_arrange', items: [
                    { t: 'col', items: [
                        { t: 'split', cmd: 'bringForward', icon: 'fa-arrow-up', label: 's_bring_forward', showLabel: true, menu: [{ label: 's_bring_forward', cmd: 'bringForward' }, { label: 's_bring_front', cmd: 'bringFront' }] },
                        { t: 'split', cmd: 'sendBackward', icon: 'fa-arrow-down', label: 's_send_backward', showLabel: true, menu: [{ label: 's_send_backward', cmd: 'sendBackward' }, { label: 's_send_back', cmd: 'sendBack' }] },
                        { cmd: 'selectionPane', icon: 'fa-layer-group', label: 's_selection_pane', showLabel: true }
                    ] },
                    { t: 'col', items: [
                        { t: 'drop', cmd: 'alignObjects', icon: 'fa-align-center', label: 's_align', showLabel: true, menu: function () { return C.alignMenu(); } },
                        { t: 'drop', icon: 'fa-object-group', label: 's_group', showLabel: true, menu: [{ label: 's_group', icon: 'fa-object-group', cmd: 'group' }, { label: 's_ungroup', icon: 'fa-object-ungroup', cmd: 'ungroup' }] },
                        { t: 'drop', cmd: 'rotateMenu', icon: 'fa-rotate', label: 's_rotate', showLabel: true, menu: function () { return C.rotateMenu(); } }
                    ] }
                ] },
                { label: 's_grp_size', items: [
                    { cmd: 'sizePane', lg: true, icon: 'fa-up-right-and-down-left-from-center', label: 's_size_position' },
                    { cmd: 'setDefaultShape', lg: true, icon: 'fa-thumbtack', label: 's_set_default_shape' }
                ] }
            ]
        },
        {
            id: 'pictureFormat', label: 's_tab_picture_format', contextual: true, groups: [
                { label: 's_grp_adjust', items: [
                    { cmd: 'formatPane', lg: true, icon: 'fa-sliders', label: 's_corrections' },
                    { t: 'drop', lg: true, icon: 'fa-palette', label: 's_color', menu: [{ label: 's_grayscale', cmd: 'imgFx', value: 'gray' }, { label: 's_sepia', cmd: 'imgFx', value: 'sepia' }, { label: 's_reset_color', cmd: 'imgFx', value: 'none' }] },
                    { t: 'col', items: [
                        { cmd: 'changePicture', icon: 'fa-image', label: 's_change_picture', showLabel: true },
                        { cmd: 'resetPicture', icon: 'fa-arrows-rotate', label: 's_reset_picture', showLabel: true },
                        { cmd: 'savePicture', icon: 'fa-download', label: 's_save_as_picture', showLabel: true }
                    ] }
                ] },
                { label: 's_grp_picture_styles', items: [
                    { t: 'drop', lg: true, icon: 'fa-crop-simple', label: 's_crop_to_shape', menu: shapeGrid(function (id) { if (!/^(line|arrowLine|textbox)$/.test(id)) C.changeShape(id); }) },
                    { t: 'col', items: [
                        { t: 'color', cmd: 'shapeOutline', icon: 'fa-square', label: 's_picture_border', showLabel: true, value: '#262626', allowNone: true, noneLabel: 's_no_outline', themeColors: function () { return M.themeSwatches(App.pal()); } },
                        { t: 'drop', icon: 'fa-clone', label: 's_picture_effects', showLabel: true, menu: [{ label: 's_shadow_none', cmd: 'shadow', value: 'none' }, { label: 's_shadow_outer', cmd: 'shadow', value: 'outer' }, { label: 's_shadow_soft', cmd: 'shadow', value: 'soft' }, { label: 's_shadow_below', cmd: 'shadow', value: 'below' }] }
                    ] }
                ] },
                { label: 's_grp_arrange', items: [
                    { t: 'col', items: [
                        { cmd: 'bringFront', icon: 'fa-arrow-up', label: 's_bring_front', showLabel: true },
                        { cmd: 'sendBack', icon: 'fa-arrow-down', label: 's_send_back', showLabel: true },
                        { t: 'drop', icon: 'fa-rotate', label: 's_rotate', showLabel: true, menu: function () { return C.rotateMenu(); } }
                    ] }
                ] },
                { label: 's_grp_size', items: [{ cmd: 'sizePane', lg: true, icon: 'fa-up-right-and-down-left-from-center', label: 's_size_position' }] }
            ]
        },
        {
            id: 'tableDesign', label: 's_tab_table', contextual: true, groups: [
                { label: 's_grp_table_style_options', items: [{ t: 'col', items: [{ t: 'check', cmd: 'tblHeader', label: 's_header_row' }, { t: 'check', cmd: 'tblBanded', label: 's_banded_rows' }, { t: 'check', cmd: 'tblFirstCol', label: 's_first_column' }] }] },
                { label: 's_grp_table_styles', items: [{ t: 'col', items: [
                    { t: 'color', cmd: 'tableColor', icon: 'fa-palette', label: 's_table_color', showLabel: true, value: '#4472C4', themeColors: function () { return M.themeSwatches(App.pal()); } },
                    { t: 'color', cmd: 'cellFill', icon: 'fa-fill-drip', label: 's_cell_shading', showLabel: true, value: '#FFFF00', allowNone: true, noneLabel: 's_no_fill', themeColors: function () { return M.themeSwatches(App.pal()); } },
                    { t: 'color', cmd: 'tableBorder', icon: 'fa-border-all', label: 's_border_color', showLabel: true, value: '#262626', allowNone: true, noneLabel: 's_no_borders', themeColors: function () { return M.themeSwatches(App.pal()); } }
                ] }] },
                { label: 's_grp_rows_cols', items: [
                    { t: 'col', items: [{ cmd: 'rowAbove', icon: 'fa-arrow-up', label: 's_insert_above', showLabel: true }, { cmd: 'rowBelow', icon: 'fa-arrow-down', label: 's_insert_below', showLabel: true }, { cmd: 'distributeCols', icon: 'fa-arrows-left-right', label: 's_distribute_cols', showLabel: true }] },
                    { t: 'col', items: [{ cmd: 'colLeft', icon: 'fa-arrow-left', label: 's_insert_left', showLabel: true }, { cmd: 'colRight', icon: 'fa-arrow-right', label: 's_insert_right', showLabel: true }] },
                    { t: 'drop', lg: true, icon: 'fa-trash-can', label: 'c_delete', menu: [{ label: 's_delete_rows', icon: 'fa-grip-lines', cmd: 'delRow' }, { label: 's_delete_cols', icon: 'fa-grip-lines-vertical', cmd: 'delCol' }, { label: 's_delete_table', icon: 'fa-table', cmd: 'delTable' }] }
                ] },
                { label: 's_grp_merge', items: [{ t: 'col', items: [{ cmd: 'mergeRight', icon: 'fa-arrows-left-right', label: 's_merge_right', showLabel: true }, { cmd: 'mergeDown', icon: 'fa-arrows-up-down', label: 's_merge_down', showLabel: true }, { cmd: 'splitCell', icon: 'fa-table-cells', label: 's_split_cells', showLabel: true }] }] }
            ]
        },
        {
            id: 'chartDesign', label: 's_tab_chart', contextual: true, groups: [
                { label: 's_grp_data', items: [{ cmd: 'chartData', lg: true, icon: 'fa-table', label: 's_edit_data' }] },
                { label: 's_grp_chart_type', items: [{ t: 'drop', lg: true, icon: 'fa-chart-pie', label: 's_change_chart_type', menu: function () { return C.CHART_TYPES.map(function (x) { return { label: x[1], icon: x[2], cmd: 'chartType', value: x[0] }; }); } }] },
                { label: 's_grp_chart_layout', items: [
                    { t: 'drop', lg: true, icon: 'fa-list', label: 's_legend', menu: [['bottom', 's_legend_bottom'], ['right', 's_legend_right'], ['top', 's_legend_top'], ['left', 's_legend_left'], ['none', 's_legend_none']].map(function (x) { return { label: x[1], cmd: 'chartLegend', value: x[0] }; }) },
                    { cmd: 'chartTitle', lg: true, icon: 'fa-heading', label: 's_chart_title' },
                    { t: 'col', items: [{ t: 'check', cmd: 'chartLabels', label: 's_data_labels' }] }
                ] },
                { label: 's_grp_chart_styles', items: [{ t: 'drop', lg: true, icon: 'fa-palette', label: 's_change_colors', menu: function () {
                    return [{ label: 's_theme_colors_short', cmd: 'chartColors', value: '' }].concat(PALETTES.map(function (p, i) { return { label: p[0], labelHtml: '<span class="ss-pal-mini">' + p[1].map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</span>' + SO.esc(SO.t(p[0])), cmd: 'chartColors', value: String(i) }; }));
                } }, { cmd: 'savePicture', lg: true, icon: 'fa-download', label: 's_save_as_picture' }] }
            ]
        }
    ];

    // ======================================================== handler
    function sel() { return App.selected(); }
    var H = {
        // Panel AI — implementasinya bersama di tools/office/shared/office-ai.js.
        aiPanel: function () { SO.ai.toggle(); },
        aiMode: function (v) { SO.ai.open(v); },
        aiQuota: function () { SO.ai.open(); SO.ai.fetchQuota(); },
        undo: function () { App.undo(); }, redo: function () { App.redo(); },
        paste: function () { C.paste(); },
        pasteText: function () {
            if (!navigator.clipboard || !navigator.clipboard.readText) { SO.toast('s_clipboard_blocked', { type: 'warn' }); return; }
            navigator.clipboard.readText().then(function (t) { if (App.editing) { document.execCommand('insertText', false, t); C.commitTextSoon(); } else if (t) C.insertTextBox(t); }).catch(function () { SO.toast('s_clipboard_blocked', { type: 'warn' }); });
        },
        cut: function () { C.copy(true); }, copy: function () { C.copy(false); },
        painter: function () { if (App.painter) C.cancelPainter(); else C.painter(false); },
        newSlide: function (v) { C.newSlide(typeof v === 'string' ? v : null); },
        duplicateSlide: C.duplicateSlide, resetSlide: C.resetSlide, deleteSlide: C.deleteSlide, hideSlide: C.hideSlide,
        fontName: function (v) { C.fontName(v); }, fontSize: function (v) { C.fontSize(v); },
        growFont: function () { C.fontSizeStep(1); }, shrinkFont: function () { C.fontSizeStep(-1); }, clearFormat: C.clearFormat,
        bold: function () { C.textCmd('bold'); }, italic: function () { C.textCmd('italic'); }, underline: function () { C.textCmd('underline'); }, strikeThrough: function () { C.textCmd('strikeThrough'); },
        subscript: function () { C.textCmd('subscript'); }, superscript: function () { C.textCmd('superscript'); },
        textShadow: function () { C.textEffect('shadow'); },
        case: function (v) { C.changeCase(v); },
        fontColor: function (v) { C.fontColor(v); }, highlight: function (v) { C.highlight(v); }, fontDialog: C.fontDialog,
        bullets: function () { C.bullets('ul'); }, numbering: function () { C.bullets('ol'); },
        bulletStyle: function (v) { C.bullets('ul', v); }, numberStyle: function (v) { C.bullets('ol', v); },
        noBullets: function () { var st = C.currentStyle(); if (st.ul) C.bullets('ul'); else if (st.ol) C.bullets('ol'); },
        indentLess: function () { C.indent(-1); }, indentMore: function () { C.indent(1); },
        lineSpacingSet: function (v) { C.lineSpacing(v); },
        align_left: function () { C.align('left'); }, align_center: function () { C.align('center'); }, align_right: function () { C.align('right'); }, align_justify: function () { C.align('justify'); },
        valignSet: function (v) { C.valign(v); },
        shapeFill: function (v) { C.shapeFill(v); }, shapeOutline: function (v) { C.shapeOutline(v); }, shadow: function (v) { C.shadow(v); },
        outlineWidth: function (v) { C.outlineWidth(v); }, outlineDash: function (v) { C.outlineDash(v); },
        arrows: function (v) { var p = v.split('|'); C.lineEnds('head', p[0]); C.lineEnds('tail', p[1]); },
        group: C.group, ungroup: C.ungroup,
        bringForward: function () { C.order('forward'); }, bringFront: function () { C.order('front'); }, sendBackward: function () { C.order('backward'); }, sendBack: function () { C.order('back'); },
        selectionPane: C.selectionPane, formatPane: function () { C.openFormatPane(); }, sizePane: function () { C.openFormatPane('size'); },
        setDefaultShape: C.setDefaultShape,
        find: function () { C.findPane(false); }, replace: function () { C.findPane(true); }, selectAll: C.selectAll,
        insertImage: function () { C.insertImage(); }, insertIcon: function () { C.iconDialog(); },
        smartart: function (v) { C.insertSmartArt(v); }, insertChart: function (v) { C.insertChart(v); },
        textBox: function () { C.beginDraw({ type: 'text' }); },
        wordart: function (v) {
            var W = App.deck.size.w, Hh = App.deck.size.h;
            var e = M.textBox(W * 0.2, Hh * 0.38, W * 0.6, 110, '<div>' + SO.esc(SO.t('s_wordart_text')) + '</div>', { fs: 60, b: true, align: 'center', valign: 'middle', ff: 'theme:heading' });
            e.autofit = 'none';
            if (v === 1) { e.st.color = 'theme:accent1'; e.st.shadow = true; }
            if (v === 2) { e.st.color = '#FFFFFF'; e.fill = { type: 'gradient', color: 'theme:accent1', color2: 'theme:accent2', angle: 135 }; e.shape = 'roundRect'; }
            if (v === 3) { e.st.color = 'theme:text'; e.st.caps = true; e.st.ls = 6; }
            if (v === 4) { e.st.color = 'theme:accent2'; e.st.i = true; e.st.ff = 'Playfair Display'; }
            App.change('wordart', function () { App.slide().els.push(e); App.sel = [e.id]; });
        },
        headerFooter: C.headerFooterDialog, slideNumber: C.headerFooterDialog, insertDate: C.insertDateText,
        equation: function () { C.equationDialog(); }, symbol: C.symbolDialog, video: function () { C.videoDialog(); },
        link: C.linkDialog, addComment: function () { C.commentsPane(true); }, commentsPane: function () { C.commentsPane(); },
        themeGallery: function (v) { C.setTheme(v); }, variantGallery: function (v) { C.setVariant(v); },
        slideSizePreset: function (v) {
            var p = M.SIZES.filter(function (s) { return s.id === v; })[0];
            if (!p || (p.w === App.deck.size.w && p.h === App.deck.size.h)) return;
            App.change('slide-size', function () { M.resizeDeck(App.deck, p.w, p.h, 'fit'); }, { render: 'all' });
            setTimeout(function () { App.setZoom(0, true); }, 0);
        },
        slideSize: C.slideSizeDialog, formatBackground: function () { App.select([]); C.openFormatPane('background'); }, toggleDecor: C.toggleDecor,
        transitionGallery: function (v) { C.setTransition(v); },
        trDir: function (v) { C.transitionOpt('dir', v); if (App.show) App.show.previewTransition(App.cur); },
        trDuration: function (v) { C.transitionOpt('dur', v); },
        trAfter: function (v) { C.transitionOpt('after', v === '' || isNaN(v) ? null : v); },
        trOnClick: function (v) { C.transitionOpt('noClick', v ? null : true); },
        applyTransitionAll: C.applyTransitionAll,
        previewTransition: function () { App.show.previewTransition(App.cur); },
        animGallery: function (v) { C.addAnim(v); },
        animDir: function (v) { C.animOpt('dir', v); App.show.previewAnims(App.sel); },
        animationPane: C.animationPane, removeAnim: function () { C.removeAnims(); },
        animTrigger: function (v) { C.animOpt('trigger', v); }, animDuration: function (v) { C.animOpt('dur', v); }, animDelay: function (v) { C.animOpt('delay', v); },
        previewAnims: function () { App.show.previewAnims(null); },
        showStart: function () { App.show.start(null); }, showCurrent: function () { App.show.start(App.cur); },
        presenter: function () { App.show.start(App.cur, { presenter: true }); }, presenterInline: function () { App.show.start(App.cur, { presenterInline: true }); },
        rehearse: function () { App.show.start(null, { rehearse: true }); },
        loopShow: function (v) { App.change('loop', function () { App.deck.settings.loop = !!v; }, { render: 'none' }); },
        showHidden: function (v) { App.change('show-hidden', function () { App.deck.settings.showHidden = !!v; }, { render: 'none' }); },
        spelling: function () {
            App.spellOff = !App.spellOff;
            App.el.host.setAttribute('spellcheck', App.spellOff ? 'false' : 'true');
            SO.toast(App.spellOff ? 's_spelling_off' : 's_spelling_on');
            App.ribbon.setActive('spelling', !App.spellOff);
        },
        stats: function () {
            var words = 0, chars = 0, notesWords = 0;
            var count = function (t) { var w = t.trim() ? t.trim().split(/\s+/).length : 0; words += w; chars += t.replace(/\s/g, '').length; };
            App.deck.slides.forEach(function (s) {
                s.els.forEach(function (e) { if (e.html) count(M.htmlToText(e.html)); if (e.cells) e.cells.forEach(function (r) { r.forEach(function (c) { count(M.htmlToText(c.html)); }); }); });
                if (s.notes) notesWords += s.notes.trim().split(/\s+/).length;
            });
            var imgs = 0, charts = 0, anims = 0;
            App.deck.slides.forEach(function (s) { s.els.forEach(function (e) { if (e.type === 'image') imgs++; if (e.type === 'chart') charts++; }); anims += (s.anims || []).length; });
            SO.dialog({
                title: 's_statistics', width: 380,
                body: '<dl class="so-kv">' + [['s_stat_slides', App.deck.slides.length], ['s_stat_hidden', App.deck.slides.filter(function (s) { return s.hidden; }).length], ['s_stat_words', words], ['s_stat_chars', chars], ['s_stat_notes_words', notesWords], ['s_stat_images', imgs], ['s_stat_charts', charts], ['s_stat_animations', anims], ['s_stat_minutes', Math.max(1, Math.round(words / 130 + App.deck.slides.length * 0.5))]]
                    .map(function (r) { return '<dt>' + SO.esc(SO.t(r[0])) + '</dt><dd>' + SO.esc(SO.fmtNum(r[1])) + '</dd>'; }).join('') + '</dl>'
            });
        },
        viewNormal: function () { App.setView('normal'); }, viewSorter: function () { App.setView('sorter'); }, viewReading: function () { App.show.start(App.cur, { reading: true, noFullscreen: true }); },
        toggleGrid: function () { C.toggleView('grid'); }, toggleGuides: function () { C.toggleView('guides'); }, toggleRuler: function () { C.toggleView('snap'); },
        toggleNotes: function (v) { App.toggleNotes(typeof v === 'boolean' ? v : undefined); },
        zoomFit: function () { App.setZoom(0, true); },
        zoomDialog: function () {
            SO.form({ title: 'c_zoom', width: 300, fields: [{ name: 'z', label: 'c_zoom_percent', type: 'number', min: 10, max: 400, value: Math.round(App.zoom * 100) }] })
                .then(function (v) { if (v && v.z) App.setZoom(v.z / 100); });
        },
        changePicture: C.replaceImage, resetPicture: C.resetImage, savePicture: function () { var e = sel()[0]; if (e) C.saveElementImage(e.id); },
        imgFx: function (v) { if (v === 'none') { C.imageFx('gray', null); C.imageFx('sepia', null); } else C.imageFx(v, true); },
        tblHeader: function (v) { C.tableOp('header', v); }, tblBanded: function (v) { C.tableOp('banded', v); }, tblFirstCol: function (v) { C.tableOp('firstCol', v); },
        tableColor: function (v) { C.tableOp('tableColor', v); }, cellFill: function (v) { C.tableOp('cellFill', v); }, tableBorder: function (v) { C.tableOp('border', v); },
        rowAbove: function () { C.tableOp('rowAbove'); }, rowBelow: function () { C.tableOp('rowBelow'); }, colLeft: function () { C.tableOp('colLeft'); }, colRight: function () { C.tableOp('colRight'); },
        delRow: function () { C.tableOp('delRow'); }, delCol: function () { C.tableOp('delCol'); }, delTable: function () { C.tableOp('delTable'); },
        mergeRight: function () { C.tableOp('mergeRight'); }, mergeDown: function () { C.tableOp('mergeDown'); }, splitCell: function () { C.tableOp('split'); }, distributeCols: function () { C.tableOp('distributeCols'); },
        chartData: function () { var e = sel()[0]; if (e) C.chartDataDialog(e.id); },
        chartType: function (v) { C.chartOpt('chart', v); }, chartLegend: function (v) { C.chartOpt('legend', v); }, chartLabels: function (v) { C.chartOpt('labels', !!v); },
        chartTitle: function () { var e = sel()[0]; if (!e) return; SO.prompt('s_chart_title', e.title || '').then(function (t) { if (t != null) C.chartOpt('title', t); }); },
        chartColors: function (v) { C.chartOpt('colors', v === '' ? undefined : PALETTES[+v][1].slice()); },
        deleteSel: C.deleteSelection
    };

    function onCommand(cmd, value) {
        var h = H[cmd];
        if (!h) { console.warn('[Sinerli Present] perintah tidak dikenal', cmd); return; }
        var keepEdit = /^(fontName|fontSize|bold|italic|underline|strikeThrough|subscript|superscript|fontColor|highlight|bullets|numbering|bulletStyle|numberStyle|noBullets|indentLess|indentMore|align_|case|clearFormat|growFont|shrinkFont|symbol|insertDate|link|lineSpacingSet|valignSet|undo|redo|pasteText|rowAbove|rowBelow|colLeft|colRight|mergeRight|mergeDown|splitCell|cellFill)/.test(cmd);
        if (App.editing && !keepEdit) C.endEdit();
        try { h(value); } catch (err) { console.error(err); SO.toast(err.message || 'c_err_generic', { type: 'error' }); }
        C.updateRibbonSoon();
    }

    // ======================================================= pintasan
    App.shortcuts = {};
    function bind(combos, fn) { combos.split(' / ').forEach(function (c) { App.shortcuts[c] = fn; }); }
    function bindShortcuts() {
        bind('Mod+Z', function () { App.undo(); });
        bind('Mod+Y / Mod+Shift+Z', function () { App.redo(); });
        bind('Mod+S', function () { if (App.editing) C.commitText(); App.session.saveCloud(); });
        bind('Mod+P', function () { C.print(); });
        bind('Mod+O', function () { App.backstage.open('open'); });
        bind('Mod+M', function () { C.newSlide(); });
        bind('Mod+D', function () { C.duplicate(); });
        bind('Mod+G', function () { C.group(); });
        bind('Mod+Shift+G', function () { C.ungroup(); });
        bind('Mod+A', function () { C.selectAll(); });
        bind('Mod+F', function () { C.findPane(false); });
        bind('Mod+H', function () { C.findPane(true); });
        bind('Mod+K', function () { C.linkDialog(); });
        bind('Mod+B', function () { C.textCmd('bold'); });
        bind('Mod+I', function () { C.textCmd('italic'); });
        bind('Mod+U', function () { C.textCmd('underline'); });
        bind('Mod+L', function () { C.align('left'); });
        bind('Mod+E', function () { C.align('center'); });
        bind('Mod+R', function () { C.align('right'); });
        bind('Mod+J', function () { C.align('justify'); });
        bind('Mod+] / Mod+Shift+>', function () { C.fontSizeStep(1); });
        bind('Mod+[ / Mod+Shift+<', function () { C.fontSizeStep(-1); });
        bind('Mod+Shift+C', function () { C.painter(false); });
        bind('F5', function () { App.show.start(null); });
        bind('Shift+F5', function () { App.show.start(App.cur); });
        bind('Alt+F5', function () { App.show.start(App.cur, { presenter: true }); });
        bind('Mod+Alt+1', function () { App.setView('normal'); });
        bind('Mod+Alt+2', function () { App.setView('sorter'); });
        bind('Mod+0', function () { App.setZoom(0, true); });
        bind('Mod+= / Mod++', function () { App.setZoom(App.zoom * 1.1); });
        bind('Mod+-', function () { App.setZoom(App.zoom / 1.1); });
        bind('Mod+F1', function () { App.ribbon.toggleCollapse(); });
    }
    var SHORTCUT_HELP = [
        ['Mod+S', 's_sc_save'], ['Mod+Z', 'c_undo'], ['Mod+Y', 'c_redo'], ['Mod+M', 's_new_slide'], ['Mod+D', 's_duplicate'], ['Mod+C / Mod+X / Mod+V', 's_sc_clipboard'],
        ['Mod+G / Mod+Shift+G', 's_sc_group'], ['Mod+A', 's_select_all'], ['Mod+B / Mod+I / Mod+U', 's_sc_font'], ['Mod+L / Mod+E / Mod+R', 's_sc_align'], ['Mod+] / Mod+[', 's_sc_font_size'],
        ['Mod+K', 's_link'], ['Mod+F / Mod+H', 's_sc_find'], ['F5', 's_from_beginning'], ['Shift+F5', 's_from_current'], ['Alt+F5', 's_presenter_view'], ['Enter / F2', 's_sc_edit_text'],
        ['Tab', 's_sc_next_object'], ['Arrow', 's_sc_nudge'], ['Shift+Drag', 's_sc_constrain'], ['Mod+Drag', 's_sc_duplicate_drag'], ['Alt+Drag', 's_sc_center_resize'], ['B / W', 's_sc_black_white'], ['Mod+P (show)', 's_sc_pen']
    ];

    // ============================================================ templat
    function tpl(key) { return SO.t('s_tpl_' + key); }
    function bullets(keys) { return '<ul>' + keys.map(function (k) { return '<li>' + SO.esc(tpl(k)) + '</li>'; }).join('') + '</ul>'; }
    function fillPh(slide, title, body, body2) {
        var phs = slide.els.filter(function (e) { return e.ph; });
        var t = phs.filter(function (e) { return e.ph === 'title'; })[0];
        var others = phs.filter(function (e) { return e.ph !== 'title'; });
        if (t && title) t.html = '<div>' + SO.esc(title) + '</div>';
        if (others[0] && body != null) others[0].html = body;
        if (others[1] && body2 != null) others[1].html = body2;
        return slide;
    }
    function templateDeck(id) {
        var themeFor = { pitch: 'creative', lesson: 'sunset', report: 'corporate', project: 'ocean', portfolio: 'midnight' };
        var deck = M.newDeck('16:9', themeFor[id] || 'sinerli');
        var W = deck.size.w, Hh = deck.size.h;
        var S = function (layout) { var s = M.newSlide(layout, W, Hh); deck.slides.push(s); return s; };
        deck.slides = [];
        if (id === 'pitch') {
            fillPh(S('title'), tpl('pitch_title'), '<div>' + SO.esc(tpl('pitch_sub')) + '</div>');
            fillPh(S('titleContent'), tpl('pitch_problem'), bullets(['pitch_p1', 'pitch_p2', 'pitch_p3']));
            var sol = fillPh(S('twoContent'), tpl('pitch_solution'), bullets(['pitch_s1', 'pitch_s2']), bullets(['pitch_s3', 'pitch_s4']));
            sol.anims = [{ id: M.uid('a'), el: sol.els[1].id, effect: 'fade', trigger: 'click', dur: 0.6, delay: 0 }, { id: M.uid('a'), el: sol.els[2].id, effect: 'fade', trigger: 'after', dur: 0.6, delay: 0.2 }];
            var mk = S('titleOnly');
            fillPh(mk, tpl('pitch_market'));
            var ch = M.chart('column', W * 0.08, Hh * 0.26, W * 0.84, Hh * 0.64);
            ch.data = { labels: ['2024', '2025', '2026', '2027'], series: [{ name: tpl('pitch_revenue'), values: [1.2, 2.8, 5.1, 9.4] }, { name: tpl('pitch_users'), values: [0.8, 2.1, 4.4, 7.9] }] };
            mk.els.push(ch);
            var team = S('titleOnly');
            fillPh(team, tpl('pitch_team'));
            ['user-tie', 'user', 'users'].forEach(function (ic, i) {
                team.els.push(M.icon('fa-' + ic, W * (0.17 + i * 0.27), Hh * 0.33, 110));
                var tb = M.textBox(W * (0.09 + i * 0.27), Hh * 0.52, W * 0.26, 80, '<div><b>' + SO.esc(tpl('pitch_role' + (i + 1))) + '</b></div><div>' + SO.esc(tpl('pitch_name')) + '</div>', { align: 'center', fs: 18 });
                team.els.push(tb);
            });
            fillPh(S('section'), tpl('pitch_thanks'), '<div>' + SO.esc(tpl('pitch_contact')) + '</div>');
            deck.slides.forEach(function (s, i) { if (i) s.transition = { type: 'push', dur: 0.6, dir: 'left' }; });
        } else if (id === 'lesson') {
            fillPh(S('title'), tpl('lesson_title'), '<div>' + SO.esc(tpl('lesson_sub')) + '</div>');
            fillPh(S('titleContent'), tpl('lesson_goals'), '<ol><li>' + SO.esc(tpl('lesson_g1')) + '</li><li>' + SO.esc(tpl('lesson_g2')) + '</li><li>' + SO.esc(tpl('lesson_g3')) + '</li></ol>');
            var cmp = fillPh(S('comparison'), tpl('lesson_compare'));
            var heads = cmp.els.filter(function (e) { return e.ph === 'heading'; });
            var bodies = cmp.els.filter(function (e) { return e.ph === 'body'; });
            heads[0].html = '<div>' + SO.esc(tpl('lesson_a')) + '</div>'; heads[1].html = '<div>' + SO.esc(tpl('lesson_b')) + '</div>';
            bodies[0].html = bullets(['lesson_a1', 'lesson_a2']); bodies[1].html = bullets(['lesson_b1', 'lesson_b2']);
            var eq = S('titleOnly');
            fillPh(eq, tpl('lesson_formula'));
            eq.els.push(M.math('a^2 + b^2 = c^2', W * 0.25, Hh * 0.35, W * 0.5, 120));
            eq.els[eq.els.length - 1].st.fs = 44;
            fillPh(S('titleContent'), tpl('lesson_quiz'), bullets(['lesson_q1', 'lesson_q2', 'lesson_q3']));
            deck.slides.forEach(function (s, i) { if (i) s.transition = { type: 'fade', dur: 0.5 }; });
        } else if (id === 'report') {
            fillPh(S('title'), tpl('report_title'), '<div>' + SO.esc(tpl('report_sub')) + '</div>');
            fillPh(S('titleContent'), tpl('report_summary'), bullets(['report_s1', 'report_s2', 'report_s3']));
            var chs = S('titleOnly');
            fillPh(chs, tpl('report_sales'));
            var c1 = M.chart('line', W * 0.06, Hh * 0.25, W * 0.55, Hh * 0.66);
            c1.data = { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun'], series: [{ name: tpl('report_target'), values: [100, 110, 120, 130, 140, 150] }, { name: tpl('report_actual'), values: [96, 118, 125, 128, 152, 160] }] };
            var c2 = M.chart('doughnut', W * 0.63, Hh * 0.25, W * 0.32, Hh * 0.66);
            c2.data = { labels: [tpl('report_online'), tpl('report_store'), tpl('report_partner')], series: [{ name: tpl('report_channel'), values: [48, 32, 20] }] };
            c2.legend = 'bottom';
            chs.els.push(c1, c2);
            var tb = S('titleOnly');
            fillPh(tb, tpl('report_table'));
            var t = M.table(4, 4, W * 0.08, Hh * 0.28, W * 0.84, Hh * 0.5);
            [[tpl('report_region'), 'Q1', 'Q2', tpl('report_growth')], ['Jakarta', '1.250', '1.480', '+18%'], ['Surabaya', '860', '940', '+9%'], ['Medan', '540', '610', '+13%']].forEach(function (row, r) { row.forEach(function (v, c) { t.cells[r][c].html = SO.esc(v); if (c) t.cells[r][c].align = 'center'; }); });
            tb.els.push(t);
            fillPh(S('titleContent'), tpl('report_next'), bullets(['report_n1', 'report_n2', 'report_n3']));
        } else if (id === 'project') {
            fillPh(S('title'), tpl('project_title'), '<div>' + SO.esc(tpl('project_sub')) + '</div>');
            fillPh(S('titleContent'), tpl('project_scope'), bullets(['project_sc1', 'project_sc2', 'project_sc3']));
            var tl = S('titleOnly');
            fillPh(tl, tpl('project_timeline'));
            var line = M.line(W * 0.08, Hh * 0.58, W * 0.92, Hh * 0.58, true);
            line.line.color = 'theme:muted';
            tl.els.push(line);
            ['project_m1', 'project_m2', 'project_m3', 'project_m4'].forEach(function (k, i) {
                var x = W * (0.16 + i * 0.22);
                var dot = M.shape('ellipse', x - 16, Hh * 0.58 - 16, 32, 32);
                dot.fill = { type: 'solid', color: 'theme:accent' + (i + 1) };
                dot.line = { type: 'solid', color: 'theme:bg', w: 3 };
                tl.els.push(dot);
                var lab = M.textBox(x - W * 0.1, i % 2 ? Hh * 0.64 : Hh * 0.36, W * 0.2, 90, '<div><b>' + SO.esc(tpl('project_q' + (i + 1))) + '</b></div><div>' + SO.esc(tpl(k)) + '</div>', { align: 'center', fs: 16, valign: i % 2 ? 'top' : 'bottom' });
                lab.autofit = 'none';
                tl.els.push(lab);
                tl.anims = tl.anims || [];
                tl.anims.push({ id: M.uid('a'), el: dot.id, effect: 'zoom', trigger: i ? 'after' : 'click', dur: 0.4, delay: 0 }, { id: M.uid('a'), el: lab.id, effect: 'float', trigger: 'with', dur: 0.5, delay: 0.1, dir: 'bottom' });
            });
            fillPh(S('twoContent'), tpl('project_risks'), bullets(['project_r1', 'project_r2']), bullets(['project_r3', 'project_r4']));
            fillPh(S('section'), tpl('project_questions'), '<div>' + SO.esc(tpl('project_contact')) + '</div>');
            deck.slides.forEach(function (s, i) { if (i) s.transition = { type: 'wipe', dur: 0.6, dir: 'left' }; });
        } else if (id === 'portfolio') {
            fillPh(S('title'), tpl('portfolio_title'), '<div>' + SO.esc(tpl('portfolio_sub')) + '</div>');
            fillPh(S('pictureCaption'), tpl('portfolio_work1'), null, '<div>' + SO.esc(tpl('portfolio_desc')) + '</div>');
            fillPh(S('pictureCaption'), tpl('portfolio_work2'), null, '<div>' + SO.esc(tpl('portfolio_desc')) + '</div>');
            var sk = S('titleOnly');
            fillPh(sk, tpl('portfolio_skills'));
            [['portfolio_k1', 90], ['portfolio_k2', 75], ['portfolio_k3', 60]].forEach(function (k, i) {
                var y = Hh * (0.32 + i * 0.18);
                sk.els.push(M.textBox(W * 0.08, y, W * 0.26, 50, '<div>' + SO.esc(tpl(k[0])) + '</div>', { fs: 20, valign: 'middle' }));
                var bg = M.shape('roundRect', W * 0.36, y + 12, W * 0.54, 26);
                bg.fill = { type: 'solid', color: 'theme:light' }; bg.line = { type: 'none' }; bg.adj = 0.5;
                var fg = M.shape('roundRect', W * 0.36, y + 12, W * 0.54 * k[1] / 100, 26);
                fg.fill = { type: 'solid', color: 'theme:accent' + (i + 1) }; fg.line = { type: 'none' }; fg.adj = 0.5;
                sk.els.push(bg, fg);
                sk.anims = sk.anims || [];
                sk.anims.push({ id: M.uid('a'), el: fg.id, effect: 'wipe', trigger: i ? 'after' : 'click', dur: 0.8, delay: 0, dir: 'left' });
            });
            fillPh(S('section'), tpl('portfolio_contact'), '<div>hello@contoh.id</div>');
            deck.slides.forEach(function (s, i) { if (i) s.transition = { type: 'zoom', dur: 0.6 }; });
        }
        return deck;
    }

    function tplThumb(id) {
        var deck = id === 'blank' ? M.newDeck('16:9', 'sinerli') : templateDeck(id);
        var node = R.thumb(deck, deck.slides[0], 0, 200);
        return node.outerHTML;
    }
    var TEMPLATE_IDS = ['blank', 'pitch', 'lesson', 'report', 'project', 'portfolio'];
    function templates() {
        return TEMPLATE_IDS.map(function (id) {
            var t = { id: id, label: id === 'blank' ? 's_tpl_blank' : 's_tpl_name_' + id, desc: 's_tpl_desc_' + id };
            Object.defineProperty(t, 'thumb', { get: function () { return tplThumb(id); } });
            return t;
        });
    }

    function createFrom(id) {
        App.session.newKey();
        if (id === 'blank') App.loadDocument(null, SO.t('s_new_deck_name'));
        else { App.loadDocument(templateDeck(id), SO.t('s_tpl_name_' + id)); App.session.markDirty(); }
    }

    // ============================================================= boot
    function boot() {
        SO.applyI18n(document);
        App.shell = SO.createShell({
            logo: window.SN ? 'assets/icon.png' : SO.root + 'assets/img/tools/sineslide.webp',
            app: 'sineslide', name: 'Sinerli Present', icon: 'fa-person-chalkboard',
            onSave: function () { if (App.editing) C.commitText(); App.session.saveCloud(); },
            onUndo: function () { App.undo(); },
            onRedo: function () { App.redo(); },
            onRename: function (name) { App.shell.setName(name); App.session.markDirty(); },
            onBack: function () { if (App.editing) C.endEdit(); return App.session.flush(); }
        });
        App.ribbon = new SO.Ribbon(document.getElementById('ssRibbon'), { tabs: TABS, onCommand: onCommand, onFile: function () { if (App.editing) C.endEdit(); App.backstage.open('new'); } });
        App.session = new SO.DocSession({
            app: 'sineslide', type: 'sineslide',
            getContent: App.serialize,
            getName: function () { return App.getTitle(); },
            setName: function (n) { App.shell.setName(n); },
            getThumbnail: function () { return C.thumbnail(); },
            onStatus: function (s, e) { App.shell.setStatus(s, e); },
            // Pengamanan proyek: memasang isi versi/cloud terbaru dan cadangan berkas asli.
            applyContent: function (c, n) { App.loadDocument(c, n); },
            // Perubahan langsung dari kolaborator: tetap di slide yang sedang dilihat.
            applyLive: function (c, n) { App.loadDocument(Object.assign({}, c, { cur: App.cur }), n); },
            liveBusy: function () { return !!App.editing; },
            backup: function () { C.exportAs('sineslide'); }
        });
        App.backstage = new SO.Backstage(App.session, App.shell, {
            app: 'sineslide', type: 'sineslide', appName: 'Sinerli Present', icon: 'fa-person-chalkboard',
            templates: templates(), createFrom: createFrom,
            openAccept: '.pptx,.sineslide,.json,image/*',
            openAcceptLabel: 'PowerPoint (.pptx) · Sinerli Present',
            importFile: C.importFile,
            exportFormats: [
                { id: 'pptx', label: 's_fmt_pptx', desc: 's_fmt_pptx_desc', icon: 'fa-file-powerpoint' },
                { id: 'pdf', label: 's_fmt_pdf', desc: 's_fmt_pdf_desc', icon: 'fa-file-pdf' },
                { id: 'png', label: 's_fmt_png', desc: 's_fmt_png_desc', icon: 'fa-file-image' },
                { id: 'jpg', label: 's_fmt_jpg', desc: 's_fmt_jpg_desc', icon: 'fa-file-image' },
                { id: 'png-all', label: 's_fmt_zip', desc: 's_fmt_zip_desc', icon: 'fa-file-zipper' },
                { id: 'txt', label: 's_fmt_txt', desc: 's_fmt_txt_desc', icon: 'fa-file-lines' },
                { id: 'sineslide', label: 's_fmt_sineslide', desc: 's_fmt_sineslide_desc', icon: 'fa-box-archive' }
            ],
            exportAs: C.exportAs, print: C.print,
            loadDocument: function (c, n) { App.loadDocument(c, n); },
            restoreVersion: function (content, name) { App.loadDocument(content, name); App.session.markDirty(); SO.toast('c_version_restored', { type: 'success' }); },
            info: function () {
                var words = 0;
                App.deck.slides.forEach(function (s) { s.els.forEach(function (e) { if (e.html) { var t = M.htmlToText(e.html).trim(); if (t) words += t.split(/\s+/).length; } }); });
                return [['s_info_slides', SO.fmtNum(App.deck.slides.length)], ['s_info_size', App.deck.size.id], ['s_info_theme', SO.t(M.themeById(App.deck.theme.id).label)], ['s_stat_words', SO.fmtNum(words)]];
            },
            renderOptions: function (box) {
                var mk = function (label, checked, fn) {
                    var l = SO.el('label', { class: 'so-field is-inline' });
                    var cb = SO.el('input', { type: 'checkbox' });
                    cb.checked = checked;
                    cb.addEventListener('change', function () { fn(cb.checked); });
                    l.appendChild(cb);
                    l.appendChild(SO.el('span', { text: SO.t(label) }));
                    box.appendChild(l);
                };
                mk('s_opt_snap', !App.snapOff, function (v) { if (App.snapOff === v) C.toggleView('snap'); });
                mk('s_opt_notes', !App.el.notes.hidden, function (v) { App.toggleNotes(v); });
            },
            shortcuts: SHORTCUT_HELP,
            onBackstageClose: function () { C.focusCanvas(); }
        });
        bindShortcuts();

        try {
            var view = JSON.parse(localStorage.getItem('ss_view') || '{}');
            App.showGrid = !!view.grid; App.showGuides = !!view.guides; App.snapOff = !!view.snapOff;
        } catch (e) {}
        var notesOn = true;
        try { notesOn = localStorage.getItem('ss_notes') !== '0'; var nh = +localStorage.getItem('ss_notes_h'); if (nh) App.el.notes.style.height = nh + 'px'; } catch (e) {}
        App.toggleNotes(notesOn);

        document.getElementById('ssZoomRange').addEventListener('input', function (e) { App.setZoom(+e.target.value / 100); });
        document.getElementById('ssZoomIn').addEventListener('click', function () { App.setZoom(App.zoom * 1.1); });
        document.getElementById('ssZoomOut').addEventListener('click', function () { App.setZoom(App.zoom / 1.1); });
        document.getElementById('ssZoomVal').addEventListener('click', H.zoomDialog);
        document.getElementById('ssZoomFit').addEventListener('click', function () { App.setZoom(0, true); });
        document.getElementById('ssStNotes').addEventListener('click', function () { App.toggleNotes(); });
        document.getElementById('ssStComments').addEventListener('click', function () { C.commentsPane(); });
        SO.$$('.ss-view-btn').forEach(function (b) {
            b.addEventListener('click', function () {
                if (b.dataset.view === 'show') App.show.start(App.cur);
                else if (b.dataset.view === 'reading') H.viewReading();
                else App.setView(b.dataset.view);
            });
        });
        document.getElementById('ssPaneClose').addEventListener('click', App.closePane);
        document.getElementById('ssAddSlide').addEventListener('click', function () { C.newSlide(); });
        R.onAsyncRender = SO.debounce(function () { if (App.deck && !App.editing) R.fitText(App.el.host); }, 100);
        SO.onLang(function () { App.renderAll(); C.updateRibbon(); });

        var freshOpen = !SO.ctx.projectId && !SO.ctx.draft;
        App.session.boot().then(function (res) {
            App.loadDocument(res ? res.content : null, res ? res.name : SO.t('s_new_deck_name'));
            if (!App.session.protected) App.session.loaded();
            App.shell.hideLoading();
            C.updateRibbon();
            App.setView('normal');
            if (res && App.backstage.openFromUrl()) { /* bagian menu Berkas diminta Dashboard */ }
            else if (freshOpen && SO.ctx.params.get('action') !== 'blank') App.backstage.open('new');
        }).catch(function (err) {
            console.error(err);
            App.session.loadFailed(err);
            App.loadDocument(null, SO.t('s_new_deck_name'));
            App.shell.hideLoading();
        });
    }

    boot();
})(window);
