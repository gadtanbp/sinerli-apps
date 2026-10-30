// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
package com.sinerli.sinai;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Menerima {id, method, params} dari mobile/web/host-mobile.js lewat MessagePort
 * dan menjawab {id, ok, v|err}. Event dikirim sebagai {events: [[nama, data]]}.
 * Hanya primitif kecil; logika lain ada di host-mobile.js.
 */
final class Bridge {
    final MainActivity act;
    final Sandbox sandbox;
    final SecretStore secrets;
    final NativeHttp http;
    final Renderer renderer;
    final Updater updater;
    private final ExecutorService pool = Executors.newCachedThreadPool();

    private String pickId = null;
    private String oauthId = null;
    private String oauthScheme = null;
    private final List<String> pendingOpens = new ArrayList<>();
    private boolean askedNotify = false;

    Bridge(MainActivity act) {
        this.act = act;
        this.sandbox = new Sandbox(act);
        this.secrets = new SecretStore(act);
        this.http = new NativeHttp(this);
        this.renderer = new Renderer(act);
        this.updater = new Updater(this);
    }

    void io(Runnable r) { pool.execute(r); }

    void shutdown() { http.abortAll(); pool.shutdownNow(); }

    // ------------------------------------------------------------------ keluar

    void reply(String id, Object v) {
        try {
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("ok", true);
            o.put("v", v == null ? JSONObject.NULL : v);
            act.post(o.toString());
        } catch (JSONException ignored) { }
    }

    void fail(String id, String err) {
        try {
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("ok", false);
            o.put("err", err == null ? "Kesalahan" : err);
            act.post(o.toString());
        } catch (JSONException ignored) { }
    }

    void emit(String name, JSONObject payload) {
        try {
            JSONObject o = new JSONObject();
            o.put("events", new JSONArray().put(new JSONArray().put(name).put(payload)));
            act.post(o.toString());
        } catch (JSONException ignored) { }
    }

    // ------------------------------------------------------------------ masuk

    void handle(String raw) {
        final String id;
        final String method;
        final JSONObject p;
        try {
            JSONObject m = new JSONObject(raw);
            id = m.getString("id");
            method = m.getString("method");
            p = m.optJSONObject("params") != null ? m.optJSONObject("params") : new JSONObject();
        } catch (JSONException e) { return; }
        // Yang menyentuh UI/Activity dijalankan di thread utama; sisanya di latar belakang.
        switch (method) {
            case "dialog.openFiles": pick(id, p); return;
            case "oauth.start": oauthStart(id, p); return;
            case "app.background": act.moveTaskToBack(true); reply(id, true); return;
            case "app.setAppearance": setAppearance(p); reply(id, true); return;
            case "render": renderer.render(p, new Renderer.Done() {
                @Override public void ok(String path) { reply(id, path); }
                @Override public void err(String msg) { fail(id, msg); }
            }); return;
            default: break;
        }
        io(() -> {
            try { reply(id, call(method, p)); }
            catch (Throwable e) { fail(id, e.getMessage() != null ? e.getMessage() : e.toString()); }
        });
    }

