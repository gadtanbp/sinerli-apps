// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
package com.sinerli.sinai;

import android.content.Context;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Menyajikan UI (aset APK) di https://sinai.invalid/ dan pratinjau artifact di
 * https://preview.sinai.invalid/ (asal terpisah, iframe sandbox). Berkas di
 * disk hanya bisa diakses lewat token acak yang didaftarkan native.
 */
final class Assets {
    private final Context ctx;
    private final Map<String, String> previews = new LinkedHashMap<String, String>(16, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, String> e) { return size() > 80; }
    };
    private final Map<String, File> files = new HashMap<>();

    Assets(Context ctx) { this.ctx = ctx; }

    static Map<String, String> noStore() {
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-store");
        h.put("X-Content-Type-Options", "nosniff");
        return h;
    }

    static String mime(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        int dot = n.lastIndexOf('.');
        String e = dot >= 0 ? n.substring(dot + 1) : "";
        switch (e) {
            case "html": case "htm": return "text/html";
            case "js": case "mjs": return "text/javascript";
            case "css": return "text/css";
            case "json": return "application/json";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "gif": return "image/gif";
            case "webp": return "image/webp";
            case "heic": return "image/heic";
            case "pdf": return "application/pdf";
            case "wasm": return "application/wasm";
            case "mp4": case "m4v": return "video/mp4";
            case "mov": return "video/quicktime";
            case "webm": return "video/webm";
            case "mp3": return "audio/mpeg";
            case "m4a": return "audio/mp4";
            case "wav": return "audio/wav";
            case "ogg": return "audio/ogg";
            case "txt": case "md": return "text/plain";
            case "csv": return "text/csv";
            case "woff2": return "font/woff2";
            case "ttf": return "font/ttf";
            default: return "application/octet-stream";
        }
    }

    private static boolean textual(String m) { return m.startsWith("text/") || m.equals("application/json") || m.equals("image/svg+xml"); }

    String readText(String assetPath) {
        try (InputStream in = ctx.getAssets().open(assetPath)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException e) { return null; }
    }

    private static boolean safe(String path) {
        if (path == null) return false;
        for (String part : path.split("/")) if (part.equals("..") || part.equals(".")) return false;
        return !path.contains("\\");
    }

    private WebResourceResponse asset(String assetPath, Map<String, String> extra) {
        if (!safe(assetPath)) return notFound();
        try {
            InputStream in = ctx.getAssets().open(assetPath);
            String m = mime(assetPath);
            WebResourceResponse r = new WebResourceResponse(m, textual(m) ? "utf-8" : null, in);
            Map<String, String> h = noStore();
            if (extra != null) h.putAll(extra);
            r.setResponseHeaders(h);
            return r;
        } catch (IOException e) { return notFound(); }
    }

    static WebResourceResponse notFound() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
        r.setStatusCodeAndReasonPhrase(404, "Not Found");
        r.setResponseHeaders(noStore());
        return r;
    }

    /** /js/app.js → assets/web/js/app.js ; /__file/<token>/<nama> → berkas terdaftar. */
    WebResourceResponse serveApp(String path, Map<String, String> reqHeaders) {
        if (path.startsWith("/__file/")) {
            String[] parts = path.substring(8).split("/", 2);
            File f;
            synchronized (files) { f = files.get(parts[0]); }
            return f == null ? notFound() : file(f, reqHeaders, null);
        }
        return asset("web" + path, null);
    }

    WebResourceResponse servePreview(String path, Map<String, String> reqHeaders) {
        if (path == null) return notFound();
        Map<String, String> cors = new HashMap<>();
        cors.put("Access-Control-Allow-Origin", "*");
        if (path.startsWith("/p/")) {
            String html;
            synchronized (previews) { html = previews.get(path.substring(3)); }
            if (html == null) return notFound();
            WebResourceResponse r = new WebResourceResponse("text/html", "utf-8", new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
            Map<String, String> h = noStore();
            h.putAll(cors);
            r.setResponseHeaders(h);
            return r;
        }
        if (path.startsWith("/lib/")) return asset("web/preview-lib/" + path.substring(5), cors);
        if (path.startsWith("/file/")) {
            String[] parts = path.substring(6).split("/", 2);
            File f;
            synchronized (files) { f = files.get(parts[0]); }
            return f == null ? notFound() : file(f, reqHeaders, cors);
        }
        return notFound();
    }

    String putPreview(String key, String html) {
        String k = key.replaceAll("[^A-Za-z0-9_.-]", "_");
        synchronized (previews) { previews.put(k, html); }
        return MainActivity.PREVIEW_BASE + "p/" + k;
    }

    /** Daftarkan berkas untuk dibaca halaman lewat token acak. */
    String fileToken(File f) {
        synchronized (files) {
            for (Map.Entry<String, File> e : files.entrySet()) if (e.getValue().equals(f)) return e.getKey();
            String t = UUID.randomUUID().toString().replace("-", "");
            files.put(t, f);
            if (files.size() > 400) files.remove(files.keySet().iterator().next());
            return t;
        }
    }

    /** Berkas dengan dukungan Range (video bisa digeser). */
    private WebResourceResponse file(File f, Map<String, String> req, Map<String, String> extra) {
        if (!f.isFile()) return notFound();
        try {
            long size = f.length(), start = 0, end = size - 1;
            boolean partial = false;
            String range = null;
            if (req != null) for (Map.Entry<String, String> e : req.entrySet()) if (e.getKey().equalsIgnoreCase("Range")) range = e.getValue();
            if (range != null && range.startsWith("bytes=")) {
                String[] se = range.substring(6).split("-", -1);
                try {
                    if (!se[0].isEmpty()) { start = Long.parseLong(se[0]); if (se.length > 1 && !se[1].isEmpty()) end = Math.min(Long.parseLong(se[1]), size - 1); }
                    else if (se.length > 1 && !se[1].isEmpty()) start = Math.max(0, size - Long.parseLong(se[1]));
                    partial = start > 0 || end < size - 1;
                } catch (NumberFormatException ignored) { start = 0; end = size - 1; }
            }
            Map<String, String> h = noStore();
            if (extra != null) h.putAll(extra);
            h.put("Accept-Ranges", "bytes");
            String m = mime(f.getName());
            InputStream in;
            if (partial) {
                final RandomAccessFile raf = new RandomAccessFile(f, "r");
                raf.seek(start);
                final long len = end - start + 1;
                in = new InputStream() {
                    long left = len;
                    @Override public int read() throws IOException { if (left <= 0) return -1; left--; return raf.read(); }
                    @Override public int read(byte[] b, int off, int n) throws IOException {
                        if (left <= 0) return -1;
                        int r = raf.read(b, off, (int) Math.min(n, left));
                        if (r > 0) left -= r;
                        return r;
                    }
                    @Override public void close() throws IOException { raf.close(); }
                };
                h.put("Content-Range", "bytes " + start + "-" + end + "/" + size);
                h.put("Content-Length", String.valueOf(len));
            } else {
                in = new FileInputStream(f);
                h.put("Content-Length", String.valueOf(size));
            }
            WebResourceResponse r = new WebResourceResponse(m, textual(m) ? "utf-8" : null, in);
            if (partial) r.setStatusCodeAndReasonPhrase(206, "Partial Content");
            r.setResponseHeaders(h);
            return r;
        } catch (IOException e) { return notFound(); }
    }
}
