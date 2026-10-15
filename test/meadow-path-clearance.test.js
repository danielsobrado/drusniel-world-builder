import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { naturalTrailMaskAt, createNaturalTrailSampler } from '../src/editor/stylized/naturalTrailMath.js';
import { createMeadowPathSampler } from '../src/editor/stylized/meadow/MeadowPathSampler.js';
import { MeadowGroundSampler } from '../src/editor/stylized/meadow/MeadowGroundSampler.js';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';
import { createCompaction } from '../src/editor/stylized/meadow/meadowGrassCompaction.js';
const path=load(readFileSync(new URL('../editor.config.yaml',import.meta.url),'utf8')).stylizedSurface.path;

test('prepared trail sampling matches the canonical terrain contour at ordinary and large coordinates',()=>{
 const sampler=createNaturalTrailSampler(path.naturalTrail);
 for(let i=0;i<10000;i++)for(const origin of [0,-8000000]) {
  const x=origin+(i*17.21)%512,z=-origin+(i*7.49)%512;
  assert.equal(sampler.maskAt(x,z),naturalTrailMaskAt(x,z,path.naturalTrail));
 }
});
test('painted tread and natural trail cores are excluded; soft verges and disabled trails remain available',()=>{
 const sampler=createMeadowPathSampler(path);let cores=0,verges=0;
 for(let z=-64;z<64;z+=.5)for(let x=-64;x<64;x+=.5) {
  const mask=naturalTrailMaskAt(x,z,path.naturalTrail),sample=sampler.sample(x,z,1);
  if(mask>=path.naturalTrail.clearThreshold){assert.equal(sample.blocked,true);cores++;}
  if(mask>0&&mask<.15&&!sample.blocked){assert.equal(sample.path,mask);verges++;}
 }
 assert.ok(cores>100);assert.ok(verges>10);
 assert.equal(sampler.sample(0,0,1,1).blocked,true);
 assert.equal(createMeadowPathSampler({naturalTrail:{enabled:false}}).sample(0,0,1).blocked,false);
});
test('near and card compaction publish zero natural-trail stems and preserve identities across rebasing',()=>{
 const size=32,slots=[];
 for(let cz=-2;cz<2;cz++)for(let cx=-2;cx<2;cx++)slots.push({descriptor:{key:`${cx}:${cz}`,chunkX:cx,chunkZ:cz,originCellX:cx*size,originCellZ:cz*size,centerWorldX:(cx+.5)*64,centerWorldZ:-(cz+.5)*64},
  pageRevision:1,page:{tiles:new Uint8Array(size**2).fill(4),heights:new Float32Array((size+1)**2),surfaceMaskPixels:Uint8Array.from({length:size**2*4},(_,i)=>i%4===1?255:0)}});
 const terrainView={slots,worldStore:{chunkSize:size,tileSize:2},floatingOrigin:{x:0,z:0}},sampler=new MeadowGroundSampler({terrainView,tileIds:[4],shapeTable:new Uint16Array(256),pathConfig:path});
 sampler.beginFrame();const sample=sampler.forTile(32,-32,32).sample;
 const outputs=[];
 for(const cards of [false,true]) {
  const template=createMeadowTemplate({detail:2,count:100000,tileSize:64,cards});
  try {
   const job=createCompaction({template,centerX:32,centerZ:-32,sample});job.advance();assert.ok(job.output.count>50000&&job.output.count<100000);
   for(let i=0;i<job.output.count;i++) {
    const x=32+job.output.position[i*4],z=-32+job.output.position[i*4+2];
    assert.ok(naturalTrailMaskAt(x,z,path.naturalTrail)<path.naturalTrail.clearThreshold);
    assert.ok(job.output.position[i*4+3]>0,'no zero-height triangle substitutes');
   }
   terrainView.floatingOrigin={x:8000000,z:-8000000};sampler.beginFrame();
   const again=createCompaction({template,centerX:32,centerZ:-32,sample:sampler.forTile(32,-32,32).sample});again.advance();
   assert.deepEqual(job.output.data,again.output.data);assert.deepEqual(job.output.position,again.output.position);
   outputs.push(job.output.count);
  }finally{template.dispose();}
 }
 assert.equal(outputs[0],outputs[1],'identical canonical near/card candidates follow one exclusion');
});
