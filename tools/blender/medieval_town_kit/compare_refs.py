"""Compare town renders with the art references: palette metrics and a contact sheet.

    blender -b --factory-startup --python tools/blender/medieval_town_kit/compare_refs.py -- SHEET.png REF IMG [IMG ...]

Prints, per image, the value spread (p5/p50/p95 of HSV value), saturation (mean/p95), hue spread
(circular std of hue weighted by saturation) and local contrast (mean absolute difference to a
blurred copy), and each render's distance to REF on those numbers. Writes SHEET.png with every
image scaled to one row height, REF first. "Closer to the reference" is then a number, not a mood.
"""
import json
import sys

import bpy
import numpy as np

ROW_H = 360


def _load(path):
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'sRGB'
    w, h = img.size
    px = np.array(img.pixels[:], np.float32).reshape(h, w, 4)[::-1, :, :3]
    bpy.data.images.remove(img)
    # 8-bit images come back as their stored display values, which is what the metrics want.
    return px.copy()


def _hsv(rgb):
    mx, mn = rgb.max(-1), rgb.min(-1)
    delta = mx - mn
    sat = np.where(mx > 1e-6, delta / np.maximum(mx, 1e-6), 0.0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    safe = np.maximum(delta, 1e-6)
    hue = np.where(mx == r, (g - b) / safe % 6, np.where(mx == g, (b - r) / safe + 2, (r - g) / safe + 4)) / 6
    return hue, sat, mx


def _blur(v, k=9):
    out = v.copy()
    for axis in (0, 1):
        acc = np.zeros_like(out)
        for d in range(-k, k + 1):
            acc += np.roll(out, d, axis=axis)
        out = acc / (2 * k + 1)
    return out


def metrics(rgb):
    hue, sat, val = _hsv(rgb)
    weight = sat.ravel()
    ang = hue.ravel() * 2 * np.pi
    c, s = np.average(np.cos(ang), weights=weight + 1e-6), np.average(np.sin(ang), weights=weight + 1e-6)
    spread = float(np.sqrt(-2 * np.log(max(np.hypot(c, s), 1e-6))))
    return {
        'value_p5': float(np.percentile(val, 5)), 'value_p50': float(np.percentile(val, 50)),
        'value_p95': float(np.percentile(val, 95)), 'sat_mean': float(sat.mean()),
        'sat_p95': float(np.percentile(sat, 95)), 'hue_spread': spread,
        'local_contrast': float(np.abs(val - _blur(val)).mean()),
    }


def distance(m, ref):
    """Mean relative difference over the metrics (0 = same palette statistics)."""
    return float(np.mean([abs(m[k] - ref[k]) / max(abs(ref[k]), 0.05) for k in ref]))


def _row(images):
    scaled = []
    for rgb in images:
        h, w, _ = rgb.shape
        ys = (np.arange(ROW_H) * h / ROW_H).astype(int)
        nw = int(w * ROW_H / h)
        xs = (np.arange(nw) * w / nw).astype(int)
        scaled.append(rgb[ys][:, xs])
    return np.concatenate(scaled, axis=1)


def _save(path, rgb):
    h, w, _ = rgb.shape
    rgba = np.concatenate([rgb[::-1], np.ones((h, w, 1), np.float32)], axis=2)
    img = bpy.data.images.new('sheet', w, h, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.clip(rgba, 0, 1).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    sheet, ref_path, paths = argv[0], argv[1], argv[2:]
    ref = _load(ref_path)
    ref_m = metrics(ref)
    images, report = [ref], {'reference': {'path': ref_path, **ref_m}, 'renders': []}
    for path in paths:
        rgb = _load(path)
        m = metrics(rgb)
        images.append(rgb)
        report['renders'].append({'path': path, 'distance': distance(m, ref_m), **m})
    _save(sheet, _row(images))
    print('[refs] ' + json.dumps(report, indent=1))


main()
