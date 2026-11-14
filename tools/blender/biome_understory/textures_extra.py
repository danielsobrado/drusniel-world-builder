"""Procedural PBR textures (albedo + normal maps) for coastal, alpine/glacier,
savanna, biome micro-structures, and biome shrub kits.
"""
import math
import os
import numpy as np
from understory_common import fbm, height_to_normal, make_material, save_image


def build_extra_materials(tex_dir):
    os.makedirs(tex_dir, exist_ok=True)
    mats = {}

    # --- Coastal & Shoreline Kit ---
    alb = _tex_coastal_dune_oats(tex_dir)
    mats['coastal_oats'] = make_material('CoastalDuneOats', alb, alpha=True, roughness=0.74)

    alb, nrm = _tex_coastal_tidepool(tex_dir)
    mats['coastal_tidepool'] = make_material('CoastalTidepool', alb, alpha=False, normal_image=nrm, roughness=0.52)

    alb, nrm = _tex_coastal_shipwreck(tex_dir)
    mats['coastal_shipwreck'] = make_material('CoastalShipwreck', alb, alpha=False, normal_image=nrm, roughness=0.84)

    # --- Glacier, Alpine & Cold Steppe Kit ---
    alb, nrm = _tex_glacier_ice(tex_dir)
    mats['glacier_ice'] = make_material('GlacierIceSpires', alb, alpha=False, normal_image=nrm, roughness=0.22, subsurface=0.35)

    alb, nrm = _tex_glacier_moraine(tex_dir)
    mats['glacier_moraine'] = make_material('GlacierMoraine', alb, alpha=False, normal_image=nrm, roughness=0.78)

    alb = _tex_steppe_feathergrass(tex_dir)
    mats['steppe_feathergrass'] = make_material('SteppeFeathergrass', alb, alpha=True, roughness=0.78)

    alb, nrm = _tex_alpine_edelweiss(tex_dir)
    mats['alpine_edelweiss'] = make_material('AlpineEdelweiss', alb, alpha=True, normal_image=nrm, roughness=0.76)

    # --- Savanna & Farmland Kit ---
    alb, nrm = _tex_savanna_termite(tex_dir)
    mats['savanna_termite'] = make_material('SavannaTermiteMound', alb, alpha=True, normal_image=nrm, roughness=0.86)

    alb = _tex_savanna_desert_rose(tex_dir)
    mats['savanna_desert_rose'] = make_material('SavannaDesertRose', alb, alpha=True, roughness=0.68)

    alb, nrm = _tex_savanna_ribcage(tex_dir)
    mats['savanna_ribcage'] = make_material('SavannaRibcage', alb, alpha=False, normal_image=nrm, roughness=0.76)

    alb = _tex_farmland_poppy_wheat(tex_dir)
    mats['farmland_poppy'] = make_material('FarmlandPoppyWheat', alb, alpha=True, roughness=0.74)

    # --- Biome Micro-Structures & Landmarks Kit ---
    alb, nrm = _tex_structure_waystone(tex_dir)
    mats['structure_waystone'] = make_material('StructureWaystone', alb, alpha=False, normal_image=nrm, roughness=0.72)

    alb, nrm = _tex_structure_ruined_column(tex_dir)
    mats['structure_column'] = make_material('StructureRuinedColumn', alb, alpha=True, normal_image=nrm, roughness=0.76)

    alb, nrm = _tex_structure_milestone(tex_dir)
    mats['structure_milestone'] = make_material('StructureRoadsideMilestone', alb, alpha=True, normal_image=nrm, roughness=0.80)

    alb, nrm = _tex_structure_dwarven_cairn(tex_dir)
    mats['structure_dwarven'] = make_material('StructureDwarvenCairn', alb, alpha=False, normal_image=nrm, roughness=0.65)

    alb, nrm = _tex_structure_bog_totem(tex_dir)
    mats['structure_bog_totem'] = make_material('StructureBogTotem', alb, alpha=False, normal_image=nrm, roughness=0.82)

    alb, nrm = _tex_structure_rainforest_idol(tex_dir)
    mats['structure_idol'] = make_material('StructureRainforestIdol', alb, alpha=True, normal_image=nrm, roughness=0.78)

    # --- Authored Biome Shrubs Kit (bushVariants) ---
    mats['bush_ocotillo'] = make_material('BushAridOcotillo', _tex_bush_ocotillo(tex_dir), alpha=True, roughness=0.78)
    mats['bush_savanna'] = make_material('BushSavannaThorn', _tex_bush_savanna(tex_dir), alpha=True, roughness=0.78)
    mats['bush_gorse'] = make_material('BushMeadowGorse', _tex_bush_gorse(tex_dir), alpha=True, roughness=0.74)
    mats['bush_juniper'] = make_material('BushBorealJuniper', _tex_bush_juniper(tex_dir), alpha=True, roughness=0.76)
    mats['bush_hibiscus'] = make_material('BushTropicalHibiscus', _tex_bush_hibiscus(tex_dir), alpha=True, roughness=0.58)
    mats['bush_buttonbush'] = make_material('BushSwampButtonbush', _tex_bush_buttonbush(tex_dir), alpha=True, roughness=0.72)

    return mats


