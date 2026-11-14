import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';

// The checklist of docs/adding-a-biome.md, enforced: a biome row that lacks a
// piece fails here with the name of the piece, instead of shipping half dressed.
const read = (path) => load(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const surface = read('editor.config.yaml').stylizedSurface;
const looks = read('config/biome-looks.yaml').biomeLooks.byTileId;
const meadow = surface.grass.meadow;

/**
 * Pieces a biome goes without on purpose. Adding a biome should not add a line
 * here; a line needs the reason the piece does not apply.
 */
const WAIVED = {
  4: { palette: 'grassland is the base meadow palette', groundDetail: 'grassland is the default floor' },
  10: { soil: 'tundra ground is the snow carpet and the thaw substrate' },
  11: { bushes: 'nothing grows on the ice' },
};

const variantsOn = (list, id) => (list ?? []).filter((variant) => variant.tileIds?.includes(id)).length;
const edgeBushes = surface.assets.bushVariants.filter((variant) => variant.canopy === 'edge');
const grows = (id) => (meadow.growth.byTileId?.[id]?.density ?? 0) > 0;

for (const [key, look] of Object.entries(looks)) {
  const id = Number(key);
  const waived = WAIVED[id] ?? {};
  const need = (piece, ok, where) => {
    if (piece in waived) return;
    assert.ok(ok, `Biome ${id} (${look.name ?? 'unnamed'}) lacks ${piece}: ${where}`);
  };

  test(`biome ${id} is fully dressed`, () => {
    need('name', typeof look.name === 'string', 'config/biome-looks.yaml `name`');
    need('rock', !!look.rock, 'config/biome-looks.yaml `rock` (tint, tone, moss)');
    need('floor', surface.groundDetails.tileIds.includes(id) && variantsOn(surface.assets.groundDetailVariants, id) > 0,
      'groundDetails.tileIds and at least one assets.groundDetailVariants entry');
    need('bushes', surface.bushes.tileIds.includes(id) && variantsOn(surface.assets.bushVariants, id) > 0,
      'bushes.tileIds and at least one assets.bushVariants entry');
    need('groundDetail', !!meadow.groundDetail.byTileId?.[id], 'grass.meadow.groundDetail.byTileId (litter, moss, soil, floor scans)');
    if (grows(id)) {
      need('soil', !!look.soil, 'config/biome-looks.yaml `soil`; without it bare ground shows the map colour');
      need('canopy', !!look.canopy, 'config/biome-looks.yaml `canopy`');
      need('palette', !!meadow.palette.byTileId?.[id], 'grass.meadow.palette.byTileId (base, tip)');
      need('grass', surface.grass.tileIds.includes(id), 'grass.tileIds');
    }
    if (surface.trees.tileIds.includes(id)) {
      need('trees', variantsOn(surface.assets.treeVariants, id) >= 2, 'two or more assets.treeVariants entries, so a wood is not one tree repeated');
      need('shrubBelt', variantsOn(surface.assets.bushVariants, id) >= 2 && variantsOn(edgeBushes, id) >= 1,
        'two or more assets.bushVariants entries, one with `canopy: edge`, so the meadow steps up to the crowns');
    }
  });
}

test('every streamed variant names its biomes, its place on the wood gradient and a key of its own', () => {
  for (const list of ['bushVariants', 'groundDetailVariants', 'tropicalKitVariants']) {
    const keys = new Set();
    surface.assets[list].forEach((variant, index) => {
      const name = `assets.${list}[${index}] (${variant.id ?? variant.scene})`;
      assert.ok(variant.tileIds?.length > 0, `${name} has no tileIds, so it loads in every world`);
      assert.ok(variant.canopy, `${name} has no canopy (core, edge, open or any)`);
      // Residency and the asset palette key a variant by `id ?? scene`: a second
      // entry for one GLB without an id of its own never installs.
      const key = variant.id ?? variant.scene;
      assert.ok(!keys.has(key), `${name} repeats the key ${key}; give it an id`);
      keys.add(key);
    });
  }
});

test('a waiver names a biome that exists', () => {
  for (const id of Object.keys(WAIVED)) assert.ok(looks[id], `WAIVED lists biome ${id}, which has no look row`);
});
