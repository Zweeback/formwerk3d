/* ============================================================
   Export / Import: OBJ, MTL, STL, glTF/GLB, C++, OpenGL, Unity C#,
   Unreal C++, Godot, Blender (Python), three.js, Szene als JSON
   Interne Konvention: Meter, Y oben, rechtshändig (wie glTF)
   ============================================================ */
const X = F.exp = {};
const GEO = F.geo;

/* ---------- Auswahl & Vorbereitung ---------- */
X.items = function (scope) {
  let list = scope === 'all' ? V.objects().filter(o => o.visible) : S.sel.filter(o => o.isMesh && o.parent === V.world && o.visible);
  if (!list.length) list = V.objects().filter(o => o.visible);
  return list;
};
function srgbOf(mat) { const c = mat && mat.color ? mat.color : new THREE.Color(0xcccccc); const hx = F.hex(c); return [parseInt(hx.slice(1, 3), 16) / 255, parseInt(hx.slice(3, 5), 16) / 255, parseInt(hx.slice(5, 7), 16) / 255]; }
const toLin = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
function smoothNormals(pos) { // pos: nicht indiziert -> geglättete Normalen über gleiche Positionen
  const n = pos.length / 9, key = new Map(), acc = [], ids = new Int32Array(n * 3), q = 1e4;
  for (let i = 0; i < n * 3; i++) { const k = Math.round(pos[i * 3] * q) + ',' + Math.round(pos[i * 3 + 1] * q) + ',' + Math.round(pos[i * 3 + 2] * q); let id = key.get(k); if (id === undefined) { id = acc.length / 3; key.set(k, id); acc.push(0, 0, 0); } ids[i] = id; }
  for (let t = 0; t < n; t++) {
    const a = t * 9, ux = pos[a + 3] - pos[a], uy = pos[a + 4] - pos[a + 1], uz = pos[a + 5] - pos[a + 2], vx = pos[a + 6] - pos[a], vy = pos[a + 7] - pos[a + 1], vz = pos[a + 8] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (let k = 0; k < 3; k++) { const id = ids[t * 3 + k] * 3; acc[id] += nx; acc[id + 1] += ny; acc[id + 2] += nz; }
  }
  const out = new Float32Array(n * 9);
  for (let i = 0; i < n * 3; i++) { const id = ids[i] * 3; let x = acc[id], y = acc[id + 1], z = acc[id + 2]; const l = Math.hypot(x, y, z) || 1; out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l; }
  return out;
}
/* Ein Objekt in Weltkoordinaten, nicht indiziert */
X.prep = function (obj, o) {
  o = o || {}; obj.updateMatrixWorld(true);
  const src = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone(); const n = src.attributes.position.count;
  const hasSkin = !!(obj.isSkinnedMesh && src.attributes.skinIndex), keepSkin = !!(o.skin && hasSkin);
  const pos = Float32Array.from(src.attributes.position.array); let nor = src.attributes.normal ? Float32Array.from(src.attributes.normal.array) : null;
  const uv = src.attributes.uv ? Float32Array.from(src.attributes.uv.array) : new Float32Array(n * 2);
  let posed = false;
  if (hasSkin && !keepSkin && o.pose !== false && !obj.geometry.index) {
    const v = new THREE.Vector3(); for (let i = 0; i < n; i++) { v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); obj.boneTransform(i, v); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; } posed = true;
  }
  const m = obj.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(m), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(m); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; }
  if (posed || !nor) nor = smoothNormals(pos);
  else for (let i = 0; i < n; i++) { v.set(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]).applyMatrix3(nm).normalize(); nor[i * 3] = v.x; nor[i * 3 + 1] = v.y; nor[i * 3 + 2] = v.z; }
  const mat = obj.material || {};
  return { name: obj.name, n, pos, nor, uv, color: srgbOf(mat), rough: mat.roughness === undefined ? 0.6 : mat.roughness, metal: mat.metalness || 0, opacity: mat.userData && mat.userData.opacity !== undefined ? mat.userData.opacity : 1,
    skinI: keepSkin ? Uint16Array.from(src.attributes.skinIndex.array) : null, skinW: keepSkin ? Float32Array.from(src.attributes.skinWeight.array) : null };
};
X.prepAll = (list, o) => list.map(ob => X.prep(ob, o));
/* gleiche Punkte (Position, Normale, UV, Gewichte) zusammenfassen -> indizierte Daten */
X.indexed = function (it) {
  const n = it.n, map = new Map(), P = [], N = [], U = [], SI = [], SW = [], I = new Uint32Array(n), q = 1e4, sk = !!it.skinI;
  for (let i = 0; i < n; i++) {
    const a = i * 3, p = it.pos, nn = it.nor, u = it.uv;
    let key = Math.round(p[a] * q) + ',' + Math.round(p[a + 1] * q) + ',' + Math.round(p[a + 2] * q) + ',' + Math.round(nn[a] * 1e3) + ',' + Math.round(nn[a + 1] * 1e3) + ',' + Math.round(nn[a + 2] * 1e3) + ',' + Math.round(u[i * 2] * 1e4) + ',' + Math.round(u[i * 2 + 1] * 1e4);
    if (sk) key += ',' + it.skinI[i * 4] + it.skinI[i * 4 + 1] + it.skinI[i * 4 + 2] + it.skinI[i * 4 + 3] + ',' + Math.round(it.skinW[i * 4] * 1e3) + ',' + Math.round(it.skinW[i * 4 + 1] * 1e3);
    let id = map.get(key);
    if (id === undefined) { id = P.length / 3; map.set(key, id); P.push(p[a], p[a + 1], p[a + 2]); N.push(nn[a], nn[a + 1], nn[a + 2]); U.push(u[i * 2], u[i * 2 + 1]); if (sk) for (let k = 0; k < 4; k++) { SI.push(it.skinI[i * 4 + k]); SW.push(it.skinW[i * 4 + k]); } }
    I[i] = id;
  }
  return { P: Float32Array.from(P), N: Float32Array.from(N), U: Float32Array.from(U), I, SI: sk ? Uint16Array.from(SI) : null, SW: sk ? Float32Array.from(SW) : null, vc: P.length / 3, tc: Math.floor(n / 3) };
};

/* ---------- Zielsysteme: Achsen, Einheiten, Windungsrichtung, UV ---------- */
const TG = {
  gl: { p: (x, y, z) => [x, y, z], n: (x, y, z) => [x, y, z], uv: (u, v) => [u, v], flip: false, d: 1e4 },
  unity: { p: (x, y, z) => [-x, y, z], n: (x, y, z) => [-x, y, z], uv: (u, v) => [u, v], flip: true, d: 1e4 },
  unreal: { p: (x, y, z) => [-z * 100, x * 100, y * 100], n: (x, y, z) => [-z, x, y], uv: (u, v) => [u, 1 - v], flip: true, d: 1e3 },
  godot: { p: (x, y, z) => [x, y, z], n: (x, y, z) => [x, y, z], uv: (u, v) => [u, 1 - v], flip: true, d: 1e4 },
  blender: { p: (x, y, z) => [x, -z, y], n: (x, y, z) => [x, -z, y], uv: (u, v) => [u, v], flip: false, d: 1e4 }
};
const nf = (v, d) => { const s = (Math.round(v * (d || 1e4)) / (d || 1e4)).toString(); return s === '-0' ? '0' : s; };
const cf = s => (s.indexOf('.') < 0 && s.indexOf('e') < 0) ? s + 'f' : s + 'f';
function ident(name, used) {
  let s = String(name || 'Objekt').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'Objekt';
  if (/^[0-9]/.test(s)) s = '_' + s; let b = s, i = 2; while (used && used.has(s)) s = b + '_' + i++; if (used) used.add(s); return s;
}
/* konvertierte, indizierte Daten eines Objekts: Strings pro Punkt / Dreieck */
function conv(it, tg, fl) {
  const T = TG[tg], ix = X.indexed(it), rows = [], tris = [], d = T.d;
  for (let i = 0; i < ix.vc; i++) {
    const p = T.p(ix.P[i * 3], ix.P[i * 3 + 1], ix.P[i * 3 + 2]), nn = T.n(ix.N[i * 3], ix.N[i * 3 + 1], ix.N[i * 3 + 2]), uv = T.uv(ix.U[i * 2], ix.U[i * 2 + 1]);
    const r = [nf(p[0], d), nf(p[1], d), nf(p[2], d), nf(nn[0], 1e3), nf(nn[1], 1e3), nf(nn[2], 1e3), nf(uv[0], 1e4), nf(uv[1], 1e4)]; rows.push(fl ? r.map(cf) : r);
  }
  for (let t = 0; t < ix.tc; t++) { const a = ix.I[t * 3], b = ix.I[t * 3 + 1], c = ix.I[t * 3 + 2]; tris.push(T.flip ? [a, c, b] : [a, b, c]); }
  return { rows, tris, ix };
}
const rowsText = (rows, ind) => rows.map(r => ind + r.join(', ')).join(',\n');
const triText = (tris, ind) => tris.map(t => ind + t.join(', ')).join(',\n');
const hex = c => '#' + [c[0], c[1], c[2]].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
function bounds(items) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  items.forEach(it => { for (let i = 0; i < it.n; i++) for (let k = 0; k < 3; k++) { const v = it.pos[i * 3 + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; } });
  const c = [0, 1, 2].map(k => (mn[k] + mx[k]) / 2); return { c, r: Math.max(0.01, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2) };
}
const head = (items, extra) => {
  const t = items.reduce((s, it) => s + Math.floor(it.n / 3), 0);
  return 'Formwerk 3D · ' + items.length + ' Objekt' + (items.length === 1 ? '' : 'e') + ' · ' + t + ' Dreiecke' + (extra ? ' · ' + extra : '');
};

