import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import yaml from 'js-yaml';
import {resolveAmbientEffectsConfig} from '../src/editor/stylized/ambient/ambientEffectsConfig.js';
import {particleWaterDepthWeight,resolveParticleWaterDepth} from '../src/editor/stylized/ambient/ParticleWaterDepth.js';

test('authored surf spray is confined to the same shallow breaking band as sea surf',()=>{
  const raw=yaml.load(readFileSync(new URL('../config/ambient-effects.yaml',import.meta.url),'utf8')).ambientEffects;
  const sea=yaml.load(readFileSync(new URL('../config/water-visual.yaml',import.meta.url),'utf8')).water.sea.surf;
  const settings=resolveAmbientEffectsConfig(raw),spray=settings.fields.find(f=>f.name==='surfSpray');
  assert.deepEqual(spray.size,[.24,.72]);assert.deepEqual(spray.height,[.02,.72]);assert.equal(spray.rise,.55);
  assert.equal(spray.count,420,'silhouette correction preserves the instance budget');
  assert.deepEqual(spray.waterDepth,[sea.breakDepthStart,sea.breakDepthFull,sea.breakDepthFade,sea.breakDepthEnd]);
  for(const depth of [-100,-1,0,.25,4.5,5,50])assert.equal(particleWaterDepthWeight(depth,spray.waterDepth),0,`depth ${depth}`);
  for(const depth of [.7,1,2,2.4])assert.equal(particleWaterDepthWeight(depth,spray.waterDepth),1,`depth ${depth}`);
  const a=particleWaterDepthWeight(.475,spray.waterDepth),b=particleWaterDepthWeight(3.45,spray.waterDepth);
  assert.ok(Math.abs(a-.5)<1e-12&&Math.abs(b-.5)<1e-12,'both shoulders fade smoothly');
  assert.equal(settings.fields.find(f=>f.name==='pollen').waterDepth,null,'land fields retain their existing habitat');
});

test('water-depth envelopes reject malformed ranges and non-water anchors',()=>{
  for(const value of [null,[],[0,1,2],[0,1,1,4],[-1,0,1,2],[0,1,2,Infinity],[0,1,2,101],['0',1,2,3]]) {
    assert.throws(()=>resolveParticleWaterDepth(value,'sea','test.waterDepth'),/four increasing/);
  }
  assert.throws(()=>resolveParticleWaterDepth([0,1,2,3],'ground','test.waterDepth'),/sea or lake/);
  assert.deepEqual(resolveParticleWaterDepth([0,1,2,3],'lake','test.waterDepth'),[0,1,2,3]);
  assert.equal(resolveParticleWaterDepth(undefined,'ground','test.waterDepth'),null);
  assert.equal(particleWaterDepthWeight(100,null),1);
});
