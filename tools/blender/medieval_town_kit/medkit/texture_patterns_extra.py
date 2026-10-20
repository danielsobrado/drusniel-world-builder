"""Roofing and relief-carved woodwork textures for the regional styles."""
import numpy as np

from .texture_patterns_weathered import oak
from .texture_patterns import _uv, courses, fbm, lerp, rounded_edge, smooth, tint


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
    """Planed and oiled cabinetmaker's oak: the structural oak's grain, darker, no checks."""
    albedo, height = oak(n, seed, (0.38, 0.27, 0.17), (0.25, 0.17, 0.105), checks=0.15)
    return albedo, height, 1.0


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
    base_wood = lerp((0.24, 0.165, 0.11), (0.38, 0.27, 0.18), 0.55 * grain_mix + 0.45 * figure)
    relief_shade = (
        outer_frame * 0.98
        + molding_ridge * 0.92
        + inner_field * (0.64 + 0.44 * knot)
        - groove * 0.24
    ).clip(0.42, 1.14)
    albedo = tint(base_wood, relief_shade * (0.90 + 0.18 * fine))
    return albedo, height, 2.8


def brick(n, seed):
    """Hand-molded medieval kilned clay brickwork in running bond (~12 courses per tile)
    with warm terracotta/russet/ochre clay variation, kiln-flashed clinker headers,
    firing creases, and recessed sandy lime-mortar joints."""
    rng = np.random.default_rng(seed)
    block, dx, dy, t_row, count = courses(n, rng, 12, 0.16 * n, 0.25 * n, row_jitter=0.06)
    fine = fbm(n, seed + 1, 1.30)
    mid = fbm(n, seed + 2, 1.95)
    big = fbm(n, seed + 3, 2.55)
    crease = fbm(n, seed + 4, 1.55, sx=14.0, sy=1.6)
    wobble = fbm(n, seed + 5, 2.0)
    pits = smooth(0.76, 0.89, fbm(n, seed + 6, 1.25))

    edge = rounded_edge(dx, dy, n * 0.009) + (wobble - 0.5) * n * 0.006
    mortar = n * 0.0045
    face = smooth(mortar, mortar + n * 0.007, edge)
    chamfer = smooth(mortar, mortar + n * 0.018, edge)

    BRICK_PALETTE = np.array([
        [0.64, 0.28, 0.18],  # classic terracotta red
        [0.53, 0.23, 0.15],  # deep russet clay
        [0.69, 0.37, 0.23],  # warm salmon-ochre brick
        [0.39, 0.20, 0.14],  # kiln-flashed dark clinker
        [0.58, 0.31, 0.20],  # weathered red-brown clay
    ], np.float32)
    pick = rng.integers(0, len(BRICK_PALETTE), count)
    tones = rng.uniform(0.86, 1.12, count)
    bulge = rng.uniform(0.80, 1.05, count)[block]
    brick_col = (BRICK_PALETTE[pick] * tones[:, None])[block]

    # Hand-struck clay fold creases & kiln soot flashing
    brick_col = lerp(brick_col, brick_col * np.array([1.10, 1.04, 0.96], np.float32), crease * 0.32)
    soot_flash = smooth(0.68, 0.88, mid) * face
    brick_col = lerp(brick_col, (0.28, 0.17, 0.12), soot_flash * 0.28)

    top_hi = smooth(0.78, 0.96, t_row) * face
    bot_ao = smooth(0.22, 0.04, t_row) * face
    shade = (
        (0.85 + 0.22 * fine + 0.08 * crease)
        * (0.78 + 0.22 * chamfer + 0.10 * top_hi - 0.10 * bot_ao)
        * (1.0 - 0.16 * smooth(0.50, 0.92, big))
        * (1.0 - 0.30 * pits)
    )
    brick_col = tint(brick_col, shade)

    # Sandy lime mortar with recessed joint AO
    mortar_ao = smooth(0.0, mortar, edge)
    mortar_col = tint((0.72, 0.67, 0.57), (0.86 + 0.22 * fine) * (0.76 + 0.24 * mortar_ao))
    albedo = lerp(mortar_col, brick_col, face)

    height = (
        face * (0.64 + 0.22 * chamfer * bulge + 0.08 * top_hi + 0.10 * crease)
        + 0.08 * fine
        - 0.28 * pits * face
    ).astype(np.float32)
    return albedo.astype(np.float32), height, 2.5


EXTRA_PATTERNS = {
    'terracotta': (terracotta, 1024),
    'thatch': (thatch, 512),
    'fine_wood': (fine_wood, 1024),
    'carved_wood': (carved_wood, 1024),
    'brick': (brick, 1024),
}
