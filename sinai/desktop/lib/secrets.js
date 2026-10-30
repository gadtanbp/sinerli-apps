// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// API keys, encrypted with the OS credential store (Windows DPAPI, Linux
// libsecret/kwallet) through Electron safeStorage, kept in one file.
'use strict';
const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');
const { support, BridgeError } = require('./util');

let cache = null;
const encFile = () => path.join(support(), 'secrets.bin');
const plainFile = () => path.join(support(), 'secrets.json');

function canEncrypt() {
  if (process.env.SINAI_SECRET_STORE === 'file') return false;
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    // On Linux without a keyring Chromium falls back to a hard-coded key; treat
    // that like no encryption so the file at least gets owner-only permissions.
    if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend && safeStorage.getSelectedStorageBackend() === 'basic_text') return false;
    return true;
  } catch (e) { return false; }
}

function load() {
  if (cache) return cache;
  let result = {};
  try {
    if (fs.existsSync(encFile()) && canEncrypt()) {
      result = JSON.parse(safeStorage.decryptString(fs.readFileSync(encFile())));
    } else if (fs.existsSync(plainFile())) {
      result = JSON.parse(fs.readFileSync(plainFile(), 'utf8'));
    }
  } catch (e) { result = {}; }
  cache = result && typeof result === 'object' ? result : {};
  return cache;
}

function save(all) {
  const json = JSON.stringify(all);
  if (canEncrypt()) {
    const tmp = encFile() + '.tmp';
    fs.writeFileSync(tmp, safeStorage.encryptString(json), { mode: 0o600 });
    fs.renameSync(tmp, encFile());
    try { fs.rmSync(plainFile(), { force: true }); } catch (e) { /* ignore */ }
  } else {
    const tmp = plainFile() + '.tmp';
    fs.writeFileSync(tmp, json, { mode: 0o600 });
    fs.renameSync(tmp, plainFile());
    try { fs.chmodSync(plainFile(), 0o600); } catch (e) { /* Windows */ }
  }
}

module.exports = {
  get(key) { const v = load()[key]; return v == null ? null : v; },
  set(key, value) {
    if (!key) throw new BridgeError('key wajib');
    const all = Object.assign({}, load());
    if (value != null && value !== '') all[key] = String(value); else delete all[key];
    save(all);
    cache = all;
  },
  keys() { return Object.keys(load()); },
};
