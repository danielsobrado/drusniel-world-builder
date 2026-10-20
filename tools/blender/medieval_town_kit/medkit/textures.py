"""Write the shared tileable textures to PNG and load them as Blender images."""
import os

import bpy
import numpy as np

from . import scans
from .texture_patterns import PATTERNS, fbm, lerp, normal_from_height, smooth, tint
from .texture_patterns_extra import EXTRA_PATTERNS
from .texture_patterns_weathered import WEATHERED_PATTERNS


def _blur_periodic(field, radius):
    """Fast tileable box/tent blur over a 2D float array."""
    out = field.astype(np.float32)
    for shift in range(1, radius + 1):
        w = (radius + 1 - shift) / (radius + 1)
        out = (
            out
            + w * (np.roll(field, shift, 0) + np.roll(field, -shift, 0)
                   + np.roll(field, shift, 1) + np.roll(field, -shift, 1))
        ) / (1.0 + 4.0 * w)
    return out


def _bake_scan_relief(name, albedo, normal, seed):
    """Bake normal-derived cavity AO, overlap shadows, chiselled edge highlights,
    and multi-scale weathering/patina into scanned PBR textures so roofs and
    exteriors have deep, crisp relief in both Blender renders and the runtime."""
    n = albedo.shape[0]
    nx = normal[..., 0] * 2.0 - 1.0
    ny = normal[..., 1] * 2.0 - 1.0
    nz = np.clip(normal[..., 2] * 2.0 - 1.0, 0.05, 1.0)

    # Tangent-space divergence: > 0 on convex ridges/lips, < 0 in concave joints/grooves
    dnx = (np.roll(nx, -1, axis=1) - np.roll(nx, 1, axis=1)) * 0.5
    dny = (np.roll(ny, -1, axis=0) - np.roll(ny, 1, axis=0)) * 0.5
    curv = dnx + dny

    tilt = smooth(0.015, 0.26, 1.0 - nz)
    valley = smooth(0.0, 0.16, -curv)
    under_lap = smooth(0.02, 0.28, -ny)
    raw_cavity = np.clip(0.45 * tilt + 0.35 * valley + 0.45 * under_lap, 0.0, 1.0)
    cavity = 0.55 * raw_cavity + 0.30 * _blur_periodic(raw_cavity, 2) + 0.15 * _blur_periodic(raw_cavity, 5)
    edge_hi = smooth(0.015, 0.18, curv) * smooth(-0.08, 0.24, ny)

    fine = fbm(n, seed + 11, 1.25)
    big = fbm(n, seed + 23, 2.5)
    streak = fbm(n, seed + 37, 1.8, sy=9.0)

    # Config per scan type: (ao_strength, hi_strength, normal_boost)
    cfg = {
        'roof': (0.58, 0.20, 1.65),
        'terracotta': (0.54, 0.18, 1.50),
        'thatch': (0.50, 0.15, 1.45),
        'stone': (0.54, 0.18, 1.45),
        'ashlar': (0.50, 0.16, 1.40),
        'clapboard': (0.58, 0.18, 1.55),
        'planks': (0.50, 0.15, 1.40),
        'plaster': (0.35, 0.10, 1.35),
        'cobble': (0.52, 0.16, 1.40),
    }
    ao_str, hi_str, n_boost = cfg.get(name, (0.45, 0.14, 1.35))

    col = albedo.astype(np.float32)

    if name == 'roof':
        # Enrich slate with blue-charcoal to weathered plum-grey variation & crevice moss
        slate_tint = lerp((0.88, 0.93, 1.04), (1.05, 0.96, 0.92), big)
        col = col * slate_tint * (0.90 + 0.20 * fine)[..., None]
        moss = smooth(0.56, 0.80, big) * smooth(0.18, 0.55, cavity) * 0.55
        col = lerp(col, (0.25, 0.31, 0.14), moss)
    elif name == 'terracotta':
        # Sun-baked kilned clay warmth & trough patina
        clay_var = lerp((1.06, 0.92, 0.84), (0.94, 1.02, 0.96), big)
        col = col * clay_var * (0.90 + 0.18 * fine)[..., None]
        lichen = smooth(0.60, 0.84, big) * smooth(0.22, 0.60, cavity) * 0.42
        col = lerp(col, (0.30, 0.29, 0.18), lichen)
    elif name in ('stone', 'ashlar'):
        # Warm Cotswold/hold limestone grade & mortar moss
        warm = lerp((1.04, 0.99, 0.91), (0.95, 0.98, 1.02), big)
        col = col * warm * (0.92 + 0.16 * fine)[..., None]
        moss = smooth(0.60, 0.82, big) * smooth(0.25, 0.65, cavity) * 0.45
        col = lerp(col, (0.24, 0.30, 0.13), moss)
    elif name in ('clapboard', 'planks'):
        # Warm seasoned oak/pine amber heartwood richness & deep lap-board shadow
        grain = fbm(n, seed + 51, 1.5, sx=16.0, sy=1.6)
        warm_wood = lerp((1.08, 0.88, 0.70), (1.18, 0.98, 0.80), grain)
        col = col * warm_wood * (0.88 + 0.22 * fine)[..., None]
    elif name == 'plaster':
        # Hand-troweled limewash plaster waves, hairline crazing, and warm cream patina
        trowel = 0.5 * fbm(n, seed + 61, 1.9, sx=2.5, sy=2.5) + 0.5 * fine
        crazing = smooth(0.88, 0.95, fbm(n, seed + 71, 1.05))
        trowel_n = normal_from_height((0.65 * trowel - 0.35 * crazing).astype(np.float32), 0.95)
        nx = nx + (trowel_n[..., 0] * 2.0 - 1.0) * 0.55
        ny = ny + (trowel_n[..., 1] * 2.0 - 1.0) * 0.55
        col = tint(col, (0.94 + 0.10 * trowel) * (1.0 - 0.14 * smooth(0.45, 0.92, big)) * (1.0 - 0.20 * crazing))

    # Apply baked cavity AO, vertical rain streaks, and convex arris highlights
    shade = (1.0 - ao_str * cavity) * (1.0 - 0.10 * smooth(0.55, 0.90, streak)) + hi_str * edge_hi
    col = np.clip(col * shade[..., None], 0.0, 1.0)

    # Boost normal relief and re-normalize
    bnx = nx * n_boost
    bny = ny * n_boost
    bnz = nz
    norm_len = np.sqrt(bnx * bnx + bny * bny + bnz * bnz + 1e-9)
    boosted_normal = np.stack([bnx / norm_len, bny / norm_len, bnz / norm_len], axis=-1) * 0.5 + 0.5
    return col.astype(np.float32), np.clip(boosted_normal, 0.0, 1.0).astype(np.float32)


