// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
package com.sinerli.sinai;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * API key provider, token Sinerli, dan token konektor. Disimpan sebagai satu
 * berkas terenkripsi AES-256-GCM; kuncinya ada di Android Keystore (tidak bisa
 * diekspor, tidak ikut backup — lihat data_extraction_rules.xml).
 */
final class SecretStore {
    private static final String ALIAS = "sinai-secrets-v1";
    private final File file;
    private JSONObject cache;

    SecretStore(Context ctx) {
        File dir = new File(ctx.getFilesDir(), "secure");
        dir.mkdirs();
        file = new File(dir, "secrets.bin");
    }

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        kg.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return kg.generateKey();
    }

    private synchronized JSONObject load() {
        if (cache != null) return cache;
        cache = new JSONObject();
        if (!file.isFile()) return cache;
        try {
            byte[] all = Sandbox.readAll(file);
            if (all.length < 13) return cache;
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, all, 0, 12));
            byte[] plain = c.doFinal(all, 12, all.length - 12);
            cache = new JSONObject(new String(plain, StandardCharsets.UTF_8));
        } catch (Exception e) {
            // Kunci hilang (mis. data dipulihkan ke perangkat lain): mulai kosong, pengguna masuk ulang.
            cache = new JSONObject();
        }
        return cache;
    }

    private synchronized void save() throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = c.getIV();
        byte[] enc = c.doFinal(load().toString().getBytes(StandardCharsets.UTF_8));
        File tmp = new File(file.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) { out.write(iv); out.write(enc); }
        if (!tmp.renameTo(file)) throw new Exception("Gagal menyimpan rahasia");
    }

    synchronized String get(String key) {
        String v = load().optString(key, null);
        return v == null || v.isEmpty() ? null : v;
    }

    synchronized void set(String key, String value) throws Exception {
        if (key == null || key.isEmpty()) throw new Exception("key wajib diisi");
        if (value == null || value.isEmpty()) load().remove(key); else load().put(key, value);
        save();
    }

    synchronized List<String> keys() {
        List<String> out = new ArrayList<>();
        Iterator<String> it = load().keys();
        while (it.hasNext()) out.add(it.next());
        return out;
    }
}
