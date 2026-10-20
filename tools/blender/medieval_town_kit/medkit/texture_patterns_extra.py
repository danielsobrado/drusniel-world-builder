"""Roofing and relief-carved woodwork textures for the regional styles."""
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


def fine_wood(n, seed):
    """Smooth, hand-planed and oiled walnut/oak cabinetmaker's wood with subtle
    cathedral figure and directional wood grain (no rough bark cracks)."""
    u, v = _uv(n)
    del v
    streak = fbm(n, seed, 1.55, sx=18.0, sy=1.6)
    cathedral = 0.5 + 0.5 * np.sin((u * 3.5 + fbm(n, seed + 1, 2.1, sx=3.5, sy=1.4) * 1.6) * np.pi * 2.0)
    fine = fbm(n, seed + 2, 1.25, sx=28.0, sy=2.2)
    mix = 0.52 * streak + 0.30 * cathedral + 0.18 * fine
    albedo = lerp((0.25, 0.16, 0.095), (0.45, 0.30, 0.18), mix)
    albedo = tint(albedo, 0.92 + 0.16 * fine)
    height = 0.55 * streak + 0.25 * cathedral + 0.20 * fine
    return albedo.astype(np.float32), height.astype(np.float32), 0.75


def carved_wood(n, seed):
    """Relief-carved walnut/oak panel with stepped molding border and interwoven
    Nordic/Celtic Urnes knotwork relief (mapped 0..1 across each panel via fit=True)."""
    u, v = _uv(n)
    grain_v = fbm(n, seed, 1.55, sx=18.0, sy=1.6)
    grain_h = fbm(n, seed + 1, 1.55, sx=1.6, sy=18.0)
    fine = fbm(n, seed + 2, 1.2)
    figure = fbm(n, seed + 3, 2.2, sx=3.0, sy=1.5)

    # Distance from panel edge for mitered frame & stepped ogee molding
    dx = np.minimum(u, 1.0 - u)
    dy = np.minimum(v, 1.0 - v)
    edge = np.minimum(dx, dy)

    # Outer frame (0..0.075), stepped molding groove (0.075..0.13), inner carved field (>0.13)
    outer_frame = smooth(0.08, 0.06, edge)
    molding_ridge = smooth(0.075, 0.098, edge) * smooth(0.128, 0.105, edge)
    groove = smooth(0.06, 0.078, edge) * smooth(0.142, 0.118, edge)
    inner_field = smooth(0.122, 0.148, edge)

    # Normalized coordinates inside the inner carved field (-1..1)
    cu = np.clip((u - 0.5) / 0.36, -1.0, 1.0)
    cv = np.clip((v - 0.5) / 0.36, -1.0, 1.0)

    # Interwoven Nordic dragon/vine knotwork (3-strand over-under braid + scroll loops)
    w1 = cv - 0.42 * np.sin(cu * np.pi * 1.5) - 0.18 * np.cos(cv * np.pi * 2.0)
    w2 = cv + 0.42 * np.sin(cu * np.pi * 1.5) - 0.18 * np.sin(cu * np.pi * 2.0)
    w3 = cu - 0.38 * np.sin(cv * np.pi * 1.5)
    w4 = cu + 0.38 * np.sin(cv * np.pi * 1.5)
    ring = np.hypot(cu * 0.90, cv * 0.88) - 0.64

    def ribbon(dist, width=0.145):
        body = smooth(width, width * 0.30, np.abs(dist))
        median_groove = smooth(width * 0.22, 0.0, np.abs(dist))
        return body * (1.0 - 0.35 * median_groove)

    r1 = ribbon(w1, 0.15) * (0.84 + 0.16 * np.sin(cu * np.pi * 3.0))
    r2 = ribbon(w2, 0.15) * (0.84 - 0.16 * np.sin(cu * np.pi * 3.0))
    r3 = ribbon(w3, 0.135) * (0.84 + 0.16 * np.cos(cv * np.pi * 3.0))
    r4 = ribbon(w4, 0.135) * (0.84 - 0.16 * np.cos(cv * np.pi * 3.0))
    r_ring = ribbon(ring, 0.12) * smooth(0.95, 0.72, np.maximum(np.abs(cu), np.abs(cv)))

    knot = np.maximum(np.maximum(r1, r2), np.maximum(np.maximum(r3, r4), r_ring)) * inner_field

    grain_mix = np.where(dx < dy, grain_v, grain_h)
    height = (
        outer_frame * 0.78
        + molding_ridge * 0.58
        + inner_field * (0.20 + 0.58 * knot)
        - groove * 0.18
        + 0.06 * grain_mix
        + 0.03 * fine
    ).astype(np.float32)

    # Cohesive oiled walnut/oak heartwood palette matching `fine_wood`
    base_wood = lerp((0.25, 0.16, 0.095), (0.45, 0.30, 0.18), 0.55 * grain_mix + 0.45 * figure)
    relief_shade = (
        outer_frame * 0.98
        + molding_ridge * 0.92
        + inner_field * (0.64 + 0.44 * knot)
        - groove * 0.24
    ).clip(0.42, 1.14)
    albedo = tint(base_wood, relief_shade * (0.90 + 0.18 * fine))
    return albedo, height, 2.8


EXTRA_PATTERNS = {
    'terracotta': (terracotta, 1024),
    'thatch': (thatch, 512),
    'fine_wood': (fine_wood, 1024),
    'carved_wood': (carved_wood, 1024),
}
