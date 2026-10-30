// Sinerli Apps — Copyright © 2026 Gadtan x Gallen. All rights reserved.
//
// Shell native bersama untuk Sinerli Rupa, Dokum, Hitara, Present & Note
// (Windows, macOS, Linux, Android). UI aplikasi = berkas web di dalam binary;
// shell ini hanya menyediakan perintah yang dipanggil `_core/sn-core.js`:
//
//   secret_get / secret_set   token login di penyimpanan rahasia OS
//   open_url                  buka tautan di browser bawaan
//   oauth_listen              server loopback 127.0.0.1 sekali pakai untuk login (desktop)
//   oauth_start               login lewat browser + deep link (ponsel)
//   save_file                 dialog "Simpan sebagai" untuk ekspor
//   set_theme                 tema jendela terang/gelap
//   launch_app                buka aplikasi Sinerli lain (skema sinerli-<app>://)
//
// Keamanan: hanya halaman bawaan aplikasi yang bisa memanggil perintah ini
// (capabilities/default.json), CSP melarang skrip dari luar, dan DevTools
// tidak tersedia di build rilis.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const SERVICE: &str = "com.sinerli.apps";

#[tauri::command]
fn secret_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    secrets::get(&app, &key)
}

#[tauri::command]
fn secret_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    secrets::set(&app, &key, &value)
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost") || url.starts_with("mailto:")) {
        return Err("url ditolak".into());
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Dengarkan SATU permintaan GET /callback di 127.0.0.1:port, lalu kirim
/// event `oauth-callback` {url} ke UI. Berhenti sendiri setelah 5 menit.
#[tauri::command]
fn oauth_listen(app: AppHandle, port: u16) -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| e.to_string())?;
    listener.set_nonblocking(false).ok();
    std::thread::spawn(move || {
        let deadline = std::time::Instant::now() + Duration::from_secs(300);
        listener.set_nonblocking(true).ok();
        while std::time::Instant::now() < deadline {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
                    let mut buf = [0u8; 8192];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]);
                    let path = req.lines().next().and_then(|l| l.split_whitespace().nth(1)).unwrap_or("").to_string();
                    if !path.starts_with("/callback") {
                        let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                        continue;
                    }
                    let body = "<!doctype html><meta charset=utf-8><title>Sinerli</title><body style=\"font:16px system-ui;display:grid;place-items:center;height:90vh;color:#222\"><div style=\"text-align:center\"><h2>Login berhasil ✓</h2><p>Kembali ke aplikasi Sinerli. Jendela ini boleh ditutup.<br>Signed in — you can close this window.</p></div>";
                    let resp = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{}", body.len(), body);
                    let _ = stream.write_all(resp.as_bytes());
                    let _ = app.emit("oauth-callback", serde_json::json!({ "url": format!("http://127.0.0.1:{}{}", port, path) }));
                    if let Some(w) = app.get_webview_window("main") { let _ = w.set_focus(); }
                    return;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(80)),
                Err(_) => return,
            }
        }
    });
    Ok(port)
}

/// Ponsel: buka halaman login di browser; kembalinya lewat deep link
/// com.sinerli.apps:/oauth/callback yang diteruskan plugin deep-link.
#[tauri::command]
fn oauth_start(app: AppHandle, url: String) -> Result<(), String> {
    open_url(app, url)
}

#[tauri::command]
async fn save_file(app: AppHandle, name: String, data: String) -> Result<bool, String> {
    use base64::Engine;
    use tauri_plugin_dialog::DialogExt;
    let bytes = base64::engine::general_purpose::STANDARD.decode(data.as_bytes()).map_err(|e| e.to_string())?;
    let safe: String = name.chars().map(|c| if "/\\:*?\"<>|".contains(c) { '-' } else { c }).collect();
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().set_file_name(&safe).save_file(move |p| { let _ = tx.send(p); });
    let picked = tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten()).await.map_err(|e| e.to_string())?;
    match picked {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            std::fs::write(path, bytes).map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

#[tauri::command]
fn set_theme(app: AppHandle, theme: String) {
    #[cfg(desktop)]
    if let Some(w) = app.get_webview_window("main") {
        let t = if theme == "dark" { Some(tauri::Theme::Dark) } else { Some(tauri::Theme::Light) };
        let _ = w.set_theme(t);
    }
    let _ = (&app, &theme);
}

#[tauri::command]
fn launch_app(app: AppHandle, app_id: Option<String>, app_name: Option<String>) -> Result<(), String> {
    let id = app_id.or(app_name).unwrap_or_default();
    if !["rupa", "dokum", "hitara", "present", "note", "sinai"].contains(&id.as_str()) { return Err("aplikasi tidak dikenal".into()); }
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(format!("sinerli-{}://open", id), None::<&str>).map_err(|e| e.to_string())
}

mod secrets {
    use super::*;
    /// Desktop: Keychain (macOS), Credential Manager (Windows), Secret Service (Linux).
    #[cfg(desktop)]
    pub fn get(_app: &AppHandle, key: &str) -> Result<Option<String>, String> {
        match keyring::Entry::new(SERVICE, key).and_then(|e| e.get_password()) {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    #[cfg(desktop)]
    pub fn set(_app: &AppHandle, key: &str, value: &str) -> Result<(), String> {
        let e = keyring::Entry::new(SERVICE, key).map_err(|e| e.to_string())?;
        if value.is_empty() { match e.delete_credential() { Ok(_) | Err(keyring::Error::NoEntry) => Ok(()), Err(x) => Err(x.to_string()) } }
        else { e.set_password(value).map_err(|e| e.to_string()) }
    }
    /// Android: berkas di penyimpanan privat aplikasi (sandbox per-aplikasi, tidak bisa dibaca aplikasi lain).
    #[cfg(mobile)]
    fn file(app: &AppHandle, key: &str) -> Result<std::path::PathBuf, String> {
        let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("secure");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let safe: String = key.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect();
        Ok(dir.join(safe))
    }
    #[cfg(mobile)]
    pub fn get(app: &AppHandle, key: &str) -> Result<Option<String>, String> {
        match std::fs::read_to_string(file(app, key)?) { Ok(v) => Ok(Some(v)), Err(_) => Ok(None) }
    }
    #[cfg(mobile)]
    pub fn set(app: &AppHandle, key: &str, value: &str) -> Result<(), String> {
        let f = file(app, key)?;
        if value.is_empty() { let _ = std::fs::remove_file(f); Ok(()) } else { std::fs::write(f, value).map_err(|e| e.to_string()) }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        // Satu jendela per aplikasi: membuka lagi hanya memfokuskan jendela yang ada.
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") { let _ = w.unminimize(); let _ = w.set_focus(); }
            for a in argv {
                if a.contains("://oauth/callback") || a.contains(":/oauth/callback") { let _ = app.emit("oauth-callback", serde_json::json!({ "url": a })); }
                else if a.starts_with("sinerli-") { let _ = app.emit("deep-link", serde_json::json!({ "url": a })); }
            }
        }));
    }
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            use tauri_plugin_deep_link::DeepLinkExt;
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    let s = url.to_string();
                    if s.contains("oauth/callback") { let _ = handle.emit("oauth-callback", serde_json::json!({ "url": s })); }
                    else { let _ = handle.emit("deep-link", serde_json::json!({ "url": s })); }
                }
            });
            #[cfg(any(windows, target_os = "linux"))]
            { let _ = app.deep_link().register_all(); }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![secret_get, secret_set, open_url, oauth_listen, oauth_start, save_file, set_theme, launch_app])
        .run(tauri::generate_context!())
        .expect("gagal menjalankan aplikasi Sinerli");
}
