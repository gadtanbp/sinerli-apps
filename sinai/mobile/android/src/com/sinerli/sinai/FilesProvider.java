// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
package com.sinerli.sinai;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/**
 * Memberi aplikasi lain akses BACA sementara ke satu berkas Sinai (Bagikan,
 * Buka dengan, pemasang APK). Tidak diekspor: hanya URI yang diberi izin
 * lewat FLAG_GRANT_READ_URI_PERMISSION yang bisa dibuka, dan hanya berkas di
 * dalam folder aplikasi.
 */
public class FilesProvider extends ContentProvider {
    static final String AUTHORITY = "com.sinerli.sinai.files";

    static Uri uriFor(File f) {
        return new Uri.Builder().scheme("content").authority(AUTHORITY).appendPath("f").appendPath(f.getAbsolutePath()).build();
    }

    private File fileOf(Uri uri) throws FileNotFoundException {
        if (uri.getPathSegments().size() != 2 || !"f".equals(uri.getPathSegments().get(0))) throw new FileNotFoundException();
        File f = new File(uri.getPathSegments().get(1));
        try {
            String c = f.getCanonicalPath();
            String files = getContext().getFilesDir().getCanonicalPath(), cache = getContext().getCacheDir().getCanonicalPath();
            if (!(c.startsWith(files + "/") || c.startsWith(cache + "/")) || c.startsWith(files + "/secure/")) throw new FileNotFoundException();
            File r = new File(c);
            if (!r.isFile()) throw new FileNotFoundException();
            return r;
        } catch (IOException e) { throw new FileNotFoundException(); }
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        File f;
        try { f = fileOf(uri); } catch (FileNotFoundException e) { return null; }
        String[] cols = projection != null ? projection : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor c = new MatrixCursor(cols, 1);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i])) row[i] = f.length();
        }
        c.addRow(row);
        return c;
    }

    @Override
    public String getType(Uri uri) {
        try { return Assets.mime(fileOf(uri).getName()); } catch (FileNotFoundException e) { return null; }
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (mode != null && !mode.equals("r")) throw new SecurityException("Hanya baca");
        return ParcelFileDescriptor.open(fileOf(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
