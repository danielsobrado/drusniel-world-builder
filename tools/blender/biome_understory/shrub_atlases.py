"""High-resolution scanned PBR bark + foliage spray atlases for AAA shrubs.

Composes 1024x1024 albedo (with sharpened cutout alpha and dilated RGB border to
prevent dark mip halos) and matching 1024x1024 tangent-space normal maps from
the locally cached CC0 Poly Haven 2K foliage and bark scans.

Atlas UV layout (consistent across every procedural AAA shrub):
  - u in [0.00, 0.23] : tileable scanned bark strip (opaque, alpha = 1)
  - u in [0.25, 0.62] : Spray A (lower/inner fuller leafy spray)
  - u in [0.63, 1.00] : Spray B (upper/outer airy shoot spray)
"""
import math
import os

import bpy
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
CACHE = os.path.join(ROOT, 'assets', 'source-cache', 'polyhaven')
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

# Pre-measured clean single-leaf crop rectangles (y0, y1, x0, x1) in normalized [0..1] coords
# on the 2K Poly Haven sheets.
SHRUB04_LEAVES = (
    (0.09, 0.34, 0.11, 0.25),   # slender upper-left leaf
    (0.07, 0.36, 0.51, 0.63),   # upright top-center leaf
    (0.39, 0.66, 0.42, 0.55),   # weathered olive-bronze leaf
    (0.37, 0.60, 0.59, 0.71),   # bronze-tipped leaf
    (0.62, 0.94, 0.21, 0.35),   # broad bright green leaf
    (0.68, 0.94, 0.36, 0.49),   # deep-veined green leaf
    (0.66, 0.91, 0.54, 0.66),   # oval green leaf
)

ISLAND_LEAVES = (
    (11 / 512, 200 / 512, 85 / 512, 171 / 512),
    (296 / 512, 511 / 512, 111 / 512, 180 / 512),
    (323 / 512, 511 / 512, 9 / 512, 92 / 512),
    (11 / 512, 260 / 512, 9 / 512, 73 / 512),
    (11 / 512, 211 / 512, 356 / 512, 417 / 512),
    (25 / 512, 184 / 512, 265 / 512, 331 / 512),
    (310 / 512, 511 / 512, 216 / 512, 286 / 512),
    (17 / 512, 184 / 512, 185 / 512, 246 / 512),
)

FIR_SPRAYS = (
    (208 / 512, 396 / 512, 160 / 512, 327 / 512),
    (234 / 512, 424 / 512, 330 / 512, 486 / 512),
    (27 / 512, 188 / 512, 335 / 512, 478 / 512),
    (25 / 512, 158 / 512, 97 / 512, 208 / 512),
    (135 / 512, 204 / 512, 255 / 512, 320 / 512),
)

JACARANDA_FRONDS = (
    (13 / 512, 240 / 512, 150 / 512, 505 / 512),
    (302 / 512, 505 / 512, 215 / 512, 511 / 512),
)

DIDELTA_LEAVES = (
    (0.03, 0.19, 0.13, 0.27),
    (0.01, 0.16, 0.35, 0.52),
    (0.02, 0.16, 0.52, 0.67),
    (0.18, 0.32, 0.08, 0.29),
    (0.14, 0.27, 0.33, 0.53),
    (0.16, 0.33, 0.54, 0.69),
    (0.25, 0.40, 0.27, 0.46),
    (0.30, 0.44, 0.48, 0.67),
)

_SCAN_CACHE = {}


def _find_scan_file(asset_id, suffix):
    for sub in ('', 'textures'):
        folder = os.path.join(CACHE, asset_id, sub) if sub else os.path.join(CACHE, asset_id)
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            if name.startswith(f'{asset_id}_{suffix}'):
                return os.path.join(folder, name)
    raise FileNotFoundError(f'Missing Poly Haven map {asset_id}_{suffix} in {CACHE}')


def _load_rgba(path, size, is_color=True):
    key = (path, size, is_color)
    if key in _SCAN_CACHE:
        return _SCAN_CACHE[key]
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'sRGB' if is_color else 'Non-Color'
    if img.size[0] != size or img.size[1] != size:
        img.scale(size, size)
    flat = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(flat)
    bpy.data.images.remove(img)
    arr = np.flipud(flat.reshape(size, size, 4)).copy()
    _SCAN_CACHE[key] = arr
    return arr


