// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
package com.sinerli.sinai;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;

/**
 * Sistem berkas Sinai di ponsel: hanya folder milik aplikasi
 * (files/home, files/support, cache). Setiap jalur dinormalkan lalu dicek
 * berada di dalam salah satu akar — tidak ada akses ke berkas lain.
 */
final class Sandbox {
    final File home, support, cache, temp;
    private final Context ctx;
    private final String filesRoot, cacheRoot;

    Sandbox(Context ctx) {
        this.ctx = ctx;
        File files = ctx.getFilesDir();
        home = new File(files, "home");
        support = new File(files, "support");
        cache = ctx.getCacheDir();
        temp = new File(cache, "tmp");
        home.mkdirs();
        support.mkdirs();
        temp.mkdirs();
        filesRoot = canon(files);
        cacheRoot = canon(cache);
    }

    private static String canon(File f) {
        try { return f.getCanonicalPath(); } catch (IOException e) { return f.getAbsolutePath(); }
    }

    /** Jalur di dalam sandbox, atau galat. */
    File guard(String path) throws IOException {
        if (path == null || path.isEmpty()) throw new IOException("path wajib diisi");
        File f = new File(path.startsWith("/") ? path : new File(home, path).getPath());
        String c = canon(f);
        if (c.equals(filesRoot) || c.startsWith(filesRoot + "/") || c.equals(cacheRoot) || c.startsWith(cacheRoot + "/")) return new File(c);
        throw new IOException("Di luar folder aplikasi: " + path);
    }

    File existing(String path) throws IOException {
        File f = guard(path);
        if (!f.isFile()) throw new IOException("File tidak ditemukan: " + path);
        return f;
    }

    private File storeFile(String name) throws IOException {
        if (name == null || name.isEmpty() || name.contains("..") || name.startsWith("/")) throw new IOException("Nama tidak valid");
        return new File(support, name);
    }

    // ------------------------------------------------------------------ store.* (data aplikasi)

    String storeRead(String name) throws IOException {
        File f = storeFile(name);
        if (!f.isFile()) return null;
        return new String(readAll(f), StandardCharsets.UTF_8);
    }

    void storeWrite(String name, String content) throws IOException {
        File f = storeFile(name);
        f.getParentFile().mkdirs();
        File tmp = new File(f.getPath() + ".tmp-" + System.nanoTime());
        try (OutputStream out = new FileOutputStream(tmp)) { out.write(content.getBytes(StandardCharsets.UTF_8)); }
        if (!tmp.renameTo(f)) { try (OutputStream out = new FileOutputStream(f)) { out.write(content.getBytes(StandardCharsets.UTF_8)); } tmp.delete(); }
    }

    void storeDelete(String name) throws IOException {
        File f = storeFile(name);
        if (f.equals(support)) throw new IOException("Nama tidak valid");
        deleteTree(f);
    }

    JSONArray storeList(String dir) throws IOException {
        File d = dir == null || dir.isEmpty() ? support : storeFile(dir);
        JSONArray a = new JSONArray();
        String[] names = d.list();
        if (names != null) for (String n : names) if (!n.startsWith(".") && !n.contains(".tmp-")) a.put(n);
        return a;
    }

    // ------------------------------------------------------------------ fs.* primitif

    JSONObject readBytes(String path, long offset, long length) throws IOException, JSONException {
        File f = existing(path);
        long size = f.length();
        long n = length > 0 ? Math.min(length, Math.max(0, size - offset)) : Math.max(0, size - offset);
        if (n > 300L * 1048576) throw new IOException("Berkas terlalu besar untuk dibaca sekaligus");
        byte[] buf = new byte[(int) n];
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) { raf.seek(offset); raf.readFully(buf); }
        JSONObject o = new JSONObject();
        o.put("base64", Base64.encodeToString(buf, Base64.NO_WRAP));
        o.put("size", size);
        o.put("mtime", f.lastModified());
        return o;
    }

    JSONObject writeBytes(String path, byte[] data, boolean append) throws IOException, JSONException {
        File f = guard(path);
        File parent = f.getParentFile();
        if (parent != null) parent.mkdirs();
        try (OutputStream out = new FileOutputStream(f, append)) { out.write(data); }
        JSONObject o = new JSONObject();
        o.put("path", f.getAbsolutePath());
        o.put("bytes", f.length());
        return o;
    }

    JSONObject stat(String path) throws JSONException {
        JSONObject o = new JSONObject();
        File f;
        try { f = guard(path); } catch (IOException e) { o.put("exists", false); o.put("path", path); return o; }
        o.put("path", f.getAbsolutePath());
        if (!f.exists()) { o.put("exists", false); return o; }
        o.put("exists", true);
        o.put("isDir", f.isDirectory());
        o.put("size", f.isDirectory() ? 0 : f.length());
        o.put("mtime", f.lastModified());
        return o;
    }

    JSONObject listDir(String path) throws IOException, JSONException {
        File d = guard(path);
        if (!d.isDirectory()) throw new IOException("Folder tidak ditemukan: " + path);
        JSONArray a = new JSONArray();
        File[] list = d.listFiles();
        if (list != null) for (File f : list) {
            JSONObject e = new JSONObject();
            e.put("name", f.getName());
            e.put("dir", f.isDirectory());
            e.put("size", f.isDirectory() ? 0 : f.length());
            e.put("mtime", f.lastModified());
            a.put(e);
        }
        return new JSONObject().put("entries", a);
    }

    void mkdir(String path) throws IOException {
        File d = guard(path);
        if (!d.isDirectory() && !d.mkdirs()) throw new IOException("Gagal membuat folder");
    }

    void remove(String path) throws IOException {
        File f = guard(path);
        String c = canon(f);
        if (c.equals(filesRoot) || c.equals(cacheRoot) || f.equals(home) || f.equals(support)) throw new IOException("Menolak menghapus folder ini");
        deleteTree(f);
    }

    void move(String from, String to) throws IOException {
        File a = guard(from), b = guard(to);
        if (!a.exists()) throw new IOException("Sumber tidak ditemukan");
        if (b.exists()) throw new IOException("Tujuan sudah ada");
        File parent = b.getParentFile();
        if (parent != null) parent.mkdirs();
        if (!a.renameTo(b)) throw new IOException("Gagal memindahkan");
    }

    // ------------------------------------------------------------------ impor dari aplikasi lain

    /** Salin isi content:// (pemilih berkas / dibagikan) ke cache/<folder>/. */
    File importUri(Uri u, String folder) {
        ContentResolver cr = ctx.getContentResolver();
        String name = "berkas";
        try (Cursor c = cr.query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) name = c.getString(0);
        } catch (Exception ignored) { }
        name = name.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_");
        if (name.isEmpty() || name.startsWith(".")) name = "berkas" + name;
        File dir = new File(cache, folder + "/" + System.currentTimeMillis());
        dir.mkdirs();
        File out = new File(dir, name);
        try (InputStream in = cr.openInputStream(u); OutputStream os = new FileOutputStream(out)) {
            if (in == null) return null;
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            return out;
        } catch (Exception e) {
            out.delete();
            return null;
        }
    }

    static byte[] readAll(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream((int) Math.max(16, f.length()));
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    static void deleteTree(File f) {
        if (f.isDirectory()) {
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) deleteTree(k);
        }
        f.delete();
    }
}
