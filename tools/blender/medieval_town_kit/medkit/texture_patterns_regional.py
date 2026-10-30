"""Regional surfaces the first kit had no equivalent for (asset bible regions/*.md):

- granite: Stonehold mined granite, big chisel-and-wedge courses with soot in the joints.
  Basalt is the same texture darkened by its material tint (materials.py).
- sod: Frostgard turf roof, a rooted grass mat with dull dry tufts and bare earth.
- earth: packed lane earth for frontier towns, worn smooth with gravel and a few ruts.
- rock: natural weathered rock for crags and bare slopes: bedding strata, cracks, lichen,
  no mortar joints (a crag must never read as masonry).
- snow / snow_path: Frostgard's winter: soft drifted snow with a cold blue cast, and lanes
  trodden into grey ruts with earth showing through.
"""
import numpy as np

from .texture_patterns import courses, fbm, lerp, rounded_edge, smooth, tint
from .texture_patterns_weathered import _warp, _weather


GRANITE_PALETTE = np.array([[0.46, 0.46, 0.46], [0.50, 0.48, 0.45], [0.42, 0.43, 0.44],
                            [0.53, 0.51, 0.47], [0.44, 0.42, 0.40]], np.float32)


def granite(n, seed):
    """Pitch-faced granite courses: each block domed from its arris, its own grey or buff,
    shallow joints with soft soot, feldspar speckle. Joints stay quiet so a wall reads as
    stone mass, never as a grid of tiles."""
    rng = np.random.default_rng(seed)
    block, dx, dy, _, count = courses(n, rng, 4, 0.22 * n, 0.55 * n, row_jitter=0.22)
    block, dx, dy = _warp(n, seed + 9, 0.012, block, dx, dy)
    fine, chisel, big = fbm(n, seed + 1, 0.6), fbm(n, seed + 2, 1.4), fbm(n, seed + 3, 2.6)
    speck = smooth(0.70, 0.78, fbm(n, seed + 4, 0.25))
    edge = rounded_edge(dx, dy, n * 0.02)
    joint = n * 0.003
    face = smooth(joint, joint + n * 0.01, edge)
    dome = np.sqrt(np.clip(edge - joint, 0, None) / (n * 0.06)).clip(0, 1)
    height = face * (0.45 + 0.4 * dome + 0.25 * chisel) + 0.05 * fine - 0.04 * speck
    pick = rng.integers(0, len(GRANITE_PALETTE), count)
    tones = rng.uniform(0.9, 1.1, count)
    col = (GRANITE_PALETTE[pick] * tones[:, None])[block]
    col = tint(col, (0.86 + 0.16 * fine) * (0.8 + 0.2 * chisel) * (0.82 + 0.18 * dome))
    col = lerp(col, (0.64, 0.62, 0.58), speck * 0.35)
    col = lerp(col, (0.40, 0.41, 0.34), smooth(0.66, 0.86, big) * (1 - dome) * 0.35)
    albedo = lerp(tint((0.26, 0.25, 0.24), 0.9 + 0.2 * fine), col, face)
    albedo = tint(albedo, 1 - smooth(n * 0.03, 0.0, edge) * 0.25)
    return _weather(albedo, n, seed, 0.16), height, 2.6


def sod(n, seed):
    """Turf mat seen from above: blade streaks down the slope (v), clumps, dry tufts, earth."""
    clump = fbm(n, seed, 2.3)
    blades = fbm(n, seed + 1, 0.9, sx=1.0, sy=9.0)
    tufts = smooth(0.62, 0.8, fbm(n, seed + 2, 1.5))
    earth = smooth(0.70, 0.84, fbm(n, seed + 3, 2.0)) * (1 - tufts)
    blades, clump = _warp(n, seed + 4, 0.02, blades, clump)
    green = lerp((0.18, 0.22, 0.10), (0.33, 0.36, 0.16), blades)
    albedo = tint(green, 0.7 + 0.45 * clump)
    albedo = lerp(albedo, (0.44, 0.42, 0.27), tufts * 0.3)
    albedo = lerp(albedo, (0.22, 0.19, 0.13), earth * 0.35)
    height = 0.55 * clump + 0.30 * blades + 0.25 * tufts - 0.4 * earth
    return albedo.astype(np.float32), height.astype(np.float32), 2.6


