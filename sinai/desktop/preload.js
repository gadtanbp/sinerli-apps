// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Gives the page the same bridge entry point the macOS WKWebView provides.
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('webkit', {
  messageHandlers: {
    sinai: {
      postMessage(msg) {
        // Structured-clone the message so only plain data crosses.
        ipcRenderer.send('gx', JSON.parse(JSON.stringify(msg)));
      },
    },
  },
});

// Dropped files arrive as real paths (any file type), like on macOS.
window.addEventListener('drop', (e) => {
  const files = e.dataTransfer && e.dataTransfer.files;
  if (!files || !files.length) return;
  const paths = [];
  for (const f of files) {
    try { const p = webUtils.getPathForFile(f); if (p) paths.push(p); } catch (err) { /* not a disk file */ }
  }
  if (!paths.length) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  ipcRenderer.send('gx-drop', paths);
}, true);
