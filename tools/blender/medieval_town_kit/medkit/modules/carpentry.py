"""AAA RPG carpentry, relief woodcarving, and forged wrought-iron hardware primitives.

Used across interior furniture (Wardrobe, Chest, Bookcase, Counter, Bed, Pew,
Writing_Desk, Altar, Lectern) and exterior architectural joinery (Door_Leaf,
stone/timber/Nordic/Med doors and shuttered windows).
"""
import math

from mathutils import Matrix

from ..config import detailed


def _at(x, y, z=0.0):
    return Matrix.Translation((x, y, z))


def molded_cornice(b, x0, x1, y0, y1, z0, h=0.095, overhang=0.055, mat='wood_trim'):
    """Three-tier architectural crown molding overhanging the front (-Y) and sides (-X, +X)."""
    if not detailed():
        b.box((x0 - overhang, y0 - overhang, z0), (x1 + overhang, y1 + 0.01, z0 + h), mat)
        return
    h1 = z0 + h * 0.28
    h2 = z0 + h * 0.64
    h3 = z0 + h
    # Tier 1: lower necking fillet
    b.box((x0 - overhang * 0.35, y0 - overhang * 0.35, z0),
          (x1 + overhang * 0.35, y1 + 0.01, h1), mat, tone=0.90)
    # Tier 2: middle ovolo step
    b.box((x0 - overhang * 0.72, y0 - overhang * 0.72, h1),
          (x1 + overhang * 0.72, y1 + 0.015, h2), mat, tone=0.96)
    # Tier 3: wide chamfered crown cap
    b.box((x0 - overhang, y0 - overhang, h2),
          (x1 + overhang, y1 + 0.02, h3), mat, tone=1.04)


def shaped_bracket_base(b, x0, x1, y0, y1, h=0.15, foot_w=0.15, mat='wood_trim'):
    """Corner bracket feet with scrolled apron cutout along the front (-Y) and sides,
    topped by a stepped plinth rail — matching the carved medieval wardrobe reference."""
    rail_h = 0.036
    leg_top = h - rail_h
    # Top molded plinth molding rail running around the base
    b.box((x0 - 0.018, y0 - 0.018, leg_top), (x1 + 0.018, y1 + 0.01, h), mat, tone=0.98)
    if not detailed():
        b.box((x0, y0, 0), (x1, y1, leg_top), mat, skip=('-z',))
        return

    depth_t = 0.055
    # Four solid corner stiles/feet down to z=0
    for cx0, cx1 in ((x0 - 0.012, x0 + foot_w), (x1 - foot_w, x1 + 0.012)):
        b.box((cx0, y0 - 0.012, 0), (cx1, y0 + depth_t, leg_top), mat, tone=0.92)
        b.box((cx0, y1 - depth_t, 0), (cx1, y1, leg_top), mat, tone=0.88)

    # Scrolled bracket corbels flanking the front central cutout
    apron_low = leg_top * 0.56
    b.box((x0 + foot_w, y0 - 0.008, apron_low),
          (x1 - foot_w, y0 + depth_t * 0.85, leg_top), mat, tone=0.90)
    scroll_w = min(0.14, (x1 - x0 - 2 * foot_w) * 0.28)
    for sign, sx in ((1, x0 + foot_w), (-1, x1 - foot_w)):
        pts = [
            (sx, y0 - 0.008, 0.015),
            (sx + sign * scroll_w * 0.45, y0 - 0.008, apron_low * 0.45),
            (sx + sign * scroll_w, y0 - 0.008, apron_low),
            (sx, y0 - 0.008, apron_low),
        ]
        b.extrude(pts, (0, depth_t * 0.8, 0), mat, tone=0.88)

    # Side skirts (-X and +X) with shallow arch cutout
    for sx0, sx1 in ((x0 - 0.008, x0 + depth_t * 0.8), (x1 - depth_t * 0.8, x1 + 0.008)):
        b.box((sx0, y0 + depth_t, apron_low * 0.65), (sx1, y1 - depth_t, leg_top), mat, tone=0.90)