def load_bark_scan(bark_id, width=240, height=1024):
    """Return tileable scanned (rgb, normal) strips of shape (height, width, 3)."""
    diff = _load_rgba(_find_scan_file(bark_id, 'Diffuse'), 512, is_color=True)[..., :3]
    nor = _load_rgba(_find_scan_file(bark_id, 'nor_gl'), 512, is_color=False)[..., :3]
    ys = np.linspace(0, 511, height).astype(np.int32)
    xs = np.linspace(0, 255, width).astype(np.int32)
    rgb = diff[ys[:, None], xs[None, :]]
    nrm = nor[ys[:, None], xs[None, :]]
    # Normalize bark luma to ~0.30 so woody stems stay rich warm brown, never crushed black.
    mean_l = float((rgb @ LUMA).mean())
    if mean_l > 0.02:
        gamma = math.log(0.31) / math.log(max(0.03, min(0.95, mean_l)))
        rgb = np.power(np.clip(rgb, 0.0, 1.0), np.clip(gamma, 0.45, 2.2))
    return rgb, nrm


def load_leaf_crops(asset_id, kind, rects, size=1024, rotate_to_upright=False):
    """Load real photographed leaf/frond crops as list of dicts {rgb, alpha, normal}."""
    prefix = f'{kind}_' if kind else ''
    diff = _load_rgba(_find_scan_file(asset_id, f'{prefix}diff'), size, is_color=True)[..., :3]
    alpha = _load_rgba(_find_scan_file(asset_id, f'{prefix}alpha'), size, is_color=False)[..., 0]
    arm = _load_rgba(_find_scan_file(asset_id, f'{prefix}arm'), size, is_color=False)[..., 0]
    nor = _load_rgba(_find_scan_file(asset_id, f'{prefix}nor_gl'), size, is_color=False)[..., :3]
    # Mild baked AO into diffuse for micro-depth without crushing darks.
    shaded = np.clip(diff * np.power(np.clip(arm, 0.15, 1.0), 0.45)[..., None], 0.0, 1.0)
    crops = []
    for y0f, y1f, x0f, x1f in rects:
        y0, y1 = int(round(y0f * size)), int(round(y1f * size))
        x0, x1 = int(round(x0f * size)), int(round(x1f * size))
        sub_rgb = shaded[y0:y1, x0:x1].copy()
        sub_a = alpha[y0:y1, x0:x1].copy()
        sub_n = nor[y0:y1, x0:x1].copy()
        if rotate_to_upright and sub_a.shape[1] > sub_a.shape[0]:
            sub_rgb = np.rot90(sub_rgb, 1)
            sub_a = np.rot90(sub_a, 1)
            sub_n = np.rot90(sub_n, 1)
        # Ensure stem end (fewer opaque pixels) sits at bottom row of crop.
        h = sub_a.shape[0]
        band = max(2, h // 8)
        if sub_a[-band:].mean() > sub_a[:band].mean() * 1.15:
            sub_rgb = np.rot90(sub_rgb, 2)
            sub_a = np.rot90(sub_a, 2)
            sub_n = np.rot90(sub_n, 2)
        crops.append({'rgb': sub_rgb, 'alpha': sub_a, 'normal': sub_n})
    return crops


def _stamp_crop(canvas_rgb, canvas_a, canvas_n, crop, base_xy, axis_xy, width, tint=(1.0, 1.0, 1.0)):
    """Alpha-over a scanned leaf/frond crop with matching tangent-space normal rotation."""
    length = math.hypot(axis_xy[0], axis_xy[1])
    if length < 2.0 or width < 1.5:
        return
    ux, uy = axis_xy[0] / length, axis_xy[1] / length
    sx, sy = -uy, ux
    h_c, w_c = canvas_a.shape
    xs = [base_xy[0] + sx * k * width * 0.5 + ux * m * length for k in (-1, 1) for m in (0, 1)]
    ys = [base_xy[1] + sy * k * width * 0.5 + uy * m * length for k in (-1, 1) for m in (0, 1)]
    x0, x1 = max(0, int(min(xs)) - 1), min(w_c, int(max(xs)) + 2)
    y0, y1 = max(0, int(min(ys)) - 1), min(h_c, int(max(ys)) + 2)
    if x0 >= x1 or y0 >= y1:
        return

    gy, gx = np.mgrid[y0:y1, x0:x1].astype(np.float32) + 0.5
    dx, dy = gx - base_xy[0], gy - base_xy[1]
    t = (dx * ux + dy * uy) / length
    s = (dx * sx + dy * sy) / width + 0.5
    inside = (t >= 0.0) & (t < 1.0) & (s >= 0.0) & (s < 1.0)
    if not inside.any():
        return

    sh, sw = crop['alpha'].shape
    ry = np.clip(((1.0 - t) * sh).astype(np.int32), 0, sh - 1)
    rx = np.clip((s * sw).astype(np.int32), 0, sw - 1)

    src_a = crop['alpha'][ry, rx] * inside.astype(np.float32)
    src_rgb = np.clip(crop['rgb'][ry, rx] * np.asarray(tint, dtype=np.float32), 0.0, 1.0)

    # Rotate tangent-space normal XY to match stamped orientation (up = (0, -1) in image coords).
    ang = math.atan2(ux, -uy)
    ca, sa = math.cos(ang), math.sin(ang)
    sn = crop['normal'][ry, rx] * 2.0 - 1.0
    nx = sn[..., 0] * ca - sn[..., 1] * sa
    ny = sn[..., 0] * sa + sn[..., 1] * ca
    src_n = np.stack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, np.clip(sn[..., 2] * 0.5 + 0.5, 0.5, 1.0)], axis=-1)

    dst_a = canvas_a[y0:y1, x0:x1]
    out_a = src_a + dst_a * (1.0 - src_a)
    inv = 1.0 / np.maximum(out_a, 1e-5)
    canvas_rgb[y0:y1, x0:x1] = (src_rgb * src_a[..., None] + canvas_rgb[y0:y1, x0:x1] * (dst_a * (1.0 - src_a))[..., None]) * inv[..., None]
    canvas_n[y0:y1, x0:x1] = src_n * src_a[..., None] + canvas_n[y0:y1, x0:x1] * (1.0 - src_a[..., None])
    canvas_a[y0:y1, x0:x1] = out_a


