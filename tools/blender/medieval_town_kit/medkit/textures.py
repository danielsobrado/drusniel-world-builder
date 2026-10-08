"""Write the shared tileable textures to PNG and load them as Blender images."""
import os

import bpy
import numpy as np

from . import scans
from .texture_patterns import PATTERNS, normal_from_height
from .texture_patterns_extra import EXTRA_PATTERNS
from .texture_patterns_weathered import WEATHERED_PATTERNS


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
        scanned = scans.load(name)
        if scanned:
            albedo, normal = scanned
        else:
            albedo, height, strength = fn(size, seed + i * 101)
            normal = normal_from_height(height.astype(np.float32), strength)
        images[name] = (
            _save(f'T_{name}_albedo', albedo, os.path.join(out_dir, f'{name}_albedo.png'), False),
            _save(f'T_{name}_normal', normal, os.path.join(out_dir, f'{name}_normal.png'), True),
        )
        print(f'[kit] texture {name} {albedo.shape[0]}px {"scan" if scanned else "procedural"}')
    return images
