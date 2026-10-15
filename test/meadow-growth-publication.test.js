import assert from 'node:assert/strict';
import test from 'node:test';
import { Scene,Texture,TextureLoader } from 'three/webgpu';
import { vec3 } from 'three/tsl';
import { load } from 'js-yaml';
import { readFileSync } from 'node:fs';
import { MeadowGrassField } from '../src/editor/stylized/meadow/MeadowGrassField.js';
import { GrassTuning } from '../src/editor/stylized/GrassTuning.js';
import { resolveMeadowGrassConfig } from '../src/editor/stylized/meadow/meadowGrassConfig.js';

const config=load(readFileSync(new URL('../editor.config.yaml',import.meta.url),'utf8')).stylizedSurface;
test('a live density change rebuilds only pages containing the affected biome and retains complete output',t=>{
 t.mock.method(TextureLoader.prototype,'load',()=>new Texture());
 const makeSlot=(cx,id)=>({descriptor:{key:`${cx}:0`,chunkX:cx,chunkZ:0,originCellX:cx*8,originCellZ:0,centerWorldX:cx*16+8,centerWorldZ:-8},
  pageRevision:1,page:{tiles:new Uint8Array(64).fill(id),heights:new Float32Array(81),surfaceMaskPixels:Uint8Array.from({length:256},(_,i)=>i%4===1?255:0)}});
 const terrainView={slots:[makeSlot(0,9),makeSlot(1,4)],contentRevision:0,worldStore:{chunkSize:8,tileSize:2,generator:{toMetadata:()=>({seed:918273})}}};
 const settings=resolveMeadowGrassConfig({...config.grass.meadow,far:{enabled:false},interaction:{enabled:false}});
 const field=new MeadowGrassField({scene:new Scene(),terrainView,config,settings,tuning:new GrassTuning(config),sunDirection:vec3(0,1,0)});
 const layer=field.blades,origin={x:0,z:0};
 try {
  field.ground.beginFrame();layer.update({x:12,z:-8},origin,Infinity,1);
  const changed=[...layer.tiles.values()].filter(t=>t.output?.count&&t.centerX<16),unchanged=[...layer.tiles.values()].filter(t=>t.output?.count&&t.centerX>=16&&t.centerX<32);
  assert.ok(changed.length&&unchanged.length);
  const retained=new Map([...changed,...unchanged].map(t=>[t.key,{output:t.output,buildId:t.buildId}]));
  field.setGrowth({byTileId:{9:{density:.2}}});
  layer.update({x:12,z:-8},origin,performance.now()-1,2);
  for(const tile of [...changed,...unchanged])assert.equal(tile.output,retained.get(tile.key).output,'old publication survives pending work');
  layer.update({x:12,z:-8},origin,Infinity,3);
  for(const tile of changed) {assert.ok(tile.buildId>retained.get(tile.key).buildId);assert.ok(tile.output.count<retained.get(tile.key).output.count);}
  for(const tile of unchanged)assert.equal(tile.buildId,retained.get(tile.key).buildId);
  assert.equal(field.uniforms.growth.density.array[field.settings.growth.table[9]].x,.2);
 }finally{field.dispose();}
});
