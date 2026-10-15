import assert from 'node:assert/strict';
import test from 'node:test';
import {visualMotionInput,visualMotionDelta} from '../src/editor/performance/qa/WorldVisualMotion.js';
import {staticLightingChange} from '../src/editor/performance/qa/WorldVisualLighting.js';
import {stepPlayerPhysics,createPlayerState} from '../src/editor/player/PlayerPhysics.js';

test('motion sequence has the exact stationary walk sprint turn and recovery intervals',()=>{
 for(const [t,keys] of [[0,[]],[1.999,[]],[2,['KeyW']],[5.999,['KeyW']],[6,['KeyW','ShiftLeft']],[9.999,['KeyW','ShiftLeft']],[10,[]],[12,[]],[12.5,[]],[13,['KeyW']],[16.999,['KeyW']],[17,[]],[20,[]]])assert.deepEqual(visualMotionInput(t,.25).keys,keys);
 assert.equal(visualMotionInput(12,.25).yaw,.25);assert.equal(visualMotionInput(12.5,.25).yaw,.25+Math.PI/2);assert.equal(visualMotionInput(13,.25).yaw,.25+Math.PI);
});
test('motion clock uses the same clamped step as actual movement physics',()=>{
 const config={walkSpeed:9,runMultiplier:1.8,jumpSpeed:8,gravity:24,eyeHeight:1.7,stepHeight:1.1,groundSnapDistance:.6};
 const initial=createPlayerState({x:0,z:0,groundHeight:0,config});
 for(const gap of [0,16.666,33.333,100,5000]) {
  const dt=visualMotionDelta(1000,1000+gap);
  const next=stepPlayerPhysics({state:initial,input:{forward:1,right:0,running:false,jump:false},deltaSeconds:gap/1000,config,
   forward:{x:0,z:-1},right:{x:1,z:0},getGroundHeight:()=>0});
  assert.ok(Math.abs(next.z+dt*9)<1e-9);
 }
 assert.equal(visualMotionDelta(null,1000),0);
});
test('static convergence rejects missing or changed components at the specified boundary',()=>{
 assert.equal(staticLightingChange(null,[1]),Infinity);assert.equal(staticLightingChange([1],[1,2]),Infinity);
 assert.equal(staticLightingChange([.5,1],[.5005,1]),.0004999999999999449);
 assert.ok(staticLightingChange([.5,1],[.502,1])>.001);
});
