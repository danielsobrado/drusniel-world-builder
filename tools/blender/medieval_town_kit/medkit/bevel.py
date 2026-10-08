"""Chamfered box topology and baked vertex shading for kit geometry.

A chamfered box catches a highlight along every edge, which is what makes a
beam or a dressed stone read as solid timber or masonry at game distances.
Shading is baked into vertex colours: undersides darker, grime rising from the
foot of walls, and a per-piece tone so no two beams or stones match.
"""
import hashlib
import math

from mathutils import Vector

AXES = ((1, 0, 0), (0, 1, 0), (0, 0, 1))
# Default chamfer per material; boxes with skipped faces stay square.
DEFAULT_BEVEL = {'timber': 0.022, 'stone': 0.03}
TONED = {'timber': (0.8, 1.08), 'stone': (0.84, 1.08), 'planks': (0.86, 1.06),
         'clapboard': (0.86, 1.05), 'bark': (0.85, 1.05)}
GRIMED = {'stone', 'plaster', 'clapboard', 'timber', 'planks'}


def chamfer_faces(lo, hi, b):
    """Yield (face_key | None, points, outward) for a box chamfered by b."""
    inner = [(lo[i] + b, hi[i] - b) for i in range(3)]
    outer = [(lo[i], hi[i]) for i in range(3)]

    def vert(signs, k):
        return tuple(outer[i][signs[i]] if i == k else inner[i][signs[i]] for i in range(3))

    corners = [(sx, sy, sz) for sx in (0, 1) for sy in (0, 1) for sz in (0, 1)]
    for k in range(3):
        for s in (0, 1):
            cs = [c for c in corners if c[k] == s]
            a, bb = [i for i in range(3) if i != k]
            ring = sorted(cs, key=lambda c: math.atan2(c[bb] - 0.5, c[a] - 0.5))
            out = [0, 0, 0]
            out[k] = 1 if s else -1
            yield f"{'+' if s else '-'}{'xyz'[k]}", [vert(c, k) for c in ring], tuple(out)
    for axis in range(3):
        i, j = [x for x in range(3) if x != axis]
        for si in (0, 1):
            for sj in (0, 1):
                c0 = [0, 0, 0]
                c0[i], c0[j] = si, sj
                c1 = list(c0)
                c1[axis] = 1
                out = [0, 0, 0]
                out[i], out[j] = (1 if si else -1), (1 if sj else -1)
                pts = [vert(c0, i), vert(c0, j), vert(c1, j), vert(c1, i)]
                yield None, pts, tuple(out)
    for c in corners:
        out = tuple(1 if s else -1 for s in c)
        yield None, [vert(c, 0), vert(c, 1), vert(c, 2)], out


def piece_tone(mat, lo, hi):
    span = TONED.get(mat)
    if not span:
        return 1.0
    key = f'{mat}:{[round(v, 3) for v in lo]}:{[round(v, 3) for v in hi]}'.encode()
    unit = int(hashlib.md5(key).hexdigest()[:8], 16) / 0xFFFFFFFF
    return span[0] + (span[1] - span[0]) * unit


def _smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def vertex_shade(p, n, mat):
    """Ambient occlusion and grime for one vertex of a face with normal n (module space)."""
    shade = 1.0
    if n.z < -0.5:
        shade *= 0.72
    elif abs(n.z) < 0.5 and mat in GRIMED:
        shade *= 0.84 + 0.16 * _smooth(0.0, 0.9, p.z)
    return shade


def unit(v):
    v = Vector(v)
    return v.normalized() if v.length > 0 else v
