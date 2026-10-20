"""Weathered surfaces in the spirit of Skyrim's holds: big irregular rubble with
deep mortar shadow, dressed ashlar, silver-grey timber with knots and cracks,
weathered wood shingles and stained render.

Overrides the cleaner first-pass patterns of the same names. Values are muted
and darker on purpose: towns are seen under strong sun and tone mapping, and
saturated, bright albedo is what made the first pass read as toy-like.
"""
import numpy as np

from .texture_patterns import courses, fbm, lerp, rounded_edge, smooth, tint

# Warm field-stone greys and buffs: the storybook towns we match read as honey-lit
# limestone rubble, never the cool blue-grey of slate.
STONE_PALETTE = np.array([[0.62, 0.58, 0.52], [0.66, 0.6, 0.5], [0.58, 0.56, 0.53],
                          [0.7, 0.65, 0.57], [0.6, 0.54, 0.46]], np.float32)


def _weather(albedo, n, seed, streaks=0.18, moss=None):
    streak = fbm(n, seed + 31, 1.8, sy=10)
    albedo = tint(albedo, 1 - streaks * smooth(0.55, 0.9, streak))
    if moss is not None:
        albedo = lerp(albedo, (0.22, 0.28, 0.12), moss)
    return albedo


def _warp(n, seed, amount, *fields):
    """Resample fields through a periodic displacement so courses wander and outlines wobble."""
    yy, xx = np.mgrid[0:n, 0:n]
    ox = ((fbm(n, seed, 2.4) - 0.5) * 2 * amount * n).astype(np.int32)
    oy = ((fbm(n, seed + 1, 2.4) - 0.5) * 2 * amount * n).astype(np.int32)
    iy, ix = (yy + oy) % n, (xx + ox) % n
    return [f[iy, ix] for f in fields]


def rubble(n, seed):
    """Pillowy coursed rubble: rounded stones domed from their outline, sunk mortar."""
    rng = np.random.default_rng(seed)
    block, dx, dy, _, count = courses(n, rng, 8, 0.08 * n, 0.24 * n, row_jitter=0.35)
    block, dx, dy = _warp(n, seed + 9, 0.035, block, dx, dy)
    fine, mid, big = fbm(n, seed + 1, 1.2), fbm(n, seed + 2, 1.9), fbm(n, seed + 3, 2.7)
    wobble, pits = fbm(n, seed + 4, 2.0), fbm(n, seed + 5, 0.7)
    edge = rounded_edge(dx, dy, n * 0.04) + (wobble - 0.5) * n * 0.03
    mortar = n * 0.006
    face = smooth(mortar, mortar + n * 0.018, edge)
    dome = np.sqrt(np.clip(edge - mortar, 0, None) / (n * 0.05)).clip(0, 1)
    bulge = rng.uniform(0.7, 1.0, count)[block]
    height = face * (0.35 + 0.65 * dome * bulge) * (0.85 + 0.15 * mid) + 0.08 * fine         - 0.08 * smooth(0.72, 0.9, pits) * face
    pick = rng.integers(0, len(STONE_PALETTE), count)
    tones = rng.uniform(0.86, 1.1, count)
    col = (STONE_PALETTE[pick] * tones[:, None])[block]
    col = tint(col, (0.8 + 0.28 * fine) * (0.62 + 0.38 * dome))
    col = lerp(col, (0.74, 0.7, 0.62), smooth(0.84, 0.92, pits) * face * 0.35)
    albedo = lerp(tint((0.3, 0.28, 0.25), 0.85 + 0.3 * fine), col, face)
    moss = smooth(0.62, 0.8, big) * (1 - 0.8 * face) * 0.7
    return _weather(albedo, n, seed, 0.16, moss), height, 3.6


