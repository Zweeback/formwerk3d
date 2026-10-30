/* ============================================================
   CAD-Booleans (Vereinigung / Differenz / Schnitt) per BSP-Baum
   ============================================================ */
F.csg = (function () {
  const EPS = 1e-5;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.sqrt(dot(a, a));
  const unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  class Vtx {
    constructor(p, n, t) { this.p = p; this.n = n; this.t = t; }
    clone() { return new Vtx(this.p.slice(), this.n.slice(), this.t.slice()); }
    flip() { this.n = [-this.n[0], -this.n[1], -this.n[2]]; }
    lerp(o, s) { return new Vtx(mix(this.p, o.p, s), unit(mix(this.n, o.n, s)), [this.t[0] + (o.t[0] - this.t[0]) * s, this.t[1] + (o.t[1] - this.t[1]) * s]); }
  }
  class Plane {
    constructor(n, w) { this.n = n; this.w = w; }
    static from(a, b, c) { const n = unit(cross(sub(b, a), sub(c, a))); return new Plane(n, dot(n, a)); }
    clone() { return new Plane(this.n.slice(), this.w); }
    flip() { this.n = [-this.n[0], -this.n[1], -this.n[2]]; this.w = -this.w; }
    split(poly, cf, cb, front, back) {
      let type = 0; const types = [];
      for (let i = 0; i < poly.v.length; i++) {
        const t = dot(this.n, poly.v[i].p) - this.w;
        const ty = t < -EPS ? 2 : t > EPS ? 1 : 0;
        type |= ty; types.push(ty);
      }
      if (type === 0) (dot(this.n, poly.plane.n) > 0 ? cf : cb).push(poly);
      else if (type === 1) front.push(poly);
      else if (type === 2) back.push(poly);
      else {
        const f = [], b = [];
        for (let i = 0; i < poly.v.length; i++) {
          const j = (i + 1) % poly.v.length, ti = types[i], tj = types[j], vi = poly.v[i], vj = poly.v[j];
          if (ti !== 2) f.push(vi);
          if (ti !== 1) b.push(ti !== 2 ? vi.clone() : vi);
          if ((ti | tj) === 3) {
            const s = (this.w - dot(this.n, vi.p)) / dot(this.n, sub(vj.p, vi.p));
            const v = vi.lerp(vj, s); f.push(v); b.push(v.clone());
          }
        }
        if (f.length >= 3) front.push(new Poly(f, poly.plane.clone()));
        if (b.length >= 3) back.push(new Poly(b, poly.plane.clone()));
      }
    }
  }
  class Poly {
    constructor(v, plane) { this.v = v; this.plane = plane || Plane.from(v[0].p, v[1].p, v[2].p); }
    flip() { this.v.reverse(); this.v.forEach(x => x.flip()); this.plane.flip(); }
  }
  class Node {
    constructor(polys) { this.plane = null; this.front = null; this.back = null; this.polys = []; if (polys && polys.length) this.build(polys); }
    invert() {
      this.polys.forEach(p => p.flip()); this.plane && this.plane.flip();
      this.front && this.front.invert(); this.back && this.back.invert();
      const t = this.front; this.front = this.back; this.back = t;
    }
    clip(polys) {
      if (!this.plane) return polys.slice();
      let front = [], back = [];
      for (const p of polys) this.plane.split(p, front, back, front, back);
      if (this.front) front = this.front.clip(front);
      back = this.back ? this.back.clip(back) : [];
      return front.concat(back);
    }
    clipTo(bsp) { this.polys = bsp.clip(this.polys); this.front && this.front.clipTo(bsp); this.back && this.back.clipTo(bsp); }
    all() {
      let r = this.polys.slice();
      if (this.front) r = r.concat(this.front.all());
      if (this.back) r = r.concat(this.back.all());
      return r;
    }
    build(polys) {
      if (!polys.length) return;
      if (!this.plane) this.plane = polys[0].plane.clone();
      const front = [], back = [];
      for (const p of polys) this.plane.split(p, this.polys, this.polys, front, back);
      if (front.length) { if (!this.front) this.front = new Node(); this.front.build(front); }
      if (back.length) { if (!this.back) this.back = new Node(); this.back.build(back); }
    }
  }

  /* Mesh -> Polygone im Weltraum */
  function polysFromMesh(mesh) {
    mesh.updateMatrixWorld(true);
    const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, idx = g.index;
    const m = mesh.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(m), flipW = m.determinant() < 0;
    const tmp = new THREE.Vector3();
    const vtx = (i, fn) => {
      tmp.fromBufferAttribute(pos, i).applyMatrix4(m);
      const p = [tmp.x, tmp.y, tmp.z];
      let n = [0, 0, 1];
      if (nor) { tmp.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); n = [tmp.x, tmp.y, tmp.z]; }
      return new Vtx(p, n, uv ? [uv.getX(i), uv.getY(i)] : [0, 0]);
    };
    const count = idx ? idx.count : pos.count, out = [];
    for (let i = 0; i + 2 < count; i += 3) {
      let a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
      if (flipW) { const t = b; b = c; c = t; }
      const va = vtx(a), vb = vtx(b), vc = vtx(c);
      const cr = cross(sub(vb.p, va.p), sub(vc.p, va.p));
      if (len(cr) < 1e-12) continue;
      if (!nor) { const fn = unit(cr); va.n = vb.n = vc.n = fn; }
      out.push(new Poly([va, vb, vc]));
    }
    return out;
  }

  function toGeometry(polys) {
    const P = [], N = [], T = [];
    for (const poly of polys) {
      const v = poly.v;
      for (let i = 1; i < v.length - 1; i++) {
        for (const q of [v[0], v[i], v[i + 1]]) { P.push(q.p[0], q.p[1], q.p[2]); N.push(q.n[0], q.n[1], q.n[2]); T.push(q.t[0], q.t[1]); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(T, 2));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }

  const MAXTRI = 14000;
  function run(op, ma, mb) {
    const pa = polysFromMesh(ma), pb = polysFromMesh(mb);
    if (pa.length > MAXTRI || pb.length > MAXTRI) throw new Error('Netz zu fein für Booleans (max. ' + MAXTRI + ' Dreiecke pro Objekt) – vorher weniger Segmente verwenden');
    if (!pa.length || !pb.length) throw new Error('Ein Objekt enthält keine Dreiecke');
    let res;
    try {
      const a = new Node(pa), b = new Node(pb);
      if (op === 'union') {
        a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.all());
      } else if (op === 'subtract') {
        a.invert(); a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.all()); a.invert();
      } else if (op === 'intersect') {
        a.invert(); b.clipTo(a); b.invert(); a.clipTo(b); b.clipTo(a); a.build(b.all()); a.invert();
      } else throw new Error('Unbekannte Operation: ' + op);
      res = a.all();
    } catch (e) {
      if (e instanceof RangeError) throw new Error('Boolean zu komplex (Stapelüberlauf) – Segmentzahl verringern');
      throw e;
    }
    if (!res.length) throw new Error('Ergebnis ist leer (Objekte überlappen nicht?)');
    return toGeometry(res);
  }
  return { run, toGeometry, polysFromMesh };
})();
