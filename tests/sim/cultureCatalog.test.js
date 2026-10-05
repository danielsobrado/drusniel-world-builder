import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

import {
  catalogAppliesToCampaign,
  resolveCultureCatalog,
  resolveSourceCultureMapping,
} from '../../src/sim/config/cultureCatalog.js';
import {
  mergeSimulationConfig,
  projectAzgaarWorld,
  restoreWorldSnapshot,
  serializeWorldSnapshot,
} from '../../src/sim/index.js';
import { fingerprintWorldDefinition } from '../../src/sim/model/worldDefinition.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const catalogSource = yaml.load(readFileSync(path.join(root, 'config', 'cultures.yaml'), 'utf8'));
const catalog = resolveCultureCatalog(catalogSource);

function eldaraCampaign() {
  return {
    source: {
      type: 'azgaar-campaign-fixture',
      mapId: 'eldara-test',
      mapName: 'Eldara',
      seed: 'eldara-culture-test',
      sourceWidth: 1000,
      sourceHeight: 800,
    },
    states: [],
    provinces: [],
    burgs: [],
    religions: [],
    routes: [],
    rivers: [],
    cultures: [
      { i: 0, name: 'Wildlands' },
      { i: 1, name: 'Eldoria' },
      { i: 3, name: 'Kentland' },
      { i: 6, name: 'Valarans' },
      { i: 9, name: 'Uruk' },
      { i: 13, name: 'Darkspire' },
    ],
  };
}

test('Eldara culture catalog preserves the Azgaar source-ID compatibility layer', () => {
  assert.equal(catalog.catalogId, 'eldara-cultures-v1');
  assert.equal(Object.keys(catalog.cultures).length, 7);
  assert.equal(catalog.sourceMappings.length, 14);
  assert.equal(Object.keys(catalog.culturalSeeds).length, 6);

  assert.equal(resolveSourceCultureMapping(catalog, 3).targetKey, 'lumish');
  assert.equal(resolveSourceCultureMapping(catalog, 6).targetKey, 'zuraldarr');
  assert.equal(resolveSourceCultureMapping(catalog, 9).targetKey, 'orc-peoples');
  assert.equal(resolveSourceCultureMapping(catalog, 9).targetType, 'seed');
  assert.equal(resolveSourceCultureMapping(catalog, 0).targetType, 'none');
  assert.equal(catalog.cultures['orc-peoples'], undefined);
});

test('every core culture defines a relation to every other core culture', () => {
  const keys = Object.keys(catalog.cultures);
  for (const [key, culture] of Object.entries(catalog.cultures)) {
    assert.deepEqual(
      Object.keys(culture.relations).sort(),
      keys.filter((peer) => peer !== key).sort(),
    );
  }
});

test('catalog only applies to configured Eldara source maps', () => {
  assert.equal(catalogAppliesToCampaign(catalog, eldaraCampaign()), true);
  assert.equal(catalogAppliesToCampaign(catalog, { source: { mapName: 'Another World' } }), false);
});

test('Azgaar projection enriches source cultures without replacing source identity', () => {
  const config = { ...mergeSimulationConfig(), cultureCatalog: catalog };
  const { definition } = projectAzgaarWorld(eldaraCampaign(), { simulationConfig: config });

  assert.equal(definition.cultureCatalog.catalogId, catalog.catalogId);

  const lumishSource = definition.cultures.find((entry) => entry.sourceId === 3);
  const orcSource = definition.cultures.find((entry) => entry.sourceId === 9);
  const wildlands = definition.cultures.find((entry) => entry.sourceId === 0);

  assert.equal(lumishSource.name, 'Kentland');
  assert.equal(lumishSource.mappingType, 'culture');
  assert.equal(lumishSource.canonicalCultureKey, 'lumish');
  assert.equal(lumishSource.culturalSeedKey, null);

  assert.equal(orcSource.name, 'Uruk');
  assert.equal(orcSource.mappingType, 'seed');
  assert.equal(orcSource.canonicalCultureKey, null);
  assert.equal(orcSource.culturalSeedKey, 'orc-peoples');

  assert.equal(wildlands.mappingType, 'none');
  assert.equal(wildlands.canonicalCultureKey, null);
  assert.equal(wildlands.culturalSeedKey, null);
});

test('Eldara catalog does not leak into unrelated Azgaar worlds', () => {
  const campaign = eldaraCampaign();
  campaign.source.mapName = 'Unrelated World';
  const config = { ...mergeSimulationConfig(), cultureCatalog: catalog };
  const { definition } = projectAzgaarWorld(campaign, { simulationConfig: config });

  assert.equal(definition.cultureCatalog, null);
  assert.ok(definition.cultures.every((entry) => entry.mappingType === 'unmapped'));
});

test('culture catalog survives simulation snapshot round-trip', () => {
  const config = { ...mergeSimulationConfig(), cultureCatalog: catalog };
  const { definition, state } = projectAzgaarWorld(eldaraCampaign(), { simulationConfig: config });
  const beforeFingerprint = fingerprintWorldDefinition(definition);
  const snapshot = serializeWorldSnapshot({ definition, state });
  const restored = restoreWorldSnapshot(snapshot);

  assert.equal(restored.definition.cultureCatalog.catalogId, catalog.catalogId);
  assert.equal(fingerprintWorldDefinition(restored.definition), beforeFingerprint);
});