def ashlar(n, seed):
    rng = np.random.default_rng(seed)
    block, dx, dy, _, count = courses(n, rng, 5, 0.25 * n, 0.45 * n, row_jitter=0.1)
    fine, chisel, big = fbm(n, seed + 1, 1.1), fbm(n, seed + 2, 0.5), fbm(n, seed + 3, 2.6)
    edge = rounded_edge(dx, dy, n * 0.012)
    mortar = n * 0.004
    face = smooth(mortar, mortar + n * 0.012, edge)
    height = face * (0.85 + 0.1 * chisel) + 0.05 * fine
    tones = rng.uniform(0.84, 1.1, count)[block]
    col = tint((0.5, 0.49, 0.47), tones * (0.8 + 0.25 * fine) * (0.62 + 0.38 * smooth(mortar, n * 0.05, edge)))
    albedo = lerp(tint((0.25, 0.24, 0.22), 0.9 + 0.2 * fine), col, face)
    moss = smooth(0.6, 0.8, big) * (1 - 0.9 * face) * 0.6
    return _weather(albedo, n, seed, 0.25, moss), height, 2.6


def dressed(n, seed):
    """Finely tooled ashlar limestone with subtle chisel-drafted margins, warm
    sedimentary travertine bedding veins, fossil mineral flecks, and crisp arrises."""
    rng = np.random.default_rng(seed)
    v, u = (np.mgrid[0:n, 0:n].astype(np.float32) + 0.5) / n
    block, dx, dy, t_row, count = courses(n, rng, 4, 0.36 * n, 0.62 * n, row_jitter=0.08)
    block, dx, dy = _warp(n, seed + 9, 0.008, block, dx, dy)
    fine = fbm(n, seed + 1, 1.35)
    mid = fbm(n, seed + 2, 1.95)
    big = fbm(n, seed + 3, 2.55)
    bedding = fbm(n, seed + 4, 1.70, sx=12.0, sy=1.5)

    edge = rounded_edge(dx, dy, n * 0.010) + (fine - 0.5) * n * 0.004
    mortar = n * 0.0025
    face = smooth(mortar, mortar + n * 0.008, edge)
    margin_w = n * 0.018
    boss_face = smooth(mortar + margin_w, mortar + margin_w + n * 0.014, edge)
    margin_band = face * (1.0 - boss_face)

    # Subtle mason's chisel striations & sedimentary limestone bedding
    drove_diag = 0.5 + 0.5 * np.sin((u * 52.0 + v * 52.0 + 0.8 * fine) * np.pi * 2.0)
    tooling = 0.65 * bedding + 0.20 * fine + 0.15 * drove_diag

    pits = smooth(0.78, 0.89, fbm(n, seed + 5, 1.30)) * boss_face
    veins = smooth(0.76, 0.86, fbm(n, seed + 6, 1.65, sx=8.0, sy=1.8)) * face

    # Per-block warm Cotswold/Mediterranean honey-limestone color variation
    ASHLAR_PALETTE = np.array([
        [0.65, 0.59, 0.49],
        [0.69, 0.63, 0.53],
        [0.61, 0.56, 0.47],
        [0.72, 0.65, 0.54],
        [0.63, 0.55, 0.44],
    ], np.float32)
    pick = rng.integers(0, len(ASHLAR_PALETTE), count)
    tones = rng.uniform(0.90, 1.08, count)
    stone_col = (ASHLAR_PALETTE[pick] * tones[:, None])[block]

    # Sedimentary bedding & subtle drafted margin lightening
    stone_col = lerp(stone_col, stone_col * np.array([1.08, 1.05, 1.01], np.float32), bedding * 0.36)
    stone_col = lerp(stone_col, (0.74, 0.68, 0.58), margin_band * 0.16 + veins * 0.32)

    # Top-arris sunlight catch and bottom-edge shadow within each course
    top_hi = smooth(0.84, 0.98, t_row) * face
    bot_ao = smooth(0.16, 0.02, t_row) * face
    shade = (
        (0.86 + 0.16 * fine + 0.08 * mid + 0.05 * tooling)
        * (0.95 + 0.05 * boss_face + 0.07 * top_hi - 0.09 * bot_ao)
        * (1.0 - 0.18 * smooth(0.48, 0.92, big))
        * (1.0 - 0.32 * pits)
    )
    stone_col = tint(stone_col, shade)
    mortar_col = tint((0.46, 0.43, 0.37), 0.86 + 0.24 * fine)
    albedo = lerp(mortar_col, stone_col, face)
    moss = smooth(0.66, 0.86, big) * (1.0 - 0.85 * boss_face) * 0.35
    height = (
        face * (0.66 + 0.18 * boss_face + 0.06 * top_hi)
        + 0.12 * mid * face
        + 0.08 * tooling * face
        + 0.06 * veins
        - 0.32 * pits
    ).astype(np.float32)
    return _weather(albedo, n, seed, 0.20, moss), height, 2.2


