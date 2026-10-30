// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
package com.sinerli.sinai;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

/**
 * Pembaruan dari Sinerli: unduh APK, cocokkan SHA-256 dari manifest, lalu
 * buka pemasang paket Android ("Perbarui aplikasi ini?"). Android menolak
 * APK yang tanda tangannya berbeda dari aplikasi terpasang, jadi hanya build
 * resmi yang bisa menggantikan Sinai.
 */
final class Updater {
    private final Bridge bridge;

    Updater(Bridge bridge) { this.bridge = bridge; }

    String download(JSONObject p) throws Exception {
        URL url = new URL(p.optString("url"));
        if (!"https".equalsIgnoreCase(url.getProtocol()) && !"localhost".equals(url.getHost()) && !"10.0.2.2".equals(url.getHost())) throw new Exception("Alamat unduhan pembaruan tidak valid.");
        String sha = p.optString("sha256").toLowerCase();
        if (!sha.matches("[a-f0-9]{64}")) throw new Exception("Manifest pembaruan tidak memuat SHA-256.");
        String job = p.optString("job", "update");
        String name = p.optString("name", "Sinai.apk").replaceAll("[\\\\/:*?\"<>|]", "_");
        File dir = new File(bridge.sandbox.cache, "pembaruan");
        Sandbox.deleteTree(dir);
        dir.mkdirs();
        File out = new File(dir, name);
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        c.setConnectTimeout(30000);
        c.setReadTimeout(120000);
        c.setRequestProperty("User-Agent", "Sinai-Updater (Android)");
        try {
            int status = c.getResponseCode();
            if (status != 200) throw new Exception("Server pembaruan menjawab HTTP " + status + ".");
            long total = c.getContentLengthLong(), got = 0, last = 0;
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) {
                    os.write(buf, 0, n);
                    md.update(buf, 0, n);
                    got += n;
                    long now = System.currentTimeMillis();
                    if (now - last > 200) { last = now; bridge.emit("update.progress", new JSONObject().put("job", job).put("received", got).put("total", Math.max(0, total))); }
                }
            }
            bridge.emit("update.progress", new JSONObject().put("job", job).put("received", got).put("total", total > 0 ? total : got));
            StringBuilder hex = new StringBuilder();
            for (byte b : md.digest()) hex.append(String.format("%02x", b));
            if (!hex.toString().equals(sha)) { out.delete(); throw new Exception("Berkas pembaruan rusak atau tidak cocok (SHA-256 berbeda). Coba lagi."); }
            return out.getAbsolutePath();
        } finally {
            c.disconnect();
        }
    }

    JSONObject install(JSONObject p) throws Exception {
        final File apk = bridge.sandbox.existing(p.optString("path"));
        final MainActivity act = bridge.act;
        if (Build.VERSION.SDK_INT >= 26 && !act.getPackageManager().canRequestPackageInstalls()) {
            // Sekali saja: izinkan Sinai memasang pembaruan ("Instal aplikasi tak dikenal").
            act.runOnUiThread(() -> act.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + act.getPackageName()))));
            return new JSONObject().put("mode", "permission");
        }
        final Uri u = FilesProvider.uriFor(apk);
        act.runOnUiThread(() -> act.startActivity(new Intent(Intent.ACTION_VIEW)
            .setDataAndType(u, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK)));
        return new JSONObject().put("mode", "installer");
    }
}
