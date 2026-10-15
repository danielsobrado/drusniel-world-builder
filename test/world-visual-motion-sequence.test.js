import assert from 'node:assert/strict';
import test from 'node:test';
import {motionChecks,selectMotionFrames} from '../scripts/lib/world-visual-motion-report.mjs';

function report(recovery) {
 const frames=[];
 for(let i=0;i<=200;i++){const elapsed=i/10;frames.push({elapsed,wallTimeMs:1700000000000+elapsed*1000,
  position:{x:elapsed,y:1.7,z:0,footY:0},camera:{x:elapsed,y:1.7,z:0},yaw:0,pitch:0,fov:68,mode:'player',
  collision:{ready:true,contacts:[]},nearMeadow:{missing:[]},
  scenery:{ready:!(elapsed>=10&&elapsed<10+recovery),queueDepth:0}});}
 return {cameraMode:'first-person',elapsedSimulationSeconds:20,settings:{walkSpeed:9,firstPersonFov:68,thirdPersonFov:45},frames};
}
test('motion gate fails scenery that remains pending beyond the two second stop',()=>{
 const pass=motionChecks(report(1.8));assert.ok(pass.checks.every(c=>c.passed));
 const fail=motionChecks(report(2.1));assert.equal(fail.checks.find(c=>c.id.endsWith('at 10')).passed,false);
});
test('contact frames select actual wall times for simulation markers despite wall stalls',()=>{
 const motion=report(0);motion.frames=motion.frames.map(f=>({...f,wallTimeMs:f.wallTimeMs+(f.elapsed>=6?1500:0)}));
 const captures=motion.frames.map((f,i)=>({file:`${i}.jpg`,wallTimeMs:f.wallTimeMs+8}));
 const contacts=selectMotionFrames(motion,captures);
 assert.deepEqual(contacts.map(c=>c.marker),[0,6,10,12,13,17,20]);
 assert.ok(contacts.every(c=>c.alignmentErrorMs===8));
 assert.ok(contacts[1].wallTimeMs-contacts[0].wallTimeMs>=7400);
 assert.throws(()=>selectMotionFrames(motion,[]),/required/);
});
test('nonfinite motion and disabled collision fail independently of scenery readiness',()=>{
 const motion=report(0);motion.frames[5].position.footY=NaN;motion.frames[6].collision.ready=false;
 const result=motionChecks(motion);
 assert.equal(result.checks.find(c=>c.id.startsWith('finite')).passed,false);
 assert.equal(result.checks.find(c=>c.id.startsWith('collision')).passed,false);
});
