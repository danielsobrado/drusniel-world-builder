import assert from 'node:assert/strict';
import test from 'node:test';
import { WaterTerrainModel } from '../src/editor/water/WaterTerrainModel.js';
import { resolveWaterDomainConfig } from '../src/editor/water/WaterConfig.js';
import { ProceduralWorldGenerator } from '../src/editor/world/ProceduralWorldGenerator.js';
import { InfiniteWorldStore } from '../src/editor/world/InfiniteWorldStore.js';
import { ensureWaterDomainGenerator } from '../src/editor/water/GeneratorWaterAdapter.js';
import { sampleWorldStoreWater, sampleWorldStoreWaterSurface } from '../src/editor/water/TerrainWaterQueries.js';
import { staticWaterAt, staticWaterContactAt } from '../src/editor/water/StaticWaterSample.js';
import { rockWaterContact } from '../src/editor/stylized/localRockWater.js';

const contact = value => !value?.kind ? null : {
  kind: value.kind, coverage: value.coverage, surfaceHeight: value.surfaceHeight, fall: value.fall ?? 0,
};
const makeModel = options => new WaterTerrainModel({ seed: 3, seaLevel: 0,
  config: resolveWaterDomainConfig(), sampleBaseHeight: () => 8, sampleBaseTile: () => 4, ...options });

test('dry static contact avoids all bed and shore-distance sampling', () => {
  let heights = 0;
  const model = makeModel({ sampleBaseHeight: () => { heights++; return 8; } });
  model.oceanDistance.sample = () => assert.fail('dry contact does not need shore distance');
  for (const [x, z] of [[0, 0], [-.3, .7], [-4226432.25, 278528.3]]) assert.equal(model.sampleWaterSurface(x, z), null);
  assert.equal(heights, 0);
  assert.equal(model.sampleWater(.2, .3).bedHeight, 8);
  assert.ok(heights > 0, 'complete water queries still supply their precise bed');
});

test('contact and complete queries agree across lake inflows, incomplete rivers and painted water', () => {
  for (const type of ['dry', 'ocean', 'lake', 'river', 'inflow', 'outflow', 'incomplete']) {
    const model = makeModel();
    model.interpolatedHeight = () => 8;
    model.isOceanCell = () => type === 'ocean';
    const lake = { bodyId: 11, surfaceHeight: 40, shoreDistance: 8 };
    const river = { bodyId: 12, coverage: .7, surfaceHeight: type === 'inflow' ? 45 : 39,
      shoreDistance: 2, flowX: 1, flowZ: 0, fall: .3, plunge: .1 };
    if (['lake', 'inflow', 'outflow'].includes(type)) model.lakes = { sample: () => lake };
    if (['river', 'inflow', 'outflow'].includes(type)) model.riverChannel = { sample: () => river };
    if (type === 'incomplete') model.isBaseRiverCell = () => true;
    model.oceanDistance.sample = () => 4;
    for (const tile of [0, 4]) for (const painted of [false, true]) for (const editedHeight of [-20, 3, 90]) {
      const world = { generator: { seaLevel: 0, sampleWater: (x,z) => model.sampleWater(x,z),
        sampleWaterSurface: (x,z) => model.sampleWaterSurface(x,z) }, tileSize: 2,
        getTile: () => tile, sampleHeight: () => editedHeight,
        tileOverrides: new Map(painted ? [['-1:0', tile]] : []), heightOverrides: new Map([['-1:0', editedHeight]]) };
      assert.deepEqual(contact(sampleWorldStoreWaterSurface(world,-.2,.3)),
        contact(sampleWorldStoreWater(world,-.2,.3)), `${type}/${tile}/${painted}/${editedHeight}`);
    }
  }
});

test('procedural rock contacts remain identical at local and planet coordinates with edits', () => {
  const world = new InfiniteWorldStore({ chunkSize: 32, tileSize: 2,
    generator: new ProceduralWorldGenerator({ seed: 918273 }) });
  const view = { worldStore: world };
  let seed = 20261017;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2**32; };
  for (const [cx,cz] of [[0,0],[-4226432,278528]]) for (let i=0;i<60;i++) {
    const rock = { x: cx + (random()-.5)*256, z: cz + (random()-.5)*256, scale: .5+random()*2 };
    const x=Math.floor(rock.x/2),z=Math.floor(-rock.z/2);
    if(i%3===0) world.setTile(x,z,i%2 ? 0 : 4);
    if(i%4===0) world.setHeight(x,z,-5+i*.2);
    assert.deepEqual(rockWaterContact(rock,3,(x,z)=>staticWaterContactAt(view,x,z)),
      rockWaterContact(rock,3,(x,z)=>staticWaterAt(view,x,z)));
  }
});

test('imported adapters expose the contact query and other generators retain their complete query', () => {
  const generator=ensureWaterDomainGenerator({ seed: 1, seaLevel: 0,
    sampleHeight:()=>8, sampleTile:()=>4, toMetadata:()=>({}) });
  assert.equal(generator.sampleWaterSurface(.3,.2),null);
  const world={ generator:{sampleWater:()=>({kind:0,bedHeight:8}),seaLevel:0},
    getTile:()=>4,sampleHeight:()=>8,tileSize:2 };
  assert.equal(sampleWorldStoreWaterSurface(world,0,0).kind,0);
});
