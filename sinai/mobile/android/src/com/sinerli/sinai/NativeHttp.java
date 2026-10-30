// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
package com.sinerli.sinai;

import android.util.Base64;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import javax.net.ssl.SSLException;

/**
 * HTTP untuk lapisan web (tanpa CORS), kontrak sama dengan Sources/HTTPClient.swift:
 *   http.request → {status, headers, url, truncated, body|base64}
 *   http.stream  → event http.head / http.data (per baris, cocok untuk SSE) / http.done / http.fail;
 *                  respons error (≥ 400) dikirim utuh sebagai body di http.done.
 */
final class NativeHttp {
    private final Bridge bridge;
    private final Map<String, HttpURLConnection> live = new ConcurrentHashMap<>();
    private final Map<String, Boolean> aborted = new ConcurrentHashMap<>();

    NativeHttp(Bridge bridge) { this.bridge = bridge; }

    private HttpURLConnection open(JSONObject p, int defaultTimeoutSec) throws IOException, JSONException {
        URL url = new URL(p.optString("url"));
        String proto = url.getProtocol().toLowerCase();
        if (!proto.equals("https") && !proto.equals("http")) throw new IOException("URL tidak valid");
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        String method = p.optString("method", "GET").toUpperCase();
        c.setRequestMethod(method);
        c.setInstanceFollowRedirects(true);
        int t = p.optInt("timeout", 0) > 0 ? p.optInt("timeout") : defaultTimeoutSec;
        c.setConnectTimeout(Math.min(t, 30) * 1000);
        c.setReadTimeout(t * 1000);
        c.setUseCaches(false);
        JSONObject h = p.optJSONObject("headers");
        boolean ua = false;
        if (h != null) {
            Iterator<String> it = h.keys();
            while (it.hasNext()) {
                String k = it.next();
                if (k.equalsIgnoreCase("host") || k.equalsIgnoreCase("content-length") || k.equalsIgnoreCase("connection")) continue;
                if (k.equalsIgnoreCase("user-agent")) ua = true;
                c.setRequestProperty(k, h.optString(k));
            }
        }
        if (!ua) c.setRequestProperty("User-Agent", "Sinai/" + BuildConfig.VERSION + " (Android)");
        if (p.has("body") && !p.isNull("body") && !method.equals("GET") && !method.equals("HEAD")) {
            byte[] body = p.optString("body").getBytes(StandardCharsets.UTF_8);
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(body.length);
            try (OutputStream out = c.getOutputStream()) { out.write(body); }
        }
        return c;
    }

    private static JSONObject headers(HttpURLConnection c) throws JSONException {
        JSONObject h = new JSONObject();
        for (Map.Entry<String, List<String>> e : c.getHeaderFields().entrySet()) {
            if (e.getKey() == null) continue;
            h.put(e.getKey().toLowerCase(), e.getValue() == null ? "" : String.join(", ", e.getValue()));
        }
        return h;
    }

    private static String friendly(Exception e) {
        if (e instanceof UnknownHostException) return "Server tidak ditemukan (periksa koneksi internet / alamat).";
        if (e instanceof SocketTimeoutException) return "Waktu koneksi habis.";
        if (e instanceof SSLException) return "Sertifikat keamanan server tidak valid.";
        String m = e.getMessage();
        if (m != null && m.contains("Cleartext HTTP traffic")) return "Alamat http:// diblokir demi keamanan — gunakan https://.";
        return m != null ? m : "Koneksi gagal";
    }

    private static Charset charset(HttpURLConnection c) {
        String ct = c.getContentType();
        if (ct != null) {
            for (String part : ct.split(";")) {
                part = part.trim();
                if (part.toLowerCase().startsWith("charset=")) {
                    try { return Charset.forName(part.substring(8).replace("\"", "").trim()); } catch (Exception ignored) { }
                }
            }
        }
        return StandardCharsets.UTF_8;
    }

    JSONObject request(JSONObject p) throws Exception {
        HttpURLConnection c = null;
        try {
            c = open(p, 120);
            int status = c.getResponseCode();
            InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
            int max = p.optInt("maxBytes", 8000000);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            boolean truncated = false;
            if (in != null) {
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (out.size() + n > max) { out.write(buf, 0, max - out.size()); truncated = true; break; }
                    out.write(buf, 0, n);
                }
                in.close();
            }
            JSONObject o = new JSONObject();
            o.put("status", status);
            o.put("headers", headers(c));
            o.put("url", c.getURL().toString());
            o.put("truncated", truncated);
            if (p.optBoolean("binary")) o.put("base64", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            else o.put("body", new String(out.toByteArray(), charset(c)));
            return o;
        } catch (IOException e) {
            throw new Exception(friendly(e));
        } finally {
            if (c != null) c.disconnect();
        }
    }

    void stream(final JSONObject p) {
        final String id = p.optString("id");
        bridge.io(() -> {
            HttpURLConnection c = null;
            int status = 0;
            try {
                // Model penalaran bisa diam lama: putus hanya setelah 15 menit tanpa data.
                c = open(p, 900);
                live.put(id, c);
                status = c.getResponseCode();
                bridge.emit("http.head", new JSONObject().put("id", id).put("status", status).put("headers", headers(c)));
                boolean error = status >= 400;
                InputStream in = error ? c.getErrorStream() : c.getInputStream();
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                if (in != null) {
                    byte[] chunk = new byte[16384];
                    int n;
                    while ((n = in.read(chunk)) > 0) {
                        buf.write(chunk, 0, n);
                        if (error) continue;
                        byte[] all = buf.toByteArray();
                        int nl = -1;
                        for (int i = all.length - 1; i >= 0; i--) if (all[i] == '\n') { nl = i; break; }
                        if (nl >= 0) {
                            bridge.emit("http.data", new JSONObject().put("id", id).put("data", new String(all, 0, nl + 1, StandardCharsets.UTF_8)));
                            buf.reset();
                            buf.write(all, nl + 1, all.length - nl - 1);
                        }
                    }
                    in.close();
                }
                String rest = new String(buf.toByteArray(), StandardCharsets.UTF_8);
                if (error) bridge.emit("http.done", new JSONObject().put("id", id).put("status", status).put("body", rest));
                else {
                    if (!rest.isEmpty()) bridge.emit("http.data", new JSONObject().put("id", id).put("data", rest));
                    bridge.emit("http.done", new JSONObject().put("id", id).put("status", status));
                }
            } catch (Exception e) {
                try {
                    if (aborted.remove(id) != null) bridge.emit("http.done", new JSONObject().put("id", id).put("status", status).put("aborted", true));
                    else bridge.emit("http.fail", new JSONObject().put("id", id).put("error", friendly(e)));
                } catch (JSONException ignored) { }
            } finally {
                live.remove(id);
                aborted.remove(id);
                if (c != null) c.disconnect();
            }
        });
    }

    void abort(String id) {
        HttpURLConnection c = live.get(id);
        if (c == null) return;
        aborted.put(id, true);
        bridge.io(c::disconnect);
    }

    void abortAll() {
        for (String id : live.keySet()) abort(id);
    }
}