def _tex_coastal_dune_oats(tex_dir):
    """u < 0.45: bleached driftwood & shell sand; u >= 0.45: arching sea-oats blades & golden seed panicles."""
    rng = np.random.default_rng(301)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    noise = fbm(w, h, (8, 12), rng, 4)

    # Driftwood / sand base in u < 0.44
    in_wood = u < 0.44
    wood_col = np.array([0.66, 0.62, 0.54]) * (0.76 + 0.42 * noise[..., None])
    rgba[in_wood, :3] = np.clip(wood_col[in_wood], 0, 1)
    rgba[in_wood, 3] = 1.0

    # Sea oats blades & nodding golden oat spikelets in u >= 0.45
    ru = (u - 0.45) / 0.55
    for b_idx, u_center in enumerate((0.25, 0.50, 0.75)):
        curve = 0.06 * np.sin(v * 4.5 + b_idx)
        du = np.abs(ru - (u_center + curve))
        blade_w = 0.085 * (1.0 - 0.65 * v)
        in_blade = (u >= 0.45) & (du <= blade_w) & (v < 0.88)
        b_col = (
            np.array([0.28, 0.42, 0.22]) * (1.0 - 0.65 * v[..., None])
            + np.array([0.78, 0.70, 0.42]) * (0.65 * v[..., None])
        )
        rgba[in_blade, :3] = np.clip(b_col[in_blade], 0, 1)
        rgba[in_blade, 3] = 1.0

        # Golden sea-oat seed plumes near top (v in [0.58, 0.96])
        plume_w = 0.16 * np.maximum(0.0, np.sin(np.clip((v - 0.56) / 0.40, 0, 1) * math.pi))
        chaff = 0.5 + 0.5 * np.cos(v * 38 * math.pi)
        in_plume = (u >= 0.45) & (v >= 0.56) & (v <= 0.96) & (du <= plume_w * (0.75 + 0.3 * chaff))
        p_col = np.array([0.88, 0.76, 0.44]) * (0.8 + 0.3 * chaff[..., None])
        rgba[in_plume, :3] = np.clip(p_col[in_plume], 0, 1)
        rgba[in_plume, 3] = 1.0
    return save_image('coastal_dune_oats_alb', rgba, os.path.join(tex_dir, 'coastal-dune-oats-alb.png'))


def _tex_coastal_tidepool(tex_dir):
    """u < 0.52: wet barnacle-encrusted dark basalt; u >= 0.52: crimson sea anemone / starfish & coral."""
    rng = np.random.default_rng(302)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    noise = fbm(w, h, (10, 10), rng, 4)
    barnacles = fbm(w, h, (24, 24), rng, 3)

    basalt = np.array([0.16, 0.19, 0.22]) * (0.7 + 0.55 * noise[..., None])
    barn_mask = (barnacles > 0.64) & (v < 0.65)
    basalt[barn_mask] = np.array([0.74, 0.72, 0.66])
    kelp_film = (noise > 0.58) & (v >= 0.45)
    basalt[kelp_film] = np.array([0.14, 0.28, 0.12])

    # Right half: coral-pink / scarlet sea anemone tentacles (v >= 0.5) & orange-red starfish / fan coral (v < 0.5)
    ru = (u - 0.76) / 0.22
    rv_top = (v - 0.75) / 0.22
    r_top = np.sqrt(ru * ru + rv_top * rv_top)
    ang_top = np.arctan2(rv_top, ru)
    rays = 0.5 + 0.5 * np.cos(ang_top * 16)
    anemone = (
        np.array([0.86, 0.18, 0.34]) * (0.75 + 0.3 * rays[..., None]) * np.clip(1.2 - r_top, 0.3, 1.0)[..., None]
    )
    rv_bot = (v - 0.25) / 0.22
    ang_bot = np.arctan2(rv_bot, ru)
    star = 0.5 + 0.5 * np.cos(ang_bot * 5)
    coral = np.array([0.92, 0.36, 0.14]) * (0.75 + 0.35 * star[..., None])
    right_col = np.where((v >= 0.5)[..., None], anemone, coral)

    col = np.where((u < 0.52)[..., None], basalt, right_col)
    rgba = np.concatenate([np.clip(col, 0, 1), np.ones((h, w, 1))], axis=2)
    alb = save_image('coastal_tidepool_alb', rgba, os.path.join(tex_dir, 'coastal-tidepool-alb.png'))
    nrm = save_image('coastal_tidepool_nrm', height_to_normal(noise * 0.5 + barnacles * 0.5, 2.5), os.path.join(tex_dir, 'coastal-tidepool-nrm.png'), non_color=True)
    return alb, nrm


def _tex_coastal_shipwreck(tex_dir):
    """u < 0.55: salt-bleached weathered oak ship timber with iron bolt stains; u >= 0.55: wet sand & olive kelp wrack."""
    rng = np.random.default_rng(303)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    grain = fbm(w, h, (4, 20), rng, 4)
    noise = fbm(w, h, (10, 10), rng, 4)

    timber = np.array([0.48, 0.44, 0.38]) * (0.68 + 0.55 * grain[..., None])
    plank_seam = np.abs((u * 8.0) % 1.0 - 0.5) > 0.45
    timber[plank_seam] *= 0.45
    algae = (v < 0.35) & (noise > 0.46)
    timber[algae] = np.array([0.16, 0.29, 0.12]) * (0.8 + 0.3 * noise[algae, None])

    sand_kelp = np.where(
        (noise > 0.52)[..., None],
        np.array([0.20, 0.30, 0.11]) * (0.75 + 0.4 * grain[..., None]),
        np.array([0.68, 0.62, 0.50]) * (0.85 + 0.25 * noise[..., None]),
    )
    col = np.where((u < 0.55)[..., None], timber, sand_kelp)
    rgba = np.concatenate([np.clip(col, 0, 1), np.ones((h, w, 1))], axis=2)
    alb = save_image('coastal_shipwreck_alb', rgba, os.path.join(tex_dir, 'coastal-shipwreck-alb.png'))
    nrm = save_image('coastal_shipwreck_nrm', height_to_normal(grain, 2.4), os.path.join(tex_dir, 'coastal-shipwreck-nrm.png'), non_color=True)
    return alb, nrm


def _tex_glacier_ice(tex_dir):
    """Translucent glacial blue-cyan crevasse ice grading to crisp white wind-packed snow."""
    rng = np.random.default_rng(304)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    facets = fbm(w, h, (8, 14), rng, 4)
    cracks = np.clip(1.0 - np.abs(facets - 0.5) * 8.0, 0, 1)

    deep_ice = np.array([0.74, 0.88, 0.96]) * (0.86 + 0.20 * facets[..., None])
    rime_snow = np.array([0.96, 0.98, 1.00])
    snow_mix = np.clip((u < 0.45) * 0.75 + v * 0.50 + cracks * 0.45 - 0.15, 0, 1)
    col = deep_ice * (1 - snow_mix[..., None]) + rime_snow * snow_mix[..., None]
    rgba = np.concatenate([np.clip(col, 0, 1), np.ones((h, w, 1))], axis=2)
    alb = save_image('glacier_ice_alb', rgba, os.path.join(tex_dir, 'glacier-ice-alb.png'))
    nrm = save_image('glacier_ice_nrm', height_to_normal(facets + cracks * 0.3, 2.6), os.path.join(tex_dir, 'glacier-ice-nrm.png'), non_color=True)
    return alb, nrm


