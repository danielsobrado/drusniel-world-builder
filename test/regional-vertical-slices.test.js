import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { planSettlement } from '../src/editor/world/settlements/SettlementPlanner.js';
import { layoutTown } from '../src/editor/towns/TownLayout.js';
import { residentManifest } from '../src/editor/actors/ResidentManifest.js';
import { getFallbackWarnings, resetFallbackWarnings } from '../src/worldIdentity/AssetRegistry.js';
import { LORE_REALM_CATALOG } from '../src/worldIdentity/VisualIdentityCatalog.js';

const KIT = JSON.parse(
  fs.readFileSync('public/assets/environment/medieval-kit/medieval_kit_prefabs.json', 'utf8'),
);

test('Vertical Slice 1: Lumeshire imperial market town integrates across procedural, kit, and resident systems', () => {
  resetFallbackWarnings();
  const settlement = {
    id: 501,
    name: 'Aldenburg',
    cellX: 100,
    cellZ: 100,
    population: 22,
    capital: true,
    citadel: true,
    walls: true,
    plaza: true,
    culture: 3,
    stateName: 'Lumeshire',
  };

  const plan = planSettlement({
    settlement,
    worldSeed: 101,
    routeBearings: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
    sampleHeight: () => 14,
    isBuildable: () => true,
  });

  assert.equal(plan.identity.loreRealm, 'lumeshire');
  assert.equal(plan.identity.cultureKey, 'lumish');
  assert.equal(plan.identity.localBranch, 'lumeshire-imperial');
  assert.equal(plan.profile.style.key, 'limestone-slate');

  const buildingAssets = plan.buildings.map((b) => b.assetId).filter(Boolean);
  assert.ok(buildingAssets.includes('lumeshire/imperial-registry-hall'));
  assert.ok(buildingAssets.includes('lumeshire/parish-church'));
  assert.ok(buildingAssets.includes('lumeshire/granary'));
  assert.ok(plan.fields.length > 0, 'Lumeshire agricultural market town must include crop fields');

  const town = layoutTown({
    settlement,
    plan,
    tileSize: 2.4,
    kit: KIT,
    sampleHeight: () => 14,
  });
  assert.equal(town.family, 'Tudor');
  assert.equal(town.identity.loreRealm, 'lumeshire');
  assert.ok(town.parts.size > 8, 'Kit layout must populate modular parts');
  assert.ok(town.interiors.length > 4, 'Kit layout must include playable building interiors');

  const residents = residentManifest(settlement, {
    tileSize: 2.4,
    worldSeed: 101,
    settings: { maxPerSettlement: 10, wanderRadius: 16 },
  });
  assert.equal(residents[0].kind, 'paladin');
  assert.equal(residents[0].loreRealm, 'lumeshire');
  assert.equal(residents[0].cultureKey, 'lumish');
  assert.ok(residents.some((r) => r.profession === 'imperial-magistrate' || r.profession === 'lumina-cleric'));

  const warnings = getFallbackWarnings();
  assert.ok(warnings.some((id) => id.startsWith('lumeshire/')), 'Unmodeled planned assets must record once-per-ID fallback trace');
});

test('Vertical Slice 2: Zuraldi mountain-pass settlement adapts to upland province and steep pass terrain', () => {
  const settlement = {
    id: 502,
    name: 'Lexabusur',
    cellX: 100,
    cellZ: 100,
    population: 14,
    citadel: true,
    plaza: true,
    culture: 6,
    stateName: 'Lumeshire',
    province: 131,
    provinceName: 'Zuraldi',
    elevation: 44,
    slope: 0.28,
    biomeId: 10,
  };

  const plan = planSettlement({
    settlement,
    worldSeed: 202,
    routeBearings: [0.3, -2.6],
    sampleHeight: (x, z) => 44 + x * 0.06 + z * 0.03,
    isBuildable: () => true,
  });

  assert.equal(plan.identity.loreRealm, 'zuraldi');
  assert.equal(plan.identity.cultureKey, 'zuraldarr');
  assert.equal(plan.identity.localBranch, 'lumeshire-zuraldarr');
  assert.ok(plan.identity.activeOverlays.includes('mountain-pass'));

  const buildingAssets = plan.buildings.map((b) => b.assetId).filter(Boolean);
  assert.ok(buildingAssets.includes('zuraldi/six-offices-council-hall'));
  assert.ok(buildingAssets.includes('zuraldi/ridge-watchhouse'));

  const propAssets = plan.props.map((p) => p.assetId).filter(Boolean);
  assert.ok(propAssets.some((id) => id.startsWith('zuraldi/') || id.startsWith('shared/mountain-pass/')));

  const town = layoutTown({
    settlement,
    plan,
    tileSize: 2.4,
    kit: KIT,
    sampleHeight: (x, z) => 42 + x * 0.05 + z * 0.03,
  });
  assert.equal(town.family, 'Nordic');
  assert.equal(town.identity.loreRealm, 'zuraldi');

  const residents = residentManifest(settlement, {
    tileSize: 2.4,
    worldSeed: 202,
    settings: { maxPerSettlement: 8, wanderRadius: 14 },
  });
  assert.ok(residents.every((r) => r.loreRealm === 'zuraldi' && r.cultureKey === 'zuraldarr'));
  assert.ok(residents.some((r) => ['highland-councilor', 'grove-druid', 'pass-warden', 'terrace-herder'].includes(r.profession)));
});

