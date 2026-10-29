"""Turns a module's blockout rock into sculpted, game-budget rock (Stonehold AAA pass).

The procedural crag blocks (stonehold_parts) are the blockout. Their faces are split off,
voxel-remeshed into one solid, displaced with columnar fracture noise, decimated back to
no more triangles than the blockout rock had, smoothed by angle, wrapped with the tiled
rock texture, given baked ambient occlusion in the shared 'Col' vertex shading, and joined
back. The game multiplies 'Col' into the colour (TownKitMaterial data.x), so the baked
occlusion ships without per-asset textures.
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

from . import materials
from .config import detailed

ROCK = 'M_rock_cliff'
# Triangle budgets: sculpted rock gets at least ROCK_FLOOR at LOD0 (never fewer than the
# blockout had); a whole formation stays under MODULE_TRIS (LOD0) / MODULE_TRIS_LOD1.
ROCK_FLOOR = 12000
MODULE_TRIS = 36000
MODULE_TRIS_LOD1 = 12000


def _split_rock(obj):
    """Move obj's rock faces into a new object; None if it has none."""
    slot = next((i for i, m in enumerate(obj.data.materials) if m and m.name == ROCK), None)
    if slot is None:
        return None
    rock_me = obj.data.copy()
    for me, keep_rock in ((rock_me, True), (obj.data, False)):
        bm = bmesh.new()
        bm.from_mesh(me)
        drop = [f for f in bm.faces if (f.material_index == slot) != keep_rock]
        bmesh.ops.delete(bm, geom=drop, context='FACES')
        if keep_rock:
            # MeshBuilder never welds faces, and blocks are open at the foot: weld, then close.
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
            bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
        bm.to_mesh(me)
        bm.free()
    rock = bpy.data.objects.new(f'{obj.name}_rock', rock_me)
    bpy.context.scene.collection.objects.link(rock)
    return rock


def _apply(obj, mod):
    deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(deps))
    obj.modifiers.remove(mod)
    old, obj.data = obj.data, me
    bpy.data.meshes.remove(old)


def _shape(rock, seed, voxel):
    """Fuse and fracture: voxel remesh, then columnar Voronoi plus fine crackle displacement."""
    rem = rock.modifiers.new('remesh', 'REMESH')
    rem.mode = 'VOXEL'
    rem.voxel_size = voxel
    _apply(rock, rem)
    # Texture space squashed in z (via a scaled empty) stretches cells into vertical columns.
    space = bpy.data.objects.new(f'{rock.name}_space', None)
    bpy.context.scene.collection.objects.link(space)
    space.scale = (1.0, 1.0, 3.2)
    space.location = (random.Random(seed).uniform(-9, 9), 0.0, 0.0)
    for tex_type, size, strength in (('VORONOI', 0.22, 0.075), ('STUCCI', 0.06, 0.018)):
        tex = bpy.data.textures.new(f'{rock.name}_{tex_type}', tex_type)
        tex.noise_scale = size
        if tex_type == 'VORONOI':
            tex.distance_metric = 'DISTANCE'
            tex.weight_1, tex.weight_2 = -1.0, 1.0  # F2 - F1: crisp ridges between cells
        disp = rock.modifiers.new(f'disp_{tex_type}', 'DISPLACE')
        disp.texture = tex
        disp.texture_coords = 'OBJECT'
        disp.texture_coords_object = space
        disp.strength = strength
        disp.mid_level = 0.5
        _apply(rock, disp)
        bpy.data.textures.remove(tex)
    bpy.data.objects.remove(space)


def _drop_islands(rock, min_faces):
    """Tiny separate pieces (pebbles, talus slivers) decimate into floating shards."""
    bm = bmesh.new()
    bm.from_mesh(rock.data)
    seen, drop = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        island, stack = [], [f]
        seen.add(f.index)
        while stack:
            g = stack.pop()
            island.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        if len(island) < min_faces:
            drop.extend(island)
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    bm.to_mesh(rock.data)
    bm.free()


def _drop_underside(rock):
    """Faces under the ground line are never seen; remove them before spending budget."""
    bm = bmesh.new()
    bm.from_mesh(rock.data)
    under = [f for f in bm.faces if f.normal.z < -0.5 and max(v.co.z for v in f.verts) < 0.03]
    bmesh.ops.delete(bm, geom=under, context='FACES')
    bm.to_mesh(rock.data)
    bm.free()


