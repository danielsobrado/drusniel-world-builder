import assert from 'node:assert/strict';
import test from 'node:test';
import { meadowInteractionArc, meadowPressRecoveryFactor } from '../src/editor/stylized/meadow/meadowInteractionBend.js';
import { MEADOW_GROWTH_DEFAULTS } from '../src/editor/stylized/meadow/meadowGrowthProfiles.js';
import { createMeadowWindVariationWriter } from '../src/editor/stylized/meadow/meadowWindVariation.js';

test('all growth profiles and 101 by 101 press/height values remain finite above the root',()=>{
 for(const p of Object.values(MEADOW_GROWTH_DEFAULTS))for(const h of [p.shortHeight,p.tallHeight])for(let press=0;press<=100;press++)for(let r=0;r<=100;r++) {
  const v=meadowInteractionArc({press:press/100,vertexHeight:h*r/100,bladeHeight:h});
  assert.ok(Number.isFinite(v.horizontal+v.vertical));assert.ok(v.vertical>=0&&v.vertical<=h);
  if(r===0)assert.deepEqual(v,{horizontal:0,vertical:0});
  if(press===0)assert.ok(Math.abs(v.vertical-h*r/100)<1e-12);
 }
});
test('the upright limit is continuous and the canonical fold direction survives rebasing',()=>{
 for(const h of [.06,.16,.55,.95])for(let r=0;r<=100;r++) {
  const v=meadowInteractionArc({press:.0001,vertexHeight:h*r/100,bladeHeight:h});
  assert.ok(Math.abs(v.horizontal)<1e-4);assert.ok(Math.abs(v.vertical-h*r/100)<1e-4);
 }
 const write=createMeadowWindVariationWriter(8000004,-7999996,8),before=new Float32Array(2),after=new Float32Array(2);
 write(before,0,8000004.125,-7999996.875);
 // Canonical compaction does not change its input when render origin shifts.
 const origin={x:8000000,z:-8000000},render={x:4.125,z:3.125};
 write(after,0,render.x+origin.x,render.z+origin.z);assert.deepEqual(before,after);
});
test('recovery uses elapsed seconds and safely clamps irregular deltas',()=>{
 assert.equal(meadowPressRecoveryFactor(0),1);assert.equal(meadowPressRecoveryFactor(-1),1);
 assert.equal(meadowPressRecoveryFactor(Infinity),1);
 assert.equal(meadowPressRecoveryFactor(1),meadowPressRecoveryFactor(.1));
 assert.ok(meadowPressRecoveryFactor(1/60)**60<.03);
});