def _tex_glacier_moraine(tex_dir):
    """Frost-weathered pale alpine granite/limestone moraine with windblown snow caps and rime frost."""
    rng = np.random.default_rng(305)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    noise = fbm(w, h, (10, 10), rng, 4)
    strata = fbm(w, h, (4, 18), rng, 3)

    slate = np.array([0.72, 0.70, 0.65]) * (0.80 + 0.32 * strata[..., None])
    snow_cap = np.clip((v - 0.36) * 2.2 + (noise - 0.42) * 1.4, 0, 1)
    snow_col = np.array([0.93, 0.95, 0.98]) * (0.92 + 0.10 * noise[..., None])
    col = slate * (1 - snow_cap[..., None]) + snow_col * snow_cap[..., None]
    rgba = np.concatenate([np.clip(col, 0, 1), np.ones((h, w, 1))], axis=2)
    alb = save_image('glacier_moraine_alb', rgba, os.path.join(tex_dir, 'glacier-moraine-alb.png'))
    nrm = save_image('glacier_moraine_nrm', height_to_normal(strata * 0.6 + noise * 0.4, 2.5), os.path.join(tex_dir, 'glacier-moraine-nrm.png'), non_color=True)
    return alb, nrm


def _tex_steppe_feathergrass(tex_dir):
    """Silvery-sage Eurasian steppe feathergrass (Stipa) plumes & frosty grey-green wormwood (Artemisia)."""
    rng = np.random.default_rng(306)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    fine = fbm(w, h, (14, 14), rng, 3)

    # Sage-olive grass blades grading to feathery golden-sage tips (g > max(r, b) so gradeUnderstory grades them!)
    for k in range(11):
        u0 = 0.12 + k * 0.076
        bend = 0.08 * (v ** 1.5) * (1 if k % 2 == 0 else -0.8)
        du = np.abs(u - (u0 + bend))
        w_awn = 0.032 * (1.0 - 0.72 * (v ** 1.2))
        in_awn = (v >= 0.02) & (v <= 0.92) & (du <= w_awn)
        col = (
            np.array([0.24, 0.36, 0.18]) * np.clip(1.0 - v * 1.4, 0, 1)[..., None]
            + np.array([0.46, 0.56, 0.32]) * np.clip(v * 1.4, 0, 1)[..., None]
        ) * (0.85 + 0.25 * fine[..., None])
        rgba[in_awn, :3] = np.clip(col[in_awn], 0, 1)
        rgba[in_awn, 3] = 1.0
    return save_image('steppe_feathergrass_alb', rgba, os.path.join(tex_dir, 'steppe-feathergrass-alb.png'))


def _tex_alpine_edelweiss(tex_dir):
    """u < 0.48: frost-cracked alpine limestone; u >= 0.48: woolly white Edelweiss star flowers & royal-blue gentian."""
    rng = np.random.default_rng(307)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    noise = fbm(w, h, (10, 10), rng, 4)

    # Limestone slab in u < 0.48
    in_stone = u < 0.48
    stone = np.array([0.74, 0.72, 0.66]) * (0.80 + 0.32 * noise[..., None])
    snow = (v > 0.56) & (noise > 0.48)
    stone[snow] = np.array([0.92, 0.94, 0.97])
    rgba[in_stone, :3] = np.clip(stone[in_stone], 0, 1)
    rgba[in_stone, 3] = 1.0

    # Right half u >= 0.50: basal alpine leaves + woolly white Edelweiss star & deep-blue Gentian bell
    ru = (u - 0.50) / 0.50
    in_stem = (u >= 0.50) & (v < 0.68) & (np.abs(ru - 0.5) < 0.10 + 0.22 * (v < 0.34))
    rgba[in_stem, :3] = np.array([0.24, 0.34, 0.20])
    rgba[in_stem, 3] = 1.0

    # Edelweiss star blossom at (ru=0.35, v=0.76) and blue Gentian at (ru=0.72, v=0.62)
    eu, ev = (ru - 0.36) / 0.28, (v - 0.76) / 0.20
    er = np.sqrt(eu * eu + ev * ev)
    eang = np.arctan2(ev, eu)
    star_env = 0.62 + 0.38 * np.cos(eang * 9)
    in_edel = (u >= 0.50) & (er <= star_env)
    ecol = np.where((er < 0.22)[..., None], np.array([0.86, 0.76, 0.24]), np.array([0.94, 0.93, 0.88]))
    rgba[in_edel, :3] = ecol[in_edel]
    rgba[in_edel, 3] = 1.0

    gu, gv = (ru - 0.72) / 0.18, (v - 0.58) / 0.15
    gr = np.sqrt(gu * gu + gv * gv)
    in_gent = (u >= 0.50) & (gr <= 0.85)
    rgba[in_gent, :3] = np.array([0.42, 0.52, 0.72]) * (0.85 + 0.22 * (1 - gr[in_gent, None]))
    rgba[in_gent, 3] = 1.0

    alb = save_image('alpine_edelweiss_alb', rgba, os.path.join(tex_dir, 'alpine-edelweiss-alb.png'))
    nrm = save_image('alpine_edelweiss_nrm', height_to_normal(noise, 2.2), os.path.join(tex_dir, 'alpine-edelweiss-nrm.png'), non_color=True)
    return alb, nrm


