import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTreeNormalPixels } from '../scripts/lib/tree-impostor-normal-validation.mjs';
test('normal validation rejects lost trunk RGB and classification despite valid dimensions',()=>{
 const albedo=Uint8Array.of(100,100,100,255,100,100,100,255,0,0,0,0);
 const normal=Uint8Array.of(128,128,255,128,128,255,128,255,0,0,0,0);
 assert.deepEqual(validateTreeNormalPixels(albedo,normal),{visible:2,foliage:1,trunk:1});
 normal[3]=0;assert.throws(()=>validateTreeNormalPixels(albedo,normal),/covered pixel/);
 normal.set([0,0,0,128]);assert.throws(()=>validateTreeNormalPixels(albedo,normal),/covered pixel/);
});
