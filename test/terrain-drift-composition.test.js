import test from 'node:test';import assert from 'node:assert/strict';
import {terrainDriftAlphas,createTerrainDriftNodes} from '../src/editor/materials/TerrainDriftNodes.js';
import {resolveBlownStreaks,streakMaskReference} from '../src/editor/stylized/ambient/BlownStreaks.js';
import {float,vec2} from 'three/tsl';
test('drift opacity is finite, bounded and excludes wet/snowy sand',()=>{
 for(const mask of [0,.5,1,4])for(const wetness of [0,.5,1])for(const snow of [0,.5,1]){
  const a=terrainDriftAlphas({sandMask:mask,snowMask:mask,wetness,snow});
  assert.ok(a.sand>=0&&a.sand<=.16);assert.ok(a.snow>=0&&a.snow<=.22);
  if(wetness===1||snow===1)assert.equal(a.sand,0);
 }
 assert.equal(terrainDriftAlphas({snow:1,snowMask:1,packing:1}).snow,0);
});
test('the production drift graph returns albedo only and validates new settings',()=>{
 const graph=createTerrainDriftNodes({worldXZ:vec2(0),grassCoverage:float(0),settings:resolveBlownStreaks({})});
 assert.ok(graph.apply(float(.2)));assert.equal(graph.emissive,undefined);
 assert.equal(createTerrainDriftNodes({settings:{enabled:false}}),null);
 assert.throws(()=>resolveBlownStreaks({sandStreaks:{maxOpacity:2}}),/maxOpacity/);
 assert.throws(()=>resolveBlownStreaks({sandStreaks:{color:'white'}}),/color/);
});
test('shader reference clamps gusts and envelope after every mask contribution',()=>{
 for(const envelope of [0,.15,.7,1,4])for(const gust of [0,1])for(const weight of [0,1])for(const packing of [0,1]) {
  const mask=streakMaskReference({fine:1.5,patch:1,distance:0,envelope,gust,region:1,weight,hardness:.25,packing,reach:75});
  assert.ok(Number.isFinite(mask)&&mask>=0&&mask<=1);
  if(envelope===0||weight===0||packing===1)assert.equal(mask,0);
 }
 assert.equal(streakMaskReference({fine:2,patch:1,distance:75,envelope:4,gust:1,region:1,weight:1,hardness:0,reach:75}),0);
});