def _tex_savanna_termite(tex_dir):
    """u < 0.58: fluted red-ochre savanna laterite termite mound clay; u >= 0.58: tall golden elephant-grass tuft."""
    rng = np.random.default_rng(308)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    flutes = fbm(w, h, (14, 4), rng, 4)
    pores = fbm(w, h, (24, 24), rng, 3)

    in_clay = u < 0.58
    clay = np.array([0.74, 0.58, 0.38]) * (0.78 + 0.36 * flutes[..., None]) * (0.88 + 0.20 * pores[..., None])
    vent = (pores < 0.24) & (flutes < 0.40)
    clay[vent] *= 0.55
    rgba[in_clay, :3] = np.clip(clay[in_clay], 0, 1)
    rgba[in_clay, 3] = 1.0

    # Dry golden savanna grass blades in u >= 0.60
    ru = (u - 0.60) / 0.40
    for k in range(6):
        uc = 0.15 + k * 0.14
        du = np.abs(ru - uc - 0.05 * np.sin(v * 5 + k))
        in_blade = (u >= 0.60) & (du < 0.065 * (1 - 0.7 * v))
        gcol = np.array([0.68, 0.58, 0.26]) * (0.75 + 0.35 * v[..., None])
        rgba[in_blade, :3] = np.clip(gcol[in_blade], 0, 1)
        rgba[in_blade, 3] = 1.0

    alb = save_image('savanna_termite_alb', rgba, os.path.join(tex_dir, 'savanna-termite-alb.png'))
    nrm = save_image('savanna_termite_nrm', height_to_normal(flutes * 0.7 + pores * 0.3, 2.8), os.path.join(tex_dir, 'savanna-termite-nrm.png'), non_color=True)
    return alb, nrm


def _tex_savanna_desert_rose(tex_dir):
    """u < 0.46: silvery-bronze swollen Adenium caudex bark; u >= 0.46: glossy leaves & crimson-pink trumpet flowers."""
    rng = np.random.default_rng(309)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    noise = fbm(w, h, (8, 12), rng, 4)

    in_bark = u < 0.46
    bark = np.array([0.66, 0.60, 0.48]) * (0.82 + 0.28 * noise[..., None])
    rgba[in_bark, :3] = np.clip(bark[in_bark], 0, 1)
    rgba[in_bark, 3] = 1.0

    # Right half: Adenium foliage & subtle warm coral-gold desert blossoms
    ru = (u - 0.48) / 0.52
    env = 0.40 * np.sin(np.clip(v, 0.04, 0.94) * math.pi)
    in_fol = (u >= 0.48) & (v <= 0.90) & (np.abs(ru - 0.5) <= env) & (noise > 0.32)
    rgba[in_fol, :3] = np.array([0.24, 0.38, 0.16]) * (0.82 + 0.32 * noise[in_fol, None])
    rgba[in_fol, 3] = 1.0

    for fu, fv in ((0.66, 0.62), (0.80, 0.70)):
        fr = np.sqrt(((u - fu) / 0.065) ** 2 + ((v - fv) / 0.065) ** 2)
        fang = np.arctan2(v - fv, u - fu)
        pet = 0.78 + 0.22 * np.cos(fang * 5)
        in_flw = fr <= pet
        fcol = np.where(
            (fr < 0.38)[..., None],
            np.array([0.92, 0.84, 0.58]),
            np.array([0.82, 0.44, 0.28]),
        )
        rgba[in_flw, :3] = fcol[in_flw]
        rgba[in_flw, 3] = 1.0
    return save_image('savanna_desert_rose_alb', rgba, os.path.join(tex_dir, 'savanna-desert-rose-alb.png'))


def _tex_savanna_ribcage(tex_dir):
    """u < 0.55: sun-bleached ivory bone with suture cracks & horn keratin; u >= 0.55: red savanna dust & dry stone."""
    rng = np.random.default_rng(310)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    noise = fbm(w, h, (8, 12), rng, 4)

    bone = np.array([0.86, 0.82, 0.72]) * (0.82 + 0.25 * noise[..., None])
    # Dark horn tips near v > 0.80
    horn = v > 0.80
    bone[horn] = np.array([0.26, 0.22, 0.18]) * (0.8 + 0.3 * noise[horn, None])

    earth = np.array([0.74, 0.64, 0.46]) * (0.82 + 0.28 * noise[..., None])
    col = np.where((u < 0.55)[..., None], bone, earth)
    rgba = np.concatenate([np.clip(col, 0, 1), np.ones((h, w, 1))], axis=2)
    alb = save_image('savanna_ribcage_alb', rgba, os.path.join(tex_dir, 'savanna-ribcage-alb.png'))
    nrm = save_image('savanna_ribcage_nrm', height_to_normal(noise, 2.2), os.path.join(tex_dir, 'savanna-ribcage-nrm.png'), non_color=True)
    return alb, nrm


def _tex_farmland_poppy_wheat(tex_dir):
    """Golden ripened wheat stalks & bearded ears with scarlet corn-poppies and blue cornflowers."""
    rng = np.random.default_rng(311)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    noise = fbm(w, h, (12, 12), rng, 3)

    # Golden wheat stalks & ears in u < 0.52
    for uc in (0.14, 0.26, 0.38):
        du = np.abs(u - uc - 0.03 * np.sin(v * 5))
        stalk = (u < 0.52) & (du < 0.025) & (v < 0.88)
        ear = (u < 0.52) & (v >= 0.55) & (v < 0.94) & (du < 0.055 * np.sin(np.clip((v - 0.55) / 0.39, 0, 1) * math.pi))
        rgba[stalk] = (0.76, 0.66, 0.30, 1.0)
        grain = 0.8 + 0.25 * np.cos(v * 44 * math.pi)
        rgba[ear, :3] = np.clip(np.array([0.88, 0.74, 0.28]) * grain[ear, None], 0, 1)
        rgba[ear, 3] = 1.0

    # Right half u >= 0.52: leafy stems + scarlet poppies & blue cornflowers
    ru = (u - 0.52) / 0.48
    stem = (u >= 0.52) & (v < 0.78) & (np.abs(ru - 0.5 + 0.08 * np.sin(v * 7)) < 0.09)
    rgba[stem] = (0.20, 0.34, 0.14, 1.0)
    for fu, fv, is_poppy in ((0.68, 0.64, True), (0.84, 0.78, True), (0.64, 0.84, False)):
        fr = np.sqrt(((u - fu) / 0.10) ** 2 + ((v - fv) / 0.10) ** 2)
        in_f = fr <= 1.0
        if is_poppy:
            fcol = np.where((fr < 0.26)[..., None], np.array([0.14, 0.10, 0.12]), np.array([0.92, 0.12, 0.10]))
        else:
            fcol = np.array([0.18, 0.36, 0.88]) * (0.85 + 0.2 * noise[..., None])
        rgba[in_f, :3] = np.clip(fcol[in_f], 0, 1)
        rgba[in_f, 3] = 1.0
    return save_image('farmland_poppy_wheat_alb', rgba, os.path.join(tex_dir, 'farmland-poppy-wheat-alb.png'))