/* ---------- Textformate ---------- */
X.obj = function (items) {
  let off = 1, vo = 1, out = ['# ' + head(items), '# Einheit: Meter, Y oben', 'mtllib formwerk.mtl'];
  items.forEach(it => {
    const ix = X.indexed(it); out.push('o ' + it.name.replace(/\s+/g, '_'), 'usemtl ' + ident(it.name));
    for (let i = 0; i < ix.vc; i++) out.push('v ' + nf(ix.P[i * 3]) + ' ' + nf(ix.P[i * 3 + 1]) + ' ' + nf(ix.P[i * 3 + 2]));
    for (let i = 0; i < ix.vc; i++) out.push('vt ' + nf(ix.U[i * 2]) + ' ' + nf(ix.U[i * 2 + 1]));
    for (let i = 0; i < ix.vc; i++) out.push('vn ' + nf(ix.N[i * 3], 1e3) + ' ' + nf(ix.N[i * 3 + 1], 1e3) + ' ' + nf(ix.N[i * 3 + 2], 1e3));
    for (let t = 0; t < ix.tc; t++) { const f = [0, 1, 2].map(k => { const i = ix.I[t * 3 + k] + off; return i + '/' + i + '/' + i; }); out.push('f ' + f.join(' ')); }
    off += ix.vc;
  });
  return out.join('\n');
};
X.mtl = function (items) {
  const used = new Set(); return ['# Formwerk 3D Materialien'].concat(items.map(it => 'newmtl ' + ident(it.name) + '\nKd ' + it.color.map(v => nf(v, 1e3)).join(' ') + '\nKs 0.1 0.1 0.1\nNs ' + Math.round((1 - clamp(it.rough, 0, 1)) * 200) + '\nd ' + nf(it.opacity, 1e3))).join('\n\n');
};
X.stlText = function (items, o) {
  o = o || {}; const zup = o.zup !== false; const out = ['solid formwerk'];
  items.forEach(it => {
    for (let t = 0; t < it.n; t += 3) {
      const P = [0, 1, 2].map(k => { const a = (t + k) * 3; let x = it.pos[a], y = it.pos[a + 1], z = it.pos[a + 2]; if (zup) { const ty = y; y = -z; z = ty; } return [x * (o.scale || 1), y * (o.scale || 1), z * (o.scale || 1)]; });
      const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2], vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
      out.push(' facet normal ' + nf(nx / l, 1e5) + ' ' + nf(ny / l, 1e5) + ' ' + nf(nz / l, 1e5), '  outer loop'); P.forEach(p => out.push('   vertex ' + nf(p[0], 1e5) + ' ' + nf(p[1], 1e5) + ' ' + nf(p[2], 1e5))); out.push('  endloop', ' endfacet');
    }
  });
  out.push('endsolid formwerk'); return out.join('\n');
};
X.stlBinary = function (items, o) {
  o = o || {}; const zup = o.zup !== false; let tc = 0; items.forEach(it => tc += Math.floor(it.n / 3));
  const buf = new ArrayBuffer(84 + tc * 50), dv = new DataView(buf); let p = 84; dv.setUint32(80, tc, true);
  items.forEach(it => {
    for (let t = 0; t < it.n; t += 3) {
      const P = [0, 1, 2].map(k => { const a = (t + k) * 3; let x = it.pos[a], y = it.pos[a + 1], z = it.pos[a + 2]; if (zup) { const ty = y; y = -z; z = ty; } return [x, y, z]; });
      const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2], vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; [nx / l, ny / l, nz / l].forEach(v => { dv.setFloat32(p, v, true); p += 4; });
      P.forEach(q => q.forEach(v => { dv.setFloat32(p, v, true); p += 4; })); p += 2;
    }
  });
  return buf;
};
X.cppArrays = function (items) {
  const used = new Set(), body = items.map(it => {
    const id = ident(it.name, used), c = conv(it, 'gl'), big = c.ix.vc > 65535, ty = big ? 'uint32_t' : 'uint16_t';
    return '// ' + it.name + ' – ' + c.ix.vc + ' Punkte, ' + c.ix.tc + ' Dreiecke\nnamespace ' + id + ' {\nconstexpr unsigned kVertexCount = ' + c.ix.vc + ';\nconstexpr unsigned kIndexCount = ' + c.ix.tc * 3 + ';\nconstexpr float kColor[3] = {' + it.color.map(v => nf(v, 1e3) + 'f').join(', ') + '};\n// Pro Punkt: x, y, z, nx, ny, nz, u, v\nstatic const float kVertices[] = {\n' + rowsText(c.rows.map(r => r.map(cf)), '    ') + '\n};\nstatic const ' + ty + ' kIndices[] = {\n' + triText(c.tris, '    ') + '\n};\n}  // namespace ' + id;
  });
  return '// ' + head(items) + '\n// Einheit: Meter · Y oben · rechtshändig · Dreiecke gegen den Uhrzeigersinn (OpenGL / glTF)\n#pragma once\n#include <cstdint>\n\n' + body.join('\n\n') + '\n';
};
X.cppGL = function (items) {
  const used = new Set(), b = bounds(items), meshes = items.map(it => { const id = ident(it.name, used), c = conv(it, 'gl'); return { it, id, c }; });
  const data = meshes.map(m => '// ' + m.it.name + '\nstatic const float V_' + m.id + '[] = {\n' + rowsText(m.c.rows.map(r => r.map(cf)), '    ') + '\n};\nstatic const uint32_t I_' + m.id + '[] = {\n' + triText(m.c.tris, '    ') + '\n};\nstatic const float C_' + m.id + '[3] = {' + m.it.color.map(v => nf(v, 1e3) + 'f').join(', ') + '};').join('\n\n');
  const ups = meshes.map(m => '    meshes.push_back(upload(V_' + m.id + ', sizeof(V_' + m.id + ') / sizeof(float), I_' + m.id + ', sizeof(I_' + m.id + ') / sizeof(uint32_t), C_' + m.id + '));').join('\n');
  return '// ' + head(items) + ' → OpenGL 3.3 Core (GLFW + GLAD + GLM)\n// Linux: g++ main.cpp glad.c -std=c++17 -lglfw -ldl -o viewer\n#include <glad/glad.h>\n#include <GLFW/glfw3.h>\n#include <glm/glm.hpp>\n#include <glm/gtc/matrix_transform.hpp>\n#include <glm/gtc/type_ptr.hpp>\n#include <cmath>\n#include <cstdint>\n#include <cstdio>\n#include <vector>\n\n// ---- Modelldaten (x y z  nx ny nz  u v) ----\n' + data + '\n\nstatic const float kCenter[3] = {' + b.c.map(v => nf(v) + 'f').join(', ') + '};\nstatic const float kRadius = ' + nf(b.r) + 'f;\n\nstruct Mesh { GLuint vao = 0, vbo = 0, ebo = 0; GLsizei count = 0; float col[3] = {1, 1, 1}; };\n\nstatic Mesh upload(const float* v, size_t vn, const uint32_t* idx, size_t in, const float* c) {\n    Mesh m; m.count = (GLsizei)in; m.col[0] = c[0]; m.col[1] = c[1]; m.col[2] = c[2];\n    glGenVertexArrays(1, &m.vao); glGenBuffers(1, &m.vbo); glGenBuffers(1, &m.ebo);\n    glBindVertexArray(m.vao);\n    glBindBuffer(GL_ARRAY_BUFFER, m.vbo);\n    glBufferData(GL_ARRAY_BUFFER, vn * sizeof(float), v, GL_STATIC_DRAW);\n    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, m.ebo);\n    glBufferData(GL_ELEMENT_ARRAY_BUFFER, in * sizeof(uint32_t), idx, GL_STATIC_DRAW);\n    const GLsizei stride = 8 * sizeof(float);\n    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, stride, (void*)0);\n    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, stride, (void*)(3 * sizeof(float)));\n    glVertexAttribPointer(2, 2, GL_FLOAT, GL_FALSE, stride, (void*)(6 * sizeof(float)));\n    glEnableVertexAttribArray(0); glEnableVertexAttribArray(1); glEnableVertexAttribArray(2);\n    return m;\n}\n\nstatic const char* kVS = R"(#version 330 core\nlayout(location = 0) in vec3 aPos;\nlayout(location = 1) in vec3 aNor;\nlayout(location = 2) in vec2 aUV;\nuniform mat4 uVP;\nout vec3 vN;\nout vec2 vUV;\nvoid main() { vN = aNor; vUV = aUV; gl_Position = uVP * vec4(aPos, 1.0); }\n)";\nstatic const char* kFS = R"(#version 330 core\nin vec3 vN;\nin vec2 vUV;\nuniform vec3 uColor;\nout vec4 outColor;\nvoid main() {\n    vec3 n = normalize(vN);\n    float d = max(dot(n, normalize(vec3(0.4, 0.8, 0.5))), 0.0);\n    float a = 0.35 + 0.15 * n.y;\n    outColor = vec4(uColor * (a + 0.75 * d), 1.0);\n}\n)";\n\nstatic GLuint compile(GLenum type, const char* src) {\n    GLuint s = glCreateShader(type); glShaderSource(s, 1, &src, nullptr); glCompileShader(s);\n    GLint ok = 0; glGetShaderiv(s, GL_COMPILE_STATUS, &ok);\n    if (!ok) { char log[1024]; glGetShaderInfoLog(s, 1024, nullptr, log); std::fprintf(stderr, "Shader: %s\\n", log); }\n    return s;\n}\n\nint main() {\n    if (!glfwInit()) return 1;\n    glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);\n    glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);\n    glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);\n#ifdef __APPLE__\n    glfwWindowHint(GLFW_OPENGL_FORWARD_COMPAT, GL_TRUE);\n#endif\n    GLFWwindow* win = glfwCreateWindow(1024, 720, "Formwerk 3D", nullptr, nullptr);\n    if (!win) return 1;\n    glfwMakeContextCurrent(win);\n    if (!gladLoadGLLoader((GLADloadproc)glfwGetProcAddress)) return 1;\n    glEnable(GL_DEPTH_TEST);\n\n    GLuint prog = glCreateProgram();\n    glAttachShader(prog, compile(GL_VERTEX_SHADER, kVS));\n    glAttachShader(prog, compile(GL_FRAGMENT_SHADER, kFS));\n    glLinkProgram(prog);\n    GLint locVP = glGetUniformLocation(prog, "uVP"), locCol = glGetUniformLocation(prog, "uColor");\n\n    std::vector<Mesh> meshes;\n' + ups + '\n\n    while (!glfwWindowShouldClose(win)) {\n        int w, h; glfwGetFramebufferSize(win, &w, &h); if (h == 0) h = 1;\n        glViewport(0, 0, w, h);\n        glClearColor(0.10f, 0.12f, 0.15f, 1.0f);\n        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);\n        float t = (float)glfwGetTime() * 0.4f;\n        glm::vec3 c(kCenter[0], kCenter[1], kCenter[2]);\n        glm::vec3 eye = c + glm::vec3(std::sin(t) * 2.6f * kRadius, 0.9f * kRadius, std::cos(t) * 2.6f * kRadius);\n        glm::mat4 proj = glm::perspective(glm::radians(45.0f), (float)w / h, 0.01f * kRadius, 100.0f * kRadius);\n        glm::mat4 vp = proj * glm::lookAt(eye, c, glm::vec3(0, 1, 0));\n        glUseProgram(prog);\n        glUniformMatrix4fv(locVP, 1, GL_FALSE, glm::value_ptr(vp));\n        for (const Mesh& m : meshes) {\n            glUniform3fv(locCol, 1, m.col);\n            glBindVertexArray(m.vao);\n            glDrawElements(GL_TRIANGLES, m.count, GL_UNSIGNED_INT, nullptr);\n        }\n        glfwSwapBuffers(win); glfwPollEvents();\n    }\n    glfwTerminate();\n    return 0;\n}\n';
};
/* Rig-Daten für Unity / Blender (Ruhepose) */
function restBones() {
  const RG = F.rig; return RG.bones.map((b, i) => { const r = RG.rest.get(b); return { n: b.name, parent: b.parent && b.parent.isBone ? RG.bones.indexOf(b.parent) : -1, p: r ? r.p : b.position.clone(), q: r ? r.q : b.quaternion.clone() }; });
}
function restWorld(bones) { // Weltposition der Gelenke in der Ruhepose
  const wp = [], wq = [];
  bones.forEach((b, i) => { if (b.parent < 0) { wp[i] = b.p.clone(); wq[i] = b.q.clone(); } else { wp[i] = b.p.clone().applyQuaternion(wq[b.parent]).add(wp[b.parent]); wq[i] = wq[b.parent].clone().multiply(b.q); } });
  return { wp, wq };
}
X.unity = function (items, o) {
  o = o || {}; const used = new Set(), RG = F.rig, skinned = !!(o.skin && RG.skeleton && items.some(it => it.skinI));
  const blocks = items.map(it => {
    const sk = skinned && it.skinI; const id = ident(it.name, used), c = conv(it, 'unity', true), big = c.ix.vc > 65535;
    const col = 'new Color(' + it.color.map(v => nf(v, 1e3) + 'f').join(', ') + ')';
    const common = '    static readonly float[] V = {\n' + rowsText(c.rows, '        ') + '\n    };\n    static readonly int[] I = {\n' + triText(c.tris, '        ') + '\n    };\n';
    const bodyMesh = '        var m = new Mesh { name = "' + it.name.replace(/"/g, '') + '" };\n        int n = V.Length / 8;\n' + (big ? '        m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;\n' : '') + '        var pos = new Vector3[n]; var nor = new Vector3[n]; var uv = new Vector2[n];\n        for (int i = 0; i < n; i++) {\n            int o = i * 8;\n            pos[i] = new Vector3(V[o], V[o + 1], V[o + 2]);\n            nor[i] = new Vector3(V[o + 3], V[o + 4], V[o + 5]);\n            uv[i] = new Vector2(V[o + 6], V[o + 7]);\n        }\n        m.vertices = pos; m.normals = nor; m.uv = uv; m.triangles = I;\n';
    const mat = '        var sh = Shader.Find("Universal Render Pipeline/Lit");\n        if (sh == null) sh = Shader.Find("Standard");\n        var mat = new Material(sh) { color = ' + col + ' };\n';
    if (!sk) {
      return '// ' + id + '.cs  –  als Komponente auf ein leeres GameObject ziehen\nusing UnityEngine;\n\n[RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]\npublic class ' + id + ' : MonoBehaviour\n{\n' + common + '\n    void Awake()\n    {\n' + bodyMesh + '        m.RecalculateBounds();\n        GetComponent<MeshFilter>().sharedMesh = m;\n        var r = GetComponent<MeshRenderer>();\n        if (r.sharedMaterial == null || r.sharedMaterial.name.StartsWith("Default"))\n        {\n' + mat.replace(/^ {8}/gm, '            ') + '            r.sharedMaterial = mat;\n        }\n    }\n}';
    }
    const B = restBones(), T = TG.unity;
    const names = B.map(b => '"' + b.n + '"').join(', '), par = B.map(b => b.parent).join(', ');
    const bp = B.map(b => { const p = T.p(b.p.x, b.p.y, b.p.z); return p.map(v => cf(nf(v))).join(', '); }).join(',\n        '), br = B.map(b => [b.q.x, -b.q.y, -b.q.z, b.q.w].map(v => cf(nf(v, 1e5))).join(', ')).join(',\n        ');
    const bi = [], bw = []; for (let i = 0; i < c.ix.vc; i++) { bi.push([0, 1, 2, 3].map(k => c.ix.SI[i * 4 + k]).join(', ')); bw.push([0, 1, 2, 3].map(k => cf(nf(c.ix.SW[i * 4 + k], 1e3))).join(', ')); }
    return '// ' + id + '.cs  –  Skinned Mesh mit Skelett (' + B.length + ' Knochen). Auf ein leeres GameObject ziehen.\nusing UnityEngine;\n\npublic class ' + id + ' : MonoBehaviour\n{\n' + common + '    static readonly string[] BoneNames = { ' + names + ' };\n    static readonly int[] BoneParent = { ' + par + ' };\n    // lokale Ruhepose der Knochen (Unity-Koordinaten)\n    static readonly float[] BonePos = {\n        ' + bp + '\n    };\n    static readonly float[] BoneRot = {\n        ' + br + '\n    };\n    // 4 Knochenindizes + 4 Gewichte pro Punkt\n    static readonly int[] BI = {\n' + bi.map(s => '        ' + s).join(',\n') + '\n    };\n    static readonly float[] BW = {\n' + bw.map(s => '        ' + s).join(',\n') + '\n    };\n\n    void Awake()\n    {\n        var bones = new Transform[BoneNames.Length];\n        for (int i = 0; i < bones.Length; i++)\n        {\n            var go = new GameObject(BoneNames[i]);\n            bones[i] = go.transform;\n            bones[i].SetParent(BoneParent[i] < 0 ? transform : bones[BoneParent[i]], false);\n            bones[i].localPosition = new Vector3(BonePos[i * 3], BonePos[i * 3 + 1], BonePos[i * 3 + 2]);\n            bones[i].localRotation = new Quaternion(BoneRot[i * 4], BoneRot[i * 4 + 1], BoneRot[i * 4 + 2], BoneRot[i * 4 + 3]);\n        }\n' + bodyMesh + '        var w = new BoneWeight[n];\n        for (int i = 0; i < n; i++)\n        {\n            w[i].boneIndex0 = BI[i * 4]; w[i].boneIndex1 = BI[i * 4 + 1]; w[i].boneIndex2 = BI[i * 4 + 2]; w[i].boneIndex3 = BI[i * 4 + 3];\n            w[i].weight0 = BW[i * 4]; w[i].weight1 = BW[i * 4 + 1]; w[i].weight2 = BW[i * 4 + 2]; w[i].weight3 = BW[i * 4 + 3];\n        }\n        m.boneWeights = w;\n        var bind = new Matrix4x4[bones.Length];\n        for (int i = 0; i < bones.Length; i++) bind[i] = bones[i].worldToLocalMatrix * transform.localToWorldMatrix;\n        m.bindposes = bind;\n        m.RecalculateBounds();\n' + mat + '        var smr = gameObject.AddComponent<SkinnedMeshRenderer>();\n        smr.sharedMesh = m; smr.bones = bones; smr.rootBone = bones[0]; smr.sharedMaterial = mat;\n    }\n}';
  });
  return '// ' + head(items, skinned ? 'mit Skelett' : '') + '\n// Konvertierung: rechtshändig → linkshändig (X gespiegelt, Dreiecksreihenfolge gedreht), 1 Einheit = 1 m\n\n' + blocks.join('\n\n// ------------------------------------------------------------\n\n') + '\n';
};
X.unreal = function (items, o) {
  o = o || {}; const used = new Set(), cls = ident(o.className || 'FormwerkModell'), data = items.map(it => ({ it, id: ident(it.name, used), c: conv(it, 'unreal', true) }));
  const hdr = '// ===== ' + cls + '.h =====\n#pragma once\n\n#include "CoreMinimal.h"\n#include "GameFramework/Actor.h"\n#include "' + cls + '.generated.h"\n\nclass UProceduralMeshComponent;\n\nUCLASS()\nclass A' + cls + ' : public AActor\n{\n    GENERATED_BODY()\npublic:\n    A' + cls + '();\n    virtual void OnConstruction(const FTransform& Transform) override;\n\nprotected:\n    UPROPERTY(VisibleAnywhere) UProceduralMeshComponent* Mesh;\n};\n';
  const arrays = data.map(d => 'namespace ' + cls + 'Data_' + d.id + ' {\n// ' + d.it.name + ' – ' + d.c.ix.vc + ' Punkte, ' + d.c.ix.tc + ' Dreiecke · Zentimeter, Z oben\n// Pro Punkt: x, y, z, nx, ny, nz, u, v\nstatic const float V[] = {\n' + rowsText(d.c.rows, '    ') + '\n};\nstatic const int32 I[] = {\n' + triText(d.c.tris, '    ') + '\n};\nstatic const FColor Color(' + d.it.color.map(v => Math.round(v * 255)).join(', ') + ', 255);\n}').join('\n\n');
  const sections = data.map((d, i) => '    {\n        using namespace ' + cls + 'Data_' + d.id + ';\n        const int32 N = UE_ARRAY_COUNT(V) / 8;\n        TArray<FVector> Verts; TArray<FVector> Normals; TArray<FVector2D> UVs; TArray<int32> Tris; TArray<FColor> Colors; TArray<FProcMeshTangent> Tangents;\n        Verts.Reserve(N); Normals.Reserve(N); UVs.Reserve(N); Colors.Reserve(N);\n        for (int32 k = 0; k < N; ++k)\n        {\n            const float* P = V + k * 8;\n            Verts.Add(FVector(P[0], P[1], P[2]));\n            Normals.Add(FVector(P[3], P[4], P[5]));\n            UVs.Add(FVector2D(P[6], P[7]));\n            Colors.Add(Color);\n        }\n        Tris.Append(I, UE_ARRAY_COUNT(I));\n        Mesh->CreateMeshSection(' + i + ', Verts, Tris, Normals, UVs, Colors, Tangents, true);   // "' + d.it.name.replace(/"/g, '') + '"\n    }').join('\n');
  const cpp = '// ===== ' + cls + '.cpp =====\n#include "' + cls + '.h"\n#include "ProceduralMeshComponent.h"\n\n' + arrays + '\n\nA' + cls + '::A' + cls + '()\n{\n    Mesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Mesh"));\n    RootComponent = Mesh;\n    Mesh->bUseAsyncCooking = true;\n}\n\nvoid A' + cls + '::OnConstruction(const FTransform& Transform)\n{\n    Super::OnConstruction(Transform);\n    Mesh->ClearAllMeshSections();\n' + sections + '\n}\n';
  return '// ' + head(items) + '\n// Unreal Engine 5: Plugin „Procedural Mesh Component“ aktivieren, in ' + 'Build.cs "ProceduralMeshComponent" zu PublicDependencyModuleNames hinzufügen.\n// Konvertierung: UE.X = −z, UE.Y = x, UE.Z = y, 100 cm je Meter, Dreiecksreihenfolge gedreht, V gespiegelt.\n// Für Skelett-Animationen stattdessen glTF/GLB exportieren und per Interchange importieren.\n\n' + hdr + '\n' + cpp;
};
X.godot = function (items) {
  const used = new Set(), calls = items.map(it => { const c = conv(it, 'godot'); return '\t_add("' + it.name.replace(/"/g, '') + '", PackedFloat32Array([\n' + rowsText(c.rows, '\t\t') + '\n\t]), PackedInt32Array([\n' + triText(c.tris, '\t\t') + '\n\t]), Color(' + it.color.map(v => nf(v, 1e3)).join(', ') + '))'; });
  return '# ' + head(items) + ' · Godot 4 (GDScript)\n# Skript an einen Node3D hängen. Gleiche Achsen wie glTF; Dreiecksreihenfolge gedreht, V gespiegelt.\nextends Node3D\n\nfunc _ready() -> void:\n' + calls.join('\n') + '\n\nfunc _add(n: String, v: PackedFloat32Array, idx: PackedInt32Array, col: Color) -> void:\n\tvar verts := PackedVector3Array()\n\tvar norms := PackedVector3Array()\n\tvar uvs := PackedVector2Array()\n\tfor i in range(v.size() / 8):\n\t\tvar o := i * 8\n\t\tverts.append(Vector3(v[o], v[o + 1], v[o + 2]))\n\t\tnorms.append(Vector3(v[o + 3], v[o + 4], v[o + 5]))\n\t\tuvs.append(Vector2(v[o + 6], v[o + 7]))\n\tvar arrays := []\n\tarrays.resize(Mesh.ARRAY_MAX)\n\tarrays[Mesh.ARRAY_VERTEX] = verts\n\tarrays[Mesh.ARRAY_NORMAL] = norms\n\tarrays[Mesh.ARRAY_TEX_UV] = uvs\n\tarrays[Mesh.ARRAY_INDEX] = idx\n\tvar m := ArrayMesh.new()\n\tm.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)\n\tvar mat := StandardMaterial3D.new()\n\tmat.albedo_color = col\n\tm.surface_set_material(0, mat)\n\tvar mi := MeshInstance3D.new()\n\tmi.name = n\n\tmi.mesh = m\n\tadd_child(mi)\n';
};
X.blender = function (items, o) {
  o = o || {}; const RG = F.rig, skinned = !!(o.skin && RG.skeleton && items.some(it => it.skinI));
  const T = TG.blender, used = new Set();
  const calls = items.map(it => {
    const c = conv(it, 'blender'), id = ident(it.name, used), sk = skinned && it.skinI;
    const verts = c.rows.map(r => '(' + r.slice(0, 3).join(', ') + ')').join(', '), uvs = c.rows.map(r => '(' + r[6] + ', ' + r[7] + ')').join(', '), faces = c.tris.map(t => '(' + t.join(', ') + ')').join(', ');
    const col = it.color.map(toLin).map(v => nf(v, 1e4)).join(', ');
    let s = 'obj = make_mesh("' + it.name.replace(/"/g, '') + '",\n    [' + verts + '],\n    [' + faces + '],\n    [' + uvs + '],\n    (' + col + ', 1.0))';
    if (sk) {
      const bi = [], bw = []; for (let i = 0; i < c.ix.vc; i++) { bi.push('(' + [0, 1, 2, 3].map(k => c.ix.SI[i * 4 + k]).join(', ') + ')'); bw.push('(' + [0, 1, 2, 3].map(k => nf(c.ix.SW[i * 4 + k], 1e3)).join(', ') + ')'); }
      const B = restBones(), W = restWorld(B), names = B.map(b => '"' + b.n + '"').join(', '), par = B.map(b => b.parent).join(', ');
      const head3 = [], tail3 = []; B.forEach((b, i) => {
        const kids = B.map((x, j) => x.parent === i ? j : -1).filter(j => j >= 0), h = W.wp[i], t = kids.length ? kids.reduce((s, j) => s.add(W.wp[j]), new THREE.Vector3()).multiplyScalar(1 / kids.length) : h.clone().add(b.parent >= 0 ? h.clone().sub(W.wp[b.parent]).normalize().multiplyScalar(0.1) : new THREE.Vector3(0, 0.1, 0));
        if (t.distanceTo(h) < 1e-3) t.y += 0.05; const ph = T.p(h.x, h.y, h.z), pt = T.p(t.x, t.y, t.z); head3.push('(' + ph.map(v => nf(v)).join(', ') + ')'); tail3.push('(' + pt.map(v => nf(v)).join(', ') + ')');
      });
      s += '\nrig(obj, [' + names + '], [' + par + '],\n    [' + head3.join(', ') + '],\n    [' + tail3.join(', ') + '],\n    [' + bi.join(', ') + '],\n    [' + bw.join(', ') + '])';
    }
    return s;
  });
  return '# ' + head(items, skinned ? 'mit Skelett' : '') + ' · Blender (Python)\n# Im Scripting-Arbeitsbereich einfügen und „Skript ausführen“. Achsen: Z oben (Y,Z getauscht).\nimport bpy\n\ndef make_mesh(name, verts, faces, uvs, color):\n    me = bpy.data.meshes.new(name)\n    me.from_pydata(verts, [], faces)\n    me.update()\n    uv = me.uv_layers.new(name="UVMap")\n    for poly in me.polygons:\n        for li in poly.loop_indices:\n            uv.data[li].uv = uvs[me.loops[li].vertex_index]\n    ob = bpy.data.objects.new(name, me)\n    bpy.context.collection.objects.link(ob)\n    mat = bpy.data.materials.new(name)\n    mat.use_nodes = True\n    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = color\n    mat.diffuse_color = color\n    me.materials.append(mat)\n    return ob\n\ndef rig(ob, names, parents, heads, tails, bone_idx, bone_w):\n    arm_data = bpy.data.armatures.new(ob.name + "_Rig")\n    arm = bpy.data.objects.new(ob.name + "_Rig", arm_data)\n    bpy.context.collection.objects.link(arm)\n    bpy.context.view_layer.objects.active = arm\n    bpy.ops.object.mode_set(mode="EDIT")\n    ebs = []\n    for i, n in enumerate(names):\n        eb = arm_data.edit_bones.new(n)\n        eb.head, eb.tail = heads[i], tails[i]\n        if parents[i] >= 0:\n            eb.parent = ebs[parents[i]]\n        ebs.append(eb)\n    bpy.ops.object.mode_set(mode="OBJECT")\n    groups = [ob.vertex_groups.new(name=n) for n in names]\n    for vi in range(len(bone_idx)):\n        for k in range(4):\n            if bone_w[vi][k] > 0:\n                groups[bone_idx[vi][k]].add([vi], bone_w[vi][k], "ADD")\n    mod = ob.modifiers.new("Armature", "ARMATURE")\n    mod.object = arm\n    ob.parent = arm\n\n' + calls.join('\n\n') + '\n';
};
X.threejs = function (items) {
  const used = new Set(), fns = items.map(it => { const c = conv(it, 'gl'), id = ident(it.name, used); const flat = (rows, a, b) => rows.map(r => r.slice(a, b).join(', ')).join(',\n    ');
    return '// ' + it.name + '\nexport function build_' + id + '(THREE) {\n  const g = new THREE.BufferGeometry();\n  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([\n    ' + flat(c.rows, 0, 3) + '\n  ]), 3));\n  g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array([\n    ' + flat(c.rows, 3, 6) + '\n  ]), 3));\n  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([\n    ' + flat(c.rows, 6, 8) + '\n  ]), 2));\n  g.setIndex([\n    ' + c.tris.map(t => t.join(', ')).join(',\n    ') + '\n  ]);\n  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: "' + hex(it.color) + '", roughness: ' + nf(it.rough, 1e3) + ', metalness: ' + nf(it.metal, 1e3) + ' }));\n}'; });
  return '// ' + head(items) + ' · three.js (Meter, Y oben)\n' + fns.join('\n\n') + '\n';
};

/* ---------- glTF / GLB ---------- */
X.gltf = function (list, binary, withAnim) {
  return new Promise((res, rej) => {
    if (!THREE.GLTFExporter) return rej(new Error('GLTFExporter nicht geladen'));
    const RG = F.rig, hidden = [], inputs = list.slice(); let bonesIn = false;
    if (RG.bones.length) { inputs.push(RG.root); bonesIn = true; }
    // Hilfsgeometrie (Knochen-Kugeln, Drahtgitter) während des Exports ausblenden
    const hide = o => { if (o.visible) { o.visible = false; hidden.push(o); } };
    list.forEach(m => m.children.forEach(c => { if (c.userData && c.userData.helper) hide(c); }));
    if (bonesIn) RG.bones.forEach(b => b.children.forEach(c => { if (c.userData && c.userData.rigHelper) hide(c); }));
    const em = list.filter(m => m.material && m.material.emissive).map(m => [m.material, m.material.emissive.clone()]); em.forEach(x => x[0].emissive.setRGB(0, 0, 0));
    const restore = () => { hidden.forEach(o => { o.visible = true; }); em.forEach(x => x[0].emissive.copy(x[1])); };
    const clip = withAnim ? RG.clip() : null;
    try {
      new THREE.GLTFExporter().parse(inputs, r => { restore(); res(r); }, err => { restore(); rej(err instanceof Error ? err : new Error(String(err))); }, { binary: !!binary, onlyVisible: true, trs: true, animations: clip ? [clip] : [], includeCustomExtensions: false });
    } catch (e) { restore(); rej(e); }
  });
};
const ab2b64 = buf => { const u = new Uint8Array(buf); let s = ''; const CH = 0x8000; for (let i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH)); return btoa(s); };

/* ---------- Format-Liste für die Oberfläche ---------- */
X.formats = [
  { id: 'unity', group: 'Spiele-Engines', label: 'Unity (C#)', ext: 'cs', hint: 'MonoBehaviour, baut das Mesh zur Laufzeit. Mit Skelett: SkinnedMeshRenderer.', text: (it, o) => X.unity(it, o), prep: { skin: true } },
  { id: 'unreal', group: 'Spiele-Engines', label: 'Unreal (C++)', ext: 'cpp', hint: 'Actor mit ProceduralMeshComponent, Zentimeter, Z oben.', text: (it, o) => X.unreal(it, o) },
  { id: 'godot', group: 'Spiele-Engines', label: 'Godot 4 (GDScript)', ext: 'gd', hint: 'Skript auf einen Node3D legen.', text: it => X.godot(it) },
  { id: 'cppgl', group: 'C++', label: 'C++ · OpenGL-Programm', ext: 'cpp', hint: 'Fertiges Fenster mit GLFW + GLAD + GLM, Modell dreht sich.', text: it => X.cppGL(it) },
  { id: 'cpp', group: 'C++', label: 'C++ · Header mit Arrays', ext: 'h', hint: 'Vertex- und Indexdaten für eigene Renderer.', text: it => X.cppArrays(it) },
  { id: 'blender', group: 'DCC-Programme', label: 'Blender (Python)', ext: 'py', hint: 'Meshes, Materialien, optional Armature und Gewichte.', text: (it, o) => X.blender(it, o), prep: { skin: true } },
  { id: 'threejs', group: 'DCC-Programme', label: 'three.js (JavaScript)', ext: 'js', hint: 'BufferGeometry-Funktionen für Webprojekte.', text: it => X.threejs(it) },
  { id: 'obj', group: 'Dateien', label: 'OBJ', ext: 'obj', hint: 'Universell, ohne Rig. Passende MTL separat kopieren.', text: it => X.obj(it) },
  { id: 'mtl', group: 'Dateien', label: 'MTL (Materialien zur OBJ)', ext: 'mtl', hint: 'Als formwerk.mtl neben die OBJ-Datei legen.', text: it => X.mtl(it) },
  { id: 'stl', group: 'Dateien', label: 'STL (3D-Druck, ASCII)', ext: 'stl', hint: 'Z oben, Einheit = 1 m → im Slicer ggf. ×1000 (mm).', text: (it, o) => X.stlText(it, o), binary: (it, o) => X.stlBinary(it, o) },
  { id: 'gltf', group: 'Dateien', label: 'glTF (JSON, eingebettet)', ext: 'gltf', hint: 'Mit Materialien, Texturen, Skelett und Animation.', async: true },
  { id: 'glb', group: 'Dateien', label: 'GLB (binär, als Base64)', ext: 'glb', hint: 'Kompakt. Base64-Text kopieren oder Datei laden.', async: true }
];
X.generate = async function (id, opt) {
  opt = opt || {}; const f = X.formats.find(x => x.id === id); if (!f) throw new Error('Unbekanntes Format');
  const list = X.items(opt.scope);
  if (!list.length) throw new Error('Keine Objekte zum Exportieren');
  if (f.async) {
    const r = await X.gltf(list, id === 'glb', opt.anim !== false);
    if (id === 'glb') return { text: ab2b64(r), blob: new Blob([r], { type: 'model/gltf-binary' }), name: 'formwerk.glb', note: 'Base64 – zum Wiederherstellen als Datei dekodieren (z. B. base64 -d)' };
    const txt = JSON.stringify(r); return { text: txt, blob: new Blob([txt], { type: 'model/gltf+json' }), name: 'formwerk.gltf' };
  }
  const items = X.prepAll(list, Object.assign({ pose: true }, f.prep || {}, opt.prep || {}));
  const o = Object.assign({}, opt, { skin: !!(opt.skin && f.prep && f.prep.skin) });
  const text = f.text(items, o), r = { text, name: 'formwerk.' + f.ext };
  r.blob = f.binary ? new Blob([f.binary(items, o)], { type: 'model/stl' }) : new Blob([text], { type: 'text/plain' });
  r.tris = items.reduce((s, it) => s + Math.floor(it.n / 3), 0); return r;
};

/* ---------- Szene als JSON (Speichern / Laden) ---------- */
const r3 = (a, d) => Array.from(a, v => fix(v, d === undefined ? 4 : d));
const TEXSLOTS = ['map', 'bumpMap', 'roughnessMap', 'metalnessMap', 'normalMap'];
X.serialize = function (opt) {
  opt = opt || {}; const RG = F.rig;
  const objs = V.objects().map(o => {
    const m = o.material, g = o.geometry, e = { n: o.name, k: o.userData.kind || 'mesh', pos: r3(o.position.toArray()), q: r3(o.quaternion.toArray(), 5), s: r3(o.scale.toArray()), vis: o.visible, m: { c: F.hex(m.color), r: fix(m.roughness, 3), mt: fix(m.metalness, 3), o: m.userData && m.userData.opacity !== undefined ? m.userData.opacity : 1 } };
    if (F.prims[e.k] && o.userData.params) e.p = o.userData.params;
    else {
      e.P = r3(g.attributes.position.array); if (g.attributes.uv) e.U = r3(g.attributes.uv.array, 3); if (g.index) e.I = Array.from(g.index.array);
      if (o.isSkinnedMesh && g.attributes.skinIndex) { e.SI = Array.from(g.attributes.skinIndex.array); e.SW = r3(g.attributes.skinWeight.array, 3); }
    }
    if (opt.tex) TEXSLOTS.forEach(s => { const t = m[s]; if (t && t.image && t.image.toDataURL) { e.t = e.t || {}; e.t[s] = t.image.toDataURL('image/png'); } });
    return e;
  });
  const out = { app: 'Formwerk3D', v: 1, objects: objs };
  if (RG.bones.length) out.rig = { bones: restBones().map(b => ({ n: b.n, p: b.parent, pos: r3(b.p.toArray()), q: r3(b.q.toArray(), 5) })), keys: RG.keys.map(k => ({ t: k.t, pose: k.pose })), dur: RG.duration, bound: !!RG.skeleton };
  return out;
};
X.deserialize = function (d, opt) {
  opt = opt || {}; const RG = F.rig;
  if (!d || d.app !== 'Formwerk3D') throw new Error('Keine Formwerk-Szene');
  if (!opt.add) { V.objects().forEach(o => V._detach(o)); RG.clearAll(); H.clear(); }
  if (d.rig && d.rig.bones.length) {
    RG.clearAll(); const made = [];
    d.rig.bones.forEach((b, i) => { const bone = new THREE.Bone(); bone.name = b.n; bone.position.fromArray(b.pos); bone.quaternion.fromArray(b.q); (b.p >= 0 ? made[b.p] : RG.root).add(bone); made.push(bone); RG.bones.push(bone); });
    RG.keys = (d.rig.keys || []).map(k => ({ t: k.t, pose: k.pose })); RG.duration = d.rig.dur || 2; RG.root.updateMatrixWorld(true); RG.saveRest(); RG.refreshViz();
  }
  let skinnedMesh = null;
  d.objects.forEach(e => {
    let geo; if (e.p && F.prims[e.k]) geo = V.build(e.k, e.p).geo;
    else {
      geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(e.P, 3)); if (e.U) geo.setAttribute('uv', new THREE.Float32BufferAttribute(e.U, 2)); if (e.I) geo.setIndex(e.I);
      if (e.SI) { geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(e.SI, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(e.SW, 4)); }
      geo.computeVertexNormals();
    }
    let mesh;
    if (e.SI && RG.bones.length && !RG.skeleton) {
      mesh = new THREE.SkinnedMesh(geo, V.makeMaterial(new THREE.Color(e.m.c))); mesh.name = V.uniqueName(e.n); mesh.userData.kind = 'skinned'; mesh.frustumCulled = false; V.world.add(mesh);
      mesh.bind(new THREE.Skeleton(RG.bones), new THREE.Matrix4()); RG.skeleton = mesh.skeleton; RG.mesh = mesh; skinnedMesh = mesh;
    } else mesh = V.addMesh(geo, { name: e.n, kind: e.k, params: e.p || null, color: new THREE.Color(e.m.c), position: e.pos, dropToGrid: false, silent: true });
    mesh.position.fromArray(e.pos); mesh.quaternion.fromArray(e.q); mesh.scale.fromArray(e.s); mesh.visible = e.vis !== false;
    mesh.material.roughness = e.m.r; mesh.material.metalness = e.m.mt; mesh.material.userData.opacity = e.m.o; V.applyDisplay(mesh);
    if (e.t) Object.keys(e.t).forEach(s => { const im = new Image(); im.onload = () => { const t = new THREE.Texture(im); if (s === 'map') t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; mesh.material[s] = t; mesh.material.needsUpdate = true; V.requestRender(); }; im.src = e.t[s]; });
  });
  if (skinnedMesh) { RG.mode = 'pose'; }
  V.refreshAll(); V.frame(); F.ui && F.ui.refreshRig && F.ui.refreshRig(); F.say('Szene geladen: ' + d.objects.length + ' Objekte' + (d.rig ? ', ' + d.rig.bones.length + ' Knochen' : ''));
};

/* ---------- Import ---------- */
function addImported(geo, name, mat) {
  if (!geo.attributes.normal) geo.computeVertexNormals(); if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  Object.keys(geo.attributes).forEach(k => { if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') geo.deleteAttribute(k); });
  geo.morphAttributes = {}; geo.morphTargetsRelative = false; // Morph-Targets (Mimik) werden nicht übernommen; sie würden auch die Hüllbox verfälschen
  geo.computeBoundingBox(); geo.computeBoundingSphere(); // nach dem Einfrieren der Pose neu rechnen, sonst stimmt „Alles zeigen“ nicht
  const o = V.addMesh(geo, { name: name || 'Import', kind: 'mesh', dropToGrid: false, position: [0, 0, 0], silent: true });
  if (mat) { if (mat.color) o.material.color.copy(mat.color); if (mat.roughness !== undefined) o.material.roughness = mat.roughness; if (mat.metalness !== undefined) o.material.metalness = mat.metalness; if (mat.map) { o.material.map = mat.map; mat.map.encoding = THREE.sRGBEncoding; o.material.needsUpdate = true; } }
  if (mat) { /* Transparenz (Wimpern, Brauen, Haarkarten) und Normalmap aus der Datei übernehmen */
    if (mat.alphaTest) o.material.alphaTest = mat.alphaTest;
    if (mat.transparent) { o.material.userData.alphaBlend = true; o.material.transparent = true; o.material.depthWrite = false; }
    if (mat.opacity !== undefined && mat.opacity < 1) o.material.userData.opacity = mat.opacity;
    if (mat.normalMap) { o.material.normalMap = mat.normalMap; if (mat.normalScale) o.material.normalScale.copy(mat.normalScale); o.material.needsUpdate = true; }
  }
  if (geo.attributes.color) { o.material.vertexColors = true; o.material.needsUpdate = true; }
  o.material.side = THREE.DoubleSide; return o;
}
function finishImport(list, label) {
  if (!list.length) throw new Error('Keine Meshes in der Datei gefunden');
  H.push('Import: ' + label, () => list.forEach(o => V._detach(o)), () => list.forEach(o => V._attach(o)));
  V.select(list[0]); list.slice(1).forEach(o => V.select(o, true)); V.refreshAll(); V.frame(list);
  const t = list.reduce((s, o) => s + F.geo.stats(o.geometry).tris, 0); F.say(label + ': ' + list.length + ' Objekt' + (list.length > 1 ? 'e' : '') + ', ' + t + ' Dreiecke'); return list;
}
/* ---- Hilfen für Material und Texturen aus Archiven ---- */
function parseMTL(text) {
  const m = {}; let cur = null;
  text.split(/\r?\n/).forEach(l => { const t = l.trim().split(/\s+/), k = (t[0] || '').toLowerCase();
    if (k === 'newmtl') cur = m[t.slice(1).join(' ')] = {};
    else if (cur) { if (k === 'kd') cur.color = new THREE.Color(+t[1], +t[2], +t[3]); else if (k === 'map_kd') cur.map = t[t.length - 1].split(/[\\/]/).pop().toLowerCase(); else if (k === 'ns') cur.ns = +t[1]; } });
  return m;
}
function applyMTL(grp, mtl, urls) {
  if (!mtl) return; const tl = new THREE.TextureLoader();
  grp.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => {
    const d = mtl[mt.name]; if (!d) return; mt.userData.fromMtl = true; if (d.color) mt.color.copy(d.color);
    if (d.map && urls && urls[d.map]) { const t = tl.load(urls[d.map]); t.wrapS = t.wrapT = THREE.RepeatWrapping; mt.map = t; } }); });
}
X.importOBJ = function (text, name, opt) {
  if (!THREE.OBJLoader) throw new Error('OBJLoader nicht geladen'); opt = opt || {}; const grp = new THREE.OBJLoader().parse(text);
  applyMTL(grp, opt.mtl, opt.urls); const parts = collectParts(grp, name || 'OBJ'); parts.forEach(p => { if (!p.mat || !p.mat.userData.fromMtl) p.mat = null; });
  return importParts(parts, name || 'OBJ', 'obj');
};
X.importSTL = function (data, name) {
  if (!THREE.STLLoader) throw new Error('STLLoader nicht geladen'); const g = new THREE.STLLoader().parse(data);
  if (F.state.stlZup !== false) g.rotateX(-Math.PI / 2); return finishImport([addImported(g, name || 'STL', null)], name || 'STL');
};
/* Teile aus einer geladenen Szene: Weltkoordinaten einbacken, Material-Arrays in einzelne Netze aufteilen */
function splitByMaterial(m) {
  const g = m.geometry, mats = Array.isArray(m.material) ? m.material : null;
  if (!mats || !g.groups || !g.groups.length) return [{ geo: g.clone(), mat: mats ? mats[0] : m.material }];
  const ni = g.index ? g.toNonIndexed() : g, out = [];
  g.groups.forEach(gr => {
    const geo = new THREE.BufferGeometry(), a = ni.attributes;
    Object.keys(a).forEach(k => { const it = a[k].itemSize; geo.setAttribute(k, new THREE.BufferAttribute(a[k].array.slice(gr.start * it, (gr.start + gr.count) * it), it, a[k].normalized)); });
    out.push({ geo, mat: mats[gr.materialIndex] });
  });
  return out;
}
function collectParts(root, name) {
  const parts = []; root.updateMatrixWorld(true);
  root.traverse(m => { if (!m.isMesh || !m.geometry || !m.geometry.attributes.position) return; splitByMaterial(m).forEach(p => { p.geo.applyMatrix4(m.matrixWorld); p.name = m.name || name; parts.push(p); }); });
  /* Teile eines Meshes („Body_1“, „Body_2“ …): Materialname statt Zähler (z. B. „Body · coat“) */
  const base = p => { const m = /^(.*)_\d+$/.exec(p.name); return m ? m[1] : p.name; }, cnt = {}; parts.forEach(p => cnt[base(p)] = (cnt[base(p)] || 0) + 1);
  parts.forEach(p => { if (cnt[base(p)] > 1 && p.mat && p.mat.name) p.name = base(p) + ' · ' + p.mat.name; });
  return parts;
}
/* Skelett aus Datei (glTF, VRM, FBX) als Knochen im Rig-Modus übernehmen; Rückgabe = Anzahl */
function importSkeleton(root, flip) {
  const RG = F.rig, bones = []; root.updateMatrixWorld(true); root.traverse(o => { if (o.isBone) bones.push(o); });
  if (bones.length < 3) return 0;
  RG.clearAll(); const map = new Map(), v = new THREE.Vector3();
  bones.forEach(b => { b.getWorldPosition(v); if (flip) { v.x = -v.x; v.z = -v.z; } let par = b.parent; while (par && !par.isBone) par = par.parent; map.set(b, RG.addBone(b.name || 'Knochen', v.clone(), par ? map.get(par) : null)); });
  RG.mode = 'edit'; RG.saveRest(); RG.select(RG.bones[0]);
  if (RG.bones.length > 40) { const bb = new THREE.Box3(); RG.bones.forEach(b => bb.expandByPoint(b.getWorldPosition(v))); RG.setSize(Math.max(0.2, Math.min(1, bb.getSize(new THREE.Vector3()).y / 1.7 * 0.35))); RG.hideOutside = true; RG.syncVis(); }
  return RG.bones.length;
}
/* Einheit: Auswahl im Import-Bereich, sonst bei FBX/3DS schätzen (kommen oft in Zentimetern) */
function unitFactor(parts, kind) {
  const u = F.state.importUnit || 'auto'; if (u !== 'auto') return parseFloat(u) || 1;
  if (kind !== 'fbx' && kind !== '3ds') return 1;
  const bb = new THREE.Box3(); parts.forEach(p => { p.geo.computeBoundingBox(); bb.union(p.geo.boundingBox); });
  const s = bb.getSize(new THREE.Vector3()), mx = Math.max(s.x, s.y, s.z);
  return mx > 3000 ? 0.001 : mx > 50 ? 0.01 : 1;
}
function importParts(parts, label, kind, post) {
  if (!parts.length) throw new Error('Keine Meshes in der Datei gefunden');
  const k = unitFactor(parts, kind); if (k !== 1) parts.forEach(p => p.geo.scale(k, k, k));
  if (post) parts.forEach(p => post(p.geo));
  const list = parts.map(p => addImported(p.geo, p.name || label, p.mat));
  const r = finishImport(list, label); if (k !== 1) F.say(F.say.last + ' · Einheit ×' + k + ' (unter „Importieren“ änderbar)'); return r;
}
X.importFBX = function (data, name) {
  if (!THREE.FBXLoader) throw new Error('FBXLoader nicht geladen (Bibliothek blockiert?)');
  let grp; try { grp = new THREE.FBXLoader().parse(data, ''); } catch (e) { throw new Error('FBX konnte nicht gelesen werden: ' + (e && e.message ? e.message.replace(/^THREE\.FBXLoader:\s*/, '') : e)); }
  const r = importParts(collectParts(grp, name || 'FBX'), name || 'FBX', 'fbx'); let nb = 0; try { nb = importSkeleton(grp, false); } catch (e) { console.warn('Skelett nicht übernommen', e); }
  if (nb) F.say(F.say.last + ' · ' + nb + ' Knochen als Skelett im Rig-Modus (nicht gebunden)'); return r;
};
X.importDAE = function (text, name) {
  if (!THREE.ColladaLoader) throw new Error('ColladaLoader nicht geladen (Bibliothek blockiert?)');
  let r; try { r = new THREE.ColladaLoader().parse(text, ''); } catch (e) { throw new Error('DAE konnte nicht gelesen werden: ' + (e && e.message ? e.message : e)); }
  if (!r || !r.scene) throw new Error('DAE enthält keine Szene'); return importParts(collectParts(r.scene, name || 'DAE'), name || 'DAE', 'dae');
};
X.import3DS = function (data, name) {
  if (!THREE.TDSLoader) throw new Error('TDSLoader nicht geladen (Bibliothek blockiert?)');
  let grp; try { grp = new THREE.TDSLoader().parse(data, ''); } catch (e) { throw new Error('3DS konnte nicht gelesen werden: ' + (e && e.message ? e.message : e)); }
  grp.rotation.x = -Math.PI / 2; return importParts(collectParts(grp, name || '3DS'), name || '3DS', '3ds'); // 3DS: Z oben
};
X.import3MF = function (data, name) {
  if (!THREE.ThreeMFLoader) throw new Error('3MF-Lader nicht geladen (Bibliothek blockiert?)');
  let grp; try { grp = new THREE.ThreeMFLoader().parse(data); } catch (e) { throw new Error('3MF konnte nicht gelesen werden: ' + (e && e.message ? e.message : e)); }
  grp.rotation.x = -Math.PI / 2; return importParts(collectParts(grp, name || '3MF'), name || '3MF', '3mf'); // 3MF: Z oben, Millimeter
};
X.importPLY = function (data, name) {
  const head = new TextDecoder().decode(new Uint8Array(data, 0, Math.min(4096, data.byteLength))), fm = /element\s+face\s+(\d+)/.exec(head);
  if (!fm || +fm[1] === 0) { const d = F.pc.fromPLY(data); return X.importCloud(d, name || 'PLY'); } // Punktwolke oder Splat
  if (!THREE.PLYLoader) throw new Error('PLYLoader nicht geladen'); const g = new THREE.PLYLoader().parse(data);
  if (F.state.plyZup === true) g.rotateX(-Math.PI / 2);
  return importParts([{ geo: g, name: name || 'PLY', mat: null }], name || 'PLY', 'ply');
};
X.importCloud = function (d, name) { return F.pc.add(d, name); };
X.addCloudMesh = function (geo, name) { const o = addImported(geo, name, null); o.material.roughness = 0.8; finishImport([o], name); return o; };
function glbParts(buf) { const dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x46546C67) return null; const jl = dv.getUint32(12, true), json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl))); let bin = null; const off = 20 + jl; if (off + 8 <= buf.byteLength) { const bl = dv.getUint32(off, true); bin = new Uint8Array(buf.slice(off + 8, off + 8 + bl)); } return { json, bin }; }
function glbPack(json, bin) {
  const js = new TextEncoder().encode(JSON.stringify(json)), jl = (js.length + 3) & ~3, bl = bin ? (bin.length + 3) & ~3 : 0, total = 12 + 8 + jl + (bin ? 8 + bl : 0), out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); dv.setUint32(12, jl, true); dv.setUint32(16, 0x4E4F534A, true); out.fill(0x20, 20, 20 + jl); out.set(js, 20);
  if (bin) { const o = 20 + jl; dv.setUint32(o, bl, true); dv.setUint32(o + 4, 0x004E4942, true); out.set(bin, o + 8); } return out.buffer;
}
function stripTextures(json) { delete json.images; delete json.textures; delete json.samplers; (json.materials || []).forEach(m => { delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture; if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; } }); return json; }
X.importGLTF = function (data, name, opt) { // ArrayBuffer (GLB/VRM) oder Text (glTF)
  opt = opt || {};
  return new Promise((res, rej) => {
    if (!THREE.GLTFLoader) return rej(new Error('GLTFLoader nicht geladen'));
    let buf = data, json = null;
    if (typeof data === 'string') { // glTF-JSON: eingebetteten Puffer entpacken und als GLB laden (keine Netzwerkzugriffe nötig)
      const j = JSON.parse(data), b0 = j.buffers && j.buffers[0]; json = j;
      if (b0 && b0.uri && /^data:/.test(b0.uri) && j.buffers.length === 1) { const bin = Uint8Array.from(atob(b0.uri.split(',')[1]), c => c.charCodeAt(0)); delete b0.uri; b0.byteLength = bin.length; buf = glbPack(stripTextures(j), bin); }
      else return rej(new Error('Nur glTF mit einem eingebetteten Puffer oder GLB werden unterstützt (bei Dateien mit getrennter .bin bitte alles als ZIP laden)'));
    } else { try { const p = glbParts(data); json = p && p.json; } catch (e) { json = null; } }
    const vrm0 = !!(json && json.extensions && json.extensions.VRM), vrm1 = !!(json && json.extensionsUsed && json.extensionsUsed.indexOf('VRMC_vrm') >= 0), isVrm = opt.vrm || vrm0 || vrm1;
    const run = (b, retry) => new THREE.GLTFLoader().parse(b, '', gl => {
      try {
        const parts = collectParts(gl.scene, name || 'glTF'); if (vrm0) parts.forEach(p => p.geo.rotateY(Math.PI)); // VRM 0.x blickt nach −Z
        const r = importParts(parts, name || (isVrm ? 'VRM' : 'glTF'), 'gltf'); let nb = 0; try { nb = importSkeleton(gl.scene, vrm0); } catch (e) { console.warn('Skelett nicht übernommen', e); }
        if (isVrm) F.say(F.say.last + ' · VRM: Haltung wie gespeichert, ' + (nb ? nb + ' Knochen als Skelett im Rig-Modus (nicht an die Meshes gebunden)' : 'kein Skelett') + ', Mimik und Spring-Bones werden nicht übernommen');
        else if (nb) F.say(F.say.last + ' · ' + nb + ' Knochen als Skelett im Rig-Modus (nicht gebunden)');
        res(r);
      } catch (e) { rej(e); }
    }, err => {
      if (!retry) { const p = glbParts(b); if (p) { try { run(glbPack(stripTextures(p.json), p.bin), true); return; } catch (e) { /* weiter */ } } }
      rej(new Error('glTF konnte nicht gelesen werden' + (err && err.message ? ': ' + err.message : '')));
    });
    run(buf, false);
  });
};