def _decimate(rock, budget):
    tris = sum(len(p.vertices) - 2 for p in rock.data.polygons)
    if tris > budget:
        dec = rock.modifiers.new('decimate', 'DECIMATE')
        dec.ratio = budget / tris
        _apply(rock, dec)
    rock.data.shade_smooth()
    rock.data.set_sharp_from_angle(angle=math.radians(38))


def _wrap_uvs(rock, centres):
    """Side faces wrap round the nearest bluff centre (u = arc length, v = height); ledges
    and tops take a plan projection. Matches the blockout's wrapped rock UVs."""
    scale = materials.SPEC['rock_cliff'].scale
    me = rock.data
    uv = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        loops = list(poly.loop_indices)
        pts = [me.vertices[me.loops[li].vertex_index].co for li in loops]
        if abs(poly.normal.z) > 0.72:
            for li, p in zip(loops, pts):
                uv.data[li].uv = (p.x / scale, p.y / scale)
            continue
        c = poly.center
        cx, cy = min(centres, key=lambda k: (c.x - k[0]) ** 2 + (c.y - k[1]) ** 2)
        a0 = math.atan2(pts[0].y - cy, pts[0].x - cx)
        for li, p in zip(loops, pts):
            a = math.atan2(p.y - cy, p.x - cx)
            a += round((a0 - a) / (2 * math.pi)) * 2 * math.pi  # no wrap seam inside a face
            r = math.hypot(p.x - cx, p.y - cy)
            uv.data[li].uv = (a * max(r, 0.3) / scale, p.z / scale)


def _bake_occlusion(rock, samples):
    """Cycles AO into the 'Col' vertex shading, remapped so open faces stay near 1."""
    me = rock.data
    for attr in list(me.color_attributes):
        me.color_attributes.remove(attr)
    col = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = col
    scene = bpy.context.scene
    engine = scene.render.engine
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.world = scene.world or bpy.data.worlds.new('BakeWorld')
    # Short rays: crevices and deck overhangs only, never neighbouring catalog modules.
    ao_distance = scene.world.light_settings.distance
    scene.world.light_settings.distance = 0.35
    with bpy.context.temp_override(active_object=rock, object=rock, selected_objects=[rock],
                                   selected_editable_objects=[rock]):
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    scene.render.engine = engine
    scene.world.light_settings.distance = ao_distance
    for d in col.data:
        ao = d.color[0]
        v = 0.42 + 0.58 * ao
        d.color = (v, v, v, 1.0)


def _join(obj, rock):
    with bpy.context.temp_override(active_object=obj, object=obj, selected_objects=[obj, rock],
                                   selected_editable_objects=[obj, rock]):
        bpy.ops.object.join()


def sculpt_rock(obj, seed, centres=((0.0, 0.0),)):
    """Replace obj's blockout rock with sculpted rock within the budgets above; returns
    (blockout_tris, sculpted_tris) for the build's budget report."""
    mats = obj.data.materials
    blockout = sum(len(p.vertices) - 2 for p in obj.data.polygons
                   if mats[p.material_index] and mats[p.material_index].name == ROCK)
    rock = _split_rock(obj)
    if rock is None:
        return 0, 0
    budget = max(blockout, ROCK_FLOOR if detailed() else blockout)
    _shape(rock, seed, 0.045 if detailed() else 0.08)
    _drop_islands(rock, 400 if detailed() else 60)
    _drop_underside(rock)
    _decimate(rock, budget)
    _wrap_uvs(rock, centres)
    _bake_occlusion(rock, 16 if detailed() else 4)
    sculpted = sum(len(p.vertices) - 2 for p in rock.data.polygons)
    assert sculpted <= budget * 1.02, f'{obj.name}: sculpted rock {sculpted} > budget {budget}'
    _join(obj, rock)
    total = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    limit = MODULE_TRIS if detailed() else MODULE_TRIS_LOD1
    assert total <= limit, f'{obj.name}: {total} tris > {limit}'
    return blockout, sculpted