def earth(n, seed):
    """Trodden earth: soft tonal patches, scattered gravel, faint wheel ruts along v."""
    big, mid, fine = fbm(n, seed, 2.6), fbm(n, seed + 1, 1.8), fbm(n, seed + 2, 0.8)
    gravel = smooth(0.74, 0.80, fbm(n, seed + 3, 0.3))
    ruts = smooth(0.55, 0.85, fbm(n, seed + 4, 1.6, sx=1.0, sy=12.0))
    albedo = lerp((0.34, 0.27, 0.20), (0.46, 0.38, 0.28), smooth(0.3, 0.7, big))
    albedo = tint(albedo, (0.9 + 0.16 * mid) * (1 - 0.12 * ruts))
    albedo = lerp(albedo, (0.56, 0.52, 0.46), gravel * 0.7)
    height = 0.45 * mid + 0.2 * fine + 0.35 * gravel - 0.3 * ruts
    return albedo.astype(np.float32), height.astype(np.float32), 1.6


def rock(n, seed):
    big, mid, fine = fbm(n, seed, 2.6), fbm(n, seed + 1, 1.7), fbm(n, seed + 2, 0.7)
    strata = fbm(n, seed + 3, 1.6, sx=1.0, sy=7.0)
    beds = 0.5 + 0.5 * np.sin((strata * 5.0 + mid * 1.2) * np.pi * 2)
    cracks = smooth(0.90, 0.96, fbm(n, seed + 4, 0.9, sx=1.0, sy=5.0))
    lichen = smooth(0.66, 0.82, fbm(n, seed + 5, 1.2)) * smooth(0.4, 0.7, big)
    albedo = lerp((0.42, 0.42, 0.41), (0.58, 0.56, 0.52), smooth(0.25, 0.75, big))
    albedo = tint(albedo, (0.86 + 0.18 * fine) * (0.92 + 0.08 * beds) * (1 - 0.45 * cracks))
    albedo = lerp(albedo, (0.52, 0.53, 0.40), lichen * 0.35)
    height = 0.45 * mid + 0.25 * beds + 0.15 * fine - 0.5 * cracks
    return _weather(albedo, n, seed, 0.14), height.astype(np.float32), 2.4


def snow(n, seed):
    big, mid, fine = fbm(n, seed, 2.6), fbm(n, seed + 1, 1.6), fbm(n, seed + 2, 0.5)
    sparkle = smooth(0.86, 0.9, fbm(n, seed + 3, 0.15))
    albedo = lerp((0.84, 0.87, 0.93), (0.93, 0.95, 0.98), smooth(0.3, 0.7, big))
    albedo = tint(albedo, 0.95 + 0.06 * mid)
    albedo = lerp(albedo, (1.0, 1.0, 1.0), sparkle * 0.3)
    height = 0.6 * big + 0.3 * mid + 0.1 * fine
    return albedo.astype(np.float32), height.astype(np.float32), 1.0


def snow_path(n, seed):
    albedo, height, _ = snow(n, seed)
    ruts = smooth(0.5, 0.85, fbm(n, seed + 7, 1.4, sx=1.0, sy=10.0))
    bare = smooth(0.7, 0.86, fbm(n, seed + 8, 2.0))
    albedo = lerp(albedo, (0.58, 0.60, 0.64), ruts * 0.55)
    albedo = lerp(albedo, (0.36, 0.31, 0.26), bare * 0.6)
    return albedo.astype(np.float32), (height - 0.4 * ruts - 0.3 * bare).astype(np.float32), 1.4