def _tex_structure_waystone(tex_dir):
    """Weathered carved granite waystone obelisk with mossy base and subtle carved runes."""
    rng = np.random.default_rng(312)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    noise = fbm(w, h, (8, 8), rng, 4)

    stone = np.array([0.64, 0.62, 0.56]) * (0.80 + 0.32 * noise[..., None])
    # Moss creeping up from base (v < 0.38)
    moss = np.clip((0.38 - v) * 2.8 + (noise - 0.46) * 1.4, 0, 1)
    stone = stone * (1 - moss[..., None]) + np.array([0.22, 0.38, 0.14]) * moss[..., None]

    # Carved weathered lichen-gold rune glyphs along centre of obelisk faces
    du = np.abs((u * 4.0) % 1.0 - 0.5)
    glyph_band = (v > 0.32) & (v < 0.80) & (du < 0.12)
    rune_pattern = (np.abs(np.sin(v * 24 * math.pi) - du * 4.5) < 0.18) | (du < 0.024)
    is_rune = glyph_band & rune_pattern
    stone[is_rune] = np.array([0.78, 0.72, 0.44])

    rgba = np.concatenate([np.clip(stone, 0, 1), np.ones((h, w, 1))], axis=2)
    alb = save_image('structure_waystone_alb', rgba, os.path.join(tex_dir, 'structure-waystone-alb.png'))
    nrm = save_image('structure_waystone_nrm', height_to_normal(noise - is_rune.astype(np.float32) * 0.35, 2.5), os.path.join(tex_dir, 'structure-waystone-nrm.png'), non_color=True)
    return alb, nrm


def _tex_structure_ruined_column(tex_dir):
    """u < 0.62: fluted classical cream limestone/marble column with moss; u >= 0.62: trailing ivy vine card."""
    rng = np.random.default_rng(313)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    noise = fbm(w, h, (8, 8), rng, 4)

    flutes = 0.5 + 0.5 * np.cos(u / 0.62 * 16 * math.pi)
    marble = np.array([0.48, 0.46, 0.38]) * (0.78 + 0.22 * flutes[..., None]) * (0.82 + 0.28 * noise[..., None])
    moss = (noise > 0.46) | (v < 0.42)
    marble[moss] = np.array([0.22, 0.38, 0.14]) * (0.8 + 0.35 * noise[moss, None])
    in_stone = u < 0.62
    rgba[in_stone, :3] = np.clip(marble[in_stone], 0, 1)
    rgba[in_stone, 3] = 1.0

    # Trailing ivy leaves in u >= 0.64
    ru = (u - 0.64) / 0.36
    stem = (u >= 0.64) & (np.abs(ru - 0.5 + 0.08 * np.sin(v * 8)) < 0.06)
    rgba[stem] = (0.28, 0.22, 0.16, 1.0)
    for vc in np.linspace(0.15, 0.88, 6):
        lr = np.sqrt(((ru - 0.5) / 0.36) ** 2 + ((v - vc) / 0.09) ** 2)
        in_ivy = (u >= 0.64) & (lr <= 1.0)
        rgba[in_ivy, :3] = np.array([0.15, 0.31, 0.10]) * (0.8 + 0.3 * (1 - lr[in_ivy, None]))
        rgba[in_ivy, 3] = 1.0

    alb = save_image('structure_column_alb', rgba, os.path.join(tex_dir, 'structure-column-alb.png'))
    nrm = save_image('structure_column_nrm', height_to_normal(flutes * 0.5 + noise * 0.5, 2.4), os.path.join(tex_dir, 'structure-column-nrm.png'), non_color=True)
    return alb, nrm


def _tex_structure_milestone(tex_dir):
    """u < 0.48: carved stone milestone; u in [0.48, 0.78]: weathered timber signpost; u >= 0.78: roadside flowers."""
    rng = np.random.default_rng(314)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    noise = fbm(w, h, (8, 12), rng, 4)

    # Carved stone milestone u < 0.48
    in_stone = u < 0.48
    stone = np.array([0.54, 0.51, 0.46]) * (0.75 + 0.4 * noise[..., None])
    carving = (u > 0.14) & (u < 0.34) & (v > 0.52) & (v < 0.78) & (np.cos(v * 36 * math.pi) > 0.3)
    stone[carving] *= 0.48
    rgba[in_stone, :3] = np.clip(stone[in_stone], 0, 1)
    rgba[in_stone, 3] = 1.0

    # Weathered timber signpost u in [0.48, 0.76]
    in_wood = (u >= 0.48) & (u < 0.76)
    wood = np.array([0.38, 0.27, 0.18]) * (0.72 + 0.45 * noise[..., None])
    rgba[in_wood, :3] = np.clip(wood[in_wood], 0, 1)
    rgba[in_wood, 3] = 1.0

    # Roadside wildflower tuft u >= 0.78
    ru = (u - 0.78) / 0.22
    in_tuft = (u >= 0.78) & (np.abs(ru - 0.5) < 0.42 * (1 - 0.4 * v)) & (noise > 0.32)
    is_bloom = in_tuft & (v > 0.58) & (noise > 0.56)
    rgba[in_tuft, :3] = np.array([0.18, 0.33, 0.12])
    rgba[in_tuft, 3] = 1.0
    rgba[is_bloom, :3] = np.array([0.94, 0.78, 0.18])

    alb = save_image('structure_milestone_alb', rgba, os.path.join(tex_dir, 'structure-milestone-alb.png'))
    nrm = save_image('structure_milestone_nrm', height_to_normal(noise, 2.2), os.path.join(tex_dir, 'structure-milestone-nrm.png'), non_color=True)
    return alb, nrm


