/* Fahrmodus: Rettungswagen im Kachel-Dortmund. Boden- und Kollisionskarte, Arcade-Fahrphysik, Tag/Nacht, Notruf-Mission. */
(function () {
  'use strict';
  const wait = () => new Promise(r => { const t = setInterval(() => { if (window.__ready && window.__v && window.__v.core) { clearInterval(t); r(); } }, 40); });
  let started = false;
  (async function boot() {
    await wait(); const q = new URLSearchParams(location.search), b = document.getElementById('gobtn'), d = document.getElementById('drvbtn');
    b.onclick = () => start(q, 'rtw'); if (d) d.onclick = () => start(q, 'driver'); if (q.has('game')) start(q, q.get('mode') === 'driver' ? 'driver' : 'rtw');
  })();

  async function start(q, mode) {
    if (started) return; started = true; const DRIVER = mode === 'driver';
    const V = window.__v, C = V.core, T = C.THREE, BASE = C.BASE, scene = C.scene, cam = C.cam;
    const say = document.getElementById('hud'); say.textContent = 'Lade Fahrdaten …';
    const buf = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.arrayBuffer(); });
    const [gb, cb, mb, mj] = await Promise.all([buf(BASE + 'ground.bin'), buf(BASE + 'col.bin'), buf(BASE + 'main.bin'), fetch(BASE + 'mission.json').then(r => r.json())]);
    /* ---------- Limousine (Fluchtwagen / Streifenwagen): Seitenprofil, mit Fase extrudiert ---------- */
    function buildSedan(color, police) {
      const g = new T.Group(), body = new T.MeshStandardMaterial({ color, roughness: 0.36, metalness: 0.55 }), glass = new T.MeshStandardMaterial({ color: 0x0c1218, roughness: 0.12, metalness: 0.7, side: T.DoubleSide }), dark = new T.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }), chrome = new T.MeshStandardMaterial({ color: 0xcfd3d6, roughness: 0.25, metalness: 0.9 });
      const sh = new T.Shape(); [[-2.40, 0.34], [-2.43, 0.64], [-2.38, 0.92], [-2.05, 1.00], [-1.15, 1.02], [-0.74, 1.36], [-0.36, 1.43], [0.55, 1.43], [0.98, 1.05], [1.30, 1.00], [2.12, 0.96], [2.40, 0.80], [2.42, 0.44], [2.30, 0.30]].forEach((p, i) => i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1]));
      const bg = new T.ExtrudeGeometry(sh, { depth: 1.5, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.14, bevelSegments: 3, curveSegments: 1 }); bg.translate(0, 0, -0.75); bg.rotateY(-Math.PI / 2);
      const bm = new T.Mesh(bg, body); g.add(bm);
      const win = new T.Shape(); [[-0.98, 1.06], [-0.68, 1.34], [-0.34, 1.39], [0.52, 1.39], [0.90, 1.08]].forEach((p, i) => i ? win.lineTo(p[0], p[1]) : win.moveTo(p[0], p[1])); win.closePath();
      for (const sx of [-1, 1]) { const m = new T.Mesh(new T.ShapeGeometry(win), glass); m.rotation.y = -Math.PI / 2; m.position.x = sx * 0.93; g.add(m); }
      const ws = new T.Mesh(new T.PlaneGeometry(1.46, 0.62), glass); ws.rotation.x = -0.83; ws.position.set(0, 1.25, 0.77); g.add(ws);
      const rw = new T.Mesh(new T.PlaneGeometry(1.42, 0.56), glass); rw.rotation.x = -2.27; rw.position.set(0, 1.21, -0.94); g.add(rw);
      const box = (w, h, d, x, y, z, m) => { const q = new T.Mesh(new T.BoxGeometry(w, h, d), m); q.position.set(x, y, z); g.add(q); return q; };
      box(1.9, 0.14, 0.2, 0, 0.42, 2.44, chrome); box(1.9, 0.14, 0.2, 0, 0.42, -2.46, chrome);                              // Stoßstangen
      const hl = new T.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xfff2c8, emissiveIntensity: 0.25 }), tl = new T.MeshStandardMaterial({ color: 0x7a0000, emissive: 0xff1010, emissiveIntensity: 0.35 });
      for (const sx of [-0.66, 0.66]) { box(0.38, 0.16, 0.06, sx, 0.78, 2.42, hl); box(0.42, 0.14, 0.06, sx, 0.84, -2.44, tl); }
      box(0.9, 0.22, 0.05, 0, 0.62, 2.43, dark);
      const wp = [['vorne links', 0.84, 1.45], ['vorne rechts', -0.84, 1.45], ['hinten links', 0.84, -1.45], ['hinten rechts', -0.84, -1.45]];
      for (const [nm, x, z] of wp) { const t = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.24, 18), dark); t.rotation.z = Math.PI / 2; t.position.set(x, 0.34, z); t.name = 'Reifen ' + nm; g.add(t);
        const f = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 0.26, 12), chrome); f.rotation.z = Math.PI / 2; f.position.copy(t.position); f.name = 'Felge ' + nm; g.add(f); }
      if (police) {
        box(1.7, 0.05, 0.1, 0, 0.74, 0.35, new T.MeshStandardMaterial({ color: 0x1a4d2e, roughness: 0.5 })).scale.set(1, 1, 1);
        const bl = new T.MeshStandardMaterial({ color: 0x0a2a8a, emissive: 0x1a44ff, emissiveIntensity: 0.1 }), rd = new T.MeshStandardMaterial({ color: 0x8a0a0a, emissive: 0xff2a1a, emissiveIntensity: 0.1 });
        box(0.5, 0.12, 0.3, 0.32, 1.51, 0, bl); box(0.5, 0.12, 0.3, -0.32, 1.51, 0, rd); g.userData.bar = [bl, rd];
        box(1.5, 0.04, 0.9, 0, 1.44, 0.4, new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
      }
      g.userData.hp = 1; return g;
    }
    const gltf = DRIVER ? { scene: buildSedan(0x7a1a22, false) } : await new Promise((res, rej) => new T.GLTFLoader().load('rtw.glb', res, undefined, rej));
    const RD = await C.ROADS.ready;                                   // Straßen, Wege, Wasser (Basis-DLM NRW) oder null
    const ground = new Uint16Array(gb), col = new Uint8Array(cb), main = new Uint8Array(mb);
    const GW = mj.gw || 769, GH = mj.gh || 1025, HMIN = -40, HSC = 1000, CW = mj.w, CH = mj.h, ROWB = mj.row_bytes, WX = GW * 4, WZ = GH * 4;
    // Höhe wie im Geländenetz: je Viereck zwei Dreiecke (a,b,c) und (b,d,c), damit Räder, Autos und Straßenbänder genau auf der gezeichneten Fläche liegen
    const gh = (x, z) => { const fx = Math.min(GW - 1.001, Math.max(0, x / 4)), fz = Math.min(GH - 1.001, Math.max(0, -z / 4)), j = fx | 0, i = fz | 0, u = fx - j, v = fz - i;
      const a = ground[i * GW + j], b = ground[i * GW + j + 1], c = ground[(i + 1) * GW + j], d = ground[(i + 1) * GW + j + 1];
      return HMIN + (u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d)) / HSC; };
    const bit = (a, i, j, out) => (i < 0 || j < 0 || i >= CH || j >= CW) ? out : (a[i * ROWB + (j >> 3)] >> (j & 7)) & 1;
    const occ = (x, z) => bit(col, Math.round(-z / 2), Math.round(x / 2), 1) === 1;
    const inMain = (x, z) => bit(main, Math.round(-z / 2), Math.round(x / 2), 0) === 1;
    const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.min(b, Math.max(a, v));

    /* ---------- Fahrzeug-Modell ---------- */
    const car3d = new T.Group(); car3d.add(gltf.scene); scene.add(car3d); car3d.rotation.order = 'YXZ';
    const wheels = { 'vorne links': null, 'vorne rechts': null, 'hinten links': null, 'hinten rechts': null }; const parts = {};
    gltf.scene.traverse(o => { const n = o.name.replace(/_/g, ' '); const m = /(Reifen|Felge) (vorne|hinten) (links|rechts)/.exec(n); if (m && o.isMesh) (parts[m[2] + ' ' + m[3]] = parts[m[2] + ' ' + m[3]] || []).push(o); });
    for (const k in parts) {
      const c = parts[k][0].position.clone(), steer = new T.Group(), spin = new T.Group(); steer.position.copy(c); steer.add(spin);
      parts[k].forEach(o => { o.parent.remove(o); o.position.set(0, 0, 0); spin.add(o); }); gltf.scene.add(steer); wheels[k] = { steer, spin, front: k.startsWith('vorne') };
    }
    const blue = []; gltf.scene.traverse(o => { if (o.isMesh && /Blaulicht (links|rechts)$/.test(o.name.replace(/_/g, ' '))) { o.material = o.material.clone(); o.material.emissive = new T.Color(0x0022ff); o.material.emissiveIntensity = 0; blue.push(o); } });
    const bl = [new T.PointLight(0x2255ff, 0, 22, 2), new T.PointLight(0x2255ff, 0, 22, 2)]; bl[0].position.set(0.6, 3.1, 1.55); bl[1].position.set(-0.6, 3.1, 1.55); bl.forEach(l => car3d.add(l));
    const heads = [-0.7, 0.7].map(x => { const s = new T.SpotLight(0xfff0cc, 0, 80, 0.5, 0.55, 1); s.position.set(x, 0.85, 2.6); s.target.position.set(x, 0, 24); car3d.add(s); car3d.add(s.target); return s; });

    /* ---------- Zustand ---------- */
    const car = { x: mj.start.x, z: mj.start.z, h: mj.start.heading, vx: 0, vz: 0, vf: 0, steer: 0, y: 0, pitch: 0, roll: 0, dmg: 0, siren: false, impact: 0, hp: 100, slip: 0 };
    const VP = DRIVER ? { vmax: 44, acc: 9.5, grip: 4.6, handGrip: 0.85, wb: 2.9, brake: 17 } : { vmax: 30, acc: 7.5, grip: 7, handGrip: 1.3, wb: 3.3, brake: 15 };   // Limousine: schneller, rutschiger
    const hurt = (rel) => { if (DRIVER) car.hp = Math.max(0, car.hp - Math.min(28, rel * 1.15)); };
    car.y = gh(car.x, car.z);
    const inp = { up: 0, down: 0, left: 0, right: 0, hand: 0 }; const keys = {};
    const sample = []; for (const a of [-1.1, 0, 1.1]) for (const b of [-2.95, -1.5, 0, 1.5, 2.95]) sample.push([a, b]);
    function blocked(x, z, h) { const c = Math.cos(h), s = Math.sin(h); for (const [a, b] of sample) if (occ(x + a * c + b * s, z - a * s + b * c)) return true; return false; }
    let audio = null;
    function sound() { if (audio) return audio; try {
      const A = new (window.AudioContext || window.webkitAudioContext)(), g = A.createGain(); g.gain.value = 0; g.connect(A.destination);
      const o = A.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 360; o.connect(g); o.start();
      const e = A.createOscillator(), eg = A.createGain(); e.type = 'sawtooth'; e.frequency.value = 40; eg.gain.value = 0.02; e.connect(eg); eg.connect(A.destination); e.start();
      const po = A.createOscillator(), pgn = A.createGain(); po.type = 'square'; po.frequency.value = 650; pgn.gain.value = 0; po.connect(pgn); pgn.connect(A.destination); po.start();
      const nb = A.createBuffer(1, A.sampleRate, A.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; const ns = A.createBufferSource(); ns.buffer = nb; ns.loop = true;
      const bp = A.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 1.1; const sg = A.createGain(); sg.gain.value = 0; ns.connect(bp); bp.connect(sg); sg.connect(A.destination); ns.start();
      audio = { A, g, o, e, eg, po, pgn, sg }; } catch (err) { audio = { A: null }; } return audio; }
    function thump(p) { const a = sound(); if (!a.A) return; try { const n = a.A.sampleRate * 0.25, bf = a.A.createBuffer(1, n, a.A.sampleRate), d = bf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.18)); const s = a.A.createBufferSource(), g = a.A.createGain(); g.gain.value = clamp(p / 20, 0.05, 0.5); s.buffer = bf; s.connect(g); g.connect(a.A.destination); s.start(); } catch (err) { } }

    function step(dt, k) {
      const h = car.h, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
      let vf = car.vx * fx + car.vz * fz, vl = car.vx * lx + car.vz * lz; const VMAX = VP.vmax * (DRIVER ? 0.55 + 0.45 * Math.min(1, car.hp / 45) : 1);
      if (k.up) vf += (vf < 0 ? 15 : VP.acc * (1 - Math.max(0, vf) / VMAX)) * dt;
      if (k.down) vf -= (vf > 0.4 ? VP.brake : 4.5 * (1 - Math.min(1, -vf / 8))) * dt;
      vf -= 0.012 * vf * Math.abs(vf) * dt; if (!k.up && !k.down) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 0.7 * dt);
      if (k.hand) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 8 * dt);
      car.slip = Math.abs(vl); vl *= Math.exp(-(k.hand ? VP.handGrip : VP.grip) * dt);
      const maxSt = 0.62 / (1 + Math.abs(vf) / 8), target = (k.left - k.right) * maxSt; car.steer += (target - car.steer) * Math.min(1, 7 * dt);
      const yaw = vf * Math.tan(car.steer) / VP.wb, nh = h + yaw * dt;
      const nfx = Math.sin(nh), nfz = Math.cos(nh), nlx = Math.cos(nh), nlz = -Math.sin(nh);
      let vx = vf * nfx + vl * nlx, vz = vf * nfz + vl * nlz; const sp0 = Math.hypot(vx, vz);
      const nx = car.x + vx * dt, nz = car.z + vz * dt; const inside = blocked(car.x, car.z, h); let hit = false;
      if (inside || !blocked(nx, nz, nh)) { car.x = nx; car.z = nz; car.h = nh; }
      else {
        hit = true;
        if (!blocked(nx, car.z, nh)) { car.x = nx; vz *= -0.1; }
        else if (!blocked(car.x, nz, nh)) { car.z = nz; vx *= -0.1; }
        else if (!blocked(car.x, car.z, nh)) { car.h = nh; vx *= -0.2; vz *= -0.2; }
        else { vx *= -0.15; vz *= -0.15; }
        vx *= 0.7; vz *= 0.7;
      }
      if (hit && sp0 > 4.5 && car.impact <= 0) { car.dmg++; car.impact = 0.4; thump(sp0); hurt(sp0); }
      car.impact -= dt; car.vx = vx; car.vz = vz; car.vf = vx * Math.sin(car.h) + vz * Math.cos(car.h); trafficCollide();
      // Boden folgen: vier Radpunkte
      const c = Math.cos(car.h), s = Math.sin(car.h), W = (a, b) => gh(car.x + a * c + b * s, car.z - a * s + b * c);
      const fl = W(0.85, 1.6), fr = W(-0.85, 1.6), rl = W(0.85, -1.4), rr = W(-0.85, -1.4);
      const ty = (fl + fr + rl + rr) / 4, tp = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, 3.0), tr = Math.atan2((fl + rl) / 2 - (fr + rr) / 2, 1.7), k2 = Math.min(1, 12 * dt);
      car.y += (ty - car.y) * k2; car.pitch += (tp - car.pitch) * k2; car.roll += (tr - car.roll) * k2;
    }

    /* ---------- Tag und Nacht ---------- */
    let tod = +(new URLSearchParams(location.search).get('t') || 14.5), todSpeed = 1 / 45; const SKY_N = new T.Color(0x0b1224), SKY_D = new T.Color(0xaec3d4), SKY_X = new T.Color(0xe0925c), tmp = new T.Color();
    function applyTime() {
      const ang = (tod - 6) / 12 * Math.PI, el = Math.sin(ang), f = clamp((el + 0.1) / 0.35, 0, 1); C.sun.position.set(Math.cos(ang) * 0.8, Math.max(0.05, Math.abs(el)) * (el >= 0 ? 1 : 0.3), 0.45);
      C.sun.intensity = 0.06 + 0.95 * clamp(el * 3, 0, 1); C.sun.color.setHex(el < 0.25 ? 0xffa868 : 0xfff1d8); C.hemi.intensity = 0.13 + 0.45 * f;
      tmp.copy(SKY_N).lerp(SKY_D, f); tmp.lerp(SKY_X, Math.max(0, 1 - Math.abs(el) / 0.22) * 0.55); scene.background.copy(tmp); if (scene.fog) scene.fog.color.copy(tmp);
      const night = el < 0.14; heads.forEach(s => s.intensity = night ? 3.2 : 0);
    }

    /* ---------- Oberfläche ---------- */
    const css = document.createElement('style'); css.textContent = `
    #gHud{position:fixed;right:12px;bottom:12px;color:#fff;font:600 13px system-ui;text-align:right;text-shadow:0 1px 3px #000;pointer-events:none}
    #gSpeed{font:700 44px ui-monospace,Consolas,monospace;line-height:1}
    #gMap{position:fixed;right:12px;top:12px;width:200px;height:200px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px #0008;background:#222}
    #gMis{position:fixed;left:50%;top:10px;transform:translateX(-50%);background:rgba(10,18,28,.82);color:#fff;padding:8px 14px;border-radius:8px;font:600 14px system-ui;text-align:center;min-width:300px;pointer-events:none}
    #gArrow{position:fixed;left:50%;top:84px;margin-left:-22px;width:44px;height:44px;pointer-events:none;transition:transform .08s}
    #gToast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:rgba(10,18,28,.85);color:#fff;padding:10px 18px;border-radius:8px;font:600 16px system-ui;pointer-events:none;opacity:0;transition:opacity .3s;text-align:center}
    #gHelp2{position:fixed;left:8px;bottom:8px;background:rgba(10,18,28,.7);color:#cfd9e4;padding:6px 9px;border-radius:6px;font:12px system-ui;max-width:calc(100vw - 260px)}`;
    document.head.appendChild(css);
    const mk = (tag, id, parent) => { const e = document.createElement(tag); e.id = id; (parent || document.body).appendChild(e); return e; };
    const hudEl = mk('div', 'gHud'), mapC = mk('canvas', 'gMap'), mis = mk('div', 'gMis'), arrow = mk('div', 'gArrow'), toast = mk('div', 'gToast'), help2 = mk('div', 'gHelp2');
    mapC.width = mapC.height = 200; arrow.innerHTML = '<svg viewBox="0 0 44 44" width="44" height="44"><path d="M22 3 L38 38 L22 30 L6 38 Z" fill="#ff3b30" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/></svg>';
    help2.innerHTML = DRIVER ? 'W/S Gas, Bremse · A/D lenken · Leertaste Handbremse (Driften) · T Tageszeit · R zurücksetzen · Esc zurück zum Flug' : 'W/S Gas, Bremse · A/D lenken · Leertaste Handbremse · L Blaulicht + Sirene · T Tageszeit · R zurücksetzen · Esc zurück zum Flug';
    document.getElementById('help').style.display = 'none';
    let toastT = 0; const msg = (t, s) => { toast.textContent = t; toast.style.opacity = 1; toastT = s || 3; };

    // Karte vorrendern (4 m je Pixel, Norden oben)
    const off = document.createElement('canvas'); off.width = GW; off.height = GH; const octx = off.getContext('2d'), img = octx.createImageData(GW, GH);
    for (let I = 0; I < GH; I++) for (let J = 0; J < GW; J++) {
      const h0 = ground[I * GW + J] / HSC + HMIN, hx = ground[I * GW + Math.min(GW - 1, J + 1)] / HSC + HMIN, hz = ground[Math.min(GH - 1, I + 1) * GW + J] / HSC + HMIN, sh = clamp(0.8 + (h0 - hx) * 0.06 + (h0 - hz) * 0.06, 0.45, 1.2);
      const row = GH - 1 - I, o = (row * GW + J) * 4; let r = 96 * sh, g = 140 * sh, b = 80 * sh;
      const i2 = I * 2, j2 = J * 2; if (bit(col, i2, j2, 0) | bit(col, i2 + 1, j2, 0) | bit(col, i2, j2 + 1, 0) | bit(col, i2 + 1, j2 + 1, 0)) { r = 70; g = 70; b = 78; }
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    octx.putImageData(img, 0, 0); drawRoadsOnMap(octx);
    const mctx = mapC.getContext('2d'), MR = 300, PXM = 200 / (2 * MR / 4);
    const toMap = (x, z) => [x / 4, GH - 1 + z / 4];
    function drawMap() {
      const [cx, cy] = toMap(car.x, car.z), half = MR / 4; mctx.save(); mctx.fillStyle = '#1b2a1b'; mctx.fillRect(0, 0, 200, 200);
      mctx.imageSmoothingEnabled = true; mctx.drawImage(off, cx - half, cy - half, half * 2, half * 2, 0, 0, 200, 200);
      const blip = (x, z, color) => { const [mx, my] = toMap(x, z); let px = 100 + (mx - cx) * PXM, py = 100 + (my - cy) * PXM; const dx = px - 100, dy = py - 100, d = Math.hypot(dx, dy), edge = d > 88; if (edge) { px = 100 + dx / d * 88; py = 100 + dy / d * 88; }
        mctx.fillStyle = color; mctx.strokeStyle = '#fff'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(px, py, edge ? 5 : 7, 0, 7); mctx.fill(); mctx.stroke(); };
      if (M.target) blip(M.target.x, M.target.z, M.state === 'toHospital' ? '#3a8dff' : '#ff3b30');
      mctx.translate(100, 100); mctx.rotate(Math.PI - car.h); mctx.fillStyle = '#fff'; mctx.strokeStyle = '#000'; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.moveTo(0, -9); mctx.lineTo(7, 8); mctx.lineTo(0, 4); mctx.lineTo(-7, 8); mctx.closePath(); mctx.fill(); mctx.stroke(); mctx.restore();
    }

    /* ---------- Notruf-Mission ---------- */
    const M = { state: 'idle', target: null, time: 0, loadT: 0, score: 0, count: 0, total: 0, last: '' }; let hosp = nearMain(mj.hospital.x, mj.hospital.z);
    function nearMain(x, z) { if (inMain(x, z)) return { x, z }; for (let r = 2; r < 400; r += 2) for (let a = 0; a < 360; a += 15) { const px = x + r * Math.cos(a * Math.PI / 180), pz = z + r * Math.sin(a * Math.PI / 180); if (inMain(px, pz)) return { x: px, z: pz }; } return { x, z }; }
    const markers = []; function marker(color) { const g = new T.Group(); const cyl = new T.Mesh(new T.CylinderGeometry(4, 4, 90, 24, 1, true), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: T.DoubleSide, depthWrite: false, fog: false }));
      const ring = new T.Mesh(new T.TorusGeometry(6, 0.35, 8, 40), new T.MeshBasicMaterial({ color, fog: false })); ring.rotation.x = Math.PI / 2; cyl.position.y = 45; g.add(cyl, ring); g.visible = false; scene.add(g); markers.push(g); return g; }
    const mkP = marker(0xff3b30), mkH = marker(0x3a8dff);
    function setTarget(t, which) { M.target = t; mkP.visible = which === 'p'; mkH.visible = which === 'h'; const m = which === 'p' ? mkP : mkH; m.position.set(t.x, gh(t.x, t.z), t.z); }
    function newMission() {
      let best = null; const tm = [0, 0, 0, 0];
      if (DR) for (let k = 0; k < 500 && !best; k++) { const E = DR.E[(Math.random() * DR.E.length) | 0]; if (E.len < 24 || DR.comp[E.a] !== DR.main) continue; pathAt(E, rnd(8, E.len - 8), tm); const x = tm[0], z = tm[1], d = Math.hypot(x - car.x, z - car.z), lim = k < 300 ? [450, 1300] : [200, 2500];
        if (d > lim[0] && d < lim[1] && inMain(x, z) && inMain(x + 4, z) && inMain(x - 4, z) && inMain(x, z + 4) && inMain(x, z - 4)) best = { x, z, d }; }
      if (!best) for (let k = 0; k < 600; k++) { const x = rnd(200, WX - 250), z = rnd(-(WZ - 200), -200), d = Math.hypot(x - car.x, z - car.z), lim = k < 300 ? [450, 1300] : [200, 2500];
        if (d > lim[0] && d < lim[1] && inMain(x, z) && inMain(x + 6, z) && inMain(x - 6, z) && inMain(x, z + 6) && inMain(x, z - 6)) { best = { x, z, d }; break; } }
      if (!best) best = { x: car.x + 300, z: car.z, d: 300 }; setTarget(best, 'p'); M.state = 'toPatient'; M.time = best.d / 9 + 50; M.count++;
      msg('Notruf! Patient markiert (rot). Blaulicht mit L.', 4);
    }
    function missionStep(dt) {
      if (M.state === 'idle') return; const sp = Math.abs(car.vf);
      if (M.state === 'toPatient' || M.state === 'toHospital') {
        M.time -= dt; const d = Math.hypot(M.target.x - car.x, M.target.z - car.z);
        if (M.time <= 0) { M.state = 'failed'; M.loadT = 5; mkP.visible = mkH.visible = false; M.target = null; msg('Zu spät. Der Einsatz ist gescheitert.', 5); return; }
        if (M.state === 'toPatient' && d < 7 && sp < 6) { M.state = 'loading'; M.loadT = 2.2; msg('Patient wird aufgenommen …', 2); }
        else if (M.state === 'toHospital' && d < 10 && sp < 6) { const s = Math.max(0, Math.round(300 + Math.min(M.time, 120) * 8 - car.dmg * 60)); M.score = s; M.total += s; M.state = 'done'; M.loadT = 7; mkH.visible = false; M.target = null; msg('Übergeben. Punkte: ' + s + ' (gesamt ' + M.total + '), Schäden ' + car.dmg, 6); }
      } else if (M.state === 'loading') { M.loadT -= dt; if (M.loadT <= 0) { setTarget(hosp, 'h'); M.state = 'toHospital'; M.time += Math.hypot(hosp.x - car.x, hosp.z - car.z) / 9 + 30; msg('Patient an Bord. Weiter zum Krankenhaus (blau).', 4); } }
      else if (M.state === 'done' || M.state === 'failed') { M.loadT -= dt; if (M.loadT <= 0) { car.dmg = M.state === 'done' ? 0 : car.dmg; newMission(); } }
    }
    M.penalty = 0;

    /* ---------- Straßennetz: Graph für Verkehr und Gehwege (Basis-DLM NRW) ---------- */
    const SPD = [13.9, 13.9, 11.1, 8.3, 8.3];                          // Tempo je Klasse (Bundes-, Landes-, Kreis-, Gemeindestraße, sonstige), m/s
    function mkPath(pts, extra) { const P = Float32Array.from(pts), n = P.length / 2, cum = new Float32Array(n); for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(P[2 * i] - P[2 * i - 2], P[2 * i + 1] - P[2 * i - 1]); return Object.assign({ P, cum, n, len: cum[n - 1] }, extra); }
    function pathAt(E, s, o) {                                          // o = [x, z, tx, tz]
      const cum = E.cum, P = E.P; s = clamp(s, 0, E.len); let lo = 0, hi = E.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
      const l = cum[hi] - cum[lo], t = l > 1e-6 ? (s - cum[lo]) / l : 0, dx = P[2 * hi] - P[2 * lo], dz = P[2 * hi + 1] - P[2 * lo + 1], dl = Math.hypot(dx, dz) || 1;
      o[0] = P[2 * lo] + dx * t; o[1] = P[2 * lo + 1] + dz * t; o[2] = dx / dl; o[3] = dz / dl; return o;
    }
    function mkGrid(list, cell) {                                       // Abtastpunkte (alle ~12 m) je Rasterzelle
      const g = new Map(); list.forEach((E, ei) => { for (let s = 0; s <= E.len; s += 12) { const o = pathAt(E, s, [0, 0, 0, 0]), k = Math.floor(o[0] / cell) * 8192 + Math.floor(o[1] / cell); (g.get(k) || g.set(k, []).get(k)).push([ei, s, o[0], o[1]]); } }); g.cell = cell; return g;
    }
    function gridPick(g, x, z) { const c = g.cell, cx = Math.floor(x / c), cz = Math.floor(z / c); let best = null, n = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = g.get((cx + a) * 8192 + cz + b); if (!l) continue; for (const e of l) { if (Math.random() * (++n) < 1) best = e; } } return best; }
    let DR = null, PG = null;                                           // Fahrnetz und Fußnetz
    if (RD) {
      const nN = RD.nodes.length / 2, adj = Array.from({ length: nN }, () => []), E = [];
      RD.edges.forEach(e => { if (e.f & 6) return; const P = mkPath(e.p, { c: e.c, w: e.w, a: e.a, b: e.b }); if (P.len < 5) return; const k = E.push(P) - 1; adj[e.a].push([k, 0]); adj[e.b].push([k, 1]); });
      DR = { E, adj, grid: mkGrid(E, 64) };
      { const comp = new Int32Array(nN).fill(-1), len = []; let nc = 0;                      // zusammenhängende Teilnetze (das DLM hat Lücken) – gefahren wird nur im größten
        for (let s0 = 0; s0 < nN; s0++) { if (comp[s0] >= 0 || !adj[s0].length) continue; let L = 0; const st = [s0]; comp[s0] = nc;
          while (st.length) { const u = st.pop(); for (const [ei, end] of adj[u]) { const Ed = E[ei], v = end === 0 ? Ed.b : Ed.a; L += Ed.len * 0.5; if (comp[v] < 0) { comp[v] = nc; st.push(v); } } } len.push(L); nc++; }
        let main = 0; len.forEach((l, i) => { if (l > len[main]) main = i; }); DR.comp = comp; DR.main = main; DR.ncomp = nc; DR.compLen = len; }
      const F = [], snap = new Map(), fadj = []; const fnode = (x, z) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const k = (Math.round(x / 1.5) + a) * 65536 + Math.round(z / 1.5) + b; if (snap.has(k)) return snap.get(k); } const id = fadj.length; fadj.push([]); snap.set(Math.round(x / 1.5) * 65536 + Math.round(z / 1.5), id); return id; };
      const addF = (pts, w, road) => { const P = mkPath(pts, { w, road }); if (P.len < 3) return; P.a = fnode(P.P[0], P.P[1]); P.b = fnode(P.P[2 * P.n - 2], P.P[2 * P.n - 1]); const k = F.push(P) - 1; fadj[P.a].push([k, 0]); fadj[P.b].push([k, 1]); };
      RD.edges.forEach(e => { if (!(e.f & 4)) addF(e.p, e.w, true); }); (RD.paths || []).forEach(p => addF(p.p, p.w, false));
      PG = { E: F, adj: fadj, grid: mkGrid(F, 48) };
    }
    const nearRoad = (x, z, maxR, mainOnly) => { if (!DR) return null; let best = null, bd = maxR * maxR, o = [0, 0, 0, 0]; DR.E.forEach(E => { if (mainOnly && DR.comp[E.a] !== DR.main) return; for (let s = 0; s <= E.len; s += 4) { pathAt(E, s, o); const d = (o[0] - x) ** 2 + (o[1] - z) ** 2; if (d < bd) { bd = d; best = { x: o[0], z: o[1], h: Math.atan2(o[2], o[3]), tx: o[2], tz: o[3] }; } } }); return best; };

    if (DR) { const r = nearRoad(mj.hospital.x, mj.hospital.z, 160); if (r) hosp = r; const r0 = nearRoad(car.x, car.z, 90); if (r0) { car.x = r0.x; car.z = r0.z; car.h = r0.h; car.y = gh(car.x, car.z); } }   // Start und Krankenhaus auf die Straße setzen
    if (DRIVER && DR) { const r = nearRoad(car.x, car.z, 250, true); if (r) { car.x = r.x + r.tz * 1.8; car.z = r.z - r.tx * 1.8; car.h = Math.atan2(r.tx, r.tz); car.y = gh(car.x, car.z); } }   // Driver: auf die rechte Spur, in Fahrtrichtung

    /* ---------- Verkehr: Autos folgen dem Straßennetz (rechts fahren, bremsen, weichen dem Einsatzwagen mit Sirene aus) ---------- */
    const TR_N = DR ? +(q.get('traffic') ?? 70) : 0, TR_RING = [70, 430], TR_KEEP = 520;
    let TR = null;
    function mergeBoxes(list) {
      const pos = [], col = [], nor = [], idx = [];
      for (const [w, h, d, x, y, z, c] of list) { const g = new T.BoxGeometry(w, h, d).toNonIndexed(), p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c[0], c[1], c[2]); } }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); return g;
    }
    if (TR_N) {
      const geo = mergeBoxes([[1.78, 0.72, 4.2, 0, 0.72, 0, [1, 1, 1]], [1.6, 0.62, 2.2, 0, 1.38, -0.2, [0.32, 0.38, 0.45]], [1.5, 0.1, 2.0, 0, 1.72, -0.2, [0.9, 0.9, 0.9]],
        [0.22, 0.58, 0.58, 0.9, 0.29, 1.35, [0.05, 0.05, 0.05]], [0.22, 0.58, 0.58, -0.9, 0.29, 1.35, [0.05, 0.05, 0.05]], [0.22, 0.58, 0.58, 0.9, 0.29, -1.35, [0.05, 0.05, 0.05]], [0.22, 0.58, 0.58, -0.9, 0.29, -1.35, [0.05, 0.05, 0.05]]]);
      const mesh = new T.InstancedMesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 }), TR_N); mesh.frustumCulled = false; scene.add(mesh);
      const pal = [0xb8bcc2, 0x1f2a3a, 0x8c1c1c, 0xe8e8e8, 0x2b2b2b, 0x4a6b8a, 0x3b5d3a, 0xc9a227, 0x7a7f86, 0xf2f2f2, 0x5a1f1f]; const cars = [];
      for (let i = 0; i < TR_N; i++) { cars.push({ ok: false, e: 0, d: 1, u: 0, x: 0, z: 0, ox: 0, oz: 0, h: 0, v: 0, sp: 0.8 + Math.random() * 0.25, wait: 0, hold: 0, ghost: 0, y: 0, sc: 0.95 + Math.random() * 0.2 }); mesh.setColorAt(i, new T.Color(pal[i % pal.length])); }
      mesh.instanceColor.needsUpdate = true; TR = { cars, mesh, o: [0, 0, 0, 0], dummy: new T.Object3D(), ms: 0, spawned: 0, yielded: 0, bumps: 0 };
    }
    const lane = E => clamp(E.w * 0.25, 1.35, 3.0);
    function carSpawn(c) {
      c.ok = false; for (let k = 0; k < 30; k++) {
        const r = rnd(TR_RING[0], TR_RING[1]), an = rnd(0, 6.283), px = car.x + Math.cos(an) * r, pz = car.z + Math.sin(an) * r; if (px < 0 || px > WX || pz > 0 || pz < -WZ) continue;
        const pk = gridPick(DR.grid, px, pz); if (!pk) continue; const E = DR.E[pk[0]], d = Math.random() < 0.5 ? 1 : -1, u = clamp(pk[1] + rnd(-5, 5), 0, E.len), o = TR.o; pathAt(E, u, o);
        const rx = -o[3] * d, rz = o[2] * d, l = lane(E), x = o[0] + rx * l, z = o[1] + rz * l, dd = Math.hypot(x - car.x, z - car.z); if (dd < TR_RING[0] * 0.8 || dd > TR_KEEP) continue;
        if (occ(x, z)) continue; let free = true; for (const b of TR.cars) if (b.ok && b !== c && (b.x - x) ** 2 + (b.z - z) ** 2 < 64) { free = false; break; } if (!free) continue;
        c.e = pk[0]; c.d = d; c.u = d > 0 ? u : E.len - u; c.x = x; c.z = z; c.ox = rx * l; c.oz = rz * l; c.h = Math.atan2(o[2] * d, o[3] * d); c.v = SPD[E.c] * c.sp * 0.6; c.wait = 0; c.hold = 0; c.ghost = 0; c.ok = true; TR.spawned++; return;
      }
    }
    function trafficStep(dt) {
      if (!TR) return; const t0 = performance.now(), cars = TR.cars, o = TR.o, pf = [Math.sin(car.h), Math.cos(car.h)];
      for (const c of cars) {
        if (!c.ok) { carSpawn(c); continue; }
        const E = DR.E[c.e], dd = Math.hypot(c.x - car.x, c.z - car.z); if (dd > TR_KEEP || c.wait > 25) { carSpawn(c); continue; }
        const fx = Math.sin(c.h), fz = Math.cos(c.h), rx = -fz, rz = fx; let vt = SPD[E.c] * c.sp;
        if (c.hold > 0) { c.hold -= dt; vt = 0; }
        else if (!c.ghost) {
          for (const b of cars) { if (b === c || !b.ok) continue; const rx_ = b.x - c.x, rz_ = b.z - c.z; if (rx_ * rx_ + rz_ * rz_ > 900) continue; const ah = rx_ * fx + rz_ * fz, la = rx_ * rx + rz_ * rz; if (ah > 0 && ah < 6 + c.v * 1.4 && Math.abs(la) < 2.3) vt = Math.min(vt, Math.max(0, ah - 5.5) * 1.5); }
          const rx_ = car.x - c.x, rz_ = car.z - c.z, ah = rx_ * fx + rz_ * fz, la = rx_ * rx + rz_ * rz; if (ah > 0 && ah < 8 + c.v * 1.4 && Math.abs(la) < 2.6) vt = Math.min(vt, Math.max(0, ah - 6.5) * 1.5);
        }
        let yield_ = false;                                                  // Platz machen: Einsatzwagen mit Sirene von hinten
        if (car.siren && Math.abs(car.vf) > 2) { const rx_ = c.x - car.x, rz_ = c.z - car.z, ahead = rx_ * pf[0] + rz_ * pf[1], la = rx_ * pf[1] - rz_ * pf[0]; if (ahead > 4 && ahead < 55 && Math.abs(la) < 9 && fx * pf[0] + fz * pf[1] > 0.5) { yield_ = true; vt = Math.min(vt, 3.5); } }
        if (yield_ && !c.yd) { c.yd = true; TR.yielded++; } else if (!yield_) c.yd = false;
        c.v += clamp(vt - c.v, -9 * dt, 2.6 * dt); if (c.v < 0.25 && vt < 0.5) c.wait += dt; else c.wait = Math.max(0, c.wait - dt * 2); if (c.ghost > 0) c.ghost -= dt; else if (c.wait > 9) { c.ghost = 4; }
        c.u += c.v * dt;
        while (c.u >= DR.E[c.e].len) {                                        // Ende der Kante: an der Kreuzung zufällig weiter
          const E0 = DR.E[c.e], nd = c.d > 0 ? E0.b : E0.a, opts = DR.adj[nd].filter(a => a[0] !== c.e), pick = opts.length ? opts[(Math.random() * opts.length) | 0] : [c.e, c.d > 0 ? 1 : 0];
          const over = c.u - E0.len; c.e = pick[0]; c.d = pick[1] === 0 ? 1 : -1; c.u = over;
        }
        const E2 = DR.E[c.e]; pathAt(E2, c.d > 0 ? c.u : E2.len - c.u, o); const tx = o[2] * c.d, tz = o[3] * c.d, l = lane(E2) + (c.yd ? 0.9 : 0), tox = -tz * l, toz = tx * l, k = Math.min(1, 3.5 * dt);
        c.ox += (tox - c.ox) * k; c.oz += (toz - c.oz) * k; const nx = o[0] + c.ox, nz = o[1] + c.oz, mx = nx - c.x, mz = nz - c.z;
        if (mx * mx + mz * mz > 1e-6) { const nh = Math.atan2(mx, mz); let dh = nh - c.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); c.h += dh * Math.min(1, 8 * dt); }
        c.x = nx; c.z = nz;
      }
      TR.ms = TR.ms * 0.9 + (performance.now() - t0) * 0.1;
    }
    function trafficDraw() {
      if (!TR) return; const d = TR.dummy, m = TR.mesh;
      TR.cars.forEach((c, i) => {
        if (!c.ok) { d.position.set(0, -500, 0); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); d.updateMatrix(); m.setMatrixAt(i, d.matrix); return; }
        const fx = Math.sin(c.h), fz = Math.cos(c.h), yf = gh(c.x + fx * 1.4, c.z + fz * 1.4), yb = gh(c.x - fx * 1.4, c.z - fz * 1.4), y = (yf + yb) / 2; c.y = y;
        d.position.set(c.x, y + 0.02, c.z); d.rotation.set(-Math.atan2(yf - yb, 2.8), c.h, 0); d.rotation.order = 'YXZ'; d.scale.set(1, 1, c.sc); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    }
    function trafficCollide() {                                              // Einsatzwagen gegen Autos (je drei Kreise)
      if (!TR) return; const ca = Math.cos(car.h), sa = Math.sin(car.h), A = [-2.0, 0, 2.0];
      for (const c of TR.cars) {
        if (!c.ok) continue; const dx = c.x - car.x, dz = c.z - car.z; if (dx * dx + dz * dz > 49) continue; const cfx = Math.sin(c.h), cfz = Math.cos(c.h);
        for (const a of A) for (const b of [-1.1, 1.1]) {
          const ax = car.x + sa * a, az = car.z + ca * a, bx = c.x + cfx * b, bz = c.z + cfz * b, ex = ax - bx, ez = az - bz, dist = Math.hypot(ex, ez), min = 1.3 + 1.05;
          if (dist < min && dist > 1e-4) {
            const nx = ex / dist, nz = ez / dist, pen = min - dist; car.x += nx * pen * 0.55; car.z += nz * pen * 0.55; c.x -= nx * pen * 0.45; c.z -= nz * pen * 0.45;
            const vn = car.vx * nx + car.vz * nz, rel = Math.abs(vn - c.v * (cfx * nx + cfz * nz));
            if (vn < 0) { car.vx -= vn * nx * 1.2; car.vz -= vn * nz * 1.2; car.vf = car.vx * sa + car.vz * ca; }
            c.v = Math.max(0, c.v * 0.3); c.hold = 1.5;
            if (rel > 4.5 && car.impact <= 0) { car.dmg++; car.impact = 0.4; thump(rel); TR.bumps++; hurt(rel); if (DRIVER) heatAdd(15); msg('Unfall mit Auto! Schaden +1', 2); }
            return;
          }
        }
      }
    }
    // Karte: Straßen und Wasser einzeichnen
    function drawRoadsOnMap(ctx) {
      if (!RD) return; ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.fillStyle = '#35597a'; for (const w of RD.water || []) { ctx.beginPath(); for (let i = 0; i < w.i.length; i += 3) { for (let k = 0; k < 3; k++) { const v = w.i[i + k], X = w.p[2 * v] / 4, Y = GH - 1 + w.p[2 * v + 1] / 4; if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); } ctx.closePath(); } ctx.fill(); }
      const wd = [2.3, 2.0, 1.7, 1.4, 1.0], col = ['#d8d2a8', '#cfcfcf', '#c4c4c4', '#b4b4b4', '#9a9a9a'];
      for (const pass of [0, 1]) for (const e of RD.edges) { if (e.f & 4) continue; ctx.strokeStyle = pass ? col[e.c] : '#3a3a3a'; ctx.lineWidth = wd[e.c] + (pass ? 0 : 1.0); ctx.beginPath(); for (let i = 0; i < e.p.length; i += 2) { const X = e.p[i] / 4, Y = GH - 1 + e.p[i + 1] / 4; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); } ctx.stroke(); }
      ctx.restore();
    }

    /* ---------- Passanten (einfache KI: Umherlaufen, Ausweichen, Fliehen) ---------- */
    const NPC_N = +(new URLSearchParams(location.search).get('npc') || 600), RING = [25, 260], KEEP = 330;
    const walk = (x, z) => !occ(x, z) && !occ(x + 1.2, z) && !occ(x - 1.2, z) && !occ(x, z + 1.2) && !occ(x, z - 1.2);
    const bodyG = new T.CylinderGeometry(0.22, 0.2, 1.0, 8); bodyG.translate(0, 0.85, 0); const headG = new T.SphereGeometry(0.15, 8, 6); headG.translate(0, 1.6, 0);
    const bodyM = new T.InstancedMesh(bodyG, new T.MeshStandardMaterial({ roughness: 0.9 }), NPC_N), headM = new T.InstancedMesh(headG, new T.MeshStandardMaterial({ roughness: 0.8 }), NPC_N);
    bodyM.frustumCulled = headM.frustumCulled = false; scene.add(bodyM, headM);
    const cloth = [0x2d4a7a, 0x8a2b2b, 0x3b6b3b, 0x555555, 0xb8892b, 0x6a4a8a, 0x222222, 0xc9c9c9, 0x1f7a7a], skin = [0xf1c8a5, 0xd9a273, 0xa8744c, 0x7a4e30, 0xfbdcc0];
    const agents = []; const dummy = new T.Object3D(); const hashCell = 3; let crowdMs = 0, knocked = 0, fled = 0;
    const TMP = [0, 0, 0, 0];
    const sideOff = E => E.road ? E.w * 0.5 + rnd(1.0, 1.8) : rnd(-0.8, 0.8);
    function spawn(a) {
      if (PG) for (let k = 0; k < 40; k++) {                                // auf Gehwegen und Wegen starten
        const r = rnd(RING[0], RING[1]), an = rnd(0, 6.283), pk = gridPick(PG.grid, car.x + Math.cos(an) * r, car.z + Math.sin(an) * r); if (!pk) continue;
        const E = PG.E[pk[0]], u = clamp(pk[1] + rnd(-6, 6), 0, E.len), ps = Math.random() < 0.5 ? 1 : -1; pathAt(E, u, TMP); let po = sideOff(E), ox = -TMP[3] * ps * po, oz = TMP[2] * ps * po, x = TMP[0] + ox, z = TMP[1] + oz;
        if (!walk(x, z)) { po = 0; ox = oz = 0; x = TMP[0]; z = TMP[1]; if (!walk(x, z)) continue; }
        const d = Math.hypot(x - car.x, z - car.z); if (d < RING[0] || d > RING[1] + 40 || x < 4 || x > WX - 4 || z > -4 || z < -(WZ - 4)) continue;
        a.pe = pk[0]; a.pu = u; a.pd = Math.random() < 0.5 ? 1 : -1; a.ps = ps; a.po = po; a.ox = ox; a.oz = oz; a.x = x; a.z = z; a.h = Math.atan2(TMP[2] * a.pd, TMP[3] * a.pd); a.state = 'walk'; a.t = rnd(2, 6); a.sp = rnd(1.1, 1.6); a.ok = true; return;
      }
      spawn0(a);
    }
    function attach(a) {                                                       // nach dem Weglaufen wieder an den nächsten Gehweg hängen
      if (!PG) return false; const c = PG.grid.cell, cx = Math.floor(a.x / c), cz = Math.floor(a.z / c); let best = null, bd = 900;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = PG.grid.get((cx + i) * 8192 + cz + j); if (!l) continue; for (const e of l) { const d = (e[2] - a.x) ** 2 + (e[3] - a.z) ** 2; if (d < bd) { bd = d; best = e; } } }
      if (!best) return false; const E = PG.E[best[0]]; pathAt(E, best[1], TMP); const lx = a.x - TMP[0], lz = a.z - TMP[1], side = lx * -TMP[3] + lz * TMP[2];
      a.pe = best[0]; a.pu = best[1]; a.pd = Math.random() < 0.5 ? 1 : -1; a.ps = side >= 0 ? 1 : -1; a.po = Math.min(Math.abs(side), 4); a.ox = lx; a.oz = lz; return true;
    }
    function pathStep(a, dt, sp) {
      a.pu += a.pd * sp * dt;
      while (a.pu < 0 || a.pu > PG.E[a.pe].len) {
        const E0 = PG.E[a.pe], atEnd = a.pu > 0, nd = atEnd ? E0.b : E0.a, over = atEnd ? a.pu - E0.len : -a.pu, opts = PG.adj[nd].filter(x => x[0] !== a.pe), pick = opts.length ? opts[(Math.random() * opts.length) | 0] : [a.pe, atEnd ? 1 : 0];
        a.pe = pick[0]; const E1 = PG.E[a.pe]; if (pick[1] === 0) { a.pd = 1; a.pu = over; } else { a.pd = -1; a.pu = Math.max(0, E1.len - over); }
        a.ps = Math.random() < 0.5 ? 1 : -1; a.po = sideOff(E1);
      }
      const E = PG.E[a.pe]; pathAt(E, a.pu, TMP); const k = Math.min(1, 3 * dt); a.ox += (-TMP[3] * a.ps * a.po - a.ox) * k; a.oz += (TMP[2] * a.ps * a.po - a.oz) * k;
      let nx = TMP[0] + a.ox, nz = TMP[1] + a.oz; if (!walk(nx, nz)) { a.ox = a.oz = 0; a.po = 0; nx = TMP[0]; nz = TMP[1]; if (!walk(nx, nz)) return false; }
      const mx = nx - a.x, mz = nz - a.z; if (mx * mx + mz * mz > 1e-5) a.h = Math.atan2(mx, mz); a.x = nx; a.z = nz; return true;
    }
    function spawn0(a) { for (let k = 0; k < 40; k++) { const r = rnd(RING[0], RING[1]), an = rnd(0, 6.283), x = car.x + Math.cos(an) * r, z = car.z + Math.sin(an) * r; if (x > 4 && x < WX - 4 && z < -4 && z > -(WZ - 4) && walk(x, z)) { a.x = x; a.z = z; a.h = rnd(0, 6.283); a.state = 'walk'; a.t = rnd(2, 6); a.sp = rnd(1.1, 1.6); a.ok = true; a.pe = -1; return; } } a.ok = false; a.x = car.x; a.z = car.z; a.pe = -1; }
    for (let i = 0; i < NPC_N; i++) { const a = { x: 0, z: 0, h: 0, sp: 1.3, state: 'walk', t: 0, ph: rnd(0, 6.28), ok: false, pe: -1, pu: 0, pd: 1, ps: 1, po: 0, ox: 0, oz: 0 }; spawn(a); agents.push(a); bodyM.setColorAt(i, new T.Color(cloth[i % cloth.length])); headM.setColorAt(i, new T.Color(skin[(i * 7) % skin.length])); }
    bodyM.instanceColor.needsUpdate = headM.instanceColor.needsUpdate = true;
    function crowdStep(dt) {
      const t0 = performance.now(), fx = Math.sin(car.h), fz = Math.cos(car.h), lx = Math.cos(car.h), lz = -Math.sin(car.h), csp = Math.abs(car.vf);
      const hash = new Map(); agents.forEach((a, i) => { if (!a.ok) return; const k = ((a.x / hashCell) | 0) * 4096 + ((a.z / hashCell) | 0); (hash.get(k) || hash.set(k, []).get(k)).push(i); });
      agents.forEach((a, i) => {
        if (!a.ok) { spawn(a); return; } const dx = a.x - car.x, dz = a.z - car.z, d = Math.hypot(dx, dz);
        if (d > KEEP) { spawn(a); return; }
        if (a.state === 'down') { a.t -= dt; if (a.t <= 0) spawn(a); return; }
        if (d < 2.0 && csp > 3.5) { a.state = 'down'; a.t = 3.5; knocked++; car.dmg++; hurt(6); if (DRIVER) heatAdd(25); msg('Passant angefahren! Schaden +1', 2.5); return; }
        const ahead = dx * fx + dz * fz; let vx, vz, sp = a.sp;
        if (d < (car.siren ? 48 : 16) && csp > 2 && ahead > -6 && Math.abs(dx * lx + dz * lz) < 14) { if (a.state !== 'flee') fled++; a.state = 'flee'; a.pe = -1; a.t = 2.2; const side = Math.sign(dx * lx + dz * lz) || (i % 2 ? 1 : -1); a.h = Math.atan2(lx * side, lz * side); sp = 3.2; }
        else if (a.state === 'flee') { a.t -= dt; sp = 3.0; if (a.t <= 0) { a.state = 'walk'; attach(a); } }
        else {
          if (a.pe >= 0) { if (pathStep(a, dt, sp)) { a.ph += dt * sp * 4.5; return; } a.pe = -1; }
          a.t -= dt; if (a.t <= 0) { if (attach(a)) return; a.h += rnd(-1.4, 1.4); a.t = rnd(2, 7); }
        }
        // Ausweichen vor Hindernissen: Fühler voraus, andere Winkel probieren
        let ok = false; for (const off of [0, 0.7, -0.7, 1.4, -1.4, 2.2, -2.2, 3.14]) { const hh = a.h + off, px = a.x + Math.sin(hh) * (sp * dt + 1.0), pz = a.z + Math.cos(hh) * (sp * dt + 1.0); if (walk(px, pz)) { a.h = hh; ok = true; break; } }
        if (!ok) { a.t = 0; return; }
        vx = Math.sin(a.h) * sp; vz = Math.cos(a.h) * sp;
        // Abstand zu Nachbarn
        const cx = (a.x / hashCell) | 0, cz = (a.z / hashCell) | 0; for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) { const l = hash.get((cx + ox) * 4096 + (cz + oz)); if (!l) continue; for (const j of l) { if (j === i) continue; const b = agents[j], ex = a.x - b.x, ez = a.z - b.z, e2 = ex * ex + ez * ez; if (e2 < 1.0 && e2 > 1e-4) { const e = Math.sqrt(e2); vx += ex / e * 0.8; vz += ez / e * 0.8; } } }
        const nx = a.x + vx * dt, nz = a.z + vz * dt; if (walk(nx, nz)) { a.x = nx; a.z = nz; } a.ph += dt * sp * 4.5;
      });
      crowdMs = crowdMs * 0.9 + (performance.now() - t0) * 0.1;
    }
    function crowdDraw() {
      agents.forEach((a, i) => { const y = a.ok ? gh(a.x, a.z) : -500; dummy.position.set(a.x, y + (a.state === 'down' ? 0.15 : Math.abs(Math.sin(a.ph)) * 0.04), a.z); dummy.rotation.set(a.state === 'down' ? Math.PI / 2 : 0, a.h, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); bodyM.setMatrixAt(i, dummy.matrix); headM.setMatrixAt(i, dummy.matrix); });
      bodyM.instanceMatrix.needsUpdate = headM.instanceMatrix.needsUpdate = true;
    }

    /* ---------- Fahndung (Driver-Modus): Fahndungsstufe, Streifenwagen, Fluchtfahrt-Auftrag ---------- */
    let heat = 0, unseen = 0, bustT = 0, copTimer = 0; const COP_MAX = 5;
    const stars = () => '★'.repeat(Math.ceil(heat / 20)) + '☆'.repeat(5 - Math.ceil(heat / 20));
    function heatAdd(v) { if (DRIVER) heat = Math.min(100, heat + v); }
    const cops = [], copGroup = new T.Group(); scene.add(copGroup);
    if (DRIVER && DR) for (let i = 0; i < COP_MAX; i++) { const g = buildSedan(0xf4f4f4, true); g.visible = false; copGroup.add(g); cops.push({ g, ok: false, x: 0, z: 0, h: 0, v: 0, route: [], ri: 0, plan: 0, back: 0, stuck: 0, y: 0, d: 999, los: false, losT: 0, retire: false, turn: 1, hit: 0 }); }
    const clearLine = (x0, z0, x1, z1) => { const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 3); for (let i = 1; i < n; i++) { const t = i / n; if (occ(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false; } return true; };
    const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
    const dn = []; if (DR) DR.adj.forEach((l, n) => { if (l.length && DR.comp[n] === DR.main) dn.push(n); });
    function nearestDN(x, z) { let b = -1, bd = 1e18; for (const n of dn) { const d = (RD.nodes[2 * n] - x) ** 2 + (RD.nodes[2 * n + 1] - z) ** 2; if (d < bd) { bd = d; b = n; } } return b; }
    function astar(s0, t0) {                                                // kürzester Weg im Fahrnetz → [[Kante, Richtung], …]
      if (s0 === t0 || s0 < 0 || t0 < 0) return []; const tx = RD.nodes[2 * t0], tz = RD.nodes[2 * t0 + 1], hh = n => Math.hypot(RD.nodes[2 * n] - tx, RD.nodes[2 * n + 1] - tz);
      const g = new Map([[s0, 0]]), from = new Map(), hf = [hh(s0)], hn = [s0], done = new Set();
      const push = (f, n) => { let i = hf.length; hf.push(f); hn.push(n); while (i > 0) { const pa = (i - 1) >> 1; if (hf[pa] <= hf[i]) break; [hf[pa], hf[i]] = [hf[i], hf[pa]]; [hn[pa], hn[i]] = [hn[i], hn[pa]]; i = pa; } };
      const pop = () => { const n = hn[0], lf = hf.pop(), ln = hn.pop(); if (hf.length) { hf[0] = lf; hn[0] = ln; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < hf.length && hf[l] < hf[m]) m = l; if (r < hf.length && hf[r] < hf[m]) m = r; if (m === i) break; [hf[m], hf[i]] = [hf[i], hf[m]]; [hn[m], hn[i]] = [hn[i], hn[m]]; i = m; } } return n; };
      while (hf.length) { const u = pop(); if (done.has(u)) continue; done.add(u); if (u === t0) break;
        for (const [ei, end] of DR.adj[u]) { const E = DR.E[ei], v = end === 0 ? E.b : E.a; if (done.has(v)) continue; const ng = g.get(u) + E.len; if (!g.has(v) || ng < g.get(v)) { g.set(v, ng); from.set(v, [u, ei, end === 0 ? 1 : -1]); push(ng + hh(v), v); } } }
      if (!from.has(t0)) return []; const path = []; let v = t0; while (v !== s0) { const [u, ei, dir] = from.get(v); path.push([ei, dir]); v = u; } return path.reverse();
    }
    function locate(x, z) {                                                // nächster Punkt im Haupt-Fahrnetz → {ei, s, d}
      const g = DR.grid, c = g.cell, cx = Math.floor(x / c), cz = Math.floor(z / c); let best = null, bd = 1e18;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const l = g.get((cx + a) * 8192 + cz + b); if (!l) continue; for (const e of l) { if (DR.comp[DR.E[e[0]].a] !== DR.main) continue; const d = (e[2] - x) ** 2 + (e[3] - z) ** 2; if (d < bd) { bd = d; best = e; } } }
      return best && { ei: best[0], s: best[1], d: Math.sqrt(bd) };
    }
    function subPath(E, s0, s1, out) {                                     // Linienzug auf Kante E von Bogenlänge s0 nach s1
      const tm = [0, 0, 0, 0]; pathAt(E, s0, tm); out.push(tm[0], tm[1]);
      if (s1 >= s0) { for (let i = 0; i < E.n; i++) if (E.cum[i] > s0 + 1 && E.cum[i] < s1 - 1) out.push(E.P[2 * i], E.P[2 * i + 1]); }
      else { for (let i = E.n - 1; i >= 0; i--) if (E.cum[i] < s0 - 1 && E.cum[i] > s1 + 1) out.push(E.P[2 * i], E.P[2 * i + 1]); }
      pathAt(E, s1, tm); out.push(tm[0], tm[1]);
    }
    const copStat = { plan: 0, empty: 0, spawn: 0, stuckSpawn: 0, farSpawn: 0, wall: 0 };
    function copPlan(c) {                                                  // Route von der Position des Streifenwagens (nicht vom nächsten Knoten) zum Spieler
      const A = locate(c.x, c.z), B = locate(car.x, car.z); c.route = []; c.ri = 0; copStat.plan++; if (!A || !B) { copStat.empty++; return; }
      const EA = DR.E[A.ei], EB = DR.E[B.ei], tm = [0, 0, 0, 0]; pathAt(EA, A.s, tm); const along = tm[2] * Math.sin(c.h) + tm[3] * Math.cos(c.h);
      if (A.ei === B.ei) { subPath(EA, A.s, B.s, c.route); return; }
      let best = null;
      for (const [na, sa, pa, sEnd] of [[EA.b, EA.len - A.s, along < -0.3 ? 35 : 0, EA.len], [EA.a, A.s, along > 0.3 ? 35 : 0, 0]])
        for (const [nb, sb, sStart] of [[EB.a, B.s, 0], [EB.b, EB.len - B.s, EB.len]]) {
          const path = na === nb ? [] : astar(na, nb); if (na !== nb && !path.length) continue; let L = sa + pa + sb; for (const q of path) L += DR.E[q[0]].len;
          if (!best || L < best.L) best = { L, path, sEnd, sStart };
        }
      if (!best) { copStat.empty++; return; } const r = c.route; subPath(EA, A.s, best.sEnd, r);
      for (const [ei, dir] of best.path) { const E = DR.E[ei]; for (let k = 1; k < E.n; k++) { const i = dir > 0 ? k : E.n - 1 - k; r.push(E.P[2 * i], E.P[2 * i + 1]); } }
      subPath(EB, best.sStart, B.s, r);
    }
    function copSpawn(c) {
      c.ok = false; copStat.spawn++; if (!DR) return; const pf = [Math.sin(car.h), Math.cos(car.h)];
      for (let k = 0; k < 40; k++) {
        const r = rnd(110, 300), an = rnd(0, 6.283), px = car.x + Math.cos(an) * r, pz = car.z + Math.sin(an) * r; if (px < 0 || px > WX || pz > 0 || pz < -WZ) continue;
        const pk = gridPick(DR.grid, px, pz); if (!pk) continue; const E = DR.E[pk[0]]; if (DR.comp[E.a] !== DR.main) continue; pathAt(E, pk[1], TMP); const x = TMP[0], z = TMP[1], d = Math.hypot(x - car.x, z - car.z); if (d < 100 || d > 340 || occ(x, z)) continue;
        const fwd = ((x - car.x) * pf[0] + (z - car.z) * pf[1]) / d; if (fwd > 0.45 && clearLine(car.x, car.z, x, z)) continue;     // nicht vor den Augen des Spielers erscheinen
        let free = true; for (const o of cops) if (o.ok && o !== c && (o.x - x) ** 2 + (o.z - z) ** 2 < 400) free = false; if (!free) continue;
        const dir = ((car.x - x) * TMP[2] + (car.z - z) * TMP[3]) >= 0 ? 1 : -1; c.x = x; c.z = z; c.h = Math.atan2(TMP[2] * dir, TMP[3] * dir); c.v = 8; c.route = []; c.ri = 0; c.plan = 0; c.back = 0; c.stuck = 0; c.retire = false; c.ok = true; c.d = d; return;
      }
    }
    function copStep(dt) {
      if (!DRIVER || !cops.length) return;
      const want = heat > 0 ? Math.min(COP_MAX, 1 + Math.floor(heat / 25)) : 0; let active = 0; cops.forEach(c => { if (c.ok && !c.retire) active++; });
      copTimer -= dt; if (active < want && copTimer <= 0) { const c = cops.find(o => !o.ok); if (c) { copSpawn(c); copTimer = 2.2; } }
      let seen = false, bust = false;
      for (const c of cops) {
        if (!c.ok) continue; const dx = car.x - c.x, dz = car.z - c.z, d = Math.hypot(dx, dz); c.d = d;
        c.losT -= dt; if (c.losT <= 0) { c.los = d < 170 && clearLine(c.x, c.z, car.x, car.z); c.losT = 0.25; }
        if (heat <= 0 && !c.retire) c.retire = true; if (c.retire && d > 200) { c.ok = false; continue; } if (!c.retire && d > 420) { copStat.farSpawn++; copSpawn(c); continue; }
        if (!c.retire && (d < 80 || c.los)) seen = true;
        const direct = !c.retire && c.los && d < 90; let tx, tz;
        if (c.retire) { tx = c.x - dx; tz = c.z - dz; }
        else if (direct) { const lead = Math.min(0.8, d / 40); tx = car.x + car.vx * lead; tz = car.z + car.vz * lead; }
        else { c.plan -= dt; if (c.plan <= 0 || !c.route.length) { copPlan(c); c.plan = 2.0; }
          if (c.route.length) { while (c.ri < c.route.length / 2 - 1 && Math.hypot(c.route[2 * c.ri] - c.x, c.route[2 * c.ri + 1] - c.z) < 9 + c.v * 0.6) c.ri++; tx = c.route[2 * c.ri]; tz = c.route[2 * c.ri + 1]; } else { tx = car.x; tz = car.z; } }
        const dh = wrapA(Math.atan2(tx - c.x, tz - c.z) - c.h), maxYaw = 2.7 / (1 + c.v / 9); if (c.back <= 0) c.h += clamp(dh, -maxYaw * dt, maxYaw * dt);
        let vt = c.retire ? 12 : direct ? clamp(Math.abs(car.vf) + 5 + d * 0.25, 9, 28) : 22; vt *= 1 - Math.min(0.65, Math.abs(dh) * 0.45); if (!c.retire && d < 9 && Math.abs(car.vf) < 4) vt = 0;
        c.v += clamp(vt - c.v, -14 * dt, 6.5 * dt); const fx = Math.sin(c.h), fz = Math.cos(c.h), nx = c.x + fx * c.v * dt, nz = c.z + fz * c.v * dt;
        if (c.back > 0) { c.back -= dt; c.x -= fx * 3 * dt; c.z -= fz * 3 * dt; c.h += c.turn * 1.1 * dt; }
        else if (!(!direct && !c.retire && c.route.length) && (occ(nx, nz) || occ(nx + fx * 2.3, nz + fz * 2.3))) { c.v = 0; c.back = 0.8; c.turn = Math.random() < 0.5 ? 1 : -1; copStat.wall++; }
        else { c.x = nx; c.z = nz; }
        if (c.v < 0.8 && d > 25 && !c.retire) { c.stuck += dt; if (c.stuck > 4) { copStat.stuckSpawn++; copSpawn(c); c.stuck = 0; continue; } } else c.stuck = 0;
        for (const o of cops) if (o !== c && o.ok) { const ex = c.x - o.x, ez = c.z - o.z, e2 = ex * ex + ez * ez; if (e2 < 14 && e2 > 1e-4) { const e = Math.sqrt(e2), push = (3.7 - e) * 0.5; c.x += ex / e * push; c.z += ez / e * push; } }
        if (TR) for (const b of TR.cars) if (b.ok) { const ex = c.x - b.x, ez = c.z - b.z; if (ex * ex + ez * ez < 12) { const e = Math.sqrt(ex * ex + ez * ez) || 1, push = (3.4 - e) * 0.5; c.x += ex / e * push; c.z += ez / e * push; b.x -= ex / e * push; b.z -= ez / e * push; c.v *= 0.7; b.hold = 1.2; } }
        // Rammen
        const ca = Math.cos(car.h), sa = Math.sin(car.h), cfx = fx, cfz = fz; c.hit -= dt;
        for (const a of [-2.0, 0, 2.0]) for (const b of [-1.2, 1.2]) { const ax = car.x + sa * a, az = car.z + ca * a, bx = c.x + cfx * b, bz = c.z + cfz * b, ex = ax - bx, ez = az - bz, dist = Math.hypot(ex, ez), min = 2.4;
          if (dist < min && dist > 1e-4) { const nx2 = ex / dist, nz2 = ez / dist, pen = min - dist; car.x += nx2 * pen * 0.5; car.z += nz2 * pen * 0.5; c.x -= nx2 * pen * 0.5; c.z -= nz2 * pen * 0.5;
            const vn = car.vx * nx2 + car.vz * nz2, rel = Math.abs(vn - c.v * (cfx * nx2 + cfz * nz2)); if (vn < 0) { car.vx -= vn * nx2 * 1.1; car.vz -= vn * nz2 * 1.1; car.vf = car.vx * sa + car.vz * ca; } c.v *= 0.55;
            if (rel > 3.5 && c.hit <= 0) { c.hit = 1.2; car.dmg++; car.impact = Math.max(car.impact, 0.3); thump(rel); hurt(rel * 0.55); msg('Streifenwagen rammt dich!', 1.5); } break; } }
        if (!c.retire && d < 7 && Math.abs(car.vf) < 3.2) bust = true;
      }
      if (seen) { unseen = 0; if (heat > 0) heat = Math.min(100, heat + 1.0 * dt); } else { unseen += dt; if (heat > 0) heat = Math.max(0, heat - (unseen > 8 ? 5 : 0.4) * dt); }
      if (heat <= 0 && cops.some(c => c.ok && !c.retire)) { cops.forEach(c => { if (c.ok) c.retire = true; }); if (M.state === 'escape') msg('Abgeschüttelt – die Polizei hat dich verloren!', 3.5); }
      bustT = bust ? bustT + dt : Math.max(0, bustT - dt * 1.5);
    }
    function copDraw() {
      if (!DRIVER) return; const ph = Math.floor(performance.now() / 120) % 2;
      for (const c of cops) { c.g.visible = c.ok; if (!c.ok) continue; const fx = Math.sin(c.h), fz = Math.cos(c.h), yf = gh(c.x + fx * 1.4, c.z + fz * 1.4), yb = gh(c.x - fx * 1.4, c.z - fz * 1.4); c.y = (yf + yb) / 2;
        c.g.position.set(c.x, c.y + 0.02, c.z); c.g.rotation.order = 'YXZ'; c.g.rotation.set(-Math.atan2(yf - yb, 2.8), c.h, 0); const [b1, b2] = c.g.userData.bar; b1.emissiveIntensity = ph ? 2.6 : 0.1; b2.emissiveIntensity = ph ? 0.1 : 2.6; }
    }
    function roadTarget(lim, from) {
      if (!DR) return null; const tm = [0, 0, 0, 0]; let best = null;
      for (let k = 0; k < 700 && !best; k++) { const E = DR.E[(Math.random() * DR.E.length) | 0]; if (E.len < 24 || DR.comp[E.a] !== DR.main) continue; pathAt(E, rnd(8, E.len - 8), tm); const x = tm[0], z = tm[1], d = Math.hypot(x - from.x, z - from.z), l = k < 450 ? lim : [lim[0] * 0.5, lim[1] * 1.6];
        if (d > l[0] && d < l[1] && inMain(x, z) && inMain(x + 4, z) && inMain(x - 4, z) && inMain(x, z + 4) && inMain(x, z - 4)) best = { x, z, d }; }
      return best;
    }
    function driverNewMission() {
      const t = roadTarget([400, 1000], car) || { x: car.x + 300, z: car.z, d: 300 }; setTarget(t, 'p'); M.state = 'toCrew'; M.time = t.d / 9 + 45; M.count++;
      msg('Fluchtfahrt! Hol die Crew ab (roter Punkt).', 4);
    }
    function driverMissionStep(dt) {
      if (M.state === 'idle') return; const sp = Math.abs(car.vf), fail = (st, t) => { M.state = st; M.loadT = 6; mkP.visible = mkH.visible = false; M.target = null; msg(t, 5); };
      if (M.state === 'toCrew' || M.state === 'escape') {
        M.time -= dt; const d = Math.hypot(M.target.x - car.x, M.target.z - car.z);
        if (car.hp <= 0) return fail('failed', 'Totalschaden – der Wagen ist hinüber.'); if (bustT > 3) return fail('busted', 'Festgenommen! Die Polizei hat dich gestellt.'); if (M.time <= 0) return fail('failed', 'Zeit abgelaufen.');
        if (M.state === 'toCrew' && d < 7 && sp < 6) { M.state = 'loading'; M.loadT = 2; msg('Crew steigt ein …', 2); }
        else if (M.state === 'escape' && d < 10 && sp < 10) { const s = Math.round(300 + Math.min(M.time, 120) * 5 + (heat <= 0 ? 400 : 0) + car.hp * 3); M.score = s; M.total += s; M.state = 'done'; M.loadT = 7; mkH.visible = false; M.target = null; msg('Versteck erreicht! Punkte: ' + s + (heat <= 0 ? ' (inkl. Abgeschüttelt-Bonus)' : '') + ' · Gesamt ' + M.total, 6); }
      } else if (M.state === 'loading') { M.loadT -= dt; if (M.loadT <= 0) { const t = roadTarget([900, 1800], car) || { x: car.x - 600, z: car.z, d: 600 }; setTarget(t, 'h'); M.state = 'escape'; M.time = t.d / 10 + 70; heat = Math.max(heat, 65); msg('Alarm! Polizei hinter dir – ab zum Versteck (blau).', 4); } }
      else { M.loadT -= dt; if (M.loadT <= 0) { car.hp = 100; car.dmg = 0; heat = 0; unseen = 0; bustT = 0; cops.forEach(c => { c.ok = false; }); driverNewMission(); } }
    }
    // Reifenspuren
    const SK_N = 500, skM = new T.InstancedMesh(new T.PlaneGeometry(0.28, 0.9).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }), SK_N); skM.frustumCulled = false; scene.add(skM);
    let skI = 0, skAcc = 0; { const d0 = new T.Object3D(); d0.position.set(0, -500, 0); d0.updateMatrix(); for (let i = 0; i < SK_N; i++) skM.setMatrixAt(i, d0.matrix); }
    function skidStep(dt) {
      const sp = Math.hypot(car.vx, car.vz); skAcc += sp * dt; if (car.slip < 2.2 || sp < 5 || skAcc < 0.8) return; skAcc = 0; const c = Math.cos(car.h), s = Math.sin(car.h), d = new T.Object3D(), ang = Math.atan2(car.vx, car.vz);
      for (const a of [0.84, -0.84]) { const x = car.x + a * c - 1.4 * s, z = car.z - a * s - 1.4 * c; d.position.set(x, gh(x, z) + 0.07, z); d.rotation.set(0, ang, 0); d.updateMatrix(); skM.setMatrixAt(skI, d.matrix); skI = (skI + 1) % SK_N; }
      skM.instanceMatrix.needsUpdate = true;
    }

    /* ---------- Hauptschleife ---------- */
    const mm = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    let acc = 0, camPos = new T.Vector3(), camInit = false, shake = 0, tsir = 0; const look = new T.Vector3();
    function placeCamera(dt, snap) {
      const back = 9.5 + Math.min(4, Math.abs(car.vf) * 0.12), fx = Math.sin(car.h), fz = Math.cos(car.h); let d = back;
      for (let t = 1.5; t <= back; t += 1.0) { if (occ(car.x - fx * t, car.z - fz * t)) { d = Math.max(3.2, t - 1.5); break; } }
      const tx = car.x - fx * d, tz = car.z - fz * d, ty = Math.max(gh(tx, tz) + 1.8, car.y + 3.9 - (back - d) * 0.15); const target = new T.Vector3(tx, ty, tz);
      if (!camInit || snap) { camPos.copy(target); camInit = true; } else { camPos.lerp(target, 1 - Math.exp(-dt * 4.5)); if (occ(camPos.x, camPos.z)) camPos.copy(target); }      // Kamera nie in einer Hausecke
      camPos.y = Math.max(camPos.y, gh(camPos.x, camPos.z) + 1.4); cam.position.copy(camPos); if (car.impact > 0.2) cam.position.y += (Math.random() - 0.5) * 0.25;
      look.set(car.x + fx * 4, car.y + 1.9, car.z + fz * 4); cam.lookAt(look);
    }
    function reset() { const p = nearMain(car.x, car.z); car.x = p.x; car.z = p.z; car.vx = car.vz = car.vf = 0; car.steer = 0; car.y = gh(car.x, car.z); msg('Zurückgesetzt', 1.5); }
    function setPos(x, z, h) { car.x = x; car.z = z; if (h !== undefined) car.h = h; car.vx = car.vz = car.vf = 0; car.y = gh(x, z); placeCamera(0.016, true); }
    addEventListener('keydown', e => { keys[e.code] = true; if (audio && audio.A && audio.A.state === 'suspended') audio.A.resume();
      if (e.code === 'KeyL' && !DRIVER) { car.siren = !car.siren; sound(); } if (e.code === 'KeyT') { tod = (Math.floor(tod / 6) * 6 + 6) % 24; if (tod === 0) tod = 0.5; } if (e.code === 'KeyR') reset(); if (e.code === 'Space') e.preventDefault();
      if (e.code === 'Escape') { C.setDrive(false); V.hook = null; car3d.visible = false; hudEl.style.display = mapC.style.display = mis.style.display = arrow.style.display = help2.style.display = 'none'; document.getElementById('help').style.display = ''; mkP.visible = mkH.visible = false; } });
    addEventListener('keyup', e => keys[e.code] = false);
    sound(); C.setDrive(true); car3d.visible = true; document.getElementById('hud').style.maxWidth = '420px'; (DRIVER ? driverNewMission : newMission)(); placeCamera(0.016, true); applyTime();

    V.hook = function (dt, now) {
      inp.up = keys.KeyW || keys.ArrowUp ? 1 : 0; inp.down = keys.KeyS || keys.ArrowDown ? 1 : 0; inp.left = keys.KeyA || keys.ArrowLeft ? 1 : 0; inp.right = keys.KeyD || keys.ArrowRight ? 1 : 0; inp.hand = keys.Space ? 1 : 0;
      dt = Math.min(dt, 0.1); acc += dt; while (acc >= 1 / 60) { step(1 / 60, inp); acc -= 1 / 60; }
      tod = (tod + dt * todSpeed) % 24; applyTime(); (DRIVER ? driverMissionStep : missionStep)(dt); crowdStep(dt); crowdDraw(); trafficStep(dt); trafficDraw(); copStep(dt); copDraw(); skidStep(dt);
      car3d.position.set(car.x, car.y, car.z); car3d.rotation.set(-car.pitch, car.h, car.roll);
      for (const k in wheels) { const w = wheels[k]; if (!w) continue; w.spin.rotation.x += car.vf * dt / 0.36; if (w.front) w.steer.rotation.y = car.steer; }
      tsir += dt; const on = car.siren, ph = Math.floor(tsir * 6) % 2; blue.forEach((m, i) => m.material.emissiveIntensity = on ? (ph === (i % 2) ? 3 : 0.1) : 0); bl.forEach((l, i) => l.intensity = on ? (ph === i ? 2.2 : 0) : 0);
      if (audio && audio.A) { const t = audio.A.currentTime; audio.g.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.05); audio.o.frequency.setTargetAtTime(Math.floor(tsir / 0.95) % 2 ? 440 : 360, t, 0.02); audio.e.frequency.setTargetAtTime(38 + Math.abs(car.vf) * 3.2, t, 0.1); audio.eg.gain.setTargetAtTime(0.012 + Math.abs(car.vf) * 0.0012, t, 0.1);
        if (audio.sg) { audio.sg.gain.setTargetAtTime(car.slip > 2.2 && Math.abs(car.vf) > 4 ? Math.min(0.09, car.slip * 0.012) : 0, t, 0.04); const nd = cops.reduce((m, c) => c.ok && !c.retire ? Math.min(m, c.d) : m, 1e9); audio.pgn.gain.setTargetAtTime(nd < 260 ? 0.035 * (1 - nd / 260) : 0, t, 0.1); audio.po.frequency.setTargetAtTime(Math.floor(tsir / 0.55) % 2 ? 900 : 650, t, 0.01); } }
      placeCamera(dt);
      hudEl.innerHTML = '<div id="gSpeed">' + Math.round(Math.abs(car.vf) * 3.6) + '</div>km/h<br>' + String(Math.floor(tod)).padStart(2, '0') + ':' + String(Math.floor(tod % 1 * 60)).padStart(2, '0') + ' Uhr · Schäden ' + car.dmg + ' · Punkte ' + M.total + (DRIVER ? '<br>Zustand ' + Math.round(car.hp) + ' % · Fahndung ' + stars() + (bustT > 0.2 ? '<br>FESTNAHME ' + Math.round(Math.min(1, bustT / 3) * 100) + ' %' : '') : '');
      if (M.target) { const dx = M.target.x - car.x, dz = M.target.z - car.z, a = Math.atan2(dx, dz) - car.h; arrow.style.display = ''; arrow.style.transform = 'rotate(' + (-a) + 'rad)'; mis.innerHTML = (DRIVER ? (M.state === 'escape' ? 'Zum Versteck' : 'Zur Crew') : M.state === 'toHospital' ? 'Zum Krankenhaus' : 'Zum Patienten') + ' · ' + Math.round(Math.hypot(dx, dz)) + ' m · ⏱ ' + mm(M.time) + (M.state === 'toHospital' ? '<br><small>' + mj.hospital.name + '</small>' : ''); }
      else { arrow.style.display = 'none'; mis.innerHTML = M.state === 'loading' ? (DRIVER ? 'Crew steigt ein …' : 'Patient wird aufgenommen …') : M.state === 'done' ? (DRIVER ? 'Geschafft' : 'Einsatz beendet') + ' · ' + M.score + ' Punkte' : M.state === 'busted' ? 'Festgenommen' : M.state === 'failed' ? (DRIVER ? 'Fluchtfahrt gescheitert' : 'Einsatz gescheitert') : 'Bereit'; }
      drawMap(); if (toastT > 0) { toastT -= dt; if (toastT <= 0) toast.style.opacity = 0; }
    };
    V.game = window.__game = { copStat, locate, DRg: () => DR, comps: () => ({ n: DR.ncomp, main: DR.main, lens: DR.compLen.map(Math.round).sort((a, b) => b - a).slice(0, 8), nEdges: DR.E.length }), pathAt, driver: () => ({ heat, hp: car.hp, bustT, unseen, cops: cops.filter(c => c.ok).length, retire: cops.filter(c => c.ok && c.retire).length, dists: cops.filter(c => c.ok).map(c => Math.round(c.d)), inBuilding: cops.filter(c => c.ok && occ(c.x, c.z)).length, stars: stars() }), cops, copStep, copDraw, setHeat(v) { heat = v; }, heatAdd, driverMissionStep, driverNewMission, DRIVER, astar, nearestDN, traffic: () => TR ? { n: TR.cars.filter(c => c.ok).length, ms: +TR.ms.toFixed(2), spawned: TR.spawned, yielded: TR.yielded, bumps: TR.bumps, inBuilding: TR.cars.filter(c => c.ok && occ(c.x, c.z)).length, moving: TR.cars.filter(c => c.ok && c.v > 1).length, avgKmh: +(TR.cars.filter(c => c.ok).reduce((s, c) => s + c.v, 0) / Math.max(1, TR.cars.filter(c => c.ok).length) * 3.6).toFixed(1) } : null, trafficStep, trafficDraw, TRc: () => TR && TR.cars, graph: () => ({ drive: DR && DR.E.length, walk: PG && PG.E.length }), pedOnPath: () => agents.filter(a => a.ok && a.pe >= 0).length, nearRoad, agents, crowdStep, crowdDraw, walk, crowd: () => ({ n: agents.filter(a => a.ok).length, flee: agents.filter(a => a.state === 'flee').length, down: agents.filter(a => a.state === 'down').length, ms: +crowdMs.toFixed(2), knocked, fled }), car, inp, step, setPos, gh, occ, inMain, blocked, M, newMission, hosp, setTime(h) { tod = h; todSpeed = 0; applyTime(); }, missionStep, car3d, wheels, reset, state: () => ({ x: car.x, z: car.z, h: car.h, vf: car.vf, y: car.y, dmg: car.dmg, m: M.state, time: M.time, total: M.total, tod }) };
  }
})();
