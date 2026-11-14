"""Whorled conifers: a straight leader with rings of branches (trees plan §5.5).

`whorled_conifer` returns the skeleton and the card placements; the builder
turns them into the bark and leaf meshes, as the swamp and savanna builders do
with `grow`.
"""
import math

from mathutils import Vector

from tree_kit import Branch


def trunk_sampler(points, radii, height):
    def at(z):
        pts_pos = [p for p in points if p.z >= 0.0]
        rads_pos = [r for p, r in zip(points, radii) if p.z >= 0.0]
        f = min(max(z / height, 0), 1) * (len(pts_pos) - 1)
        i = min(int(f), len(pts_pos) - 2)
        return pts_pos[i].lerp(pts_pos[i + 1], f - i), rads_pos[i] + (rads_pos[i + 1] - rads_pos[i]) * (f - i)
    return at


def whorled_conifer(rng, spec):
    """`spec`: height, crown, base_radius, clear_bole, whorl_spacing, per_whorl,
    profile_power, droop, stations, station_range, tuft (cards per station, splay),
    card_width, lean, regions,
    top_regions, stubs, and optionally tip_radius and length_range (a snag).
    Returns (branches, cards); a card is {base, dir, width, key, roll, whorl, branch}."""
    height, crown, base_radius = spec['height'], spec['crown'], spec['base_radius']
    tip_radius = spec.get('tip_radius', 0.03)
    bole = spec['clear_bole'] * height
    heading, phase = rng.uniform(0, 6.28), rng.uniform(0, 6.28)
    lean_dir = Vector((math.cos(heading), math.sin(heading), 0))
    ortho_dir = Vector((-lean_dir.y, lean_dir.x, 0))
    sweep_amp = height * rng.uniform(0.012, 0.026)
    points, radii = [], []
    # Cluster lower trunk stations near z=0 (and slightly below grade) for a smooth root flare
    ts = [-0.14 / max(height, 1.0), 0.0, 0.025, 0.06, 0.11] + [0.11 + 0.89 * i / 12 for i in range(1, 13)]
    for t in ts:
        tc = max(0.0, t)
        z = t * height
        zc = tc * height
        curve = (
            lean_dir * math.sin(tc * math.pi * 0.9) * sweep_amp
            + ortho_dir * math.sin(phase + tc * math.pi * 1.6) * sweep_amp * 0.55
            + Vector((math.sin(phase + tc * 4.3), math.cos(phase * 1.4 + tc * 3.7), 0)) * 0.08 * math.sin(math.pi * tc)
        )
        points.append(lean_dir * spec['lean'] * zc + curve + Vector((0, 0, z)))
        if zc < bole:
            u_b = zc / max(bole, 1e-4)
            radii.append(base_radius * (1.0 - 0.18 * (u_b ** 0.85)))
        else:
            u_c = (zc - bole) / max(height - bole, 1e-4)
            bole_top_r = base_radius * 0.82
            radii.append(bole_top_r + (tip_radius - bole_top_r) * (u_c ** 0.88))
    trunk = Branch(points, radii, 0, kind='trunk')
    branches, cards = [trunk], []
    trunk_at = trunk_sampler(points, radii, height)

    def pick(t):
        return rng.choice(spec['top_regions'] if t > 0.75 else spec['regions'])

    stations, (near, far) = spec['stations'], spec.get('station_range', (0.3, 0.9))
    segments = 3 if spec['droop'] < 0 else 2  # a rising pine limb needs the extra bend
    count, spread = spec.get('tuft', (2, 0.0))
    whorl, turn, z = 0, rng.uniform(0, 6.28), bole
    top = height * (0.94 if stations else 0.97)
    while z < top:
        t = (z - bole) / (height - bole)
        reach = crown * (1 - t) ** spec['profile_power']
        gaps = [rng.uniform(0.65, 1.35) for _ in range(spec['per_whorl'])]
        gap_sum = sum(gaps) or 1.0
        angle_cursor = turn
        for k in range(spec['per_whorl']):
            angle = angle_cursor
            angle_cursor += (gaps[k] / gap_sum) * math.tau
            branch_z = max(bole * 0.85, min(top, z + rng.uniform(-0.18, 0.18) * spec['whorl_spacing']))
            start, trunk_radius = trunk_at(branch_z)
            length = rng.uniform(*spec['length_range']) if 'length_range' in spec else reach * 0.85 * rng.uniform(0.84, 1.16)
            if length < 0.25:
                continue
            pts, dirs, pos = [start.copy()], [], start.copy()
            yaw_bend = rng.uniform(-0.18, 0.18)
            for j in range(segments):
                f = (j + 0.5) / segments
                seg_angle = angle + yaw_bend * (f - 0.25)
                elevation = 0.15 * (1 - f) - spec['droop'] * f + rng.uniform(-0.04, 0.04)
                d = Vector((math.cos(seg_angle) * math.cos(elevation), math.sin(seg_angle) * math.cos(elevation), math.sin(elevation)))
                pos = pos + d * length / segments
                pts.append(pos.copy())
                dirs.append(d)
            r0 = max(0.024, min(0.08, trunk_radius * 0.42 * rng.uniform(0.85, 1.15)))
            branches.append(Branch(pts, [r0 * ((0.012 / max(r0, 1e-4)) ** ((j / segments) ** 0.85)) for j in range(segments + 1)], 1, parent=trunk))
            for s in range(stations):
                f = near if stations == 1 else near + (far - near) * s / (stations - 1)
                at = min(int(f * segments), segments - 1)
                base = pts[at].lerp(pts[at + 1], f * segments - at)
                roll = rng.uniform(0, 3.14)
                key = pick(t)
                width = spec['card_width'] * (0.45 + 0.55 * reach / crown)
                for c in range(count):
                    # A tuft: cards turned evenly about the branch and splayed a little off it.
                    d = (dirs[at] + Vector([rng.gauss(0, spread) for _ in range(3)])).normalized() if spread else dirs[at]
                    cards.append({'base': base, 'dir': d, 'width': width, 'key': key,
                                  'roll': roll + c * math.pi / count, 'whorl': whorl, 'branch': k})
        whorl += 1
        turn += rng.uniform(1.65, 2.85)
        z += spec['whorl_spacing']
    if stations:
        # The top of the crown is one upright leader pair.
        base, _ = trunk_at(height * 0.9)
        key, roll = pick(1.0), rng.uniform(0, 3.14)
        for twist in (0.0, math.pi / 2):
            cards.append({'base': base, 'dir': Vector((0, 0, 1)), 'width': spec['card_width'] * 0.55, 'key': key,
                          'roll': roll + twist, 'whorl': whorl, 'branch': 0})
    for _ in range(rng.randint(3, 5) if spec.get('stubs') else 0):
        # Bare, broken stubs where the lower crown has died back.
        start, tr_r = trunk_at(bole * rng.uniform(0.35, 0.95))
        angle = rng.uniform(0, 6.28)
        d = Vector((math.cos(angle), math.sin(angle), rng.uniform(-0.25, 0.1))).normalized()
        branches.append(Branch([start, start + d * rng.uniform(0.3, 0.9)], [max(0.03, tr_r * 0.26), 0.02], 1, parent=trunk))
    return branches, cards


def drop_to_limit(cards, triangle_limit):
    """Whole cards only, lowest whorls first, alternating branches."""
    order = sorted(range(len(cards)), key=lambda i: (cards[i]['whorl'], cards[i]['branch'] % 2 == 0))
    excess = len(cards) - triangle_limit // 2
    dropped = set(order[:max(0, excess)])
    return [card for i, card in enumerate(cards) if i not in dropped]
