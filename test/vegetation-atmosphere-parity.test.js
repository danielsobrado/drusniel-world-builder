import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { float,vec4 } from 'three/tsl';
import { applyJungleMist } from '../src/editor/stylized/ambient/jungleMistOutput.js';
import { createCpuTreeImpostorMaterial,createGpuTreeImpostorMaterial } from '../src/editor/stylized/impostor/TreeImpostorMaterial.js';
import { jungleMistOpticalDepth,jungleMistFactor,resolveJungleMistConfig } from '../src/editor/stylized/ambient/JungleMist.js';
import { cloneBushMaterial,createBushProxyMaterial } from '../src/editor/stylized/BushRenderAssets.js';
const ambient={enabled:true,jungleMist:{}},settings=resolveJungleMistConfig(ambient);
const atlas={width:3,height:5,columns:1,rows:1,tileSize:16,lowElevationDegrees:12,highElevationDegrees:58,
 albedo:new THREE.DataTexture(new Uint8Array(4),1,1),normal:new THREE.DataTexture(new Uint8Array(4),1,1)};
test('existing output is composed once and every CPU/GPU factory receives atmosphere',()=>{
 for(const material of [new THREE.MeshLambertNodeMaterial(),new THREE.MeshStandardNodeMaterial(),new THREE.MeshBasicNodeMaterial()]) {
  material.outputNode=vec4(.2,.3,.4,.37);const before=material.outputNode;
  assert.equal(applyJungleMist(material,ambient,{time:float(10)}),true);assert.notEqual(material.outputNode,before);
  const composed=material.outputNode;assert.equal(applyJungleMist(material,ambient),false);assert.equal(material.outputNode,composed);
  assert.equal(material.userData.jungleMistApplied,true);material.dispose();
 }
 const cpu=createCpuTreeImpostorMaterial(atlas,ambient);
 const read={element:()=>vec4(1)};
 const gpu=createGpuTreeImpostorMaterial({atlas,ambientEffects:ambient,transformRead:read,parameterRead:read,appearanceRead:read,
  visibleRead:{element:()=>float(0)},instanceIndex:float(0),originUniform:vec4(0).xyz});
 for(const {material} of [cpu,gpu]){assert.equal(material.userData.jungleMistApplied,true);assert.equal(material.alphaTest,.5);material.dispose();}
 const lit=createCpuTreeImpostorMaterial({...atlas,foliageLighting:true},ambient);
 assert.ok(lit.material.emissiveNode,'textured crown retains the near material fill and transmission');lit.material.dispose();
});
test('authored and proxy bushes use the shared composer without changing source alpha',()=>{
 const source=new THREE.MeshStandardMaterial({alphaTest:.47});
 const config={ambientEffects:ambient};
 const near=cloneBushMaterial(source,{config}),proxy=createBushProxyMaterial(source,{config});
 assert.equal(near.alphaTest,.47);
 for(const material of [near,proxy]){assert.equal(material.userData.jungleMistApplied,true);material.dispose();}
 assert.equal(source.userData.jungleMistApplied,undefined);source.dispose();
});
test('density is linear in region weight before exponentiation and bounded after it',()=>{
 for(const reach of [10,40,100,240])for(const start of [0,1.7,12])for(const end of [0,1.7,20]) {
  const depth=weight=>jungleMistOpticalDepth({start,end,reach,weight,settings});
  assert.equal(depth(0),0);if(reach===10)assert.equal(depth(1),0);
  assert.ok(Math.abs(depth(.5)-depth(1)*.5)<1e-12);assert.ok(Math.abs(depth(.25)-depth(1)*.25)<1e-12);
  assert.equal(depth(5),depth(4));let previous=0;
  for(const weight of [0,.25,.5,1,4]){const amount=jungleMistFactor({opticalDepth:depth(weight)});assert.ok(amount>=previous&&amount<=.5);previous=amount;}
 }
 for(const key of ['density','weight','quality','reach'])for(const value of [NaN,Infinity,-1])
  assert.throws(()=>jungleMistOpticalDepth({start:1,end:1,reach:100,weight:1,[key]:value}));
});
