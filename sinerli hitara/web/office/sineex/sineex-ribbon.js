/**
 * Sinerli Hitara — definisi ribbon, pintasan keyboard, menu File, dan boot aplikasi.
 */
(function (global) {
    'use strict';

    var App = global.SineEX, F = global.SXF, M = global.SXM;
    var C = App.cmd;

    App.getTitle = function () { return (App.shell && App.shell.getName()) || SO.t('c_untitled'); };

    function fontOptions() { return SO.FONTS.map(function (f) { return { value: f, text: f, style: 'font-family:' + SO.fontStack(f) }; }); }
    function sizeOptions() { return SO.FONT_SIZES.map(function (s) { return { value: s, text: String(s) }; }); }
    function nfOptions() { return C.NUMBER_FORMATS.map(function (f) { return { value: f.id, label: f.label }; }).concat([{ value: 'more', label: 'x_nf_more' }]); }

    function fnMenu(cat) {
        return function () {
            return F.FN_INFO.filter(function (x) { return x[1] === cat; }).map(function (x) {
                return { text: x[0], onClick: function () { insertFn(x[0]); } };
            }).concat([{ sep: true }, { label: 'x_insert_function', icon: 'fa-italic', onClick: function () { C.insertFunction(cat); } }]);
        };
    }
    function insertFn(name) {
        if (App.editing) {
            var ed = App.el.editor;
            var p = ed.selectionStart;
            ed.value = ed.value.slice(0, p) + name + '(' + ed.value.slice(ed.selectionEnd);
            ed.focus();
            ed.setSelectionRange(p + name.length + 1, p + name.length + 1);
            App.el.formula.value = ed.value;
            App.updateEditAids();
        } else App.startEdit('enter', '=' + name + '(');
    }

    var TABS = [
        {
            id: 'home', label: 'x_tab_home', groups: [
                { label: 'x_grp_clipboard', items: [
                    { t: 'split', lg: true, cmd: 'paste', icon: 'fa-paste', label: 'x_paste', key: 'Mod+V', menu: [
                        { label: 'x_paste', icon: 'fa-paste', cmd: 'paste' }, { label: 'x_paste_values', icon: 'fa-hashtag', cmd: 'pasteValues' },
                        { label: 'x_paste_formulas', icon: 'fa-square-root-variable', cmd: 'pasteFormulas' }, { label: 'x_paste_formats', icon: 'fa-paintbrush', cmd: 'pasteFormats' }
                    ] },
                    { t: 'rows', rows: [
                        [{ cmd: 'cut', icon: 'fa-scissors', label: 'x_cut', key: 'Mod+X', showLabel: true }],
                        [{ cmd: 'copy', icon: 'fa-copy', label: 'x_copy', key: 'Mod+C', showLabel: true }],
                        [{ cmd: 'painter', icon: 'fa-paintbrush', label: 'x_painter', desc: 'x_painter_desc', showLabel: true }]
                    ] }
                ] },
                { label: 'x_grp_font', items: [
                    { t: 'rows', rows: [
                        [
                            { t: 'select', cmd: 'fontName', label: 'x_font', width: 130, editable: true, options: fontOptions, menuWidth: 220 },
                            { t: 'select', cmd: 'fontSize', label: 'x_font_size', width: 56, editable: true, options: sizeOptions },
                            { cmd: 'grow', icon: 'fa-arrow-up-long', label: 'x_grow_font' },
                            { cmd: 'shrink', icon: 'fa-arrow-down-long', label: 'x_shrink_font' }
                        ],
                        [
                            { cmd: 'bold', icon: 'fa-bold', label: 'x_bold', key: 'Mod+B' },
                            { cmd: 'italic', icon: 'fa-italic', label: 'x_italic', key: 'Mod+I' },
                            { cmd: 'underline', icon: 'fa-underline', label: 'x_underline', key: 'Mod+U' },
                            { cmd: 'strike', icon: 'fa-strikethrough', label: 'x_strike', key: 'Mod+5' },
                            { t: 'drop', icon: 'fa-border-all', label: 'x_borders', menu: function () { return C.borderMenu(); } },
                            { t: 'color', cmd: 'fillColor', icon: 'fa-fill-drip', label: 'x_fill_color', value: '#FFFF00', allowNone: true, noneLabel: 'x_no_fill' },
                            { t: 'color', cmd: 'fontColor', icon: 'fa-font', label: 'x_font_color', value: '#C00000', autoLabel: 'x_automatic' }
                        ]
                    ] }
                ] },
                { label: 'x_grp_alignment', items: [
                    { t: 'rows', rows: [
                        [
                            { cmd: 'valign_top', icon: 'fa-arrow-up-short-wide', label: 'x_valign_top' },
                            { cmd: 'valign_middle', icon: 'fa-grip-lines', label: 'x_valign_middle' },
                            { cmd: 'valign_bottom', icon: 'fa-arrow-down-short-wide', label: 'x_valign_bottom' },
                            { t: 'sep' },
                            { cmd: 'wrap', icon: 'fa-arrow-turn-down', label: 'x_wrap_text', showLabel: true }
                        ],
                        [
                            { cmd: 'align_left', icon: 'fa-align-left', label: 'x_align_left' },
                            { cmd: 'align_center', icon: 'fa-align-center', label: 'x_align_center' },
                            { cmd: 'align_right', icon: 'fa-align-right', label: 'x_align_right' },
                            { t: 'sep' },
                            { cmd: 'outdent', icon: 'fa-outdent', label: 'x_decrease_indent' },
                            { cmd: 'indent', icon: 'fa-indent', label: 'x_increase_indent' },
                            { t: 'split', cmd: 'mergeCenter', icon: 'fa-table-cells-large', label: 'x_merge_center', showLabel: false, menu: [
                                { label: 'x_merge_center', cmd: 'merge', value: 'center' }, { label: 'x_merge_across', cmd: 'merge', value: 'across' },
                                { label: 'x_merge_cells', cmd: 'merge', value: 'merge' }, { label: 'x_unmerge', cmd: 'merge', value: 'unmerge' }
                            ] }
                        ]
                    ] }
                ] },
                { label: 'x_grp_number', items: [
                    { t: 'rows', rows: [
                        [{ t: 'select', cmd: 'numberFormat', label: 'x_number_format', width: 132, options: nfOptions, menuWidth: 200 }],
                        [
                            { cmd: 'currency', icon: 'fa-money-bill-wave', label: 'x_nf_currency' },
                            { cmd: 'percent', icon: 'fa-percent', label: 'x_nf_percent', key: 'Mod+Shift+%' },
                            { cmd: 'thousands', icon: '<i class="so-glyph is-small">000</i>', label: 'x_thousands' },
                            { cmd: 'decInc', icon: 'fa-plus', label: 'x_increase_decimal', html: '.0<sup>+</sup>' },
                            { cmd: 'decDec', icon: 'fa-minus', label: 'x_decrease_decimal' }
                        ]
                    ] }
                ] },
                { label: 'x_grp_styles', items: [
                    { t: 'drop', lg: true, icon: 'fa-table-cells', label: 'x_cond_format', menu: function () { return C.cfMenu(); } },
                    { t: 'drop', lg: true, icon: 'fa-table-list', label: 'x_format_as_table', menu: function () {
                        return C.TABLE_STYLES.map(function (t) {
                            return { label: t.label, labelHtml: '<span style="display:inline-block;width:16px;height:10px;background:' + t.head + ';margin-right:2px;border-radius:2px"></span><span style="display:inline-block;width:16px;height:10px;background:' + t.band + ';margin-right:8px;border-radius:2px;border:1px solid #ddd"></span>' + SO.esc(SO.t(t.label)), cmd: 'formatTable', value: t.id };
                        });
                    } },
                    { t: 'drop', lg: true, icon: 'fa-swatchbook', label: 'x_cell_styles', menu: function () {
                        return Object.keys(C.CELL_STYLES).map(function (k) {
                            var cs = C.CELL_STYLES[k], s = cs.s || {};
                            return { label: cs.label, labelHtml: '<span style="display:inline-block;min-width:110px;padding:1px 6px;background:' + (s.bg || '#fff') + ';color:' + (s.fc || '#000') + ';font-weight:' + (s.b ? 700 : 400) + ';border:1px solid #ddd;border-radius:2px">' + SO.esc(SO.t(cs.label)) + '</span>', cmd: 'cellStyle', value: k };
                        });
                    } }
                ] },
                { label: 'x_grp_cells', items: [
                    { t: 'drop', lg: true, icon: 'fa-square-plus', label: 'x_insert', menu: [
                        { label: 'x_insert_cells', icon: 'fa-table-cells', cmd: 'insertCells' }, { label: 'x_insert_rows', icon: 'fa-grip-lines', cmd: 'insertRows' },
                        { label: 'x_insert_cols', icon: 'fa-grip-lines-vertical', cmd: 'insertCols' }, { label: 'x_new_sheet', icon: 'fa-file-circle-plus', cmd: 'addSheet' }
                    ] },
                    { t: 'drop', lg: true, icon: 'fa-square-minus', label: 'c_delete', menu: [
                        { label: 'x_delete_cells', icon: 'fa-table-cells', cmd: 'deleteCells' }, { label: 'x_delete_rows', icon: 'fa-grip-lines', cmd: 'deleteRows' },
                        { label: 'x_delete_cols', icon: 'fa-grip-lines-vertical', cmd: 'deleteCols' }, { label: 'x_delete_sheet', icon: 'fa-trash', cmd: 'deleteSheet' }
                    ] },
                    { t: 'drop', lg: true, icon: 'fa-table-columns', label: 'x_format', menu: [
                        { head: 'x_cell_size' },
                        { label: 'x_row_height', icon: 'fa-arrows-up-down', cmd: 'rowHeight' }, { label: 'x_autofit_row', icon: 'fa-text-height', cmd: 'autofitRow' },
                        { label: 'x_col_width', icon: 'fa-arrows-left-right', cmd: 'colWidth' }, { label: 'x_autofit_col', icon: 'fa-text-width', cmd: 'autofitCol' },
                        { label: 'x_default_col_width', cmd: 'defaultWidth' },
                        { head: 'x_visibility' },
                        { label: 'x_hide_unhide', icon: 'fa-eye-slash', submenu: [
                            { label: 'x_hide_rows', cmd: 'hideRows' }, { label: 'x_hide_cols', cmd: 'hideCols' },
                            { label: 'x_unhide_rows', cmd: 'unhideRows' }, { label: 'x_unhide_cols', cmd: 'unhideCols' }
                        ] },
                        { head: 'x_organize_sheets' },
                        { label: 'x_rename_sheet', icon: 'fa-pen', cmd: 'renameSheet' }, { label: 'x_tab_color', icon: 'fa-palette', cmd: 'tabColor' },
                        { label: 'x_protect_sheet', icon: 'fa-lock', cmd: 'protect' },
                        { sep: true }, { label: 'x_format_cells', icon: 'fa-sliders', key: 'Mod+1', cmd: 'formatCells' }
                    ] }
                ] },
                { label: 'x_grp_editing', items: [
                    { t: 'rows', rows: [
                        [{ t: 'split', cmd: 'autoSum', icon: '<i class="so-glyph">Σ</i>', label: 'x_autosum', showLabel: true, key: 'Alt+=', menu: [
                            { label: 'x_agg_sum', cmd: 'autoSumFn', value: 'SUM' }, { label: 'x_agg_avg', cmd: 'autoSumFn', value: 'AVERAGE' }, { label: 'x_agg_count', cmd: 'autoSumFn', value: 'COUNT' },
                            { label: 'x_agg_max', cmd: 'autoSumFn', value: 'MAX' }, { label: 'x_agg_min', cmd: 'autoSumFn', value: 'MIN' }, { sep: true }, { label: 'x_more_functions', cmd: 'insertFunction' }
                        ] }],
                        [{ t: 'drop', icon: 'fa-arrow-down', label: 'x_fill', showLabel: true, menu: [
                            { label: 'x_fill_down', icon: 'fa-arrow-down', key: 'Mod+D', cmd: 'fillDown' }, { label: 'x_fill_right', icon: 'fa-arrow-right', key: 'Mod+R', cmd: 'fillRight' }
                        ] }],
                        [{ t: 'drop', icon: 'fa-eraser', label: 'x_clear', showLabel: true, menu: [
                            { label: 'x_clear_all', cmd: 'clear', value: 'all' }, { label: 'x_clear_formats', cmd: 'clear', value: 'formats' }, { label: 'x_clear_contents', cmd: 'clear', value: 'contents' },
                            { label: 'x_clear_notes', cmd: 'clear', value: 'notes' }, { label: 'x_clear_links', cmd: 'clear', value: 'links' }
                        ] }]
                    ] },
                    { t: 'drop', lg: true, icon: 'fa-arrow-down-wide-short', label: 'x_sort_filter', menu: [
                        { label: 'x_sort_asc', icon: 'fa-arrow-down-a-z', cmd: 'sortAsc' }, { label: 'x_sort_desc', icon: 'fa-arrow-down-z-a', cmd: 'sortDesc' }, { label: 'x_custom_sort', icon: 'fa-sliders', cmd: 'sortDialog' },
                        { sep: true }, { label: 'x_filter', icon: 'fa-filter', key: 'Mod+Shift+L', cmd: 'filter' }, { label: 'x_clear_filters', icon: 'fa-filter-circle-xmark', cmd: 'clearFilters' }, { label: 'x_reapply', icon: 'fa-rotate', cmd: 'reapplyFilter' }
                    ] },
                    { t: 'drop', lg: true, icon: 'fa-magnifying-glass', label: 'x_find_select', menu: [
                        { label: 'x_find', icon: 'fa-magnifying-glass', key: 'Mod+F', cmd: 'find' }, { label: 'x_replace', icon: 'fa-right-left', key: 'Mod+H', cmd: 'replace' },
                        { label: 'x_goto', icon: 'fa-location-arrow', key: 'Mod+G', cmd: 'goto' }
                    ] }
                ] }
            ]
        },
        {
            id: 'insert', label: 'x_tab_insert', groups: [
                { label: 'x_grp_tables', items: [
                    { t: 'drop', lg: true, icon: 'fa-table', label: 'x_table', menu: function () { return C.TABLE_STYLES.map(function (t) { return { label: t.label, cmd: 'formatTable', value: t.id }; }); } },
                    { lg: true, cmd: 'pivot', icon: 'fa-table-cells-large', label: 'x_pivot' }
                ] },
                { label: 'x_grp_charts', items: C_TYPES_ITEMS() },
                { label: 'x_grp_illustrations', items: [{ lg: true, cmd: 'image', icon: 'fa-image', label: 'x_image' }] },
                { label: 'x_grp_links', items: [{ lg: true, cmd: 'link', icon: 'fa-link', label: 'x_link', key: 'Mod+K' }] },
                { label: 'x_grp_notes', items: [{ lg: true, cmd: 'note', icon: 'fa-note-sticky', label: 'x_note', key: 'Shift+F2' }] },
                { label: 'x_grp_symbols', items: [{ lg: true, cmd: 'insertFunction', icon: 'fa-square-root-variable', label: 'x_function' }, { lg: true, cmd: 'symbol', icon: 'fa-infinity', label: 'x_symbol' }] }
            ]
        },
        {
            id: 'page', label: 'x_tab_page', groups: [
                { label: 'x_grp_page_setup', items: [
                    { t: 'drop', lg: true, icon: 'fa-border-none', label: 'x_margins', menu: function () { return ['normal', 'narrow', 'wide'].map(function (m) { return { label: 'x_margin_' + m, cmd: 'pageSet', value: 'margins:' + m, checked: App.sheet().pageSetup.margins === m }; }); } },
                    { t: 'drop', lg: true, icon: 'fa-rotate', label: 'x_orientation', menu: function () { var o = App.sheet().pageSetup.orientation; return [{ label: 'x_portrait', cmd: 'pageSet', value: 'orientation:portrait', checked: o !== 'landscape' }, { label: 'x_landscape', cmd: 'pageSet', value: 'orientation:landscape', checked: o === 'landscape' }]; } },
                    { t: 'drop', lg: true, icon: 'fa-file-lines', label: 'x_size', menu: function () { var cur = App.sheet().pageSetup.size; return ['a4', 'letter', 'legal', 'f4', 'a3', 'a5'].map(function (k) { return { text: k.toUpperCase().replace('LETTER', 'Letter').replace('LEGAL', 'Legal'), cmd: 'pageSet', value: 'size:' + k, checked: cur === k }; }); } },
                    { t: 'drop', lg: true, icon: 'fa-crop-simple', label: 'x_print_area', menu: [{ label: 'x_set_print_area', cmd: 'printArea', value: 'set' }, { label: 'x_clear_print_area', cmd: 'printArea', value: 'clear' }] }
                ] },
                { label: 'x_grp_scale', items: [
                    { t: 'rows', rows: [
                        [{ t: 'select', cmd: 'pageFit', label: 'x_fit', width: 150, options: [{ value: 'width', label: 'x_fit_width' }, { value: 'page', label: 'x_fit_page' }, { value: 'none', label: 'x_fit_none' }] }],
                        [{ t: 'check', cmd: 'printGrid', label: 'x_print_gridlines' }],
                        [{ t: 'check', cmd: 'printHeadings', label: 'x_print_headings' }]
                    ] }
                ] },
                { label: 'x_grp_output', items: [
                    { lg: true, cmd: 'print', icon: 'fa-print', label: 'x_print', key: 'Mod+P' },
                    { lg: true, cmd: 'exportPdf', icon: 'fa-file-pdf', label: 'x_export_pdf' }
                ] }
            ]
        },
        {
            id: 'formulas', label: 'x_tab_formulas', groups: [
                { label: 'x_grp_function_library', items: [
                    { lg: true, cmd: 'insertFunction', icon: 'fa-italic', label: 'x_insert_function', key: 'Shift+F3' },
                    { t: 'split', lg: true, cmd: 'autoSum', icon: '<i class="so-glyph">Σ</i>', label: 'x_autosum', menu: [
                        { label: 'x_agg_sum', cmd: 'autoSumFn', value: 'SUM' }, { label: 'x_agg_avg', cmd: 'autoSumFn', value: 'AVERAGE' }, { label: 'x_agg_count', cmd: 'autoSumFn', value: 'COUNT' },
                        { label: 'x_agg_max', cmd: 'autoSumFn', value: 'MAX' }, { label: 'x_agg_min', cmd: 'autoSumFn', value: 'MIN' }
                    ] },
                    { t: 'drop', lg: true, icon: 'fa-sack-dollar', label: 'x_fncat_finance', menu: fnMenu('finance') },
                    { t: 'drop', lg: true, icon: 'fa-code-branch', label: 'x_fncat_logic', menu: fnMenu('logic') },
                    { t: 'drop', lg: true, icon: 'fa-font', label: 'x_fncat_text', menu: fnMenu('text') },
                    { t: 'drop', lg: true, icon: 'fa-calendar-days', label: 'x_fncat_date', menu: fnMenu('date') },
                    { t: 'drop', lg: true, icon: 'fa-magnifying-glass-arrow-right', label: 'x_fncat_lookup', menu: fnMenu('lookup') },
                    { t: 'drop', lg: true, icon: 'fa-calculator', label: 'x_fncat_math', menu: fnMenu('math') },
                    { t: 'drop', lg: true, icon: 'fa-chart-simple', label: 'x_fncat_stat', menu: fnMenu('stat') }
                ] },
                { label: 'x_grp_names', items: [
                    { lg: true, cmd: 'nameManager', icon: 'fa-tags', label: 'x_name_manager' },
                    { t: 'rows', rows: [[{ cmd: 'defineName', icon: 'fa-tag', label: 'x_define_name', showLabel: true }], [{ t: 'drop', icon: 'fa-list', label: 'x_use_in_formula', showLabel: true, menu: function () {
                        var names = Object.keys(App.wb.names).sort();
                        return names.length ? names.map(function (n) { return { text: n, onClick: function () { insertName(n); } }; }) : [{ label: 'x_no_names', disabled: true }];
                    } }]] }
                ] },
                { label: 'x_grp_calculation', items: [
                    { lg: true, cmd: 'showFormulas', icon: 'fa-square-root-variable', label: 'x_show_formulas', key: 'Mod+`' },
                    { lg: true, cmd: 'calcNow', icon: 'fa-calculator', label: 'x_calc_now', key: 'F9' }
                ] }
            ]
        },
        {
            id: 'data', label: 'x_tab_data', groups: [
                { label: 'x_grp_get_data', items: [{ lg: true, cmd: 'importData', icon: 'fa-file-import', label: 'x_import_file' }] },
                { label: 'x_grp_sort_filter', items: [
                    { t: 'rows', rows: [[{ cmd: 'sortAsc', icon: 'fa-arrow-down-a-z', label: 'x_sort_asc' }], [{ cmd: 'sortDesc', icon: 'fa-arrow-down-z-a', label: 'x_sort_desc' }]] },
                    { lg: true, cmd: 'sortDialog', icon: 'fa-arrow-down-wide-short', label: 'x_sort' },
                    { lg: true, cmd: 'filter', icon: 'fa-filter', label: 'x_filter' },
                    { t: 'rows', rows: [[{ cmd: 'clearFilters', icon: 'fa-filter-circle-xmark', label: 'x_clear', showLabel: true }], [{ cmd: 'reapplyFilter', icon: 'fa-rotate', label: 'x_reapply', showLabel: true }]] }
                ] },
                { label: 'x_grp_data_tools', items: [
                    { lg: true, cmd: 'textToColumns', icon: 'fa-table-columns', label: 'x_text_to_columns' },
                    { lg: true, cmd: 'removeDuplicates', icon: 'fa-clone', label: 'x_remove_duplicates' },
                    { lg: true, cmd: 'validation', icon: 'fa-list-check', label: 'x_data_validation' }
                ] },
                { label: 'x_grp_forecast', items: [
                    { lg: true, cmd: 'goalSeek', icon: 'fa-bullseye', label: 'x_goal_seek' },
                    { lg: true, cmd: 'pivot', icon: 'fa-table-cells-large', label: 'x_pivot' }
                ] }
            ]
        },
        {
            id: 'review', label: 'x_tab_review', groups: [
                { label: 'x_grp_notes', items: [
                    { lg: true, cmd: 'note', icon: 'fa-note-sticky', label: 'x_new_note' },
                    { lg: true, cmd: 'deleteNote', icon: 'fa-note-sticky', label: 'x_delete_note' }
                ] },
                { label: 'x_grp_protect', items: [{ lg: true, cmd: 'protect', icon: 'fa-lock', label: 'x_protect_sheet' }] },
                { label: 'x_grp_find', items: [{ lg: true, cmd: 'find', icon: 'fa-magnifying-glass', label: 'x_find_replace' }] }
            ]
        },
        {
            id: 'view', label: 'x_tab_view', groups: [
                { label: 'x_grp_window', items: [
                    { t: 'drop', lg: true, icon: 'fa-snowflake', label: 'x_freeze_panes', menu: [
                        { label: 'x_freeze_at_selection', cmd: 'freeze', value: 'cell' }, { label: 'x_freeze_top_row', cmd: 'freeze', value: 'row' },
                        { label: 'x_freeze_first_col', cmd: 'freeze', value: 'col' }, { label: 'x_unfreeze', cmd: 'freeze', value: 'none' }
                    ] }
                ] },
                { label: 'x_grp_show', items: [
                    { t: 'rows', rows: [
                        [{ t: 'check', cmd: 'showGrid', label: 'x_gridlines' }],
                        [{ t: 'check', cmd: 'showHeaders', label: 'x_headings' }],
                        [{ t: 'check', cmd: 'showFormulaBar', label: 'x_formula_bar' }]
                    ] }
                ] },
                { label: 'c_zoom', items: [
                    { lg: true, cmd: 'zoomDialog', icon: 'fa-magnifying-glass-plus', label: 'c_zoom' },
                    { lg: true, cmd: 'zoom100', icon: 'fa-1', label: 'x_zoom_100' },
                    { lg: true, cmd: 'zoomSelection', icon: 'fa-expand', label: 'x_zoom_selection' }
                ] }
            ]
        },
        SO.aiRibbonTab('sineex'),
        {
            id: 'chart', label: 'x_tab_chart', contextual: true, groups: [
                { label: 'x_grp_chart_type', items: [
                    { t: 'drop', lg: true, icon: 'fa-chart-column', label: 'x_change_chart_type', menu: function () { return C.CHART_TYPES.map(function (t) { return { label: t[2], icon: t[1], cmd: 'chartCmd', value: 'type:' + t[0] }; }); } },
                    { lg: true, cmd: 'chartCmd', value: 'switch', icon: 'fa-right-left', label: 'x_switch_row_col' },
                    { lg: true, cmd: 'chartCmd', value: 'stacked', icon: 'fa-layer-group', label: 'x_stacked' }
                ] },
                { label: 'x_grp_chart_layout', items: [
                    { lg: true, cmd: 'chartTitle', icon: 'fa-heading', label: 'x_chart_title' },
                    { t: 'drop', lg: true, icon: 'fa-list-ul', label: 'x_legend', menu: [['top', 'x_top'], ['bottom', 'x_bottom'], ['right', 'x_right'], ['left', 'x_left'], ['none', 'x_none']].map(function (x) { return { label: x[1], cmd: 'chartCmd', value: 'legend:' + x[0] }; }) },
                    { lg: true, cmd: 'chartCmd', value: 'edit', icon: 'fa-sliders', label: 'x_edit_chart' }
                ] },
                { label: 'x_grp_chart_misc', items: [
                    { lg: true, cmd: 'chartCmd', value: 'png', icon: 'fa-download', label: 'x_download_png' },
                    { lg: true, cmd: 'chartCmd', value: 'delete', icon: 'fa-trash', label: 'c_delete' }
                ] }
            ]
        }
    ];

    function C_TYPES_ITEMS() {
        var t = [['column', 'fa-chart-column', 'x_ch_column'], ['bar', 'fa-chart-bar', 'x_ch_bar'], ['line', 'fa-chart-line', 'x_ch_line'], ['pie', 'fa-chart-pie', 'x_ch_pie'], ['area', 'fa-chart-area', 'x_ch_area']];
        var items = t.map(function (x) { return { lg: true, cmd: 'chart', value: x[0], icon: x[1], label: x[2] }; });
        items.push({ t: 'drop', lg: true, icon: 'fa-chart-simple', label: 'x_more_charts', menu: [
            { label: 'x_ch_doughnut', icon: 'fa-circle-notch', cmd: 'chart', value: 'doughnut' }, { label: 'x_ch_scatter', icon: 'fa-braille', cmd: 'chart', value: 'scatter' },
            { label: 'x_ch_radar', icon: 'fa-spider', cmd: 'chart', value: 'radar' }, { sep: true }, { label: 'x_insert_chart', icon: 'fa-sliders', cmd: 'chartDialog' }
        ] });
        return items;
    }

    function insertName(n) {
        if (App.editing) {
            var ed = App.el.editor;
            var p = ed.selectionStart;
            ed.value = ed.value.slice(0, p) + n + ed.value.slice(ed.selectionEnd);
            ed.focus();
            ed.setSelectionRange(p + n.length, p + n.length);
            App.el.formula.value = ed.value;
            App.updateEditAids();
        } else App.startEdit('enter', '=' + n);
    }

    // =========================================================== pewarna
    var painter = null;
    function startPainter() {
        var sh = App.sheet();
        var rg = App.selRange();
        painter = { style: SO.deepClone(App.wb.styleAt(sh, rg.r1, rg.c1)) };
        App.el.scroll.classList.add('is-move');
        SO.toast('x_painter_hint');
        App.ribbon.setActive('painter', true);
    }
    App.el.scroll.addEventListener('pointerup', function () {
        if (!painter) return;
        var p = painter;
        painter = null;
        App.el.scroll.classList.remove('is-move');
        App.ribbon.setActive('painter', false);
        setTimeout(function () {
            C.style(function (s) {
                var nf = s.nf;
                Object.keys(s).forEach(function (k) { delete s[k]; });
                Object.assign(s, SO.deepClone(p.style));
                if (!p.style.nf && nf) delete s.nf;
                return s;
            }, 'painter');
        }, 0);
    });

    function symbolDialog() {
        var chars = '©®™°±×÷≠≈≤≥∞√∑∏∫∆∈∩∪€£¥₹Rp$¢←↑→↓↔⇒⇔▲▼►◄■□●○★☆✓✔✕✖αβγδεθλμπσφωΩ½⅓¼¾²³‰§¶•…';
        SO.dialog({
            title: 'x_symbol', width: 460,
            body: function (body) {
                var grid = SO.el('div', { class: 'sd-symbols', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(34px, 1fr))', gap: '4px' } });
                Array.from(chars.replace('Rp', '')).forEach(function (ch) {
                    var b = SO.el('button', { type: 'button', class: 'so-btn is-sm', text: ch, style: { fontSize: '16px', minWidth: '0', height: '34px' } });
                    b.addEventListener('click', function () {
                        if (App.editing) {
                            var ed = App.el.editor, p = ed.selectionStart;
                            ed.value = ed.value.slice(0, p) + ch + ed.value.slice(ed.selectionEnd);
                            ed.setSelectionRange(p + 1, p + 1);
                            App.el.formula.value = ed.value;
                        } else {
                            var a = App.sel.active;
                            App.change('edit', function () { App.wb.setInput(App.sheet(), a.r, a.c, App.wb.editText(App.sheet(), a.r, a.c) + ch); });
                        }
                    });
                    grid.appendChild(b);
                });
                body.appendChild(grid);
            },
            buttons: [{ label: 'c_close', primary: true }]
        });
    }

    // ========================================================== dispatch
    var H = {
        // Panel AI — implementasinya bersama di tools/office/shared/office-ai.js.
        aiPanel: function () { SO.ai.toggle(); },
        aiMode: function (v) { SO.ai.open(v); },
        aiQuota: function () { SO.ai.open(); SO.ai.fetchQuota(); },
        undo: function () { App.undo(); }, redo: function () { App.redo(); },
        paste: function () { C.clipboardCmd('paste'); }, pasteValues: function () { App.pasteInternal('values') || SO.toast('x_copy_first'); },
        pasteFormulas: function () { App.pasteInternal('formulas') || SO.toast('x_copy_first'); }, pasteFormats: function () { App.pasteInternal('formats') || SO.toast('x_copy_first'); },
        cut: function () { C.clipboardCmd('cut'); }, copy: function () { C.clipboardCmd('copy'); }, painter: startPainter,
        fontName: C.fontName, fontSize: C.fontSize, grow: function () { C.growFont(1); }, shrink: function () { C.growFont(-1); },
        bold: function () { C.toggle('b'); }, italic: function () { C.toggle('i'); }, underline: function () { C.toggle('u'); }, strike: function () { C.toggle('st'); },
        fillColor: C.fillColor, fontColor: C.foreColor,
        valign_top: function () { C.valign('top'); }, valign_middle: function () { C.valign('middle'); }, valign_bottom: function () { C.valign('bottom'); },
        align_left: function () { C.align('left'); }, align_center: function () { C.align('center'); }, align_right: function () { C.align('right'); },
        wrap: C.wrap, indent: function () { C.indent(1); }, outdent: function () { C.indent(-1); },
        mergeCenter: function () { C.merge('center'); }, merge: C.merge,
        numberFormat: C.numberFormat, currency: function () { C.numberFormat('currency'); }, percent: function () { C.style({ nf: '0%' }); },
        thousands: C.thousands, decInc: function () { C.decimals(1); }, decDec: function () { C.decimals(-1); },
        formatTable: C.formatAsTable, cellStyle: C.cellStyle,
        insertCells: function () { C.cellsDialog(true); }, insertRows: function () { C.insertRows(false); }, insertCols: function () { C.insertCols(false); }, addSheet: C.addSheet,
        deleteCells: function () { C.cellsDialog(false); }, deleteRows: C.deleteRows, deleteCols: C.deleteCols, deleteSheet: function () { C.deleteSheet(App.wb.active); },
        rowHeight: function () { C.sizeDialog('row'); }, colWidth: function () { C.sizeDialog('col'); }, autofitRow: function () { C.autoFitSelection('row'); }, autofitCol: function () { C.autoFitSelection('col'); },
        defaultWidth: C.defaultWidth, hideRows: function () { C.hide('row', true); }, hideCols: function () { C.hide('col', true); },
        unhideRows: function () { C.hide('row', false); }, unhideCols: function () { C.hide('col', false); },
        renameSheet: function () { C.renameSheetInline(App.wb.active); },
        tabColor: function () { SO.colorPicker(SO.$('.so-panel.is-active'), { value: App.sheet().tabColor, allowNone: true, onPick: function (c) { var sh = App.sheet(); App.change('sheet-color', function () { App.wb.recordMeta(sh); sh.tabColor = c; }); App.renderTabs(); } }); },
        protect: C.toggleProtect, formatCells: function () { C.formatCells('number'); },
        autoSum: function () { C.autoSum('SUM'); }, autoSumFn: C.autoSum, insertFunction: function () { C.insertFunction(); },
        fillDown: function () { App.fillDirection('down'); }, fillRight: function () { App.fillDirection('right'); }, clear: C.clear,
        sortAsc: function () { C.sortQuick(false); }, sortDesc: function () { C.sortQuick(true); }, sortDialog: C.sortDialog,
        filter: C.toggleFilter, clearFilters: C.clearFilters, reapplyFilter: C.applyFilter,
        find: function () { C.findDialog(false); }, replace: function () { C.findDialog(true); },
        goto: function () { SO.prompt('x_goto_ref', App.addrText(App.selRange()), { title: 'x_goto' }).then(function (v) { if (v && !App.gotoRef(v)) SO.toast('x_invalid_ref', { type: 'error' }); }); },
        pivot: C.pivot, chart: C.insertChart, chartDialog: function () { C.chartDialog(null); }, image: C.insertImage, link: C.link, note: C.note,
        deleteNote: function () { C.clear('notes'); }, symbol: symbolDialog,
        pageSet: function (v) { var kv = v.split(':'); var sh = App.sheet(); App.change('page', function () { App.wb.recordMeta(sh); sh.pageSetup[kv[0]] = kv[1]; }); },
        printArea: function (v) { var sh = App.sheet(); var rg = App.selRange(); App.change('page', function () { App.wb.recordMeta(sh); sh.pageSetup.area = v === 'set' ? F.rangeAddr(rg.r1, rg.c1, Math.min(rg.r2, sh.rows.count - 1), Math.min(rg.c2, sh.cols.count - 1)) : null; }); SO.toast(v === 'set' ? 'x_print_area_set' : 'x_print_area_cleared'); },
        pageFit: function (v) { var sh = App.sheet(); App.change('page', function () { App.wb.recordMeta(sh); sh.pageSetup.fit = v; }); },
        printGrid: function (v) { var sh = App.sheet(); App.change('page', function () { App.wb.recordMeta(sh); sh.pageSetup.grid = !!v; }); },
        printHeadings: function (v) { var sh = App.sheet(); App.change('page', function () { App.wb.recordMeta(sh); sh.pageSetup.headings = !!v; }); },
        print: function () { C.print(); }, exportPdf: function () { C.exportAs('pdf'); },
        nameManager: C.nameManager, defineName: C.nameDialog,
        showFormulas: function () { C.viewToggle('showFormulas'); }, calcNow: function () { App.wb.recalc(); App.afterData(); SO.toast('x_recalculated'); },
        importData: function () { App.backstage.open('open'); },
        textToColumns: C.textToColumns, removeDuplicates: C.removeDuplicates, validation: C.dvDialog, goalSeek: C.goalSeek,
        freeze: C.freeze, showGrid: function () { C.viewToggle('showGrid'); }, showHeaders: function () { C.viewToggle('showHeaders'); },
        showFormulaBar: function (v) { document.querySelector('.sx-formulabar').hidden = !v; global.dispatchEvent(new Event('resize')); },
        zoomDialog: function () { SO.form({ title: 'c_zoom', fields: [{ name: 'z', label: 'c_zoom_percent', type: 'number', min: 25, max: 400, value: Math.round(App.sheet().zoom * 100) }] }).then(function (v) { if (v && v.z) App.setZoom(v.z / 100); }); },
        zoom100: function () { App.setZoom(1); },
        zoomSelection: function () {
            var sh = App.sheet(), rg = App.selRange();
            var w = sh.cols.pos(Math.min(rg.c2, sh.cols.count - 1) + 1) - sh.cols.pos(rg.c1);
            var h = sh.rows.pos(Math.min(rg.r2, sh.rows.count - 1) + 1) - sh.rows.pos(rg.r1);
            var z = Math.min((App.el.scroll.clientWidth - App.headerW() - 20) / Math.max(1, w), (App.el.scroll.clientHeight - App.headerH() - 20) / Math.max(1, h));
            App.setZoom(SO.clamp(z, 0.25, 4));
            App.scrollIntoView({ r: rg.r1, c: rg.c1 });
        },
        chartCmd: function (v) { var kv = String(v).split(':'); C.chartCmd(kv[0], kv[1]); }, chartTitle: C.chartTitle
    };

    function onCommand(cmd, value) {
        var h = H[cmd];
        if (!h) { console.warn('[Sinerli Hitara] perintah tidak dikenal', cmd); return; }
        if (App.editing && !/^(insertFunction|autoSum|autoSumFn|undo|redo|symbol)$/.test(cmd) && !(cmd === 'fontName' || cmd === 'fontSize')) {
            if (!App.commitEdit(null)) return;
        }
        try { h(value); } catch (err) { console.error(err); SO.toast(err.message || 'c_err_generic', { type: 'error' }); }
        // Perintah AI membuka panel dan menaruh kursor di kotak instruksinya —
        // mengembalikan fokus ke grid di sini akan langsung merebutnya kembali.
        if (!/^(fontName|fontSize|numberFormat|pageFit|ai)/.test(cmd) && !App.editing && !SO.isDialogOpen()) App.focusGrid();
        C.updateRibbonSoon();
    }

    // ========================================================= pintasan
    function bindShortcuts() {
        var k = App.bindKey;
        k('Mod+Z', function () { App.undo(); });
        k('Mod+Y / Mod+Shift+Z', function () { App.redo(); });
        k('Mod+S', function () { App.session.saveCloud(); });
        k('Mod+P', function () { C.print(); });
        k('Mod+O', function () { App.backstage.open('open'); });
        k('Mod+B', function () { C.toggle('b'); });
        k('Mod+I', function () { C.toggle('i'); });
        k('Mod+U', function () { C.toggle('u'); });
        k('Mod+5', function () { C.toggle('st'); });
        k('Mod+1', function () { C.formatCells('number'); });
        k('Mod+F', function () { C.findDialog(false); });
        k('Mod+H', function () { C.findDialog(true); });
        k('Mod+G', function () { H.goto(); });
        k('Mod+K', function () { C.link(); });
        k('Mod+D', function () { App.fillDirection('down'); });
        k('Mod+R', function () { App.fillDirection('right'); });
        k('Mod+A', function () { C.selectAll(); });
        k('Mod+Shift+L', function () { C.toggleFilter(); });
        k('Mod+`', function () { C.viewToggle('showFormulas'); });
        k('Alt+= / Mod+Shift+T', function () { C.autoSum('SUM'); });
        k('Mod+Shift+= / Mod+Shift++ / Mod+=', function () { C.cellsDialog(true); });
        k('Mod+-', function () { C.cellsDialog(false); });
        k('Mod+Shift+4 / Mod+Shift+$', function () { C.numberFormat('currency'); });
        k('Mod+Shift+5 / Mod+Shift+%', function () { C.style({ nf: '0%' }); });
        k('Mod+Shift+1 / Mod+Shift+!', function () { C.numberFormat('number'); });
        k('Mod+Shift+3 / Mod+Shift+#', function () { C.numberFormat('short_date'); });
        k('Shift+F2', function () { C.note(); });
        k('Shift+F3', function () { C.insertFunction(); });
        k('F9', function () { App.wb.recalc(); App.afterData(); });
        k('Mod+F1', function () { App.ribbon.toggleCollapse(); });
        k('Shift+F11', function () { C.addSheet(); });
        k('Alt+PageDown', function () { if (App.wb.active < App.wb.sheets.length - 1) App.activateSheet(App.wb.active + 1); });
        k('Alt+PageUp', function () { if (App.wb.active > 0) App.activateSheet(App.wb.active - 1); });
    }

    var SHORTCUT_HELP = [
        ['Mod+S', 'x_sc_save'], ['Mod+Z', 'c_undo'], ['Mod+Y', 'c_redo'], ['Mod+C / Mod+X / Mod+V', 'x_sc_clipboard'], ['F2', 'x_sc_edit'],
        ['Mod+Enter', 'x_sc_fill_selection'], ['Alt+Enter', 'x_sc_newline'], ['F4', 'x_sc_absolute'], ['Mod+D / Mod+R', 'x_sc_fill'],
        ['Mod+Arrow', 'x_sc_jump'], ['Shift+Arrow', 'x_sc_extend'], ['Mod+A', 'x_sc_select_all'], ['Shift+Space / Mod+Space', 'x_sc_select_rowcol'],
        ['Mod+B / Mod+I / Mod+U', 'x_sc_font'], ['Mod+1', 'x_format_cells'], ['Mod+;', 'x_sc_today'], ['Alt+=', 'x_autosum'],
        ['Mod+Shift+L', 'x_filter'], ['Mod+F / Mod+H', 'x_find_replace'], ['Mod+K', 'x_link'], ['Shift+F2', 'x_note'], ['Mod+`', 'x_show_formulas'],
        ['Alt+ArrowDown', 'x_sc_pick_list'], ['Alt+PageUp / Alt+PageDown', 'x_sc_switch_sheet']
    ];

    // ============================================================= boot
    function createFrom(id) {
        App.session.newKey();
        var data = templateData(id);
        App.loadDocument(data, id === 'blank' ? SO.t('x_new_book_name') : SO.t('x_tpl_' + id));
        if (id !== 'blank') App.session.markDirty();
        App.focusGrid();
    }

    function templateData(id) {
        if (id === 'blank') return null;
        var wb = new M.Workbook();
        var sh = wb.addSheet(SO.t('x_default_sheet') + '1');
        var put = function (a, v, s) { var p = F.parseAddr(a); wb.setInput(sh, p.r, p.c, v); if (s) wb.setStyle(sh, p.r, p.c, p.r, p.c, s); };
        var head = { b: true, bg: '#1D7044', fc: '#FFFFFF', ha: 'center' };
        var line = { s: 'thin', c: '#BFBFBF' };
        var box = function (r1, c1, r2, c2) { wb.setStyle(sh, r1, c1, r2, c2, function (s) { s.bd = { t: line, b: line, l: line, r: line }; return s; }); };
        if (id === 'budget') {
            sh.name = SO.t('x_tpl_budget');
            put('A1', SO.t('x_tpl_budget_title'), { b: true, fs: 16, fc: '#1D7044' });
            put('A3', SO.t('x_tpl_category'), head); put('B3', SO.t('x_tpl_planned'), head); put('C3', SO.t('x_tpl_actual'), head); put('D3', SO.t('x_tpl_difference'), head);
            var cats = ['x_tpl_cat_food', 'x_tpl_cat_transport', 'x_tpl_cat_housing', 'x_tpl_cat_bills', 'x_tpl_cat_saving', 'x_tpl_cat_fun'];
            var planned = [2500000, 800000, 3000000, 750000, 1500000, 500000], actual = [2350000, 920000, 3000000, 700000, 1500000, 640000];
            cats.forEach(function (c, i) { var r = 4 + i; put('A' + r, SO.t(c)); put('B' + r, String(planned[i])); put('C' + r, String(actual[i])); put('D' + r, '=B' + r + '-C' + r); });
            put('A10', SO.t('x_total'), { b: true }); put('B10', '=SUM(B4:B9)', { b: true }); put('C10', '=SUM(C4:C9)', { b: true }); put('D10', '=SUM(D4:D9)', { b: true });
            wb.setStyle(sh, 3, 1, 9, 3, { nf: '"Rp "#,##0' });
            box(2, 0, 9, 3);
            sh.cols.sizes[0] = 170; sh.cols.sizes[1] = 130; sh.cols.sizes[2] = 130; sh.cols.sizes[3] = 130;
            sh.cf.push({ id: 'cf1', type: 'cell', op: 'lt', v1: '0', ranges: [{ r1: 3, c1: 3, r2: 8, c2: 3 }], style: { bg: '#FFC7CE', fc: '#9C0006' } });
            sh.charts.push({ id: 'ch1', type: 'column', range: F.quoteSheet(sh.name) + '!A3:C9', x: 600, y: 40, w: 460, h: 280, title: SO.t('x_tpl_budget_title'), legend: 'bottom' });
            sh.freeze = { r: 3, c: 0 };
        } else if (id === 'sales') {
            sh.name = SO.t('x_tpl_sales');
            put('A1', SO.t('x_tpl_sales_title'), { b: true, fs: 16, fc: '#1D7044' });
            ['x_tpl_date', 'x_tpl_product', 'x_tpl_region', 'x_tpl_qty', 'x_tpl_price', 'x_tpl_revenue'].forEach(function (k, i) { put(F.colName(i) + '3', SO.t(k), head); });
            var prods = ['Laptop', 'Mouse', 'Keyboard', 'Monitor', 'Headset'];
            var regions = ['Jakarta', 'Bandung', 'Surabaya', 'Medan'];
            var prices = [8500000, 150000, 350000, 2200000, 450000];
            for (var i = 0; i < 20; i++) {
                var r = 4 + i;
                var d = F.dateToSerial(2026, 9, 1) + i;
                sh.cells.set(M.key(r - 1, 0), { v: d, s: { nf: 'dd/mm/yyyy' } });
                put('B' + r, prods[i % 5]); put('C' + r, regions[(i * 3) % 4]); put('D' + r, String(1 + (i * 7) % 9)); put('E' + r, String(prices[i % 5])); put('F' + r, '=D' + r + '*E' + r);
            }
            wb.setStyle(sh, 3, 4, 22, 5, { nf: '"Rp "#,##0' });
            box(2, 0, 22, 5);
            put('H3', SO.t('x_tpl_summary'), head); put('I3', SO.t('x_tpl_revenue'), head);
            regions.forEach(function (rg, j) { put('H' + (4 + j), rg); put('I' + (4 + j), '=SUMIF($C$4:$C$23,H' + (4 + j) + ',$F$4:$F$23)'); });
            wb.setStyle(sh, 3, 8, 6, 8, { nf: '"Rp "#,##0' });
            box(2, 7, 6, 8);
            [105, 110, 100, 80, 120, 140, 24, 150, 150].forEach(function (w, j) { sh.cols.sizes[j] = w; });
            sh.filter = { r1: 2, c1: 0, r2: 22, c2: 5, crit: {} };
            sh.charts.push({ id: 'ch1', type: 'pie', range: F.quoteSheet(sh.name) + '!H3:I7', x: 860, y: 180, w: 360, h: 260, title: SO.t('x_tpl_revenue'), legend: 'right' });
            sh.freeze = { r: 3, c: 0 };
        } else if (id === 'invoice') {
            sh.name = SO.t('x_tpl_invoice');
            put('A1', SO.t('x_tpl_invoice').toUpperCase(), { b: true, fs: 22, fc: '#1D7044' });
            put('A3', SO.t('x_tpl_bill_to'), { b: true }); put('A4', 'PT Contoh Pelanggan'); put('A5', 'Jakarta');
            put('D3', SO.t('x_tpl_invoice_no'), { b: true, ha: 'right' }); put('E3', 'INV-2026-001');
            put('D4', SO.t('x_tpl_date'), { b: true, ha: 'right' }); put('E4', '=TODAY()', { nf: 'dd/mm/yyyy' });
            ['x_tpl_item', 'x_tpl_qty', 'x_tpl_price', 'x_tpl_amount'].forEach(function (k, i) { put(F.colName(i + 1) + '7', SO.t(k), head); });
            put('A7', '#', head);
            [['Desain logo', 1, 2500000], ['Pembuatan website', 1, 8000000], ['Hosting (12 bulan)', 12, 150000]].forEach(function (it, i) {
                var r = 8 + i;
                put('A' + r, String(i + 1)); put('B' + r, it[0]); put('C' + r, String(it[1])); put('D' + r, String(it[2])); put('E' + r, '=C' + r + '*D' + r);
            });
            put('D12', SO.t('x_tpl_subtotal'), { b: true, ha: 'right' }); put('E12', '=SUM(E8:E10)');
            put('D13', SO.t('x_tpl_tax'), { b: true, ha: 'right' }); put('E13', '=E12*11%');
            put('D14', SO.t('x_total'), { b: true, ha: 'right' }); put('E14', '=E12+E13', { b: true, bg: '#E2EFDA' });
            wb.setStyle(sh, 7, 3, 13, 4, { nf: '"Rp "#,##0' });
            box(6, 0, 9, 4);
            [40, 220, 70, 130, 140].forEach(function (w, j) { sh.cols.sizes[j] = w; });
            sh.showGrid = false;
        } else if (id === 'schedule') {
            sh.name = SO.t('x_tpl_schedule');
            put('A1', SO.t('x_tpl_schedule_title'), { b: true, fs: 16, fc: '#1D7044' });
            ['x_tpl_task', 'x_tpl_owner', 'x_tpl_start', 'x_tpl_end', 'x_tpl_days', 'x_tpl_status'].forEach(function (k, i) { put(F.colName(i) + '3', SO.t(k), head); });
            var statuses = [SO.t('x_tpl_st_done'), SO.t('x_tpl_st_progress'), SO.t('x_tpl_st_todo')];
            for (var t = 0; t < 8; t++) {
                var rr = 4 + t;
                put('A' + rr, SO.t('x_tpl_task') + ' ' + (t + 1)); put('B' + rr, ['Andi', 'Budi', 'Citra', 'Dewi'][t % 4]);
                sh.cells.set(M.key(rr - 1, 2), { v: F.dateToSerial(2026, 9, 1) + t * 3, s: { nf: 'dd/mm/yyyy' } });
                sh.cells.set(M.key(rr - 1, 3), { v: F.dateToSerial(2026, 9, 1) + t * 3 + 4, s: { nf: 'dd/mm/yyyy' } });
                put('E' + rr, '=NETWORKDAYS(C' + rr + ',D' + rr + ')'); put('F' + rr, statuses[Math.min(2, Math.floor(t / 3))]);
            }
            box(2, 0, 11, 5);
            [200, 110, 110, 110, 90, 130].forEach(function (w, j) { sh.cols.sizes[j] = w; });
            sh.dv.push({ id: 'dv1', ranges: [{ r1: 3, c1: 5, r2: 200, c2: 5 }], type: 'list', list: statuses.join(','), allowBlank: true, errorStyle: 'stop' });
            sh.cf.push({ id: 'cf1', type: 'text', op: 'contains', v1: statuses[0], ranges: [{ r1: 3, c1: 5, r2: 200, c2: 5 }], style: { bg: '#C6EFCE', fc: '#006100' } });
            sh.cf.push({ id: 'cf2', type: 'text', op: 'contains', v1: statuses[1], ranges: [{ r1: 3, c1: 5, r2: 200, c2: 5 }], style: { bg: '#FFEB9C', fc: '#9C5700' } });
            sh.freeze = { r: 3, c: 1 };
        }
        sh.cols.invalidate();
        wb.recalc();
        return wb.toJSON();
    }

    /** Pratinjau mini lembar kerja (SVG) untuk kartu templat. */
    function sheetThumb(opts) {
        var W = 200, H = 130, cw = 40, rh = 13, svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"><rect width="' + W + '" height="' + H + '" fill="#fff"/>';
        if (opts.title) svg += '<rect x="8" y="6" width="90" height="7" rx="2" fill="' + opts.color + '"/>';
        var top = opts.title ? 20 : 0;
        if (opts.header) svg += '<rect x="0" y="' + top + '" width="' + W + '" height="' + rh + '" fill="' + opts.color + '" opacity=".9"/>';
        for (var r = 0; r <= Math.ceil((H - top) / rh); r++) {
            var y = top + r * rh;
            if (opts.band && r > 1 && r % 2 === 0) svg += '<rect x="0" y="' + y + '" width="' + W + '" height="' + rh + '" fill="' + opts.band + '"/>';
            svg += '<line x1="0" x2="' + W + '" y1="' + (y + 0.5) + '" y2="' + (y + 0.5) + '" stroke="#e3e3e3"/>';
        }
        for (var c = 1; c < W / cw; c++) svg += '<line y1="' + top + '" y2="' + H + '" x1="' + (c * cw + 0.5) + '" x2="' + (c * cw + 0.5) + '" stroke="#e3e3e3"/>';
        (opts.bars || []).forEach(function (b, i) { svg += '<rect x="' + (126 + i * 14) + '" y="' + (H - 8 - b) + '" width="9" height="' + b + '" fill="' + opts.color + '" opacity=".75"/>'; });
        (opts.gantt || []).forEach(function (g, i) { svg += '<rect x="' + g[0] + '" y="' + (top + rh * (i + 1) + 3) + '" width="' + g[1] + '" height="7" rx="2" fill="' + opts.color + '" opacity=".8"/>'; });
        if (opts.total) svg += '<rect x="120" y="' + (H - 22) + '" width="72" height="12" fill="none" stroke="' + opts.color + '" stroke-width="1.5"/>';
        return svg + '</svg>';
    }

    var TEMPLATES = [
        { id: 'blank', label: 'x_tpl_blank', desc: 'x_tpl_blank_desc', thumb: sheetThumb({ color: '#0f766e' }) },
        { id: 'budget', label: 'x_tpl_budget', desc: 'x_tpl_budget_desc', thumb: sheetThumb({ color: '#0f766e', title: true, header: true, band: '#e2f3f0', bars: [30, 44, 22, 52, 38] }) },
        { id: 'sales', label: 'x_tpl_sales', desc: 'x_tpl_sales_desc', thumb: sheetThumb({ color: '#2f6db5', title: true, header: true, band: '#eef3fa', bars: [18, 26, 34, 42, 56] }) },
        { id: 'invoice', label: 'x_tpl_invoice', desc: 'x_tpl_invoice_desc', thumb: sheetThumb({ color: '#8a5a12', title: true, header: true, total: true }) },
        { id: 'schedule', label: 'x_tpl_schedule', desc: 'x_tpl_schedule_desc', thumb: sheetThumb({ color: '#7b3fa0', title: true, header: true, gantt: [[44, 50], [70, 60], [96, 40], [120, 64], [60, 90], [140, 50]] }) }
    ];

    function boot() {
        SO.applyI18n(document);
        App.shell = SO.createShell({
            logo: window.SN ? 'assets/icon.png' : SO.root + 'assets/img/tools/sineex.webp',
            app: 'sineex', name: 'Sinerli Hitara', icon: 'fa-table-cells',
            onSave: function () { if (App.editing) App.commitEdit(null); App.session.saveCloud(); },
            onUndo: function () { App.undo(); },
            onRedo: function () { App.redo(); },
            onRename: function (name) { App.shell.setName(name); App.session.markDirty(); },
            onBack: function () { if (App.editing) App.commitEdit(null); return App.session.flush(); }
        });
        App.ribbon = new SO.Ribbon(document.getElementById('sxRibbon'), { tabs: TABS, onCommand: onCommand, onFile: function () { App.backstage.open('new'); } });
        App.session = new SO.DocSession({
            app: 'sineex', type: 'sineex',
            getContent: App.serialize,
            getName: function () { return App.getTitle(); },
            setName: function (n) { App.shell.setName(n); },
            getThumbnail: function () { return C.thumbnail(); },
            onStatus: function (s, e) { App.shell.setStatus(s, e); },
            // Pengamanan proyek: memasang isi versi/cloud terbaru dan cadangan berkas asli.
            applyContent: function (c, n) { App.loadDocument(c, n); },
            // Perubahan langsung dari kolaborator: tetap di lembar, pilihan & gulir sendiri.
            applyLive: function (c, n) {
                var x = App.el.scroll.scrollLeft, y = App.el.scroll.scrollTop;
                App.loadDocument(Object.assign({}, c, { sel: { sheet: App.wb.active, sel: App.sel } }), n);
                App.el.scroll.scrollLeft = x;
                App.el.scroll.scrollTop = y;
            },
            liveBusy: function () { return !!App.editing; },
            backup: function () { C.exportAs('sineex'); }
        });
        App.backstage = new SO.Backstage(App.session, App.shell, {
            app: 'sineex', type: 'sineex', appName: 'Sinerli Hitara', icon: 'fa-table-cells',
            templates: TEMPLATES, createFrom: createFrom,
            openAccept: '.xlsx,.xlsm,.xls,.ods,.csv,.tsv,.txt,.sineex',
            openAcceptLabel: 'Excel (.xlsx, .xls) · ODS · CSV · TSV · Sinerli Hitara',
            importFile: C.importFile,
            exportFormats: [
                { id: 'xlsx', label: 'x_fmt_xlsx', desc: 'x_fmt_xlsx_desc', icon: 'fa-file-excel' },
                { id: 'pdf', label: 'x_fmt_pdf', desc: 'x_fmt_pdf_desc', icon: 'fa-file-pdf' },
                { id: 'csv', label: 'x_fmt_csv', desc: 'x_fmt_csv_desc', icon: 'fa-file-csv' },
                { id: 'csv-semicolon', label: 'x_fmt_csv_semi', desc: 'x_fmt_csv_semi_desc', icon: 'fa-file-csv' },
                { id: 'tsv', label: 'x_fmt_tsv', desc: 'x_fmt_tsv_desc', icon: 'fa-file-lines' },
                { id: 'ods', label: 'x_fmt_ods', desc: 'x_fmt_ods_desc', icon: 'fa-file-contract' },
                { id: 'html', label: 'x_fmt_html', desc: 'x_fmt_html_desc', icon: 'fa-file-code' },
                { id: 'sineex', label: 'x_fmt_sineex', desc: 'x_fmt_sineex_desc', icon: 'fa-box-archive' }
            ],
            exportAs: C.exportAs, print: C.print,
            loadDocument: function (c, n) { App.loadDocument(c, n); },
            restoreVersion: function (content, name) { App.loadDocument(content, name); App.session.markDirty(); SO.toast('c_version_restored', { type: 'success' }); },
            info: function () {
                var cells = 0, formulas = 0;
                App.wb.sheets.forEach(function (sh) { sh.cells.forEach(function (c) { cells++; if (c.f !== undefined) formulas++; }); });
                return [['x_info_sheets', SO.fmtNum(App.wb.sheets.length)], ['x_info_cells', SO.fmtNum(cells)], ['x_info_formulas', SO.fmtNum(formulas)]];
            },
            renderOptions: function (box) {
                var l = SO.el('label', { class: 'so-field is-inline' });
                var cb = SO.el('input', { type: 'checkbox' });
                cb.checked = !!App.statusExtra;
                cb.addEventListener('change', function () { App.statusExtra = cb.checked; try { localStorage.setItem('sx_status_extra', cb.checked ? '1' : '0'); } catch (e) {} App.updateStatus(); });
                l.appendChild(cb);
                l.appendChild(SO.el('span', { text: SO.t('x_opt_status_minmax') }));
                box.appendChild(l);
            },
            shortcuts: SHORTCUT_HELP,
            onBackstageClose: function () { App.focusGrid(); }
        });
        try { App.statusExtra = localStorage.getItem('sx_status_extra') === '1'; } catch (e) {}
        bindShortcuts();

        document.getElementById('sxAddSheet').addEventListener('click', C.addSheet);
        document.getElementById('sxSheetList').addEventListener('click', function () { C.sheetListMenu(this); });
        document.getElementById('sxZoomRange').addEventListener('input', function (e) { App.setZoom(+e.target.value / 100); });
        document.getElementById('sxZoomIn').addEventListener('click', function () { App.setZoom(App.sheet().zoom + 0.1); });
        document.getElementById('sxZoomOut').addEventListener('click', function () { App.setZoom(App.sheet().zoom - 0.1); });
        document.getElementById('sxZoomVal').addEventListener('click', H.zoomDialog);
        document.getElementById('sxStGrid').addEventListener('click', function () { C.viewToggle('showGrid'); });
        document.getElementById('sxFxInsert').addEventListener('mousedown', function (e) { e.preventDefault(); });
        document.getElementById('sxFxInsert').addEventListener('click', function () { C.insertFunction(); });
        document.getElementById('sxStAgg').addEventListener('click', function () { App.statusExtra = !App.statusExtra; App.updateStatus(); });
        App.el.scroll.addEventListener('scroll', function () { C.layoutObjects(); });
        SO.onLang(function () { App.renderTabs(); C.updateRibbon(); App.updateStatus(); });

        var freshOpen = !SO.ctx.projectId && !SO.ctx.draft;
        App.session.boot().then(function (res) {
            App.loadDocument(res ? res.content : null, res ? res.name : SO.t('x_new_book_name'));
            if (!App.session.protected) App.session.loaded();
            App.shell.hideLoading();
            App.ribbon.setValue('showFormulaBar', true);
            C.updateRibbon();
            App.focusGrid();
            if (res && App.backstage.openFromUrl()) { /* bagian menu Berkas diminta Dashboard */ }
            else if (freshOpen && SO.ctx.params.get('action') !== 'blank') App.backstage.open('new');
        }).catch(function (err) {
            console.error(err);
            App.session.loadFailed(err);
            App.loadDocument(null, SO.t('x_new_book_name'));
            App.shell.hideLoading();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(window);
