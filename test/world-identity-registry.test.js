import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';
import {
  AZGAAR_CULTURE_SOURCE_MAP,
  ENVIRONMENTAL_OVERLAYS,
  LOCAL_CULTURE_BRANCHES,
  LORE_REALM_CATALOG,
  resolveCultureEntry,
  validateVisualIdentityCatalog,
} from '../src/worldIdentity/VisualIdentityCatalog.js';
import {
  ASSET_CANDIDATE_LIST,
  getAssetCandidate,
  isAssetPhysicallyEligible,
  listAssetsByOverlay,
  listAssetsByRegion,
  resetAssetFallbackWarnings,
  resolveRuntimeAsset,
  summarizeAssetBacklog,
  validateAssetRegistry,
} from '../src/worldIdentity/AssetRegistry.js';
import { SETTLEMENT_BUILDINGS } from '../src/editor/world/settlements/SettlementBuildingCatalog.js';
import { isStoneKind } from '../src/editor/world/settlements/SettlementStones.js';
import { isTrimKind } from '../src/editor/world/settlements/SettlementTrim.js';
import { propClusterFor } from '../src/editor/towns/TownPrefabCatalog.js';
import { runVisualIdentityValidation } from '../scripts/validate-visual-identity.mjs';

const kit = JSON.parse(
  fs.readFileSync(new URL('../public/assets/environment/medieval-kit/medieval_kit_prefabs.json', import.meta.url), 'utf8'),
);

test('VisualIdentityCatalog matches config/cultures.yaml sourceMappings and preserves mappingConfidence flags', () => {
  const culturesDoc = YAML.parse(fs.readFileSync(new URL('../config/cultures.yaml', import.meta.url), 'utf8'));
  const result = validateVisualIdentityCatalog(culturesDoc);
  assert.equal(result.valid, true, result.errors.join('\n'));

  assert.equal(Object.keys(AZGAAR_CULTURE_SOURCE_MAP).length, 14);
  assert.equal(resolveCultureEntry(3).key, 'lumish');
  assert.equal(resolveCultureEntry(6).key, 'zuraldarr');
  assert.equal(resolveCultureEntry(10).key, 'vondari');
  assert.equal(resolveCultureEntry(13).key, 'goblin-peoples');
  assert.equal(resolveCultureEntry('Valarans').key, 'zuraldarr');
  assert.equal(resolveCultureEntry('vondari').sourceId, 10);

  // Critical lore crosswalk guardrails
  assert.equal(LORE_REALM_CATALOG.stonehold.mappingConfidence, 'requires-confirmation');
  assert.ok(LORE_REALM_CATALOG.stonehold.azgaarStateNames.includes('Ironpeak'));
  assert.equal(LORE_REALM_CATALOG.wyrmreach.mappingConfidence, 'direct-name-architecture-uncertain');
  assert.equal(LOCAL_CULTURE_BRANCHES['wyrmreach-draconic-remnant'].ruralOnly, true);
});