    private Object call(String method, JSONObject p) throws Exception {
        switch (method) {
            case "app.info": return info();
            case "app.openURL": {
                Uri u = Uri.parse(p.optString("url"));
                String s = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
                if (!s.equals("http") && !s.equals("https") && !s.equals("mailto")) throw new Exception("URL tidak diizinkan");
                act.runOnUiThread(() -> act.openExternal(u));
                return true;
            }
            case "app.copy": {
                final String t = p.optString("text");
                act.runOnUiThread(() -> ((ClipboardManager) act.getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Sinai", t)));
                return true;
            }
            case "app.share": share(p); return true;
            case "app.open": open(p); return true;
            case "app.pendingOpens": {
                JSONArray a = new JSONArray();
                synchronized (pendingOpens) { for (String s : pendingOpens) a.put(s); pendingOpens.clear(); }
                return a;
            }
            case "notify.show": notify(p); return true;

            case "store.read": return sandbox.storeRead(p.optString("name"));
            case "store.write": sandbox.storeWrite(p.optString("name"), p.optString("content")); return true;
            case "store.delete": sandbox.storeDelete(p.optString("name")); return true;
            case "store.list": return sandbox.storeList(p.optString("dir"));

            case "secret.get": return secrets.get(p.optString("key"));
            case "secret.set": secrets.set(p.optString("key"), p.isNull("value") ? null : p.optString("value")); return true;
            case "secret.keys": return new JSONArray(secrets.keys());

            case "fs.readBytes": return sandbox.readBytes(p.optString("path"), p.optLong("offset", 0), p.optLong("length", 0));
            case "fs.writeBytes": return sandbox.writeBytes(p.optString("path"), Base64.decode(p.optString("base64"), Base64.DEFAULT), p.optBoolean("append"));
            case "fs.stat": return sandbox.stat(p.optString("path"));
            case "fs.listDir": return sandbox.listDir(p.optString("path"));
            case "fs.mkdir": sandbox.mkdir(p.optString("path")); return true;
            case "fs.remove": sandbox.remove(p.optString("path")); return true;
            case "fs.move": sandbox.move(p.optString("from"), p.optString("to")); return true;
            case "file.url": return MainActivity.APP_ORIGIN + "/__file/" + act.assets.fileToken(sandbox.existing(p.optString("path"))) + "/" + Uri.encode(new File(p.optString("path")).getName());

            case "preview.put": return act.assets.putPreview(p.optString("key"), p.optString("html"));
            case "preview.file": {
                File f = sandbox.existing(p.optString("path"));
                return MainActivity.PREVIEW_BASE + "file/" + act.assets.fileToken(f) + "/" + Uri.encode(f.getName());
            }

            case "http.request": return http.request(p);
            case "http.stream": http.stream(p); return true;
            case "http.abort": http.abort(p.optString("id")); return true;

            case "update.download": return updater.download(p);
            case "update.install": return updater.install(p);
            default: throw new Exception("Metode native tidak dikenal: " + method);
        }
    }

    private JSONObject info() throws JSONException {
        JSONObject o = new JSONObject();
        o.put("version", BuildConfig.VERSION);
        o.put("build", String.valueOf(BuildConfig.VERSION_CODE));
        o.put("osFamily", "android");
        o.put("platform", "android");
        o.put("os", "Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
        o.put("osVersion", Build.VERSION.RELEASE);
        o.put("deviceModel", (Build.MANUFACTURER + " " + Build.MODEL).trim());
        o.put("arch", Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "");
        o.put("home", sandbox.home.getAbsolutePath());
        o.put("supportDir", sandbox.support.getAbsolutePath());
        o.put("tempDir", sandbox.temp.getAbsolutePath());
        o.put("cacheDir", sandbox.cache.getAbsolutePath());
        o.put("user", "");
        o.put("fullName", "");
        o.put("host", Build.MODEL);
        o.put("previewBase", MainActivity.PREVIEW_BASE);
        o.put("locale", Locale.getDefault().toLanguageTag());
        o.put("reduceTransparency", true);
        o.put("updateKind", "apk");
        o.put("copyright", Brand.label());
        o.put("owner", Brand.owner());
        o.put("legal", Brand.legal());
        return o;
    }

    private void setAppearance(JSONObject p) {
        String mode = p.optString("mode", "system");
        boolean dark = mode.equals("dark") || (!mode.equals("light") && act.night());
        act.setStatusBarStyle(dark);
    }

    // ------------------------------------------------------------------ berkas: bagikan & buka

    private void share(JSONObject p) throws Exception {
        Intent send = new Intent(Intent.ACTION_SEND);
        if (p.has("path") && !p.optString("path").isEmpty()) {
            File f = sandbox.existing(p.optString("path"));
            Uri u = FilesProvider.uriFor(f);
            send.setType(Assets.mime(f.getName()));
            send.putExtra(Intent.EXTRA_STREAM, u);
            send.setClipData(ClipData.newRawUri(f.getName(), u));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } else {
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, p.optString("text"));
        }
        final Intent chooser = Intent.createChooser(send, "Bagikan dari Sinai");
        act.runOnUiThread(() -> { try { act.startActivity(chooser); } catch (ActivityNotFoundException ignored) { } });
    }

    private void open(JSONObject p) throws Exception {
        File f = sandbox.existing(p.optString("path"));
        Uri u = FilesProvider.uriFor(f);
        final Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(u, Assets.mime(f.getName())).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        final Intent chooser = Intent.createChooser(view, "Buka dengan");
        act.runOnUiThread(() -> { try { act.startActivity(chooser); } catch (ActivityNotFoundException ignored) { } });
    }

    // ------------------------------------------------------------------ pemilih berkas sistem

    private void pick(String id, JSONObject p) {
        if (pickId != null) fail(pickId, "Dibatalkan");
        pickId = id;
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, p.optBoolean("multiple", true));
        try { act.startActivityForResult(i, MainActivity.REQ_PICK); }
        catch (ActivityNotFoundException e) { pickId = null; fail(id, "Pemilih berkas tidak tersedia di perangkat ini."); }
    }

    void pickResult(final Intent data) {
        final String id = pickId;
        pickId = null;
        if (id == null) return;
        if (data == null) { reply(id, new JSONArray()); return; }
        final List<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount(); i++) uris.add(data.getClipData().getItemAt(i).getUri());
        else if (data.getData() != null) uris.add(data.getData());
        io(() -> {
            JSONArray out = new JSONArray();
            for (Uri u : uris) { File f = sandbox.importUri(u, "lampiran"); if (f != null) out.put(f.getAbsolutePath()); }
            reply(id, out);
        });
    }

