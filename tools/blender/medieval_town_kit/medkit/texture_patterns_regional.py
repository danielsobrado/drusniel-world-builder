"""Regional surfaces the first kit had no equivalent for (asset bible regions/*.md):

- granite: Stonehold mined granite, big chisel-and-wedge courses with soot in the joints.
  Basalt is the same texture darkened by its material tint (materials.py).
- sod: Frostgard turf roof, a rooted grass mat with dull dry tufts and bare earth.
- earth: packed lane earth for frontier towns, worn smooth with gravel and a few ruts.
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


REGIONAL_PATTERNS = {'granite': (granite, 1024), 'sod': (sod, 512), 'earth': (earth, 1024)}
