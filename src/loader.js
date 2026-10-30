(function () {
  var V = '0.147.0', CORE = [
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r147/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@' + V + '/build/three.min.js',
    'https://unpkg.com/three@' + V + '/build/three.min.js'
  ];
  var ADD = [['controls/OrbitControls.js', 1], ['controls/TransformControls.js', 1], ['exporters/GLTFExporter.js', 0], ['loaders/GLTFLoader.js', 0], ['loaders/OBJLoader.js', 0], ['loaders/STLLoader.js', 0], ['loaders/PLYLoader.js', 0], ['libs/fflate.min.js', 0], ['curves/NURBSUtils.js', 0], ['curves/NURBSCurve.js', 0], ['loaders/FBXLoader.js', 0], ['loaders/ColladaLoader.js', 0], ['loaders/TDSLoader.js', 0], ['loaders/3MFLoader.js', 0]];
  var msg = function (t) { var m = document.getElementById('loading-msg'); if (m) m.textContent = t; };
  function load(urls, done) {
    var i = 0;
    (function next() {
      if (i >= urls.length) return done(false);
      var s = document.createElement('script'); s.src = urls[i++]; s.async = false;
      s.onload = function () { done(true); }; s.onerror = function () { s.remove(); next(); };
      document.head.appendChild(s);
    })();
  }
  function fail(t) { msg(t); var l = document.getElementById('loading'); if (l) l.hidden = false; }
  function start() {
/*MODULES*/
  }
  if (window.__FW_OFFLINE && window.THREE) { /* Offline-Fassung: three.js ist schon eingebettet */
    try { start(); var l0 = document.getElementById('loading'); if (l0) l0.hidden = true; }
    catch (e) { console.error(e); fail('Start fehlgeschlagen: ' + (e && e.message ? e.message : e) + (/WebGL/i.test(String(e && e.message)) ? ' – WebGL ist in diesem Fenster nicht verfügbar.' : '')); }
    return;
  }
  load(CORE, function (ok) {
    if (!ok || !window.THREE) return fail('Die 3D-Bibliothek (three.js) konnte nicht geladen werden. Dieses Fenster blockiert vermutlich externe Skripte.');
    msg('Lade Werkzeuge …'); var pending = ADD.length, missing = [];
    ADD.forEach(function (a) {
      load(['https://cdn.jsdelivr.net/npm/three@' + V + '/examples/js/' + a[0], 'https://unpkg.com/three@' + V + '/examples/js/' + a[0]], function (ok2) {
        if (!ok2 && a[1]) missing.push(a[0]); pending--;
        if (pending === 0) {
          if (missing.length) return fail('Bibliothek unvollständig: ' + missing.join(', '));
          try { start(); var l = document.getElementById('loading'); if (l) l.hidden = true; }
          catch (e) { console.error(e); fail('Start fehlgeschlagen: ' + (e && e.message ? e.message : e) + (/WebGL/i.test(String(e && e.message)) ? ' – WebGL ist in diesem Fenster nicht verfügbar.' : '')); }
        }
      });
    });
  });
})();
