// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
// Ownership notice, stored encoded and verified against checksums (same data
// and algorithm as Sources/Brand.swift).
'use strict';

const key = [0x9e, 0x3b, 0xd4, 0x71, 0xc2, 0x58, 0xe7, 0x0d, 0xa6];
const ownerBytes = [0x36, 0x45, 0xfc, 0xce, 0xdf, 0x21, 0x04, 0xac, 0x80, 0x21, 0x6c, 0x9f, 0xff, 0x34, 0x08];
const labelBytes = [0xb3, 0x8d, 0xb8, 0xfd, 0xdf, 0x2b, 0x50, 0xb5, 0xce, 0x46, 0x75, 0xd3, 0xd4, 0x30, 0x0a, 0x23,
  0x98, 0x39];
const legalBytes = [0x32, 0x4b, 0xe8, 0xc3, 0xcc, 0x26, 0x43, 0xbc, 0xd4, 0x46, 0xcf, 0x5a, 0xb3, 0x63, 0x56, 0x7d,
  0xcb, 0x77, 0x18, 0x17, 0xae, 0x18, 0x09, 0x73, 0x56, 0x72, 0x5e, 0x73, 0x3e, 0x49, 0x29, 0x66,
  0x5a, 0x4f, 0x33, 0x24, 0x41, 0x2c, 0x1c, 0x2c, 0x73, 0x44, 0xe0, 0x4c, 0x7f, 0x22, 0xdb, 0x72,
  0x44, 0x48, 0xa8, 0xc5, 0x24, 0x57, 0xd5];
const ownerSum = 0x1f54753f972257b1n;
const labelSum = 0xf5c6ff922a1a5e22n;
const legalSum = 0x9cfe2daeca9cdcabn;

function decode(b) {
  const out = Buffer.alloc(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b[i] ^ key[(i * 7 + 3) % key.length] ^ ((i * 31) & 0xff);
  return out.toString('utf8');
}

function fnv1a(s) {
  let h = 0xcbf29ce484222325n;
  for (const b of Buffer.from(s, 'utf8')) { h ^= BigInt(b); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return h;
}

const owner = decode(ownerBytes);
const label = decode(labelBytes);
const legal = decode(legalBytes);

function isIntact() {
  return fnv1a(owner) === ownerSum && fnv1a(label) === labelSum && fnv1a(legal) === legalSum
    && label.endsWith(owner) && legal.includes(owner);
}

/** The small copyright line in the window corner, re-asserted if removed. */
function installNotice(wc) {
  const js = `(function(){
    var T=${JSON.stringify(label)},L=${JSON.stringify(legal)};
    function ensure(){
      var el=document.getElementById('gx-notice');
      if(!el){el=document.createElement('div');el.id='gx-notice';document.body.appendChild(el);}
      if(el.textContent!==T)el.textContent=T;
      el.setAttribute('aria-label',L);
      el.style.cssText='position:fixed;right:10px;bottom:4px;font:400 9px/1.2 system-ui,-apple-system,"Segoe UI",Ubuntu,sans-serif;color:var(--text-3,#8a8fa8);pointer-events:none;z-index:2147483647;opacity:.6;display:block;visibility:visible';
      if(document.body.lastElementChild!==el)document.body.appendChild(el);
    }
    ensure();
    if(!window.__gxNotice){window.__gxNotice=setInterval(ensure,3000);}
  })();`;
  wc.executeJavaScript(js).catch(() => {});
}

module.exports = { owner, label, legal, isIntact, installNotice };