def _draw_twig(canvas_rgb, canvas_a, canvas_n, p0, p1, w0, w1, rgb):
    """Draw a tapered opaque woody twig segment with cylindrical normal shading."""
    x0, y0 = p0
    x1, y1 = p1
    dx, dy = x1 - x0, y1 - y0
    length = math.hypot(dx, dy)
    if length < 1.0:
        return
    ux, uy = dx / length, dy / length
    sx, sy = -uy, ux
    pad = max(w0, w1) + 2.0
    h_c, w_c = canvas_a.shape
    bx0 = max(0, int(min(x0, x1) - pad))
    bx1 = min(w_c, int(max(x0, x1) + pad) + 1)
    by0 = max(0, int(min(y0, y1) - pad))
    by1 = min(h_c, int(max(y0, y1) + pad) + 1)
    if bx0 >= bx1 or by0 >= by1:
        return
    gy, gx = np.mgrid[by0:by1, bx0:bx1].astype(np.float32) + 0.5
    px, py = gx - x0, gy - y0
    t = (px * ux + py * uy) / length
    d = px * sx + py * sy
    rad = np.maximum(0.6, w0 + (w1 - w0) * np.clip(t, 0.0, 1.0))
    inside = (t >= -0.02) & (t <= 1.02) & (np.abs(d) <= rad)
    if not inside.any():
        return
    frac = np.clip(d / rad, -1.0, 1.0)
    nz = np.sqrt(np.maximum(0.05, 1.0 - frac * frac))
    shade = 0.78 + 0.28 * nz
    canvas_rgb[by0:by1, bx0:bx1][inside] = np.clip(np.asarray(rgb, dtype=np.float32) * shade[inside, None], 0.0, 1.0)
    canvas_a[by0:by1, bx0:bx1][inside] = 1.0
    n_x = (frac * sx) * 0.45 + 0.5
    n_y = (-frac * sy) * 0.45 + 0.5
    n_z = nz * 0.5 + 0.5
    canvas_n[by0:by1, bx0:bx1][inside] = np.stack([n_x[inside], n_y[inside], n_z[inside]], axis=-1)


