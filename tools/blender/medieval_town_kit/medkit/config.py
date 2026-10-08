"""Grid contract shared by every kit module.

Every module snaps to a 2 m lego grid. A module's origin is the grid point it
hangs from; walls span local +X from 0 to GRID with their exterior facing -Y.
"""
import math
import os

GRID = 2.0          # lego cell edge (m)
STORY = 3.0         # floor-to-floor height of a house story
TERRACE = 1.5       # height of one retaining-wall block / terrace step
WALL_T = 0.3        # house wall thickness
HALF_T = WALL_T / 2

ROOF_PITCH = math.radians(50.0)
ROOF_OVERHANG = 0.6
ROOF_THICK = 0.15
ROOF_SPANS = (4, 6)  # building depth in metres (2 or 3 cells)
HIP_LENGTHS = (4, 6, 8, 10, 12)  # building lengths the hip-roof modules cover
JETTY = 0.3          # how far each jettied timber story steps out over the one below (m)
JETTY_LEVELS = (1, 2)

# Level of detail being built: 0 = full close-up kit, 1 = the light far kit
# (no chamfers, carved brackets, voussoirs or slate courses). Both kits share
# module names, so the game can swap one for the other per town.
LOD = int(os.environ.get('MEDKIT_LOD', '0'))


def detailed():
    return LOD == 0


def jetty_key(span, level):
    return f'S{span}' if not level else f'S{span}J{level}'

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
SOURCE_DIR = os.path.join(REPO, 'assets-src', 'medieval-town-kit')
TEXTURE_DIR = os.path.join(SOURCE_DIR, 'textures')
PREVIEW_DIR = os.path.join(SOURCE_DIR, 'previews')
BLEND_PATH = os.path.join(SOURCE_DIR, 'medieval_town_kit.blend')
EXPORT_DIR = os.path.join(REPO, 'public', 'assets', 'environment', 'medieval-kit')
