"""Regional surfaces the first kit had no equivalent for (asset bible regions/*.md):

- granite: Stonehold mined granite, big chisel-and-wedge courses with soot in the joints.
  Basalt is the same texture darkened by its material tint (materials.py).
- sod: Frostgard turf roof, a rooted grass mat with dull dry tufts and bare earth.
"""
import numpy as np

from .texture_patterns import courses, fbm, lerp, rounded_edge, smooth, tint
from .texture_patterns_weathered import _warp, _weather


def granite(n, seed):
    """Massive squared courses: few joints, tight and sooty, pitted feldspar speckle."""
    rng = np.random.default_rng(seed)
    block, dx, dy, _, count = courses(n, rng, 4, 0.30 * n, 0.62 * n, row_jitter=0.04)
    fine, chisel, big = fbm(n, seed + 1, 0.6), fbm(n, seed + 2, 1.4), fbm(n, seed + 3, 2.6)
    speck = smooth(0.70, 0.78, fbm(n, seed + 4, 0.25))
    edge = rounded_edge(dx, dy, n * 0.008)
    joint = n * 0.003
    face = smooth(joint, joint + n * 0.008, edge)
    # Wedge-split faces: each block leans a little and carries pitched tool scars.
    lean = rng.uniform(0.82, 1.0, count)[block]
    height = face * (0.8 * lean + 0.2 * chisel) + 0.06 * fine - 0.05 * speck
    tones = rng.uniform(0.9, 1.08, count)[block]
    col = tint((0.37, 0.39, 0.42), tones * (0.86 + 0.18 * fine) * (0.75 + 0.25 * chisel))
    col = lerp(col, (0.66, 0.64, 0.60), speck * 0.45)
    col = lerp(col, (0.22, 0.22, 0.23), speck * smooth(0.55, 0.8, fine) * 0.3)
    soot = smooth(n * 0.05, 0.0, edge) * 0.55
    albedo = lerp(tint((0.14, 0.13, 0.13), 0.9 + 0.2 * fine), col, face)
    albedo = tint(albedo, 1 - soot)
    return _weather(albedo, n, seed, 0.20), height, 2.4


def sod(n, seed):
    """Turf mat seen from above: blade streaks down the slope (v), clumps, dry tufts, earth."""
    clump = fbm(n, seed, 2.3)
    blades = fbm(n, seed + 1, 0.9, sx=1.0, sy=9.0)
    tufts = smooth(0.62, 0.8, fbm(n, seed + 2, 1.5))
    earth = smooth(0.70, 0.84, fbm(n, seed + 3, 2.0)) * (1 - tufts)
    blades, clump = _warp(n, seed + 4, 0.02, blades, clump)
    green = lerp((0.18, 0.22, 0.10), (0.33, 0.36, 0.16), blades)
    albedo = tint(green, 0.7 + 0.45 * clump)
    albedo = lerp(albedo, (0.50, 0.45, 0.28), tufts * 0.75)
    albedo = lerp(albedo, (0.20, 0.16, 0.11), earth * 0.8)
    height = 0.55 * clump + 0.30 * blades + 0.25 * tufts - 0.4 * earth
    return albedo.astype(np.float32), height.astype(np.float32), 2.6


REGIONAL_PATTERNS = {'granite': (granite, 1024), 'sod': (sod, 512)}
