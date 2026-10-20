import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  REQUIRED_PBR_MAPS,
  REQUIRED_REFERENCE_VIEWS,
  auditAllAssetsProduction,
  buildAssetPromptPack,
  buildRegionScenePromptPack,
  inspectAssetProductionFiles,
  scaffoldAssetWorkspace,
} from '../src/worldIdentity/AssetProductionPipeline.js';
import { LORE_REALM_CATALOG } from '../src/worldIdentity/VisualIdentityCatalog.js';

test('buildAssetPromptPack produces 6 orthographic/hero views and tileable PBR material prompts', () => {
  const pack = buildAssetPromptPack('lumeshire/imperial-registry-hall');
  assert.equal(pack.assetId, 'lumeshire/imperial-registry-hall');
  assert.equal(pack.priority, 'P0');
  assert.equal(pack.assetClass, 'civic');
  assert.equal(pack.modelStatus, 'planned');
  assert.deepEqual(Object.keys(pack.views), REQUIRED_REFERENCE_VIEWS);

  for (const view of REQUIRED_REFERENCE_VIEWS) {
    assert.ok(pack.views[view].prompt.length > 40, `Prompt for ${view} must be populated`);
    assert.ok(pack.views[view].negativePrompt.length > 20, `Negative prompt for ${view} must be populated`);
    assert.equal(pack.views[view].targetPath, `docs/asset-bible/references/lumeshire/imperial-registry-hall/${view}.png`);
  }

  assert.equal(pack.materials.length, 2);
  assert.equal(REQUIRED_PBR_MAPS.length, 5);
});

test('buildRegionScenePromptPack generates regional establishing scene prompt and 6 landmark packs for every realm', () => {
  for (const realmKey of Object.keys(LORE_REALM_CATALOG)) {
    const regionPack = buildRegionScenePromptPack(realmKey);
    assert.equal(regionPack.realmId, realmKey);
    assert.ok(regionPack.scenePrompt.includes(regionPack.displayName));
    assert.equal(regionPack.landmarks.length, 6);
  }
});

test('scaffoldAssetWorkspace and inspectAssetProductionFiles track reference readiness honestly', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'drusniel-asset-bible-'));
  try {
    const initial = inspectAssetProductionFiles('stonehold/fortress-mountain-gate', tmpRoot);
    assert.equal(initial.briefPresent, false);
    assert.equal(initial.referenceComplete, false);
    assert.equal(initial.missingViews.length, 6);

    const scaffolded = scaffoldAssetWorkspace('stonehold/fortress-mountain-gate', tmpRoot);
    assert.ok(fs.existsSync(scaffolded.briefPath));
    assert.ok(fs.existsSync(scaffolded.materialPath));
    assert.ok(fs.existsSync(scaffolded.promptsPath));

    const afterScaffold = inspectAssetProductionFiles('stonehold/fortress-mountain-gate', tmpRoot);
    assert.equal(afterScaffold.briefPresent, true);
    assert.equal(afterScaffold.materialNotesPresent, true);
    assert.equal(afterScaffold.referenceComplete, false);

    // Simulate all 6 orthographic reference images being placed
    for (const view of REQUIRED_REFERENCE_VIEWS) {
      fs.writeFileSync(path.join(scaffolded.refDir, `${view}.png`), 'stub-png');
    }
    const afterRefs = inspectAssetProductionFiles('stonehold/fortress-mountain-gate', tmpRoot);
    assert.equal(afterRefs.referenceComplete, true);
    assert.equal(afterRefs.missingViews.length, 0);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('auditAllAssetsProduction validates all 138 assets have zero false readiness claims', () => {
  const audit = auditAllAssetsProduction(process.cwd());
  assert.equal(audit.summary.totalAssets, 138);
  assert.equal(audit.valid, true);
  assert.deepEqual(audit.violations, []);
  assert.ok(audit.scaffoldedBriefCount >= 4);
});