def planks(n, seed):
    rng = np.random.default_rng(seed)
    block, dx, dy, _, count = courses(n, rng, 8, 0.35 * n, 0.8 * n)
    grain = fbm(n, seed + 1, 1.5, sx=14)
    knots = smooth(0.86, 0.93, fbm(n, seed + 2, 1.2, sx=3))
    silver = fbm(n, seed + 3, 2.4)
    seam = smooth(1, 4, dy) * smooth(1, 5, dx)
    tones = rng.uniform(0.75, 1.15, count)[block]
    wood = tint((0.46, 0.37, 0.29), tones * (0.6 + 0.55 * grain) * (1 - 0.45 * knots))
    wood = lerp(wood, (0.48, 0.46, 0.43), smooth(0.45, 0.85, silver) * 0.45)
    albedo = tint(wood, 0.45 + 0.55 * seam)
    return _weather(albedo, n, seed, 0.15), seam * (0.75 + 0.25 * grain) - 0.2 * knots, 2.2


def timber(n, seed):
    """Adze-hewn seasoned oak structural timber with catheter growth-ring arches,
    knot grain deflection, dark earlywood vessel pores, golden medullary rays,
    chamfered beam edges, and deep seasoning checks."""
    v, u = (np.mgrid[0:n, 0:n].astype(np.float32) + 0.5) / n
    fibers = fbm(n, seed, 1.45, sx=22.0, sy=1.0)
    fine = fbm(n, seed + 1, 1.25, sx=28.0, sy=1.4)
    warp = fbm(n, seed + 2, 2.1, sx=7.0, sy=1.5)

    # Knots that radially deflect surrounding wood fibers and growth rings
    v_deflect = np.zeros((n, n), np.float32)
    knot_mask = np.zeros((n, n), np.float32)
    knot_rings = np.zeros((n, n), np.float32)
    for uk, vk, rx, ry in ((0.23, 0.30, 1.7, 3.2), (0.67, 0.68, 1.5, 2.9), (0.86, 0.24, 1.9, 3.5)):
        du = ((u - uk + 0.5) % 1.0) - 0.5
        dv = ((v - vk + 0.5) % 1.0) - 0.5
        dk = np.hypot(du * rx, dv * ry)
        v_deflect += (dv / (dk + 0.045)) * 0.075 * np.exp(-dk * 8.5)
        knot_mask = np.maximum(knot_mask, smooth(0.11, 0.025, dk))
        knot_rings = np.maximum(
            knot_rings,
            smooth(0.19, 0.05, dk) * (0.5 + 0.5 * np.sin(dk * 85.0)),
        )

    # Parabolic cathedral growth-ring arches opening along u (beam length)
    v_warped = v + v_deflect + 0.13 * (warp - 0.5)
    u_arch = 0.30 * np.sin(u * np.pi * 2.0 + fbm(n, seed + 3, 2.4) * 2.6)
    r_pith = np.hypot((v_warped - 0.50) * 4.6, u_arch)
    ring_phase = r_pith * 3.4 + fbm(n, seed + 4, 1.85, sx=11.0, sy=1.4) * 1.35
    ring_wave = 0.5 + 0.5 * np.sin(ring_phase * np.pi * 2.0)
    latewood = smooth(0.56, 0.93, ring_wave)

    # Open-grain oak vessel pores in earlywood + golden quarter-sawn medullary rays
    pores = smooth(0.73, 0.87, fbm(n, seed + 5, 1.15, sx=18.0, sy=0.75)) * (1.0 - 0.65 * latewood)
    rays = smooth(0.75, 0.89, fbm(n, seed + 6, 1.65, sx=7.5, sy=2.4))
    cracks = smooth(0.82, 0.91, fbm(n, seed + 7, 1.5, sx=26.0, sy=1.1)) * smooth(0.38, 0.68, fbm(n, seed + 8, 2.3))
    adze = 0.5 + 0.5 * np.sin((u * 8.0 + 0.35 * warp) * np.pi * 2.0)

    # Planed edge bevel highlight along top/bottom beam arrises
    edge_dist = np.minimum(v, 1.0 - v)
    edge_chamfer = smooth(0.055, 0.012, edge_dist) * smooth(0.0, 0.008, edge_dist)

    # Rich seasoned oak heartwood albedo
    earlywood_col = np.array((0.46, 0.31, 0.18), np.float32)
    latewood_col = np.array((0.20, 0.125, 0.07), np.float32)
    wood = lerp(earlywood_col, latewood_col, 0.58 * latewood + 0.28 * (1.0 - fibers) + 0.14 * knot_rings)
    wood = lerp(wood, (0.56, 0.40, 0.24), rays * 0.32 + edge_chamfer * 0.26)
    wood = tint(
        wood,
        (0.84 + 0.22 * fibers + 0.08 * adze)
        * (1.0 - 0.32 * pores)
        * (1.0 - 0.65 * cracks)
        * (1.0 - 0.55 * knot_mask),
    )
    height = (
        0.38 * fibers
        + 0.28 * (1.0 - latewood)
        + 0.14 * adze
        + 0.10 * fine
        + 0.10 * edge_chamfer
        - 0.28 * pores
        - 0.70 * cracks
        - 0.35 * knot_mask
    ).astype(np.float32)
    return wood.astype(np.float32), height, 2.4


