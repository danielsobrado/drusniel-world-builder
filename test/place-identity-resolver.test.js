import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePlaceIdentity } from '../src/worldIdentity/PlaceIdentityResolver.js';
import { resolveSceneRecipe } from '../src/worldIdentity/SceneRecipeResolver.js';

test('PlaceIdentity resolves Lumish Imperial market town vs Zuraldarr mountain pass inside Lumeshire state', () => {
  const lumishTown = resolvePlaceIdentity({
    id: 101,
    name: 'Aurelia',
    culture: 3, // Kentland -> lumish
    stateName: 'Lumeshire',
    population: 6.5,
    plaza: true,
    temple: true,
    walls: true,
  }, {
    geography: { biome: 6, elevation: 12, slope: 0.04, hasWaterAccess: false },
  });

  assert.equal(lumishTown.cultureKey, 'lumish');
  assert.equal(lumishTown.loreRealm, 'lumeshire');
  assert.equal(lumishTown.localBranch, 'lumeshire-imperial');
  assert.equal(lumishTown.azgaarStateName, 'Lumeshire');
  assert.equal(lumishTown.mappingConfidence, 'direct-name');
  assert.equal(lumishTown.faith, 'Church of Lumina');

  const lumishRecipe = resolveSceneRecipe(lumishTown);
  assert.equal(lumishRecipe.architecture.kitFamily, 'Tudor');
  assert.equal(lumishRecipe.architecture.streetGrammar, 'axial-imperial-grid');
  assert.ok(lumishRecipe.mandatoryLandmarks.some((l) => l.assetId === 'lumeshire/imperial-registry-hall'));
  assert.ok(lumishRecipe.mandatoryLandmarks.some((l) => l.assetId === 'lumeshire/parish-church'));
  assert.ok(lumishRecipe.forbiddenAssets.includes('coast-harbor/pile-jetty'), 'Inland Lumish town must forbid coastal jetty');

  // Zuraldarr mountain pass inside Lumeshire state (Lexabusur / Persbury province 34 / culture 6 Valarans)
  const zuraldiPass = resolvePlaceIdentity({
    id: 102,
    name: 'Lexabusur',
    culture: 6, // Valarans -> zuraldarr
    stateName: 'Lumeshire',
    province: 34,
    provinceName: 'Persbury',
    population: 3.8,
  }, {
    geography: { biome: 10, elevation: 42, slope: 0.24, hasWaterAccess: false },
  });

  assert.equal(zuraldiPass.cultureKey, 'zuraldarr');
  assert.equal(zuraldiPass.loreRealm, 'zuraldi');
  assert.equal(zuraldiPass.localBranch, 'lumeshire-zuraldarr');
  assert.equal(zuraldiPass.azgaarStateName, 'Lumeshire', 'Must preserve Azgaar state name Lumeshire');
  assert.equal(zuraldiPass.mappingConfidence, 'culture-and-geography');
  assert.ok(zuraldiPass.activeOverlays.includes('mountain-pass'));

  const zuraldiRecipe = resolveSceneRecipe(zuraldiPass);
  assert.equal(zuraldiRecipe.architecture.kitFamily, 'Nordic');
  assert.equal(zuraldiRecipe.architecture.streetGrammar, 'contour-switchback-terrace');
  assert.ok(zuraldiRecipe.mandatoryLandmarks.some((l) => l.assetId === 'zuraldi/six-offices-council-hall'));
  assert.ok(zuraldiRecipe.mandatoryLandmarks.some((l) => l.assetId === 'zuraldi/switchback-bridge'));
  assert.ok(zuraldiRecipe.forbiddenAssets.includes('lumeshire/parish-church'), 'Zuraldarr autonomy forbids Imperial cathedral dominance');
  assert.notEqual(lumishRecipe.architecture.streetGrammar, zuraldiRecipe.architecture.streetGrammar);
});

test('Stonehold <-> Ironpeak crosswalk preserves both names and requires-confirmation confidence', () => {
  const stoneholdMining = resolvePlaceIdentity({
    id: 201,
    name: 'Khar-Vondar',
    culture: 10, // Durinheim -> vondari
    stateName: 'Ironpeak',
    population: 12.0,
    citadel: true,
    walls: true,
  }, {
    geography: { biome: 11, elevation: 55, slope: 0.28 },
  });

  assert.equal(stoneholdMining.cultureKey, 'vondari');
  assert.equal(stoneholdMining.primaryAncestry, 'dwarven');
  assert.equal(stoneholdMining.loreRealm, 'stonehold');
  assert.equal(stoneholdMining.azgaarStateName, 'Ironpeak');
  assert.equal(stoneholdMining.mappingConfidence, 'requires-confirmation');
  assert.equal(stoneholdMining.localBranch, 'ironpeak-vondari');
  assert.ok(stoneholdMining.economicRoles.includes('mining'));
  assert.ok(stoneholdMining.economicRoles.includes('smelting-forge'));

  const recipe = resolveSceneRecipe(stoneholdMining);
  assert.equal(recipe.architecture.streetGrammar, 'fortified-forge-axis');
  assert.ok(recipe.mandatoryLandmarks.some((l) => l.assetId === 'stonehold/forgeheart-workshop'));
  assert.ok(recipe.mandatoryLandmarks.some((l) => l.assetId === 'stonehold/smelter-tower'));
  assert.ok(recipe.mandatoryLandmarks.some((l) => l.assetId === 'stonehold/ore-lift-headframe'));
});