test('AssetRegistry validates all 138 candidate assets and maps every fallback to a real settlement & kit item', () => {
  const validation = runVisualIdentityValidation();
  assert.equal(validation.valid, true, validation.errors.join('\n'));

  const summary = summarizeAssetBacklog();
  assert.equal(summary.totalAssets, 138);
  assert.equal(summary.byPriority.P0, 54);
  assert.equal(summary.byPriority.P1, 84);
  assert.equal(Object.keys(summary.byRegion).length, 9);
  assert.equal(Object.keys(summary.byOverlay).length, 6);

  for (const region of ['lumeshire', 'zuraldi', 'stonehold', 'grukmar', 'contian', 'frostgard', 'elenoria', 'umbrakor', 'wyrmreach']) {
    assert.equal(listAssetsByRegion(region).length, 12, `Expected 12 assets for ${region}`);
    assert.equal(listAssetsByRegion(region, { priority: 'P0' }).length, 6, `Expected 6 P0 assets for ${region}`);
    assert.equal(listAssetsByRegion(region, { priority: 'P1' }).length, 6, `Expected 6 P1 assets for ${region}`);
  }

  for (const overlay of Object.keys(ENVIRONMENTAL_OVERLAYS)) {
    assert.equal(listAssetsByOverlay(overlay).length, 5, `Expected 5 assets for ${overlay}`);
  }

  for (const asset of ASSET_CANDIDATE_LIST) {
    const { settlementKind, kitPrefab, kitProp } = asset.fallback;
    const validSettlementKind = Boolean(
      SETTLEMENT_BUILDINGS[settlementKind] || isStoneKind(settlementKind) || isTrimKind(settlementKind),
    );
    assert.ok(validSettlementKind, `Asset ${asset.id} fallback has unknown settlementKind: ${settlementKind}`);
    if (kitPrefab) {
      assert.ok(kit.prefabs[kitPrefab], `Asset ${asset.id} fallback references unknown kitPrefab: ${kitPrefab}`);
    } else if (kitProp) {
      assert.ok(propClusterFor(kitProp, 0).length > 0, `Asset ${asset.id} fallback references unknown kitProp: ${kitProp}`);
    } else {
      assert.fail(`Asset ${asset.id} fallback must define kitPrefab or kitProp`);
    }
  }
});

test('resolveRuntimeAsset never claims planned assets have finished GLBs and warns at most once per ID', () => {
  resetAssetFallbackWarnings();
  const warnings = [];
  const logger = { warn: (msg) => warnings.push(msg) };

  const first = resolveRuntimeAsset('lumeshire/imperial-registry-hall', { warnOnFallback: true, logger });
  const second = resolveRuntimeAsset('lumeshire/imperial-registry-hall', { warnOnFallback: true, logger });
  assert.equal(first.resolution, 'fallback');
  assert.equal(first.runtimeGlb, null);
  assert.equal(first.fallback.settlementKind, 'hall');
  assert.equal(first.fallback.kitPrefab, 'Tudor_Guildhall');
  assert.deepEqual(first, second);
  assert.equal(warnings.length, 1, 'Should warn only once per missing/planned asset ID');

  const unknown = resolveRuntimeAsset('nonexistent/mystery-tower', { warnOnFallback: true, logger });
  assert.equal(unknown.known, false);
  assert.equal(unknown.resolution, 'fallback');
  assert.equal(warnings.length, 2);

  assert.equal(validateAssetRegistry().valid, true);
});

test('isAssetPhysicallyEligible enforces water, wetland, slope, forest, cavern, and ruin constraints', () => {
  assert.equal(isAssetPhysicallyEligible('coast-harbor/pile-jetty', { hasWaterAccess: false }), false);
  assert.equal(isAssetPhysicallyEligible('coast-harbor/pile-jetty', { hasWaterAccess: true }), true);

  assert.equal(isAssetPhysicallyEligible('grukmar/bog-stilt-dwelling', { isWetland: false }), false);
  assert.equal(isAssetPhysicallyEligible('grukmar/bog-stilt-dwelling', { isWetland: true }), true);

  assert.equal(isAssetPhysicallyEligible('zuraldi/switchback-bridge', { slope: 0.04 }), false);
  assert.equal(isAssetPhysicallyEligible('zuraldi/switchback-bridge', { slope: 0.22 }), true);

  assert.equal(isAssetPhysicallyEligible('underground-cavern/shaft-air-damper', { isUnderground: false }), false);
  assert.equal(isAssetPhysicallyEligible('underground-cavern/shaft-air-damper', { isUnderground: true }), true);

  assert.equal(isAssetPhysicallyEligible('wyrmreach/ancient-smooth-stair', { hasRuinContext: false }), false);
  assert.equal(isAssetPhysicallyEligible('wyrmreach/ancient-smooth-stair', { hasRuinContext: true }), true);

  assert.ok(getAssetCandidate('stonehold/forgeheart-workshop'));
});
