/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Model providers: presets, API-key detection, model discovery, capability
   inference and streaming chat for OpenAI-compatible and Anthropic APIs. */
(function () {
  'use strict';

  var PRESETS = [
    // Satu provider "Sinerli" untuk semua key Sinerli: snr-… (SNR-1, /ai/v1) dan <app>-sk-… (Racikan Model AI, /gw/v1).
    { id: 'sinerli', name: 'Sinerli', kind: 'openai', baseUrl: 'https://sinerli.com/ai/v1', match: /^snr-|^[a-z0-9]{1,16}-sk-[a-f0-9]{48}$/, keysUrl: 'https://sinerli.com/AdminDashboard#ai_gateway', fallback: ['sinerli-snr-1'] },
    { id: 'deepseek', name: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com', echoReasoning: true, keysUrl: 'https://platform.deepseek.com/api_keys', fallback: ['deepseek-v4-pro', 'deepseek-flash'] },
    { id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', match: /^sk-(proj|svcacct|admin)-/, keysUrl: 'https://platform.openai.com/api-keys' },
    { id: 'anthropic', name: 'Anthropic (Claude)', kind: 'anthropic', baseUrl: 'https://api.anthropic.com', match: /^sk-ant-/, keysUrl: 'https://console.anthropic.com/settings/keys', fallback: ['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] },
    { id: 'gemini', name: 'Google Gemini', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', match: /^AIza/, keysUrl: 'https://aistudio.google.com/apikey' },
    { id: 'openrouter', name: 'OpenRouter (multi-model)', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', match: /^sk-or-/, keysUrl: 'https://openrouter.ai/keys' },
    { id: 'groq', name: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', match: /^gsk_/ },
    { id: 'xai', name: 'xAI (Grok)', kind: 'openai', baseUrl: 'https://api.x.ai/v1', match: /^xai-/ },
    { id: 'mistral', name: 'Mistral AI', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1' },
    { id: 'moonshot', name: 'Moonshot (Kimi)', kind: 'openai', baseUrl: 'https://api.moonshot.ai/v1', echoReasoning: true },
    { id: 'qwen', name: 'Alibaba Qwen (DashScope)', kind: 'openai', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' },
    { id: 'zai', name: 'Z.ai (GLM)', kind: 'openai', baseUrl: 'https://api.z.ai/api/paas/v4', echoReasoning: true },
    { id: 'together', name: 'Together AI', kind: 'openai', baseUrl: 'https://api.together.xyz/v1' },
    { id: 'fireworks', name: 'Fireworks AI', kind: 'openai', baseUrl: 'https://api.fireworks.ai/inference/v1', match: /^fw_/ },
    { id: 'cerebras', name: 'Cerebras', kind: 'openai', baseUrl: 'https://api.cerebras.ai/v1', match: /^csk-/ },
    { id: 'nvidia', name: 'NVIDIA NIM', kind: 'openai', baseUrl: 'https://integrate.api.nvidia.com/v1', match: /^nvapi-/ },
    { id: 'huggingface', name: 'Hugging Face', kind: 'openai', baseUrl: 'https://router.huggingface.co/v1', match: /^hf_/ },
    { id: 'perplexity', name: 'Perplexity', kind: 'openai', baseUrl: 'https://api.perplexity.ai', match: /^pplx-/, fallback: ['sonar-pro', 'sonar', 'sonar-reasoning-pro'] },
    { id: 'siliconflow', name: 'SiliconFlow', kind: 'openai', baseUrl: 'https://api.siliconflow.com/v1' },
    { id: 'minimax', name: 'MiniMax', kind: 'openai', baseUrl: 'https://api.minimax.io/v1' },
    { id: 'ollama', name: 'Ollama (lokal)', kind: 'openai', baseUrl: 'http://localhost:11434/v1', noKey: true },
    { id: 'lmstudio', name: 'LM Studio (lokal)', kind: 'openai', baseUrl: 'http://localhost:1234/v1', noKey: true },
    { id: 'custom-openai', name: 'Kustom — OpenAI-compatible', kind: 'openai', baseUrl: '', custom: true },
    { id: 'custom-anthropic', name: 'Kustom — Anthropic-compatible', kind: 'anthropic', baseUrl: '', custom: true },
  ];

  function preset(id) {
    if (id === 'sinerli-gw') id = 'sinerli';   // preset lama digabung ke "Sinerli"
    return PRESETS.find(function (p) { return p.id === id; }) || PRESETS.find(function (p) { return p.id === 'custom-openai'; });
  }

  /** Key Racikan Model AI (<app>-sk-<48 hex>) memakai /gw/v1; key snr-… memakai /ai/v1. */
  function isSinerliGwKey(key) { return /^[a-z0-9]{1,16}-sk-[a-f0-9]{48}$/.test(String(key || '').trim()); }
  function sinerliUrl(key) {
    var srv = window.Sinerli ? Sinerli.base() : 'https://sinerli.com';
    return srv + (isSinerliGwKey(key) ? '/gw/v1' : '/ai/v1');
  }
  function isSinerliGw(provider) { return !!provider && /\/gw\/v1\/?$/.test(String(provider.baseUrl || '')); }

  /* Suggests a provider from the key's shape. Plain `sk-` + 32 hex is DeepSeek's format. */
  function detectPreset(key) {
    key = String(key || '').trim();
    if (!key) return null;
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].match && PRESETS[i].match.test(key)) return PRESETS[i].id;
    if (/^sk-[a-f0-9]{32}$/.test(key)) return 'deepseek';
    return null;
  }

  // ---------------------------------------------------------------- capabilities

  var KNOWN = [
    [/^claude-(fable|mythos|opus-5|sonnet-5|haiku-5|opus-4-[6-9]|sonnet-4-[6-9])/, { ctx: 1000000, maxOut: 128000, vision: true, reasoning: true }],
    [/^claude-(opus-4|sonnet-4|haiku-4|3-7)/, { ctx: 200000, maxOut: 64000, vision: true, reasoning: true }],
    [/^claude-3/, { ctx: 200000, maxOut: 8192, vision: true }],
    [/^deepseek-(flash|v4)/, { ctx: 1000000, maxOut: 384000, reasoning: true }],
    [/^deepseek-reasoner/, { ctx: 128000, maxOut: 64000, reasoning: true }],
    [/^deepseek-chat/, { ctx: 128000, maxOut: 8192 }],
    [/^deepseek-r1/, { ctx: 128000, reasoning: true }],
    [/^gpt-5/, { ctx: 400000, maxOut: 128000, vision: true, reasoning: true }],
    [/^gpt-4\.1/, { ctx: 1000000, maxOut: 32768, vision: true }],
    [/^gpt-4o/, { ctx: 128000, maxOut: 16384, vision: true }],
    [/^o[134](-|$)/, { ctx: 200000, maxOut: 100000, vision: true, reasoning: true }],
    [/^gpt-oss/, { ctx: 131072, reasoning: true }],
    [/gemini-(2\.5|3)/, { ctx: 1000000, maxOut: 65536, vision: true, reasoning: true }],
    [/^sinerli-snr/, { ctx: 32768, maxOut: 8192, reasoning: true }],
    [/gemini/, { ctx: 1000000, maxOut: 8192, vision: true }],
    [/^grok-4/, { ctx: 256000, vision: true, reasoning: true }],
    [/^grok-3-mini/, { ctx: 131072, reasoning: true }],
    [/^grok/, { ctx: 131072 }],
    [/kimi-k2-thinking/, { ctx: 256000, reasoning: true }],
    [/kimi|moonshot/, { ctx: 256000 }],
    [/qwen3|qwq/, { ctx: 131072, reasoning: true }],
    [/qwen.*vl|vl-/, { ctx: 131072, vision: true }],
    [/glm-(4\.[5-9]|5)/, { ctx: 128000, reasoning: true }],
    [/llama-4/, { ctx: 1000000, vision: true }],
    [/magistral/, { ctx: 128000, reasoning: true }],
    [/pixtral|mistral-medium|mistral-large|devstral|codestral/, { ctx: 128000 }],
    [/minimax-m/, { ctx: 200000, reasoning: true }],
    [/sonar-reasoning/, { ctx: 128000, reasoning: true, tools: false }],
    [/sonar/, { ctx: 128000, tools: false }],
  ];

  var NON_CHAT = /(embed|embedding|whisper|tts|dall-e|davinci|babbage|moderation|transcribe|audio|realtime|^image|-image|imagen|veo|rerank|guard|clip|bge-|e5-|stable-diffusion|flux|sdxl|ocr|-search-api|computer-use|aqa)/i;

  function inferCaps(id, meta) {
    var base = String(id || '').toLowerCase().split('/').pop().replace(/:.*$/, '');
    var caps = { ctx: 128000, maxOut: 0, vision: false, tools: true, reasoning: false };
    for (var i = 0; i < KNOWN.length; i++) {
      if (KNOWN[i][0].test(base)) { Object.assign(caps, KNOWN[i][1]); break; }
    }
    if (/vision|vl\b|-vl|llava|pixtral|omni|4o/.test(base)) caps.vision = true;
    if (/(^|[-_])r1|reason|think|qwq/.test(base)) caps.reasoning = true;
    if (/^(o1-mini|o1-preview)|gemma-?2|deepseek-r1-distill/.test(base)) caps.tools = false;
    if (meta) {
      if (meta.ctx) caps.ctx = meta.ctx;
      if (meta.maxOut) caps.maxOut = meta.maxOut;
      if (meta.vision != null) caps.vision = meta.vision;
      if (meta.tools != null) caps.tools = meta.tools;
      if (meta.reasoning != null) caps.reasoning = meta.reasoning || caps.reasoning;
    }
    return caps;
  }

  function isChatModel(id) { return !NON_CHAT.test(id); }

  // ---------------------------------------------------------------- discovery

  function baseUrl(p) { return String(p.baseUrl || '').trim().replace(/\/+$/, ''); }

  function authHeaders(provider, key) {
    var h = {};
    if (provider.kind === 'anthropic') {
      if (key) h['x-api-key'] = key;
      h['anthropic-version'] = '2023-06-01';
    } else if (key) {
      h.Authorization = 'Bearer ' + key;
    }
    if (provider.presetId === 'openrouter') { h['HTTP-Referer'] = 'https://sinai.app'; h['X-Title'] = 'Sinai'; }
    return h;
  }

  function anthropicRoot(provider) {
    var b = baseUrl(provider);
    return /\/v1$/.test(b) ? b : b + '/v1';
  }

  async function listModels(provider, key) {
    var pre = preset(provider.presetId);
    var url = provider.kind === 'anthropic' ? anthropicRoot(provider) + '/models?limit=1000' : baseUrl(provider) + '/models';
    var res;
    try {
      res = await Native.call('http.request', { url: url, method: 'GET', headers: authHeaders(provider, key), timeout: 30 });
    } catch (e) {
      throw new Error('Tidak bisa terhubung ke ' + url + ' — ' + e.message);
    }
    if (res.status === 401 || res.status === 403) throw apiError(res.status, res.body, provider);
    if (res.status >= 400) {
      if (pre.fallback) return pre.fallback.map(function (id) { return modelEntry(id, {}); });
      throw apiError(res.status, res.body, provider);
    }
    var json;
    try { json = JSON.parse(res.body); } catch (e) {
      // Mis. halaman pemeliharaan HTML dengan status 200: key sudah lolos auth, jadi pakai model cadangan preset.
      if (pre.fallback) return pre.fallback.map(function (id) { return modelEntry(id, {}); });
      throw new Error('Respons daftar model bukan JSON yang valid');
    }
    var arr = Array.isArray(json) ? json : (json.data || json.models || json.result || []);
    var out = [];
    arr.forEach(function (m) {
      if (typeof m === 'string') m = { id: m };
      var id = String(m.id || m.name || m.model || '').replace(/^models\//, '');
      if (!id) return;
      var meta = {};
      meta.ctx = m.max_input_tokens || m.context_length || m.context_window || m.max_context_length || m.max_model_len || m.inputTokenLimit || (m.top_provider && m.top_provider.context_length) || 0;
      meta.maxOut = m.max_tokens || m.max_output_tokens || m.outputTokenLimit || (m.top_provider && m.top_provider.max_completion_tokens) || 0;
      if (m.architecture && m.architecture.input_modalities) meta.vision = m.architecture.input_modalities.indexOf('image') >= 0;
      if (Array.isArray(m.supported_parameters)) {
        meta.tools = m.supported_parameters.indexOf('tools') >= 0;
        meta.reasoning = m.supported_parameters.indexOf('reasoning') >= 0 || m.supported_parameters.indexOf('include_reasoning') >= 0;
      }
      if (m.capabilities && typeof m.capabilities === 'object' && !Array.isArray(m.capabilities)) {
        var c = m.capabilities;
        if (c.image_input && c.image_input.supported != null) meta.vision = !!c.image_input.supported;
        if (c.thinking && c.thinking.supported != null) meta.reasoning = !!c.thinking.supported;
      }
      out.push(modelEntry(id, meta, m.display_name || m.name));
    });
    if (!out.length && pre.fallback) return pre.fallback.map(function (id) { return modelEntry(id, {}); });
    out.sort(function (a, b) { return a.id.localeCompare(b.id); });
    // Sinerli: model SNR-1 tampil sebagai "Sinerli" saja.
    if (pre.id === 'sinerli') out.forEach(function (m) { if (/^(sinerli-)?snr-?1/i.test(m.id) || out.length === 1) m.name = 'Sinerli'; });
    return out;
  }

  function modelEntry(id, meta, name) {
    var e = { id: id, name: name && name !== id ? name : prettyName(id), chat: isChatModel(id) };
    Object.keys(meta || {}).forEach(function (k) { if (meta[k]) e[k] = meta[k]; else if (meta[k] === false) e[k] = false; });
    return e;
  }

  function prettyName(id) {
    var b = id.split('/').pop();
    return b.replace(/[-_]/g, ' ').replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); })
      .replace(/\bGpt\b/g, 'GPT').replace(/\bAi\b/g, 'AI').replace(/\bGlm\b/g, 'GLM').replace(/\bV(\d)/g, 'V$1');
  }

  // ---------------------------------------------------------------- model resolution

  function modelInfo(providerId, modelId) {
    var p = Store.provider(providerId);
    var m = p && (p.models || []).find(function (x) { return x.id === modelId; });
    var caps = inferCaps(modelId, m);
    var pref = Store.modelPref(providerId, modelId);
    if (pref.ctx) caps.ctx = pref.ctx;
    if (pref.maxOut) caps.maxOut = pref.maxOut;
    if (pref.vision != null) caps.vision = pref.vision;
    caps.toolMode = pref.toolMode || (caps.tools === false ? 'xml' : 'native');
    // Sinerli: server pass-through mengumumkan `tools` di supported_parameters → function calling
    // native seperti API biasa. Server lama (tanpa pengumuman itu) membuang `tools`, jadi pakai
    // protokol alat teks supaya create_file, generate_image, artifact, dll. tetap jalan.
    if (p && p.presetId === 'sinerli') {
      var nativeOk = !!(m && m.tools === true) && pref.toolMode !== 'xml';
      caps.toolMode = nativeOk ? 'native' : 'xml';
      caps.tools = true;
    }
    caps.temperature = pref.temperature;
    caps.name = (m && m.name) || prettyName(modelId);
    return caps;
  }

  function resolve(ref) {
    if (!ref) return null;
    var p = Store.provider(ref.providerId);
    if (!p || p.enabled === false) return null;
    return { provider: p, modelId: ref.modelId, info: modelInfo(p.id, ref.modelId) };
  }

  function allModels() {
    var out = [];
    Store.settings.providers.forEach(function (p) {
      if (p.enabled === false) return;
      (p.models || []).forEach(function (m) {
        if (m.chat === false && !p.showAll) return;
        out.push({ providerId: p.id, providerName: p.name, modelId: m.id, name: m.name || m.id, info: modelInfo(p.id, m.id) });
      });
    });
    return out;
  }

  // ---------------------------------------------------------------- errors

  function apiError(status, body, provider) {
    var detail = '';
    try {
      var j = JSON.parse(body);
      var e = j.error || j;
      detail = (typeof e === 'string' ? e : (e.message || e.msg || e.detail || JSON.stringify(e))) || '';
      if (Array.isArray(j) && j[0] && j[0].error) detail = j[0].error.message;
    } catch (x) { detail = String(body || '').slice(0, 600); }
    var name = provider ? provider.name : 'Provider';
    var friendly = {
      400: 'Permintaan ditolak', 401: 'API key tidak valid atau tidak punya akses', 402: 'Saldo / kredit API habis',
      403: 'Akses ditolak untuk API key ini', 404: 'Model atau endpoint tidak ditemukan (cek base URL & nama model)',
      408: 'Waktu habis', 413: 'Permintaan terlalu besar (konteks melebihi batas)', 422: 'Parameter tidak valid',
      429: 'Batas rate / kuota tercapai', 500: 'Server provider error', 502: 'Gateway provider error',
      503: 'Server provider sedang sibuk', 529: 'Server provider kelebihan beban',
    }[status] || ('HTTP ' + status);
    if (provider && /^sinerli/.test(provider.presetId)) {
      friendly = {
        401: 'API key Sinerli salah atau sudah dicabut. Buat key baru di AdminDashboard › ' + (isSinerliGw(provider) ? 'Racikan Model AI' : 'Penyedia & Model AI › API Key'),
        403: 'API key Sinerli tidak punya izin untuk permintaan ini (cek izin chat/models, pembatasan origin atau IP)',
        404: 'Alamat API Sinerli tidak ditemukan di server (' + (isSinerliGw(provider) ? '/gw/v1' : '/ai/v1') + '). Server Sinerli perlu .htaccess terbaru — key Anda sendiri tidak bermasalah',
        429: /bulan|month|kuota|quota/i.test(detail) ? 'Kuota bulanan API key Sinerli sudah habis' : 'Terlalu banyak permintaan ke Sinerli, tunggu sebentar lalu coba lagi',
      }[status] || (status >= 500 ? 'Server Sinerli sedang bermasalah (' + status + '), coba lagi beberapa saat lagi' : friendly);
    }
    var err = new Error(name + ': ' + friendly + (detail ? ' — ' + detail : ''));
    err.status = status;
    err.body = String(body || '');
    err.detail = detail;
    return err;
  }

  function keyTag(key) { return key ? '…' + String(key).slice(-4) : ''; }

  /* Retry-After (seconds or HTTP date), retry-after-ms, or the OpenAI-style
     x-ratelimit-reset-* durations ("1s", "6m0s", "120ms"). */
  function retryAfterMs(headers) {
    if (!headers) return 0;
    var get = function (name) {
      for (var k in headers) if (k.toLowerCase() === name) return String(headers[k]);
      return '';
    };
    var ms = parseFloat(get('retry-after-ms'));
    if (isFinite(ms) && ms > 0) return ms;
    var ra = get('retry-after');
    if (ra) {
      var sec = parseFloat(ra);
      if (isFinite(sec)) return sec * 1000;
      var t = Date.parse(ra);
      if (isFinite(t)) return Math.max(0, t - Date.now());
    }
    var reset = get('x-ratelimit-reset-requests') || get('x-ratelimit-reset-tokens');
    var m = /^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?(?:(\d+)ms)?$/.exec(reset.trim());
    if (reset && m) return ((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (parseFloat(m[3]) || 0)) * 1000 + (+m[4] || 0);
    return 0;
  }

  /* Errors tied to one API key: another key of the same provider may still work. */
  function keySwitchable(e) {
    if ([401, 402, 403, 429].indexOf(e.status) >= 0) return true;
    return /insufficient (balance|quota|credit)|quota exceeded|no credits|credit balance/i.test((e.detail || '') + ' ' + (e.body || ''));
  }

  function retryable(e) {
    if (e.network) return true;
    if (e.status === 429 && /Kuota bulanan|insufficient_quota|exceeded your current quota|quota exceeded|billing|credit balance|insufficient balance/i.test(e.message + ' ' + (e.body || ''))) return false;
    return [408, 409, 425, 429, 500, 502, 503, 504, 520, 522, 524, 529].indexOf(e.status) >= 0;
  }

  // ---------------------------------------------------------------- SSE & helpers

  function SSEParser(onEvent) {
    var buf = '', event = '', raw = '', sawData = false;
    function line(l) {
      if (l.slice(-1) === '\r') l = l.slice(0, -1);
      if (l === '') { event = ''; return; }
      if (l[0] === ':') return;
      var m = /^(data|event|id|retry):? ?(.*)$/.exec(l);
      if (!m) { if (!sawData) raw += l + '\n'; return; }
      if (m[1] === 'event') event = m[2];
      else if (m[1] === 'data') { sawData = true; onEvent(event, m[2]); }
    }
    return {
      push: function (chunk) {
        buf += chunk;
        var i;
        while ((i = buf.indexOf('\n')) >= 0) { var l = buf.slice(0, i); buf = buf.slice(i + 1); line(l); }
      },
      end: function () { if (buf) { line(buf); buf = ''; } },
      raw: function () { return raw; },
      sawData: function () { return sawData; },
    };
  }

  function partialSuffix(s, tag) {
    for (var k = Math.min(tag.length - 1, s.length); k > 0; k--) if (s.slice(-k) === tag.slice(0, k)) return k;
    return 0;
  }

  /* Splits <think>…</think> / <thinking>…</thinking> at the very start of a reply into reasoning. */
  function ThinkSplitter() {
    var state = 'start', pending = '', close = '';
    var OPEN = ['<think>', '<thinking>'];
    return {
      feed: function (s) {
        var out = [];
        pending += s;
        for (;;) {
          if (state === 'start') {
            var t = pending.replace(/^\s+/, '');
            if (!t) return out;
            var open = OPEN.find(function (o) { return t.indexOf(o) === 0; });
            if (open) { state = 'think'; close = open.replace('<', '</'); pending = t.slice(open.length); continue; }
            if (OPEN.some(function (o) { return o.indexOf(t) === 0; })) return out;
            state = 'text';
            continue;
          }
          if (state === 'think') {
            var idx = pending.indexOf(close);
            if (idx >= 0) {
              out.push({ kind: 'think', text: pending.slice(0, idx) });
              pending = pending.slice(idx + close.length).replace(/^\s+/, '');
              state = 'text';
              continue;
            }
            var keep = partialSuffix(pending, close);
            if (pending.length > keep) out.push({ kind: 'think', text: pending.slice(0, pending.length - keep) });
            pending = pending.slice(pending.length - keep);
            return out;
          }
          if (pending) out.push({ kind: 'text', text: pending });
          pending = '';
          return out;
        }
      },
      flush: function () {
        var out = [];
        if (pending) out.push({ kind: state === 'think' ? 'think' : 'text', text: pending });
        pending = '';
        return out;
      },
    };
  }

  // ---------------------------------------------------------------- XML tool protocol (fallback)

  function xmlToolPrompt(tools) {
    var lines = tools.map(function (t) {
      return '- ' + t.name + ': ' + t.description.split('\n')[0] + '\n  parameters (JSON Schema): ' + JSON.stringify(t.parameters);
    });
    return '\n\n# Tool calling protocol\nYou can call tools. To call a tool, output a block exactly like this (one block per call, you may output several in a row):\n' +
      '<tool_call>\n{"name": "tool_name", "arguments": {"param": "value"}}\n</tool_call>\n' +
      'The JSON must be valid. After your tool calls, STOP and wait: the results will be sent back to you inside <tool_response> blocks. ' +
      'Never invent tool results. When no tool is needed, answer normally without any <tool_call> block.\n' +
      'These tools really work: you CAN create files (PPTX, PDF, Word, Excel, images, video), images, skills, and act on the computer through them. Never say you cannot make a file or that you are only a text model — when the user wants something made, call the right tool in this same reply.\n\nAvailable tools:\n' + lines.join('\n');
  }

  function xmlCall(c) { return '\n<tool_call>\n' + JSON.stringify({ name: c.name, arguments: c.args || {} }) + '\n</tool_call>'; }
  function xmlResult(r) {
    return '<tool_response name="' + r.name + '"' + (r.isError ? ' error="true"' : '') + '>\n' + (r.content || '(tidak ada output)') + '\n</tool_response>';
  }

  /* XML mode still gets models that answer in their own DSML markup, so the
     leak markers are hidden here too. */
  function visibleXmlText(raw) {
    return visibleLeakText(raw);
  }

  /* Some models (DeepSeek-based ones in particular) sometimes ignore native
     tool calling and write their own call markup into the reply text: DSML
     (<｜DSML｜function_calls><｜DSML｜invoke name=…>), the older
     <｜tool▁calls▁begin｜> tokens, <function_calls><invoke …> or <tool_call>.
     These are hidden while streaming and turned into real tool calls. */
  var LEAK_RE = /<\s*[|｜]\s*DSML\s*[|｜]|<[|｜]tool[▁_ ]calls?[▁_ ]begin[|｜]>|<function_calls>|<invoke\s+name=|<tool_call[\s>]/;
  var LEAK_HEADS = ['<｜DSML｜', '<| DSML |', '<｜tool▁calls', '<function_calls>', '<invoke name=', '<tool_call'];
  function leakIndex(raw) {
    var m = LEAK_RE.exec(raw);
    return m ? m.index : -1;
  }
  function visibleLeakText(raw) {
    var i = leakIndex(raw);
    if (i >= 0) return raw.slice(0, i);
    var k = 0;
    LEAK_HEADS.forEach(function (h) { k = Math.max(k, partialSuffix(raw, h)); });
    return k ? raw.slice(0, raw.length - k) : raw;
  }
  function paramValue(v, isString) {
    v = String(v).replace(/^\n+|\n+$/g, '');
    if (isString) return v;
    var j = U.parseJSONLoose(v);
    return j === null || j === undefined ? v : j;
  }
  function parseLeakedCalls(raw) {
    var calls = [];
    // DSML / <invoke> style: normalise the "｜DSML｜" prefix away first.
    var t = raw.replace(/<(\/?)\s*[|｜]\s*DSML\s*[|｜]\s*/g, '<$1');
    var inv = /<invoke\s+name="([^"]+)"\s*>([\s\S]*?)(?:<\/invoke>|$)/g, m;
    while ((m = inv.exec(t))) {
      var args = {}, pm, pre = /<parameter\s+name="([^"]+)"(?:\s+string="(true|false)")?\s*>([\s\S]*?)(?:<\/parameter>|(?=<parameter\s)|$)/g;
      while ((pm = pre.exec(m[2]))) args[pm[1]] = paramValue(pm[3], pm[2] === 'true');
      var keys = Object.keys(args);
      // Models often wrap everything in one "arguments" object.
      if (keys.length === 1 && /^(arguments|args|input|parameters)$/.test(keys[0])) {
        var inner = args[keys[0]];
        if (typeof inner === 'string') inner = U.parseJSONLoose(inner);
        if (inner && typeof inner === 'object' && !Array.isArray(inner)) args = inner;
      }
      var call = { type: 'tool_call', id: U.uid('call_'), name: m[1], args: args };
      if (!/<\/invoke>$/.test(m[0])) call.unclosed = true;
      calls.push(call);
    }
    // Older DeepSeek tokens: <｜tool▁call▁begin｜>function<｜tool▁sep｜>name\n```json\n{…}\n```<｜tool▁call▁end｜>
    var old = /<[|｜]tool[▁_ ]call[▁_ ]begin[|｜]>(?:function)?<[|｜]tool[▁_ ]sep[|｜]>\s*([\w.-]+)\s*(?:```(?:json)?)?\s*([\s\S]*?)\s*(?:```)?\s*(?:<[|｜]tool[▁_ ]call[▁_ ]end[|｜]>|$)/g;
    while ((m = old.exec(raw))) {
      var a = U.parseJSONLoose(m[2]);
      calls.push({ type: 'tool_call', id: U.uid('call_'), name: m[1], args: a && typeof a === 'object' ? a : {} });
    }
    if (!calls.length) calls = parseXmlCalls(raw);
    return calls;
  }

  function parseXmlCalls(raw) {
    var calls = [];
    var re = /<tool_call(?:\s+name="([^"]+)")?\s*>([\s\S]*?)(?:<\/tool_call>|$)/g, m;
    while ((m = re.exec(raw))) {
      var body = (m[2] || '').trim();
      var obj = U.parseJSONLoose(body);
      if (!obj) continue;
      var name = m[1] || obj.name || obj.tool;
      var args = m[1] ? obj : (obj.arguments || obj.parameters || obj.args || {});
      if (typeof args === 'string') args = U.parseJSONLoose(args) || {};
      if (name) calls.push({ type: 'tool_call', id: U.uid('call_'), name: name, args: args });
    }
    return calls;
  }

  // ---------------------------------------------------------------- message conversion

  function fileText(b) {
    return '<file name="' + (b.name || 'file') + '">\n' + (b.text || '') + '\n</file>';
  }

  /* Ensures every tool call has a result (aborted runs can leave gaps). */
  function repairToolPairs(messages) {
    var out = [];
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      out.push(m);
      if (m.role !== 'assistant') continue;
      var calls = (m.content || []).filter(function (b) { return b.type === 'tool_call'; });
      if (!calls.length) continue;
      var next = messages[i + 1];
      var have = next && next.role === 'tool' ? next.results.map(function (r) { return r.id; }) : [];
      var missing = calls.filter(function (c) { return have.indexOf(c.id) < 0; });
      if (!missing.length) continue;
      var filler = missing.map(function (c) { return { id: c.id, name: c.name, content: 'Dibatalkan: alat ini tidak dijalankan.', isError: true }; });
      if (next && next.role === 'tool') {
        out.push({ role: 'tool', results: next.results.concat(filler) });
        i++;
      } else {
        out.push({ role: 'tool', results: filler });
      }
    }
    return out;
  }

  function toOpenAI(messages, o) {
    var out = [];
    if (o.system) out.push({ role: 'system', content: o.system });
    messages.forEach(function (m) {
      if (m.role === 'user') {
        var parts = [];
        (m.content || []).forEach(function (b) {
          if (b.type === 'text' && b.text) parts.push({ type: 'text', text: b.text });
          else if (b.type === 'file') parts.push({ type: 'text', text: fileText(b) });
          else if (b.type === 'image') {
            if (o.vision) parts.push({ type: 'image_url', image_url: { url: 'data:' + b.mime + ';base64,' + b.data } });
            else parts.push({ type: 'text', text: b.vision ? '[Gambar "' + (b.name || 'image') + '" — dianalisis oleh vision Sinai karena model ini tidak bisa melihat gambar]\n' + b.vision : '[Gambar terlampir "' + (b.name || 'image') + '" — model ini tidak bisa melihat gambar]' });
          }
        });
        if (!parts.length) return;
        var allText = parts.every(function (p) { return p.type === 'text'; });
        out.push({ role: 'user', content: allText ? parts.map(function (p) { return p.text; }).join('\n\n') : parts });
      } else if (m.role === 'assistant') {
        var text = '', thinking = '', calls = [];
        (m.content || []).forEach(function (b) {
          if (b.type === 'text') text += b.text || '';
          else if (b.type === 'thinking') thinking += b.text || '';
          else if (b.type === 'tool_call') calls.push(b);
        });
        if (!text && !calls.length) return;
        if (o.xml) { out.push({ role: 'assistant', content: text + calls.map(xmlCall).join('') }); return; }
        var msg = { role: 'assistant', content: text };
        if (calls.length) {
          msg.tool_calls = calls.map(function (c) {
            return { id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } };
          });
        }
        if (o.echoReasoning && thinking) msg.reasoning_content = thinking;
        out.push(msg);
      } else if (m.role === 'tool') {
        if (o.xml) out.push({ role: 'user', content: m.results.map(xmlResult).join('\n') });
        else m.results.forEach(function (r) { out.push({ role: 'tool', tool_call_id: r.id, content: r.content || '(tidak ada output)' }); });
        var imgs = [];
        m.results.forEach(function (r) { (r.images || []).forEach(function (im) { imgs.push(im); }); });
        if (imgs.length && o.vision) {
          out.push({ role: 'user', content: [{ type: 'text', text: '[Gambar dari hasil alat di atas]' }].concat(imgs.map(function (im) {
            return { type: 'image_url', image_url: { url: 'data:' + im.mime + ';base64,' + im.data } };
          })) });
        }
      }
    });
    return out;
  }

  function toAnthropic(messages, o) {
    var out = [];
    function push(role, blocks) {
      if (!blocks.length) return;
      var last = out[out.length - 1];
      if (last && last.role === role) last.content = last.content.concat(blocks);
      else out.push({ role: role, content: blocks });
    }
    messages.forEach(function (m) {
      if (m.role === 'user') {
        var blocks = [];
        (m.content || []).forEach(function (b) {
          if (b.type === 'text' && b.text) blocks.push({ type: 'text', text: b.text });
          else if (b.type === 'file') blocks.push({ type: 'text', text: fileText(b) });
          else if (b.type === 'image') {
            if (o.vision) blocks.push({ type: 'image', source: { type: 'base64', media_type: b.mime, data: b.data } });
            else blocks.push({ type: 'text', text: b.vision ? '[Gambar "' + (b.name || 'image') + '" — dianalisis oleh vision Sinai]\n' + b.vision : '[Gambar terlampir — model ini tidak bisa melihat gambar]' });
          }
        });
        push('user', blocks);
      } else if (m.role === 'assistant') {
        var keepThinking = o.keepThinking && m.model && m.model.modelId === o.modelId;
        var blocks2 = [];
        var text = '';
        (m.content || []).forEach(function (b) {
          if (b.type === 'thinking') {
            if (keepThinking && b.redacted) blocks2.push({ type: 'redacted_thinking', data: b.redacted });
            else if (keepThinking && b.signature) blocks2.push({ type: 'thinking', thinking: b.text || '', signature: b.signature });
          } else if (b.type === 'text' && b.text) {
            if (o.xml) text += b.text; else blocks2.push({ type: 'text', text: b.text });
          } else if (b.type === 'tool_call') {
            if (o.xml) text += xmlCall(b);
            else blocks2.push({ type: 'tool_use', id: b.id, name: b.name, input: b.args || {} });
          }
        });
        if (o.xml && text) blocks2.push({ type: 'text', text: text });
        if (!blocks2.some(function (b) { return b.type !== 'thinking' && b.type !== 'redacted_thinking'; })) return;
        push('assistant', blocks2);
      } else if (m.role === 'tool') {
        if (o.xml) push('user', [{ type: 'text', text: m.results.map(xmlResult).join('\n') }]);
        else push('user', m.results.map(function (r) {
          var content = r.content || '(tidak ada output)';
          if (r.images && r.images.length && o.vision) {
            content = [{ type: 'text', text: content }].concat(r.images.map(function (im) {
              return { type: 'image', source: { type: 'base64', media_type: im.mime, data: im.data } };
            }));
          }
          var b = { type: 'tool_result', tool_use_id: r.id, content: content };
          if (r.isError) b.is_error = true;
          return b;
        }));
      }
    });
    if (out.length && out[0].role !== 'user') out.unshift({ role: 'user', content: [{ type: 'text', text: '(lanjutkan)' }] });
    return out;
  }

  // ---------------------------------------------------------------- reasoning parameters

  function openaiReasoning(presetId, modelId, level, caps) {
    var id = String(modelId).toLowerCase().split('/').pop();
    var p = {};
    switch (presetId) {
      case 'deepseek':
        if (level === 'fast' || level === 'off') p.thinking = { type: 'disabled' };
        else { p.thinking = { type: 'enabled' }; p.reasoning_effort = level === 'max' ? 'max' : 'high'; }
        break;
      case 'openai':
        if (/^(o\d|gpt-5)/.test(id)) {
          p.reasoning_effort = { off: /^gpt-5/.test(id) ? 'minimal' : 'low', fast: 'low', balanced: 'medium', deep: 'high', max: 'high' }[level] || 'medium';
        }
        break;
      case 'openrouter':
        if (caps.reasoning && level !== 'off') p.reasoning = { effort: { fast: 'low', balanced: 'medium', deep: 'high', max: 'high' }[level] || 'medium' };
        break;
      case 'gemini':
        if (/gemini-(2\.5|3)/.test(id)) p.reasoning_effort = { off: 'low', fast: 'low', balanced: 'medium', deep: 'high', max: 'high' }[level] || 'medium';
        break;
      case 'xai':
        if (/grok-3-mini/.test(id)) p.reasoning_effort = level === 'fast' || level === 'off' ? 'low' : 'high';
        break;
      case 'groq':
      case 'cerebras':
      case 'together':
      case 'fireworks':
        if (/gpt-oss/.test(id)) p.reasoning_effort = { off: 'low', fast: 'low', balanced: 'medium', deep: 'high', max: 'high' }[level] || 'medium';
        break;
      case 'zai':
        if (/glm-(4\.[5-9]|5)/.test(id)) p.thinking = { type: level === 'fast' || level === 'off' ? 'disabled' : 'enabled' };
        break;
      case 'qwen':
        if (/qwen3|qwq|qwen-plus|qwen-max|qwen-flash/.test(id)) p.enable_thinking = !(level === 'fast' || level === 'off');
        break;
    }
    return p;
  }

  function anthropicReasoning(modelId, level) {
    var id = String(modelId).toLowerCase();
    if (/claude-(fable|mythos|opus-5|sonnet-5|haiku-5|opus-4-[6-9]|sonnet-4-[6-9])/.test(id)) {
      var effort = { off: 'low', fast: 'low', balanced: 'high', deep: 'xhigh', max: 'max' }[level] || 'high';
      if (effort === 'xhigh' && /4-6/.test(id)) effort = 'high';
      return { thinking: { type: 'adaptive', display: 'summarized' }, output_config: { effort: effort }, sampling: false };
    }
    if (/claude-(3-7|sonnet-4|opus-4|haiku-4)/.test(id) && (level === 'deep' || level === 'max' || level === 'balanced')) {
      var budget = level === 'max' ? 32000 : level === 'deep' ? 16000 : 6000;
      return { thinking: { type: 'enabled', budget_tokens: budget }, sampling: false, minMax: budget + 16000 };
    }
    return { sampling: true };
  }

  var OPTIONAL_PARAMS = ['reasoning_effort', 'thinking', 'reasoning', 'enable_thinking', 'stream_options', 'temperature',
    'max_tokens', 'max_completion_tokens', 'parallel_tool_calls', 'output_config', 'fallbacks', 'cache_control', 'eager_input_streaming'];

  // ---------------------------------------------------------------- single request

  async function requestOnce(req, st) {
    var provider = req.provider;
    var pre = preset(provider.presetId);
    var keys = await Store.getKeys(provider.id);
    if (st.keyIdx == null) st.keyIdx = (Store.keyCursor[provider.id] || 0) % Math.max(1, keys.length);
    var key = keys.length ? keys[st.keyIdx % keys.length] : null;
    st.keyCount = keys.length;
    st.keyTag = keyTag(key);
    if (!key && !pre.noKey && !provider.noKey) throw new Error('API key untuk ' + provider.name + ' belum diatur. Buka Pengaturan → Provider.');
    var caps = req.info;
    var xml = st.xml && req.tools && req.tools.length;
    var system = req.system || '';
    if (xml) system += xmlToolPrompt(req.tools);
    var msgs = repairToolPairs(req.messages);
    var blocks = req.blocks;
    blocks.length = 0;
    var official = provider.kind === 'anthropic' && /api\.anthropic\.com/.test(provider.baseUrl);

    var url, body, headers = Object.assign({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }, authHeaders(provider, key));
    if (provider.kind === 'anthropic') {
      url = anthropicRoot(provider) + '/messages';
      var r = anthropicReasoning(req.modelId, req.level);
      if (st.noThinking) r = { sampling: true };
      body = {
        model: req.modelId,
        max_tokens: Math.max(req.maxTokens || caps.maxOut && Math.min(caps.maxOut, 64000) || 32000, r.minMax || 0),
        system: system,
        messages: toAnthropic(msgs, { vision: caps.vision, keepThinking: !st.noThinking, modelId: req.modelId, xml: xml }),
        stream: true,
      };
      if (r.thinking) body.thinking = r.thinking;
      if (r.output_config) body.output_config = r.output_config;
      if (r.sampling && req.temperature != null) body.temperature = req.temperature;
      if (req.tools && req.tools.length && !xml) {
        body.tools = req.tools.map(function (t) {
          var d = { name: t.name, description: t.description, input_schema: t.parameters };
          if (official) d.eager_input_streaming = true;
          return d;
        });
      }
      if (!official && !st.strip.has('cache_control')) {
        // Anthropic-compatible proxies get explicit breakpoints (system, tools, last turn):
        // without them every agent step re-bills the whole prompt at full price.
        var cc = { type: 'ephemeral' };
        if (system) body.system = [{ type: 'text', text: system, cache_control: cc }];
        if (body.tools && body.tools.length) body.tools[body.tools.length - 1].cache_control = cc;
        var lm = body.messages[body.messages.length - 1];
        if (lm && Array.isArray(lm.content) && lm.content.length) {
          var lb = lm.content[lm.content.length - 1];
          if (lb && lb.type !== 'thinking' && lb.type !== 'redacted_thinking') lm.content[lm.content.length - 1] = Object.assign({}, lb, { cache_control: cc });
        } else if (lm && typeof lm.content === 'string' && lm.content) lm.content = [{ type: 'text', text: lm.content, cache_control: cc }];
      }
      if (official) {
        body.cache_control = { type: 'ephemeral' };
        if (/claude-(fable-5-1|opus-5|sonnet-5-5)/.test(req.modelId)) {
          body.fallbacks = 'default';
          headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
        }
      }
    } else {
      url = baseUrl(provider) + '/chat/completions';
      body = {
        model: req.modelId,
        messages: toOpenAI(msgs, { system: system, vision: caps.vision, xml: xml, echoReasoning: pre.echoReasoning && !st.noEcho }),
        stream: true,
        stream_options: { include_usage: true },
      };
      Object.assign(body, openaiReasoning(provider.presetId, req.modelId, req.level, caps));
      var maxT = req.maxTokens || (caps.maxOut && provider.presetId === 'deepseek' ? Math.min(caps.maxOut, 65536) : 0) || Store.modelPref(provider.id, req.modelId).maxOut;
      if (maxT) {
        if (provider.presetId === 'openai') body.max_completion_tokens = maxT; else body.max_tokens = maxT;
      }
      if (req.temperature != null) body.temperature = req.temperature;
      if (req.tools && req.tools.length && !xml) {
        body.tools = req.tools.map(function (t) { return { type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }; });
      }
    }
    st.strip.forEach(function (k) {
      delete body[k];
      if (body.tools) body.tools.forEach(function (t) { delete t[k]; });
      if (k === 'fallbacks') delete headers['anthropic-beta'];
    });

    // ---- stream
    var usage = { input: 0, output: 0, cacheRead: 0 };
    var stopReason = '';
    var update = req.onUpdate || function () {};
    var textBlock = null, thinkBlock = null;
    var splitter = provider.kind === 'anthropic' ? null : ThinkSplitter();
    var oaCalls = [];
    var anBlocks = {};

    function addThinking(t) {
      if (!t) return;
      if (!thinkBlock) { thinkBlock = { type: 'thinking', text: '', startedAt: Date.now() }; blocks.splice(textBlock ? blocks.indexOf(textBlock) : blocks.length, 0, thinkBlock); }
      thinkBlock.text += t;
    }
    function addText(t) {
      if (!t) return;
      if (thinkBlock && !thinkBlock.endedAt) thinkBlock.endedAt = Date.now();
      if (!textBlock) { textBlock = { type: 'text', text: '' }; blocks.push(textBlock); }
      textBlock.raw = (textBlock.raw || '') + t;
      textBlock.text = xml ? visibleXmlText(textBlock.raw) : visibleLeakText(textBlock.raw);
    }

    function onOpenAI(data) {
      if (data === '[DONE]') return;
      var j;
      try { j = JSON.parse(data); } catch (e) { return; }
      if (j.error) { var er = apiError(j.error.code || 400, JSON.stringify(j), provider); er.status = typeof j.error.code === 'number' ? j.error.code : 400; throw er; }
      if (j.usage) {
        usage.input = j.usage.prompt_tokens || j.usage.input_tokens || usage.input;
        usage.output = j.usage.completion_tokens || j.usage.output_tokens || usage.output;
        usage.cacheRead = j.usage.prompt_cache_hit_tokens || (j.usage.prompt_tokens_details && j.usage.prompt_tokens_details.cached_tokens) || usage.cacheRead;
      }
      var ch = j.choices && j.choices[0];
      if (!ch) return;
      var d = ch.delta || ch.message || {};
      var reasoning = d.reasoning_content || (typeof d.reasoning === 'string' ? d.reasoning : '') || d.thinking || '';
      if (reasoning) addThinking(reasoning);
      if (typeof d.content === 'string' && d.content) {
        splitter.feed(d.content).forEach(function (part) { if (part.kind === 'think') addThinking(part.text); else addText(part.text); });
      }
      if (d.tool_calls) {
        d.tool_calls.forEach(function (tc, n) {
          var idx = tc.index != null ? tc.index : n;
          var slot = oaCalls[idx];
          if (!slot) {
            slot = oaCalls[idx] = { type: 'tool_call', id: '', name: '', argsText: '', streaming: true };
            blocks.push(slot);
          }
          if (tc.id) slot.id = tc.id;
          if (tc.function) {
            if (tc.function.name && !slot.name) slot.name = tc.function.name;
            if (tc.function.arguments) slot.argsText += typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments);
          }
        });
      }
      if (ch.finish_reason) stopReason = ch.finish_reason;
    }

    function onAnthropic(evName, data) {
      var j;
      try { j = JSON.parse(data); } catch (e) { return; }
      switch (j.type) {
        case 'message_start':
          if (j.message && j.message.usage) {
            usage.input = (j.message.usage.input_tokens || 0) + (j.message.usage.cache_read_input_tokens || 0) + (j.message.usage.cache_creation_input_tokens || 0);
            usage.cacheRead = j.message.usage.cache_read_input_tokens || 0;
          }
          break;
        case 'content_block_start': {
          var cb = j.content_block || {};
          var b;
          if (cb.type === 'text') { b = { type: 'text', text: cb.text || '' }; b.raw = b.text; textBlock = b; }
          else if (cb.type === 'thinking') { b = { type: 'thinking', text: cb.thinking || '', startedAt: Date.now() }; thinkBlock = b; }
          else if (cb.type === 'redacted_thinking') b = { type: 'thinking', text: '', redacted: cb.data };
          else if (cb.type === 'tool_use') b = { type: 'tool_call', id: cb.id, name: cb.name, argsText: '', streaming: true };
          else break;
          anBlocks[j.index] = b;
          blocks.push(b);
          break;
        }
        case 'content_block_delta': {
          var bb = anBlocks[j.index], dl = j.delta || {};
          if (!bb) break;
          if (dl.type === 'text_delta') {
            bb.raw = (bb.raw || '') + dl.text; bb.text = xml ? visibleXmlText(bb.raw) : visibleLeakText(bb.raw);
          } else if (dl.type === 'thinking_delta') bb.text += dl.thinking;
          else if (dl.type === 'signature_delta') bb.signature = (bb.signature || '') + dl.signature;
          else if (dl.type === 'input_json_delta') bb.argsText += dl.partial_json || '';
          break;
        }
        case 'content_block_stop':
          if (anBlocks[j.index] && anBlocks[j.index].type === 'thinking') anBlocks[j.index].endedAt = Date.now();
          break;
        case 'message_delta':
          if (j.delta && j.delta.stop_reason) stopReason = j.delta.stop_reason;
          if (j.usage) usage.output = j.usage.output_tokens || usage.output;
          break;
        case 'error': {
          var e2 = apiError(j.error && j.error.type === 'overloaded_error' ? 529 : 500, JSON.stringify(j), provider);
          throw e2;
        }
      }
    }

    var pendingErr = null;
    var parser = SSEParser(function (ev, data) {
      if (pendingErr) return;
      try {
        if (provider.kind === 'anthropic') onAnthropic(ev, data); else onOpenAI(data);
      } catch (e) { pendingErr = e; handle.abort(); return; }
      scheduleUpdate();
    });

    var scheduled = false;
    function scheduleUpdate() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () { scheduled = false; update(blocks); });
    }

    var handle = Native.stream({ url: url, method: 'POST', headers: headers, body: JSON.stringify(body) }, function (chunk) { parser.push(chunk); });
    var abortHandler = function () { handle.abort(); };
    if (req.signal) {
      if (req.signal.aborted) handle.abort();
      req.signal.addEventListener('abort', abortHandler);
    }
    var res;
    try {
      res = await handle.promise;
    } finally {
      if (req.signal) req.signal.removeEventListener('abort', abortHandler);
    }
    if (pendingErr) throw pendingErr;
    if (window.Health && res.headers) Health.captureHeaders(provider.id, req.modelId, res.headers);
    if (res.status >= 400) {
      var httpErr = apiError(res.status, res.body, provider);
      httpErr.retryAfter = retryAfterMs(res.headers);
      throw httpErr;
    }
    parser.end();
    if (pendingErr) throw pendingErr;

    // Non-streaming JSON fallback (some servers ignore stream:true)
    if (!parser.sawData() && parser.raw().trim()) {
      var full = U.parseJSONLoose(parser.raw());
      if (full && full.error) throw apiError(400, parser.raw(), provider);
      if (full && full.choices) onOpenAI(JSON.stringify(full));
      else if (full && full.content && provider.kind === 'anthropic') {
        full.content.forEach(function (c, i) {
          onAnthropic('', JSON.stringify({ type: 'content_block_start', index: i, content_block: c }));
          if (c.type === 'tool_use') anBlocks[i].argsText = JSON.stringify(c.input || {});
        });
        stopReason = full.stop_reason;
      }
    }
    if (splitter) splitter.flush().forEach(function (part) { if (part.kind === 'think') addThinking(part.text); else addText(part.text); });
    if (thinkBlock && !thinkBlock.endedAt) thinkBlock.endedAt = Date.now();

    // finalize tool calls
    for (var i = blocks.length - 1; i >= 0; i--) {
      var bl = blocks[i];
      if (bl.type === 'tool_call' && bl.streaming) {
        var args = U.parseJSONLoose(bl.argsText || '{}');
        bl.args = args && typeof args === 'object' ? args : {};
        if (args == null) bl.invalidArgs = bl.argsText;
        if (!bl.id) bl.id = U.uid('call_');
        delete bl.streaming;
        delete bl.argsText;
        if (!bl.name) blocks.splice(i, 1);
      }
    }
    var cutOff = stopReason === 'length' || stopReason === 'max_tokens';
    function addLeaked(c) {
      // A call the output limit cut in half: its arguments are incomplete.
      if (c.unclosed && cutOff) c.invalidArgs = '';
      delete c.unclosed;
      blocks.push(c);
    }
    blocks.slice().forEach(function (b2) {
      if (b2.type !== 'text' || b2.raw == null) return;
      if (xml) {
        var calls = parseXmlCalls(b2.raw);
        if (!calls.length && leakIndex(b2.raw) >= 0) calls = parseLeakedCalls(b2.raw);
        b2.text = visibleXmlText(b2.raw).trim();
        calls.forEach(addLeaked);
      } else if (leakIndex(b2.raw) >= 0) {
        // Native mode, but the model wrote its tool call as text.
        var leaked = parseLeakedCalls(b2.raw);
        if (leaked.length) {
          b2.text = visibleLeakText(b2.raw).trim();
          leaked.forEach(addLeaked);
          if (!stopReason || stopReason === 'stop' || stopReason === 'end_turn') stopReason = provider.kind === 'anthropic' ? 'tool_use' : 'tool_calls';
        } else b2.text = b2.raw;   // just prose that mentions the markup
      }
      delete b2.raw;
    });
    for (var k2 = blocks.length - 1; k2 >= 0; k2--) {
      if (blocks[k2].type === 'text' && !blocks[k2].text) blocks.splice(k2, 1);
      else if (blocks[k2].type === 'thinking' && !blocks[k2].text && !blocks[k2].signature && !blocks[k2].redacted) blocks.splice(k2, 1);
    }
    update(blocks);
    if (res.aborted && !(req.signal && req.signal.aborted)) throw Object.assign(new Error('Koneksi terputus'), { network: true });
    return { content: blocks, usage: usage, stopReason: stopReason, aborted: !!(req.signal && req.signal.aborted) };
  }

  /* chat(req) with graceful degradation: unsupported parameters are dropped,
     native tool calling falls back to the XML protocol, transient errors retry. */
  var MAX_ATTEMPTS = 6;
  async function chat(req) {
    var learned = Store.modelPref(req.provider.id, req.modelId);
    var st = { strip: new Set(learned.strip || []), xml: req.info.toolMode === 'xml', noEcho: !!learned.noEcho, noThinking: !!learned.noThinking };
    var attempt = 0, degrade = 0;
    for (;;) {
      try {
        var out = await requestOnce(req, st);
        out.toolMode = st.xml ? 'xml' : 'native';
        if (window.Health && !out.aborted) Health.reportSuccess(req.provider.id, req.modelId, out.usage, st.keyTag);
        if (st.keyCount > 1) Store.keyCursor[req.provider.id] = st.keyIdx;
        out.keyTag = st.keyTag;
        return out;
      } catch (e) {
        if (req.signal && req.signal.aborted) {
          return { content: req.blocks, usage: { input: 0, output: 0 }, stopReason: 'aborted', aborted: true };
        }
        var msg = ((e.detail || '') + ' ' + (e.body || '') + ' ' + e.message).toLowerCase();
        if ((e.status === 400 || e.status === 422 || e.status === 404 && /param|argument|field/.test(msg)) && degrade < 5) {
          var changed = false;
          if (/max_tokens|max_completion_tokens/.test(msg) && /(too large|exceed|maximum|must be less|range|invalid)/.test(msg) && !req._maxReduced) {
            req.maxTokens = 8192; req._maxReduced = true; changed = true;
          }
          OPTIONAL_PARAMS.forEach(function (p) {
            if (!changed && !st.strip.has(p) && msg.indexOf(p) >= 0 && p !== 'max_tokens') { st.strip.add(p); changed = true; }
          });
          if (!changed && /reasoning_content/.test(msg) && !st.noEcho) { st.noEcho = true; changed = true; }
          if (!changed && /(thinking|signature)/.test(msg) && !st.noThinking) { st.noThinking = true; changed = true; }
          if (!changed && !st.xml && req.tools && req.tools.length && /(tool|function)/.test(msg)) {
            st.xml = true; changed = true;
            Store.setModelPref(req.provider.id, req.modelId, { toolMode: 'xml' });
          }
          if (!changed && degrade === 0) {
            ['reasoning_effort', 'thinking', 'reasoning', 'enable_thinking', 'stream_options', 'parallel_tool_calls', 'output_config', 'fallbacks', 'eager_input_streaming', 'cache_control']
              .forEach(function (p) { st.strip.add(p); });
            changed = true; var blanket = true;
          }
          if (changed) {
            degrade++;
            // Remember what this model refuses, so later requests start with the fix.
            if (!blanket) try { Store.setModelPref(req.provider.id, req.modelId, { strip: Array.from(st.strip), noThinking: !!st.noThinking || undefined, noEcho: !!st.noEcho || undefined }); } catch (x) { /* ignore */ }
            if (req.onRetry) req.onRetry('Menyesuaikan parameter untuk model ini…');
            continue;
          }
        }
        // Key Sinerli otomatis dicabut/diganti di server: minta key baru lewat akun lalu ulangi sekali.
        if (e.status === 401 && req.provider.autoSinerli && !req._sinerliRenewed && window.Sinerli) {
          req._sinerliRenewed = true;
          try {
            if (req.onRetry) req.onRetry('Menyegarkan key Sinerli untuk perangkat ini…');
            await Sinerli.connectAI();
            req.provider = Store.provider(req.provider.id) || req.provider;
            st.keyIdx = null;
            continue;
          } catch (x) { /* belum masuk / offline → laporkan error aslinya */ }
        }
        if (window.Health && st.keyTag) Health.reportKey(req.provider.id, st.keyTag, e);
        // Several keys for this provider: move on to the next one right away.
        if (st.keyCount > 1 && keySwitchable(e) && (st.keysTried || 0) < st.keyCount - 1) {
          var fromTag = st.keyTag;
          st.keysTried = (st.keysTried || 0) + 1;
          st.keyIdx = (st.keyIdx + 1) % st.keyCount;
          Store.keyCursor[req.provider.id] = st.keyIdx;
          if (req.onRetry) req.onRetry('API key ' + fromTag + ' kena batas — beralih ke key cadangan…');
          continue;
        }
        if (retryable(e) && attempt < MAX_ATTEMPTS) {
          attempt++;
          var wait = e.retryAfter ? Math.min(90000, e.retryAfter + 250) : Math.min(45000, 2000 * Math.pow(2, attempt - 1)) + Math.random() * 600;
          if (req.onRetry) req.onRetry((e.status === 429 ? 'Batas rate tercapai' : 'Koneksi/server bermasalah') + ' — mencoba lagi dalam ' + Math.ceil(wait / 1000) + ' dtk (' + attempt + '/' + MAX_ATTEMPTS + ')…');
          await U.sleep(wait);
          if (req.signal && req.signal.aborted) return { content: req.blocks, usage: { input: 0, output: 0 }, stopReason: 'aborted', aborted: true };
          continue;
        }
        if (window.Health) Health.reportFailure(req.provider.id, req.modelId, e);
        throw e;
      }
    }
  }

  /* Simple non-tool completion that returns plain text (titles, critiques, summaries). */
  async function complete(ref, system, messages, opts) {
    opts = opts || {};
    var r = typeof ref.provider === 'object' ? ref : resolve(ref);
    if (!r) throw new Error('Model tidak tersedia');
    var blocks = [];
    var out = await chat({
      provider: r.provider, modelId: r.modelId, info: r.info, system: system, messages: messages,
      level: opts.level || 'off', maxTokens: opts.maxTokens, temperature: opts.temperature, signal: opts.signal,
      blocks: blocks, onUpdate: opts.onUpdate, onRetry: opts.onRetry,
    });
    var text = out.content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
    var thinking = out.content.filter(function (b) { return b.type === 'thinking'; }).map(function (b) { return b.text; }).join('');
    return { text: text, thinking: thinking, usage: out.usage, aborted: out.aborted };
  }

  window.Providers = {
    PRESETS: PRESETS, preset: preset, detectPreset: detectPreset, sinerliUrl: sinerliUrl, isSinerliGw: isSinerliGw, isSinerliGwKey: isSinerliGwKey, listModels: listModels, inferCaps: inferCaps,
    modelInfo: modelInfo, resolve: resolve, allModels: allModels, chat: chat, complete: complete, prettyName: prettyName,
    isChatModel: isChatModel, authHeaders: authHeaders, baseUrl: baseUrl, anthropicRoot: anthropicRoot, apiError: apiError, keyTag: keyTag, retryable: retryable, parseLeakedCalls: parseLeakedCalls, _test: { SSEParser: SSEParser, ThinkSplitter: ThinkSplitter, parseXmlCalls: parseXmlCalls, parseLeakedCalls: parseLeakedCalls, visibleLeakText: visibleLeakText, toOpenAI: toOpenAI, toAnthropic: toAnthropic, repairToolPairs: repairToolPairs },
  };
})();
