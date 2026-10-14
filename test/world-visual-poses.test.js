import test from 'node:test';import assert from 'node:assert/strict';
import { originalVisualPoses,selectAdditionalPoses,parseVisualArguments } from '../scripts/lib/world-visual-poses.mjs';
test('original camera input is preserved exactly',async()=>{
 const poses=await originalVisualPoses(new URL('../',import.meta.url));assert.equal(poses.length,12);
 assert.deepEqual([poses[0].x,poses[0].z,poses[0].pitch],[-5667,93,-.08]);assert.equal(poses[10].historicalBiomeId,11);
});
test('seeded coverage selection is stable and failure is explicit',()=>{
 const input={sampleTile:(x,z)=>1+Math.abs(x+z)%12};
 assert.deepEqual(selectAdditionalPoses(input),selectAdditionalPoses(input));
 assert.equal(selectAdditionalPoses(input).poses.length,36);
 assert.throws(()=>selectAdditionalPoses({sampleTile:()=>1,maxCandidates:20}),/Insufficient/);
});
test('CLI rejects unknown and missing values',()=>{
 assert.throws(()=>parseVisualArguments(['--headless']),/Invalid/);
 assert.throws(()=>parseVisualArguments([]),/requires/);
 assert.equal(parseVisualArguments(['--out','tmp/qa','--suite','original']).suite,'original');
});