def carved_relief_motif(b, x0, x1, z0, z1, y_face, style='knotwork'):
    """Builds 3D geometric relief knotwork / interlace inside a recessed panel face (-Y)."""
    w = x1 - x0
    h = z1 - z0
    cx = (x0 + x1) * 0.5
    cz = (z0 + z1) * 0.5
    y_out = y_face - 0.007

    if style == 'frieze':
        # Running horizontal interlace / figure-eight braid frieze
        loops = max(2, int(round(w / 0.11)))
        dx = (w - 0.03) / loops
        r_z = min(0.026, h * 0.34)
        for i in range(loops):
            lx0 = x0 + 0.015 + i * dx
            lx1 = lx0 + dx
            xm = (lx0 + lx1) * 0.5
            b.beam((lx0, y_out, cz - r_z), (xm, y_out, cz + r_z),
                   (0, 1, 0), (-0.006, 0.006), 0.013, 'wood_trim', tone=1.06, bevel=0)
            b.beam((xm, y_out, cz + r_z), (lx1, y_out, cz - r_z),
                   (0, 1, 0), (-0.006, 0.006), 0.013, 'wood_trim', tone=1.06, bevel=0)
            b.beam((lx0, y_out + 0.002, cz + r_z), (xm, y_out + 0.002, cz - r_z),
                   (0, 1, 0), (-0.005, 0.005), 0.012, 'wood_trim', tone=0.88, bevel=0)
            b.beam((xm, y_out + 0.002, cz - r_z), (lx1, y_out + 0.002, cz + r_z),
                   (0, 1, 0), (-0.005, 0.005), 0.012, 'wood_trim', tone=0.88, bevel=0)
        return

    # Full Nordic/Celtic Urnes interlaced dragon-knotwork panel (matches the reference doors)
    mx = w * 0.39
    mz = h * 0.39
    thick = min(0.019, w * 0.072)
    pts_top = (cx, y_out, cz + mz)
    pts_bot = (cx, y_out, cz - mz)
    pts_l = (cx - mx, y_out, cz)
    pts_r = (cx + mx, y_out, cz)
    pts_ul = (cx - mx * 0.78, y_out, cz + mz * 0.78)
    pts_ur = (cx + mx * 0.78, y_out, cz + mz * 0.78)
    pts_bl = (cx - mx * 0.78, y_out, cz - mz * 0.78)
    pts_br = (cx + mx * 0.78, y_out, cz - mz * 0.78)

    # Primary over-strands (warm proud relief)
    for p0, p1 in (
        (pts_top, pts_r), (pts_r, pts_bot), (pts_bot, pts_l), (pts_l, pts_top),
        (pts_ul, pts_br), (pts_ur, pts_bl),
    ):
        b.beam(p0, p1, (0, 1, 0), (-0.006, 0.006), thick, 'wood_trim', tone=1.08, bevel=0)

    # Secondary interwoven figure-eight loops & corner scrolls
    y_under = y_out + 0.0022
    for sx in (-1, 1):
        for sz in (-1, 1):
            c_pt = (cx + sx * mx * 0.84, y_under, cz + sz * mz * 0.84)
            m_x = (cx + sx * mx * 0.18, y_under, cz + sz * mz * 0.94)
            m_z = (cx + sx * mx * 0.94, y_under, cz + sz * mz * 0.18)
            m_in = (cx + sx * mx * 0.35, y_under, cz + sz * mz * 0.35)
            b.beam(c_pt, m_x, (0, 1, 0), (-0.005, 0.005), thick * 0.88, 'wood_trim', tone=0.92, bevel=0)
            b.beam(c_pt, m_z, (0, 1, 0), (-0.005, 0.005), thick * 0.88, 'wood_trim', tone=0.92, bevel=0)
            b.beam(m_x, m_in, (0, 1, 0), (-0.005, 0.005), thick * 0.82, 'wood_trim', tone=0.96, bevel=0)
            b.beam(m_z, m_in, (0, 1, 0), (-0.005, 0.005), thick * 0.82, 'wood_trim', tone=0.96, bevel=0)


