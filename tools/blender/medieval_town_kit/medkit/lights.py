"""Warm point lights for lanterns, lamp posts and interiors (exported as
KHR_lights_punctual so the game can pick them up or replace them)."""
import bpy

WARM = (1.0, 0.62, 0.32)


def point(coll, parent, loc, energy=60.0, radius=0.15, name='Light_Lamp'):
    data = bpy.data.lights.new(name, 'POINT')
    data.energy = energy
    data.color = WARM
    data.shadow_soft_size = radius
    # Dozens of small lights: shadowless keeps EEVEE's shadow pool for the sun
    # and matches what a game would do with fill lights.
    data.use_shadow = False
    obj = bpy.data.objects.new(name, data)
    coll.objects.link(obj)
    obj.parent = parent
    obj.location = loc
    return obj


def interior(coll, parent, loc):
    return point(coll, parent, loc, energy=90.0, radius=0.3, name='Light_Interior')
