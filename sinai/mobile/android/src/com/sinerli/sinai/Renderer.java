// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
package com.sinerli.sinai;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.pdf.PdfDocument;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * HTML → PDF / PNG (berkas buatan AI, ekspor artifact & slide). WebView
 * tersembunyi digambar ke android.graphics.pdf.PdfDocument halaman demi
 * halaman, atau ke Bitmap untuk PNG — semuanya API publik Android.
 */
final class Renderer {
    interface Done { void ok(String path); void err(String msg); }

    private final MainActivity act;
    private boolean busy = false;

    Renderer(MainActivity act) { this.act = act; }

    void render(final JSONObject p, final Done done) {
        act.main.post(() -> {
            if (busy) { done.err("Render lain sedang berjalan, coba lagi sebentar."); return; }
            final File out;
            try { out = act.bridge.sandbox.guard(p.optString("outPath")); } catch (Exception e) { done.err(e.getMessage()); return; }
            final boolean pdf = !"png".equals(p.optString("format", "pdf"));
            // Ukuran halaman dalam piksel CSS (96 dpi) dan dalam poin PDF.
            final int cssW, cssH;
            final int ptW, ptH;
            if (p.has("width") && p.optInt("width") > 0) {
                cssW = p.optInt("width");
                cssH = p.optInt("pageHeight", 720);
                ptW = Math.round(cssW * 0.75f);
                ptH = Math.round(cssH * 0.75f);
            } else {
                boolean letter = "letter".equals(p.optString("paper"));
                boolean land = p.optBoolean("landscape");
                int w = letter ? 816 : 794, h = letter ? 1056 : 1123;
                cssW = land ? h : w;
                cssH = land ? w : h;
                ptW = Math.round(cssW * 0.75f);
                ptH = Math.round(cssH * 0.75f);
            }
            final int maxPages = p.optInt("pages", 0);
            busy = true;
            final WebView w = new WebView(act);
            w.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
            w.getSettings().setJavaScriptEnabled(true);
            w.getSettings().setAllowFileAccess(false);
            w.getSettings().setAllowContentAccess(false);
            w.setInitialScale(100);
            w.setBackgroundColor(Color.WHITE);
            w.setVerticalScrollBarEnabled(false);
            w.setHorizontalScrollBarEnabled(false);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(cssW, cssH);
            w.setTranslationX(-cssW - 4000);   // di luar layar, tetap terpasang di jendela agar bisa digambar
            act.root.addView(w, 0, lp);
            final Runnable[] finish = new Runnable[1];
            final Runnable cleanup = () -> {
                busy = false;
                act.root.removeView(w);
                w.destroy();
            };
            w.setWebViewClient(new WebViewClient() {
                boolean started = false;
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                    if (MainActivity.PREVIEW_HOST.equals(req.getUrl().getHost())) return act.assets.servePreview(req.getUrl().getPath(), req.getRequestHeaders());
                    return null;
                }
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) { return true; }
                @Override
                public void onPageFinished(WebView view, String url) {
                    if (started) return;
                    started = true;
                    // Beri waktu font, gambar, dan skrip pratinjau (Tailwind/Mermaid) selesai.
                    act.main.postDelayed(finish[0], 900);
                }
            });
            final boolean[] over = {false};
            finish[0] = () -> {
                if (over[0]) return;
                over[0] = true;
                try {
                    int contentH = Math.max(cssH, Math.round(w.getContentHeight() * w.getScale()));
                    if (pdf) {
                        int pages = (int) Math.ceil(contentH / (double) cssH);
                        if (maxPages > 0) pages = Math.min(pages, maxPages);
                        pages = Math.max(1, Math.min(pages, 400));
                        w.layout(0, 0, cssW, contentH);
                        PdfDocument doc = new PdfDocument();
                        float s = ptW / (float) cssW;
                        for (int i = 0; i < pages; i++) {
                            PdfDocument.Page page = doc.startPage(new PdfDocument.PageInfo.Builder(ptW, ptH, i + 1).create());
                            Canvas c = page.getCanvas();
                            c.scale(s, s);
                            c.translate(0, -i * cssH);
                            c.clipRect(0, i * cssH, cssW, (i + 1) * cssH);
                            w.draw(c);
                            doc.finishPage(page);
                        }
                        File parent = out.getParentFile();
                        if (parent != null) parent.mkdirs();
                        try (OutputStream os = new FileOutputStream(out)) { doc.writeTo(os); }
                        doc.close();
                    } else {
                        int h = Math.min(contentH, 16000);
                        w.layout(0, 0, cssW, h);
                        Bitmap bmp = Bitmap.createBitmap(cssW, h, Bitmap.Config.ARGB_8888);
                        Canvas c = new Canvas(bmp);
                        c.drawColor(Color.WHITE);
                        w.draw(c);
                        File parent = out.getParentFile();
                        if (parent != null) parent.mkdirs();
                        try (OutputStream os = new FileOutputStream(out)) { bmp.compress(Bitmap.CompressFormat.PNG, 100, os); }
                        bmp.recycle();
                    }
                    cleanup.run();
                    done.ok(out.getAbsolutePath());
                } catch (Throwable e) {
                    cleanup.run();
                    done.err("Gagal membuat berkas: " + e.getMessage());
                }
            };
            String html = p.optString("html");
            w.loadDataWithBaseURL(MainActivity.PREVIEW_BASE, html, "text/html", "utf-8", null);
            // Pengaman: jangan menggantung bila halaman tidak pernah selesai dimuat.
            act.main.postDelayed(() -> { if (!over[0]) { w.stopLoading(); finish[0].run(); } }, 20000);
        });
    }
}
