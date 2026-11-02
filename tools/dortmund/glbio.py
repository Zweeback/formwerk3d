"""Minimaler GLB-Leser/-Schreiber (nur POSITION + Indizes, optional COLOR_0/NORMAL) mit numpy."""
import struct, json, numpy as np
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def read_glb(path):
    d = open(path, 'rb').read(); assert d[:4] == b'glTF'
    cl = struct.unpack('<I', d[12:16])[0]; j = json.loads(d[20:20 + cl]); bo = 20 + cl + 8; bl = struct.unpack('<I', d[20 + cl:24 + cl])[0]
    binb = d[bo:bo + bl]
    def acc(i):
        a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]; n = a['count']; nc = NC[a['type']]; dt = CT[a['componentType']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride')
        if stride and stride != nc * np.dtype(dt).itemsize:
            raw = np.frombuffer(binb, np.uint8, count=n * stride, offset=off).reshape(n, stride)
            return np.frombuffer(raw[:, :nc * np.dtype(dt).itemsize].tobytes(), dt).reshape(n, nc)
        return np.frombuffer(binb, dt, count=n * nc, offset=off).reshape(n, nc)
    P = []; I = []; base = 0
    for me in j['meshes']:
        for pr in me['primitives']:
            p = acc(pr['attributes']['POSITION']).astype(np.float32)
            idx = acc(pr['indices']).astype(np.uint32).reshape(-1) if 'indices' in pr else np.arange(len(p), dtype=np.uint32)
            P.append(p); I.append(idx + base); base += len(p)
    return np.concatenate(P), np.concatenate(I).reshape(-1, 3)
def write_glb(path, pos, tri, colors=None, name='mesh'):
    """pos float32 (n,3), tri uint32 (m,3), colors optional float32 (n,3) 0..1 (linear)."""
    pos = np.ascontiguousarray(pos, np.float32); tri = np.ascontiguousarray(tri, np.uint32)
    parts = []; views = []; accs = []; off = 0
    def add(arr, target, typ, ctype, count, extra=None):
        nonlocal off
        b = arr.tobytes(); pad = (-len(b)) % 4; parts.append(b + b'\0' * pad)
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(b), 'target': target}); a = {'bufferView': len(views) - 1, 'componentType': ctype, 'count': count, 'type': typ}
        if extra: a.update(extra)
        accs.append(a); off += len(b) + pad; return len(accs) - 1
    ip = add(tri.reshape(-1), 34963, 'SCALAR', 5125, tri.size)
    pp = add(pos, 34962, 'VEC3', 5126, len(pos), {'min': pos.min(0).tolist(), 'max': pos.max(0).tolist()})
    attrs = {'POSITION': pp}
    if colors is not None:
        c = np.ascontiguousarray(np.clip(colors, 0, 1), np.float32); attrs['COLOR_0'] = add(c, 34962, 'VEC3', 5126, len(c))
    j = {'asset': {'version': '2.0', 'generator': 'Formwerk dortmund_build'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0, 'name': name}],
         'meshes': [{'name': name, 'primitives': [{'attributes': attrs, 'indices': ip, 'material': 0}]}], 'materials': [{'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 0.9}, 'doubleSided': True}],
         'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': off}]}
    jb = json.dumps(j, separators=(',', ':')).encode(); jb += b' ' * ((-len(jb)) % 4); binb = b''.join(parts)
    out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(jb) + 8 + len(binb)) + struct.pack('<I4s', len(jb), b'JSON') + jb + struct.pack('<I4s', len(binb), b'BIN\0') + binb
    open(path, 'wb').write(out); return len(out)
