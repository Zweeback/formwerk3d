"""Direkter, ABI-sicherer Aufruf von meshopt_simplifyWithAttributes (der Python-Wrapper ruft float falsch auf und stürzt ab)."""
import ctypes as C, numpy as np, meshoptimizer as _mo
_lib = _mo.simplifier.lib
_P = C.POINTER
_f = _lib.meshopt_simplifyWithAttributes
_f.restype = C.c_size_t
_f.argtypes = [_P(C.c_uint), _P(C.c_uint), C.c_size_t, _P(C.c_float), C.c_size_t, C.c_size_t, _P(C.c_float), C.c_size_t, _P(C.c_float), C.c_size_t, _P(C.c_ubyte), C.c_size_t, C.c_float, C.c_uint, _P(C.c_float)]
ERROR_ABSOLUTE = 4  # meshopt_SimplifyErrorAbsolute
SPARSE = 2          # meshopt_SimplifySparse
LOCK_BORDER = 1
PRUNE = 8           # meshopt_SimplifyPrune: kleine abgetrennte Teile (Nadeln, Schwebeteile) entfernen
def simplify(idx, P, T, w, target_index_count, target_error, options=ERROR_ABSOLUTE | SPARSE | PRUNE):
    idx = np.ascontiguousarray(idx, np.uint32); P = np.ascontiguousarray(P, np.float32); T = np.ascontiguousarray(T, np.float32); w = np.ascontiguousarray(w, np.float32)
    dst = np.zeros_like(idx); err = C.c_float(0)
    k = _f(dst.ctypes.data_as(_P(C.c_uint)), idx.ctypes.data_as(_P(C.c_uint)), len(idx), P.ctypes.data_as(_P(C.c_float)), len(P), P.strides[0],
           T.ctypes.data_as(_P(C.c_float)), T.strides[0], w.ctypes.data_as(_P(C.c_float)), len(w), None, int(target_index_count), float(target_error), int(options), C.byref(err))
    return dst[:k].copy(), err.value
