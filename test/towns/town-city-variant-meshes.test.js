import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import { planDressing } from '../../src/editor/towns/TownDressing.js';
import { isTownProp, propClusterFor } from '../../src/editor/towns/TownPrefabCatalog.js';

const EXPECTED_CITY_PROPS = Object.freeze({
  Tudor: [
    'tudor_market_pavilion',
    'tudor_dovecote_post',
    'tudor_flower_trellis_arch',
    'tudor_watch_lantern_gallows',
    'tudor_guild_display_cart',
  ],
  Nordic: [
    'nordic_dragon_totem_post',
    'nordic_brewery_cask_rack',
    'nordic_mead_hall_brazier',
    'nordic_furs_tanning_frame',
    'nordic_skiff_drydock_hull',
  ],
  Med: [
    'med_amphora_terrace_stand',
    'med_cypress_urn_planter',
    'med_sun_arbor_pergola',
    'med_marble_lion_fountain',
    'med_merchant_scale_counter',
  ],
  Goblin: [
    'goblin_scrap_still_boiler',
    'goblin_cage_spike_gibbet',
    'goblin_salvage_trophy_totem',
    'goblin_bog_mushroom_coop',
    'goblin_tinker_scrap_cart',
  ],
  Orc: [
    'orc_warchief_drum_pavilion',
    'orc_bone_spike_barricade',
    'orc_forge_quench_anvil_rig',
    'orc_hide_rack_trophy_frame',
    'orc_charred_idol_pillar',
  ],
  Frostgard: [
    'frostgard_ice_saw_rack',
    'frostgard_hearth_kettle_shelter',
    'frostgard_runic_lantern_post',
    'frostgard_wolf_pelt_sled',
    'frostgard_rime_shrine_cairn',
  ],
  Stonehold: [
    'dwarf_steam_exhaust_monument',
    'dwarf_rune_forge_pedestal',
    'dwarf_aqueduct_spout',
    'dwarf_ore_classifier_chute',
    'dwarf_ancestral_stele',
  ],
  umbrakor: [
    'umbrakor_spider_silk_obelisk',
    'umbrakor_bioluminescent_cap_shrine',
    'umbrakor_wrought_censer_gallows',
    'umbrakor_night_market_canopy',
    'umbrakor_abyssal_waystone',
  ],
});

test('every city family and realm has at least 5 new exported kit modules & colliders', async () => {
  const prefabsJson = JSON.parse(
    await fs.readFile('public/assets/environment/medieval-kit/medieval_kit_prefabs.json', 'utf8'),
  );
  const colliders = prefabsJson.moduleColliders ?? {};
  for (const [culture, kinds] of Object.entries(EXPECTED_CITY_PROPS)) {
    assert.ok(kinds.length >= 5, `${culture} has >= 5 new props`);
    for (const kind of kinds) {
      const cluster = propClusterFor(kind, 0);
      assert.equal(cluster.length, 1, `${kind} should map to a kit cluster`);
      const moduleName = cluster[0][0];
      assert.equal(isTownProp(moduleName), true, `${moduleName} should be flagged as town prop`);
      assert.ok(colliders[moduleName], `${moduleName} missing collider in medieval_kit_prefabs.json`);
    }
  }
});

test('planDressing places the new culture-specific props across well-spaced towns', () => {
  for (const [culture, kinds] of Object.entries(EXPECTED_CITY_PROPS)) {
    const family = culture === 'umbrakor' ? 'Med' : culture;
    const loreRealm = culture === 'umbrakor' ? 'umbrakor' : null;
    const placed = Array.from({ length: 18 }, (_, index) => ({
      building: { kind: index % 3 === 0 ? 'smithy' : 'house', x: index * 32, z: 0, yaw: 0, loreRealm },
      size: [8, 6],
      family,
    }));
    const props = planDressing({
      plan: { streets: [], props: [], profile: { identity: { loreRealm } } },
      seed: 123,
      placed,
      family,
    });
    const emittedKinds = new Set(props.map((prop) => prop.kind));
    const matched = kinds.filter((kind) => emittedKinds.has(kind));
    assert.ok(matched.length >= 3, `${culture} should place several new city props, matched: ${matched.join(', ')}`);
  }
});
