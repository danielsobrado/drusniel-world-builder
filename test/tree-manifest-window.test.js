import test from 'node:test';import assert from 'node:assert/strict';
import { TreeManifestStore } from '../src/editor/stylized/TreeManifestStore.js';
import { StylizedBuildQueue } from '../src/editor/stylized/StylizedBuildQueue.js';
test('a cut cancels old manifests and an obsolete plan cannot reactivate them',()=>{
 const store=Object.assign(Object.create(TreeManifestStore.prototype),{
  queue:new StylizedBuildQueue(),activeKeys:new Set(['0:0','30:40']),pendingKeys:new Set(['0:0','30:40']),
  pendingBuilds:new Map([['0:0',{}],['30:40',{}]]),contextCache:new Map(),cache:new Map(),cacheLimit:625,
  terrainView:{focusChunk:{chunkX:30,chunkZ:40}},
 });
 store.queue.enqueue({key:'0:0'});store.queue.enqueue({key:'30:40'});
 store.setWindow(30,40,7);assert.equal(store.queue.size,1);assert.equal(store.pendingBuilds.has('0:0'),false);
 store.schedule(0,0,null);assert.equal(store.queue.size,1);
 store.setActive(new Set(['0:0','30:40']));assert.deepEqual([...store.activeKeys],['30:40']);
});
