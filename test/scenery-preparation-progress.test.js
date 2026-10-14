import test from 'node:test';
import assert from 'node:assert/strict';
import { StylizedBuildQueue } from '../src/editor/stylized/StylizedBuildQueue.js';
import { stepViewRebuild } from '../src/editor/stylized/StagedViewRebuild.js';
import { ITERATOR_PENDING } from '../src/editor/stylized/ResumableIterator.js';
import { sceneryPreparationStatus } from '../src/editor/stylized/SceneryPreparationStatus.js';
import { placementPreparationRadius } from '../src/editor/world/PlacementPreparationWindow.js';
test('a waiting dependency does not count as progress and completed work drains',()=>{
 const view={pendingRebuild:{key:'a',updateKey:'a',focus:{chunkX:0,chunkZ:0}}};let ready=false;
 const queue=new StylizedBuildQueue({now:()=>0});
 const factory=function*(){while(!ready)yield ITERATOR_PENDING;yield;return true;};
 const run=()=>stepViewRebuild(view,view.pendingRebuild,()=>false,factory);
 queue.enqueue({...view.pendingRebuild,progressProbe:()=>view.workProgress??0});queue.flush(run);
 assert.equal(queue.getDiagnostics().advanced,0);assert.equal(queue.getDiagnostics().blocked,1);
 ready=true;queue.enqueue({...view.pendingRebuild,progressProbe:()=>view.workProgress??0});queue.flush(run);
 assert.equal(queue.getDiagnostics().completed,1);assert.equal(view.pendingRebuild,null);
 assert.equal(view.stagedRebuild,null);
});
test('moved generation never publishes the old iterator',()=>{
 const view={pendingRebuild:{key:'a',updateKey:'a',focus:{chunkX:0,chunkZ:0}}};const published=[];let allow=false;
 const factory=function*(job){while(!allow)yield ITERATOR_PENDING;published.push(job.key);return true;};
 stepViewRebuild(view,view.pendingRebuild,()=>false,factory);
 view.pendingRebuild={key:'b',updateKey:'b',focus:{chunkX:1,chunkZ:0}};allow=true;
 stepViewRebuild(view,view.pendingRebuild,()=>false,factory);assert.deepEqual(published,['b']);
});
test('staged work and known errors keep readiness false even with no queued entry',()=>{
 const surface={detailViews:[],terrainView:{},bushView:{stagedRebuild:{}}};
 assert.equal(sceneryPreparationStatus(surface).ready,false);surface.bushView.stagedRebuild=null;
 assert.equal(sceneryPreparationStatus(surface).ready,true);surface.preparedPlacement={error:new Error('asset failed')};
 assert.equal(sceneryPreparationStatus(surface).ready,false);
});
test('bush and detail dependency radii are covered',()=>{
 assert.equal(placementPreparationRadius({trees:{residentRadius:1},rocks:{residentRadius:1},bushes:{residentRadius:10},lod:{enabled:false}},1),14);
});