def recessed_panel_front(b, x0, x1, z0, z1, y_face, depth=0.022, border=0.026,
                         carved=True, style='knotwork', frame_mat='wood_trim'):
    """Stepped molded panel on a -Y face with recessed field and optional 3D relief carving."""
    if not detailed():
        b.box((x0, y_face, z0), (x1, y_face + depth, z1),
              'carved_wood' if carved else frame_mat, skip=('+y',))
        return

    # Outer stepped molding frame (top/bottom horizontal rails + left/right vertical stiles)
    b.box((x0, y_face, z0), (x1, y_face + depth * 0.55, z0 + border), frame_mat, tone=0.96, bevel=0)
    b.box((x0, y_face, z1 - border), (x1, y_face + depth * 0.55, z1), frame_mat, tone=0.98, bevel=0)
    b.box((x0, y_face, z0 + border), (x0 + border, y_face + depth * 0.55, z1 - border),
          frame_mat, tone=0.94, bevel=0)
    b.box((x1 - border, y_face, z0 + border), (x1, y_face + depth * 0.55, z1 - border),
          frame_mat, tone=0.94, bevel=0)

    # Inner stepped cavity fillet (darker tone to accentuate depth)
    ix0, ix1 = x0 + border, x1 - border
    iz0, iz1 = z0 + border, z1 - border
    lip = border * 0.55
    if (ix1 - ix0) > lip * 2.5 and (iz1 - iz0) > lip * 2.5:
        b.box((ix0, y_face + depth * 0.35, iz0), (ix1, y_face + depth * 0.85, iz0 + lip),
              frame_mat, tone=0.76, bevel=0)
        b.box((ix0, y_face + depth * 0.35, iz1 - lip), (ix1, y_face + depth * 0.85, iz1),
              frame_mat, tone=0.78, bevel=0)
        b.box((ix0, y_face + depth * 0.35, iz0 + lip), (ix0 + lip, y_face + depth * 0.85, iz1 - lip),
              frame_mat, tone=0.74, bevel=0)
        b.box((ix1 - lip, y_face + depth * 0.35, iz0 + lip), (ix1, y_face + depth * 0.85, iz1 - lip),
              frame_mat, tone=0.74, bevel=0)
        fx0, fx1, fz0, fz1 = ix0 + lip, ix1 - lip, iz0 + lip, iz1 - lip
    else:
        fx0, fx1, fz0, fz1 = ix0, ix1, iz0, iz1

    # Recessed panel field
    panel_mat = 'carved_wood' if carved else frame_mat
    b.box((fx0, y_face + depth * 0.65, fz0), (fx1, y_face + depth, fz1),
          panel_mat, tone=0.90, bevel=0, skip=('+y',))
    if carved:
        carved_relief_motif(b, fx0, fx1, fz0, fz1, y_face + depth * 0.65, style=style)


def recessed_panel_side(b, y0, y1, z0, z1, x_face, sign_x, depth=0.02, border=0.03,
                        frame_mat='wood_trim'):
    """Stepped recessed panel on a -X (sign_x=-1) or +X (sign_x=1) cabinet side wall."""
    x_in = x_face - sign_x * depth
    x_lo, x_hi = (x_face, x_in) if sign_x < 0 else (x_in, x_face)
    b.box((x_lo, y0 + border, z0 + border), (x_hi, y1 - border, z1 - border),
          frame_mat, tone=0.88, bevel=0)
    if not detailed():
        return
    f_lo, f_hi = (x_face, x_face - sign_x * depth * 0.55) if sign_x < 0 else (x_face - sign_x * depth * 0.55, x_face)
    b.box((f_lo, y0, z0), (f_hi, y1, z0 + border), frame_mat, tone=0.92, bevel=0)
    b.box((f_lo, y0, z1 - border), (f_hi, y1, z1), frame_mat, tone=0.94, bevel=0)
    b.box((f_lo, y0, z0 + border), (f_hi, y0 + border, z1 - border), frame_mat, tone=0.90, bevel=0)
    b.box((f_lo, y1 - border, z0 + border), (f_hi, y1, z1 - border), frame_mat, tone=0.90, bevel=0)


