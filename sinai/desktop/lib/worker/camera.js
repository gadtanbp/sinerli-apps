// Sinai — Copyright © 2026 Gadtan x Gallen. All rights reserved.
(function () {
  'use strict';
  var token = decodeURIComponent(location.hash.slice(1));
  var v = document.getElementById('v'), c = document.getElementById('c'), msg = document.getElementById('msg');
  var shot = document.getElementById('shot'), use = document.getElementById('use'), retake = document.getElementById('retake');
  var cancel = document.getElementById('cancel'), dev = document.getElementById('dev');
  var stream = null;

  function stop() { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }

  async function start(deviceId) {
    stop();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      v.srcObject = stream;
      shot.disabled = false;
      msg.hidden = true;
      var cams = (await navigator.mediaDevices.enumerateDevices()).filter(function (d) { return d.kind === 'videoinput'; });
      dev.innerHTML = '';
      cams.forEach(function (d, i) {
        var o = document.createElement('option');
        o.value = d.deviceId; o.textContent = d.label || ('Kamera ' + (i + 1));
        if (stream.getVideoTracks()[0].getSettings().deviceId === d.deviceId) o.selected = true;
        dev.appendChild(o);
      });
      dev.hidden = cams.length < 2;
    } catch (e) {
      msg.hidden = false;
      msg.textContent = /NotAllowed|Permission/i.test(e.name + e.message) ? 'Akses kamera ditolak. Izinkan kamera di pengaturan privasi sistem.' : /NotFound/i.test(e.name) ? 'Kamera tidak ditemukan.' : 'Kamera tidak bisa dibuka: ' + e.message;
      v.hidden = true;
    }
  }

  dev.addEventListener('change', function () { start(dev.value); });
  shot.addEventListener('click', function () {
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    v.style.display = 'none'; c.style.display = 'block';
    shot.hidden = true; use.hidden = false; retake.hidden = false;
  });
  retake.addEventListener('click', function () {
    v.style.display = ''; c.style.display = 'none';
    shot.hidden = false; use.hidden = true; retake.hidden = true;
  });
  use.addEventListener('click', function () {
    use.disabled = true;
    c.toBlob(async function (blob) {
      try {
        await gxw.write(token, new Uint8Array(await blob.arrayBuffer()), false);
        stop();
        gxw.done(token, { ok: true });
      } catch (e) { gxw.done(token, { error: 'Foto gagal disimpan' }); }
    }, 'image/png');
  });
  cancel.addEventListener('click', function () { stop(); gxw.done(token, null); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { stop(); gxw.done(token, null); } });
  start();
})();
