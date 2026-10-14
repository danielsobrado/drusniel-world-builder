import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraCutCoordinator } from '../src/editor/world/CameraCutCoordinator.js';
import { FloatingOrigin } from '../src/editor/world/FloatingOrigin.js';
import { InfiniteTerrainView } from '../src/editor/InfiniteTerrainView.js';
test('cuts replace residency before origin/pose, and superseded cuts cannot release input', async () => {
  const events=[],frames=[]; let ready=false;
  const origin=new FloatingOrigin({threshold:100,snapSize:64});
  const player={resetInput(){},setPose(p){events.push(['pose',p.x]);},getStatus:()=>({collision:{ready}})};
  const terrain={floatingOrigin:origin,cutToCanonical:p=>events.push(['resident',p.x]),updateFloatingOrigin:p=>origin.update(p)};
  const coordinator=new CameraCutCoordinator({terrainView:terrain,playerController:player,
    viewModeController:{setMode(){}},shiftWorld:()=>events.push(['shift']),nextFrame:()=>new Promise(r=>frames.push(r))});
  const a=coordinator.cut({x:100000,z:0}),b=coordinator.cut({x:-100000,z:0}),c=coordinator.cut({x:8000000,z:-3000000});
  assert.equal(player.cutBlocked,true); ready=true;
  frames[0](); assert.deepEqual(await a,{cancelled:true}); assert.equal(player.cutBlocked,true);
  frames[2](); assert.equal((await c).cancelled,false); assert.equal(player.cutBlocked,false);
  frames[1](); assert.deepEqual(await b,{cancelled:true});
  assert.deepEqual(events.map(e=>e[0]),['resident','shift','pose','resident','shift','pose','resident','shift','pose']);
});
test('invalid cut has no mutation and disposed cuts fail', async () => {
  const player={};const c=new CameraCutCoordinator({playerController:player});
  await assert.rejects(c.cut({x:NaN,z:0}),/Invalid/); assert.equal(player.cutBlocked,undefined);
  c.dispose();await assert.rejects(c.cut({x:0,z:0}),/disposed/);
});
test('ordinary movement predicts velocity, discontinuity resets it', () => {
  const view={focusVelocity:{x:0,z:0},chunkWorldSize:128,lastFocus:{x:0,z:0},lastFocusTimestamp:0};
  const calc=(p,t)=>InfiniteTerrainView.prototype.calculateVelocity.call(view,p,t);
  assert.deepEqual({...calc({x:10,z:0},1000)},{x:10,z:0});
  assert.deepEqual({...calc({x:100010,z:0},1016)},{x:0,z:0});
  assert.deepEqual({...calc({x:100010,z:0},1032)},{x:0,z:0});
});
