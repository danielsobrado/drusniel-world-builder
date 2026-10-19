import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareVisualPose} from '../scripts/lib/world-visual-prepare-pose.mjs';

test('fresh aerial capture prepares actual destination collision before applying the exact aerial pose',async()=>{
  const calls=[],pose={x:-2077,z:1731,yaw:-Math.PI/2,pitch:-.45,mode:'fly',heightAboveGround:30,fov:60};
  const previous=global.window;
  global.window={__worldVisualQa:{cut:async p=>{calls.push(['cut',p]);},settle:async p=>{calls.push(['settle',p]);return {ready:true};}}};
  try {
    const page={evaluate:(fn,arg)=>fn(arg)},result=await prepareVisualPose(page,pose,{timeoutMs:300000});
    assert.deepEqual(calls,[['cut',{...pose,mode:'player',heightAboveGround:1.7}],['settle',{minimumMs:0,timeoutMs:300000}],['cut',pose],['settle',{minimumMs:16000,timeoutMs:300000}]]);
    assert.equal(result.groundPreparation.ready,true);assert.equal(result.readiness.ready,true);
    assert.equal(pose.mode,'fly');assert.equal(pose.heightAboveGround,30);
  }finally{global.window=previous;}
});

test('ground capture retains its ordinary preparation and failed priming cannot accept an aerial capture',async()=>{
  const previous=global.window,calls=[];
  global.window={__worldVisualQa:{cut:async p=>calls.push(p),settle:async()=>{throw new Error('collision not ready');}}};
  try {
    const page={evaluate:(fn,arg)=>fn(arg)},pose={x:1,z:-2,mode:'player'};
    await assert.rejects(prepareVisualPose(page,pose),/collision not ready/);assert.deepEqual(calls,[pose]);
    calls.length=0;await assert.rejects(prepareVisualPose(page,{...pose,mode:'fly',heightAboveGround:50}),/collision not ready/);
    assert.equal(calls.length,1);assert.equal(calls[0].mode,'player');
  }finally{global.window=previous;}
});