    // ------------------------------------------------------------------ OAuth (Sinerli Connect, konektor)

    private void oauthStart(String id, JSONObject p) {
        String url = p.optString("url");
        Uri u = Uri.parse(url);
        if (!"https".equalsIgnoreCase(u.getScheme()) && !("http".equalsIgnoreCase(u.getScheme()) && ("localhost".equals(u.getHost()) || "10.0.2.2".equals(u.getHost()) || "127.0.0.1".equals(u.getHost())))) {
            fail(id, "Alamat login harus https.");
            return;
        }
        if (oauthId != null) fail(oauthId, "Login dibatalkan.");
        oauthId = id;
        oauthScheme = p.optString("scheme", "com.sinerli.sinai");
        // Custom Tab Chrome bila ada (tanpa pustaka tambahan), selain itu browser bawaan.
        Intent i = new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE);
        android.os.Bundle extras = new android.os.Bundle();
        extras.putBinder("android.support.customtabs.extra.SESSION", null);
        i.putExtras(extras);
        try { act.startActivity(i); }
        catch (ActivityNotFoundException e) { oauthId = null; fail(id, "Tidak ada browser untuk login."); }
    }

    void oauthCallback(String url) {
        String id = oauthId;
        if (id == null || oauthScheme == null || !url.startsWith(oauthScheme + ":")) return;
        oauthId = null;
        reply(id, url);
    }

    // ------------------------------------------------------------------ dibagikan ke Sinai

    void sharedText(String text) {
        try { emit("text.shared", new JSONObject().put("text", text)); } catch (JSONException ignored) { }
    }

    void sharedFiles(JSONArray paths) {
        synchronized (pendingOpens) { for (int i = 0; i < paths.length(); i++) pendingOpens.add(paths.optString(i)); }
        try { emit("files.opened", new JSONObject().put("paths", paths)); } catch (JSONException ignored) { }
    }

    // ------------------------------------------------------------------ notifikasi

    private void notify(JSONObject p) {
        NotificationManager nm = (NotificationManager) act.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 33 && act.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            if (!askedNotify) { askedNotify = true; act.runOnUiThread(() -> act.requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 7)); }
            return;
        }
        NotificationChannel ch = new NotificationChannel("sinai", "Sinai", NotificationManager.IMPORTANCE_DEFAULT);
        nm.createNotificationChannel(ch);
        Intent open = new Intent(act, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        android.app.PendingIntent pi = android.app.PendingIntent.getActivity(act, 0, open, android.app.PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(act, "sinai")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(p.optString("title", "Sinai"))
            .setContentText(p.optString("body"))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build();
        nm.notify((int) (System.currentTimeMillis() & 0x7fffffff), n);
    }
}
