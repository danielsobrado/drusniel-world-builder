"""The kit's material library: a dozen materials over shared tileable textures.

`scale` is the world size (m) one texture tile covers, so every module that
uses a material has the same texel density and adjacent modules tile seamlessly.
"""
from dataclasses import dataclass, replace

import bpy

from . import scans


@dataclass(frozen=True)
class Spec:
    tex: str = None
    scale: float = 2.0
    rough: float = 0.85
    metal: float = 0.0
    grain: bool = False      # texture's long axis follows the part's long axis
    fit: bool = False        # map 0..1 across each face (window panes)
    tint: tuple = (1.0, 1.0, 1.0)
    emission: float = 0.0
    normal: float = 1.0
    color: tuple = (0.8, 0.8, 0.8)


SPEC = {
    'stone': Spec('stone', 2.0, 0.9, normal=2.2),
    'stone_ashlar': Spec('ashlar', 2.0, 0.85, normal=1.8),
    'cobble': Spec('cobble', 2.0, 0.85, normal=2.0),
    'plaster': Spec('plaster', 2.0, 0.95, normal=1.4, tint=(1.0, 0.93, 0.8)),
    'timber': Spec('timber', 1.5, 0.8, grain=True, normal=1.6),
    'planks': Spec('planks', 2.0, 0.8, grain=True, normal=1.6),
    'roof': Spec('roof', 2.0, 0.85, tint=(0.58, 0.6, 0.66), normal=2.0),
    'roof_terracotta': Spec('terracotta', 2.0, 0.8, normal=1.6),
    'thatch': Spec('thatch', 2.0, 0.95, normal=1.6),
    'clapboard': Spec('clapboard', 2.0, 0.85, normal=1.6),
    'grass': Spec('grass', 2.0, 0.95),
    'iron': Spec('iron', 1.0, 0.45, metal=0.85),
    'glass': Spec('window', fit=True, rough=0.3, emission=1.6),
    'cloth_cream': Spec('cloth', 1.0, 0.95, tint=(1.0, 0.93, 0.80)),
    'cloth_blue': Spec('cloth', 1.0, 0.95, tint=(0.18, 0.26, 0.62)),
    'cloth_red': Spec('cloth', 1.0, 0.95, tint=(0.62, 0.16, 0.12)),
    'foliage': Spec('foliage', 1.5, 0.9),
    'bark': Spec('bark', 1.0, 0.9),
    'flowers': Spec('flowers', 1.0, 0.9),
    'glow': Spec(color=(1.0, 0.48, 0.16), emission=4.0),
    'water': Spec(color=(0.07, 0.14, 0.18), rough=0.08),
    'gold': Spec(color=(0.85, 0.65, 0.22), rough=0.35, metal=1.0),
}

# A scanned texture covers its photograph's real width (scans.py).
SPEC = {name: replace(spec, scale=scans.size(spec.tex, spec.scale)) if spec.tex else spec
        for name, spec in SPEC.items()}

_MATERIALS = {}


def _linear(c):
    return tuple(x ** 2.2 for x in c[:3]) + (1.0,)


def _principled(mat):
    if not mat.use_nodes:
        mat.use_nodes = True
    return next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


def _with_shading(nodes, links, color_out):
    """Multiply by the baked vertex shading (grime, occlusion, per-piece tone)."""
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    mix = nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs[0].default_value = 1.0
    links.new(color_out, mix.inputs[6])
    links.new(attr.outputs['Color'], mix.inputs[7])
    return mix.outputs[2]


def _build(name, spec, images):
    mat = bpy.data.materials.new(f'M_{name}')
    bsdf = _principled(mat)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf.inputs['Roughness'].default_value = spec.rough
    bsdf.inputs['Metallic'].default_value = spec.metal
    color_out = None
    if spec.tex:
        albedo, normal = images[spec.tex]
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = albedo
        color_out = tex.outputs['Color']
        if spec.tint != (1.0, 1.0, 1.0):
            mix = nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs[0].default_value = 1.0
            links.new(color_out, mix.inputs[6])
            mix.inputs[7].default_value = _linear(spec.tint)
            color_out = mix.outputs[2]
        links.new(_with_shading(nodes, links, color_out), bsdf.inputs['Base Color'])
        ntex = nodes.new('ShaderNodeTexImage')
        ntex.image = normal
        nmap = nodes.new('ShaderNodeNormalMap')
        nmap.inputs['Strength'].default_value = spec.normal
        links.new(ntex.outputs['Color'], nmap.inputs['Color'])
        links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    else:
        solid = nodes.new('ShaderNodeRGB')
        solid.outputs[0].default_value = _linear(spec.color)
        links.new(_with_shading(nodes, links, solid.outputs[0]), bsdf.inputs['Base Color'])
    if spec.emission:
        if color_out is not None:
            links.new(color_out, bsdf.inputs['Emission Color'])
        else:
            bsdf.inputs['Emission Color'].default_value = _linear(spec.color)
        bsdf.inputs['Emission Strength'].default_value = spec.emission
    return mat


def build(images):
    for name, spec in SPEC.items():
        _MATERIALS[name] = _build(name, spec, images)


def get(name):
    return _MATERIALS[name]
