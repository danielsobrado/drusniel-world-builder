import assert from 'node:assert/strict';
import test from 'node:test';
import { Scene, Mesh, PlaneGeometry, MeshBasicMaterial } from 'three/webgpu';

import { DeferredWorkBudget } from '../src/editor/performance/DeferredWorkBudget.js';
import { StreamedDrawPreparation } from '../src/render/preparation/StreamedDrawPreparation.js';

test('queued draws publish under sustained earlier work without granting another frame budget', () => {
  let now = 0;
  const budget = new DeferredWorkBudget({ enabled: true, targetFps: 144, reserveMs: 0.5,
    minimumMs: 0.25, maximumMs: 1.2 });
  budget.slack.now = () => now;
  budget.slack.fixedMs = 9;
  const scene = new Scene(), geometry = new PlaneGeometry(), material = new MeshBasicMaterial();
  const meshes = Array.from({ length: 3 }, () => new Mesh(geometry, material));
  scene.add(...meshes);
  let renders = 0, earlierTurns = 0;
  const preparation = new StreamedDrawPreparation({ scene, renderer: {},
    settings: { enabled: true, meshesPerFrame: 1 }, render: () => { renders++; now += 0.25; } });
  preparation.discover();
  try {
    for (let frame = 0; frame < 12; frame++) {
      budget.beginFrame();
      // The real frame loop reserves before the terrain/scenery queues, but
      // compiles in the late render phase after mandatory simulation work.
      preparation.beginFrame(budget);
      budget.tryRun(() => { earlierTurns++; now += 0.25; });
      now += 9;
      preparation.flushBudgeted(null, budget);
      preparation.hidePending();
      assert.ok(budget.slack.deferredMs <= 0.250001, 'both consumers share the one floor');
      budget.endFrame();
    }
    assert.equal(renders, 3, 'every queued mesh gets a turn within four frames');
    assert.ok(earlierTurns >= 9, 'earlier queues retain their turns');
    assert.equal(preparation.pending.size, 0);
    assert.ok(meshes.every(mesh => mesh.visible && preparation.prepared.has(mesh)));
    budget.beginFrame();
    preparation.beginFrame(budget);
    assert.equal(budget.slack.deferredMs, 0, 'an empty queue reserves nothing');
    preparation.flushBudgeted(null, budget);
    assert.equal(renders, 3);
  } finally {
    preparation.dispose(); geometry.dispose(); material.dispose();
  }
});