test('Vertical Slice 3: Stonehold Vondari mining settlement includes forge landmarks, ore infrastructure, and crosswalk confidence', () => {
  const settlement = {
    id: 503,
    name: 'Khaz-Vondar',
    cellX: 100,
    cellZ: 100,
    population: 19,
    walls: true,
    citadel: true,
    plaza: true,
    culture: 10,
    stateName: 'Ironpeak',
    elevation: 46,
    slope: 0.25,
    biomeId: 10,
  };

  const plan = planSettlement({
    settlement,
    worldSeed: 303,
    routeBearings: [0, Math.PI],
    sampleHeight: (x, z) => 46 + x * 0.04 + z * 0.04,
    isBuildable: () => true,
  });

  assert.equal(plan.identity.loreRealm, 'stonehold');
  assert.equal(plan.identity.cultureKey, 'vondari');
  assert.equal(plan.identity.localBranch, 'ironpeak-vondari');
  assert.equal(plan.identity.mappingConfidence, 'requires-confirmation');

  const buildingAssets = plan.buildings.map((b) => b.assetId).filter(Boolean);
  assert.ok(buildingAssets.includes('stonehold/fortress-mountain-gate'));
  assert.ok(buildingAssets.includes('stonehold/forgeheart-workshop'));
  assert.ok(buildingAssets.includes('stonehold/smelter-tower'));

  const residents = residentManifest(settlement, {
    tileSize: 2.4,
    worldSeed: 303,
    settings: { maxPerSettlement: 8, wanderRadius: 14 },
  });
  assert.ok(residents.some((r) => ['deep-warden', 'forgeheart-master', 'ore-assayer', 'vault-councillor'].includes(r.profession)));
});

test('Vertical Slice 4: Grukmar multi-people wetland trading settlement combines Goblin wetland stilt wards with Nordic upland orc wards', () => {
  const settlement = {
    id: 504,
    name: 'Mirefang Crossing',
    cellX: 100,
    cellZ: 100,
    population: 20,
    citadel: true,
    plaza: true,
    port: true,
    culture: 13,
    stateName: 'Grukmar',
    biomeId: 12,
    waterDepth: 0.4,
  };

  const plan = planSettlement({
    settlement,
    worldSeed: 404,
    routeBearings: [-Math.PI / 2, Math.PI],
    sampleHeight: (x) => (x > 34 ? -0.5 : 2.2),
    isBuildable: (x) => x <= 34,
  });

  assert.equal(plan.identity.loreRealm, 'grukmar');
  assert.equal(plan.identity.cultureKey, 'goblin-peoples');
  assert.equal(plan.identity.localBranch, 'grukmar-goblins');
  assert.ok(plan.identity.activeOverlays.includes('swamp-bog'));
  assert.ok(plan.identity.activeOverlays.includes('coast-harbor'));
  assert.equal(plan.profile.kitStyleKey, 'swamp-thatch');

  // Verify boardwalk streets
  assert.ok(plan.streets.some((s) => s.surfaceRole === 'boardwalk'));

  // Verify multi-people district wards in buildings (both Goblin wetland ward and Nordic upland orc ward)
  const kitFamilies = new Set(plan.buildings.map((b) => b.kitFamily).filter(Boolean));
  assert.ok(kitFamilies.has('Goblin'), 'Grukmar town must contain Goblin wetland buildings');
  assert.ok(kitFamilies.has('Nordic'), 'Grukmar multi-people town must contain upland Nordic/Orc camp buildings');

  // Verify kit layout places both Goblin and Nordic modules + swamp props
  const town = layoutTown({
    settlement,
    plan,
    tileSize: 2.4,
    kit: KIT,
    sampleHeight: () => 2.2,
  });
  assert.equal(town.family, 'Goblin');
  assert.equal(town.styleKey, 'swamp-thatch');
  assert.ok(town.parts.has('Wall_Goblin') || town.parts.has('Plinth_Stilts'), 'Kit town must use Goblin stilt/wall modules');
  assert.ok(
    town.parts.has('Wall_Log') || town.parts.has('Wall_Timber') || town.parts.has('Wall_Stone'),
    'Kit town must also include upland orc/troll camp modules',
  );

  const residents = residentManifest(settlement, {
    tileSize: 2.4,
    worldSeed: 404,
    settings: { maxPerSettlement: 10, wanderRadius: 16 },
  });
  const residentCultures = new Set(residents.map((r) => r.cultureKey));
  assert.ok(residentCultures.has('goblin-peoples'));
  assert.ok(residentCultures.has('orc-peoples'));
});

