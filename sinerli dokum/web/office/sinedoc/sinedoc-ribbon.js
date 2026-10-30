/**
 * Sinerli Dokum — definisi ribbon, pintasan keyboard, menu File, dan boot aplikasi.
 */
(function (global) {
    'use strict';

    var App = global.SineDoc;
    var C = App.cmd;
    var editor = App.editor;

    function fontOptions() {
        return SO.FONTS.map(function (f) { return { value: f, text: f, style: 'font-family:' + SO.fontStack(f) }; });
    }
    function sizeOptions() { return SO.FONT_SIZES.map(function (s) { return { value: s, text: String(s) }; }); }

    var BULLET_STYLES = [['disc', '●', 'd_bullet_disc'], ['circle', '○', 'd_bullet_circle'], ['square', '■', 'd_bullet_square'], ['➤', '➤', 'd_bullet_arrow'], ['✓', '✓', 'd_bullet_check'], ['–', '–', 'd_bullet_dash']];
    var NUMBER_STYLES = [
        { value: 'decimal', text: '1. 2. 3.' }, { value: 'lower-alpha', text: 'a. b. c.' }, { value: 'upper-alpha', text: 'A. B. C.' },
        { value: 'lower-roman', text: 'i. ii. iii.' }, { value: 'upper-roman', text: 'I. II. III.' }, { value: 'decimal-leading-zero', text: '01. 02. 03.' }
    ];

    var STYLE_ITEMS = [
        { value: 'p', label: 'd_style_normal', style: 'font-size:12px' },
        { value: 'nospace', label: 'd_style_nospace', style: 'font-size:12px' },
        { value: 'title', label: 'd_style_title', style: 'font-size:18px;letter-spacing:-.3px' },
        { value: 'subtitle', label: 'd_style_subtitle', style: 'font-size:13px;color:#595959' },
        { value: 'h1', label: 'd_style_h1', style: 'font-size:15px;font-weight:700;color:#1f3864' },
        { value: 'h2', label: 'd_style_h2', style: 'font-size:13px;font-weight:700;color:#2f5496' },
        { value: 'h3', label: 'd_style_h3', style: 'font-size:12px;font-weight:700;color:#1f3864' },
        { value: 'h4', label: 'd_style_h4', style: 'font-size:12px;font-weight:700;font-style:italic;color:#2f5496' },
        { value: 'quote', label: 'd_style_quote', style: 'font-size:12px;font-style:italic;color:#404040' },
        { value: 'code', label: 'd_style_code', style: 'font-size:11px;font-family:Roboto Mono,monospace' }
    ];

    var TABS = [
        {
            id: 'home', label: 'd_tab_home', groups: [
                { label: 'd_grp_clipboard', items: [
                    { t: 'split', lg: true, cmd: 'paste', icon: 'fa-paste', label: 'd_paste', key: 'Mod+V', menu: [
                        { label: 'd_paste', icon: 'fa-paste', key: 'Mod+V', cmd: 'paste' },
                        { label: 'd_paste_plain', icon: 'fa-file-lines', key: 'Mod+Shift+V', cmd: 'pastePlain' }
                    ] },
                    { t: 'rows', rows: [
                        [{ cmd: 'cut', icon: 'fa-scissors', label: 'd_cut', key: 'Mod+X', showLabel: true }],
                        [{ cmd: 'copy', icon: 'fa-copy', label: 'd_copy', key: 'Mod+C', showLabel: true }],
                        [{ cmd: 'painter', icon: 'fa-paintbrush', label: 'd_painter', desc: 'd_painter_desc', showLabel: true }]
                    ] }
                ] },
                { label: 'd_grp_font', items: [
                    { t: 'rows', rows: [
                        [
                            { t: 'select', cmd: 'fontName', label: 'd_font', width: 138, editable: true, options: fontOptions, menuWidth: 220 },
                            { t: 'select', cmd: 'fontSize', label: 'd_font_size', width: 58, editable: true, options: sizeOptions },
                            { cmd: 'grow', icon: 'fa-arrow-up-long', label: 'd_grow_font', key: 'Mod+]' },
                            { cmd: 'shrink', icon: 'fa-arrow-down-long', label: 'd_shrink_font', key: 'Mod+[' },
                            { t: 'drop', icon: 'fa-font', label: 'd_change_case', menu: [
                                { label: 'd_case_sentence', cmd: 'case', value: 'sentence' }, { label: 'd_case_lower', cmd: 'case', value: 'lower' },
                                { label: 'd_case_upper', cmd: 'case', value: 'upper' }, { label: 'd_case_title', cmd: 'case', value: 'title' },
                                { label: 'd_case_toggle', cmd: 'case', value: 'toggle' }
                            ] },
                            { cmd: 'clearFormat', icon: 'fa-text-slash', label: 'd_clear_format', key: 'Mod+\\' }
                        ],
                        [
                            { cmd: 'bold', icon: 'fa-bold', label: 'd_bold', key: 'Mod+B' },
                            { cmd: 'italic', icon: 'fa-italic', label: 'd_italic', key: 'Mod+I' },
                            { cmd: 'underline', icon: 'fa-underline', label: 'd_underline', key: 'Mod+U' },
                            { cmd: 'strikeThrough', icon: 'fa-strikethrough', label: 'd_strike' },
                            { cmd: 'subscript', icon: 'fa-subscript', label: 'd_subscript', key: 'Mod+=' },
                            { cmd: 'superscript', icon: 'fa-superscript', label: 'd_superscript', key: 'Mod+Shift+=' },
                            { t: 'sep' },
                            { t: 'color', cmd: 'foreColor', icon: 'fa-font', label: 'd_font_color', value: '#C00000', autoLabel: 'd_automatic' },
                            { t: 'color', cmd: 'hiliteColor', icon: 'fa-highlighter', label: 'd_highlight', value: '#FFFF00', allowNone: true, noneLabel: 'd_no_highlight' }
                        ]
                    ] }
                ] },
                { label: 'd_grp_paragraph', items: [
                    { t: 'rows', rows: [
                        [
                            { t: 'split', cmd: 'bullets', icon: 'fa-list-ul', label: 'd_bullets', key: 'Mod+Shift+8', menu: function () { return BULLET_STYLES.map(function (s) { return { text: s[1] + '   ' + SO.t(s[2]), cmd: 'bulletStyle', value: s[0] }; }); } },
                            { t: 'split', cmd: 'numbering', icon: 'fa-list-ol', label: 'd_numbering', key: 'Mod+Shift+7', menu: function () { return NUMBER_STYLES.map(function (s) { return { text: s.text, cmd: 'numberStyle', value: s.value }; }).concat([{ sep: true }, { label: 'd_restart_numbering', icon: 'fa-arrow-rotate-left', cmd: 'restartNumbering' }]); } },
                            { cmd: 'checklist', icon: 'fa-square-check', label: 'd_checklist', key: 'Mod+Shift+9' },
                            { cmd: 'outdent', icon: 'fa-outdent', label: 'd_outdent', key: 'Shift+Tab' },
                            { cmd: 'indent', icon: 'fa-indent', label: 'd_indent', key: 'Tab' },
                            { cmd: 'showMarks', icon: 'fa-paragraph', label: 'd_show_marks' }
                        ],
                        [
                            { cmd: 'align_left', icon: 'fa-align-left', label: 'd_align_left', key: 'Mod+L' },
                            { cmd: 'align_center', icon: 'fa-align-center', label: 'd_align_center', key: 'Mod+E' },
                            { cmd: 'align_right', icon: 'fa-align-right', label: 'd_align_right', key: 'Mod+R' },
                            { cmd: 'align_justify', icon: 'fa-align-justify', label: 'd_align_justify', key: 'Mod+J' },
                            { t: 'sep' },
                            { t: 'drop', icon: 'fa-text-height', label: 'd_line_spacing', menu: function () {
                                return ['1', '1.15', '1.5', '2', '2.5', '3'].map(function (v) { return { text: v.replace('.', SO.lang() === 'id' ? ',' : '.'), cmd: 'lineSpacing', value: v }; })
                                    .concat([{ sep: true }, { label: 'd_toggle_space_before', cmd: 'spaceBefore' }, { label: 'd_toggle_space_after', cmd: 'spaceAfter' }, { sep: true }, { label: 'd_paragraph_options', icon: 'fa-sliders', cmd: 'paragraphDialog' }]);
                            } },
                            { cmd: 'paragraphDialog', icon: 'fa-sliders', label: 'd_paragraph' }
                        ]
                    ] }
                ] },
                { label: 'd_grp_styles', items: [
                    { t: 'gallery', cmd: 'blockStyle', items: STYLE_ITEMS }
                ] },
                { label: 'd_grp_editing', items: [
                    { t: 'rows', rows: [
                        [{ cmd: 'find', icon: 'fa-magnifying-glass', label: 'd_find', key: 'Mod+F', showLabel: true }],
                        [{ cmd: 'replace', icon: 'fa-right-left', label: 'd_replace', key: 'Mod+Shift+H', showLabel: true }],
                        [{ cmd: 'selectAll', icon: 'fa-i-cursor', label: 'd_select_all', key: 'Mod+A', showLabel: true }]
                    ] }
                ] }
            ]
        },
        {
            id: 'insert', label: 'd_tab_insert', groups: [
                { label: 'd_grp_pages', items: [
                    { lg: true, cmd: 'pageBreak', icon: 'fa-file-circle-plus', label: 'd_page_break', key: 'Mod+Enter' },
                    { lg: true, cmd: 'blankPage', icon: 'fa-file', label: 'd_blank_page' }
                ] },
                { label: 'd_grp_tables', items: [
                    { t: 'drop', lg: true, icon: 'fa-table', label: 'd_table', menu: function () { return C.tablePicker(); } }
                ] },
                { label: 'd_grp_illustrations', items: [
                    { t: 'split', lg: true, cmd: 'image', icon: 'fa-image', label: 'd_image', menu: [
                        { label: 'd_image_device', icon: 'fa-laptop', cmd: 'image' },
                        { label: 'd_image_from_url', icon: 'fa-globe', cmd: 'imageUrl' }
                    ] },
                    { t: 'rows', rows: [
                        [{ cmd: 'textBox', icon: 'fa-square-pen', label: 'd_text_box', showLabel: true }],
                        [{ cmd: 'hr', icon: 'fa-minus', label: 'd_horizontal_line', showLabel: true }],
                        [{ cmd: 'insertFromFile', icon: 'fa-file-import', label: 'd_text_from_file', showLabel: true }]
                    ] }
                ] },
                { label: 'd_grp_links', items: [
                    { lg: true, cmd: 'link', icon: 'fa-link', label: 'd_link', key: 'Mod+K' },
                    { lg: true, cmd: 'comment', icon: 'fa-comment-medical', label: 'd_comment', key: 'Mod+Alt+M' }
                ] },
                { label: 'd_grp_header_footer', items: [
                    { t: 'drop', lg: true, icon: 'fa-heading', label: 'd_header', menu: [
                        { label: 'd_edit_header', icon: 'fa-pen', cmd: 'editHeader' }, { label: 'd_remove_header', icon: 'fa-trash', cmd: 'removeHeader' }
                    ] },
                    { t: 'drop', lg: true, icon: 'fa-shoe-prints', label: 'd_footer', menu: [
                        { label: 'd_edit_footer', icon: 'fa-pen', cmd: 'editFooter' }, { label: 'd_remove_footer', icon: 'fa-trash', cmd: 'removeFooter' }
                    ] },
                    { t: 'drop', lg: true, icon: 'fa-hashtag', label: 'd_page_number', menu: [
                        { head: 'd_pn_top' },
                        { label: 'd_pn_left', cmd: 'pageNumbers', value: 'top-left' }, { label: 'd_pn_center', cmd: 'pageNumbers', value: 'top-center' }, { label: 'd_pn_right', cmd: 'pageNumbers', value: 'top-right' },
                        { head: 'd_pn_bottom' },
                        { label: 'd_pn_left', cmd: 'pageNumbers', value: 'bottom-left' }, { label: 'd_pn_center', cmd: 'pageNumbers', value: 'bottom-center' }, { label: 'd_pn_right', cmd: 'pageNumbers', value: 'bottom-right' },
                        { label: 'd_pn_x_of_y', cmd: 'pageNumbers', value: 'xofy-center' },
                        { sep: true }, { label: 'd_pn_remove', icon: 'fa-trash', cmd: 'pageNumbers', value: 'none' }
                    ] }
                ] },
                { label: 'd_grp_text', items: [
                    { t: 'drop', lg: true, icon: 'fa-calendar-day', label: 'd_date_time', menu: function () { return C.dateTime(); } }
                ] },
                { label: 'd_grp_symbols', items: [
                    { lg: true, cmd: 'equation', icon: 'fa-square-root-variable', label: 'd_equation' },
                    { lg: true, cmd: 'symbol', icon: 'fa-infinity', label: 'd_symbol' }
                ] }
            ]
        },
        {
            id: 'layout', label: 'd_tab_layout', groups: [
                { label: 'd_grp_page_setup', items: [
                    { t: 'drop', lg: true, icon: 'fa-border-none', label: 'd_margins', menu: function () {
                        var m = App.settings.margins;
                        var cur = Object.keys(C.MARGIN_PRESETS).filter(function (k) { var p = C.MARGIN_PRESETS[k]; return p.top === m.top && p.bottom === m.bottom && p.left === m.left && p.right === m.right; })[0];
                        return ['normal', 'narrow', 'moderate', 'wide', 'indo'].map(function (k) {
                            var p = C.MARGIN_PRESETS[k];
                            return { label: 'd_margin_' + k, cmd: 'margins', value: k, checked: cur === k, labelHtml: SO.esc(SO.t('d_margin_' + k)) + '<br><small style="color:var(--so-muted)">' + [p.top, p.bottom, p.left, p.right].map(function (x) { return SO.fmtNum(Math.round(x * 10) / 100) + ' cm'; }).join(' · ') + '</small>' };
                        }).concat([{ sep: true }, { label: 'd_custom_margins', icon: 'fa-sliders', cmd: 'pageSetup' }]);
                    } },
                    { t: 'drop', lg: true, icon: 'fa-rotate', label: 'd_orientation', menu: function () {
                        return [
                            { label: 'd_portrait', icon: 'fa-file', cmd: 'orientation', value: 'portrait', checked: App.settings.orientation !== 'landscape' },
                            { label: 'd_landscape', icon: 'fa-file fa-rotate-90', cmd: 'orientation', value: 'landscape', checked: App.settings.orientation === 'landscape' }
                        ];
                    } },
                    { t: 'drop', lg: true, icon: 'fa-file-lines', label: 'd_size', menu: function () {
                        return Object.keys(SDLayout.PAGE_SIZES).map(function (k) {
                            var z = SDLayout.PAGE_SIZES[k];
                            return { text: k.toUpperCase().replace('LETTER', 'Letter').replace('LEGAL', 'Legal') + '  —  ' + SO.fmtNum(z.w / 10) + ' × ' + SO.fmtNum(z.h / 10) + ' cm', cmd: 'pageSize', value: k, checked: App.settings.size === k };
                        }).concat([{ sep: true }, { label: 'd_page_setup', icon: 'fa-sliders', cmd: 'pageSetup' }]);
                    } },
                    { t: 'drop', lg: true, icon: 'fa-table-columns', label: 'd_columns', menu: [
                        { label: 'd_col_one', cmd: 'columns', value: 1 }, { label: 'd_col_two', cmd: 'columns', value: 2 },
                        { label: 'd_col_three', cmd: 'columns', value: 3 }, { label: 'd_col_two_line', cmd: 'columns', value: '2line' }
                    ] },
                    { t: 'drop', lg: true, icon: 'fa-scissors', label: 'd_breaks', menu: [
                        { label: 'd_page_break', icon: 'fa-file-circle-plus', key: 'Mod+Enter', cmd: 'pageBreak' },
                        { label: 'd_blank_page', icon: 'fa-file', cmd: 'blankPage' }
                    ] }
                ] },
                { label: 'd_grp_paragraph', items: [
                    { t: 'rows', rows: [
                        [{ cmd: 'indent', icon: 'fa-indent', label: 'd_indent', showLabel: true }, { cmd: 'spaceBefore', icon: 'fa-arrow-up-wide-short', label: 'd_toggle_space_before', showLabel: true }],
                        [{ cmd: 'outdent', icon: 'fa-outdent', label: 'd_outdent', showLabel: true }, { cmd: 'spaceAfter', icon: 'fa-arrow-down-wide-short', label: 'd_toggle_space_after', showLabel: true }],
                        [{ cmd: 'paragraphDialog', icon: 'fa-sliders', label: 'd_paragraph_options', showLabel: true }]
                    ] }
                ] },
                { label: 'd_grp_design', items: [
                    { t: 'rows', rows: [[{ t: 'color', cmd: 'pageColor', icon: 'fa-fill-drip', label: 'd_page_color', showLabel: true, value: '#FFF2CC', allowNone: true, noneLabel: 'd_no_color_white' }]] },
                    { t: 'drop', lg: true, icon: 'fa-stamp', label: 'd_watermark', menu: [
                        { label: 'd_wm_confidential', cmd: 'watermark', value: 'd_wm_confidential' }, { label: 'd_wm_draft', cmd: 'watermark', value: 'd_wm_draft' },
                        { label: 'd_wm_sample', cmd: 'watermark', value: 'd_wm_sample' }, { label: 'd_wm_urgent', cmd: 'watermark', value: 'd_wm_urgent' },
                        { sep: true }, { label: 'd_wm_custom', icon: 'fa-pen', cmd: 'watermark', value: 'custom' }, { label: 'd_wm_remove', icon: 'fa-trash', cmd: 'watermark', value: '' }
                    ] },
                    { lg: true, cmd: 'pageBorder', icon: 'fa-vector-square', label: 'd_page_borders' },
                    { lg: true, cmd: 'docFont', icon: 'fa-font', label: 'd_doc_font' }
                ] }
            ]
        },
        {
            id: 'references', label: 'd_tab_references', groups: [
                { label: 'd_grp_toc', items: [
                    { t: 'drop', lg: true, icon: 'fa-list-check', label: 'd_toc', menu: [
                        { label: 'd_toc_levels_2', cmd: 'toc', value: 2 }, { label: 'd_toc_levels_3', cmd: 'toc', value: 3 }, { label: 'd_toc_levels_4', cmd: 'toc', value: 4 },
                        { sep: true }, { label: 'd_toc_update', icon: 'fa-rotate', cmd: 'updateToc' }, { label: 'd_toc_remove', icon: 'fa-trash', cmd: 'removeToc' }
                    ] },
                    { lg: true, cmd: 'updateToc', icon: 'fa-rotate', label: 'd_toc_update' }
                ] },
                { label: 'd_grp_footnotes', items: [
                    { lg: true, cmd: 'footnote', icon: 'fa-note-sticky', label: 'd_insert_footnote', key: 'Mod+Alt+F' }
                ] },
                { label: 'd_grp_navigation', items: [
                    { lg: true, cmd: 'navPane', icon: 'fa-sitemap', label: 'd_nav_pane' },
                    { lg: true, cmd: 'wordCount', icon: 'fa-calculator', label: 'd_word_count' }
                ] }
            ]
        },
        {
            id: 'review', label: 'd_tab_review', groups: [
                { label: 'd_grp_proofing', items: [
                    { lg: true, cmd: 'spell', icon: 'fa-spell-check', label: 'd_spellcheck' },
                    { t: 'drop', lg: true, icon: 'fa-language', label: 'd_proof_language', menu: function () {
                        var cur = App.settings.proofLang || '';
                        return [['id-ID', 'Bahasa Indonesia'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['zh-CN', '中文 (简体)']].map(function (l) { return { text: l[1], cmd: 'proofLang', value: l[0], checked: cur === l[0] }; });
                    } },
                    { lg: true, cmd: 'wordCount', icon: 'fa-calculator', label: 'd_word_count' }
                ] },
                { label: 'd_grp_speech', items: [
                    { lg: true, cmd: 'readAloud', icon: 'fa-volume-high', label: 'd_read_aloud' },
                    { lg: true, cmd: 'dictate', icon: 'fa-microphone', label: 'd_dictate' }
                ] },
                { label: 'd_grp_comments', items: [
                    { lg: true, cmd: 'comment', icon: 'fa-comment-medical', label: 'd_new_comment', key: 'Mod+Alt+M' },
                    { t: 'rows', rows: [
                        [{ cmd: 'prevComment', icon: 'fa-chevron-left', label: 'd_prev_comment', showLabel: true }],
                        [{ cmd: 'nextComment', icon: 'fa-chevron-right', label: 'd_next_comment', showLabel: true }],
                        [{ cmd: 'deleteAllComments', icon: 'fa-trash', label: 'd_delete_all_comments_short', showLabel: true }]
                    ] },
                    { lg: true, cmd: 'commentPane', icon: 'fa-comments', label: 'd_show_comments' }
                ] },
                { label: 'd_grp_tracking', items: [
                    { lg: true, cmd: 'track', icon: 'fa-pen-to-square', label: 'd_track_changes', key: 'Mod+Shift+E' },
                    { t: 'rows', rows: [
                        [{ cmd: 'markup', icon: 'fa-eye', label: 'd_show_markup', showLabel: true }],
                        [{ cmd: 'prevChange', icon: 'fa-chevron-left', label: 'd_prev_change', showLabel: true }],
                        [{ cmd: 'nextChange', icon: 'fa-chevron-right', label: 'd_next_change', showLabel: true }]
                    ] }
                ] },
                { label: 'd_grp_changes', items: [
                    { t: 'split', lg: true, cmd: 'accept', icon: 'fa-check', label: 'd_accept', menu: [
                        { label: 'd_accept_one', cmd: 'accept' }, { label: 'd_accept_all', cmd: 'acceptAll' }
                    ] },
                    { t: 'split', lg: true, cmd: 'reject', icon: 'fa-xmark', label: 'd_reject', menu: [
                        { label: 'd_reject_one', cmd: 'reject' }, { label: 'd_reject_all', cmd: 'rejectAll' }
                    ] }
                ] },
                { label: 'd_grp_protect', items: [
                    { lg: true, cmd: 'readOnly', icon: 'fa-lock', label: 'd_restrict_editing' }
                ] }
            ]
        },
        {
            id: 'view', label: 'd_tab_view', groups: [
                { label: 'd_grp_views', items: [
                    { lg: true, cmd: 'readMode', icon: 'fa-book-open', label: 'd_read_mode' },
                    { lg: true, cmd: 'focusMode', icon: 'fa-expand', label: 'd_focus_mode' },
                    { lg: true, cmd: 'print', icon: 'fa-print', label: 'd_print', key: 'Mod+P' }
                ] },
                { label: 'd_grp_show', items: [
                    { t: 'rows', rows: [
                        [{ cmd: 'ruler', icon: 'fa-ruler-horizontal', label: 'd_ruler', showLabel: true }],
                        [{ cmd: 'navPane', icon: 'fa-sitemap', label: 'd_nav_pane', showLabel: true }],
                        [{ cmd: 'showMarks', icon: 'fa-paragraph', label: 'd_show_marks', showLabel: true }]
                    ] }
                ] },
                { label: 'c_zoom', items: [
                    { lg: true, cmd: 'zoomDialog', icon: 'fa-magnifying-glass-plus', label: 'c_zoom' },
                    { lg: true, cmd: 'zoom100', icon: 'fa-1', label: 'd_zoom_100' },
                    { t: 'rows', rows: [
                        [{ cmd: 'fitPage', icon: 'fa-file', label: 'd_one_page', showLabel: true }],
                        [{ cmd: 'fitWidth', icon: 'fa-arrows-left-right', label: 'd_page_width', showLabel: true }]
                    ] }
                ] }
            ]
        },
        SO.aiRibbonTab('sinedoc'),
        {
            id: 'table', label: 'd_tab_table', contextual: true, groups: [
                { label: 'd_grp_rows_cols', items: [
                    { t: 'rows', rows: [
                        [{ cmd: 'rowAbove', icon: 'fa-arrow-up', label: 'd_row_above', showLabel: true }, { cmd: 'colLeft', icon: 'fa-arrow-left', label: 'd_col_left', showLabel: true }],
                        [{ cmd: 'rowBelow', icon: 'fa-arrow-down', label: 'd_row_below', showLabel: true }, { cmd: 'colRight', icon: 'fa-arrow-right', label: 'd_col_right', showLabel: true }]
                    ] },
                    { t: 'drop', lg: true, icon: 'fa-trash-can', label: 'c_delete', menu: [
                        { label: 'd_delete_row', cmd: 'rowDelete' }, { label: 'd_delete_col', cmd: 'colDelete' }, { label: 'd_delete_table', danger: true, cmd: 'tableDelete' }
                    ] }
                ] },
                { label: 'd_grp_merge', items: [
                    { lg: true, cmd: 'merge', icon: 'fa-object-group', label: 'd_merge_cells' },
                    { lg: true, cmd: 'split', icon: 'fa-object-ungroup', label: 'd_split_cell' }
                ] },
                { label: 'd_grp_table_style', items: [
                    { t: 'drop', lg: true, icon: 'fa-swatchbook', label: 'd_table_styles', menu: function () {
                        return Object.keys(C.TABLE_STYLES).map(function (k) {
                            var st = C.TABLE_STYLES[k];
                            var sw = st ? '<span style="display:inline-block;width:14px;height:10px;background:' + st.head + ';margin-right:3px;border-radius:2px"></span><span style="display:inline-block;width:14px;height:10px;background:' + st.band + ';margin-right:8px;border-radius:2px;border:1px solid #ddd"></span>' : '<span style="display:inline-block;width:31px"></span>';
                            return { label: 'd_tstyle_' + k, labelHtml: sw + SO.esc(SO.t('d_tstyle_' + k)), cmd: 'tableStyle', value: k };
                        });
                    } },
                    { t: 'rows', rows: [
                        [{ cmd: 'headerRow', icon: 'fa-heading', label: 'd_header_row', showLabel: true }],
                        [{ cmd: 'tableBorders', icon: 'fa-border-all', label: 'd_toggle_borders', showLabel: true }],
                        [{ t: 'color', cmd: 'cellShading', icon: 'fa-fill-drip', label: 'd_cell_shading', value: '#DAE3F3', allowNone: true }]
                    ] }
                ] },
                { label: 'd_grp_cell', items: [
                    { t: 'rows', rows: [
                        [{ cmd: 'valign_top', icon: 'fa-arrow-up-long', label: 'd_valign_top' }, { cmd: 'valign_middle', icon: 'fa-grip-lines', label: 'd_valign_middle' }, { cmd: 'valign_bottom', icon: 'fa-arrow-down-long', label: 'd_valign_bottom' }],
                        [{ cmd: 'distribute', icon: 'fa-table-columns', label: 'd_distribute_cols' }, { t: 'drop', icon: 'fa-arrows-left-right-to-line', label: 'd_autofit', menu: [{ label: 'd_autofit_content', cmd: 'autofit', value: 'content' }, { label: 'd_autofit_window', cmd: 'autofit', value: 'window' }] }]
                    ] },
                    { lg: true, cmd: 'tableProps', icon: 'fa-sliders', label: 'd_table_props' },
                    { lg: true, cmd: 'tableSelect', icon: 'fa-vector-square', label: 'd_select_table' }
                ] }
            ]
        },
        {
            id: 'picture', label: 'd_tab_picture', contextual: true, groups: [
                { label: 'd_grp_arrange', items: [
                    { t: 'drop', lg: true, icon: 'fa-align-left', label: 'd_wrap_text', menu: [
                        { label: 'd_wrap_inline', cmd: 'imgWrap', value: 'inline' }, { label: 'd_wrap_left', cmd: 'imgWrap', value: 'left' },
                        { label: 'd_wrap_right', cmd: 'imgWrap', value: 'right' }, { label: 'd_wrap_center', cmd: 'imgWrap', value: 'center' }
                    ] }
                ] },
                { label: 'd_grp_picture_style', items: [
                    { t: 'rows', rows: [
                        [{ cmd: 'imgBorder', icon: 'fa-square', label: 'd_img_border', showLabel: true }],
                        [{ cmd: 'imgRound', icon: 'fa-circle', label: 'd_img_round', showLabel: true }],
                        [{ cmd: 'imgShadow', icon: 'fa-clone', label: 'd_img_shadow', showLabel: true }]
                    ] }
                ] },
                { label: 'd_grp_adjust', items: [
                    { t: 'rows', rows: [
                        [{ cmd: 'imgRotl', icon: 'fa-rotate-left', label: 'd_rotate_left' }, { cmd: 'imgRotr', icon: 'fa-rotate-right', label: 'd_rotate_right' }],
                        [{ cmd: 'imgFlipH', icon: 'fa-left-right', label: 'd_flip_h' }, { cmd: 'imgFlipV', icon: 'fa-up-down', label: 'd_flip_v' }]
                    ] },
                    { lg: true, cmd: 'imgReplace', icon: 'fa-image', label: 'd_replace_image' }
                ] },
                { label: 'd_grp_size', items: [
                    { lg: true, cmd: 'imgSize', icon: 'fa-up-right-and-down-left-from-center', label: 'd_image_size' },
                    { lg: true, cmd: 'imgReset', icon: 'fa-arrows-rotate', label: 'd_reset_size' },
                    { lg: true, cmd: 'imgAlt', icon: 'fa-closed-captioning', label: 'd_alt_text' },
                    { lg: true, cmd: 'imgDelete', icon: 'fa-trash', label: 'c_delete' }
                ] }
            ]
        }
    ];

    // ============================================================ dispatch
    var HANDLERS = {
        // Panel AI — implementasinya bersama di tools/office/shared/office-ai.js.
        aiPanel: function () { SO.ai.toggle(); },
        aiMode: function (v) { SO.ai.open(v); },
        aiQuota: function () { SO.ai.open(); SO.ai.fetchQuota(); },
        undo: function () { App.undo(); }, redo: function () { App.redo(); },
        paste: function () { C.clipboard('paste'); }, pastePlain: function () { C.clipboard('pastePlain'); },
        cut: function () { C.clipboard('cut'); }, copy: function () { C.clipboard('copy'); },
        painter: function () { C.painter(false); },
        fontName: C.fontName, fontSize: C.fontSize,
        grow: function () { C.growFont(1); }, shrink: function () { C.growFont(-1); },
        'case': C.changeCase, clearFormat: C.clearFormat,
        bold: function () { C.simple('bold'); }, italic: function () { C.simple('italic'); }, underline: function () { C.simple('underline'); },
        strikeThrough: function () { C.simple('strikeThrough'); }, subscript: function () { C.simple('subscript'); }, superscript: function () { C.simple('superscript'); },
        foreColor: C.foreColor, hiliteColor: C.hiliteColor,
        bullets: function () { C.bullets(); }, bulletStyle: function (v) { C.bullets(v); },
        numbering: function () { C.numbering(); }, numberStyle: function (v) { C.numbering(v); }, restartNumbering: C.restartNumbering,
        checklist: C.checklist, indent: function () { C.indent(1); }, outdent: function () { C.indent(-1); },
        showMarks: C.toggleMarks,
        align_left: function () { C.align('left'); }, align_center: function () { C.align('center'); },
        align_right: function () { C.align('right'); }, align_justify: function () { C.align('justify'); },
        lineSpacing: C.lineSpacing, spaceBefore: function () { C.toggleSpace('before'); }, spaceAfter: function () { C.toggleSpace('after'); },
        paragraphDialog: C.paragraphDialog, blockStyle: C.blockStyle,
        find: function () { C.openFind(false); }, replace: function () { C.openFind(true); },
        selectAll: function () { editor.focus(); C.exec('selectAll'); },
        pageBreak: C.pageBreak, blankPage: C.blankPage, image: C.insertImage, imageUrl: C.insertImageUrl,
        textBox: C.textBox, hr: C.hr, insertFromFile: C.insertFromFile, link: C.link, comment: function () { C.addComment(); },
        editHeader: function () { C.editHeaderFooter('header', App.currentPage() - 1); },
        editFooter: function () { C.editHeaderFooter('footer', App.currentPage() - 1); },
        removeHeader: function () { C.removeHeaderFooter('header'); }, removeFooter: function () { C.removeHeaderFooter('footer'); },
        pageNumbers: C.pageNumbers, equation: function () { C.equation(); }, symbol: C.symbolDialog,
        margins: C.margins, orientation: function (v) { C.setSettings({ orientation: v }); },
        pageSize: function (v) { C.setSettings({ size: v }); }, pageSetup: C.pageSetup,
        columns: function (v) { C.columns(v === '2line' ? 2 : +v, v === '2line'); },
        pageColor: C.pageColor, watermark: C.watermark, pageBorder: C.pageBorder, docFont: function () { docFontDialog(); },
        toc: function (v) { C.insertToc(v); }, updateToc: C.updateToc, removeToc: C.removeToc,
        footnote: C.insertNote, navPane: function () { C.togglePane('sdNavPane'); }, wordCount: C.wordCount,
        spell: C.spell, proofLang: C.proofLang, readAloud: C.readAloud, dictate: C.dictate,
        prevComment: function () { C.stepComment(-1); }, nextComment: function () { C.stepComment(1); },
        deleteAllComments: C.deleteAllComments, commentPane: function () { C.togglePane('sdCommentPane'); },
        track: C.toggleTrack, markup: C.toggleMarkup,
        prevChange: function () { C.stepChange(-1); }, nextChange: function () { C.stepChange(1); },
        accept: function () { C.acceptReject(true); }, acceptAll: function () { C.acceptReject(true, 'all'); },
        reject: function () { C.acceptReject(false); }, rejectAll: function () { C.acceptReject(false, 'all'); },
        readOnly: function () { C.setReadOnly(!App.readOnly); },
        readMode: function () { C.readMode(); }, focusMode: function () { C.focusMode(); }, print: C.print,
        ruler: C.toggleRuler, zoomDialog: C.zoomDialog, zoom100: function () { App.setZoom(1); },
        fitPage: function () { App.fitPage(); }, fitWidth: function () { App.fitWidth(); },
        rowAbove: function () { C.rowInsert(true); }, rowBelow: function () { C.rowInsert(false); },
        colLeft: function () { C.colInsert(true); }, colRight: function () { C.colInsert(false); },
        rowDelete: C.rowDelete, colDelete: C.colDelete, tableDelete: C.tableDelete,
        merge: C.merge, split: C.split, tableStyle: C.tableStyle, headerRow: C.headerRow, tableBorders: C.tableBorders,
        cellShading: C.cellShading, valign_top: function () { C.cellVAlign('top'); }, valign_middle: function () { C.cellVAlign('middle'); },
        valign_bottom: function () { C.cellVAlign('bottom'); }, distribute: C.distributeCols, autofit: C.autofit,
        tableProps: C.tableProps, tableSelect: C.tableSelect,
        imgWrap: C.imgWrap, imgBorder: function () { C.imgToggle('border'); }, imgRound: function () { C.imgToggle('round'); },
        imgShadow: function () { C.imgToggle('shadow'); }, imgRotl: function () { C.imgTransform('rotl'); }, imgRotr: function () { C.imgTransform('rotr'); },
        imgFlipH: function () { C.imgTransform('fliph'); }, imgFlipV: function () { C.imgTransform('flipv'); },
        imgReplace: C.imgReplace, imgSize: C.imgSize, imgReset: C.imgReset, imgAlt: C.imgAlt, imgDelete: C.imgDelete
    };

    function onCommand(cmd, value) {
        var h = HANDLERS[cmd];
        if (!h) { console.warn('[Sinerli Dokum] perintah tidak dikenal', cmd); return; }
        try { h(value); } catch (err) { console.error(err); SO.toast(err.message || 'c_err_generic', { type: 'error' }); }
        App.updateStateSoon();
    }
    App.onCommand = onCommand;

    function docFontDialog() {
        SO.form({
            title: 'd_doc_font',
            intro: 'd_doc_font_intro',
            fields: [
                { name: 'font', label: 'd_font', type: 'select', value: App.settings.defaultFont, options: SO.FONTS.map(function (f) { return { value: f, text: f }; }) },
                { type: 'row', fields: [
                    { name: 'size', label: 'd_font_size', type: 'number', min: 6, max: 72, step: 0.5, value: App.settings.defaultSize },
                    { name: 'line', label: 'd_line_spacing', type: 'select', value: String(App.settings.lineHeight), options: ['1', '1.15', '1.5', '2'].map(function (v) { return { value: v, text: v }; }) }
                ] }
            ]
        }).then(function (v) {
            if (!v) return;
            C.setSettings({ defaultFont: v.font, defaultSize: v.size || 11, lineHeight: parseFloat(v.line) || 1.15 });
        });
    }

    // ========================================================== shortcuts
    function bindShortcuts() {
        var k = App.bindKey;
        k('Mod+Z', function () { App.undo(); });
        k('Mod+Y / Mod+Shift+Z', function () { App.redo(); });
        k('Mod+S', function () { App.session.saveCloud(); });
        k('Mod+P', function () { C.print(); });
        k('Mod+O', function () { App.backstage.open('open'); });
        k('Mod+F', function () { C.openFind(false); });
        k('Mod+H / Mod+Shift+H', function () { C.openFind(true); });
        // B/I/U lewat jalur yang sama dengan tombol ribbon (gaya CSS + satu langkah
        // undo), bukan perintah bawaan peramban yang menghasilkan <b>/<i> dan
        // tidak selalu terpicu (mis. beberapa peramban/IME di macOS).
        k('Mod+B', function () { C.simple('bold'); });
        k('Mod+I', function () { C.simple('italic'); });
        k('Mod+U', function () { C.simple('underline'); });
        k('Mod+K', function () { C.link(); });
        k('Mod+Enter', function () { C.pageBreak(); });
        k('Mod+L', function () { C.align('left'); });
        k('Mod+E', function () { C.align('center'); });
        k('Mod+R', function () { C.align('right'); });
        k('Mod+J', function () { C.align('justify'); });
        k('Mod+] / Mod+Shift+.', function () { C.growFont(1); });
        k('Mod+[ / Mod+Shift+,', function () { C.growFont(-1); });
        k('Mod+=', function () { C.simple('subscript'); });
        k('Mod+Shift+= / Mod+Shift++', function () { C.simple('superscript'); });
        k('Mod+Alt+1', function () { C.blockStyle('h1'); });
        k('Mod+Alt+2', function () { C.blockStyle('h2'); });
        k('Mod+Alt+3', function () { C.blockStyle('h3'); });
        k('Mod+Alt+4', function () { C.blockStyle('h4'); });
        k('Mod+Alt+0', function () { C.blockStyle('p'); });
        k('Mod+Shift+7', function () { C.numbering(); });
        k('Mod+Shift+8', function () { C.bullets(); });
        k('Mod+Shift+9', function () { C.checklist(); });
        k('Mod+Alt+M', function () { C.addComment(); });
        k('Mod+Alt+F', function () { C.insertNote(); });
        k('Mod+Shift+E', function () { C.toggleTrack(); });
        k('Mod+\\ / Mod+Space', function () { C.clearFormat(); });
        k('Mod+Shift+V', function () { App.pastePlainNext = true; return false; });
        k('Mod+F1', function () { App.ribbon.toggleCollapse(); });
        k('Escape', function () {
            if (App.painter) { C.painter(); return; }
            if (document.body.classList.contains('sd-focus')) { C.focusMode(false); return; }
            if (document.body.classList.contains('sd-read')) { C.readMode(false); return; }
            if (App.selectedImg) { App.deselectImage(); return; }
            return false;
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'F7' && !e.altKey) { e.preventDefault(); C.spell(); }
        });
    }

    var SHORTCUT_HELP = [
        ['Mod+S', 'd_sc_save'], ['Mod+Z', 'c_undo'], ['Mod+Y / Mod+Shift+Z', 'c_redo'], ['Mod+B', 'd_bold'], ['Mod+I', 'd_italic'], ['Mod+U', 'd_underline'],
        ['Mod+] / Mod+[', 'd_sc_font_size'], ['Mod+L / Mod+E / Mod+R / Mod+J', 'd_sc_align'], ['Mod+Alt+1', 'd_style_h1'], ['Mod+Alt+0', 'd_style_normal'],
        ['Mod+Shift+8', 'd_bullets'], ['Mod+Shift+7', 'd_numbering'], ['Mod+K', 'd_link'], ['Mod+Enter', 'd_page_break'],
        ['Mod+F', 'd_find'], ['Mod+Shift+H', 'd_replace'], ['Mod+Alt+M', 'd_new_comment'], ['Mod+Shift+E', 'd_track_changes'],
        ['Mod+Shift+V', 'd_paste_plain'], ['Mod+P', 'd_print'], ['Mod+\\', 'd_clear_format'], ['F7', 'd_spellcheck'], ['Mod+F1', 'c_ribbon_toggle']
    ];

    // ================================================================ boot
    function createFrom(id) {
        var tpl = SDIO.templateContent(id);
        App.session.newKey();
        var settings = App.defaultSettings();
        if (tpl.settings) {
            Object.keys(tpl.settings).forEach(function (k) {
                if (k === 'margins' || k === 'hf') settings[k] = Object.assign(settings[k], tpl.settings[k]);
                else settings[k] = tpl.settings[k];
            });
        }
        App.loadDocument({ html: tpl.html, settings: settings }, id === 'blank' ? SO.t('d_new_doc_name') : tpl.name);
        if (id !== 'blank') App.session.markDirty();
        editor.focus();
    }

    function boot() {
        SO.applyI18n(document);
        App.shell = SO.createShell({
            logo: window.SN ? 'assets/icon.png' : SO.root + 'assets/img/tools/sinedoc.webp',
            app: 'sinedoc', name: 'Sinerli Dokum', icon: 'fa-file-lines',
            onSave: function () { App.session.saveCloud(); },
            onUndo: function () { App.undo(); },
            onRedo: function () { App.redo(); },
            onRename: function (name) { App.shell.setName(name); App.session.markDirty(); App.scheduleLayout(); },
            onBack: function () { return App.session.flush(); }
        });
        App.ribbon = new SO.Ribbon(document.getElementById('sdRibbon'), {
            tabs: TABS,
            onCommand: onCommand,
            onFile: function () { App.backstage.open('new'); }
        });
        App.session = new SO.DocSession({
            app: 'sinedoc', type: 'sinedoc',
            getContent: App.serialize,
            getName: function () { return App.getTitle(); },
            setName: function (n) { App.shell.setName(n); },
            getThumbnail: function () { return SDExport.thumbnail(App); },
            onStatus: function (s, e) { App.shell.setStatus(s, e); },
            // Pengamanan proyek: memasang isi versi/cloud terbaru dan cadangan berkas asli.
            applyContent: function (c, n) { App.loadDocument(c, n); },
            // Perubahan langsung dari kolaborator: pertahankan posisi gulir pembaca.
            applyLive: function (c, n) {
                var sc = document.getElementById('sdScroller'), top = sc ? sc.scrollTop : 0;
                App.loadDocument(c, n);
                if (sc) sc.scrollTop = top;
            },
            backup: function () { C.exportAs('sinedoc'); }
        });
        App.backstage = new SO.Backstage(App.session, App.shell, {
            app: 'sinedoc', type: 'sinedoc', appName: 'Sinerli Dokum', icon: 'fa-file-lines',
            templates: SDIO.TEMPLATES,
            createFrom: createFrom,
            openAccept: '.docx,.txt,.md,.markdown,.html,.htm,.sinedoc',
            openAcceptLabel: 'Word (.docx) · HTML · Markdown · TXT · Sinerli Dokum',
            importFile: C.importFile,
            exportFormats: [
                { id: 'docx', label: 'd_fmt_docx', desc: 'd_fmt_docx_desc', icon: 'fa-file-word' },
                { id: 'pdf', label: 'd_fmt_pdf', desc: 'd_fmt_pdf_desc', icon: 'fa-file-pdf' },
                { id: 'html', label: 'd_fmt_html', desc: 'd_fmt_html_desc', icon: 'fa-file-code' },
                { id: 'md', label: 'd_fmt_md', desc: 'd_fmt_md_desc', icon: 'fa-brands fa-markdown' },
                { id: 'txt', label: 'd_fmt_txt', desc: 'd_fmt_txt_desc', icon: 'fa-file-lines' },
                { id: 'sinedoc', label: 'd_fmt_sinedoc', desc: 'd_fmt_sinedoc_desc', icon: 'fa-box-archive' }
            ],
            exportAs: C.exportAs,
            print: C.print,
            loadDocument: function (c, n) { App.loadDocument(c, n); },
            restoreVersion: function (content, name) {
                App.loadDocument(content, name);
                App.session.markDirty();
                SO.toast('c_version_restored', { type: 'success' });
            },
            info: function () {
                var s = App.settings;
                return [
                    ['d_info_pages', SO.fmtNum(App.pageCount)],
                    ['d_info_words', SO.fmtNum(App.countWords(App.plainText()))],
                    ['d_info_paper', s.size.toUpperCase() + ' · ' + SO.t(s.orientation === 'landscape' ? 'd_landscape' : 'd_portrait')],
                    ['d_info_comments', SO.fmtNum(App.comments.length)]
                ];
            },
            renderOptions: function (box) {
                var mk = function (label, checked, onChange) {
                    var l = SO.el('label', { class: 'so-field is-inline' });
                    var cb = SO.el('input', { type: 'checkbox' });
                    cb.checked = checked;
                    cb.addEventListener('change', function () { onChange(cb.checked); });
                    l.appendChild(cb);
                    l.appendChild(SO.el('span', { text: SO.t(label) }));
                    box.appendChild(l);
                };
                mk('d_spellcheck', App.settings.spellcheck !== false, function () { C.spell(); });
                mk('d_show_marks', !!App.settings.showMarks, function () { C.toggleMarks(); });
                mk('d_ruler', !document.getElementById('sdRulerWrap').classList.contains('is-hidden'), function () { C.toggleRuler(); });
                var b = SO.el('button', { type: 'button', class: 'so-btn', html: '<i class="fas fa-font"></i>' + SO.esc(SO.t('d_doc_font')) });
                b.addEventListener('click', function () { App.backstage.close(); docFontDialog(); });
                box.appendChild(b);
            },
            shortcuts: SHORTCUT_HELP,
            onBackstageClose: function () { editor.focus({ preventScroll: true }); App.restoreRange(); }
        });

        App.initEditor();
        bindShortcuts();
        try { if (localStorage.getItem('sd_ruler') === '0') document.getElementById('sdRulerWrap').classList.add('is-hidden'); } catch (e) {}
        App.zoom = App.initialZoom || 1;
        document.getElementById('sdZoomRange').value = Math.round(App.zoom * 100);
        document.getElementById('sdZoomVal').textContent = Math.round(App.zoom * 100) + '%';

        SO.onLang(function () {
            App.ribbon.each('blockStyle', function (e) { if (e.render) e.render(); });
            App.ribbon.setValue('blockStyle', C.currentBlockStyle());
        });

        var freshOpen = !SO.ctx.projectId && !SO.ctx.draft;
        App.session.boot().then(function (res) {
            if (res) App.loadDocument(res.content, res.name);
            else App.loadDocument({ html: '<p><br></p>' }, SO.t('d_new_doc_name'));
            if (!App.session.protected) App.session.loaded();
            var g = App.geometry();
            if (App.scroller.clientWidth > 200 && App.scroller.clientWidth < g.pageW * App.zoom + 40) App.fitWidth(false);
            else App.setZoom(App.zoom, false, false);
            App.shell.hideLoading();
            C.updateRibbon();
            if (res && App.backstage.openFromUrl()) { /* bagian menu Berkas diminta Dashboard */ }
            else if (freshOpen && SO.ctx.params.get('action') !== 'blank') App.backstage.open('new');
            else editor.focus({ preventScroll: true });
        }).catch(function (err) {
            console.error(err);
            App.session.loadFailed(err);
            App.loadDocument({ html: '<p><br></p>' }, SO.t('d_new_doc_name'));
            App.shell.hideLoading();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(window);