test('Grukmar multi-people settlement resolves distinct goblin wetland and orc upland wards', () => {
  const grukmarTrade = resolvePlaceIdentity({
    id: 301,
    name: 'Mirewatch',
    culture: 13, // Darkspire -> goblin-peoples
    stateName: 'Grukmar',
    population: 5.2,
    port: true,
  }, {
    geography: { biome: 12, elevation: 4, slope: 0.03, isWetland: true, hasWaterAccess: true },
  });

  assert.equal(grukmarTrade.loreRealm, 'grukmar');
  assert.equal(grukmarTrade.cultureKey, 'goblin-peoples');
  assert.equal(grukmarTrade.localBranch, 'grukmar-goblins');
  assert.equal(grukmarTrade.isMultiPeople, true);
  assert.deepEqual(grukmarTrade.constituentPeoples, ['goblin-peoples', 'orc-peoples', 'rakhnid-broods']);
  assert.ok(grukmarTrade.activeOverlays.includes('swamp-bog'));
  assert.ok(grukmarTrade.activeOverlays.includes('coast-harbor'));

  const recipe = resolveSceneRecipe(grukmarTrade);
  assert.equal(recipe.multiPeopleDistricts.length, 3);
  const wardIds = recipe.multiPeopleDistricts.map((w) => w.id);
  assert.deepEqual(wardIds, ['goblin-wetland-ward', 'orc-upland-ward', 'shared-salvage-barter-yard']);
  assert.ok(recipe.mandatoryLandmarks.some((l) => l.assetId === 'grukmar/bog-stilt-dwelling'));
  assert.ok(recipe.mandatoryLandmarks.some((l) => l.assetId === 'grukmar/clan-assembly-hall'));
  assert.ok(recipe.regionalProps.some((p) => p.assetId === 'grukmar/goblin-boat-landing'));
});

test('Same culture adapts visibly to coastal harbor vs inland plain vs upland pass', () => {
  const inlandLumish = resolveSceneRecipe({
    id: 401,
    name: 'Highfield',
    culture: 3,
    stateName: 'Lumeshire',
    population: 5,
    port: false,
  }, {
    geography: { biome: 6, elevation: 10, slope: 0.02, hasWaterAccess: false },
  });

  const coastalLumish = resolveSceneRecipe({
    id: 402,
    name: 'Tidegate',
    culture: 3,
    stateName: 'Lumeshire',
    population: 5,
    port: true,
  }, {
    geography: { biome: 6, elevation: 2, slope: 0.03, hasWaterAccess: true, isCoastal: true },
  });

  assert.notDeepEqual(inlandLumish.identity.activeOverlays, coastalLumish.identity.activeOverlays);
  assert.ok(coastalLumish.identity.activeOverlays.includes('coast-harbor'));
  assert.ok(coastalLumish.overlayModules.some((m) => m.assetId === 'coast-harbor/pile-jetty'));
  assert.equal(inlandLumish.overlayModules.some((m) => m.assetId === 'coast-harbor/pile-jetty'), false);
  assert.ok(inlandLumish.forbiddenAssets.includes('coast-harbor/pile-jetty'));
});

test('All 9 regions resolve distinct architectural grammars, landmarks, and constraints', () => {
  const fixtures = [
    { id: 1, name: 'Lumeton', culture: 3, stateName: 'Lumeshire', population: 6 },
    { id: 2, name: 'Lexabusur', culture: 6, stateName: 'Lumeshire', province: 34, population: 4 },
    { id: 3, name: 'Ironhold', culture: 10, stateName: 'Ironpeak', population: 8 },
    { id: 4, name: 'Bogmarket', culture: 13, stateName: 'Grukmar', population: 5 },
    { id: 5, name: 'Solaria', culture: 11, stateName: 'Contia', population: 9 },
    { id: 6, name: 'Rimehearth', culture: 7, stateName: 'Frostgard', population: 4, port: true },
    { id: 7, name: 'Sylvanis', culture: 1, stateName: 'Elenoria', population: 6 },
    { id: 8, name: 'Vael-Neth', culture: 8, stateName: "Umbra'kor", population: 7, underground: true },
    { id: 9, name: 'Breaker Point', culture: 5, stateName: 'Wyrmreach', population: 1.5, ruin: true },
  ];

  const recipes = fixtures.map((f) => resolveSceneRecipe(f));
  const realms = new Set(recipes.map((r) => r.identity.loreRealm));
  assert.equal(realms.size, 9, 'All 9 lore realms must be represented');

  // Umbra'kor underground cavern suppresses surface farms and includes underground-cavern overlay
  const umbrakor = recipes.find((r) => r.identity.loreRealm === 'umbrakor');
  assert.ok(umbrakor.identity.activeOverlays.includes('underground-cavern'));
  assert.equal(umbrakor.streetConfig.suppressSurfaceFarms, true);

  // Wyrmreach burg tagged with draconic-remnant (5) reassigns to local frontier people (wyrmreach-orcs)
  const wyrmreach = recipes.find((r) => r.identity.loreRealm === 'wyrmreach');
  assert.equal(wyrmreach.identity.mappingConfidence, 'direct-name-architecture-uncertain');
  assert.equal(wyrmreach.identity.localBranch, 'wyrmreach-orcs');
  assert.ok(wyrmreach.identity.activeOverlays.includes('ruins-rift'));
});