def _stamp_blossom(canvas_rgb, canvas_a, canvas_n, cx, cy, radius, rgb, petals=5, center_rgb=(0.92, 0.78, 0.22)):
    """Stamp a compact crisp botanical blossom or berry cluster on top of foliage."""
    h_c, w_c = canvas_a.shape
    bx0, bx1 = max(0, int(cx - radius - 2)), min(w_c, int(cx + radius + 3))
    by0, by1 = max(0, int(cy - radius - 2)), min(h_c, int(cy + radius + 3))
    if bx0 >= bx1 or by0 >= by1:
        return
    gy, gx = np.mgrid[by0:by1, bx0:bx1].astype(np.float32) + 0.5
    dx, dy = gx - cx, gy - cy
    dist = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)
    lobe = 1.0 if petals <= 1 else (0.72 + 0.28 * np.cos(ang * petals))
    inside = dist <= radius * lobe
    if not inside.any():
        return
    rn = np.clip(dist / max(radius, 1.0), 0.0, 1.0)
    nz = np.sqrt(np.maximum(0.1, 1.0 - rn * rn * 0.85))
    col = np.asarray(rgb, dtype=np.float32) * (0.76 + 0.34 * nz)[..., None]
    if petals > 1:
        core = dist < radius * 0.28
        col[core] = np.asarray(center_rgb, dtype=np.float32)
    canvas_rgb[by0:by1, bx0:bx1][inside] = np.clip(col[inside], 0.0, 1.0)
    canvas_a[by0:by1, bx0:bx1][inside] = 1.0
    canvas_n[by0:by1, bx0:bx1][inside] = np.stack([
        np.clip((dx[inside] / max(radius, 1.0)) * 0.35 + 0.5, 0.0, 1.0),
        np.clip((-dy[inside] / max(radius, 1.0)) * 0.35 + 0.5, 0.0, 1.0),
        np.clip(nz[inside] * 0.5 + 0.5, 0.5, 1.0),
    ], axis=-1)


