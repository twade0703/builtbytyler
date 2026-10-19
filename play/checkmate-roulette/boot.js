// Starts the Godot web build under a strict CSP (no inline script).
// The engine's .wasm is shipped in parts so every file fits the host's 25 MiB limit;
// this stitches them back together when the engine asks for the .wasm.
(function () {
  'use strict';
  var cfg = JSON.parse(document.getElementById('godot-config').textContent);
  var fill = document.getElementById('fill');
  var msg = document.getElementById('msg');
  var status = document.getElementById('status');
  var wasmName = cfg.executable + '.wasm';

  function fail(text) {
    msg.textContent = text;
    msg.style.color = '#ff6b81';
  }

  var realFetch = window.fetch.bind(window);
  var stitched = null;

  function stitchWasm() {
    if (stitched) return stitched;
    stitched = realFetch(wasmName + '.parts', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('parts manifest ' + r.status);
        return r.json();
      })
      .then(function (parts) {
        return Promise.all(parts.map(function (p) {
          return realFetch(p).then(function (r) {
            if (!r.ok) throw new Error(p + ' ' + r.status);
            return r.arrayBuffer();
          });
        }));
      })
      .then(function (buffers) {
        var blob = new Blob(buffers, { type: 'application/wasm' });
        return blob;
      });
    return stitched;
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var path = url.split('?')[0];
    if (path === wasmName || path.endsWith('/' + wasmName)) {
      return stitchWasm().then(function (blob) {
        return new Response(blob, {
          status: 200,
          headers: { 'Content-Type': 'application/wasm', 'Content-Length': String(blob.size) },
        });
      });
    }
    return realFetch(input, init);
  };

  var missing = Engine.getMissingFeatures({ threads: false });
  if (missing.length) {
    fail('This browser is missing: ' + missing.join(', ') + '. Try a recent Chrome, Edge or Firefox, or the Windows download.');
    return;
  }

  var engine = new Engine(cfg);
  engine.startGame({
    onProgress: function (current, total) {
      if (total > 0) fill.style.width = Math.min(100, (current / total) * 100) + '%';
    },
  }).then(function () {
    status.style.transition = 'opacity .4s';
    status.style.opacity = '0';
    setTimeout(function () { status.remove(); }, 450);
  }, function (err) {
    fail('Could not start the game: ' + (err && err.message ? err.message : err));
  });
})();