/* ---- ZIP: Modelle samt Materialien und Texturen, oder Fotos für den Fotomodus ---- */
const MODEL_PRIO = ['glb', 'vrm', 'gltf', 'fbx', 'obj', 'dae', '3mf', '3ds', 'ply', 'stl', 'splat', 'las', 'pcd', 'xyz', 'pts'];
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', bmp: 'image/bmp', gif: 'image/gif' };
X.importZip = async function (buf, name) {
  if (!window.fflate) throw new Error('ZIP-Unterstützung (fflate) nicht geladen'); let files;
  try { files = fflate.unzipSync(new Uint8Array(buf)); } catch (e) { throw new Error('ZIP konnte nicht entpackt werden (beschädigt, verschlüsselt oder nicht unterstützt)'); }
  const keys = Object.keys(files).filter(k => !/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/.test(k) && !/\/$/.test(k) && files[k].length), ext = k => (k.split('.').pop() || '').toLowerCase(), base = k => k.split('/').pop().toLowerCase();
  const imgs = keys.filter(k => MIME[ext(k)]), urls = {}; imgs.forEach(k => { urls[base(k)] = URL.createObjectURL(new Blob([files[k]], { type: MIME[ext(k)] })); });
  const models = keys.filter(k => MODEL_PRIO.indexOf(ext(k)) >= 0);
  if (!models.length) {
    if (imgs.length >= 3 && F.photo) { const fl = imgs.map(k => new File([files[k]], k.split('/').pop(), { type: MIME[ext(k)] })); await F.photo.addFiles(fl); return 'fotos'; }
    throw new Error('Im ZIP wurde kein Modell gefunden (erwartet: GLB, glTF, OBJ, FBX, DAE, PLY, STL, 3DS, 3MF, VRM, Splat, LAS, PCD oder mindestens 3 Fotos)');
  }
  models.sort((a, b) => MODEL_PRIO.indexOf(ext(a)) - MODEL_PRIO.indexOf(ext(b)) || files[b].length - files[a].length);
  const top = ext(models[0]), pick = models.filter(k => ext(k) === top).slice(0, 24), bufOf = k => files[k].buffer.slice(files[k].byteOffset, files[k].byteOffset + files[k].byteLength), txtOf = k => new TextDecoder().decode(files[k]), nm = k => k.split('/').pop().replace(/\.[^.]+$/, '') || name;
  for (const k of pick) {
    if (top === 'obj') { const text = txtOf(k), ml = /^\s*mtllib\s+(.+)$/m.exec(text), mk = (ml && keys.find(x => base(x) === ml[1].trim().split(/[\\/]/).pop().toLowerCase())) || keys.find(x => ext(x) === 'mtl' && base(x).replace(/\.mtl$/, '') === base(k).replace(/\.obj$/, '')) || keys.find(x => ext(x) === 'mtl'); X.importOBJ(text, nm(k), { mtl: mk ? parseMTL(txtOf(mk)) : null, urls }); }
    else if (top === 'gltf') { const j = JSON.parse(txtOf(k)), find = u => keys.find(x => base(x) === decodeURIComponent(String(u)).split(/[\\/]/).pop().toLowerCase()); let bin = null;
      if (j.buffers && j.buffers.length === 1 && j.buffers[0].uri && !/^data:/.test(j.buffers[0].uri)) { const bk = find(j.buffers[0].uri); if (!bk) throw new Error('glTF: Datei ' + j.buffers[0].uri + ' fehlt im ZIP'); bin = files[bk]; delete j.buffers[0].uri; j.buffers[0].byteLength = bin.length; } else if (j.buffers && j.buffers[0] && /^data:/.test(j.buffers[0].uri || '')) { bin = Uint8Array.from(atob(j.buffers[0].uri.split(',')[1]), c => c.charCodeAt(0)); delete j.buffers[0].uri; }
      (j.images || []).forEach(im => { if (im.uri && !/^data:/.test(im.uri)) { const u = urls[decodeURIComponent(im.uri).split(/[\\/]/).pop().toLowerCase()]; if (u) im.uri = u; else delete im.uri; } });
      await X.importGLTF(glbPack(j, bin), nm(k)); }
    else if (top === 'glb' || top === 'vrm') await X.importGLTF(bufOf(k), nm(k), { vrm: top === 'vrm' });
    else if (top === 'fbx') X.importFBX(bufOf(k), nm(k)); else if (top === 'dae') X.importDAE(txtOf(k), nm(k)); else if (top === '3ds') X.import3DS(bufOf(k), nm(k)); else if (top === '3mf') X.import3MF(bufOf(k), nm(k));
    else if (top === 'ply') X.importPLY(bufOf(k), nm(k)); else if (top === 'stl') X.importSTL(bufOf(k), nm(k)); else if (top === 'splat') F.pc.add(F.pc.fromSplat(bufOf(k)), nm(k));
    else if (top === 'las') F.pc.add(F.pc.fromLAS(bufOf(k)), nm(k)); else if (top === 'pcd') F.pc.add(F.pc.fromPCD(bufOf(k)), nm(k)); else F.pc.add(F.pc.fromText(txtOf(k)), nm(k));
  }
  return top;
};

