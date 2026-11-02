/* Fahrmodus: Rettungswagen im Kachel-Dortmund. Boden- und Kollisionskarte, Arcade-Fahrphysik, Tag/Nacht, Notruf-Mission. */
(function () {
  'use strict';
  const wait = () => new Promise(r => { const t = setInterval(() => { if (window.__ready && window.__v && window.__v.core) { clearInterval(t); r(); } }, 40); });
  let started = false;
  (async function boot() {
    await wait(); const q = new URLSearchParams(location.search), b = document.getElementById('gobtn');
    b.onclick = () => start(q); if (q.has('game')) start(q);
  })();

  async function start(q) {
    if (started) return; started = true;
    const V = window.__v, C = V.core, T = C.THREE, BASE = C.BASE, scene = C.scene, cam = C.cam;
    const say = document.getElementById('hud'); say.textContent = 'Lade Fahrdaten …';
    const buf = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.arrayBuffer(); });
    const [gb, cb, mb, mj] = await Promise.all([buf(BASE + 'ground.bin'), buf(BASE + 'col.bin'), buf(BASE + 'main.bin'), fetch(BASE + 'mission.json').then(r => r.json())]);
    const gltf = await new Promise((res, rej) => new T.GLTFLoader().load('rtw.glb', res, undefined, rej));
    const ground = new Uint16Array(gb), col = new Uint8Array(cb), main = new Uint8Array(mb);
    const GW = 769, GH = 1025, HMIN = -40, HSC = 1000, CW = mj.w, CH = mj.h, ROWB = mj.row_bytes;
    const gh = (x, z) => { let fx = Math.min(GW - 1.001, Math.max(0, x / 4)), fz = Math.min(GH - 1.001, Math.max(0, -z / 4)); const j = fx | 0, i = fz | 0, u = fx - j, v = fz - i;
      return HMIN + (ground[i * GW + j] * (1 - u) * (1 - v) + ground[i * GW + j + 1] * u * (1 - v) + ground[(i + 1) * GW + j] * (1 - u) * v + ground[(i + 1) * GW + j + 1] * u * v) / HSC; };
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
    const car = { x: mj.start.x, z: mj.start.z, h: mj.start.heading, vx: 0, vz: 0, vf: 0, steer: 0, y: 0, pitch: 0, roll: 0, dmg: 0, siren: false, impact: 0 };
    car.y = gh(car.x, car.z);
    const inp = { up: 0, down: 0, left: 0, right: 0, hand: 0 }; const keys = {};
    const sample = []; for (const a of [-1.1, 0, 1.1]) for (const b of [-2.95, -1.5, 0, 1.5, 2.95]) sample.push([a, b]);
    function blocked(x, z, h) { const c = Math.cos(h), s = Math.sin(h); for (const [a, b] of sample) if (occ(x + a * c + b * s, z - a * s + b * c)) return true; return false; }
    let audio = null;
    function sound() { if (audio) return audio; try {
      const A = new (window.AudioContext || window.webkitAudioContext)(), g = A.createGain(); g.gain.value = 0; g.connect(A.destination);
      const o = A.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 360; o.connect(g); o.start();
      const e = A.createOscillator(), eg = A.createGain(); e.type = 'sawtooth'; e.frequency.value = 40; eg.gain.value = 0.02; e.connect(eg); eg.connect(A.destination); e.start();
      audio = { A, g, o, e, eg }; } catch (err) { audio = { A: null }; } return audio; }
    function thump(p) { const a = sound(); if (!a.A) return; try { const n = a.A.sampleRate * 0.25, bf = a.A.createBuffer(1, n, a.A.sampleRate), d = bf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * 0.18)); const s = a.A.createBufferSource(), g = a.A.createGain(); g.gain.value = clamp(p / 20, 0.05, 0.5); s.buffer = bf; s.connect(g); g.connect(a.A.destination); s.start(); } catch (err) { } }

    function step(dt, k) {
      const h = car.h, fx = Math.sin(h), fz = Math.cos(h), lx = Math.cos(h), lz = -Math.sin(h);
      let vf = car.vx * fx + car.vz * fz, vl = car.vx * lx + car.vz * lz; const VMAX = 30;
      if (k.up) vf += (vf < 0 ? 15 : 7.5 * (1 - Math.max(0, vf) / VMAX)) * dt;
      if (k.down) vf -= (vf > 0.4 ? 15 : 4.5 * (1 - Math.min(1, -vf / 8))) * dt;
      vf -= 0.012 * vf * Math.abs(vf) * dt; if (!k.up && !k.down) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 0.7 * dt);
      if (k.hand) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 8 * dt);
      vl *= Math.exp(-(k.hand ? 1.3 : 7) * dt);
      const maxSt = 0.62 / (1 + Math.abs(vf) / 8), target = (k.left - k.right) * maxSt; car.steer += (target - car.steer) * Math.min(1, 7 * dt);
      const yaw = vf * Math.tan(car.steer) / 3.3, nh = h + yaw * dt;
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
      if (hit && sp0 > 4.5 && car.impact <= 0) { car.dmg++; car.impact = 0.4; thump(sp0); }
      car.impact -= dt; car.vx = vx; car.vz = vz; car.vf = vx * Math.sin(car.h) + vz * Math.cos(car.h);
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
    help2.innerHTML = 'W/S Gas, Bremse · A/D lenken · Leertaste Handbremse · L Blaulicht + Sirene · T Tageszeit · R zurücksetzen · Esc zurück zum Flug';
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
    octx.putImageData(img, 0, 0);
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
    const M = { state: 'idle', target: null, time: 0, loadT: 0, score: 0, count: 0, total: 0, last: '' }; const hosp = nearMain(mj.hospital.x, mj.hospital.z);
    function nearMain(x, z) { if (inMain(x, z)) return { x, z }; for (let r = 2; r < 400; r += 2) for (let a = 0; a < 360; a += 15) { const px = x + r * Math.cos(a * Math.PI / 180), pz = z + r * Math.sin(a * Math.PI / 180); if (inMain(px, pz)) return { x: px, z: pz }; } return { x, z }; }
    const markers = []; function marker(color) { const g = new T.Group(); const cyl = new T.Mesh(new T.CylinderGeometry(4, 4, 90, 24, 1, true), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: T.DoubleSide, depthWrite: false, fog: false }));
      const ring = new T.Mesh(new T.TorusGeometry(6, 0.35, 8, 40), new T.MeshBasicMaterial({ color, fog: false })); ring.rotation.x = Math.PI / 2; cyl.position.y = 45; g.add(cyl, ring); g.visible = false; scene.add(g); markers.push(g); return g; }
    const mkP = marker(0xff3b30), mkH = marker(0x3a8dff);
    function setTarget(t, which) { M.target = t; mkP.visible = which === 'p'; mkH.visible = which === 'h'; const m = which === 'p' ? mkP : mkH; m.position.set(t.x, gh(t.x, t.z), t.z); }
    function newMission() {
      let best = null; for (let k = 0; k < 600; k++) { const x = rnd(200, 2870), z = rnd(-3900, -200), d = Math.hypot(x - car.x, z - car.z), lim = k < 300 ? [450, 1300] : [200, 2500];
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

    /* ---------- Passanten (einfache KI: Umherlaufen, Ausweichen, Fliehen) ---------- */
    const NPC_N = +(new URLSearchParams(location.search).get('npc') || 600), RING = [25, 260], KEEP = 330;
    const walk = (x, z) => !occ(x, z) && !occ(x + 1.2, z) && !occ(x - 1.2, z) && !occ(x, z + 1.2) && !occ(x, z - 1.2);
    const bodyG = new T.CylinderGeometry(0.22, 0.2, 1.0, 8); bodyG.translate(0, 0.85, 0); const headG = new T.SphereGeometry(0.15, 8, 6); headG.translate(0, 1.6, 0);
    const bodyM = new T.InstancedMesh(bodyG, new T.MeshStandardMaterial({ roughness: 0.9 }), NPC_N), headM = new T.InstancedMesh(headG, new T.MeshStandardMaterial({ roughness: 0.8 }), NPC_N);
    bodyM.frustumCulled = headM.frustumCulled = false; scene.add(bodyM, headM);
    const cloth = [0x2d4a7a, 0x8a2b2b, 0x3b6b3b, 0x555555, 0xb8892b, 0x6a4a8a, 0x222222, 0xc9c9c9, 0x1f7a7a], skin = [0xf1c8a5, 0xd9a273, 0xa8744c, 0x7a4e30, 0xfbdcc0];
    const agents = []; const dummy = new T.Object3D(); const hashCell = 3; let crowdMs = 0, knocked = 0, fled = 0;
    function spawn(a) { for (let k = 0; k < 40; k++) { const r = rnd(RING[0], RING[1]), an = rnd(0, 6.283), x = car.x + Math.cos(an) * r, z = car.z + Math.sin(an) * r; if (x > 4 && x < 3068 && z < -4 && z > -4092 && walk(x, z)) { a.x = x; a.z = z; a.h = rnd(0, 6.283); a.state = 'walk'; a.t = rnd(2, 6); a.sp = rnd(1.1, 1.6); a.ok = true; return; } } a.ok = false; a.x = car.x; a.z = car.z; }
    for (let i = 0; i < NPC_N; i++) { const a = { x: 0, z: 0, h: 0, sp: 1.3, state: 'walk', t: 0, ph: rnd(0, 6.28), ok: false }; spawn(a); agents.push(a); bodyM.setColorAt(i, new T.Color(cloth[i % cloth.length])); headM.setColorAt(i, new T.Color(skin[(i * 7) % skin.length])); }
    bodyM.instanceColor.needsUpdate = headM.instanceColor.needsUpdate = true;
    function crowdStep(dt) {
      const t0 = performance.now(), fx = Math.sin(car.h), fz = Math.cos(car.h), lx = Math.cos(car.h), lz = -Math.sin(car.h), csp = Math.abs(car.vf);
      const hash = new Map(); agents.forEach((a, i) => { if (!a.ok) return; const k = ((a.x / hashCell) | 0) * 4096 + ((a.z / hashCell) | 0); (hash.get(k) || hash.set(k, []).get(k)).push(i); });
      agents.forEach((a, i) => {
        if (!a.ok) { spawn(a); return; } const dx = a.x - car.x, dz = a.z - car.z, d = Math.hypot(dx, dz);
        if (d > KEEP) { spawn(a); return; }
        if (a.state === 'down') { a.t -= dt; if (a.t <= 0) spawn(a); return; }
        if (d < 2.0 && csp > 3.5) { a.state = 'down'; a.t = 3.5; knocked++; car.dmg++; msg('Passant angefahren! Schaden +1', 2.5); return; }
        const ahead = dx * fx + dz * fz; let vx, vz, sp = a.sp;
        if (d < (car.siren ? 48 : 16) && csp > 2 && ahead > -6 && Math.abs(dx * lx + dz * lz) < 14) { if (a.state !== 'flee') fled++; a.state = 'flee'; a.t = 2.2; const side = Math.sign(dx * lx + dz * lz) || (i % 2 ? 1 : -1); a.h = Math.atan2(lx * side, lz * side); sp = 3.2; }
        else if (a.state === 'flee') { a.t -= dt; sp = 3.0; if (a.t <= 0) a.state = 'walk'; }
        else { a.t -= dt; if (a.t <= 0) { a.h += rnd(-1.4, 1.4); a.t = rnd(2, 7); } }
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

    /* ---------- Hauptschleife ---------- */
    const mm = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    let acc = 0, camPos = new T.Vector3(), camInit = false, shake = 0, tsir = 0; const look = new T.Vector3();
    function placeCamera(dt, snap) {
      const back = 9.5 + Math.min(4, Math.abs(car.vf) * 0.12), fx = Math.sin(car.h), fz = Math.cos(car.h); let d = back;
      for (let t = 1.5; t <= back; t += 1.0) { if (occ(car.x - fx * t, car.z - fz * t)) { d = Math.max(3.2, t - 1.5); break; } }
      const tx = car.x - fx * d, tz = car.z - fz * d, ty = Math.max(gh(tx, tz) + 1.8, car.y + 3.9 - (back - d) * 0.15); const target = new T.Vector3(tx, ty, tz);
      if (!camInit || snap) { camPos.copy(target); camInit = true; } else camPos.lerp(target, 1 - Math.exp(-dt * 4.5));
      camPos.y = Math.max(camPos.y, gh(camPos.x, camPos.z) + 1.4); cam.position.copy(camPos); if (car.impact > 0.2) cam.position.y += (Math.random() - 0.5) * 0.25;
      look.set(car.x + fx * 4, car.y + 1.9, car.z + fz * 4); cam.lookAt(look);
    }
    function reset() { const p = nearMain(car.x, car.z); car.x = p.x; car.z = p.z; car.vx = car.vz = car.vf = 0; car.steer = 0; car.y = gh(car.x, car.z); msg('Zurückgesetzt', 1.5); }
    function setPos(x, z, h) { car.x = x; car.z = z; if (h !== undefined) car.h = h; car.vx = car.vz = car.vf = 0; car.y = gh(x, z); placeCamera(0.016, true); }
    addEventListener('keydown', e => { keys[e.code] = true; if (audio && audio.A && audio.A.state === 'suspended') audio.A.resume();
      if (e.code === 'KeyL') { car.siren = !car.siren; sound(); } if (e.code === 'KeyT') { tod = (Math.floor(tod / 6) * 6 + 6) % 24; if (tod === 0) tod = 0.5; } if (e.code === 'KeyR') reset(); if (e.code === 'Space') e.preventDefault();
      if (e.code === 'Escape') { C.setDrive(false); V.hook = null; car3d.visible = false; hudEl.style.display = mapC.style.display = mis.style.display = arrow.style.display = help2.style.display = 'none'; document.getElementById('help').style.display = ''; mkP.visible = mkH.visible = false; } });
    addEventListener('keyup', e => keys[e.code] = false);
    sound(); C.setDrive(true); car3d.visible = true; document.getElementById('hud').style.maxWidth = '420px'; newMission(); placeCamera(0.016, true); applyTime();

    V.hook = function (dt, now) {
      inp.up = keys.KeyW || keys.ArrowUp ? 1 : 0; inp.down = keys.KeyS || keys.ArrowDown ? 1 : 0; inp.left = keys.KeyA || keys.ArrowLeft ? 1 : 0; inp.right = keys.KeyD || keys.ArrowRight ? 1 : 0; inp.hand = keys.Space ? 1 : 0;
      dt = Math.min(dt, 0.1); acc += dt; while (acc >= 1 / 60) { step(1 / 60, inp); acc -= 1 / 60; }
      tod = (tod + dt * todSpeed) % 24; applyTime(); missionStep(dt); crowdStep(dt); crowdDraw();
      car3d.position.set(car.x, car.y, car.z); car3d.rotation.set(-car.pitch, car.h, car.roll);
      for (const k in wheels) { const w = wheels[k]; if (!w) continue; w.spin.rotation.x += car.vf * dt / 0.36; if (w.front) w.steer.rotation.y = car.steer; }
      tsir += dt; const on = car.siren, ph = Math.floor(tsir * 6) % 2; blue.forEach((m, i) => m.material.emissiveIntensity = on ? (ph === (i % 2) ? 3 : 0.1) : 0); bl.forEach((l, i) => l.intensity = on ? (ph === i ? 2.2 : 0) : 0);
      if (audio && audio.A) { const t = audio.A.currentTime; audio.g.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.05); audio.o.frequency.setTargetAtTime(Math.floor(tsir / 0.95) % 2 ? 440 : 360, t, 0.02); audio.e.frequency.setTargetAtTime(38 + Math.abs(car.vf) * 3.2, t, 0.1); audio.eg.gain.setTargetAtTime(0.012 + Math.abs(car.vf) * 0.0012, t, 0.1); }
      placeCamera(dt);
      hudEl.innerHTML = '<div id="gSpeed">' + Math.round(Math.abs(car.vf) * 3.6) + '</div>km/h<br>' + String(Math.floor(tod)).padStart(2, '0') + ':' + String(Math.floor(tod % 1 * 60)).padStart(2, '0') + ' Uhr · Schäden ' + car.dmg + ' · Punkte ' + M.total;
      if (M.target) { const dx = M.target.x - car.x, dz = M.target.z - car.z, a = Math.atan2(dx, dz) - car.h; arrow.style.display = ''; arrow.style.transform = 'rotate(' + (-a) + 'rad)'; mis.innerHTML = (M.state === 'toHospital' ? 'Zum Krankenhaus' : 'Zum Patienten') + ' · ' + Math.round(Math.hypot(dx, dz)) + ' m · ⏱ ' + mm(M.time) + (M.state === 'toHospital' ? '<br><small>' + mj.hospital.name.split(' (')[0] + ' (Platzhalter)</small>' : ''); }
      else { arrow.style.display = 'none'; mis.innerHTML = M.state === 'loading' ? 'Patient wird aufgenommen …' : M.state === 'done' ? 'Einsatz beendet · ' + M.score + ' Punkte' : M.state === 'failed' ? 'Einsatz gescheitert' : 'Bereit'; }
      drawMap(); if (toastT > 0) { toastT -= dt; if (toastT <= 0) toast.style.opacity = 0; }
    };
    V.game = window.__game = { agents, crowdStep, crowdDraw, walk, crowd: () => ({ n: agents.filter(a => a.ok).length, flee: agents.filter(a => a.state === 'flee').length, down: agents.filter(a => a.state === 'down').length, ms: +crowdMs.toFixed(2), knocked, fled }), car, inp, step, setPos, gh, occ, inMain, blocked, M, newMission, hosp, setTime(h) { tod = h; todSpeed = 0; applyTime(); }, missionStep, car3d, wheels, reset, state: () => ({ x: car.x, z: car.z, h: car.h, vf: car.vf, y: car.y, dmg: car.dmg, m: M.state, time: M.time, total: M.total, tod }) };
  }
})();