def _tex_structure_dwarven_cairn(tex_dir):
    """u < 0.55: dressed warm badlands sandstone/basalt with dwarven bronze trim; u >= 0.55: carved chevron bands."""
    rng = np.random.default_rng(315)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    noise = fbm(w, h, (8, 8), rng, 4)

    basalt = np.array([0.56, 0.50, 0.42]) * (0.80 + 0.32 * noise[..., None])
    bronze_band = ((v > 0.44) & (v < 0.52)) | ((v > 0.78) & (v < 0.85))
    basalt[bronze_band] = np.array([0.74, 0.58, 0.32]) * (0.85 + 0.25 * noise[bronze_band, None])

    # Right half: carved dwarven chevron runes & warm weathered bronze cap
    chev = np.abs(((u * 8 + v * 6) % 1.0) - 0.5) < 0.16
    right = basalt.copy()
    right[chev & (v < 0.68)] = np.array([0.78, 0.62, 0.34])
    embers = v >= 0.70
    right[embers] = np.array([0.72, 0.54, 0.30]) * (0.80 + 0.28 * noise[embers, None])

    col = np.where((u < 0.55)[..., None], basalt, right)
    rgba = np.concatenate([np.clip(col, 0, 1), np.ones((h, w, 1))], axis=2)
    alb = save_image('structure_dwarven_alb', rgba, os.path.join(tex_dir, 'structure-dwarven-alb.png'))
    nrm = save_image('structure_dwarven_nrm', height_to_normal(noise + bronze_band.astype(np.float32) * 0.3, 2.5), os.path.join(tex_dir, 'structure-dwarven-nrm.png'), non_color=True)
    return alb, nrm


def _tex_structure_bog_totem(tex_dir):
    """u < 0.50: dark bog driftwood & lashing rope; u >= 0.50: bleached beast skull (bottom) & glowing bioluminescent bog gourd (top)."""
    rng = np.random.default_rng(316)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    noise = fbm(w, h, (6, 14), rng, 4)

    wood = np.array([0.22, 0.18, 0.13]) * (0.7 + 0.5 * noise[..., None])
    rope = (v > 0.42) & (v < 0.54)
    wood[rope] = np.array([0.52, 0.44, 0.30]) * (0.8 + 0.3 * np.sin(v * 80 * math.pi)[rope, None])

    skull = np.array([0.78, 0.74, 0.64]) * (0.8 + 0.3 * noise[..., None])
    eye_sockets = ((np.abs(u - 0.68) < 0.045) | (np.abs(u - 0.82) < 0.045)) & (np.abs(v - 0.28) < 0.055)
    skull[eye_sockets] = np.array([0.08, 0.07, 0.06])
    glow_gourd = np.array([0.22, 0.92, 0.62]) * (0.75 + 0.3 * noise[..., None])
    right = np.where((v < 0.58)[..., None], skull, glow_gourd)

    col = np.where((u < 0.50)[..., None], wood, right)
    rgba = np.concatenate([np.clip(col, 0, 1), np.ones((h, w, 1))], axis=2)
    alb = save_image('structure_bog_totem_alb', rgba, os.path.join(tex_dir, 'structure-bog-totem-alb.png'))
    nrm = save_image('structure_bog_totem_nrm', height_to_normal(noise, 2.4), os.path.join(tex_dir, 'structure-bog-totem-nrm.png'), non_color=True)
    return alb, nrm


def _tex_structure_rainforest_idol(tex_dir):
    """u < 0.58: moss-blanketed carved jungle stone monolith with relief face; u >= 0.58: rainforest fern & monstera vines."""
    rng = np.random.default_rng(317)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    noise = fbm(w, h, (8, 8), rng, 4)

    in_stone = u < 0.58
    stone = np.array([0.54, 0.56, 0.48]) * (0.78 + 0.34 * noise[..., None])
    carved = (np.cos(u * 24 * math.pi) * np.cos(v * 18 * math.pi)) > 0.35
    stone[carved] *= 0.68
    moss = (noise > 0.46) | (v > 0.66)
    stone[moss] = np.array([0.20, 0.38, 0.13]) * (0.80 + 0.35 * noise[moss, None])
    rgba[in_stone, :3] = np.clip(stone[in_stone], 0, 1)
    rgba[in_stone, 3] = 1.0

    # Jungle vine leaf card u >= 0.60
    ru = (u - 0.60) / 0.40
    env = 0.42 * np.sin(np.clip(v, 0.04, 0.96) * math.pi)
    in_leaf = (u >= 0.60) & (np.abs(ru - 0.5) <= env)
    rgba[in_leaf, :3] = np.array([0.20, 0.40, 0.14]) * (0.82 + 0.28 * noise[in_leaf, None])
    rgba[in_leaf, 3] = 1.0

    alb = save_image('structure_idol_alb', rgba, os.path.join(tex_dir, 'structure-idol-alb.png'))
    nrm = save_image('structure_idol_nrm', height_to_normal(noise - carved.astype(np.float32) * 0.3, 2.5), os.path.join(tex_dir, 'structure-idol-nrm.png'), non_color=True)
    return alb, nrm


# ---------------------------------------------------------------------------
# AUTHORED BIOME SHRUB TEXTURES (bushVariants)
# ---------------------------------------------------------------------------

def _draw_segment(mask, fu, v, x0, y0, x1, y1, r0, r1):
    dx = x1 - x0
    dy = y1 - y0
    seg_len2 = max(1e-6, dx * dx + dy * dy)
    t = np.clip(((fu - x0) * dx + (v - y0) * dy) / seg_len2, 0.0, 1.0)
    px = x0 + t * dx
    py = y0 + t * dy
    dist = np.hypot(fu - px, v - py)
    rad = r0 + (r1 - r0) * t
    return dist <= rad


