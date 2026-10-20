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
    """Tooled limestone with no joints: every dressed piece is its own block, so the
    texture is only the stone's face. Fine diagonal drove tooling, scattered small
    pores, soft bedding and lichen dots; contrast is kept low so neighbouring pieces
    differ by their per-piece tone, not by a pattern repeating inside them."""
    v, u = (np.mgrid[0:n, 0:n].astype(np.float32) + 0.5) / n
    fine = fbm(n, seed + 1, 1.35)
    mid = fbm(n, seed + 2, 1.95)
    big = fbm(n, seed + 3, 2.55)
    bedding = fbm(n, seed + 4, 1.7, sx=10.0, sy=1.2)
    # Drove tooling: parallel chisel strokes in patches that change angle and fade.
    patch = fbm(n, seed + 5, 2.2)
    angle = (patch - 0.5) * 0.9
    drove = 0.5 + 0.5 * np.sin((u * np.cos(angle) + v * np.sin(angle)) * 64.0 * np.pi * 2.0 + 0.6 * fine)
    drove *= smooth(0.25, 0.65, fbm(n, seed + 6, 2.0))
    # Small pores and chips: high-frequency noise thresholded so each spot stays tiny.
    pores = smooth(0.80, 0.90, fbm(n, seed + 7, 0.35))
    chips = smooth(0.86, 0.94, fbm(n, seed + 8, 0.9)) * smooth(0.5, 0.7, mid)
    lichen = smooth(0.87, 0.93, fbm(n, seed + 9, 0.6)) * smooth(0.55, 0.8, big)
    base = lerp((0.70, 0.65, 0.56), (0.64, 0.60, 0.53), big)
    base = lerp(base, (0.74, 0.69, 0.60), bedding * 0.35)
    shade = (0.92 + 0.08 * fine) * (0.96 + 0.04 * mid) * (1.0 - 0.025 * drove) * (1.0 - 0.30 * pores)         * (1.0 - 0.18 * chips)
    albedo = tint(base, shade)
    albedo = lerp(albedo, (0.78, 0.74, 0.62), lichen * 0.45)
    albedo = lerp(albedo, (0.40, 0.42, 0.30), smooth(0.70, 0.88, big) * smooth(0.45, 0.7, fine) * 0.12)
    height = (0.55 + 0.20 * mid + 0.10 * fine + 0.015 * drove + 0.05 * bedding
              - 0.35 * pores - 0.25 * chips).astype(np.float32)
    return albedo.astype(np.float32), height, 1.6


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


def oak(n, seed, early, late, grey=0.0, checks=1.0):
    """Quarter-sawn oak seen along the grain (u): long fibrous streaks and soft flame
    figure, a few small knots, thin seasoning checks. Rings are never drawn as bands:
    they only modulate tone, which is what keeps beams from reading as zebra stripes."""
    v, u = (np.mgrid[0:n, 0:n].astype(np.float32) + 0.5) / n
    warp = fbm(n, seed + 2, 2.1, sx=6.0, sy=1.5)
    fibers = fbm(n, seed, 1.3, sx=26.0, sy=1.0)
    streak = fbm(n, seed + 1, 1.1, sx=44.0, sy=1.3)
    flame = 0.5 + 0.5 * np.sin((v + 0.10 * (warp - 0.5)) * 38.0 * np.pi + 3.0 * fbm(n, seed + 3, 2.2, sx=4.0))
    patches = fbm(n, seed + 4, 2.4)
    knot = np.zeros((n, n), np.float32)
    rng = np.random.default_rng(seed)
    for _ in range(2):
        uk, vk = rng.uniform(0, 1, 2)
        du = ((u - uk + 0.5) % 1.0) - 0.5
        dv = ((v - vk + 0.5) % 1.0) - 0.5
        knot = np.maximum(knot, smooth(0.022, 0.006, np.hypot(du * 0.6, dv * 1.6)))
    check = smooth(0.955, 0.985, fbm(n, seed + 7, 1.1, sx=34.0, sy=0.7)) * smooth(0.45, 0.7, patches) * checks
    t = 0.45 * fibers + 0.30 * streak + 0.25 * flame
    wood = lerp(np.array(late, np.float32), np.array(early, np.float32), smooth(0.15, 0.85, t))
    wood = tint(wood, (0.90 + 0.14 * patches) * (1.0 - 0.35 * knot) * (1.0 - 0.45 * check))
    if grey:
        wood = lerp(wood, (0.40, 0.39, 0.36), smooth(0.4, 0.85, fbm(n, seed + 9, 2.4)) * grey)
    height = (0.45 * fibers + 0.35 * streak + 0.10 * flame - 0.6 * check - 0.3 * knot).astype(np.float32)
    return wood.astype(np.float32), height


def timber(n, seed):
    """Adze-dressed, weathered structural oak."""
    wood, height = oak(n, seed, (0.37, 0.29, 0.21), (0.24, 0.18, 0.13), grey=0.28)
    u = (np.mgrid[0:n, 0:n][1].astype(np.float32) + 0.5) / n
    adze = 0.5 + 0.5 * np.sin((u * 8.0 + 0.3 * fbm(n, seed + 11, 2.0)) * np.pi * 2.0)
    return tint(wood, 0.96 + 0.06 * adze), height + 0.12 * adze, 2.0


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
