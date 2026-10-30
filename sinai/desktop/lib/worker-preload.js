// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Lets the hidden helper page stream recorded/generated media into files the
// main process opened for it (identified by one-time tokens).
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gxw', {
  write: (token, bytes, append) => ipcRenderer.invoke('gxw-write', String(token), bytes, !!append),
  progress: (token, f) => ipcRenderer.send('gxw-progress', String(token), Number(f) || 0),
  done: (token, result) => ipcRenderer.send('gxw-done', String(token), result == null ? null : JSON.parse(JSON.stringify(result))),
});
