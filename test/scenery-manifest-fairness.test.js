import assert from 'node:assert/strict';
import test from 'node:test';
import { SCENERY_WORK_ORDER, SceneryWorkScheduler, createSceneryConsumers } from '../src/editor/stylized/SceneryWorkScheduler.js';
import { StylizedBuildQueue } from '../src/editor/stylized/StylizedBuildQueue.js';
import { TreeManifestStore } from '../src/editor/stylized/TreeManifestStore.js';

function treeStore(queue, build) {
  const keys = ['0:0', '1:0', '2:0'];
  const store = Object.assign(Object.create(TreeManifestStore.prototype), {
    queue, activeKeys: new Set(keys), pendingKeys: new Set(keys), pendingBuilds: new Map(), build,
  });
  keys.forEach((key, chunkX) => queue.enqueue({ key, chunkX, chunkZ: 0 }));
  return store;
}

test('manifest-only demand progresses despite continuous meadow work and no pending draw rebuild', () => {
  let now = 0, deadline = 0, trees = 0, rocks = 0;
  const makeQueue = () => new StylizedBuildQueue({ now: () => now, budgetMs: 0.25,
    shouldYield: () => now >= deadline });
  const tree = treeStore(makeQueue(), () => { now += 0.25; trees++; return []; });
  const rockQueue = makeQueue();
  for (let i = 0; i < 3; i++) rockQueue.enqueue({ key: String(i) });
  const rock = { queue: rockQueue, flush: () => rockQueue.flush(() => { now += 0.25; rocks++; return true; }) };
  const surface = {
    preparedPlacement: { completed: [1, 2, 3], completedHead: 0,
      flush() { now += 0.25; this.completedHead++; } },
    meadowGrass: { frameInputs: {}, blades: { staleTiles: [{}] }, prepareFrame() { now += 0.25; } },
    treeView: { manifestStore: tree, pendingLodRebuild: null },
    rockView: { manifestStore: rock, pendingRebuild: null },
    detailViews: [], flowerBuildQueue: { size: 0 },
  };
  const scheduler = new SceneryWorkScheduler();
  const consumers = createSceneryConsumers(surface);
  for (let frame = 0; frame < 3 * SCENERY_WORK_ORDER.length; frame++) {
    deadline = now + 0.25;
    scheduler.beginFrame(consumers, () => now >= deadline);
    assert.ok(now <= deadline, 'all consumers share the same allowance');
  }
  assert.equal(trees, 3);
  assert.equal(rocks, 3);
  assert.equal(surface.preparedPlacement.completedHead, 3);
  assert.equal(tree.queue.size + rock.queue.size, 0);
});

test('early tree preparation reports its completed manifests to the next render update once', () => {
  const queue = new StylizedBuildQueue({ buildsPerFrame: 4, budgetMs: Infinity });
  const store = treeStore(queue, () => []);
  let built = 0;
  store.onBuilt = () => built++;
  store.flush({ consumeCompleted: false });
  assert.equal(queue.size, 0);
  assert.equal(store.flush().completed, 3, 'the render update must schedule publication of early results');
  assert.equal(store.flush().completed, 0, 'unchanged manifests do not keep triggering rebuilds');
  assert.equal(built, 3);
});
