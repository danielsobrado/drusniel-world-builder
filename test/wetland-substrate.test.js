import assert from 'node:assert/strict';
import test from 'node:test';
import { terrainWetlandWetness } from '../src/editor/materials/TerrainWetlandWetness.js';
import { bakeTerrainMaterialPage } from '../src/editor/materials/TerrainMaterialBakeCpu.js';
import { createTerrainMaterialBakeDescriptor } from '../src/editor/materials/TerrainMaterialBakeDescriptor.js';

test('wetland visual saturation has exact slope endpoints and never reduces existing wetness',()=>{
 assert.equal(terrainWetlandWetness(0,12,0),.7);assert.equal(terrainWetlandWetness(0,12,.05),.7);
 assert.equal(terrainWetlandWetness(0,12,.25),.35);assert.equal(terrainWetlandWetness(.8,12,.15),.8);
 assert.ok(Math.abs(terrainWetlandWetness(0,12,.15)-.525)<1e-12);
 for(let id=0;id<256;id++)if(id!==12)assert.equal(terrainWetlandWetness(.1,id,.1),.1);
});
test('production bake writes wetland W without adding water, changing source or changing other biome wetness',async()=>{
 const config={qualityTiers:{balanced:{resolution:2}},build:{rowsPerYield:2},
  classification:{rockSlopeStart:.18,rockSlopeFull:.62,snowLine:700,snowFade:250,snowSlopeMax:.55,shorelineRadiusCells:4,wetnessRadiusCells:2},
  macro:{scaleMeters:120,strength:.14,seedOffset:2401,heightShadeScale:.018,minHeightShade:.72,maxHeightShade:1.22,wetDarkening:.18}};
 for(const id of [4,12]) {
  const source={originX:0,originZ:0,tilePixels:new Uint8Array([90,140,70,id]),surfaceMaskPixels:new Uint8Array([0,255,0,255]),heights:new Float32Array(4)};
  const before=structuredClone(source);
  const result=await bakeTerrainMaterialPage({source,descriptor:createTerrainMaterialBakeDescriptor({chunkX:0,chunkZ:0,quality:'balanced',revisions:{world:0,tile:0,height:0,water:0,canopy:0}}),
   config,chunkSize:1,tileSize:2,worldSeed:918273,yieldControl:async()=>{}});
  const channels=result.value.channels;
  for(let i=0;i<4;i++) {
   assert.equal(channels.wetnessShoreline[i*2],id===12?179:0);
   assert.equal(channels.canopyWater[i*2+1],0,'visual wetness does not create water');
  }
  assert.deepEqual(source,before);
 }
});
