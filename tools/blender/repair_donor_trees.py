"""Repair donor meadow (tree1..9) and alpine (tree10..11) bark meshes."""

from __future__ import annotations

import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree


def _connected_components(bm: bmesh.types.BMesh) -> list[list[bmesh.types.BMVert]]:
    bm.verts.ensure_lookup_table()
    visited: set[int] = set()
    comps: list[list[bmesh.types.BMVert]] = []
    for v in bm.verts:
        if v.index in visited:
            continue
        comp: list[bmesh.types.BMVert] = []
        stack = [v]
        visited.add(v.index)
        while stack:
            curr = stack.pop()
            comp.append(curr)
            for e in curr.link_edges:
                other = e.other_vert(curr)
                if other.index not in visited:
                    visited.add(other.index)
                    stack.append(other)
        comps.append(comp)
    comps.sort(key=len, reverse=True)
    return comps


def _trunk_slice_center_radius(
    trunk_verts: list[bmesh.types.BMVert], z: float, window: float
) -> tuple[float, float, float]:
    pts = [v.co for v in trunk_verts if abs(v.co.z - z) <= window]
    if not pts:
        nearest = min(trunk_verts, key=lambda v: abs(v.co.z - z))
        pts = [v.co for v in trunk_verts if abs(v.co.z - nearest.co.z) <= window]
    cx = sum(p.x for p in pts) / len(pts)
    cy = sum(p.y for p in pts) / len(pts)
    radii = sorted(math.hypot(p.x - cx, p.y - cy) for p in pts)
    r = radii[len(radii) // 2] if radii else 0.12
    return cx, cy, max(r, 1e-4)


def _trunk_bend_offset(z_norm: float, t_height: float, seed: int) -> Vector:
    """Seed-deterministic, grounded natural trunk sweep (zero at z_norm == 0)."""
    t = max(0.0, min(1.0, z_norm))
    p1 = seed * 1.73 + 0.4
    p2 = seed * 2.91 + 1.6
    dir1 = Vector((math.cos(p1), math.sin(p1), 0.0))
    dir2 = Vector((-dir1.y, dir1.x, 0.0))
    sweep1 = 0.036 * t_height * (0.72 * math.sin(t * math.pi * 1.15) + 0.28 * math.sin(t * math.pi * 2.1))
    sweep2 = 0.018 * t_height * math.sin(max(0.0, t - 0.14) * math.pi * 1.7 + p2 * 0.15)
    # Ease back slightly near crown top so upper canopy stays centered over base
    crown_ease = 1.0 - 0.35 * (t ** 2.2)
    return (dir1 * sweep1 + dir2 * sweep2) * crown_ease


def _trunk_spine_samples(
    trunk_verts: list[bmesh.types.BMVert], t_min_z: float, t_height: float, n_slices: int = 14
) -> list[tuple[float, float, float, float]]:
    """Return sorted (z, cx, cy, median_r) slices along the trunk."""
    samples = []
    half_win = max(0.035 * t_height, 0.5 * (t_height / n_slices))
    for i in range(n_slices + 1):
        z = t_min_z + (i / n_slices) * t_height
        cx, cy, r = _trunk_slice_center_radius(trunk_verts, z, window=half_win)
        samples.append((z, cx, cy, r))
    return samples


def _interp_trunk_spine(
    samples: list[tuple[float, float, float, float]], z: float
) -> tuple[float, float, float]:
    if z <= samples[0][0]:
        return samples[0][1], samples[0][2], samples[0][3]
    if z >= samples[-1][0]:
        return samples[-1][1], samples[-1][2], samples[-1][3]
    for (z0, x0, y0, r0), (z1, x1, y1, r1) in zip(samples, samples[1:]):
        if z0 <= z <= z1:
            span = max(1e-5, z1 - z0)
            f = (z - z0) / span
            return x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, r0 + (r1 - r0) * f
    return samples[-1][1], samples[-1][2], samples[-1][3]


def _reshape_donor_trunk(
    trunk_verts: list[bmesh.types.BMVert],
    t_min_z: float,
    t_height: float,
    seed: int,
) -> list[tuple[float, float, float, float]]:
    """Apply subtle natural bend, gradual taper above the flare, and vertical asymmetry."""
    samples = _trunk_spine_samples(trunk_verts, t_min_z, t_height)
    # Build monotonic gradual bole taper reference above the root collar (z_norm >= 0.14)
    bole_base_idx = min(len(samples) - 1, max(1, int(round(0.16 * (len(samples) - 1)))))
    r_bole = samples[bole_base_idx][3]
    phase2 = seed * 1.91 + 0.5
    phase3 = seed * 2.63 + 1.2

    for v in trunk_verts:
        z_norm = max(0.0, min(1.0, (v.co.z - t_min_z) / t_height))
        cx, cy, r_med = _interp_trunk_spine(samples, v.co.z)
        dx = v.co.x - cx
        dy = v.co.y - cy
        r_v = math.hypot(dx, dy)
        if r_v > 1e-5:
            theta = math.atan2(dy, dx)
            # Cure stagnant upper-trunk cylinder sections by blending toward a gradual power taper
            taper_env = max(0.0, (z_norm - 0.12) / 0.88)
            r_expected = r_bole * (1.0 - 0.52 * (taper_env ** 0.86))
            r_capped = min(r_v, r_expected * 1.18) if z_norm > 0.25 and r_v > r_expected else r_v
            if z_norm > 0.35 and r_med > r_expected:
                r_capped = r_v * (r_expected / max(r_med, 1e-4))
            asym = 1.0 + (1.0 - 0.45 * z_norm) * (
                0.070 * math.cos(2.0 * theta + phase2 + 0.8 * z_norm)
                + 0.042 * math.cos(3.0 * theta + phase3 - 0.6 * z_norm)
            )
            scale = (r_capped / r_v) * asym
            v.co.x = cx + dx * scale
            v.co.y = cy + dy * scale

        bend = _trunk_bend_offset(z_norm, t_height, seed)
        v.co.x += bend.x
        v.co.y += bend.y

    return _trunk_spine_samples(trunk_verts, t_min_z, t_height)


def _add_donor_root_spurs(
    bm: bmesh.types.BMesh,
    uv_layer: bmesh.types.BMLayerItem,
    trunk_verts: list[bmesh.types.BMVert],
    t_min_z: float,
    t_height: float,
    seed: int,
    n_spurs: int = 4,
    steps: int = 3,
) -> None:
    """Subdivide the lower donor trunk and sculpt its own vertices into an asymmetric,
    concave root flare without creating a regular bell skirt."""
    trunk_set = set(trunk_verts)
    subdiv_top_z = t_min_z + 0.15 * t_height
    low_edges = [
        e
        for e in bm.edges
        if e.verts[0] in trunk_set
        and e.verts[1] in trunk_set
        and max(e.verts[0].co.z, e.verts[1].co.z) <= subdiv_top_z
    ]
    if low_edges:
        bmesh.ops.subdivide_edges(bm, edges=low_edges, cuts=1, use_grid_fill=True)

    comps = _connected_components(bm)
    sculpt_verts = [
        v
        for comp in comps
        if min(u.co.z for u in comp) <= t_min_z + 0.05 * t_height
        for v in comp
    ] or comps[0]

    foot_cx, foot_cy, foot_r = _trunk_slice_center_radius(
        sculpt_verts, t_min_z + 0.025 * t_height, window=0.03 * t_height
    )
    mid_cx, mid_cy, mid_r = _trunk_slice_center_radius(
        sculpt_verts, t_min_z + 0.16 * t_height, window=0.035 * t_height
    )
    ref_r = max(mid_r, foot_r * 0.72, 0.02 * t_height)
    flare_top_z = t_min_z + 0.19 * t_height

    # Build irregular root headings with paired buttresses and open concave sinuses
    actual_spurs = 4 if (seed % 2 == 0) else max(4, n_spurs)
    base_ang_w = min(0.32, math.pi / (actual_spurs * 1.55))
    gaps = [
        0.58 + 0.84 * (0.5 + 0.5 * math.sin(seed * 1.9 + i * 2.37))
        for i in range(actual_spurs)
    ]
    gap_sum = sum(gaps) or 1.0
    ang_cursor = (seed * 1.13) % (2.0 * math.pi)
    spurs = []
    for s_idx, gap in enumerate(gaps):
        angle = ang_cursor % (2.0 * math.pi)
        ang_cursor += (gap / gap_sum) * (2.0 * math.pi)
        # 2 dominant structural spurs and 2-3 subordinate spurs for natural asymmetry
        is_dominant = (s_idx % 2 == 0)
        if is_dominant:
            up_h = t_height * (0.13 + 0.035 * abs(math.cos(seed * 1.3 + s_idx * 1.9)))
            out_r = ref_r * (0.68 + 0.24 * abs(math.sin(seed * 1.7 + s_idx * 2.1)))
        else:
            up_h = t_height * (0.075 + 0.028 * abs(math.sin(seed * 2.3 + s_idx * 1.7)))
            out_r = ref_r * (0.34 + 0.22 * abs(math.cos(seed * 2.1 + s_idx * 1.4)))
        curv = 0.20 * math.sin(seed * 2.4 + s_idx * 1.8)
        spurs.append((angle, up_h, out_r, curv, 1.0 if is_dominant else 0.78))

    for v in sculpt_verts:
        z_rel = v.co.z - t_min_z
        if z_rel < flare_top_z - t_min_z:
            u_axis = max(0.0, min(1.0, z_rel / max(1e-4, 0.16 * t_height)))
            cx = foot_cx * (1.0 - u_axis) + mid_cx * u_axis
            cy = foot_cy * (1.0 - u_axis) + mid_cy * u_axis
            dx = v.co.x - cx
            dy = v.co.y - cy
            r_orig = math.hypot(dx, dy)
            if r_orig > 1e-5:
                theta_0 = math.atan2(dy, dx)
                theta_shift = 0.0
                for angle, up_h, _, curv, _ in spurs:
                    h_k = max(0.0, min(1.0, z_rel / max(1e-4, up_h)))
                    if h_k >= 1.0:
                        continue
                    az_k = angle + curv * ((1.0 - h_k) ** 1.45)
                    dth = math.atan2(math.sin(theta_0 - az_k), math.cos(theta_0 - az_k))
                    pinch_env = ((1.0 - h_k) ** 1.35) * math.exp(-((dth / (base_ang_w * 1.5)) ** 2))
                    theta_shift -= 0.42 * dth * pinch_env
                theta = theta_0 + theta_shift

                h_collar = max(0.0, min(1.0, z_rel / max(1e-4, 0.07 * t_height)))
                # Minimal sinus swell so concave hollows stay crisp between buttresses
                valley_swell = 1.0 + 0.05 * ((1.0 - h_collar) ** 2.6)

                ext_total = 0.0
                for angle, up_h, out_r, curv, width_mul in spurs:
                    h_k = max(0.0, min(1.0, z_rel / max(1e-4, up_h)))
                    if h_k >= 1.0:
                        continue
                    az_k = angle + curv * ((1.0 - h_k) ** 1.45)
                    dth = math.atan2(math.sin(theta - az_k), math.cos(theta - az_k))
                    ang_w = base_ang_w * width_mul * (0.72 + 0.28 * h_k)
                    if abs(dth) >= ang_w * 1.75:
                        continue
                    lobe = math.exp(-((dth / ang_w) ** 2)) * (
                        math.cos(min(math.pi * 0.5, abs(dth) / (ang_w * 1.75))) ** 2
                    )
                    h_low = max(0.0, min(1.0, z_rel / max(1e-4, up_h * 0.44)))
                    j_curve = 0.24 * ((1.0 - h_k) ** 2.4) + 0.76 * ((1.0 - h_low) ** 2.25)
                    ext_k = out_r * j_curve * lobe
                    if ext_k > ext_total:
                        ext_total = ext_k

                r_new = r_orig * valley_swell + ext_total
                v.co.x = cx + math.cos(theta) * r_new
                v.co.y = cy + math.sin(theta) * r_new
        if v.co.z < t_min_z + 0.008 * t_height:
            v.co.z = t_min_z - 0.010 * t_height


def _collect_branch_rings(
    comp: list[bmesh.types.BMVert],
    parent_verts: list[bmesh.types.BMVert],
    tree_height: float,
) -> tuple[list[list[bmesh.types.BMVert]], Vector, Vector, float]:
    """Trace longitudinal vertex rings along a tubular branch from its parent-facing base."""
    kd = KDTree(len(parent_verts))
    for i, pv in enumerate(parent_verts):
        kd.insert(pv.co, i)
    kd.balance()

    comp_set = set(comp)
    boundary_verts = [v for v in comp if v.is_boundary]
    search_verts = boundary_verts if boundary_verts else comp

    best_v = None
    best_parent_co = None
    best_dist = 1e9
    for v in search_verts:
        co, _, dist = kd.find(v.co)
        if dist < best_dist:
            best_dist = dist
            best_v = v
            best_parent_co = co.copy()

    if best_v is None or best_parent_co is None:
        return [], Vector((0.0, 0.0, 0.0)), Vector((0.0, 0.0, 0.0)), 0.0

    max_ring0_span = 0.055 * tree_height
    ring0: list[bmesh.types.BMVert] = []
    visited: set[bmesh.types.BMVert] = {best_v}
    stack = [best_v]
    while stack:
        curr = stack.pop()
        ring0.append(curr)
        for e in curr.link_edges:
            if e.is_boundary:
                other = e.other_vert(curr)
                if (
                    other in comp_set
                    and other not in visited
                    and (other.co - best_v.co).length <= max_ring0_span
                ):
                    visited.add(other)
                    stack.append(other)

    if len(ring0) < 3:
        ring0 = [v for v in comp if (v.co - best_v.co).length <= 0.028 * tree_height]
        visited = set(ring0)

    rings: list[list[bmesh.types.BMVert]] = [ring0]
    frontier = ring0
    while frontier:
        next_ring: list[bmesh.types.BMVert] = []
        for v in frontier:
            for e in v.link_edges:
                other = e.other_vert(v)
                if other in comp_set and other not in visited:
                    visited.add(other)
                    next_ring.append(other)
        if not next_ring:
            break
        rings.append(next_ring)
        frontier = next_ring

    ring0_center = sum((v.co for v in ring0), Vector((0.0, 0.0, 0.0))) / len(ring0)
    ring0_radius = sum((v.co - ring0_center).length for v in ring0) / len(ring0)
    return rings, best_parent_co, ring0_center, ring0_radius


def _reshape_branch_component(
    comp: list[bmesh.types.BMVert],
    parent_verts: list[bmesh.types.BMVert],
    tree_height: float,
    t_min_z: float,
    seed: int,
    branch_idx: int,
    trunk_samples: list[tuple[float, float, float, float]] | None = None,
    is_secondary: bool = False,
) -> float:
    """Seat branch collar smoothly inside parent, enforce proportional taper, and add organic bend/twist."""
    rings, best_parent_co, ring0_center, ring0_radius = _collect_branch_rings(
        comp, parent_verts, tree_height
    )
    if len(rings) < 2:
        return 999.0

    # Estimate parent center and radius near attachment height
    p_window = max(0.025 * tree_height, ring0_radius * 2.6)
    p_neighbors = [pv.co for pv in parent_verts if (pv.co - best_parent_co).length <= p_window * 2.2]
    parent_center = (
        sum(p_neighbors, Vector((0.0, 0.0, 0.0))) / len(p_neighbors)
        if p_neighbors
        else best_parent_co
    )
    parent_r = (
        sum((p - parent_center).length for p in p_neighbors) / max(1, len(p_neighbors))
        if p_neighbors
        else max(ring0_radius * 1.8, 0.02 * tree_height)
    )
    if trunk_samples is not None and not is_secondary:
        cx_t, cy_t, tr_t = _interp_trunk_spine(trunk_samples, ring0_center.z)
        parent_center = Vector((cx_t, cy_t, ring0_center.z))
        parent_r = tr_t

    seat_target = best_parent_co.lerp(parent_center, 0.78 if not is_secondary else 0.68)
    base_delta = seat_target - ring0_center
    max_pull = max(ring0_radius * 4.0, (0.065 if not is_secondary else 0.060) * tree_height)
    if base_delta.length > max_pull:
        base_delta = base_delta.normalized() * max_pull

    ring_centers = [sum((v.co for v in r), Vector((0.0, 0.0, 0.0))) / len(r) for r in rings]
    tip_center = ring_centers[-1]
    branch_axis = tip_center - ring0_center
    branch_len = max(1e-4, branch_axis.length)
    branch_dir = branch_axis / branch_len

    # Orthogonal axes for subtle natural arch and directional twist
    side_axis = Vector((-branch_dir.y, branch_dir.x, 0.0))
    if side_axis.length < 1e-4:
        side_axis = Vector((1.0, 0.0, 0.0))
    side_axis.normalize()
    arch_axis = branch_dir.cross(side_axis).normalized()
    if arch_axis.z < 0:
        arch_axis = -arch_axis

    phase = seed * 2.17 + branch_idx * 1.43
    arch_amp = branch_len * (0.065 + 0.045 * math.sin(phase)) * (1.0 if not is_secondary else 0.75)
    crook_amp = branch_len * 0.048 * math.cos(phase * 1.3)

    # Proportional base radius relative to supporting parent & smooth power taper toward tip
    max_ratio = 0.58 if not is_secondary else 0.66
    min_ratio = 0.28 if not is_secondary else 0.25
    target_base_r = min(max(ring0_radius, parent_r * min_ratio), parent_r * max_ratio)
    tip_ratio = 0.26 if not is_secondary else 0.22

    n_rings = len(rings)
    for k, r_verts in enumerate(rings):
        u = k / max(1, n_rings - 1)
        rc = ring_centers[k]
        raw_r = sum((v.co - rc).length for v in r_verts) / max(1, len(r_verts))

        # Smooth collar swell over basal 18%, blending into gradual power taper
        collar = 1.0 + 0.16 * ((1.0 - min(1.0, u / 0.22)) ** 2)
        desired_r = target_base_r * (1.0 - (1.0 - tip_ratio) * (u ** 0.85)) * collar
        rad_scale = desired_r / max(raw_r, 1e-5)

        # Follow trunk base movement decaying to 0 at tip so distal tips stay inside foliage
        seat_w = (1.0 - u) ** 1.35
        bend_w = math.sin(u * math.pi)
        twist_w = math.sin(u * math.pi * 1.75) * (1.0 - 0.3 * u)
        curve_offset = arch_axis * (arch_amp * bend_w) + side_axis * (crook_amp * twist_w)

        for v in r_verts:
            offset = v.co - rc
            # Slightly deepen vertical axis at base collar for oval trunk-branch blending
            if k <= 1:
                offset.z *= 1.12
            v.co = rc + offset * rad_scale + base_delta * seat_w + curve_offset
            if is_secondary and v.co.z < t_min_z + 0.15 * tree_height:
                v.co.z = max(t_min_z + 0.15 * tree_height, v.co.z)

    return (best_parent_co - ring0_center).length


def _collar_branch_by_boundary_rings(
    comp: list[bmesh.types.BMVert],
    parent_verts: list[bmesh.types.BMVert],
    tree_height: float,
    collar_scales: tuple[float, float, float] = (0.78, 1.28, 1.10),
) -> None:
    """Backward-compatible wrapper around `_reshape_branch_component` for external callers."""
    _reshape_branch_component(
        comp,
        parent_verts,
        tree_height,
        min(v.co.z for v in parent_verts),
        seed=1,
        branch_idx=0,
        trunk_samples=None,
        is_secondary=False,
    )


def repair_meadow_tree(idx: int, donor_dir: Path, existing_dir: Path, out_dir: Path) -> None:
    donor_path = donor_dir / f"tree{idx}.glb"
    existing_path = existing_dir / f"tree{idx}.glb"
    out_path = out_dir / f"tree{idx}.glb"

    bpy.ops.wm.read_factory_settings(use_empty=True)

    # 1. Import existing prepared runtime source
    bpy.ops.import_scene.gltf(filepath=str(existing_path))
    existing_objs = list(bpy.context.selected_objects)
    existing_bark = None
    for obj in existing_objs:
        if obj.type == "MESH":
            mats = [m.name for m in obj.data.materials if m]
            if "Meadow bark" in mats or obj.name.startswith("Mesh_0") or "Branches" in obj.name:
                existing_bark = obj
                break
    if existing_bark is None:
        raise RuntimeError(f"tree{idx}: could not find bark mesh in {existing_path}")

    bark_mat = existing_bark.data.materials[0]
    bark_node_name = existing_bark.name

    # 2. Import raw un-decimated donor from grass-test
    bpy.ops.import_scene.gltf(filepath=str(donor_path))
    donor_objs = [o for o in bpy.context.selected_objects if o not in existing_objs]
    donor_bark = None
    for obj in donor_objs:
        if obj.type == "MESH":
            mats = [m.name.lower() for m in obj.data.materials if m]
            if any("branch" in m for m in mats) or obj.data.name.startswith("Mesh_0"):
                donor_bark = obj
                break
    if donor_bark is None:
        raise RuntimeError(f"tree{idx}: could not find donor Mesh_0 in {donor_path}")

    old_bark_mesh = existing_bark.data
    existing_bark.data = donor_bark.data.copy()
    existing_bark.name = bark_node_name
    existing_bark.data.name = "Mesh_0"
    existing_bark.data.materials.clear()
    existing_bark.data.materials.append(bark_mat)

    for obj in donor_objs:
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.meshes.remove(old_bark_mesh, do_unlink=True)

    mesh = existing_bark.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.verify()

    # Weld duplicate glTF UV-seam vertices while preserving per-loop UVs
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)

    # Bake KHR_texture_transform scale=[1, 0.2] for trees 4..9
    if idx >= 4:
        for f in bm.faces:
            for loop in f.loops:
                uv = loop[uv_layer].uv
                loop[uv_layer].uv = (uv.x, 1.0 - (1.0 - uv.y) * 0.2)

    all_zs = [v.co.z for v in bm.verts]
    global_max_z = max(all_zs)
    tree_height = max(1.0, global_max_z)

    comps = _connected_components(bm)

    # Identify trunk components:
    # - comps[0] is ALWAYS either the single-piece trunk (tree2, 3, 4: min_z ~ 0, max_z == global_max_z)
    #   or upper_trunk (tree1, 5, 6, 7, 8, 9: min_z ~ 0.48..0.65 * tree_height, max_z == global_max_z)
    # - In two-piece trunks, lower_trunk is the component with min_z ~ 0 and max_z ~ min_z(upper_trunk)
    top_trunk = comps[0]
    top_min_z = min(v.co.z for v in top_trunk)

    lower_trunk = None
    upper_trunk = None
    if top_min_z > 0.20 * tree_height:
        upper_trunk = top_trunk
        for comp in comps[1:]:
            zs = [v.co.z for v in comp]
            if len(comp) >= 95 and abs(min(zs)) < 0.02 * tree_height and abs(max(zs) - top_min_z) < 0.05 * tree_height:
                lower_trunk = comp
                break
    else:
        lower_trunk = top_trunk

    # Seamlessly align lower_trunk + upper_trunk across z_join if split
    if upper_trunk is not None and lower_trunk is not None:
        z_join = top_min_z
        ring_win = 0.015 * tree_height
        up_ring = [v for v in upper_trunk if v.is_boundary and abs(v.co.z - z_join) <= ring_win]
        if not up_ring:
            up_ring = [v for v in upper_trunk if abs(v.co.z - z_join) <= ring_win]
        cx = sum(v.co.x for v in up_ring) / max(1, len(up_ring))
        cy = sum(v.co.y for v in up_ring) / max(1, len(up_ring))
        r_up = sum(math.hypot(v.co.x - cx, v.co.y - cy) for v in up_ring) / max(1, len(up_ring))

        low_top = [v for v in lower_trunk if v.is_boundary and abs(v.co.z - z_join) <= ring_win]
        if not low_top:
            low_top = [v for v in lower_trunk if abs(v.co.z - z_join) <= ring_win]
        r_low = sum(math.hypot(v.co.x - cx, v.co.y - cy) for v in low_top) / max(1, len(low_top))

        low_min_z = min(v.co.z for v in lower_trunk)
        low_span = max(0.1, z_join - low_min_z)
        for v in lower_trunk:
            t = max(0.0, min(1.0, (v.co.z - low_min_z) / low_span))
            dx = v.co.x - cx
            dy = v.co.y - cy
            cur_r = math.hypot(dx, dy)
            if cur_r > 1e-4:
                target_top_scale = r_up / max(1e-4, r_low)
                blend = t * t * (3.0 - 2.0 * t)
                scale = (1.0 - blend) * 1.0 + blend * target_top_scale
                v.co.x = cx + dx * scale
                v.co.y = cy + dy * scale

        for v in low_top:
            nearest_u = min(up_ring, key=lambda u: math.hypot(u.co.x - v.co.x, u.co.y - v.co.y))
            v.co = nearest_u.co.copy()
        bmesh.ops.remove_doubles(bm, verts=low_top + up_ring, dist=0.02 * tree_height)

    trunk_verts = list(lower_trunk) + (list(upper_trunk) if upper_trunk is not None else [])
    trunk_set = set(trunk_verts)

    trunk_zs = [v.co.z for v in trunk_verts]
    t_min_z, t_max_z = min(trunk_zs), max(trunk_zs)
    t_height = max(1.0, t_max_z - t_min_z)

    # Filter non-trunk components:
    # - Drop detached spider-leg root pipes (max_z < 0.08 * t_height)
    # - Keep all primary branches (len >= 108)
    # - Keep up to 10 structural secondary fork branches attached to primary limbs
    #   to provide organic fork connections into the crown while staying inside the tri budget
    sec_candidates: list[tuple[float, int, list[bmesh.types.BMVert]]] = []
    drop_verts: set[bmesh.types.BMVert] = set()
    prim_only_verts: list[bmesh.types.BMVert] = []
    raw_sec: list[list[bmesh.types.BMVert]] = []
    for comp in comps:
        if comp is lower_trunk or comp is upper_trunk:
            continue
        zs = [v.co.z for v in comp]
        if max(zs) < t_min_z + 0.08 * t_height or len(comp) < 32:
            drop_verts.update(comp)
        elif len(comp) >= 108:
            prim_only_verts.extend(comp)
        elif min(zs) >= t_min_z + 0.18 * t_height:
            raw_sec.append(comp)
        else:
            drop_verts.update(comp)

    if raw_sec and prim_only_verts:
        prim_kd = KDTree(len(prim_only_verts))
        for i, pv in enumerate(prim_only_verts):
            prim_kd.insert(pv.co, i)
        prim_kd.balance()
        for comp in raw_sec:
            min_d = min(prim_kd.find(v.co)[2] for v in comp)
            if min_d <= 0.14 * t_height:
                span = max((v.co - comp[0].co).length for v in comp)
                sec_candidates.append((span, len(comp), comp))
            else:
                drop_verts.update(comp)
    else:
        for comp in raw_sec:
            drop_verts.update(comp)

    sec_candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    for _, _, comp in sec_candidates[7:]:
        drop_verts.update(comp)

    if drop_verts:
        drop_faces = [f for f in bm.faces if any(v in drop_verts for v in f.verts)]
        bmesh.ops.delete(bm, geom=drop_faces, context="FACES")
        orphan_verts = [v for v in bm.verts if not v.link_faces]
        if orphan_verts:
            bmesh.ops.delete(bm, geom=orphan_verts, context="VERTS")

    # Recompute components: separate trunk, primary branches, and secondary forks
    comps = _connected_components(bm)
    surviving_trunk: list[bmesh.types.BMVert] = []
    primary_comps: list[list[bmesh.types.BMVert]] = []
    secondary_comps: list[list[bmesh.types.BMVert]] = []
    for comp in comps:
        zs = [v.co.z for v in comp]
        if min(zs) < t_min_z + 0.02 * t_height or max(zs) >= global_max_z - 0.01 * t_height:
            surviving_trunk.extend(comp)
        elif len(comp) >= 108:
            primary_comps.append(comp)
        else:
            secondary_comps.append(comp)

    trunk_samples = _reshape_donor_trunk(surviving_trunk, t_min_z, t_height, seed=idx)

    primary_comps.sort(key=lambda c: min(v.co.z for v in c))
    for b_idx, comp in enumerate(primary_comps):
        _reshape_branch_component(
            comp,
            surviving_trunk,
            t_height,
            t_min_z,
            seed=idx,
            branch_idx=b_idx,
            trunk_samples=trunk_samples,
            is_secondary=False,
        )

    fork_parents = [v for comp in primary_comps for v in comp] or list(surviving_trunk)
    secondary_comps.sort(key=lambda c: min(v.co.z for v in c))
    for s_idx, comp in enumerate(secondary_comps):
        _reshape_branch_component(
            comp,
            fork_parents,
            t_height,
            t_min_z,
            seed=idx,
            branch_idx=100 + s_idx,
            trunk_samples=None,
            is_secondary=True,
        )

    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    # Lightly decimate ONLY non-trunk branch vertices so total with 4-5 root spurs (<= 220 tris) <= 1,980
    total_tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
    if total_tris > 1740:
        bm2 = bmesh.new()
        bm2.from_mesh(mesh)
        comps2 = _connected_components(bm2)
        trunk_indices: set[int] = set()
        for comp in comps2:
            zs = [v.co.z for v in comp]
            if min(zs) < t_min_z + 0.02 * t_height or max(zs) >= global_max_z - 0.01 * t_height:
                trunk_indices.update(v.index for v in comp)
        trunk_tris = sum(
            len(f.verts) - 2 for f in bm2.faces if any(v.index in trunk_indices for v in f.verts)
        )
        bm2.free()

        vg = existing_bark.vertex_groups.new(name="NonTrunk")
        non_trunk_indices = [v.index for v in mesh.vertices if v.index not in trunk_indices]
        vg.add(non_trunk_indices, 1.0, "REPLACE")

        branch_tris = max(1, total_tris - trunk_tris)
        target_branch_tris = max(400, 1730 - trunk_tris)
        ratio = max(0.36, min(0.95, target_branch_tris / branch_tris))

        bpy.context.view_layer.objects.active = existing_bark
        mod = existing_bark.modifiers.new(name="BranchDecimate", type="DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.vertex_group = vg.name
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
        existing_bark.vertex_groups.clear()

    bm3 = bmesh.new()
    bm3.from_mesh(existing_bark.data)
    uv3 = bm3.loops.layers.uv.active or bm3.loops.layers.uv.verify()
    comps3 = _connected_components(bm3)
    trunk3 = [
        v
        for comp in comps3
        if min( u.co.z for u in comp) < t_min_z + 0.05 * t_height
        for v in comp
    ] or comps3[0]
    _add_donor_root_spurs(bm3, uv3, trunk3, t_min_z, t_height, seed=idx, n_spurs=5, steps=3)
    bmesh.ops.dissolve_degenerate(bm3, dist=1e-5, edges=bm3.edges)
    orphan = [v for v in bm3.verts if not v.link_faces]
    if orphan:
        bmesh.ops.delete(bm3, geom=orphan, context="VERTS")
    bmesh.ops.recalc_face_normals(bm3, faces=bm3.faces)
    bm3.to_mesh(existing_bark.data)
    bm3.free()
    existing_bark.data.update()

    for poly in existing_bark.data.polygons:
        poly.use_smooth = True

    final_bark_tris = sum(len(p.vertices) - 2 for p in existing_bark.data.polygons)
    leaf_objs = [o for o in bpy.data.objects if o.type == "MESH" and o != existing_bark]
    leaf_tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in leaf_objs)
    print(f"meadow tree{idx}: repaired bark tris={final_bark_tris}, leaves tris={leaf_tris}")

    bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format="GLB",
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
    )


