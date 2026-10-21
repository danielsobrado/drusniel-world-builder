"""Whole-town art review for one family: generate a town, render an overview and two hero views.

    blender -b --factory-startup --python tools/blender/medieval_town_kit/regional_towns.py -- OUT_DIR FAMILY [SEED] [--res 1600x900]

Writes <family>_<seed>_overview.png (isometric), _hero.png (elevated three-quarter, like a
concept painting of the town), _ref.png (framed like the hill-fort reference, ref3 in
assets-src/medieval-town-kit/references) and _street.png (eye level from the main entrance).
The town stands on rolling land that rises into a ridge behind it, with faceted crags,
boulders and trees, the way the game's terrain surrounds a hill town.
Lit and tone mapped like the game (game_look.py).
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from medkit import catalog, config, game_look, materials, render, textures, village  # noqa: E402
from medkit.config import GRID, TERRACE  # noqa: E402
from medkit.mesh import MeshBuilder  # noqa: E402
from medkit.village_generator import GeneratedVillage  # noqa: E402

# The land round the town (the game has terrain there) and the preview's sky look.
GROUND = {'Orc': 'meadow', 'Frostgard': 'snow_land', 'Stonehold': 'meadow_earth'}
TREES = {'Orc': ('Tree_Oak', 'Tree_Oak', 'Tree_Pine', 'Bush'),
         'Frostgard': ('Tree_Pine_Snow', 'Tree_Pine_Snow', 'Tree_Pine_Snow_Tall'),
         'Stonehold': ('Tree_Pine', 'Tree_Pine_Tall', 'Boulder_Cluster')}
LAND_STEP = 4.0          # landscape grid (m)
LAND_REACH = 220.0       # how far the land runs past the town (m)
# Per family: faces whose normal z falls below `rock` are bare rock; `crags` outcrops; `ridge`
# is how steeply the land climbs behind the town (m per m). A Stonehold hold is cut into a mountain.
# `lake`: the land falls away in front of the town to a frozen lake (Frostgard).
LAND_LOOK = {'Stonehold': dict(rock=0.97, crags=170, ridge=0.75, lake=False),
             'Frostgard': dict(rock=0.6, crags=60, ridge=0.85, lake=True)}
LAND_DEFAULT = dict(rock=0.78, crags=70, ridge=0.42, lake=False)
# Frostgard's preview look: a cold winter afternoon with the sun low and pink, a blue sky fill
# and a snow-bright ground bounce; windows glow warm against it (the Frostgard references).
WINTER = dict(elevation=11, azimuth=250, sun='#ffc6a2', sun_intensity=1.7, sky='#8fa9d6', ground='#d3dbe8',
              ambient=2.8)
LOOKS = {'Frostgard': dict(look='winter', haze=0.0042, haze_colour=(0.74, 0.83, 1.0), glow=6.0)}
LOOK_DEFAULT = dict(look='town_review', haze=0.0022, haze_colour=(0.86, 0.9, 1.0), glow=1.0)
game_look.LOOKS['winter'] = WINTER
# Review sky: between the game's 'configured' noon and 'storybook' dusk; a warm sun at 32 deg
# with a strong sky fill, so values stay soft like a painted town view.
game_look.LOOKS['town_review'] = dict(elevation=32, azimuth=240, sun='#ffe2bd', sun_intensity=2.7,
                                      sky='#c4d4e8', ground='#7d7458', ambient=2.3)
HAZE = 0.0022      # aerial perspective: soft distance like a painted town view


class Land:
    """Height of the ground round a town of w x h metres: flat under the town (and its gate),
    rolling outside, rising into a ridge behind it and falling gently in front."""

    def __init__(self, w, h, seed, ridge=0.42, lake=False):
        rng = random.Random(seed)
        self.ridge, self.lake = ridge, lake
        self.box = (-5.0, w + 5.0, -12.0, h + 5.0)
        self.phase = [rng.uniform(0, 6.3) for _ in range(4)]

    def outside(self, x, y):
        x0, x1, y0, y1 = self.box
        return math.hypot(max(x0 - x, 0, x - x1), max(y0 - y, 0, y - y1))

    def z(self, x, y):
        d = self.outside(x, y)
        if d <= 0:
            return 0.0
        p = self.phase
        roll = 3.0 * math.sin(x * 0.045 + p[0]) * math.cos(y * 0.05 + p[1]) + 1.8 * math.sin(x * 0.11 + y * 0.07 + p[2])
        ramp = min(d / 26.0, 1.0)
        ramp = ramp * ramp * (3 - 2 * ramp)
        ridge = min(max(y - self.box[3], 0.0) * self.ridge, 60.0) * (0.75 + 0.25 * math.sin(x * 0.03 + p[3]))
        front = -min(max(self.box[2] - y, 0.0) * (0.14 if self.lake else 0.05), 7.0 if self.lake else 3.0)
        return ramp * (roll + 0.12 * d) + ridge + front


def _landscape(kit, land, family, mat, seed):
    look = LAND_LOOK.get(family, LAND_DEFAULT)
    b = MeshBuilder()
    x0, x1, y0, y1 = land.box
    n = int((x1 - x0 + 2 * LAND_REACH) / LAND_STEP)
    m = int((y1 - y0 + 2 * LAND_REACH) / LAND_STEP)
    xs = [x0 - LAND_REACH + i * LAND_STEP for i in range(n + 1)]
    ys = [y0 - LAND_REACH + j * LAND_STEP for j in range(m + 1)]
    heights = {(i, j): land.z(x, y) - 0.03 for i, x in enumerate(xs) for j, y in enumerate(ys)}
    steep = []
    for i in range(n):
        for j in range(m):
            q = [(xs[i], ys[j], heights[i, j]), (xs[i + 1], ys[j], heights[i + 1, j]),
                 (xs[i + 1], ys[j + 1], heights[i + 1, j + 1]), (xs[i], ys[j + 1], heights[i, j + 1])]
            dzx = (q[1][2] + q[2][2] - q[0][2] - q[3][2]) / (2 * LAND_STEP)
            dzy = (q[3][2] + q[2][2] - q[0][2] - q[1][2]) / (2 * LAND_STEP)
            nz = 1 / math.sqrt(1 + dzx * dzx + dzy * dzy)
            rock = nz < look['rock']
            b.poly(q, 'rock_land' if rock else mat, outward=(0, 0, 1), smooth=True)
            if rock or (nz < 0.93 and land.outside(xs[i], ys[j]) > 8):
                steep.append((xs[i] + LAND_STEP / 2, ys[j] + LAND_STEP / 2))
    if look['lake']:
        # Lake ice over the hollow in front of the town.
        lz, front = -2.2, land.box[2] - 14.0
        b.poly([(x0 - LAND_REACH, y0 - LAND_REACH, lz), (x1 + LAND_REACH, y0 - LAND_REACH, lz),
                (x1 + LAND_REACH, front, lz), (x0 - LAND_REACH, front, lz)], 'ice', outward=(0, 0, 1))
    obj = bpy.data.objects.new('Landscape', b.to_mesh('Landscape'))
    coll = kit.collection('Landscape', under=bpy.context.scene.collection)
    coll.objects.link(obj)
    rng = random.Random(seed)
    rng.shuffle(steep)
    for x, y in steep[:look['crags']]:
        crag = kit.place('Cliff_Granite', coll, None, (x, y, land.z(x, y) - 0.8), rng.uniform(0, 6.3))
        # Wide, low outcrops breaking the slope rather than pillars standing on it.
        crag.scale = (rng.uniform(1.6, 2.6), rng.uniform(1.3, 2.0), rng.uniform(0.35, 0.75))
    for x, y in steep[look['crags']:look['crags'] + 80]:
        kit.place('Boulder_Cluster', coll, None, (x, y, land.z(x, y) - 0.2), rng.uniform(0, 6.3))
    trees = TREES.get(family, ('Tree_Oak',))
    placed = 0
    while placed < 260:
        x = rng.uniform(x0 - 120, x1 + 120)
        y = rng.uniform(y0 - 60, y1 + 140)
        if land.outside(x, y) < 6:
            continue
        kit.place(rng.choice(trees), coll, None, (x, y, land.z(x, y) - 0.1), rng.uniform(0, 6.3))
        placed += 1


def _glow(scale):
    """Windows lit from within as the light goes (the game's TownGlassMaterial does this at dusk)."""
    for name in ('M_glass', 'M_glass_clear'):
        mat = bpy.data.materials.get(name)
        if mat:
            bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
            bsdf.inputs['Emission Strength'].default_value *= scale


def _haze(scene, centre, density=HAZE, size=(260.0, 260.0, 70.0), colour=(0.86, 0.9, 1.0)):
    """A bounded volume box (a world volume would absorb all sky light in EEVEE)."""
    eevee = scene.eevee
    for attr, value in (('volumetric_end', 400.0), ('volumetric_tile_size', '8'), ('volumetric_samples', 32)):
        if hasattr(eevee, attr):
            try:
                setattr(eevee, attr, value)
            except (TypeError, ValueError):
                pass
    bpy.ops.mesh.primitive_cube_add(location=(centre.x, centre.y, size[2] / 2 - 2.0))
    box = bpy.context.active_object
    box.name = 'Haze'
    box.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    mat = bpy.data.materials.new('M_Haze')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.remove(next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'))
    vol = nt.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Density'].default_value = density
    vol.inputs['Anisotropy'].default_value = 0.3
    vol.inputs['Color'].default_value = (*colour, 1)
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    nt.links.new(vol.outputs['Volume'], out.inputs['Volume'])
    box.data.materials.append(mat)


def _args():
    argv = sys.argv[sys.argv.index('--') + 1:]
    res = (1600, 900)
    if '--res' in argv:
        w, h = argv.pop(argv.index('--res') + 1).split('x')
        argv.remove('--res')
        res = (int(w), int(h))
    return argv[0], argv[1], int(argv[2]) if len(argv) > 2 else 7, res


def _town_bounds():
    pts = [o.matrix_world @ Vector(c) for o in bpy.data.collections['Town_Buildings'].all_objects
           if o.type == 'MESH' for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def main():
    out, family, seed, res = _args()
    os.makedirs(out, exist_ok=True)
    config.LOD = 0
    bpy.ops.wm.read_factory_settings(use_empty=True)
    materials.build(textures.generate(config.TEXTURE_DIR))
    kit = catalog.build_kit()
    plan = GeneratedVillage(seed, family)
    village.build(kit, plan)
    mood = LOOKS.get(family, LOOK_DEFAULT)
    render.setup_scene(look=mood['look'])
    _glow(mood['glow'])
    render._set_visible('Kit', False)
    bpy.context.view_layer.update()
    stem = os.path.join(out, f'{family.lower()}_{seed}')
    lo, hi = _town_bounds()
    centre = (lo + hi) / 2
    shape = LAND_LOOK.get(family, LAND_DEFAULT)
    land = Land(plan.W * GRID, plan.H * GRID, seed, shape['ridge'], shape['lake'])
    _landscape(kit, land, family, GROUND.get(family, 'meadow'), seed)
    _haze(bpy.context.scene, centre, mood['haze'], colour=mood['haze_colour'])
    span = max(hi.x - lo.x, hi.y - lo.y)
    shot = render._collection_shot('Town')
    cam = render._camera('CAM_overview', shot['loc'], shot['target'], shot['ortho_scale'])
    render._render(cam, f'{stem}_overview.png', res)
    hero = centre + Vector((-0.55, -1.0, 0.62)).normalized() * span * 1.05
    cam = render._camera('CAM_hero', hero, centre - Vector((0, span * 0.05, span * 0.06)), lens=30)
    render._render(cam, f'{stem}_hero.png', res)
    # Framed like the hill-fort reference: high oblique from the front-left, 35 mm, land in front.
    ref = centre + Vector((-0.42, -1.0, 0.42)).normalized() * span * 2.1
    cam = render._camera('CAM_ref', ref, centre + Vector((span * 0.04, span * 0.08, -span * 0.04)), lens=35)
    render._render(cam, f'{stem}_ref.png', res)
    gate_x = (plan.entrances[0] + 0.5) * GRID if plan.entrances else centre.x
    eye = Vector((gate_x + 0.6, -17.0, 2.3))
    look = Vector((gate_x + 0.6, centre.y * 0.7, TERRACE * 2 + 1.5))
    cam = render._camera('CAM_street', eye, look, lens=24)
    render._render(cam, f'{stem}_street.png', res)
    print(f'[towns] {family} {seed}: {len(plan.BUILDINGS)} buildings')


main()