def _dilate_rgb_border(rgb, alpha, steps=8):
    """Bleed opaque edge colors outward into transparent texels so mips never fringe black."""
    out = rgb.copy()
    mask = alpha > 0.35
    for _ in range(steps):
        grown = mask.copy()
        acc = np.zeros_like(out)
        cnt = np.zeros(alpha.shape, dtype=np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            m = np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
            acc += np.roll(np.roll(out, dy, axis=0), dx, axis=1) * m[..., None]
            cnt += m.astype(np.float32)
            grown |= m
        fill = (~mask) & (cnt > 0)
        out[fill] = acc[fill] / cnt[fill, None]
        mask = grown
    return out


def _compose_leafy_spray(
    canvas_rgb,
    canvas_a,
    canvas_n,
    box,
    crops,
    rng,
    twig_rgb,
    count=22,
    leaf_scale=1.0,
    width_ratio=1.0,
    spread_deg=56.0,
    blossoms=None,
    tints=None,
):
    """Compose a natural multi-forked leafy shrub spray inside pixel box (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    cx = (x0 + x1) * 0.5
    base = (cx, y1 - h * 0.02)
    mid = (cx + rng.uniform(-0.04, 0.04) * w, y1 - h * 0.42)
    top = (cx + rng.uniform(-0.06, 0.06) * w, y0 + h * 0.14)
    left_fork = (x0 + w * rng.uniform(0.18, 0.28), y1 - h * rng.uniform(0.56, 0.68))
    right_fork = (x1 - w * rng.uniform(0.18, 0.28), y1 - h * rng.uniform(0.58, 0.72))
    low_left = (x0 + w * rng.uniform(0.22, 0.30), y1 - h * rng.uniform(0.32, 0.42))
    low_right = (x1 - w * rng.uniform(0.22, 0.30), y1 - h * rng.uniform(0.34, 0.44))

    branches = (
        (base, mid, w * 0.018, w * 0.011),
        (mid, top, w * 0.011, w * 0.005),
        (mid, left_fork, w * 0.009, w * 0.004),
        (mid, right_fork, w * 0.009, w * 0.004),
        (((base[0] + mid[0]) * 0.5, (base[1] + mid[1]) * 0.5), low_left, w * 0.009, w * 0.004),
        (((base[0] + mid[0]) * 0.5, (base[1] + mid[1]) * 0.5), low_right, w * 0.009, w * 0.004),
    )
    for p0, p1, w0, w1 in branches:
        _draw_twig(canvas_rgb, canvas_a, canvas_n, p0, p1, w0, w1, twig_rgb)

    # Stamp leaves back-to-front along every branch and lateral fork for lush overlapping density.
    anchors = []
    for b_idx, (p0, p1, _, _) in enumerate(branches):
        n_here = max(2, count // len(branches) + (2 if b_idx < 2 else 1))
        for k in range(n_here):
            t = 0.22 + 0.78 * (k / max(1, n_here - 1))
            px = p0[0] + (p1[0] - p0[0]) * t
            py = p0[1] + (p1[1] - p0[1]) * t
            dx, dy = p1[0] - p0[0], p1[1] - p0[1]
            ang_b = math.atan2(dx, -dy)
            side = -1.0 if (k + b_idx) % 2 == 0 else 1.0
            off = math.radians(rng.uniform(spread_deg * 0.45, spread_deg)) * side if k < n_here - 1 else rng.uniform(-0.22, 0.22)
            ang = ang_b + off
            length = h * 0.22 * leaf_scale * rng.uniform(0.74, 1.18) * (1.0 - 0.22 * t)
            anchors.append((px, py, ang, length))

    rng.shuffle(anchors)
    for px, py, ang, length in anchors:
        crop = crops[rng.randrange(len(crops))]
        aspect = crop['alpha'].shape[1] / max(1, crop['alpha'].shape[0])
        lw = length * aspect * width_ratio
        tint = tints[rng.randrange(len(tints))] if tints else (
            rng.uniform(0.90, 1.10), rng.uniform(0.92, 1.08), rng.uniform(0.88, 1.06),
        )
        _stamp_crop(canvas_rgb, canvas_a, canvas_n, crop, (px, py), (math.sin(ang) * length, -math.cos(ang) * length), lw, tint=tint)

    if blossoms:
        col, radius_frac, n_blooms, petals = blossoms
        for _ in range(n_blooms):
            px, py, ang, length = anchors[rng.randrange(len(anchors))]
            bx = px + math.sin(ang) * length * 0.55
            by = py - math.cos(ang) * length * 0.55
            _stamp_blossom(canvas_rgb, canvas_a, canvas_n, bx, by, w * radius_frac * rng.uniform(0.8, 1.25), col, petals=petals)


def _compose_conifer_spray(canvas_rgb, canvas_a, canvas_n, box, crops, rng, twig_rgb, berries=None):
    """Compose a dense layered conifer needle spray from real Poly Haven fir/pine branch scans."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    cx = (x0 + x1) * 0.5
    base = (cx, y1 - h * 0.03)
    top = (cx + rng.uniform(-0.05, 0.05) * w, y0 + h * 0.16)
    _draw_twig(canvas_rgb, canvas_a, canvas_n, base, top, w * 0.016, w * 0.005, twig_rgb)

    placements = (
        (0.28, -0.58, 0.50),
        (0.32, 0.56, 0.48),
        (0.52, -0.44, 0.46),
        (0.56, 0.42, 0.44),
        (0.74, -0.26, 0.38),
        (0.76, 0.24, 0.38),
        (0.88, rng.uniform(-0.08, 0.08), 0.34),
    )
    for t, ang, l_frac in placements:
        px = base[0] + (top[0] - base[0]) * t
        py = base[1] + (top[1] - base[1]) * t
        crop = crops[rng.randrange(len(crops))]
        length = h * l_frac * rng.uniform(0.90, 1.12)
        aspect = crop['alpha'].shape[1] / max(1, crop['alpha'].shape[0])
        _stamp_crop(
            canvas_rgb, canvas_a, canvas_n, crop,
            (px, py), (math.sin(ang) * length, -math.cos(ang) * length),
            length * aspect * 0.92,
            tint=(rng.uniform(0.92, 1.08), rng.uniform(0.94, 1.08), rng.uniform(0.92, 1.08)),
        )
    if berries:
        col, radius_frac, n_berries = berries
        for _ in range(n_berries):
            bx = rng.uniform(x0 + w * 0.22, x1 - w * 0.22)
            by = rng.uniform(y0 + h * 0.20, y1 - h * 0.28)
            if canvas_a[int(by), int(bx)] > 0.5:
                _stamp_blossom(canvas_rgb, canvas_a, canvas_n, bx, by, w * radius_frac, col, petals=1)


def _compose_palm_frond(canvas_rgb, canvas_a, canvas_n, box, rng, leaf_rgb, midrib_rgb):
    """Crisp arched tropical feather-palm frond with slender ribbed leaflets and real normal relief."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    cx = (x0 + x1) * 0.5
    base = (cx, y1 - h * 0.02)
    top = (cx + rng.uniform(-0.03, 0.03) * w, y0 + h * 0.04)
    _draw_twig(canvas_rgb, canvas_a, canvas_n, base, top, w * 0.016, w * 0.004, midrib_rgb)

    pairs = 20
    for i in range(pairs):
        t = 0.08 + 0.88 * (i / max(1, pairs - 1))
        px = base[0] + (top[0] - base[0]) * t
        py = base[1] + (top[1] - base[1]) * t
        env = math.sin(min(1.0, t * 1.12) * math.pi * 0.94) * (1.0 - 0.16 * t)
        l_len = w * 0.46 * max(0.20, env) * rng.uniform(0.92, 1.08)
        for side in (-1.0, 1.0):
            ang = side * (1.08 - 0.52 * t + rng.uniform(-0.05, 0.05))
            ex = px + math.sin(ang) * l_len
            ey = py - math.cos(ang) * l_len
            shade = 0.84 + 0.28 * t + rng.uniform(-0.05, 0.05)
            col = tuple(min(1.0, c * shade) for c in leaf_rgb)
            _draw_twig(canvas_rgb, canvas_a, canvas_n, (px, py), (ex, ey), w * 0.028 * (0.72 + 0.4 * env), w * 0.005, col)


def write_exact_png(name, pixels, path, non_color=False):
    """Save float32 RGBA image without extra gamma lift, preserving normalized sRGB values."""
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    h, w, _ = pixels.shape
    out = np.clip(pixels.astype(np.float32), 0.0, 1.0)
    image = bpy.data.images.new(name, w, h, alpha=True, is_data=non_color)
    image.pixels.foreach_set(np.flipud(out).ravel())
    image.filepath_raw = path
    image.file_format = 'PNG'
    image.save()
    if non_color:
        image.colorspace_settings.name = 'Non-Color'
    return image


def build_scanned_shrub_material(
    tex_dir,
    mat_name,
    filename,
    seed,
    bark_id='japanese_zelkova_bark',
    leaf_source='shrub_04',
    style='leafy',
    roughness=0.72,
    blossoms=None,
    leaf_scale=1.0,
    width_ratio=1.0,
    leaf_count=24,
    leaf_tint=(1.0, 1.0, 1.0),
    target_luma=0.41,
):
    """Build a 1024x1024 PBR scanned bark+foliage cutout material (1 draw call, metallic=0)."""
    rng = np.random.default_rng(seed)
    py_rng = __import__('random').Random(seed)
    size = 1024
    canvas_rgb = np.zeros((size, size, 3), dtype=np.float32)
    canvas_a = np.zeros((size, size), dtype=np.float32)
    canvas_n = np.broadcast_to(np.array([0.5, 0.5, 1.0], dtype=np.float32), (size, size, 3)).copy()

    bark_w = int(size * 0.23)
    bark_rgb, bark_nrm = load_bark_scan(bark_id, width=bark_w, height=size)
    canvas_rgb[:, :bark_w] = bark_rgb
    canvas_a[:, :bark_w] = 1.0
    canvas_n[:, :bark_w] = bark_nrm
    twig_rgb = tuple(float(v) for v in bark_rgb.mean(axis=(0, 1)))

    # Two distinct spray cells (Spray A: u=[0.25..0.62], Spray B: u=[0.63..1.00])
    box_a = (int(size * 0.25), int(size * 0.03), int(size * 0.62), int(size * 0.98))
    box_b = (int(size * 0.63), int(size * 0.03), int(size * 0.99), int(size * 0.98))

    if style == 'conifer':
        crops = load_leaf_crops('fir_tree_01', 'twig', FIR_SPRAYS, size=1024)
        for box in (box_a, box_b):
            _compose_conifer_spray(canvas_rgb, canvas_a, canvas_n, box, crops, py_rng, twig_rgb, berries=blossoms)
    elif style == 'palm':
        for box in (box_a, box_b):
            _compose_palm_frond(canvas_rgb, canvas_a, canvas_n, box, py_rng, (0.24, 0.44, 0.16), (0.34, 0.46, 0.19))
    else:
        if leaf_source == 'shrub_04':
            crops = load_leaf_crops('shrub_04', '', SHRUB04_LEAVES, size=1024)
        elif leaf_source == 'island':
            crops = load_leaf_crops('island_tree_02', 'leaves', ISLAND_LEAVES, size=1024)
        elif leaf_source == 'didelta':
            crops = load_leaf_crops('didelta_spinosa', '', DIDELTA_LEAVES, size=1024, rotate_to_upright=True)
        elif leaf_source == 'jacaranda':
            crops = load_leaf_crops('jacaranda_tree', 'leaves', JACARANDA_FRONDS, size=1024, rotate_to_upright=True)
        elif leaf_source == 'scrub_mixed':
            crops = (
                load_leaf_crops('jacaranda_tree', 'leaves', JACARANDA_FRONDS, size=1024, rotate_to_upright=True)
                + load_leaf_crops('shrub_04', '', SHRUB04_LEAVES[:4], size=1024)
            )
        else:
            crops = load_leaf_crops('shrub_04', '', SHRUB04_LEAVES, size=1024) + load_leaf_crops('island_tree_02', 'leaves', ISLAND_LEAVES, size=1024)
        tints = [
            (leaf_tint[0] * 0.92, leaf_tint[1] * 0.95, leaf_tint[2] * 0.92),
            leaf_tint,
            (min(1.0, leaf_tint[0] * 1.08), min(1.0, leaf_tint[1] * 1.06), min(1.0, leaf_tint[2] * 1.02)),
        ]
        _compose_leafy_spray(
            canvas_rgb, canvas_a, canvas_n, box_a, crops, py_rng, twig_rgb,
            count=leaf_count, leaf_scale=leaf_scale, width_ratio=width_ratio, blossoms=blossoms, tints=tints,
        )
        _compose_leafy_spray(
            canvas_rgb, canvas_a, canvas_n, box_b, crops, py_rng, twig_rgb,
            count=max(12, int(leaf_count * 0.85)), leaf_scale=leaf_scale * 0.94, width_ratio=width_ratio,
            blossoms=blossoms, tints=tints,
        )

    # Normalize foliage region luma so the runtime understory ramp gets full light/dark dynamic range.
    foliage_mask = (np.arange(size)[None, :] >= bark_w) & (canvas_a > 0.5)
    if foliage_mask.any():
        cur_luma = float((canvas_rgb[foliage_mask] @ LUMA).mean())
        if cur_luma > 0.02:
            gamma = math.log(target_luma) / math.log(max(0.03, min(0.96, cur_luma)))
            gamma = float(np.clip(gamma, 0.45, 2.2))
            canvas_rgb[:, bark_w:] = np.power(np.clip(canvas_rgb[:, bark_w:], 0.0, 1.0), gamma)

    # Clear strict border on spray cells so UVs never clip opaque pixels at tile borders.
    for x0, y0, x1, y1 in (box_a, box_b):
        canvas_a[y0:y1, x0:x0 + 3] = 0.0
        canvas_a[y0:y1, x1 - 3:x1] = 0.0
        canvas_a[y0:y0 + 3, x0:x1] = 0.0

    # Sharpen alpha around cutoff for clean 512px runtime mips + dilate RGB into empty pixels.
    canvas_a[:, bark_w:] = np.clip((canvas_a[:, bark_w:] - 0.5) * 4.0 + 0.5, 0.0, 1.0)
    canvas_rgb = _dilate_rgb_border(canvas_rgb, canvas_a, steps=10)
    rgba = np.dstack([canvas_rgb, canvas_a])
    nrm_rgba = np.dstack([np.clip(canvas_n, 0.0, 1.0), np.ones((size, size), dtype=np.float32)])

    alb_img = write_exact_png(f'{mat_name}_alb', rgba, os.path.join(tex_dir, f'{filename}-alb.png'), non_color=False)
    nrm_img = write_exact_png(f'{mat_name}_nrm', nrm_rgba, os.path.join(tex_dir, f'{filename}-nrm.png'), non_color=True)

    mat = bpy.data.materials.new(mat_name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = float(roughness)

    tex_alb = nt.nodes.new('ShaderNodeTexImage')
    tex_alb.image = alb_img
    nt.links.new(tex_alb.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(tex_alb.outputs['Alpha'], bsdf.inputs['Alpha'])

    tex_nrm = nt.nodes.new('ShaderNodeTexImage')
    tex_nrm.image = nrm_img
    nrm_node = nt.nodes.new('ShaderNodeNormalMap')
    nrm_node.inputs['Strength'].default_value = 1.0
    nt.links.new(tex_nrm.outputs['Color'], nrm_node.inputs['Color'])
    nt.links.new(nrm_node.outputs['Normal'], bsdf.inputs['Normal'])
    return mat
