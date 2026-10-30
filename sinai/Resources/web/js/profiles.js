/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Model profiles: every model family has its own habits (too verbose, lazy
   with tools, sloppy JSON, forgets to read before editing…). A profile adds a
   short corrective prompt for that family, picks sampling settings and says
   how much of the tool catalogue the model can handle. Notes learned by the
   quality suite (evals.js) are merged in per model, so the prompt adapts to
   measured weaknesses instead of guesses. */
(function () {
  'use strict';

  var CLAUDE_STYLE = [
    'Work like a seasoned expert colleague: understand the real goal, act, verify, then report briefly.',
    'Use your tools whenever they give a better answer than memory — you always see the full tool list; pick what fits.',
    'Lead with the result. No filler openers ("Tentu!", "Baik, berikut…"), no restating the question, no generic closing offers.',
  ].join(' ');

  /* Families are matched in order against "<provider preset> <model id>". */
  var FAMILIES = [
    { id: 'claude', match: /claude|anthropic/i, label: 'Claude', notes: '' },
    { id: 'deepseek', match: /deepseek/i, label: 'DeepSeek', temperature: 0.6,
      notes: 'You tend to over-explain and to edit files you have not read. Always read a file before editing it, keep prose short, and never print the same code twice. Call tools only through the native tool-calling interface — never write DSML, <function_calls>, <invoke> or <tool_call> markup into your reply text.' },
    { id: 'qwen', match: /qwen|qwq/i, label: 'Qwen', temperature: 0.6,
      notes: 'Call tools with strictly valid JSON arguments. Do not narrate tool calls you are about to make — just make them. Answer in the user\'s language, never switch to Chinese.' },
    { id: 'glm', match: /glm|zhipu|z\.ai|chatglm/i, label: 'GLM', temperature: 0.6,
      notes: 'Keep answers compact. Finish every task fully before stopping; do not stop after a plan. Answer in the user\'s language, never switch to Chinese.' },
    { id: 'kimi', match: /kimi|moonshot/i, label: 'Kimi', temperature: 0.6,
      notes: 'Prefer acting with tools over describing what you would do. Keep the final report short.' },
    { id: 'gpt-reasoning', match: /(^|[\s/])(o\d|gpt-5|gpt-oss)/i, label: 'OpenAI reasoning', notes: 'Be concise in the visible answer; your reasoning is private.' },
    { id: 'gpt', match: /gpt|openai|chatgpt/i, label: 'GPT', temperature: 0.5,
      notes: 'Avoid heavy bullet-point formatting for simple answers; write natural prose. Do not ask for permission to continue — continue.' },
    { id: 'gemini', match: /gemini|gemma|google/i, label: 'Gemini', temperature: 0.6,
      notes: 'Do not add disclaimers or safety boilerplate the user did not ask for. Keep headings minimal. Verify facts with web_search when they may be outdated.' },
    { id: 'grok', match: /grok|xai/i, label: 'Grok', temperature: 0.6, notes: 'Keep a neutral, professional tone; no jokes unless the user jokes first.' },
    { id: 'mistral', match: /mistral|mixtral|codestral|magistral/i, label: 'Mistral', temperature: 0.5,
      notes: 'Follow the output format exactly. Read files before editing and run the code you change.' },
    { id: 'llama', match: /llama|meta/i, label: 'Llama', temperature: 0.5,
      notes: 'Use tools for anything you cannot know for sure. Use valid JSON for tool arguments. Never invent file contents, URLs or API names.' },
    { id: 'minimax', match: /minimax|abab/i, label: 'MiniMax', temperature: 0.6, notes: 'Keep answers compact and finish tasks fully.' },
    { id: 'sinerli', match: /sinerli|snr-/i, label: 'Sinerli',
      notes: 'Call tools only through the native tool-calling interface — never write DSML, <function_calls>, <invoke> or <tool_call> markup into your reply text. When the user asks for a file, call create_file; do not paste the file\'s content into the chat.' },
  ];
  var GENERIC = { id: 'generic', label: 'Umum', notes: '' };

  function family(r) {
    var key = (r.provider.presetId || r.provider.kind || '') + ' ' + r.modelId + ' ' + (r.info.name || '');
    return FAMILIES.find(function (f) { return f.match.test(key); }) || GENERIC;
  }

  function refKey(r) { return r.provider.id + '::' + r.modelId; }
  function learnedStore() { return Store.settings.modelProfiles || {}; }

  /* Effective profile for a resolved model {provider, modelId, info}. */
  function get(r) {
    if (!r) return Object.assign({ notes: '' }, GENERIC);
    var f = family(r);
    var learned = learnedStore()[refKey(r)] || {};
    var ctx = r.info.ctx || 0;
    return {
      id: f.id, label: f.label,
      // A small context window cannot carry ~40 tool schemas on every step.
      smallCtx: ctx > 0 && ctx < 32000,
      allTools: learned.allTools != null ? learned.allTools : !(ctx > 0 && ctx < 32000),
      // HTML-authored files need a model that writes solid CSS; weak/small ones keep the Markdown deck engine.
      htmlFiles: learned.htmlFiles != null ? learned.htmlFiles : !(ctx > 0 && ctx < 32000),
      temperature: learned.temperature != null ? learned.temperature : f.temperature,
      notes: [f.notes, learned.notes].filter(Boolean).join('\n'),
      score: learned.score, scoredAt: learned.scoredAt,
    };
  }

  /* Prompt section added to every system prompt. */
  function promptSection(r) {
    var p = get(r);
    var out = '\n\n# Working style\n' + CLAUDE_STYLE;
    if (p.notes) out += '\n\n# Notes for this model (measured habits to correct)\n' + p.notes;
    return out;
  }

  /* Store notes learned from the quality suite for one model. */
  function learn(ref, data) {
    var all = Object.assign({}, learnedStore());
    var key = ref.providerId + '::' + ref.modelId;
    all[key] = Object.assign({}, all[key] || {}, data, { scoredAt: Date.now() });
    Store.setSetting('modelProfiles', all);
  }
  function reset(ref) {
    var all = Object.assign({}, learnedStore());
    delete all[ref.providerId + '::' + ref.modelId];
    Store.setSetting('modelProfiles', all);
  }

  window.Profiles = { FAMILIES: FAMILIES, get: get, family: family, promptSection: promptSection, learn: learn, reset: reset };
})();
