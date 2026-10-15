import assert from 'node:assert/strict';
import test from 'node:test';
import { MeadowGroundSampler } from '../src/editor/stylized/meadow/MeadowGroundSampler.js';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';
import { createCompaction } from '../src/editor/stylized/meadow/meadowGrassCompaction.js';

function fixture(coverage,density=1,forest=false) {
  const size=32,mask=new Uint8Array(size*size*4);
  for(let i=0;i<size*size;i++)mask[i*4+1]=Math.round(coverage*255);
  const terrainView={slots:[{descriptor:{key:'-1:-1',chunkX:-1,chunkZ:-1,originCellX:-32,originCellZ:-32,centerWorldX:-32,centerWorldZ:32},
    pageRevision:1,page:{tiles:new Uint8Array(size*size).fill(4),heights:new Float32Array((size+1)**2),surfaceMaskPixels:mask}}],
    worldStore:{chunkSize:size,tileSize:2,generator:{toMetadata:()=>({seed:918273})}},floatingOrigin:{x:0,z:0}};
  const sampler=new MeadowGroundSampler({terrainView,tileIds:[4],shapeTable:new Uint16Array(256),
    growth:{table:new Uint8Array(256),profiles:[{density}]},
    forestFieldProvider:()=>forest?{sample:()=>({patchId:'fixed',patchCoverage:1,patchEdge:0})}:null,
    forestFloorConfig:{grassCoreDensity:.5,grassEdgeDensity:.5}});
  sampler.beginFrame();return {sampler,terrainView};
}
function accepted(sampler,source,reverse=false) {
  const sample=sampler.forTile(-32,32,32).sample,ids=[],out={};
  for(let j=0;j<source.instanceCount;j++) {
    const i=reverse?source.instanceCount-1-j:j,p=source.getAttribute('instancePosition').array;
    if(sample(-32+p[i*4],32+p[i*4+2],i,out))ids.push(i);
  }
  return ids.sort((a,b)=>a-b);
}

test('100000 real compaction candidates follow coverage times density with no rejected output entries', () => {
  const template=createMeadowTemplate({detail:2,count:100000,tileSize:64});
  try {
    for(const E of [0,.25,.5,1]) {
      const {sampler}=fixture(E,.65),sample=sampler.forTile(-32,32,32).sample;
      const job=createCompaction({template,centerX:-32,centerZ:32,sample});job.advance();
      const ids=accepted(sampler,template),expected=Math.round(E*255)/255*.65;
      assert.ok(Math.abs(job.output.count/100000-expected)<.01);
      assert.equal(job.output.count,ids.length);
      for(let i=0;i<ids.length;i++) {
        assert.equal(job.output.data[i*4+1],ids[i]);
        assert.ok(Math.abs(job.output.position[i*4+3]-(.3+.7*Math.round(E*255)/255))<1e-6);
      }
    }
  }finally{template.dispose();}
});

test('reverse order, origin rebasing, and near/card queries preserve accepted canonical identities', () => {
  const template=createMeadowTemplate({detail:2,count:100000,tileSize:64});
  try {
    const {sampler,terrainView}=fixture(.5,.65),ids=accepted(sampler,template);
    assert.deepEqual(accepted(sampler,template,true),ids);
    terrainView.floatingOrigin={x:8000000,z:-8000000};sampler.beginFrame();
    assert.deepEqual(accepted(sampler,template),ids);
    const near=sampler.forTile(-32,32,4),card=sampler.forTile(-32,32,32),a={},b={};
    for(let i=0;i<1000;i++) {
      const x=-63+(i*13.713)%62,z=1+(i*17.233)%62;
      assert.equal(near.sample(x,z,i,a),card.sample(x,z,i,b));assert.deepEqual(a,b);
    }
  }finally{template.dispose();}
});

test('forest and edge probabilities use independent channels: half of each retains one quarter', () => {
  const template=createMeadowTemplate({detail:2,count:100000,tileSize:64});
  try {
    const {sampler}=fixture(.5,1,true),count=accepted(sampler,template).length;
    assert.ok(Math.abs(count/100000-.25)<.01,`${count} survivors`);
  }finally{template.dispose();}
});
