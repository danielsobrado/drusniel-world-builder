"""Places a building's silhouette accents: gable-end chimney breasts and stacks,
oriel bays, balconies, hanging vines under jetties, a corner turret and trade
signs (modules/accents.py).

Accents draw from their own random stream so adding or tuning one never
reshuffles a building's windows and doors.
"""
import random
from dataclasses import dataclass

from .config import GRID, JETTY, jetty_key
from .mesh import wall_point as _wall_point

STACK_SETS = {'gable': 'Gable', 'steep': 'Steep'}


@dataclass(frozen=True)
class AccentPlan:
    side_chimney: bool
    chimney_y: float        # building-frame y of the breast centre on the left wall
    chimney_segment: int    # left-wall segment index the breast covers (kept plain)


class AccentPlacer:
    def __init__(self, kit, coll):
        self.kit, self.coll = kit, coll

    def plan(self, spec):
        """Decisions needed before any wall is placed."""
        self.rng = random.Random(spec.seed * 7919 + 3)
        side = (spec.chimney and spec.roof in STACK_SETS
                and self.rng.random() < spec.side_chimney_odds)
        # The breast sits on depth cell `cell`; the left wall runs back to front, so
        # that cell is left-wall segment d - 1 - cell, which stays windowless.
        cell = spec.d // 2
        return AccentPlan(side, (cell + 0.5) * GRID, spec.d - 1 - cell)

    def keeps_plain(self, plan, side, k, i):
        return plan.side_chimney and side == 'left' and i == plan.chimney_segment

    def front_window(self, spec, k, story, loc, rotq, out):
        """An upper front window may grow an oriel bay or a balcony. Returns True when
        it did (the caller then skips the flower box)."""
        if k == 0 or spec.pent:
            return False
        roll = self.rng.random()
        if roll < spec.oriel_odds:
            self.kit.place_q('Oriel_Window', self.coll, story,
                             _wall_point(loc, rotq, (1.0, -0.2 - out, 0.85)), rotq)
            return True
        if roll < spec.oriel_odds + spec.balcony_odds:
            self.kit.place_q('Balcony', self.coll, story,
                             _wall_point(loc, rotq, (1.0, -0.17 - out, 0.0)), rotq)
            return True
        return False

    def under_jetty(self, spec, k, story, loc, rotq, level):
        """Ivy trailing from a jetty's bressumer over the story below."""
        if level and self.rng.random() < 0.22:
            self.kit.place_q('Vine_Hanging', self.coll, story,
                             _wall_point(loc, rotq, (1.0, -0.2 - level * JETTY, -0.15)), rotq)

    def story(self, spec, plan, k, story, top_level):
        """Per-story pieces: the chimney breast, the turret on the top story, the sign."""
        if plan.side_chimney:
            self.kit.place('Chimney_Breast', self.coll, story, (0, plan.chimney_y, 0))
        if spec.turret and k == len(spec.stories) - 1:
            self.kit.place('Turret_Corner', self.coll, story, (0, -top_level * JETTY, 0))
        if spec.shop_sign and k == 0:
            self.kit.place(f'Sign_{spec.shop_sign}', self.coll, story,
                           (spec.door * GRID - 0.2, -0.15, 2.75))

    def plinth(self, spec, plan, root):
        if plan.side_chimney and spec.plinth:
            self.kit.place(f'Chimney_Breast_Plinth_{spec.plinth}', self.coll, root, (0, plan.chimney_y, 0))

    def stack(self, spec, plan, root, wall_top, top_level):
        """The breast's stack from the wall top past the ridge."""
        if not plan.side_chimney:
            return
        if spec.gable_front:
            key = f'S{int(spec.w * GRID)}'
        else:
            key = jetty_key(int(spec.d * GRID), top_level)
        name = f'Chimney_Stack_{STACK_SETS[spec.roof]}_{key}'
        self.kit.place(name, self.coll, root, (0, plan.chimney_y, wall_top))
