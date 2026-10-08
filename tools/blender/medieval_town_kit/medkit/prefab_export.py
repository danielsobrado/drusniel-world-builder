"""Serialises prefabs for the game: module placements, colliders, doors, lights.

Everything is written in glTF/three.js space (Y up, metres), relative to the
prefab's footprint centre on the ground, with the front facing +Z. Blender's
(x, y, z) becomes (x, z, -y); a yaw about Blender Z is the same angle about Y.
"""
import json
import math
import os

from mathutils import Vector

from . import colliders
from .modules.walls import DOOR

DOOR_SIZE = (0.84, 2.08, 0.1)
OPEN_ANGLE = math.radians(100)


def _three(v):
    return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]


def _yaw(matrix):
    return round(math.atan2(matrix[1][0], matrix[0][0]), 5)


def _boxes(module, local):
    out = []
    yaw = _yaw(local)
    for lo, hi in colliders.for_module(module):
        centre = local @ Vector([(lo[i] + hi[i]) / 2 for i in range(3)])
        size = [hi[i] - lo[i] for i in range(3)]
        out.append({'c': _three(centre), 's': [round(size[0], 4), round(size[2], 4),
                                                round(size[1], 4)], 'yaw': yaw})
    return out


def _serialise(prefab):
    root = prefab['root']
    inv = root.matrix_world.inverted()
    cx, cy = prefab['centre']
    shift = Vector((-cx, -cy, 0))
    parts, boxes, doors, lights = [], [], [], []
    for obj in root.children_recursive:
        if obj.type == 'EMPTY':
            continue
        local = inv @ obj.matrix_world
        local.translation = local.translation + shift
        if obj.type == 'LIGHT':
            lights.append({'p': _three(local.translation), 'energy': obj.data.energy})
            continue
        module = obj.get('kit_module')
        if not module:
            continue
        if module == 'Door_Leaf':
            doors.append({'p': _three(local.translation), 'yaw': _yaw(local),
                          'size': list(DOOR_SIZE), 'openYaw': round(OPEN_ANGLE, 5)})
            continue
        parts.append({'m': module, 'p': _three(local.translation), 'yaw': _yaw(local)})
        boxes.extend(_boxes(module, local))
    width, depth = prefab['size']
    return {'kind': prefab['kind'], 'size': [width, depth], 'stories': prefab['stories'],
            'parts': parts, 'colliders': boxes, 'doors': doors, 'lights': lights}


def export(prefabs, module_names, out_dir):
    doc = {
        'version': 1,
        'space': 'glTF Y-up metres; origin = footprint centre on the ground; front = +Z',
        'doorOpening': {'width': DOOR[1] - DOOR[0], 'height': DOOR[3]},
        'moduleColliders': {
            name: [{'c': _three(Vector([(lo[i] + hi[i]) / 2 for i in range(3)])),
                    's': [hi[0] - lo[0], hi[2] - lo[2], hi[1] - lo[1]]}
                   for lo, hi in colliders.for_module(name)]
            for name in sorted(module_names) if colliders.for_module(name)
        },
        'prefabs': {p['name']: _serialise(p) for p in prefabs},
    }
    path = os.path.join(out_dir, 'medieval_kit_prefabs.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(doc, f, separators=(',', ':'))
    print(f'[kit] wrote {path} ({len(doc["prefabs"])} prefabs)')
