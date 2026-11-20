"""Build high-detail tileable 1024x1024 PBR dressed-stone textures from CC0 noise library.

Reads tileable greyscale maps from assets/source-library/noise/ and writes:
  - public/assets/textures/locations/dressed-stone-color.webp
  - public/assets/textures/locations/dressed-stone-normal.webp
  - public/assets/textures/locations/dressed-stone-rough.webp
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
NOISE_ROOT = os.path.join(ROOT, 'assets', 'source-library', 'noise')
OUT_DIR = os.path.join(ROOT, 'public', 'assets', 'textures', 'locations')
SIZE = 1024


def load_tile(rel_path, repeats=1):
    path = os.path.join(NOISE_ROOT, rel_path)
    img = Image.open(path).convert('L')
    tile_sz = SIZE // repeats
    if img.size != (tile_sz, tile_sz):
        img = img.resize((tile_sz, tile_sz), Image.Resampling.BICUBIC)
    arr = np.asarray(img, dtype=np.float32) / 255.0
    # Guarantee 100% seamless periodic borders via raised-cosine edge blend with half-shifted copy
    t = np.linspace(0.0, 1.0, tile_sz, endpoint=False, dtype=np.float32)
    wx = 0.5 - 0.5 * np.cos(t * 2.0 * np.pi)
    w = wx[None, :] * wx[:, None]
    shifted = np.roll(np.roll(arr, tile_sz // 2, axis=0), tile_sz // 2, axis=1)
    arr = arr * w + shifted * (1.0 - w)
    if repeats > 1:
        arr = np.tile(arr, (repeats, repeats))
    return arr


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / max(edge1 - edge0, 1e-6), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def build():
    os.makedirs(OUT_DIR, exist_ok=True)

    # Tileable CC0 noise layers at multiple frequencies
    macro_perlin = load_tile('perlin/perlin-01.png', repeats=1)
    mid_vein = load_tile('vein/vein-02.png', repeats=2)
    fine_grain = load_tile('grainy/grainy-01.png', repeats=2)
    micro_grain = load_tile('grainy/grainy-05.png', repeats=4)
    cracks_raw = load_tile('cracks/cracks-02.png', repeats=2)
    streak = load_tile('streak/streak-03.png', repeats=2)
    pits_raw = load_tile('voronoi/voronoi-03.png', repeats=4)

    # Hairline stone cracks (dark lines where cracks_raw is low)
    crack_mask = 1.0 - smoothstep(0.06, 0.24, cracks_raw)
    # Pitted micro-pores (small recessed granite cavities)
    pore_mask = 1.0 - smoothstep(0.02, 0.14, pits_raw)

    # Subtle diagonal/horizontal hand-chisel mason's tooling grooves (100% periodic)
    ys, xs = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
    u = xs / SIZE
    v = ys / SIZE
    chisel_wave = 0.5 + 0.5 * np.sin((v * 64.0 + u * 6.0 + macro_perlin * 1.4) * (2.0 * np.pi))
    chisel_fine = 0.5 + 0.5 * np.sin((v * 128.0 - u * 12.0 + mid_vein * 1.2) * (2.0 * np.pi))
    chisel = 0.65 * chisel_wave + 0.35 * chisel_fine

    # Rich carved dwarven granite albedo: warm/cool quarry beds + mineral veining + quartz/mica speckle + cracks
    cool_stone = np.array([0.48, 0.49, 0.52], dtype=np.float32)
    warm_stone = np.array([0.64, 0.60, 0.54], dtype=np.float32)
    vein_dark = np.array([0.33, 0.32, 0.31], dtype=np.float32)
    crack_col = np.array([0.16, 0.15, 0.14], dtype=np.float32)

    tone_mix = smoothstep(0.22, 0.78, macro_perlin * 0.7 + streak * 0.3)
    albedo = cool_stone[None, None, :] * (1.0 - tone_mix[..., None]) + warm_stone[None, None, :] * tone_mix[..., None]

    # Mineral vein banding
    vein_factor = smoothstep(0.35, 0.78, mid_vein) * 0.28
    albedo = albedo * (1.0 - vein_factor[..., None]) + vein_dark[None, None, :] * vein_factor[..., None]

    # Crystalline granite mica (dark) & quartz (pale) speckles
    dark_mica = smoothstep(0.68, 0.88, fine_grain) * 0.32 + smoothstep(0.72, 0.92, micro_grain) * 0.24
    pale_quartz = smoothstep(0.74, 0.92, 1.0 - fine_grain) * 0.20 + smoothstep(0.76, 0.94, 1.0 - micro_grain) * 0.16
    albedo = albedo * (1.0 - dark_mica[..., None]) + pale_quartz[..., None] * np.array([0.78, 0.76, 0.72], dtype=np.float32)

    # Subtle chisel tooling highlights & grime in pores/cracks
    albedo *= (0.93 + 0.12 * chisel[..., None])
    albedo *= (1.0 - 0.12 * (1.0 - streak[..., None]))
    albedo = albedo * (1.0 - pore_mask[..., None] * 0.42) + crack_col[None, None, :] * (pore_mask[..., None] * 0.42)
    albedo = albedo * (1.0 - crack_mask[..., None] * 0.72) + crack_col[None, None, :] * (crack_mask[..., None] * 0.72)
    albedo = np.clip(albedo, 0.04, 0.96)

    # Combined heightfield for crisp tangent-space normal map
    height = (
        0.24 * macro_perlin
        + 0.20 * mid_vein
        + 0.22 * fine_grain
        + 0.14 * micro_grain
        + 0.14 * chisel
        - 0.32 * pore_mask
        - 0.55 * crack_mask
    )
    # Periodic central-difference gradient so normal map tiles with zero seam
    gx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 4.8
    gy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 4.8
    nx = -gx
    ny = gy
    nz = np.ones_like(height)
    inv_len = 1.0 / np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack([
        (nx * inv_len) * 0.5 + 0.5,
        (ny * inv_len) * 0.5 + 0.5,
        (nz * inv_len) * 0.5 + 0.5,
    ], axis=2)

    # Roughness map (G channel read by StoneSurface.js; R=AO, G=Roughness, B=0)
    ao = np.clip(1.0 - crack_mask * 0.55 - pore_mask * 0.35 - (1.0 - chisel) * 0.08, 0.35, 1.0)
    rough = np.clip(
        0.74
        + (0.5 - macro_perlin) * 0.14
        + (0.5 - chisel) * 0.10
        - pale_quartz * 0.36
        + pore_mask * 0.18
        + crack_mask * 0.22,
        0.48,
        0.96,
    )
    orm = np.stack([ao, rough, np.zeros_like(rough)], axis=2)

    Image.fromarray((albedo * 255).astype(np.uint8), 'RGB').save(
        os.path.join(OUT_DIR, 'dressed-stone-color.webp'), 'WEBP', quality=90
    )
    Image.fromarray((np.clip(normal, 0, 1) * 255).astype(np.uint8), 'RGB').save(
        os.path.join(OUT_DIR, 'dressed-stone-normal.webp'), 'WEBP', quality=92
    )
    Image.fromarray((orm * 255).astype(np.uint8), 'RGB').save(
        os.path.join(OUT_DIR, 'dressed-stone-rough.webp'), 'WEBP', quality=90
    )
    print('Wrote 1024x1024 dressed-stone-{color,normal,rough}.webp')


if __name__ == '__main__':
    build()
