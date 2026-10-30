// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
package com.sinerli.sinai;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebChromeClient;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONArray;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

/**
 * Satu-satunya layar Sinai: WebView yang memuat UI web Sinai dari aset APK di
 * asal https://sinai.invalid/ (tidak pernah ke jaringan). Bridge ke native
 * memakai MessagePort yang hanya dikirim ke frame utama, jadi pratinjau
 * artifact (iframe sandbox di https://preview.sinai.invalid/) tidak bisa
 * menyentuh API native, key, atau berkas.
 */
public class MainActivity extends Activity {
    static final String APP_HOST = "sinai.invalid";
    static final String PREVIEW_HOST = "preview.sinai.invalid";
    static final String APP_ORIGIN = "https://" + APP_HOST;
    static final String PREVIEW_BASE = "https://" + PREVIEW_HOST + "/";

    final Handler main = new Handler(Looper.getMainLooper());
    FrameLayout root;
    WebView web;
    Bridge bridge;
    Assets assets;

    private WebMessagePort port;
    private volatile String nonce = "";
    private boolean portSent = false;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        WebView.enableSlowWholeDocumentDraw();   // Renderer: gambar seluruh dokumen untuk PDF/PNG
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        root = new FrameLayout(this);
        root.setBackgroundColor(night() ? 0xFF15161F : 0xFFEEF0F7);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applyInsets();

        assets = new Assets(this);
        bridge = new Bridge(this);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " Sinai/" + BuildConfig.VERSION);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(true);
        web.setBackgroundColor(Color.TRANSPARENT);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String host = u.getHost();
                if (APP_HOST.equals(host)) {
                    String path = u.getPath();
                    if (!Brand.intact()) return tampered();
                    if (path == null || path.equals("/") || path.equals("/index.html")) return indexHtml();
                    return assets.serveApp(path, req.getRequestHeaders());
                }
                if (PREVIEW_HOST.equals(host)) return assets.servePreview(u.getPath(), req.getRequestHeaders());
                return null;   // jaringan biasa (gambar CDN di pratinjau, dll.)
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (req.isForMainFrame() && APP_HOST.equals(u.getHost())) return false;
                if (!req.isForMainFrame()) return false;
                openExternal(u);   // tautan keluar dibuka di browser, aplikasi tidak pernah pindah halaman
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                portSent = false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && url.startsWith(APP_ORIGIN + "/") && !portSent) sendPort();
            }
        });
        web.setWebChromeClient(new WebChromeClient());

        // Data Sinai ada di penyimpanan aplikasi, jadi halaman selalu dimuat bersih.
        web.loadUrl(APP_ORIGIN + "/index.html");
        handleIntent(getIntent());
        if (Build.VERSION.SDK_INT >= 33) {
            // Android 13+ (wajib sejak Android 16): tombol/gestur Kembali lewat OnBackInvokedCallback.
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::back);
        }
    }

    boolean night() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    /** Edge-to-edge (wajib sejak Android 15): konten diberi jarak status bar, navigasi, dan keyboard. */
    private void applyInsets() {
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        if (Build.VERSION.SDK_INT < 30) {
            root.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    void setStatusBarStyle(boolean dark) {
        root.setBackgroundColor(dark ? 0xFF15161F : 0xFFEEF0F7);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(dark ? 0 : mask, mask);
            }
        }
    }

    /** index.html dengan nonce baru: halaman hanya menerima port bridge yang membawa nonce ini. */
    private WebResourceResponse indexHtml() {
        byte[] b = new byte[18];
        new SecureRandom().nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        nonce = sb.toString();
        String html = assets.readText("web/index.html");
        if (html == null) html = "<!doctype html><p>Aset Sinai rusak — pasang ulang aplikasi.</p>";
        html = html.replace("<head>", "<head>\n<meta name=\"gx-nonce\" content=\"" + nonce + "\">");
        WebResourceResponse r = new WebResourceResponse("text/html", "utf-8", new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
        r.setResponseHeaders(Assets.noStore());
        return r;
    }

    private WebResourceResponse tampered() {
        String html = "<!doctype html><meta name=viewport content=\"width=device-width\"><body style=\"font:15px sans-serif;padding:40px;color:#c33\">Sinai telah dimodifikasi dan tidak dapat dijalankan. Pasang ulang dari sinerli.com/sinai.</body>";
        WebResourceResponse r = new WebResourceResponse("text/html", "utf-8", new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
        r.setResponseHeaders(Assets.noStore());
        return r;
    }

    private void sendPort() {
        portSent = true;
        if (port != null) { try { port.close(); } catch (Exception ignored) { } }
        WebMessagePort[] ch = web.createWebMessageChannel();
        port = ch[0];
        port.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
            @Override
            public void onMessage(WebMessagePort p, WebMessage message) {
                if (p == port) bridge.handle(message.getData());
            }
        }, main);
        web.postWebMessage(new WebMessage("sinai-port:" + nonce, new WebMessagePort[]{ch[1]}), Uri.parse(APP_ORIGIN));
    }

    /** Kirim teks JSON ke halaman (jawaban & event). Aman dipanggil dari thread mana pun. */
    void post(final String json) {
        main.post(() -> { if (port != null) port.postMessage(new WebMessage(json)); });
    }

    void openExternal(Uri u) {
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
        if (!scheme.equals("https") && !scheme.equals("http") && !scheme.equals("mailto") && !scheme.equals("tel")) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException ignored) { }
    }

    // ------------------------------------------------------------------ intent masuk

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Uri data = intent.getData();
        if (Intent.ACTION_VIEW.equals(action) && data != null && "com.sinerli.sinai".equals(data.getScheme())) {
            bridge.oauthCallback(data.toString());
            return;
        }
        if (Intent.ACTION_SEND.equals(action) || Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            final List<Uri> uris = new ArrayList<>();
            ClipData clip = intent.getClipData();
            if (clip != null) for (int i = 0; i < clip.getItemCount(); i++) if (clip.getItemAt(i).getUri() != null) uris.add(clip.getItemAt(i).getUri());
            Uri one = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (one != null && !uris.contains(one)) uris.add(one);
            final String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (uris.isEmpty() && text != null) { bridge.sharedText(text); return; }
            bridge.io(() -> {
                JSONArray paths = new JSONArray();
                for (Uri u : uris) {
                    File f = bridge.sandbox.importUri(u, "dibagikan");
                    if (f != null) paths.put(f.getAbsolutePath());
                }
                if (paths.length() > 0) bridge.sharedFiles(paths);
            });
            setIntent(new Intent(Intent.ACTION_MAIN));
        }
    }

    // ------------------------------------------------------------------ pemilih berkas

    static final int REQ_PICK = 4101;

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PICK) bridge.pickResult(resultCode == RESULT_OK ? data : null);
    }

    // ------------------------------------------------------------------ siklus hidup

    /** Halaman memutuskan: tutup lapisan/laci/panel, atau minta app.background. */
    private void back() {
        if (port != null) bridge.emit("app.back", new org.json.JSONObject());
        else moveTaskToBack(true);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        back();
    }

    @Override
    protected void onDestroy() {
        bridge.shutdown();
        web.destroy();
        super.onDestroy();
    }
}
