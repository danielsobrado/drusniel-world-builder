#!/usr/bin/env node
/**
 * Validates and synchronizes the Drusniel Visual Identity & Asset Registry catalogs:
 * - `config/cultures.yaml`
 * - `docs/asset-bible/proposed-config/visual-identity.proposed.yaml`
 * - `docs/asset-bible/proposed-config/asset-candidates.proposed.yaml`
 * - `config/visual-identity.yaml`
 * - `config/asset-registry.yaml`
 * - `src/worldIdentity/VisualIdentityCatalog.js`
 * - `src/worldIdentity/AssetRegistry.js`
 *
 * Usage:
 *   node scripts/validate-visual-identity.mjs [--write-config]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import {
  AZGAAR_CULTURE_SOURCE_MAP,
  ENVIRONMENTAL_OVERLAYS,
  LOCAL_CULTURE_BRANCHES,
  LORE_REALM_CATALOG,
  validateVisualIdentityCatalog,
} from '../src/worldIdentity/VisualIdentityCatalog.js';
import {
  ASSET_CANDIDATE_LIST,
  summarizeAssetBacklog,
  validateAssetRegistry,
} from '../src/worldIdentity/AssetRegistry.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildVisualIdentityYamlObject() {
  return {
    schemaVersion: 1,
    catalogId: 'drusniel-visual-identity-v1',
    authority: {
      loreSite: 'https://www.drusniel.com/',
      culturesCatalog: 'config/cultures.yaml',
      localPopulationsRef: 'docs/reference/eldara-local-cultures-populations.md',
      assetBible: 'docs/asset-bible/README.md',
    },
    azgaarCultureSourceMap: AZGAAR_CULTURE_SOURCE_MAP,
    loreRealms: LORE_REALM_CATALOG,
    localCultureBranches: LOCAL_CULTURE_BRANCHES,
    environmentalOverlays: ENVIRONMENTAL_OVERLAYS,
  };
}

export function buildAssetRegistryYamlObject() {
  return {
    schemaVersion: 1,
    catalogId: 'drusniel-asset-registry-v1',
    summary: summarizeAssetBacklog(),
    assets: ASSET_CANDIDATE_LIST,
  };
}

export function runVisualIdentityValidation({ writeConfig = false } = {}) {
  const culturesPath = path.join(rootDir, 'config/cultures.yaml');
  const proposedIdentityPath = path.join(rootDir, 'docs/asset-bible/proposed-config/visual-identity.proposed.yaml');
  const proposedAssetsPath = path.join(rootDir, 'docs/asset-bible/proposed-config/asset-candidates.proposed.yaml');
  const visualIdentityConfigPath = path.join(rootDir, 'config/visual-identity.yaml');
  const assetRegistryConfigPath = path.join(rootDir, 'config/asset-registry.yaml');

  if (writeConfig) {
    fs.writeFileSync(visualIdentityConfigPath, YAML.stringify(buildVisualIdentityYamlObject()), 'utf8');
    fs.writeFileSync(assetRegistryConfigPath, YAML.stringify(buildAssetRegistryYamlObject()), 'utf8');
  }

  const errors = [];
  for (const filePath of [
    culturesPath,
    proposedIdentityPath,
    proposedAssetsPath,
    visualIdentityConfigPath,
    assetRegistryConfigPath,
  ]) {
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing required configuration file: ${path.relative(rootDir, filePath)}`);
    }
  }
  if (errors.length > 0) {
    return { valid: false, errors, summary: summarizeAssetBacklog() };
  }

  const culturesDoc = YAML.parse(fs.readFileSync(culturesPath, 'utf8'));
  const proposedIdentityDoc = YAML.parse(fs.readFileSync(proposedIdentityPath, 'utf8'));
  const proposedAssetsDoc = YAML.parse(fs.readFileSync(proposedAssetsPath, 'utf8'));
  const visualIdentityDoc = YAML.parse(fs.readFileSync(visualIdentityConfigPath, 'utf8'));
  const assetRegistryDoc = YAML.parse(fs.readFileSync(assetRegistryConfigPath, 'utf8'));

  const catalogResult = validateVisualIdentityCatalog(culturesDoc);
  errors.push(...catalogResult.errors);

  const registryResult = validateAssetRegistry(proposedAssetsDoc.candidates);
  errors.push(...registryResult.errors);

  // Check that every proposed region dossier exists in LORE_REALM_CATALOG
  for (const key of Object.keys(proposedIdentityDoc.regionDossiers ?? {})) {
    const realmKey = key === 'contian' ? 'contia' : key;
    if (!LORE_REALM_CATALOG[realmKey]) {
      errors.push(`Proposed regionDossier "${key}" missing from LORE_REALM_CATALOG`);
    }
  }

  // Check that every promptFile referenced by an asset exists under docs/asset-bible/
  for (const asset of ASSET_CANDIDATE_LIST) {
    const promptPath = path.join(rootDir, 'docs/asset-bible', asset.promptFile);
    if (!fs.existsSync(promptPath)) {
      errors.push(`Asset "${asset.id}" references missing promptFile: docs/asset-bible/${asset.promptFile}`);
    }
  }

  // Verify config/visual-identity.yaml and config/asset-registry.yaml match runtime
  if (Object.keys(visualIdentityDoc.loreRealms ?? {}).length !== Object.keys(LORE_REALM_CATALOG).length) {
    errors.push('config/visual-identity.yaml loreRealms count out of sync with LORE_REALM_CATALOG');
  }
  if ((assetRegistryDoc.assets ?? []).length !== ASSET_CANDIDATE_LIST.length) {
    errors.push('config/asset-registry.yaml assets count out of sync with ASSET_CANDIDATE_LIST');
  }

  return {
    valid: errors.length === 0,
    errors,
    summary: summarizeAssetBacklog(),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const writeConfig = process.argv.includes('--write-config');
  const result = runVisualIdentityValidation({ writeConfig });
  if (!result.valid) {
    console.error('Visual identity validation failed:');
    for (const err of result.errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  console.log(
    `Visual identity & asset registry validated: ${result.summary.totalAssets} assets (${result.summary.byPriority.P0} P0, ${result.summary.byPriority.P1} P1), 9 lore realms, 36 local branches, 6 environmental overlays.`,
  );
}
