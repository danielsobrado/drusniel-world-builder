"""Roofing textures for the regional styles: Roman barrel tiles and thatch."""
import numpy as np

from .texture_patterns import _uv, fbm, lerp, smooth, tint


def terracotta(n, seed):
    """Barrel tiles in straight columns, 10 courses per tile; +v runs up the roof."""
    rng = np.random.default_rng(seed)
    rows, cols = 10, 14
    u, v = _uv(n)
    row = np.minimum((v * rows).astype(int), rows - 1)
    col = np.minimum((u * cols).astype(int), cols - 1)
    t = v * rows - row
    c = u * cols - col
    barrel = np.sin(np.pi * c)
    fine, big = fbm(n, seed + 1, 1.3), fbm(n, seed + 2, 2.5)
    palette = np.array([[0.74, 0.36, 0.20], [0.64, 0.30, 0.17], [0.82, 0.50, 0.30],
                        [0.70, 0.42, 0.26]], np.float32)
    ids = row * cols + col
    pick = rng.integers(0, len(palette), rows * cols)[ids]
    tones = rng.uniform(0.85, 1.12, rows * cols)[ids]
    col_rgb = tint(palette[pick], tones * (0.5 + 0.5 * barrel) * (0.82 + 0.25 * fine))
    col_rgb = tint(col_rgb, 1 - 0.5 * smooth(0.78, 1.0, t))
    dirt = smooth(0.55, 0.85, big) * 0.45
    albedo = lerp(col_rgb, (0.32, 0.30, 0.22), dirt * (1 - barrel * 0.5))
    height = barrel * 0.75 + (1 - t) * 0.25
    return albedo, height, 2.5


def thatch(n, seed):
    """Layered straw; strands run down the slope (along v)."""
    u, v = _uv(n)
    del u
    streak = fbm(n, seed, 1.4, sy=14)
    fine, big = fbm(n, seed + 1, 1.0), fbm(n, seed + 2, 2.6)
    t = (v * 6) % 1.0
    shade = 0.55 + 0.45 * smooth(0.0, 0.3, t)
    straw = lerp((0.50, 0.40, 0.22), (0.78, 0.66, 0.40), streak)
    albedo = tint(straw, shade * (0.85 + 0.2 * fine))
    albedo = lerp(albedo, (0.38, 0.36, 0.30), smooth(0.6, 0.85, big) * 0.5)
    return albedo, streak * 0.6 + (1 - t) * 0.4, 2.5


EXTRA_PATTERNS = {'terracotta': (terracotta, 1024), 'thatch': (thatch, 512)}
