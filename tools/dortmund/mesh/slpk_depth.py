#!/usr/bin/env python3
"""Tiefe jedes Knotens im Knotenbaum: python3 -I slpk_depth.py nodes.pkl depth.pkl"""
import sys, pickle
N = pickle.load(open(sys.argv[1], 'rb')); D = {}
def depth(i):
    path = []
    while i is not None and i not in D and i in N: path.append(i); i = N[i]['parent']
    d = D[i] if i in D else -1
    for j in reversed(path): d += 1; D[j] = d
for i in N: depth(i)
pickle.dump(D, open(sys.argv[2], 'wb')); print('Knoten', len(D), 'max Tiefe', max(D.values()))
