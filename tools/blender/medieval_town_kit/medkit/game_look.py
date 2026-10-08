"""Renders that look the way the game will show them.

The game lights towns with a three.js DirectionalLight and HemisphereLight and
tone maps with three's ACESFilmic fit at exposure 1.12 (editor.config.yaml).
Blender's sun follows the same convention as three's directional light (a
strength of 1 lights a white diffuse face to 1/pi), so the game's intensities
carry over unchanged. The hemisphere becomes a world gradient scaled by 1/pi
for the same reason, and the render is written as linear EXR and tone mapped
here with three's exact curve, never with Blender's AgX or Filmic views.

LOOKS mirror src/editor/stylized/sky/SkyPresets.js: 'configured' is the game's
default sky, 'storybook' the warm low-sun town preset.
"""
import math
import os

import bpy
import numpy as np

EXPOSURE = 1.12

LOOKS = {
    'configured': dict(elevation=42, azimuth=235, sun='#fff3dc', sun_intensity=3.0,
                       sky='#cfe1f2', ground='#6f784d', ambient=2.0),
    'storybook': dict(elevation=16, azimuth=250, sun='#ffc98a', sun_intensity=3.2,
                      sky='#b9c9e6', ground='#8a6f4e', ambient=1.6),
}

# three's ACESFilmicToneMapping (nodes/display/ToneMappingFunctions.js), rows.
ACES_IN = np.array([[0.59719, 0.35458, 0.04823],
                    [0.07600, 0.90834, 0.01566],
                    [0.02840, 0.13383, 0.83777]], np.float32)
ACES_OUT = np.array([[1.60475, -0.53108, -0.07367],
                     [-0.10208, 1.10813, -0.00605],
                     [-0.00327, -0.07276, 1.07602]], np.float32)


def linear(hex_colour):
    h = hex_colour.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def aces(rgb, exposure=EXPOSURE):
    """three's ACES fit on linear rgb[..., 3]; returns display-linear 0..1."""
    c = rgb * (exposure / 0.6)
    c = c @ ACES_IN.T
    a = c * (c + 0.0245786) - 0.000090537
    b = c * (0.983729 * c + 0.4329510) + 0.238081
    return np.clip((a / b) @ ACES_OUT.T, 0.0, 1.0)


def srgb_encode(c):
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def light_scene(scene, look='storybook'):
    """Sun and hemisphere world matching a game sky look."""
    spec = LOOKS[look]
    sun = bpy.data.objects.get('Sun')
    if sun is None:
        sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
        scene.collection.objects.link(sun)
    sun.data.energy = spec['sun_intensity']
    sun.data.color = linear(spec['sun'])
    sun.data.angle = math.radians(1.5)
    # A sun lamp shines down its -Z: tilt from the zenith by 90 - elevation, then
    # turn so it comes from the azimuth (degrees clockwise from +Y, north).
    sun.rotation_euler = (math.radians(90 - spec['elevation']), 0,
                          math.radians(180 - spec['azimuth']))
    world = bpy.data.worlds.get('GameSky') or bpy.data.worlds.new('GameSky')
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    coords = nt.nodes.new('ShaderNodeTexCoord')
    split = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeMapRange')
    ramp.inputs['From Min'].default_value = -1.0
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs[6].default_value = (*linear(spec['ground']), 1)
    mix.inputs[7].default_value = (*linear(spec['sky']), 1)
    background = nt.nodes.new('ShaderNodeBackground')
    background.inputs['Strength'].default_value = spec['ambient'] / math.pi
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(coords.outputs['Generated'], split.inputs[0])
    nt.links.new(split.outputs['Z'], ramp.inputs['Value'])
    nt.links.new(ramp.outputs['Result'], mix.inputs[0])
    nt.links.new(mix.outputs[2], background.inputs['Color'])
    nt.links.new(background.outputs['Background'], out.inputs['Surface'])
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0


def render(scene, camera, path, res=(1600, 1200)):
    """Render linear EXR, tone map like the game, write an sRGB PNG at `path`."""
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = res
    settings = scene.render.image_settings
    saved = settings.file_format
    settings.file_format = 'OPEN_EXR'
    exr = os.path.splitext(path)[0] + '.linear.exr'
    scene.render.filepath = exr
    bpy.ops.render.render(write_still=True)
    settings.file_format = saved
    img = bpy.data.images.load(exr)
    px = np.array(img.pixels[:], np.float32).reshape(-1, 4)
    px[:, :3] = srgb_encode(aces(px[:, :3]))
    out = bpy.data.images.new(os.path.basename(path), res[0], res[1], alpha=False)
    out.colorspace_settings.name = 'Non-Color'
    out.pixels.foreach_set(px.ravel())
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    for image in (img, out):
        bpy.data.images.remove(image)
    os.remove(exr)
    print(f'[kit] rendered {path}')