def repair_alpine_tree(idx: int, donor_dir: Path, alpine_dir: Path) -> None:
    donor_path = donor_dir / f"tree{idx}.glb"
    path = alpine_dir / f"tree{idx}.glb"
    bpy.ops.wm.read_factory_settings(use_empty=True)

    bpy.ops.import_scene.gltf(filepath=str(path))
    existing_objs = list(bpy.context.selected_objects)

    bark_obj = None
    for obj in existing_objs:
        if obj.type == "MESH":
            mats = [m.name for m in obj.data.materials if m]
            if "Alpine bark" in mats or obj.name == "0" or "Alpine" in obj.name:
                if "needles" not in " ".join(m.lower() for m in mats):
                    bark_obj = obj
                    break
    if bark_obj is None:
        raise RuntimeError(f"alpine tree{idx}: could not find Alpine bark object")

    bark_mat = bark_obj.data.materials[0]
    bark_node_name = bark_obj.name

    # Import original donor tree from grass-test so repair is 100% idempotent
    bpy.ops.import_scene.gltf(filepath=str(donor_path))
    donor_objs = [o for o in bpy.context.selected_objects if o not in existing_objs]
    donor_bark = None
    for obj in donor_objs:
        if obj.type == "MESH":
            mats = [m.name.lower() for m in obj.data.materials if m]
            if any("bark" in m for m in mats) or obj.name == "0":
                donor_bark = obj
                break
    if donor_bark is not None:
        old_mesh = bark_obj.data
        bark_obj.data = donor_bark.data.copy()
        bark_obj.name = bark_node_name
        bark_obj.data.name = "Mesh_0"
        bark_obj.data.materials.clear()
        bark_obj.data.materials.append(bark_mat)
        bpy.data.meshes.remove(old_mesh, do_unlink=True)
    for obj in donor_objs:
        bpy.data.objects.remove(obj, do_unlink=True)

    mesh = bark_obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)

    comps = _connected_components(bm)
    trunk_comp = comps[0]
    trunk_zs = [v.co.z for v in trunk_comp]
    t_min_z, t_max_z = min(trunk_zs), max(trunk_zs)
    t_height = max(1.0, t_max_z - t_min_z)

    # Drop the 5-6 awkward separate hollow root pipes at the base (c_max_z < t_min_z + 1.2)
    # and the 3 lowest branches on tree10 that plunge underground (min(zs) < t_min_z - 0.1)
    drop_verts: set[bmesh.types.BMVert] = set()
    for comp in comps[1:]:
        zs = [v.co.z for v in comp]
        if max(zs) < t_min_z + 1.2 or min(zs) < t_min_z - 0.05:
            drop_verts.update(comp)

    if drop_verts:
        drop_faces = [f for f in bm.faces if any(v in drop_verts for v in f.verts)]
        bmesh.ops.delete(bm, geom=drop_faces, context="FACES")
        orphan_verts = [v for v in bm.verts if not v.link_faces]
        if orphan_verts:
            bmesh.ops.delete(bm, geom=orphan_verts, context="VERTS")

    comps = _connected_components(bm)
    trunk_comp = comps[0]
    trunk_samples = _reshape_donor_trunk(trunk_comp, t_min_z, t_height, seed=idx)

    # Repair branch components: lift sub-ground drooping tips on tree10, organic collar & taper
    for b_idx, comp in enumerate(comps[1:]):
        zs = [v.co.z for v in comp]
        c_min_z = min(zs)
        if c_min_z < t_min_z + 0.20:
            for v in comp:
                if v.co.z < t_min_z + 0.25:
                    v.co.z = max(t_min_z + 0.25, v.co.z + 0.78)

        _reshape_branch_component(
            comp,
            trunk_comp,
            t_height,
            t_min_z,
            seed=idx,
            branch_idx=b_idx,
            trunk_samples=trunk_samples,
            is_secondary=False,
        )

    uv_layer = bm.loops.layers.uv.active or bm.loops.layers.uv.verify()
    _add_donor_root_spurs(bm, uv_layer, trunk_comp, t_min_z, t_height, seed=idx, n_spurs=5, steps=3)

    bmesh.ops.dissolve_degenerate(bm, dist=1e-5, edges=bm.edges)
    orphan = [v for v in bm.verts if not v.link_faces]
    if orphan:
        bmesh.ops.delete(bm, geom=orphan, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    for poly in mesh.polygons:
        poly.use_smooth = True

    bark_tris = sum(len(p.vertices) - 2 for p in mesh.polygons)
    leaf_objs = [o for o in bpy.data.objects if o.type == "MESH" and o != bark_obj]
    leaf_tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in leaf_objs)
    print(f"alpine tree{idx}: repaired bark tris={bark_tris}, leaves tris={leaf_tris}")

    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        export_apply=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
    )


def main() -> None:
    repo = Path(__file__).resolve().parents[2]
    donor_dir = Path(r"F:/Development/grass-test/public/Assets/terrain/fantasy")
    meadow_dir = repo / "assets" / "runtime-sources" / "trees" / "meadow"
    alpine_dir = repo / "assets" / "runtime-sources" / "trees" / "alpine"

    for idx in range(1, 10):
        repair_meadow_tree(idx, donor_dir, meadow_dir, meadow_dir)

    for idx in (10, 11):
        repair_alpine_tree(idx, donor_dir, alpine_dir)


if __name__ == "__main__":
    main()
