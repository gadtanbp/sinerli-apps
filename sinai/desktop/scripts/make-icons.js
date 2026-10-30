// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Builds the Windows (.ico) and Linux (PNG set) icons from "Logo app/Logo Sinai.png".
// Run with Electron so it works on every OS:  npx electron scripts/make-icons.js
'use strict';
const fs = require('fs');
const path = require('path');
const { app, nativeImage } = require('electron');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, '..', 'Logo app', 'Logo Sinai.png');
const OUT = path.join(ROOT, 'build');

function png(size) {
  const img = nativeImage.createFromPath(SRC);
  if (img.isEmpty()) throw new Error('Logo tidak ditemukan: ' + SRC);
  return img.resize({ width: size, height: size, quality: 'best' }).toPNG();
}

/** ICO with PNG-compressed entries (supported since Windows Vista). */
function ico(sizes) {
  const images = sizes.map((s) => ({ s, data: png(s) }));
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach((im, i) => {
    const e = 6 + i * 16;
    head.writeUInt8(im.s >= 256 ? 0 : im.s, e); head.writeUInt8(im.s >= 256 ? 0 : im.s, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(im.data.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += im.data.length;
  });
  return Buffer.concat([head].concat(images.map((im) => im.data)));
}

try {
  fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'icon.png'), png(512));
  for (const s of [16, 24, 32, 48, 64, 128, 256, 512]) fs.writeFileSync(path.join(OUT, 'icons', s + 'x' + s + '.png'), png(s));
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256]));
  console.log('icons written to ' + OUT);
  app.exit(0);
} catch (e) {
  console.error(e.message);
  app.exit(1);
}
