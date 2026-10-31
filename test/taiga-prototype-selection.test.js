import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { ForestSpeciesRegistry } from '../src/editor/stylized/forest/ForestSpeciesRegistry.js';
import { createSpeciesPrototypeIndex } from '../src/editor/stylized/forest/ForestSpeciesGeometry.js';
const surface=load(readFileSync(new URL('../editor.config.yaml',import.meta.url),'utf8')).stylizedSurface;
test('10000 stable candidates per cold biome choose spruce-shaped taiga and alpine tundra',()=>{
 const variants=surface.assets.treeVariants.filter(v=>v.scene.includes('/forest-pack/')||v.scene.includes('/alpine/'));
 const additional=new Map(),allowed=new Map(),preferred=new Map();
 variants.forEach((v,i)=>{for(const species of [].concat(v.species))additional.set(species,[...(additional.get(species)??[]),i+2]);
  if(v.tileIds)allowed.set(i+2,new Set(v.tileIds));if(v.preferredTileIds)preferred.set(i+2,new Set(v.preferredTileIds));});
 const registry=new ForestSpeciesRegistry({prototypeCount:variants.length+2,
  prototypeIndexBySpecies:createSpeciesPrototypeIndex({glbPrototypeCount:2,generatedSpeciesIds:[],additionalPrototypeIndicesBySpecies:additional}),
  prototypeTileIds:allowed,prototypePreferredTileIds:preferred});
 const taigaPicks=new Set();
 for(const [tileId,profileKey,folder] of [[9,'taiga',null],[10,'tundra','/alpine/']])for(let i=0;i<10000;i++) {
  const candidate={stableId:`cold:${i}`,scale:1},habitat={tileId,profileKey,patchCoverage:.8,patchEdge:.2,slope:.1,waterWeight:1};
  const a=registry.select(candidate,habitat),b=registry.select({...candidate},habitat);
  assert.deepEqual(a,b);
  if(folder)assert.ok(variants[a.prototypeIndex-2]?.scene.includes(folder));else taigaPicks.add(a.prototypeIndex);
  assert.ok(!allowed.has(a.prototypeIndex)||allowed.get(a.prototypeIndex).has(tileId));
 }
 assert.ok([...taigaPicks].some(index=>index<2),'taiga must reach the primary spruces');
 assert.ok(![...taigaPicks].some(index=>/tree-wide-0[23]/.test(variants[index-2]?.scene??'')),'no broadleaf-shaped crowns in taiga');
});

test('excluded primary tree prototypes never enter a species pool', () => {
  const { map, fallback } = createSpeciesPrototypeIndex({ glbPrototypeCount: 5, generatedSpeciesIds: [],
    excludedPrimaryIndices: [3, 4] });
  for (const indices of [...map.values(), fallback]) assert.ok(!indices.includes(3) && !indices.includes(4));
  assert.throws(() => createSpeciesPrototypeIndex({ glbPrototypeCount: 2, generatedSpeciesIds: [],
    excludedPrimaryIndices: [5] }));
});
