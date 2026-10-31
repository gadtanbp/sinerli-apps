// Sinerli Apps — Copyright © 2026 Gadtan x Gallen. All rights reserved.
package com.sinerli.shell;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Shell Android bersama Sinerli Rupa, Dokum, Hitara, Present & Note: WebView
 * sistem + UI bawaan APK (di assets/web), tanpa pustaka tambahan, jadi APK kecil
 * dan ringan di perangkat RAM 1 GB. Perintah sama dengan shell Tauri desktop
 * (lihat _core/sn-core.js, `SinerliAndroid.invoke`).
 *
 * Halaman disajikan dari https://appassets.androidplatform.net supaya berstatus
 * secure context (crypto.subtle untuk PKCE) dan tidak pernah memuat URL lain.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/index.html";
    private static final String ALIAS = "sinerli-secrets-v1";
    private static final int REQ_FILE = 11, REQ_SAVE = 12;

    private WebView web;
    private ValueCallback<Uri[]> filePick;
    private byte[] pendingSave;
    private String pendingSaveId;
    private String pendingLink;
    private String scheme;

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        scheme = "sinerli-" + getPackageName().substring(getPackageName().lastIndexOf('.') + 1);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportZoom(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "SinerliAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String p = u.getPath();
                if (p == null || p.equals("/")) p = "/index.html";
                if (p.contains("..")) return null;
                try {
                    return new WebResourceResponse(mime(p), null, getAssets().open("web" + p));
                } catch (Exception e) { return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null); }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return false;
                openExternal(u.toString());   // tautan luar selalu ke browser, WebView tidak pernah keluar dari aplikasi
                return true;
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (pendingLink != null) { emit("deep-link", pendingLink); pendingLink = null; }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (filePick != null) filePick.onReceiveValue(null);
                filePick = cb;
                try { startActivityForResult(p.createIntent(), REQ_FILE); }
                catch (ActivityNotFoundException e) { filePick = null; cb.onReceiveValue(null); return false; }
                return true;
            }
        });
        setContentView(web);
        handleIntent(getIntent());
        web.loadUrl(HOME);
    }

    private void handleIntent(Intent i) {
        Uri u = i == null ? null : i.getData();
        if (u == null || !scheme.equals(u.getScheme()) || u.getQueryParameter("share") == null) return;
        if (web != null && web.getProgress() == 100) emit("deep-link", u.toString()); else pendingLink = u.toString();
    }
    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); handleIntent(i); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else moveTaskToBack(true); }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE) {
            ValueCallback<Uri[]> cb = filePick; filePick = null;
            if (cb != null) cb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
        } else if (req == REQ_SAVE) {
            String id = pendingSaveId; byte[] bytes = pendingSave; pendingSaveId = null; pendingSave = null;
            if (res != RESULT_OK || data == null || data.getData() == null) { resolve(id, true, "false"); return; }
            try (OutputStream o = getContentResolver().openOutputStream(data.getData())) { o.write(bytes); resolve(id, true, "true"); }
            catch (Exception e) { resolve(id, false, JSONObject.quote(String.valueOf(e.getMessage()))); }
        }
    }

    private static String mime(String p) {
        String e = p.substring(p.lastIndexOf('.') + 1).toLowerCase();
        switch (e) {
            case "html": return "text/html";
            case "js": case "mjs": return "text/javascript";
            case "css": return "text/css";
            case "json": return "application/json";
            case "png": return "image/png";
            case "webp": return "image/webp";
            case "svg": return "image/svg+xml";
            case "woff2": return "font/woff2";
            case "woff": return "font/woff";
            default: return "application/octet-stream";
        }
    }
    private void openExternal(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException e) { runOnUiThread(() -> Toast.makeText(this, url, Toast.LENGTH_LONG).show()); }
    }
    private void resolve(String id, boolean ok, String json) {
        final String js = "SN_native_resolve(" + JSONObject.quote(id) + "," + ok + "," + JSONObject.quote(json) + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }
    private void emit(String name, String url) {
        final String payload = "{\"url\":" + JSONObject.quote(url) + "}";
        final String js = "SN_native_emit(" + JSONObject.quote(name) + "," + JSONObject.quote(payload) + ")";
        runOnUiThread(() -> web.evaluateJavascript(js, null));
    }

    /* ------------------------------------------------- penyimpanan rahasia */
    // Token login: satu berkas per kunci, AES-256-GCM, kuncinya di Android Keystore (tidak bisa diekspor).
    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
        return kg.generateKey();
    }
    private File secretFile(String key) {
        File d = new File(getFilesDir(), "secure"); d.mkdirs();
        return new File(d, key.replaceAll("[^A-Za-z0-9_-]", "_"));
    }
    private String secretGet(String key) {
        File f = secretFile(key);
        if (!f.isFile()) return null;
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            byte[] all = b.toByteArray();
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, all, 0, 12));
            return new String(c.doFinal(all, 12, all.length - 12), StandardCharsets.UTF_8);
        } catch (Exception e) { return null; }   // kunci hilang: pengguna masuk ulang
    }
    private void secretSet(String key, String value) throws Exception {
        File f = secretFile(key);
        if (value == null || value.isEmpty()) { f.delete(); return; }
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, key());
        byte[] ct = c.doFinal(value.getBytes(StandardCharsets.UTF_8));
        try (OutputStream o = new FileOutputStream(f)) { o.write(c.getIV()); o.write(ct); }
    }

    /* ------------------------------------------------- login loopback */
    private void listen(final int port) throws Exception {
        final ServerSocket srv = new ServerSocket(port, 1, InetAddress.getByName("127.0.0.1"));
        srv.setSoTimeout(300000);
        new Thread(() -> {
            try (ServerSocket s = srv) {
                while (true) {
                    try (Socket c = s.accept()) {
                        c.setSoTimeout(5000);
                        byte[] buf = new byte[8192];
                        int n = c.getInputStream().read(buf);
                        String line = n > 0 ? new String(buf, 0, n, StandardCharsets.UTF_8).split("\r\n")[0] : "";
                        String[] parts = line.split(" ");
                        String path = parts.length > 1 ? parts[1] : "";
                        OutputStream o = c.getOutputStream();
                        if (!path.startsWith("/callback")) { o.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.UTF_8)); continue; }
                        String body = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Sinerli</title><body style='font:16px sans-serif;text-align:center;padding:18vh 24px'><h2>Login berhasil</h2><p>Signed in.</p><p><a href='" + scheme + "://open' style='font-size:18px'>Kembali ke aplikasi / Back to app</a></p><script>location.href='" + scheme + "://open'</script>";
                        byte[] b = body.getBytes(StandardCharsets.UTF_8);
                        o.write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: " + b.length + "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                        o.write(b); o.flush();
                        emit("oauth-callback", "http://127.0.0.1:" + port + path);
                        return;
                    }
                }
            } catch (Exception e) { /* waktu habis: pengguna bisa mencoba login lagi */ }
        }).start();
    }

    /* ------------------------------------------------- jembatan JS */
    private final class Bridge {
        @JavascriptInterface public void invoke(String id, String cmd, String json) {
            try {
                JSONObject a = new JSONObject(json == null ? "{}" : json);
                switch (cmd) {
                    case "secret_get": { String v = secretGet(a.getString("key")); resolve(id, true, v == null ? "null" : JSONObject.quote(v)); break; }
                    case "secret_set": secretSet(a.getString("key"), a.optString("value", "")); resolve(id, true, "null"); break;
                    case "open_url": {
                        String u = a.getString("url");
                        if (!u.startsWith("https://") && !u.startsWith("mailto:")) throw new Exception("url ditolak");
                        openExternal(u); resolve(id, true, "null"); break;
                    }
                    case "oauth_listen": { int p = a.getInt("port"); listen(p); resolve(id, true, String.valueOf(p)); break; }
                    case "save_file": {
                        pendingSave = Base64.decode(a.getString("data"), Base64.DEFAULT);
                        pendingSaveId = id;
                        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                            .setType(a.optString("mime", "application/octet-stream")).putExtra(Intent.EXTRA_TITLE, a.optString("name", "file"));
                        startActivityForResult(i, REQ_SAVE);
                        break;
                    }
                    case "set_theme": resolve(id, true, "null"); break;
                    case "launch_app": {
                        String app = a.getString("appId");
                        if (!app.matches("rupa|dokum|hitara|present|note|sinai")) throw new Exception("aplikasi tidak dikenal");
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("sinerli-" + app + "://open")));
                        resolve(id, true, "null"); break;
                    }
                    default: resolve(id, false, JSONObject.quote("unknown: " + cmd));
                }
            } catch (Exception e) { resolve(id, false, JSONObject.quote(String.valueOf(e.getMessage()))); }
        }
    }
}