test('All 9 canonical lore realms produce distinct recipes, landmarks, and physical adaptations', () => {
  const realmConfigs = [
    { loreRealm: 'lumeshire', culture: 3, stateName: 'Lumeshire', biomeId: 6, elevation: 12 },
    { loreRealm: 'zuraldi', culture: 6, stateName: 'Lumeshire', provinceName: 'Zuraldi', biomeId: 10, elevation: 42, slope: 0.25 },
    { loreRealm: 'contia', culture: 11, stateName: 'Contia', biomeId: 5, elevation: 8, port: true },
    { loreRealm: 'frostgard', culture: 7, stateName: 'Frostgard', biomeId: 11, elevation: 26, snow: 0.8 },
    { loreRealm: 'stonehold', culture: 10, stateName: 'Ironpeak', biomeId: 10, elevation: 48, slope: 0.24 },
    { loreRealm: 'elenoria', culture: 1, stateName: 'Elenoria', biomeId: 7, elevation: 16 },
    { loreRealm: 'grukmar', culture: 13, stateName: 'Grukmar', biomeId: 12, elevation: 2 },
    { loreRealm: 'umbrakor', culture: 8, stateName: "Umbra'kor", biomeId: 10, elevation: 30, isUnderground: true },
    { loreRealm: 'wyrmreach', culture: 5, stateName: 'Wyrmreach', biomeId: 10, elevation: 52, slope: 0.3 },
  ];

  assert.equal(realmConfigs.length, Object.keys(LORE_REALM_CATALOG).length);
  const recipesSeen = new Set();
  const primaryLandmarksSeen = new Set();

  for (const [idx, cfg] of realmConfigs.entries()) {
    const settlement = {
      id: 600 + idx,
      name: `RealmTown_${cfg.loreRealm}`,
      cellX: 80,
      cellZ: 80,
      population: 18,
      capital: true,
      citadel: true,
      plaza: true,
      ...cfg,
    };
    const plan = planSettlement({
      settlement,
      worldSeed: 777 + idx,
      sampleHeight: () => cfg.elevation,
      isBuildable: cfg.port ? (x) => x <= 38 : () => true,
    });

    assert.equal(plan.identity.loreRealm, cfg.loreRealm);
    recipesSeen.add(plan.profile.recipe.recipeId);
    const firstLandmark = plan.buildings.find((b) => b.assetId)?.assetId;
    assert.ok(firstLandmark, `Expected mandatory landmark for ${cfg.loreRealm}`);
    primaryLandmarksSeen.add(firstLandmark);

    if (cfg.loreRealm === 'umbrakor' || cfg.loreRealm === 'wyrmreach') {
      assert.equal(plan.fields.length, 0, `${cfg.loreRealm} must suppress surface crop fields`);
    }
  }

  assert.equal(recipesSeen.size, 9, 'Every lore realm must resolve to a distinct SceneRecipe');
  assert.equal(primaryLandmarksSeen.size, 9, 'Every lore realm must place a distinct primary landmark');
});