X.importText = async function (text, name, ext) {
  const t = text.trim();
  if (t[0] === '{' || t[0] === '[') {
    let j = null; try { j = JSON.parse(t); } catch (e) { /* evtl. mit Rahmentext */ }
    if (j && j.app === 'Formwerk3D') { X.deserialize(j); return 'szene'; }
    if (j && j.asset && j.asset.version) { await X.importGLTF(t, name || 'glTF'); return 'gltf'; }
    F.map.parse(t); F.map.build({}); return 'karte';
  }
  if (/<COLLADA[\s>]/.test(t.slice(0, 2000))) { X.importDAE(t, name); return 'dae'; }
  if (/^\s*(solid|facet)\b/.test(t) && /facet\s+normal/.test(t)) { X.importSTL(t, name); return 'stl'; }
  if (/^(# ?PCD|VERSION)/m.test(t.slice(0, 300)) && /FIELDS/.test(t.slice(0, 600))) { F.pc.add(F.pc.fromPCD(new TextEncoder().encode(t).buffer), name || 'PCD'); return 'pcd'; }
  if (/^\s*(#|mtllib|o |g |v |vt |vn |f )/m.test(t) && /^\s*f\s+/m.test(t)) { X.importOBJ(t, name); return 'obj'; }
  if (/^(xyz|pts|csv|txt|asc)$/.test(ext || '') || /^[\s\d.+\-eE,;]+$/.test(t.slice(0, 200))) { try { F.pc.add(F.pc.fromText(t), name || 'Punkte'); return 'punkte'; } catch (e) { if (/^(xyz|pts|csv|asc)$/.test(ext || '')) throw e; } }
  if (/^\s*(#|v |vt |vn )/m.test(t) && /^\s*v\s+/m.test(t)) { F.pc.add(F.pc.fromText(t.split(/\r?\n/).filter(l => /^v\s/.test(l)).map(l => l.slice(2)).join('\n')), name || 'Punkte'); return 'punkte'; }
  const ds = t.indexOf('{'); if (ds > 0) { F.map.parse(t); F.map.build({}); return 'karte'; }
  throw new Error('Format nicht erkannt (unterstützt: GLB, glTF, VRM, FBX, OBJ, DAE, STL, PLY, 3DS, 3MF, ZIP, Splat, LAS, PCD, XYZ/PTS, Formwerk-Szene, GeoJSON, Overpass-JSON)');
};
X.importBuffer = async function (buf, nm, ext) {
  switch (ext) {
    case 'stl': X.importSTL(buf, nm); break; case 'fbx': X.importFBX(buf, nm); break; case 'ply': X.importPLY(buf, nm); break; case '3ds': X.import3DS(buf, nm); break; case '3mf': X.import3MF(buf, nm); break;
    case 'splat': F.pc.add(F.pc.fromSplat(buf), nm); break; case 'las': F.pc.add(F.pc.fromLAS(buf), nm); break; case 'pcd': F.pc.add(F.pc.fromPCD(buf), nm); break; case 'zip': await X.importZip(buf, nm); break;
    default: await X.importGLTF(buf, nm, { vrm: ext === 'vrm' });
  }
};
const IMG_RE = /^(png|jpe?g|webp|bmp)$/i, extOf = f => (f.name.split('.').pop() || '').toLowerCase();
X.importFiles = async function (files) {
  const list = Array.from(files || []); let ok = 0;
  const imgs = list.filter(f => IMG_RE.test(extOf(f)));
  if (imgs.length >= 2 && imgs.length === list.length && F.photo) { await F.photo.addFiles(imgs); return imgs.length; } // mehrere Fotos → Fotomodus
  for (const f of list) { try { await X.importFile(f); ok++; } catch (e) { F.say((f.name ? f.name + ': ' : '') + (e && e.message ? e.message : e), 'err'); console.error(e); } }
  if (ok && list.length > 1) F.say(ok + ' von ' + list.length + ' Dateien importiert'); return ok;
};
const REJECT = { usdz: 'USDZ kann ich nicht lesen. Bitte als GLB, FBX, OBJ oder PLY exportieren.', '7z': '7z-Archive kann ich nicht entpacken – bitte als ZIP packen.', rar: 'RAR-Archive kann ich nicht entpacken – bitte als ZIP packen.', laz: 'Komprimierte LAZ-Dateien werden nicht unterstützt – bitte in LAS umwandeln (z. B. mit CloudCompare).', e57: 'E57 wird nicht unterstützt – bitte als LAS, PLY oder XYZ exportieren.', ksplat: '.ksplat wird nicht unterstützt – bitte als .splat oder PLY exportieren.', spz: '.spz wird nicht unterstützt – bitte als .splat oder PLY exportieren.', blend: 'Blender-Dateien bitte aus Blender als GLB oder FBX exportieren.', max: '3ds-Max-Dateien bitte als FBX oder GLB exportieren.', c4d: 'Cinema-4D-Dateien bitte als FBX oder GLB exportieren.', skp: 'SketchUp-Dateien bitte als DAE, OBJ oder GLB exportieren.', dwg: 'DWG bitte als DXF/OBJ/STL aus dem CAD-Programm exportieren.' };
const BIN_EXT = /^(glb|vrm|stl|fbx|ply|3ds|3mf|splat|las|pcd|zip)$/;
X.importFile = function (file) {
  return new Promise((res, rej) => {
    const ext = extOf(file), nm = file.name.replace(/\.[^.]+$/, ''), fr = new FileReader(); fr.onerror = () => rej(new Error('Datei nicht lesbar'));
    if (IMG_RE.test(ext) || /^(gif)$/.test(ext)) return rej(new Error('Ein einzelnes Bild lässt sich hier nicht laden. Mehrere Fotos zusammen hineinziehen öffnet den Fotomodus; Höhenkarten gehören unter „Karte“, Texturen ins Textur-Studio.'));
    if (REJECT[ext]) return rej(new Error(REJECT[ext]));
    if (BIN_EXT.test(ext)) { fr.onload = () => X.importBuffer(fr.result, nm, ext).then(() => res(ext), rej); fr.readAsArrayBuffer(file); return; }
    fr.onload = () => X.importText(String(fr.result), nm, ext).then(res, rej); fr.readAsText(file);
  });
};
