"""Scanned CC0 surfaces from Poly Haven that replace procedural patterns.

The procedural numpy patterns stay as the fallback: a scan is used only when
its files are present under assets-src/medieval-town-kit/scans/<id>/ (albedo.jpg
and the OpenGL normal map normal.jpg, both 1k). Each scan carries the real
width it covers, which becomes the material's tile size so texel density stays
true to the photograph.

Picked against the storybook-town reference: warm chunky rubble, dark split
slate, cream render, weathered planks. All Poly Haven assets are CC0.
"""
import os
from dataclasses import dataclass

import bpy
import numpy as np

from .config import SOURCE_DIR

SCAN_DIR = os.path.join(SOURCE_DIR, 'scans')


@dataclass(frozen=True)
class Scan:
    asset: str
    size: float              # metres one tile covers
    turn: bool = False       # rotate a quarter turn so the grain runs along u


SCANS = {
    'stone': Scan('rustic_stone_wall', 1.52),
    'ashlar': Scan('medieval_blocks_03', 2.0),
    'roof': Scan('grey_roof_tiles_02', 1.5),
    'terracotta': Scan('clay_roof_tiles_02', 2.5),
    'thatch': Scan('reed_roof_04', 2.5),
    'plaster': Scan('painted_plaster_wall', 2.0),
    'planks': Scan('old_planks_02', 2.0, turn=True),
    'clapboard': Scan('dark_planks', 2.0),
    'cobble': Scan('cobblestone_floor_01', 1.0),
}


def _paths(scan):
    folder = os.path.join(SCAN_DIR, scan.asset)
    return os.path.join(folder, 'albedo.jpg'), os.path.join(folder, 'normal.jpg')


def available(name):
    scan = SCANS.get(name)
    return scan is not None and all(os.path.exists(p) for p in _paths(scan))


def size(name, default):
    """Tile size for a texture: the scan's real width when the scan is in use."""
    return SCANS[name].size if available(name) else default


def _pixels(path):
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    px = np.array(img.pixels[:], np.float32).reshape(h, w, 4)[..., :3]
    bpy.data.images.remove(img)
    return px


def load(name):
    """(albedo, normal) as float arrays (rows bottom-up, like the patterns), or None."""
    if not available(name):
        return None
    scan = SCANS[name]
    albedo_path, normal_path = _paths(scan)
    albedo, normal = _pixels(albedo_path), _pixels(normal_path)
    if scan.turn:
        albedo = np.rot90(albedo).copy()
        normal = np.rot90(normal).copy()
        # Pixel rows run bottom-up, so np.rot90 turns the picture a quarter
        # clockwise: a tangent-space direction (x, y) becomes (y, -x).
        nx, ny = normal[..., 0] * 2 - 1, normal[..., 1] * 2 - 1
        normal[..., 0], normal[..., 1] = (ny + 1) / 2, (-nx + 1) / 2
    return albedo, normal