def ornate_strap_hinge(b, x_hinge, z_center, strap_len, y_face, dir_x=1):
    """Forged wrought-iron fleur-de-lis / C-scroll strap hinge with spear tip and domed rivets."""
    s = 1 if dir_x >= 0 else -1
    y_plate = y_face - 0.008
    if not detailed():
        x0, x1 = (x_hinge, x_hinge + s * strap_len) if s > 0 else (x_hinge + s * strap_len, x_hinge)
        b.box((x0, y_plate, z_center - 0.025), (x1, y_face + 0.002, z_center + 0.025), 'iron', bevel=0)
        return

    # Vertical knuckle barrel on the hinge pin edge
    b.lathe([(0.0, z_center - 0.085), (0.016, z_center - 0.085),
             (0.016, z_center + 0.085), (0.0, z_center + 0.085)],
            6, 'iron', m=_at(x_hinge, y_face - 0.004), smooth=False)

    # Scrolled crescent / fleur-de-lis baseplate at the stile
    scroll_h = 0.115
    scroll_w = 0.068
    c_pts = [
        (x_hinge, y_plate, z_center - scroll_h),
        (x_hinge + s * scroll_w * 0.85, y_plate, z_center - scroll_h * 0.72),
        (x_hinge + s * scroll_w * 0.45, y_plate, z_center - 0.028),
        (x_hinge + s * scroll_w * 0.45, y_plate, z_center + 0.028),
        (x_hinge + s * scroll_w * 0.85, y_plate, z_center + scroll_h * 0.72),
        (x_hinge, y_plate, z_center + scroll_h),
    ]
    b.extrude(c_pts, (0, 0.01, 0), 'iron')

    # Tapering strap with mid-length diamond swell and spear-point finial
    x_mid = x_hinge + s * (strap_len * 0.48)
    x_neck = x_hinge + s * (strap_len * 0.84)
    x_tip = x_hinge + s * strap_len
    strap_pts = [
        (x_hinge + s * 0.02, y_plate, z_center - 0.028),
        (x_mid, y_plate, z_center - 0.034),
        (x_neck, y_plate, z_center - 0.018),
        (x_neck + s * 0.022, y_plate, z_center - 0.032),
        (x_tip, y_plate, z_center),
        (x_neck + s * 0.022, y_plate, z_center + 0.032),
        (x_neck, y_plate, z_center + 0.018),
        (x_mid, y_plate, z_center + 0.034),
        (x_hinge + s * 0.02, y_plate, z_center + 0.028),
    ]
    b.extrude(strap_pts, (0, 0.01, 0), 'iron')

    # Raised forged dome rivets along scroll and strap
    rivets = [
        (x_hinge + s * 0.028, z_center - scroll_h * 0.62),
        (x_hinge + s * 0.028, z_center + scroll_h * 0.62),
        (x_hinge + s * (strap_len * 0.24), z_center),
        (x_mid, z_center),
        (x_hinge + s * (strap_len * 0.72), z_center),
    ]
    for rx, rz in rivets:
        b.box((rx - 0.008, y_plate - 0.006, rz - 0.008),
              (rx + 0.008, y_plate + 0.002, rz + 0.008), 'iron', bevel=0)


def iron_latch_and_ring(b, x_split, z_center, y_face):
    """Wrought-iron double-door sliding bolt latch, scalloped backplates, and hanging ring pull."""
    y_plate = y_face - 0.008
    # Left & right scalloped escutcheon backplates
    for sx in (-1, 1):
        px = x_split + sx * 0.055
        pts = [
            (px - 0.018, y_plate, z_center - 0.065),
            (px + 0.018, y_plate, z_center - 0.065),
            (px + 0.024, y_plate, z_center),
            (px + 0.018, y_plate, z_center + 0.065),
            (px - 0.018, y_plate, z_center + 0.065),
            (px - 0.024, y_plate, z_center),
        ]
        b.extrude(pts, (0, 0.01, 0), 'iron')
    # Sliding horizontal bolt bar across the centre split
    b.box((x_split - 0.068, y_plate - 0.012, z_center + 0.008),
          (x_split + 0.088, y_plate, z_center + 0.024), 'iron', bevel=0)
    if not detailed():
        return
    # Forged keeper staples & hanging ring pull on the right plate
    rx = x_split + 0.032
    rz = z_center - 0.055
    for k in range(8):
        a0 = 2 * math.pi * k / 8
        a1 = 2 * math.pi * (k + 1) / 8
        p0 = (rx + 0.022 * math.sin(a0), y_plate - 0.012, rz + 0.038 * math.cos(a0))
        p1 = (rx + 0.022 * math.sin(a1), y_plate - 0.012, rz + 0.038 * math.cos(a1))
        b.beam(p0, p1, (0, 1, 0), (-0.005, 0.005), 0.01, 'iron', bevel=0)