def basalt(n, seed):
    """Stonehold cliff basalt: charcoal columns split by deep vertical joints (sy = along v,
    which runs up a cliff face), a few horizontal shears and pale weathered column faces."""
    big, fine = fbm(n, seed, 2.4), fbm(n, seed + 1, 0.8)
    # Axis 1 is u (across the face): 7 columns, edges wobbled by tall low-frequency noise.
    u = np.tile(np.arange(n, dtype=np.float32) / n, (n, 1))
    cell = (u + (fbm(n, seed + 2, 2.6, sy=6.0) - 0.5) * 0.09) * 7.0
    frac = cell - np.floor(cell)
    edge = np.minimum(frac, 1.0 - frac)
    joints = smooth(0.045, 0.0, edge) * (0.55 + 0.45 * smooth(0.3, 0.7, fbm(n, seed + 5, 2.0, sy=4.0)))
    col_tone = np.asarray(np.random.default_rng(seed).uniform(0.82, 1.14, 7), np.float32)[
        np.floor(cell).astype(int) % 7]
    shear = smooth(0.025, 0.0, np.abs(fbm(n, seed + 4, 1.6, sx=7.0, sy=1.0) - 0.5)) * smooth(0.55, 0.75, big)
    face = smooth(0.0, 0.3, edge)
    albedo = lerp((0.15, 0.16, 0.20), (0.33, 0.34, 0.39), smooth(0.2, 0.9, 0.4 * face + 0.6 * big))
    albedo = tint(albedo, col_tone * (0.88 + 0.22 * fine) * (1 - 0.55 * joints) * (1 - 0.5 * shear))
    height = 0.6 * face + 0.15 * big + 0.12 * fine - 0.8 * joints - 0.35 * shear
    return _weather(albedo, n, seed, 0.16), height.astype(np.float32), 3.0


def flagstone(n, seed):
    """Stonehold terrace paving: big flat irregular slabs (Voronoi, no dome) with thin dark
    joints, pale warm-grey tones and worn edges."""
    rng = np.random.default_rng(seed)
    k = 7
    gy, gx = np.mgrid[0:k, 0:k]
    px = ((gx + 0.5 + rng.uniform(-0.4, 0.4, (k, k))) / k).ravel()
    py = ((gy + 0.5 + rng.uniform(-0.4, 0.4, (k, k))) / k).ravel()
    v, u = (np.mgrid[0:n, 0:n].astype(np.float32) + 0.5) / n
    f1 = np.full((n, n), 9.0, np.float32)
    f2 = np.full((n, n), 9.0, np.float32)
    idx = np.zeros((n, n), np.int32)
    for i in range(k * k):
        ddx, ddy = np.abs(u - px[i]), np.abs(v - py[i])
        d = np.sqrt(np.minimum(ddx, 1 - ddx) ** 2 + np.minimum(ddy, 1 - ddy) ** 2)
        closer = d < f1
        f2 = np.where(closer, f1, np.minimum(f2, d))
        idx = np.where(closer, i, idx)
        f1 = np.where(closer, d, f1)
    fine, mid = fbm(n, seed + 1, 1.0), fbm(n, seed + 2, 2.0)
    gap = (f2 - f1) * k
    face = smooth(0.012, 0.05, gap)
    tones = rng.uniform(0.82, 1.12, k * k)[idx]
    col = lerp((0.50, 0.49, 0.47), (0.62, 0.58, 0.52), rng.uniform(0, 1, k * k)[idx])
    col = tint(col, tones * (0.82 + 0.28 * fine) * (0.9 + 0.1 * mid) * (0.86 + 0.14 * smooth(0.05, 0.3, gap)))
    albedo = lerp(tint((0.30, 0.29, 0.27), 0.8 + 0.4 * fine), col, face)
    height = face * (0.85 + 0.15 * smooth(0.05, 0.3, gap)) + 0.08 * fine
    return albedo.astype(np.float32), height.astype(np.float32), 2.0


REGIONAL_PATTERNS = {'granite': (granite, 1024), 'sod': (sod, 512), 'earth': (earth, 1024),
                     'rock': (rock, 1024), 'snow': (snow, 512), 'snow_path': (snow_path, 1024),
                     'basalt': (basalt, 1024), 'flagstone': (flagstone, 1024),
                     # Crag rock's own key so its scan (scans.py) never retiles the field-scale rock_land.
                     'crag': (rock, 1024)}