def _draw_leaf_cluster(rgba, fu, v, cx, cy, rx, ry, angle, leaf_rgb, midrib_rgb, serration=0.0, notch=False):
    ca, sa = math.cos(angle), math.sin(angle)
    du = fu - cx
    dv = v - cy
    lu = (du * ca + dv * sa) / max(1e-4, rx)
    lv = (-du * sa + dv * ca) / max(1e-4, ry)
    # Tapered ovate / pointed leaflet shape centered at (0, 0), base at lv=-1, tip at lv=+1
    t_len = np.clip((lv + 1.0) * 0.5, 0.0, 1.0)
    half_w = (np.maximum(0.0, np.sin(t_len * math.pi)) ** 0.72) * (1.0 - 0.18 * t_len)
    if serration > 0.0:
        half_w *= (1.0 + serration * np.sin(t_len * 10.0 * math.pi))
    inside = (lv >= -1.0) & (lv <= 1.0) & (np.abs(lu) <= half_w)
    if notch:
        inside &= np.abs(lu) > 0.06 * (t_len > 0.25)
    midrib = inside & (np.abs(lu) < 0.14 * (1.0 - 0.5 * t_len))
    shade = 0.78 + 0.34 * t_len[..., None] + 0.12 * (1.0 - np.abs(lu) / np.maximum(half_w, 1e-4))[..., None]
    rgba[inside, :3] = np.clip(np.array(leaf_rgb) * shade[inside], 0, 1)
    rgba[inside, 3] = 1.0
    rgba[midrib, :3] = np.clip(np.array(midrib_rgb), 0, 1)


def _shrub_card_atlas(
    tex_dir,
    name,
    filename,
    seed,
    wood_rgb,
    leaf_rgb,
    accent_rgb,
    style='gorse',
):
    """Species-distinct branched twig spray atlas: u < 0.28 is striped woody bark;
    u >= 0.30 is an open twig skeleton carrying discrete leaflet groupings and accents."""
    rng = np.random.default_rng(seed)
    w = h = 256
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    u, v = xs / w, 1.0 - ys / h
    rgba = np.zeros((h, w, 4), dtype=np.float32)
    noise = fbm(w, h, (8, 12), rng, 4)
    grain = fbm(w, h, (20, 4), rng, 3)

    # Bark strip u < 0.28 with lengthwise bark striations
    in_wood = u < 0.28
    bark_shade = 0.66 + 0.48 * grain[..., None] + 0.16 * (noise[..., None] - 0.5)
    rgba[in_wood, :3] = np.clip(np.array(wood_rgb) * bark_shade[in_wood], 0, 1)
    rgba[in_wood, 3] = 1.0

    fu = (u - 0.30) / 0.70
    in_spray = u >= 0.30
    twig_dark = np.array(wood_rgb) * 0.88
    midrib = np.clip(np.array(leaf_rgb) * 1.18, 0, 1)

    # Main forked twig skeleton (anchored at bottom petiole fu=0.50, v=0.0)
    twig_segs = (
        (0.50, 0.00, 0.48, 0.34, 0.032, 0.022),
        (0.48, 0.34, 0.54, 0.72, 0.022, 0.012),
        (0.49, 0.26, 0.26, 0.54, 0.020, 0.010),
        (0.50, 0.42, 0.78, 0.66, 0.018, 0.009),
        (0.52, 0.58, 0.32, 0.82, 0.014, 0.008),
    )
    twig_mask = np.zeros_like(u, dtype=bool)
    for seg in twig_segs:
        twig_mask |= in_spray & _draw_segment(None, fu, v, *seg)
    rgba[twig_mask, :3] = np.clip(twig_dark * (0.85 + 0.3 * grain[twig_mask, None]), 0, 1)
    rgba[twig_mask, 3] = 1.0

    # Leaf clusters along twig nodes according to ecological species morphology
    if style == 'juniper':
        # Layered feathered cypress/juniper needle fans
        needles = (
            (0.28, 0.52, 0.12, 0.17, 0.65), (0.20, 0.42, 0.10, 0.14, 0.95),
            (0.75, 0.64, 0.13, 0.17, -0.60), (0.83, 0.54, 0.10, 0.13, -0.95),
            (0.35, 0.80, 0.11, 0.15, 0.42), (0.62, 0.78, 0.11, 0.15, -0.35),
            (0.51, 0.86, 0.11, 0.14, 0.05), (0.50, 0.60, 0.10, 0.14, 0.15),
        )
        for cx, cy, rx, ry, ang in needles:
            _draw_leaf_cluster(rgba, fu, v, cx, cy, rx, ry, ang, leaf_rgb, midrib, serration=0.22)
    elif style == 'gorse':
        # Clustered spiky moorland furze sprays + terminal yellow blossom tufts
        sprigs = (
            (0.27, 0.52, 0.07, 0.16, 0.75), (0.22, 0.44, 0.06, 0.14, 1.05), (0.34, 0.58, 0.06, 0.14, 0.35),
            (0.76, 0.64, 0.07, 0.16, -0.65), (0.84, 0.55, 0.06, 0.13, -1.00), (0.68, 0.70, 0.06, 0.14, -0.35),
            (0.34, 0.82, 0.07, 0.15, 0.45), (0.56, 0.78, 0.07, 0.16, -0.15), (0.48, 0.45, 0.06, 0.13, 0.12),
        )
        for cx, cy, rx, ry, ang in sprigs:
            _draw_leaf_cluster(rgba, fu, v, cx, cy, rx, ry, ang, leaf_rgb, midrib, serration=0.14)
    elif style == 'savanna':
        # Airy horizontal acacia pinnae fans with crisp light gaps
        pads = (
            (0.26, 0.52, 0.16, 0.08, 0.32), (0.20, 0.60, 0.14, 0.07, 0.52),
            (0.76, 0.66, 0.16, 0.08, -0.28), (0.68, 0.56, 0.13, 0.07, -0.45),
            (0.36, 0.82, 0.15, 0.08, 0.18), (0.60, 0.80, 0.15, 0.08, -0.18),
            (0.50, 0.68, 0.13, 0.07, 0.0),
        )
        for cx, cy, rx, ry, ang in pads:
            _draw_leaf_cluster(rgba, fu, v, cx, cy, rx, ry, ang, leaf_rgb, midrib, serration=0.20)
    elif style == 'ocotillo':
        # Small spiral stem-hugging olive leaf rosettes leaving canes exposed
        rosettes = (
            (0.48, 0.24, 0.09, 0.11, 0.65), (0.50, 0.42, 0.09, 0.11, -0.60),
            (0.28, 0.52, 0.08, 0.10, 0.45), (0.74, 0.64, 0.08, 0.10, -0.45),
            (0.35, 0.78, 0.08, 0.10, 0.30), (0.56, 0.68, 0.08, 0.10, -0.25),
        )
        for cx, cy, rx, ry, ang in rosettes:
            _draw_leaf_cluster(rgba, fu, v, cx, cy, rx, ry, ang, leaf_rgb, midrib, serration=0.06)
    elif style == 'hibiscus':
        # Sculpted broad serrated tropical leaves on distinct petioles
        leaves = (
            (0.26, 0.54, 0.14, 0.18, 0.68), (0.76, 0.62, 0.15, 0.19, -0.62),
            (0.34, 0.82, 0.13, 0.17, 0.40), (0.62, 0.78, 0.14, 0.18, -0.32),
            (0.50, 0.48, 0.12, 0.15, 0.15),
        )
        for cx, cy, rx, ry, ang in leaves:
            _draw_leaf_cluster(rgba, fu, v, cx, cy, rx, ry, ang, leaf_rgb, midrib, serration=0.14)
    else:
        # 'buttonbush': Opposite glossy swamp-willow leaf pairs along red-brown stems
        pairs = (
            (0.30, 0.46, 0.10, 0.18, 0.78), (0.68, 0.48, 0.10, 0.18, -0.78),
            (0.24, 0.64, 0.09, 0.17, 0.62), (0.78, 0.68, 0.10, 0.18, -0.58),
            (0.36, 0.84, 0.09, 0.16, 0.32), (0.60, 0.82, 0.09, 0.16, -0.28),
        )
        for cx, cy, rx, ry, ang in pairs:
            _draw_leaf_cluster(rgba, fu, v, cx, cy, rx, ry, ang, leaf_rgb, midrib, serration=0.04)

    # Re-stamp crisp main woody petiole base over lowest leaf overlap
    base_stem = in_spray & _draw_segment(None, fu, v, 0.50, 0.00, 0.48, 0.34, 0.030, 0.020)
    rgba[base_stem, :3] = twig_dark
    rgba[base_stem, 3] = 1.0

    # Species blossoms / fruits anchored strictly at branch tips / upper axils
    if accent_rgb is not None:
        bloom_pts = {
            'ocotillo': ((0.54, 0.84, 0.09, 0.11), (0.50, 0.92, 0.07, 0.08), (0.32, 0.86, 0.06, 0.07)),
            'savanna': ((0.30, 0.64, 0.045, 0.045), (0.66, 0.84, 0.045, 0.045)),
            'gorse': ((0.24, 0.58, 0.065, 0.065), (0.80, 0.70, 0.065, 0.065), (0.54, 0.82, 0.070, 0.070)),
            'juniper': ((0.30, 0.56, 0.036, 0.036), (0.74, 0.66, 0.036, 0.036), (0.52, 0.76, 0.034, 0.034)),
            'hibiscus': ((0.52, 0.74, 0.085, 0.085), (0.28, 0.64, 0.070, 0.070)),
            'buttonbush': ((0.52, 0.76, 0.055, 0.055), (0.30, 0.72, 0.048, 0.048), (0.76, 0.74, 0.048, 0.048)),
        }.get(style, ())
        for bx, by, brx, bry in bloom_pts:
            r = np.hypot((fu - bx) / brx, (v - by) / bry)
            petals = 0.80 + 0.20 * np.cos(np.arctan2(v - by, fu - bx) * 5.0)
            in_b = in_spray & (r <= petals)
            rgba[in_b, :3] = np.clip(np.array(accent_rgb) * (0.84 + 0.24 * (1.0 - r[in_b, None])), 0, 1)
            rgba[in_b, 3] = 1.0

    # Clip alpha strictly away from UV tile borders to eliminate quad edge bleeding
    border_fade = (fu < 0.04) | (fu > 0.96) | (v > 0.97)
    rgba[in_spray & border_fade, 3] = 0.0
    return save_image(name, rgba, os.path.join(tex_dir, filename))