def _bake_procedural_relief(albedo, height, strength):
    """Bake subtle height-derived cavity AO and ridge polish into procedural albedos."""
    normal = normal_from_height(height.astype(np.float32), strength)
    nx = normal[..., 0] * 2.0 - 1.0
    ny = normal[..., 1] * 2.0 - 1.0
    dnx = (np.roll(nx, -1, axis=1) - np.roll(nx, 1, axis=1)) * 0.5
    dny = (np.roll(ny, -1, axis=0) - np.roll(ny, 1, axis=0)) * 0.5
    curv = dnx + dny
    cavity = smooth(0.0, 0.18, -curv)
    ridge = smooth(0.01, 0.18, curv)
    shade = 1.0 - 0.22 * cavity + 0.10 * ridge
    return np.clip(albedo * shade[..., None], 0.0, 1.0).astype(np.float32), normal


def _save(name, rgb, path, non_color):
    n = rgb.shape[0]
    img = bpy.data.images.new(name, n, n, alpha=False)
    img.colorspace_settings.name = 'Non-Color' if non_color else 'sRGB'
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones((n, n, 1), np.float32)], axis=2)
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img


def generate(out_dir, seed=7):
    """Returns {pattern: (albedo_image, normal_image)}. A scanned surface (scans.py)
    replaces the procedural pattern of the same name when its files are present;
    'clapboard' falls back to the plank pattern."""
    os.makedirs(out_dir, exist_ok=True)
    patterns = {**PATTERNS, **EXTRA_PATTERNS, **WEATHERED_PATTERNS}
    patterns.setdefault('clapboard', patterns['planks'])
    images = {}
    for i, (name, (fn, size)) in enumerate(patterns.items()):
        p_seed = seed + i * 101
        scanned = scans.load(name)
        if scanned:
            albedo, normal = _bake_scan_relief(name, scanned[0], scanned[1], p_seed)
        else:
            raw_albedo, height, strength = fn(size, p_seed)
            albedo, normal = _bake_procedural_relief(raw_albedo, height, strength)
        images[name] = (
            _save(f'T_{name}_albedo', albedo, os.path.join(out_dir, f'{name}_albedo.png'), False),
            _save(f'T_{name}_normal', normal, os.path.join(out_dir, f'{name}_normal.png'), True),
        )
        print(f'[kit] texture {name} {albedo.shape[0]}px {"scan+baked" if scanned else "procedural+baked"}')
    return images
