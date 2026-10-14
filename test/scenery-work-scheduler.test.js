import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENERY_WORK_ORDER, SceneryWorkScheduler } from '../src/editor/stylized/SceneryWorkScheduler.js';
test('every runnable consumer receives its first turn within one rotation on the same allowance',()=>{
 const scheduler=new SceneryWorkScheduler(),seen=[];let spent=false;
 const consumers=Object.fromEntries(SCENERY_WORK_ORDER.map(name=>[name,{pending:()=>true,run:()=>{seen.push(name);spent=true;}}]));
 for(let frame=0;frame<SCENERY_WORK_ORDER.length;frame++){spent=false;scheduler.beginFrame(consumers,()=>spent);}
 assert.deepEqual(seen,SCENERY_WORK_ORDER);
});
test('blocked consumers and exhausted budget do not impede other turns',()=>{
 const scheduler=new SceneryWorkScheduler(),seen=[];
 const consumers={meadow:{pending:()=>true,blocked:()=>true,run:()=>assert.fail()},bush:{pending:()=>true,run:()=>seen.push('bush')}};
 scheduler.beginFrame(consumers,()=>false);assert.deepEqual(seen,['bush']);
 scheduler.beginFrame(consumers,()=>true);assert.deepEqual(seen,['bush']);
});