def _tex_bush_ocotillo(tex_dir):
    return _shrub_card_atlas(tex_dir, 'bush_ocotillo_alb', 'bush-ocotillo-alb.png', 321,
                             (0.46, 0.39, 0.30), (0.32, 0.43, 0.20), (0.82, 0.36, 0.22), style='ocotillo')


def _tex_bush_savanna(tex_dir):
    return _shrub_card_atlas(tex_dir, 'bush_savanna_alb', 'bush-savanna-alb.png', 322,
                             (0.45, 0.37, 0.28), (0.30, 0.42, 0.19), (0.82, 0.70, 0.32), style='savanna')


def _tex_bush_gorse(tex_dir):
    return _shrub_card_atlas(tex_dir, 'bush_gorse_alb', 'bush-gorse-alb.png', 323,
                             (0.38, 0.30, 0.21), (0.24, 0.42, 0.16), (0.86, 0.72, 0.22), style='gorse')


def _tex_bush_juniper(tex_dir):
    return _shrub_card_atlas(tex_dir, 'bush_juniper_alb', 'bush-juniper-alb.png', 324,
                             (0.39, 0.31, 0.23), (0.22, 0.37, 0.21), (0.40, 0.50, 0.56), style='juniper')


def _tex_bush_hibiscus(tex_dir):
    return _shrub_card_atlas(tex_dir, 'bush_hibiscus_alb', 'bush-hibiscus-alb.png', 325,
                             (0.36, 0.28, 0.20), (0.20, 0.41, 0.14), (0.80, 0.32, 0.30), style='hibiscus')


def _tex_bush_buttonbush(tex_dir):
    return _shrub_card_atlas(tex_dir, 'bush_buttonbush_alb', 'bush-buttonbush-alb.png', 326,
                             (0.36, 0.29, 0.21), (0.22, 0.39, 0.15), (0.74, 0.76, 0.48), style='buttonbush')