def shingles(n, seed):
    """Dark split slates: rectangular courses, each lapping the one below in shadow."""
    rng = np.random.default_rng(seed)
    block, dx, _, t, count = courses(n, rng, 10, 0.07 * n, 0.12 * n)
    fine, big, grain = fbm(n, seed + 1, 1.3), fbm(n, seed + 2, 2.4), fbm(n, seed + 3, 1.6, sx=6)
    gap = smooth(n * 0.002, n * 0.006, dx)
    height = gap * (0.3 + 0.7 * (1 - t)) + 0.07 * grain
    tones = rng.uniform(0.72, 1.22, count)[block]
    hue = rng.uniform(0, 1, count)[block]
    slate = lerp(np.array((0.24, 0.26, 0.3), np.float32), np.array((0.3, 0.27, 0.25), np.float32), hue)
    col = tint(slate, tones * (0.78 + 0.32 * grain) * (0.88 + 0.2 * fine))
    col = tint(col, (1 - 0.55 * smooth(0.72, 1.0, t)) * (0.3 + 0.7 * gap))
    moss = smooth(0.58, 0.8, big) * (0.35 + 0.65 * smooth(0.3, 1.0, t)) * 0.7
    col = lerp(col, (0.33, 0.36, 0.2), moss * 0.6)
    return _weather(col, n, seed, 0.1), height, 3.0


def render(n, seed):
    fine, mid, big = fbm(n, seed, 1.2), fbm(n, seed + 1, 2.0), fbm(n, seed + 2, 2.8)
    cracks = smooth(0.9, 0.95, fbm(n, seed + 3, 1.0))
    shade = (0.88 + 0.14 * fine) * (1 - 0.28 * smooth(0.45, 0.95, big)) * (1 - 0.35 * cracks)
    albedo = tint((0.9, 0.81, 0.64), shade)
    return _weather(albedo, n, seed, 0.22), 0.5 * fine + 0.4 * mid - 0.4 * cracks, 1.2


WEATHERED_PATTERNS = {
    'stone': (rubble, 1024), 'ashlar': (ashlar, 1024), 'planks': (planks, 1024),
    'timber': (timber, 1024), 'roof': (shingles, 1024), 'plaster': (render, 1024),
    'dressed': (dressed, 1024),
}
