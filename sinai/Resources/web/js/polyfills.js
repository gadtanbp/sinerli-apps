/* Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved. */
/* Small polyfills so the UI runs on the WebKit shipped with macOS 10.15+. */
(function () {
  'use strict';
  function at(n) {
    n = Math.trunc(n) || 0;
    if (n < 0) n += this.length;
    if (n < 0 || n >= this.length) return undefined;
    return this[n];
  }
  [Array, String].forEach(function (C) {
    if (!C.prototype.at) Object.defineProperty(C.prototype, 'at', { value: at, writable: true, configurable: true });
  });
  if (!Object.hasOwn) {
    Object.hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  }
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function (a, b) {
      return a instanceof RegExp ? this.replace(a, b) : this.split(a).join(b);
    };
  }
  if (!window.structuredClone) {
    window.structuredClone = function (v) { return JSON.parse(JSON.stringify(v)); };
  }
})();
