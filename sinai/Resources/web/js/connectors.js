/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Connector directory: ready-made, pre-configured connections to apps and
   web services. One click signs in (OAuth in the browser) or asks only for
   the one value a service needs (a token, a folder, a database URL); the
   result is a regular MCP / REST connector the AI can use to read, create,
   update and delete data. Every connector stays customisable afterwards. */
(function () {
  'use strict';

  var h = U.h;

  /* kind: oauth (browser sign-in) · open (no account needed) · token / fields (one value) ·
     local (runs a small program on this computer) · rest (any HTTP API) · builtin (Sinai itself) */
  var CATALOG = [
    // ---- Productivity & work
    { id: 'notion', domain: 'notion.so', name: 'Notion', cat: 'Produktivitas', color: '#111111', glyph: 'N', kind: 'oauth', type: 'http', url: 'https://mcp.notion.com/mcp', sseUrl: 'https://mcp.notion.com/sse',
      desc: 'Cari, baca, buat & perbarui halaman, database dan komentar Notion.' },
    { id: 'linear', domain: 'linear.app', name: 'Linear', cat: 'Produktivitas', color: '#5E6AD2', glyph: 'L', kind: 'oauth', type: 'http', url: 'https://mcp.linear.app/mcp', sseUrl: 'https://mcp.linear.app/sse',
      desc: 'Kelola issue, proyek, siklus dan komentar di Linear.' },
    { id: 'atlassian', domain: 'atlassian.com', name: 'Jira & Confluence', cat: 'Produktivitas', color: '#0C66E4', glyph: 'A', kind: 'oauth', type: 'http', url: 'https://mcp.atlassian.com/v1/mcp', sseUrl: 'https://mcp.atlassian.com/v1/sse',
      desc: 'Buat & update tiket Jira, cari dan tulis halaman Confluence (Atlassian Cloud).' },
    { id: 'asana', domain: 'asana.com', name: 'Asana', cat: 'Produktivitas', color: '#F06A6A', glyph: 'A', kind: 'oauth', type: 'sse', url: 'https://mcp.asana.com/sse',
      desc: 'Tugas, proyek, portofolio & komentar Asana.' },
    { id: 'monday', domain: 'monday.com', name: 'monday.com', cat: 'Produktivitas', color: '#FF3D57', glyph: 'm', kind: 'oauth', type: 'sse', url: 'https://mcp.monday.com/sse',
      desc: 'Board, item, kolom dan update di monday.com.' },
    { id: 'miro', domain: 'miro.com', name: 'Miro', cat: 'Produktivitas', color: '#FFD02F', fg: '#050038', glyph: 'M', kind: 'oauth', type: 'http', url: 'https://mcp.miro.com/',
      desc: 'Baca & buat sticky note, diagram, dan konten board Miro.' },
    { id: 'intercom', domain: 'intercom.com', name: 'Intercom', cat: 'Produktivitas', color: '#1F8DED', glyph: 'I', kind: 'oauth', type: 'http', url: 'https://mcp.intercom.com/mcp', sseUrl: 'https://mcp.intercom.com/sse',
      desc: 'Cari percakapan, kontak & tiket pelanggan di Intercom.' },
    { id: 'zapier', domain: 'zapier.com', name: 'Zapier (8.000+ aplikasi)', cat: 'Produktivitas', color: '#FF4F00', glyph: 'Z', kind: 'fields', type: 'http', url: '{{url}}',
      fields: [{ key: 'url', label: 'URL server MCP Zapier Anda', type: 'password', placeholder: 'https://mcp.zapier.com/api/mcp/s/…/mcp', help: 'Buat di mcp.zapier.com → pilih aplikasi & aksi (Gmail, Google Sheets, Slack, WhatsApp, Trello…) → salin URL.', link: 'https://mcp.zapier.com' }],
      desc: 'Hubungkan Gmail, Google Sheets/Drive/Calendar, Slack, HubSpot, Trello dan ribuan aplikasi lain lewat Zapier.' },
    { id: 'gworkspace', domain: 'google.com', name: 'Google Workspace', cat: 'Produktivitas', color: '#4285F4', glyph: 'G', kind: 'fields', type: 'stdio', command: 'uvx', args: ['workspace-mcp', '--tool-tier', 'core'],
      env: { GOOGLE_OAUTH_CLIENT_ID: '{{clientId}}', GOOGLE_OAUTH_CLIENT_SECRET: '{{clientSecret}}', OAUTHLIB_INSECURE_TRANSPORT: '1' }, needs: 'uv',
      fields: [{ key: 'clientId', label: 'OAuth Client ID (Desktop app)', type: 'text', placeholder: '…apps.googleusercontent.com', link: 'https://console.cloud.google.com/apis/credentials', help: 'Google Cloud Console → Credentials → Create OAuth client ID → Desktop app. Login Google dibuka otomatis saat pertama dipakai.' },
        { key: 'clientSecret', label: 'Client secret', type: 'password' }],
      desc: 'Gmail, Drive, Calendar, Docs, Sheets, Slides & Forms — baca, buat, edit dan kirim.' },
    { id: 'slack', domain: 'slack.com', name: 'Slack', cat: 'Komunikasi', color: '#4A154B', glyph: 'S', kind: 'fields', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'],
      env: { SLACK_BOT_TOKEN: '{{token}}', SLACK_TEAM_ID: '{{team}}' }, needs: 'node',
      fields: [{ key: 'token', label: 'Bot token', type: 'password', placeholder: 'xoxb-…', link: 'https://api.slack.com/apps', help: 'Buat Slack app → OAuth & Permissions → scope channels:history, chat:write, users:read → install → salin Bot token.' },
        { key: 'team', label: 'Team / workspace ID', type: 'text', placeholder: 'T0123ABCD' }],
      desc: 'Baca channel, kirim & balas pesan, reaksi, daftar pengguna Slack.' },
    { id: 'telegram', domain: 'telegram.org', name: 'Telegram Bot', cat: 'Komunikasi', color: '#229ED9', glyph: 'T', kind: 'fields', type: 'rest', baseUrl: 'https://api.telegram.org/bot{{token}}',
      docs: 'Telegram Bot API: POST /sendMessage {chat_id, text}, GET /getUpdates, POST /sendPhoto, POST /editMessageText, POST /deleteMessage.',
      fields: [{ key: 'token', label: 'Bot token dari @BotFather', type: 'password', placeholder: '123456:ABC-…', link: 'https://t.me/BotFather' }],
      desc: 'Kirim, edit & hapus pesan, baca update lewat bot Telegram Anda.' },
    { id: 'whatsapp', domain: 'whatsapp.com', name: 'WhatsApp Business (Cloud API)', cat: 'Komunikasi', color: '#25D366', glyph: 'W', kind: 'fields', type: 'rest', baseUrl: 'https://graph.facebook.com/v21.0/{{phoneId}}', headers: { Authorization: 'Bearer {{token}}' },
      docs: 'POST /messages {messaging_product:"whatsapp", to, type:"text", text:{body}} to send; template messages need approved templates.',
      fields: [{ key: 'phoneId', label: 'Phone number ID', type: 'text', link: 'https://developers.facebook.com/apps' }, { key: 'token', label: 'Access token', type: 'password' }],
      desc: 'Kirim pesan & template WhatsApp lewat Meta Cloud API.' },

    // ---- Developer
    { id: 'github', domain: 'github.com', name: 'GitHub', cat: 'Developer', color: '#24292F', glyph: 'GH', kind: 'fields', type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer {{token}}' },
      fields: [{ key: 'token', label: 'Personal access token', type: 'password', placeholder: 'github_pat_… / ghp_…', link: 'https://github.com/settings/personal-access-tokens/new', help: 'Beri akses repo yang diperlukan (Contents, Issues, Pull requests: Read & write).' }],
      desc: 'Repo, file, issue, pull request, review, Actions & rilis — baca dan tulis.' },
    { id: 'gitlab', domain: 'gitlab.com', name: 'GitLab', cat: 'Developer', color: '#FC6D26', glyph: 'GL', kind: 'fields', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-gitlab'],
      env: { GITLAB_PERSONAL_ACCESS_TOKEN: '{{token}}', GITLAB_API_URL: '{{api}}' }, needs: 'node',
      fields: [{ key: 'token', label: 'Personal access token', type: 'password', link: 'https://gitlab.com/-/user_settings/personal_access_tokens' }, { key: 'api', label: 'API URL (opsional)', type: 'text', placeholder: 'https://gitlab.com/api/v4' }],
      desc: 'Proyek, file, issue & merge request GitLab.' },
    { id: 'sentry', domain: 'sentry.io', name: 'Sentry', cat: 'Developer', color: '#362D59', glyph: 'S', kind: 'oauth', type: 'http', url: 'https://mcp.sentry.dev/mcp',
      desc: 'Telusuri error, issue, rilis dan performa aplikasi.' },
    { id: 'supabase', domain: 'supabase.com', name: 'Supabase', cat: 'Developer', color: '#3ECF8E', fg: '#0b2b1c', glyph: 'S', kind: 'oauth', type: 'http', url: 'https://mcp.supabase.com/mcp',
      desc: 'Kelola proyek, tabel, SQL, migrasi, edge functions & log Supabase.' },
    { id: 'neon', domain: 'neon.tech', name: 'Neon Postgres', cat: 'Developer', color: '#00E599', fg: '#00261a', glyph: 'N', kind: 'oauth', type: 'http', url: 'https://mcp.neon.tech/mcp', sseUrl: 'https://mcp.neon.tech/sse',
      desc: 'Buat database, branch, jalankan SQL & migrasi di Neon.' },
    { id: 'vercel', domain: 'vercel.com', name: 'Vercel', cat: 'Developer', color: '#000000', glyph: '▲', kind: 'oauth', type: 'http', url: 'https://mcp.vercel.com',
      desc: 'Proyek, deployment, log & domain Vercel.' },
    { id: 'netlify', domain: 'netlify.com', name: 'Netlify', cat: 'Developer', color: '#05BDBA', glyph: 'N', kind: 'oauth', type: 'http', url: 'https://netlify-mcp.netlify.app/mcp',
      desc: 'Buat situs, deploy, kelola env & form Netlify.' },
    { id: 'cloudflare', domain: 'cloudflare.com', name: 'Cloudflare Docs', cat: 'Developer', color: '#F38020', glyph: 'CF', kind: 'open', type: 'http', url: 'https://docs.mcp.cloudflare.com/mcp',
      desc: 'Dokumentasi Cloudflare terbaru (Workers, R2, D1, Pages…).' },
    { id: 'context7', domain: 'context7.com', name: 'Context7 Docs', cat: 'Developer', color: '#0F766E', glyph: 'C7', kind: 'open', type: 'http', url: 'https://mcp.context7.com/mcp',
      desc: 'Dokumentasi library & framework versi terbaru untuk coding yang akurat.' },
    { id: 'deepwiki', domain: 'deepwiki.com', name: 'DeepWiki', cat: 'Developer', color: '#2563EB', glyph: 'DW', kind: 'open', type: 'http', url: 'https://mcp.deepwiki.com/mcp',
      desc: 'Tanya jawab tentang repository GitHub publik mana pun.' },
    { id: 'firebase', domain: 'firebase.google.com', name: 'Firebase', cat: 'Developer', color: '#FFCA28', fg: '#3b2b00', glyph: 'F', kind: 'local', type: 'stdio', command: 'npx', args: ['-y', 'firebase-tools@latest', 'mcp'], needs: 'node',
      desc: 'Firestore, Auth, Storage, Hosting & Remote Config (memakai login firebase CLI Anda).' },
    { id: 'shopify-dev', domain: 'shopify.dev', name: 'Shopify Dev', cat: 'Developer', color: '#95BF47', glyph: 'S', kind: 'local', type: 'stdio', command: 'npx', args: ['-y', '@shopify/dev-mcp@latest'], needs: 'node',
      desc: 'Dokumentasi & skema API Shopify untuk membangun app/tema.' },
    { id: 'huggingface', domain: 'huggingface.co', name: 'Hugging Face', cat: 'Developer', color: '#FFD21E', fg: '#3a2c00', glyph: '🤗', kind: 'oauth', type: 'http', url: 'https://huggingface.co/mcp?login',
      desc: 'Cari model, dataset, Spaces & paper; jalankan Spaces.' },

    // ---- Data & databases
    { id: 'postgres', domain: 'postgresql.org', name: 'PostgreSQL', cat: 'Database', color: '#336791', glyph: 'PG', kind: 'fields', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres', '{{url}}'], needs: 'node',
      fields: [{ key: 'url', label: 'Connection URL', type: 'password', placeholder: 'postgresql://user:pass@localhost:5432/db' }],
      desc: 'Lihat skema & jalankan query SQL (hanya-baca) di database Postgres.' },
    { id: 'mysql', domain: 'mysql.com', name: 'MySQL / MariaDB', cat: 'Database', color: '#00758F', glyph: 'My', kind: 'fields', type: 'stdio', command: 'npx', args: ['-y', '@benborla29/mcp-server-mysql'], needs: 'node',
      env: { MYSQL_HOST: '{{host}}', MYSQL_PORT: '{{port}}', MYSQL_USER: '{{user}}', MYSQL_PASS: '{{pass}}', MYSQL_DB: '{{db}}', ALLOW_INSERT_OPERATION: '{{write}}', ALLOW_UPDATE_OPERATION: '{{write}}', ALLOW_DELETE_OPERATION: '{{write}}' },
      fields: [{ key: 'host', label: 'Host', type: 'text', placeholder: '127.0.0.1', value: '127.0.0.1' }, { key: 'port', label: 'Port', type: 'text', value: '3306' },
        { key: 'user', label: 'User', type: 'text', value: 'root' }, { key: 'pass', label: 'Password', type: 'password' }, { key: 'db', label: 'Database', type: 'text' },
        { key: 'write', label: 'Izinkan INSERT/UPDATE/DELETE', type: 'bool', value: 'false' }],
      desc: 'Query, insert, update & delete data MySQL (cocok untuk XAMPP).' },
    { id: 'sqlite', domain: 'sqlite.org', name: 'SQLite', cat: 'Database', color: '#044A64', glyph: 'SQ', kind: 'fields', type: 'stdio', command: 'uvx', args: ['mcp-server-sqlite', '--db-path', '{{path}}'], needs: 'uv',
      fields: [{ key: 'path', label: 'File database', type: 'file', placeholder: '~/data/app.db' }],
      desc: 'Buat tabel, query & ubah data di file SQLite.' },
    { id: 'mongodb', domain: 'mongodb.com', name: 'MongoDB', cat: 'Database', color: '#00684A', glyph: 'M', kind: 'fields', type: 'stdio', command: 'npx', args: ['-y', 'mongodb-mcp-server'], needs: 'node',
      env: { MDB_MCP_CONNECTION_STRING: '{{uri}}' },
      fields: [{ key: 'uri', label: 'Connection string', type: 'password', placeholder: 'mongodb+srv://…' }],
      desc: 'Koleksi, dokumen, agregasi & indeks MongoDB / Atlas.' },
    { id: 'redis', domain: 'redis.io', name: 'Redis', cat: 'Database', color: '#DC382D', glyph: 'R', kind: 'fields', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-redis', '{{url}}'], needs: 'node',
      fields: [{ key: 'url', label: 'Redis URL', type: 'password', value: 'redis://localhost:6379' }],
      desc: 'Get, set, delete & list key Redis.' },
    { id: 'airtable', domain: 'airtable.com', name: 'Airtable', cat: 'Database', color: '#18BFFF', glyph: 'A', kind: 'fields', type: 'stdio', command: 'npx', args: ['-y', 'airtable-mcp-server'], needs: 'node',
      env: { AIRTABLE_API_KEY: '{{token}}' },
      fields: [{ key: 'token', label: 'Personal access token', type: 'password', placeholder: 'pat…', link: 'https://airtable.com/create/tokens' }],
      desc: 'Base, tabel & record Airtable — baca, buat, ubah, hapus.' },

    // ---- Commerce & payments
    { id: 'stripe', domain: 'stripe.com', name: 'Stripe', cat: 'Bisnis', color: '#635BFF', glyph: 'S', kind: 'oauth', type: 'http', url: 'https://mcp.stripe.com',
      desc: 'Pelanggan, produk, harga, invoice, payment link & refund Stripe.' },
    { id: 'paypal', domain: 'paypal.com', name: 'PayPal', cat: 'Bisnis', color: '#003087', glyph: 'P', kind: 'oauth', type: 'http', url: 'https://mcp.paypal.com/mcp', sseUrl: 'https://mcp.paypal.com/sse',
      desc: 'Invoice, order, transaksi & dispute PayPal.' },
    { id: 'square', domain: 'squareup.com', name: 'Square', cat: 'Bisnis', color: '#1A1A1A', glyph: '■', kind: 'oauth', type: 'sse', url: 'https://mcp.squareup.com/sse',
      desc: 'Katalog, pesanan, pembayaran & pelanggan Square.' },
    { id: 'shopify', domain: 'shopify.com', name: 'Shopify Admin', cat: 'Bisnis', color: '#5E8E3E', glyph: 'S', kind: 'fields', type: 'rest', baseUrl: 'https://{{shop}}.myshopify.com/admin/api/2025-07', headers: { 'X-Shopify-Access-Token': '{{token}}' },
      docs: 'Shopify Admin REST: /products.json, /orders.json, /customers.json, /inventory_levels.json; append .json to every path.',
      fields: [{ key: 'shop', label: 'Nama toko (subdomain)', type: 'text', placeholder: 'tokosaya' }, { key: 'token', label: 'Admin API access token', type: 'password', placeholder: 'shpat_…', help: 'Settings → Apps → Develop apps → buat app → Admin API scopes → install.' }],
      desc: 'Produk, pesanan, pelanggan & stok toko Shopify.' },

    // ---- Web, CMS & design
    { id: 'playwright', domain: 'playwright.dev', name: 'Browser otomatis (Playwright)', cat: 'Web', color: '#2EAD33', glyph: '▶', kind: 'local', type: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'], needs: 'node',
      desc: 'AI membuka situs mana pun, klik, isi form, login & ambil data — untuk web tanpa API.' },
    { id: 'wordpress', domain: 'wordpress.org', name: 'WordPress', cat: 'Web', color: '#21759B', glyph: 'W', kind: 'fields', type: 'rest', baseUrl: '{{site}}/wp-json/wp/v2', headers: { Authorization: 'Basic {{basic}}' },
      docs: 'WordPress REST: /posts, /pages, /media, /categories, /tags, /users, /comments. Create: POST /posts {title, content, status:"draft"|"publish"}; update: POST /posts/<id>; delete: DELETE /posts/<id>.',
      fields: [{ key: 'site', label: 'URL situs', type: 'text', placeholder: 'https://situs-anda.com' }, { key: 'user', label: 'Username', type: 'text' },
        { key: 'apppass', label: 'Application password', type: 'password', help: 'Users → Profil → Application Passwords → Add new.' }],
      derive: function (f) { return { basic: btoa(unescape(encodeURIComponent((f.user || '') + ':' + String(f.apppass || '').replace(/\s+/g, '')))) }; },
      desc: 'Tulis, edit, terbitkan & hapus post, halaman, media dan komentar.' },
    { id: 'webflow', domain: 'webflow.com', name: 'Webflow', cat: 'Web', color: '#146EF5', glyph: 'W', kind: 'oauth', type: 'sse', url: 'https://mcp.webflow.com/sse',
      desc: 'Situs, halaman & koleksi CMS Webflow.' },
    { id: 'wix', domain: 'wix.com', name: 'Wix', cat: 'Web', color: '#0C6EFC', glyph: 'W', kind: 'oauth', type: 'sse', url: 'https://mcp.wix.com/sse',
      desc: 'Kelola situs, produk, booking & konten Wix.' },
    { id: 'canva', domain: 'canva.com', name: 'Canva', cat: 'Desain', color: '#00C4CC', glyph: 'C', kind: 'oauth', type: 'http', url: 'https://mcp.canva.com/mcp',
      desc: 'Cari, buat, isi template & ekspor desain Canva.' },
    { id: 'figma', domain: 'figma.com', name: 'Figma (Dev Mode lokal)', cat: 'Desain', color: '#A259FF', glyph: 'F', kind: 'open', type: 'http', url: 'http://127.0.0.1:3845/mcp',
      desc: 'Ambil frame, variabel & kode dari aplikasi Figma desktop (aktifkan Dev Mode MCP server di Figma).' },
    { id: 'rest', name: 'REST API kustom', cat: 'Web', color: '#6E6BFF', glyph: '{}', kind: 'fields', type: 'rest', baseUrl: '{{base}}', headers: { '{{authHeader}}': '{{authValue}}' }, openapi: '{{openapi}}',
      fields: [{ key: 'name', label: 'Nama', type: 'text', placeholder: 'API Toko Saya' }, { key: 'base', label: 'Base URL', type: 'text', placeholder: 'https://api.contoh.com/v1' },
        { key: 'authHeader', label: 'Header auth (opsional)', type: 'text', value: 'Authorization' }, { key: 'authValue', label: 'Nilai header', type: 'password', placeholder: 'Bearer sk_…' },
        { key: 'openapi', label: 'URL OpenAPI/Swagger (opsional)', type: 'text', placeholder: 'https://api.contoh.com/openapi.json' }],
      desc: 'Hubungkan API apa pun (web Anda sendiri, Laravel, Strapi, Odoo…) untuk CRUD penuh.' },

    // ---- Files & search
    { id: 'filesystem', name: 'Folder di komputer', cat: 'File & riset', color: '#8E8E93', glyph: '📁', kind: 'fields', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '{{folder}}'], needs: 'node',
      fields: [{ key: 'folder', label: 'Folder', type: 'folder' }],
      desc: 'Beri akses baca/tulis ke satu folder tertentu (di luar mode Code).' },
    { id: 'brave', domain: 'brave.com', name: 'Brave Search', cat: 'File & riset', color: '#FB542B', glyph: 'B', kind: 'fields', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'], needs: 'node',
      env: { BRAVE_API_KEY: '{{key}}' }, fields: [{ key: 'key', label: 'API key', type: 'password', link: 'https://brave.com/search/api/' }],
      desc: 'Pencarian web & berita berkualitas lewat Brave Search API.' },
    { id: 'exa', domain: 'exa.ai', name: 'Exa Search', cat: 'File & riset', color: '#1F40ED', glyph: 'E', kind: 'open', type: 'http', url: 'https://mcp.exa.ai/mcp',
      desc: 'Pencarian web semantik & riset perusahaan/kode.' },
    { id: 'memory', name: 'Memori grafik pengetahuan', cat: 'File & riset', color: '#7C3AED', glyph: '◎', kind: 'local', type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'], needs: 'node',
      desc: 'Simpan entitas & relasi jangka panjang yang bisa diingat AI.' },

    // ---- Built into Sinai
    { id: 'sinai-apple', domain: 'icloud.com', name: 'Kalender, Pengingat & Kontak', cat: 'Bawaan', color: '#FF3B30', glyph: '📅', kind: 'builtin', setting: 'integrations',
      desc: 'Lihat & buat acara, pengingat dan kontak di komputer ini (izin sistem diminta sekali).' },
  ];

  var CATS = ['Semua', 'Produktivitas', 'Komunikasi', 'Developer', 'Database', 'Bisnis', 'Web', 'Desain', 'File & riset', 'Bawaan'];
  var BADGE = { oauth: 'Login sekali klik', open: 'Langsung pakai', token: 'Butuh token', fields: 'Isi 1–2 data', local: 'Lokal', rest: 'API', builtin: 'Bawaan' };

  function find(id) { return CATALOG.find(function (c) { return c.id === id; }) || null; }
  function installed(id) { return (Store.settings.mcpServers || []).find(function (x) { return x.catalogId === id; }) || null; }

  // ---------------------------------------------------------------- real logos

  /* Brand logos are fetched once through the native HTTP client (the page
     itself may not load remote images) and cached as data: URLs. */
  var logoCache = null, logoWait = {}, genericIcon;
  var saveLogos = U.debounce(function () { var keep = {}; Object.keys(logoCache || {}).forEach(function (k) { if (logoCache[k]) keep[k] = logoCache[k]; }); Native.call('store.write', { name: 'logos.json', content: JSON.stringify(keep) }).catch(function () {}); }, 1500);
  async function logoData(domain) {
    if (!domain) return null;
    if (!logoCache) {
      try { logoCache = JSON.parse((await Native.call('store.read', { name: 'logos.json' })) || '{}') || {}; } catch (e) { logoCache = {}; }
    }
    if (logoCache[domain] !== undefined) return logoCache[domain];
    if (logoWait[domain]) return logoWait[domain];
    logoWait[domain] = (async function () {
      var url = null;
      try {
        var fetchIcon = function (d) { return Native.call('http.request', { url: 'https://www.google.com/s2/favicons?sz=128&domain=' + encodeURIComponent(d), method: 'GET', binary: true, timeout: 15 }); };
        // Unknown domains get a generic globe; remember what it looks like once and skip it.
        if (genericIcon === undefined) { try { genericIcon = (await fetchIcon('sinai-no-such-site.invalid')).base64 || null; } catch (e) { genericIcon = null; } }
        var r = await fetchIcon(domain);
        var type = (r.headers && r.headers['content-type']) || 'image/png';
        if (r.status === 200 && r.base64 && r.base64.length > 100 && r.base64 !== genericIcon && /^image\//.test(type)) url = 'data:' + type.split(';')[0] + ';base64,' + r.base64;
      } catch (e) { url = null; }
      logoCache[domain] = url;
      saveLogos();
      return url;
    })();
    return logoWait[domain];
  }

  function domainOf(c) {
    if (c.domain) return c.domain;
    var u = c.url || c.baseUrl || '';
    if (!/^https:\/\//.test(u) || /\{\{/.test(u.split('/')[2] || '')) return '';
    var host = u.split('/')[2].replace(/^(mcp|api|server|mcp-server|bindings|docs)\./, '');
    return host;
  }

  function logo(c, size) {
    size = size || 40;
    var el = h('div.cx-logo', { style: { background: c.color || '#6E6BFF', color: c.fg || '#fff', width: size + 'px', height: size + 'px', fontSize: Math.round(size * ((c.glyph || '?').length > 1 ? 0.36 : 0.46)) + 'px' }, text: c.glyph || (c.name || '?').charAt(0).toUpperCase() });
    var d = domainOf(c);
    if (d) logoData(d).then(function (src) {
      if (!src) return;
      var img = new Image();
      img.onload = function () {
        if (img.naturalWidth < 16) return;
        el.textContent = '';
        el.classList.add('img');
        el.style.background = '#fff';
        el.appendChild(img);
      };
      img.src = src;
    });
    return el;
  }

  /* Builds the stored config for a catalog entry. Secrets stay as {{placeholders}}. */
  function configFor(c, fields) {
    var cfg = { id: U.uid('mcp_'), catalogId: c.id, name: (c.id === 'rest' && fields.name) || c.name, type: c.type, enabled: true };
    if (c.url) cfg.url = c.url;
    if (c.sseUrl) cfg.sseUrl = c.sseUrl;
    if (c.kind === 'oauth' || c.lazyLogin) cfg.auth = 'oauth';
    if (c.lazyLogin) cfg.lazyLogin = true;
    if (c.domain) cfg.domain = c.domain;
    if (c.regName) { cfg.regName = c.regName; cfg.fieldDefs = c.fields || []; cfg.color = c.color; }
    ['command', 'args', 'env', 'headers', 'baseUrl', 'docs', 'openapi', 'query'].forEach(function (k) { if (c[k] != null) cfg[k] = JSON.parse(JSON.stringify(c[k])); });
    return cfg;
  }

  async function checkRuntime(c) {
    if (!c.needs) return null;
    var cmd = c.needs === 'node' ? 'npx' : 'uvx';
    try {
      var r = await Native.call('exec.sync', { command: Store.info.posixShell === false ? 'Get-Command ' + cmd + ' -ErrorAction Stop | Out-Null' : 'command -v ' + cmd, timeout: 8 });
      if (r.code === 0) return null;
    } catch (e) { /* treat as missing */ }
    return c.needs === 'node'
      ? 'Konektor ini butuh Node.js (perintah npx). Instal dari nodejs.org lalu coba lagi.'
      : 'Konektor ini butuh uv (perintah uvx). Instal: ' + (U.isWin() ? 'winget install astral-sh.uv' : 'curl -LsSf https://astral.sh/uv/install.sh | sh') + ' lalu coba lagi.';
  }

  /* One click: create the connector, store its fields, start it (signing in when needed). */
  async function connect(c, fields) {
    fields = fields || {};
    if (c.kind === 'builtin') { Store.setSetting(c.setting, true); return { ok: true }; }
    var miss = await checkRuntime(c);
    if (miss) return { ok: false, error: miss };
    if (c.derive) Object.assign(fields, c.derive(fields));
    var cfg = configFor(c, fields);
    if (Object.keys(fields).length) await MCP.setFields(cfg.id, fields);
    Store.settings.mcpServers = (Store.settings.mcpServers || []).concat([cfg]);
    Store.saveSettings();
    var s = await MCP.start(cfg, { interactive: true });
    if (s.status === 'ready') return { ok: true, tools: s.tools.length };
    return { ok: false, error: s.error || 'Gagal terhubung', cfg: cfg };
  }

  // ---------------------------------------------------------------- UI

  function fieldInput(f, value) {
    var inp;
    if (f.type === 'bool') {
      inp = h('select.sel', h('option', { value: 'false', text: 'Tidak' }), h('option', { value: 'true', text: 'Ya' }));
      inp.value = value || f.value || 'false';
      return inp;
    }
    inp = h('input.inp' + (f.type === 'password' || f.type === 'text' ? '.mono' : ''), { type: f.type === 'password' ? 'password' : 'text', placeholder: f.placeholder || '', value: value != null ? value : (f.value || ''), autocomplete: 'off', spellcheck: false });
    if (f.type === 'folder' || f.type === 'file') {
      var wrap = h('div.row', { style: { gap: '6px' } }, inp, h('button.btn.sm', { html: U.icon('folder') + 'Pilih…', onclick: async function () {
        var p = f.type === 'folder' ? await Native.call('dialog.openFolder', { message: f.label }) : (await Native.call('dialog.openFiles', { multiple: false }) || [])[0];
        if (p) inp.value = typeof p === 'string' ? p : p.path || '';
      } }));
      wrap.input = inp;
      return wrap;
    }
    return inp;
  }

  function fieldsForm(c, initial, onSubmit, submitLabel) {
    var inputs = {};
    var box = h('div.cx-form');
    (c.fields || []).forEach(function (f) {
      var el = fieldInput(f, initial ? initial[f.key] : null);
      inputs[f.key] = el.input || el;
      box.appendChild(h('div.field', h('label', { text: f.label }), el,
        f.help || f.link ? h('p.hint', { style: { margin: '4px 0 0' }, html: U.esc(f.help || '') + (f.link ? ' <a href="#" data-url="' + U.esc(f.link) + '">Buka halaman →</a>' : '') }) : null));
    });
    box.addEventListener('click', function (e) { var a = e.target.closest('a[data-url]'); if (a) { e.preventDefault(); Native.call('app.openURL', { url: a.dataset.url }); } });
    var err = h('div.cx-err');
    var btn = h('button.btn.sm.primary', { text: submitLabel || 'Hubungkan' });
    btn.addEventListener('click', async function () {
      var vals = {};
      Object.keys(inputs).forEach(function (k) { vals[k] = String(inputs[k].value || '').trim(); });
      var missing = (c.fields || []).filter(function (f) { return !f.optional && !/opsional/i.test(f.label) && f.type !== 'bool' && !vals[f.key]; });
      if (missing.length) { err.textContent = 'Isi dulu: ' + missing.map(function (f) { return f.label; }).join(', '); return; }
      btn.disabled = true; err.textContent = '';
      btn.innerHTML = '<span class="spin"></span>Menghubungkan…';
      var r = await onSubmit(vals);
      btn.disabled = false; btn.textContent = submitLabel || 'Hubungkan';
      if (r && r.error) err.textContent = r.error;
    });
    box.appendChild(h('div.row', { style: { gap: '8px', alignItems: 'center' } }, btn, err));
    return box;
  }

  function statusText(cfg) {
    var s = MCP.status(cfg.id);
    if (cfg.enabled === false) return ['off', 'Nonaktif'];
    if (!s || s.status === 'off') return ['off', 'Mati'];
    if (s.status === 'starting') return ['busy', 'Menghubungkan…'];
    if (s.status === 'auth') return ['warn', s.needsAuth || !s.error ? 'Menunggu login di browser…' : s.error];
    if (s.status === 'ready') return ['ok', s.tools.length + ' alat siap'];
    return ['err', s.error || 'Error'];
  }

  var ui = { tab: 'browse', cat: 'Semua', q: '' };

  function render(body, rerender) {
    var head = h('div.cx-head',
      h('div.seg.cx-tabs',
        h('button' + (ui.tab === 'browse' ? '.on' : ''), { text: 'Jelajahi', onclick: function () { ui.tab = 'browse'; rerender(); } }),
        h('button' + (ui.tab === 'registry' ? '.on' : ''), { text: 'Direktori publik', title: 'Ribuan server MCP dari registry resmi Model Context Protocol', onclick: function () { ui.tab = 'registry'; rerender(); } }),
        h('button' + (ui.tab === 'mine' ? '.on' : ''), { text: 'Milik Anda (' + (Store.settings.mcpServers || []).length + ')', onclick: function () { ui.tab = 'mine'; rerender(); } })),
      h('div.cx-search', { html: U.icon('search') }),
      h('button.btn.sm', { html: U.icon('plus') + 'Kustom', title: 'Tambah server MCP manual', onclick: function () { Settings.editMcp(null, rerender); } }));
    var q = h('input', { placeholder: 'Cari konektor…', value: ui.q });
    head.querySelector('.cx-search').appendChild(q);
    body.appendChild(head);
    var content = h('div');
    body.appendChild(content);
    q.addEventListener('input', U.debounce(function () { ui.q = q.value; if (ui.tab === 'mine') { ui.tab = 'browse'; rerender(); return; } paint(); }, 120));
    function paint() {
      content.innerHTML = '';
      if (ui.tab === 'browse') browse(content, rerender); else if (ui.tab === 'registry') registry(content, rerender); else mine(content, rerender);
    }
    paint();
    // Live status while connectors start / sign in.
    livePaint = function () { if (content.isConnected && ui.tab === 'mine') paint(); };
  }

  var livePaint = null;
  MCP.onChange(U.throttle(function () { if (livePaint) livePaint(); }, 400));

  function browse(box, rerender) {
    var chips = h('div.cx-cats');
    CATS.forEach(function (k) {
      chips.appendChild(h('button.chip' + (ui.cat === k ? '.on' : ''), { text: k, onclick: function () { ui.cat = k; rerender(); } }));
    });
    box.appendChild(chips);
    var q = ui.q.toLowerCase();
    var list = CATALOG.filter(function (c) {
      // Ponsel tidak bisa menjalankan server lokal (npx/uvx/docker): hanya konektor remote & REST.
      if (U.isMobile() && (c.type === 'stdio' || c.kind === 'local')) return false;
      return (ui.cat === 'Semua' || c.cat === ui.cat) && (!q || (c.name + ' ' + c.desc + ' ' + c.cat).toLowerCase().indexOf(q) >= 0);
    });
    if (U.isMobile()) box.appendChild(h('p.hint', { text: 'Di ponsel tersedia konektor remote (login sekali klik / URL) dan REST API. Konektor yang perlu program lokal (npx, uvx, database lokal) tersedia di Sinai desktop.' }));
    var grid = h('div.cx-grid');
    list.forEach(function (c) { grid.appendChild(card(c, rerender)); });
    if (!list.length) grid.appendChild(h('p.hint', { text: 'Tidak ada di katalog pilihan — lihat hasil direktori publik di bawah.' }));
    box.appendChild(grid);
    if (q.length >= 2) {
      var more = h('div', h('h4.cx-sub', { text: 'Dari direktori publik MCP' }), h('div.status-line', { html: '<span class="spin"></span>Mencari "' + U.esc(ui.q) + '"…' }));
      box.appendChild(more);
      registrySearch(ui.q).then(function (res) {
        more.lastChild.remove();
        var g = h('div.cx-grid');
        res.items.slice(0, 24).forEach(function (c) { g.appendChild(card(c, rerender)); });
        if (!res.items.length) g.appendChild(h('p.hint', { text: 'Tidak ditemukan. Gunakan "REST API kustom" untuk layanan yang punya API.' }));
        more.appendChild(g);
      }).catch(function (e) { more.lastChild.textContent = e.message; });
    }
    box.appendChild(h('p.hint', { style: { marginTop: '12px' }, html: 'Semua token & login disimpan terenkripsi di ' + (U.isMac() ? 'Keychain macOS' : 'penyimpanan aman sistem') + '. Alat dari konektor dipakai AI untuk membaca, membuat, mengubah & menghapus data; di mode "Tanya dulu" setiap aksi meminta izin, di "Otomatis penuh" langsung jalan.' }));
  }

  // ---------------------------------------------------------------- public MCP registry

  var REGISTRY = 'https://registry.modelcontextprotocol.io/v0/servers';
  var regCache = {};
  var PALETTE = ['#4F46E5', '#0EA5E9', '#059669', '#D97706', '#DB2777', '#7C3AED', '#0F766E', '#DC2626', '#2563EB', '#65A30D'];
  function hashColor(s) { var n = 0; for (var i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0; return PALETTE[n % PALETTE.length]; }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  function nsDomain(name) {
    var ns = String(name).split('/')[0];
    if (/^io\.github\./.test(ns)) return 'github.com';
    return ns.split('.').reverse().join('.');
  }
  function fieldKey(s) { return String(s).replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'value'; }

  /* Registry entry → catalog-style connector (remote preferred, else npm / PyPI package). */
  function fromRegistry(sv) {
    var remotes = sv.remotes || [];
    var pk = (sv.packages || []).filter(function (p) { return p.registryType === 'npm' || p.registryType === 'pypi'; });
    if (!remotes.length && !pk.length) return null;
    var title = sv.title || sv.name.split('/').pop().replace(/[-_]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    var ns = sv.name.split('/')[0];
    var c = { id: 'reg:' + sv.name, regName: sv.name, name: title, desc: (sv.description || '').slice(0, 220), cat: 'Direktori', color: hashColor(sv.name),
      glyph: title.charAt(0).toUpperCase(), domain: sv.websiteUrl ? hostOf(sv.websiteUrl) : nsDomain(sv.name), verified: !/^io\.github\./.test(ns), fields: [] };
    var rem = remotes.find(function (r) { return r.type === 'streamable-http'; }) || remotes[0];
    if (rem) {
      c.type = rem.type === 'sse' ? 'sse' : 'http';
      c.url = String(rem.url).replace(/\{([A-Za-z0-9_]+)\}/g, function (_, k) {
        var v = (rem.variables || {})[k] || {};
        c.fields.push({ key: fieldKey(k), label: (v.description || k), type: v.isSecret ? 'password' : 'text', value: v.default || '', optional: !v.isRequired && !!v.default });
        return '{{' + fieldKey(k) + '}}';
      });
      var sse = remotes.find(function (r) { return r.type === 'sse'; });
      if (sse && c.type === 'http' && !/\{/.test(sse.url)) c.sseUrl = sse.url;
      c.headers = {};
      (rem.headers || []).forEach(function (hd) {
        if (!hd.name) return;
        var tmpl = hd.value ? String(hd.value).replace(/\{([A-Za-z0-9_]+)\}/g, function (_, k) { return '{{' + fieldKey(k) + '}}'; }) : '{{' + fieldKey(hd.name) + '}}';
        var keys = (tmpl.match(/\{\{(\w+)\}\}/g) || []).map(function (x) { return x.slice(2, -2); });
        keys.forEach(function (k) {
          if (!c.fields.some(function (f) { return f.key === k; })) c.fields.push({ key: k, label: hd.description || hd.name, type: hd.isSecret !== false ? 'password' : 'text', optional: !hd.isRequired });
        });
        c.headers[hd.name] = tmpl;
      });
      c.lazyLogin = true;
      c.kind = c.fields.some(function (f) { return !f.optional; }) ? 'fields' : 'oauth';
    } else {
      var p = pk[0];
      c.type = 'stdio';
      c.command = p.registryType === 'npm' ? 'npx' : 'uvx';
      c.needs = p.registryType === 'npm' ? 'node' : 'uv';
      c.args = p.registryType === 'npm' ? ['-y', p.identifier + (p.version ? '@' + p.version : '')] : [p.identifier + (p.version ? '==' + p.version : '')];
      (p.packageArguments || []).forEach(function (a) {
        if (a.type === 'named' && a.name) { c.args.push(a.name); if (a.value || a.default) c.args.push(a.value || a.default); }
        else if (a.type === 'positional' && (a.value || a.default)) c.args.push(a.value || a.default);
      });
      c.env = {};
      (p.environmentVariables || []).forEach(function (v) {
        if (!v.name) return;
        var k = fieldKey(v.name);
        c.env[v.name] = v.value && !/\{/.test(v.value) ? v.value : '{{' + k + '}}';
        if (c.env[v.name] === '{{' + k + '}}') c.fields.push({ key: k, label: v.name + (v.description ? ' — ' + v.description : ''), type: v.isSecret ? 'password' : 'text', value: v.default || '', optional: !v.isRequired });
      });
      c.kind = c.fields.some(function (f) { return !f.optional; }) ? 'fields' : 'local';
    }
    if (!c.fields.length) delete c.fields;
    return c;
  }

  async function registrySearch(q, cursor) {
    var key = (q || '') + '|' + (cursor || '');
    if (regCache[key]) return regCache[key];
    var url = REGISTRY + '?version=latest&limit=60' + (q ? '&search=' + encodeURIComponent(q) : '') + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    var r = await Native.call('http.request', { url: url, method: 'GET', headers: { Accept: 'application/json' }, timeout: 40 });
    if (r.status !== 200) throw new Error('Direktori publik tidak bisa dibuka (HTTP ' + r.status + '). Periksa koneksi internet.');
    var j = JSON.parse(r.body);
    var items = (j.servers || []).map(function (x) { return fromRegistry(x.server || x); }).filter(Boolean);
    // Domain-verified publishers and hosted (remote) servers first.
    items.sort(function (a, b) { return (b.verified - a.verified) || ((b.type !== 'stdio') - (a.type !== 'stdio')); });
    regCache[key] = { items: items, next: j.metadata && j.metadata.nextCursor };
    return regCache[key];
  }

  function registry(box, rerender) {
    box.appendChild(h('p.hint', { html: 'Direktori resmi <b>Model Context Protocol</b> (registry.modelcontextprotocol.io) — ribuan server dari perusahaan & komunitas. Nama berawalan domain (mis. <code>com.notion/…</code>) sudah diverifikasi pemilik domainnya. Server remote: klik + lalu login di browser bila diminta; paket lokal dijalankan lewat npx/uvx.' }));
    var grid = h('div.cx-grid');
    var moreBtn = h('button.btn.sm', { text: 'Muat lebih banyak' });
    var cursor = null;
    async function loadMore() {
      moreBtn.disabled = true; moreBtn.innerHTML = '<span class="spin"></span>Memuat…';
      try {
        var res = await registrySearch(ui.q, cursor);
        res.items.forEach(function (c) { grid.appendChild(card(c, rerender)); });
        cursor = res.next;
        moreBtn.hidden = !cursor;
      } catch (e) { UI.toast(e.message, { error: true }); }
      moreBtn.disabled = false; moreBtn.textContent = 'Muat lebih banyak';
    }
    moreBtn.addEventListener('click', loadMore);
    box.appendChild(grid);
    box.appendChild(h('div', { style: { textAlign: 'center', marginTop: '12px' } }, moreBtn));
    loadMore();
  }

  function card(c, rerender) {
    var inst = c.kind === 'builtin' ? (Store.settings[c.setting] !== false ? { builtin: true } : null) : installed(c.id);
    var formBox = h('div.cx-formbox');
    var action = h('button.cx-add' + (inst ? '.on' : ''), { html: inst ? U.icon('check') : U.icon('plus'), title: inst ? 'Terhubung — buka di Milik Anda' : 'Hubungkan' });
    var el = h('div.cx-card' + (inst ? '.connected' : ''),
      h('div.cx-top', logo(c), h('div.cx-meta', h('b', { text: c.name, title: c.regName || c.name }), h('div.cx-badges', h('span.cx-badge.k-' + c.kind, { text: c.regName && c.kind === 'oauth' ? 'Hubungkan · login bila perlu' : BADGE[c.kind] }), c.regName && c.verified ? h('span.cx-badge.k-ver', { text: '✓ ' + c.domain }) : null)), action),
      h('p', { text: c.desc }), formBox);
    action.addEventListener('click', async function (e) {
      e.stopPropagation();
      if (inst) { if (c.kind === 'builtin') return; ui.tab = 'mine'; rerender(); return; }
      if (c.fields && c.fields.length) {
        if (formBox.childNodes.length) { formBox.innerHTML = ''; return; }
        formBox.appendChild(fieldsForm(c, null, async function (vals) {
          var r = await connect(c, vals);
          done(r);
          return r;
        }));
        var first = formBox.querySelector('input');
        if (first) first.focus();
        return;
      }
      action.disabled = true;
      action.innerHTML = '<span class="spin"></span>';
      if (c.kind === 'oauth') UI.toast('Membuka login ' + c.name + ' di browser…');
      done(await connect(c, {}));
    });
    function done(r) {
      if (r.ok) { UI.toast(c.name + ' terhubung' + (r.tools != null ? ' · ' + r.tools + ' alat' : '')); rerender(); }
      else {
        action.disabled = false;
        action.innerHTML = U.icon('plus');
        if (!(c.fields && c.fields.length)) UI.toast(c.name + ': ' + r.error, { error: true });
        if (r.cfg) { ui.tab = 'mine'; rerender(); }
      }
    }
    return el;
  }

  function mine(box, rerender) {
    var list = Store.settings.mcpServers || [];
    if (!list.length) {
      box.appendChild(h('div.card', h('p.hint', { style: { margin: 0 }, text: 'Belum ada konektor. Buka tab Jelajahi dan klik + pada layanan yang ingin dihubungkan.' })));
      return;
    }
    list.forEach(function (cfg) { box.appendChild(row(cfg, rerender)); });
  }

  function row(cfg, rerender) {
    var c = find(cfg.catalogId) || { name: cfg.name, color: cfg.color || '#6E6BFF', domain: cfg.domain, glyph: (cfg.name || '?').charAt(0).toUpperCase(), kind: cfg.type === 'stdio' ? 'local' : cfg.type === 'rest' ? 'rest' : 'open' };
    var st = statusText(cfg);
    var extra = h('div');
    var s = MCP.status(cfg.id);
    var where = cfg.type === 'stdio' ? (cfg.command + ' ' + (cfg.args || []).join(' ')) : (cfg.url || cfg.baseUrl || '');
    var el = h('div.card.cx-row',
      h('div.mcp-row',
        logo(c, 34),
        h('div.pn', h('b', { text: cfg.name }), h('span', { html: '<i class="dot ' + ({ ok: 'ok', err: 'err', warn: 'warn' }[st[0]] || '') + '"></i>' + U.esc(st[1]) + ' · <span class="mono">' + U.esc(U.truncateMiddle(where.replace(/\{\{\w+\}\}/g, '•••'), 70)) + '</span>' })),
        (s && (s.status === 'auth' || (s.status === 'error' && cfg.auth === 'oauth'))) ? h('button.btn.sm.primary', { html: U.icon('key') + 'Login', onclick: function () { UI.toast('Membuka login ' + cfg.name + ' di browser…'); MCP.start(cfg, { interactive: true }).then(rerender); } }) : null,
        h('label.switch-wrap', { title: 'Aktif' }, toggleEl(cfg.enabled !== false, function (v) { cfg.enabled = v; Store.saveSettings(); if (v) MCP.start(cfg).then(rerender); else { MCP.stop(cfg.id); rerender(); } })),
        h('button.btn.sm', { html: U.icon('refresh'), title: 'Hubungkan ulang', onclick: function () { MCP.start(cfg, { interactive: true }).then(rerender); } }),
        h('button.btn.sm', { html: U.icon('settings') + 'Kustomisasi', onclick: function () {
          if (extra.childNodes.length) { extra.innerHTML = ''; return; }
          customize(cfg, extra, rerender);
        } }),
        h('button.btn.sm.danger', { html: U.icon('trash'), title: 'Putuskan & hapus', onclick: async function () {
          var ok = await UI.confirm({ title: 'Putuskan ' + cfg.name + '?', body: 'Konektor, token login, dan data koneksinya dihapus dari Sinai.', ok: 'Putuskan', danger: true });
          if (!ok) return;
          await MCP.remove(cfg.id);
          rerender();
        } })),
      extra);
    return el;
  }

  function toggleEl(on, onChange) {
    var el = h('button.switch' + (on ? '.on' : ''), { onclick: function () { el.classList.toggle('on'); onChange(el.classList.contains('on')); } });
    return el;
  }

  /* Customise an installed connector: name, auto-approve, which tools the AI may use, connection fields. */
  async function customize(cfg, box, rerender) {
    var c = find(cfg.catalogId) || (cfg.fieldDefs && cfg.fieldDefs.length ? { name: cfg.name, fields: cfg.fieldDefs } : null);
    var s = MCP.status(cfg.id);
    var name = h('input.inp', { value: cfg.name });
    name.addEventListener('change', function () { cfg.name = name.value.trim() || cfg.name; Store.saveSettings(); MCP.start(cfg); });
    var wrap = h('div.cx-custom',
      h('div.row', h('div.field', h('label', { text: 'Nama (dipakai di nama alat)' }), name)),
      h('div.opt-row', h('div', h('b', { text: 'Jalankan alat tanpa bertanya' }), h('p.hint', { style: { margin: '2px 0 0' }, text: 'Jika mati, setiap aksi konektor ini meminta izin (kecuali mode Otomatis penuh).' })),
        toggleEl(!!cfg.trusted, function (v) { cfg.trusted = v; Store.saveSettings(); })));
    if (s && s.tools && s.tools.length) {
      var off = cfg.disabledTools || [];
      var tl = h('div.cx-tools');
      s.tools.forEach(function (t) {
        var cb = h('input', { type: 'checkbox' });
        cb.checked = off.indexOf(t.name) < 0;
        cb.addEventListener('change', function () {
          var set = new Set(cfg.disabledTools || []);
          if (cb.checked) set.delete(t.name); else set.add(t.name);
          cfg.disabledTools = Array.from(set);
          Store.saveSettings();
        });
        tl.appendChild(h('label.cx-tool', cb, h('span', h('b', { text: t.title || t.name }), h('small', { text: String(t.description || '').slice(0, 140) }))));
      });
      wrap.appendChild(h('div.field', h('label', { text: 'Alat yang boleh dipakai AI (' + s.tools.length + ')' }), tl));
    }
    if (c && c.fields && c.fields.length) {
      var cur = await MCP.getFields(cfg.id);
      wrap.appendChild(h('div.field', h('label', { text: 'Data koneksi' }), fieldsForm(c, cur, async function (vals) {
        if (c.derive) Object.assign(vals, c.derive(vals));
        await MCP.setFields(cfg.id, vals);
        var st = await MCP.start(cfg, { interactive: true });
        if (st.status !== 'ready') return { error: st.error };
        UI.toast(cfg.name + ' diperbarui');
        rerender();
        return {};
      }, 'Simpan & hubungkan ulang')));
    } else if (!c) {
      wrap.appendChild(h('button.btn.sm', { html: U.icon('edit') + 'Edit konfigurasi', onclick: function () { Settings.editMcp(cfg, rerender); } }));
    }
    if (cfg.auth === 'oauth') {
      wrap.appendChild(h('div.row', { style: { gap: '6px' } }, h('button.btn.sm.ghost', { html: U.icon('x') + 'Keluar (hapus token login)', onclick: async function () { await MCP.logout(cfg.id); UI.toast('Token login ' + cfg.name + ' dihapus'); rerender(); } })));
    }
    if (s && s.log) wrap.appendChild(h('details', h('summary', { text: 'Log' }), h('div.mcp-log', { text: s.log })));
    box.appendChild(wrap);
  }

  window.Connectors = { CATALOG: CATALOG, render: render, connect: connect, find: find };
})();
