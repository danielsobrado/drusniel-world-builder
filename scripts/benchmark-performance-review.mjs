// Isolated CPU/work-count probes for docs/plans/performance-remediation-2026-10-18.md.
// No browser, GPU timing, production mutations, or performance pass/fail thresholds.
// Run: node scripts/benchmark-performance-review.mjs
import { performance } from 'node:perf_hooks';
import * as THREE from 'three/webgpu';
import { WorkshopDocument } from '../src/editor/workshop/kernel/WorkshopDocument.js';
import { WorkshopCommandBus } from '../src/editor/workshop/kernel/WorkshopCommandBus.js';
import { ObjectView } from '../src/editor/ObjectView.js';
import { objectResidencyState } from '../src/editor/placement/ObjectResidencyState.js';
import { sceneryPreparationStatus } from '../src/editor/stylized/SceneryPreparationStatus.js';
import { StreamedDrawPreparation } from '../src/render/preparation/StreamedDrawPreparation.js';
import { MeadowBandBatch } from '../src/editor/stylized/meadow/MeadowBandBatch.js';
import { createMeadowTemplate } from '../src/editor/stylized/meadow/meadowGrassGeometry.js';
import { TownMesh } from '../src/editor/towns/TownMesh.js';
import { SettlementSite } from '../src/editor/world/settlements/view/SettlementSite.js';
import { PerfQaHarness } from '../src/editor/performance/qa/PerfQaHarness.js';
import { PerfQaSettleGate } from '../src/editor/performance/qa/PerfQaSettleGate.js';
import { PerfCounters } from '../src/editor/performance/qa/PerfCounters.js';
import { createEmptyWorldState } from '../src/sim/model/worldState.js';
import { shortestPath } from '../src/sim/geography/geographicGraph.js';
import { matchTradeOffers } from '../src/sim/logistics/shipments.js';

function medianMs(run) {
  for (let i = 0; i < 5; i++) run();
  const samples = [];
  for (let batch = 0; batch < 5; batch++) {
    const start = performance.now();
    for (let i = 0; i < 10; i++) run();
    samples.push((performance.now() - start) / 10);
  }
  return samples.sort((a, b) => a - b)[2];
}

function workshop() {
  return [100, 1000, 10000].map(size => {
    const bus = new WorkshopCommandBus(new WorkshopDocument({ entities:
      Array.from({ length: size }, (_, i) => ({ id: `e${i}`, type: 'wall', properties: { height: 3 } })),
    }));
    let height = 3;
    const run = () => bus.dispatch({ type: 'entity.set-properties', id: 'e0', properties: { height: ++height } });
    const ms = medianMs(run);
    const original = WorkshopDocument.prototype.listEntities;
    let lists = 0, enumerated = 0;
    WorkshopDocument.prototype.listEntities = function () {
      const entities = original.call(this);
      lists++; enumerated += entities.length;
      return entities;
    };
    let result;
    try { result = run(); } finally { WorkshopDocument.prototype.listEntities = original; }
    return { size, medianMs: ms, lists, enumerated, impacted: result.impactedIds.length };
  });
}

function objectResidency() {
  const view = { terrainView: { slots: [] }, objectMap: { revision: 1, signatureForBounds: () => 0 },
    selectedObjectId: null, lastResidencyFocusKey: '', lastResidencyObjectRevision: 1,
    lastResidencySelection: null, dirtyPlacements: new Set(), allPlacementsDirty: false,
    collectResidentObjects: () => [], refreshAll: () => { refreshes++; } };
  let refreshes = 0;
  const initial = objectResidencyState(view);
  view.lastResidencyObjectRevision = initial.objects;
  const unchanged = ObjectView.prototype.syncResidency.call(view);
  view.objectMap.revision++;
  const unrelatedRevision = ObjectView.prototype.syncResidency.call(view);
  return { unchanged, unrelatedRevision, refreshes, residentObjects: 0 };
}

function discovery() {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const add = () => scene.add(new THREE.Mesh(geometry, material));
  for (let i = 0; i < 1000; i++) add();
  const prep = new StreamedDrawPreparation({ scene, settings: { enabled: true } });
  prep.markInitialScene();
  const traverse = scene.traverse.bind(scene);
  let visits = 0;
  scene.traverse = visitor => traverse(object => { visits++; visitor(object); });
  for (let i = 0; i < 100; i++) {
    const mesh = new THREE.Mesh(geometry, material);
    const visit = mesh.traverse.bind(mesh);
    mesh.traverse = visitor => visit(object => { visits++; visitor(object); });
    scene.add(mesh); prep.register(mesh);
  }
  const result = { initialMeshes: 1000, addedMeshes: 100, visits, pending: prep.pending.size };
  prep.dispose(); geometry.dispose(); material.dispose();
  return result;
}

function meadow() {
  const count = 4096;
  const template = createMeadowTemplate({ detail: 2, count, tileSize: 8 });
  const material = new THREE.MeshBasicNodeMaterial();
  const page = new MeadowBandBatch({ scene: new THREE.Scene(), template, material, name: 'review' });
  const tiles = Array.from({ length: 16 }, (_, i) => ({ buildId: 1, renderX: i * 8, renderZ: 0,
    output: { count, position: new Float32Array(count * 4),
      rotation: new Float32Array(count * 2), data: new Float32Array(count * 4) } }));
  page.update(tiles);
  const attributes = ['instancePosition', 'instanceRotation', 'instanceData', 'instanceTile']
    .map(name => page.geometry.getAttribute(name));
  for (const attribute of attributes) attribute.clearUpdateRanges();
  page.update(tiles.slice(1));
  const markedBytes = attributes.reduce((sum, attribute) => sum + attribute.updateRanges
    .reduce((bytes, range) => bytes + range.count * attribute.array.BYTES_PER_ELEMENT, 0), 0);
  const result = { retiredTiles: 1, remainingStems: page.geometry.instanceCount, markedBytes, newStems: 0 };
  page.dispose(); template.dispose(); material.dispose();
  return result;
}

function doorUpload() {
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 1024);
  const door = { hinge: [0, 0, 0], yaw: 0 };
  TownMesh.prototype.writeDoor.call({ layout: { doors: [door] }, doorMeshes: [mesh] }, 0, 0.5);
  const result = { changedDoors: 1, capacity: mesh.count, version: mesh.instanceMatrix.version,
    updateRanges: mesh.instanceMatrix.updateRanges, fullArrayBytes: mesh.instanceMatrix.array.byteLength,
    changedMatrixBytes: 16 * Float32Array.BYTES_PER_ELEMENT };
  mesh.dispose(); geometry.dispose(); material.dispose();
  return result;
}

function settlementSlice() {
  let heightSamples = 0, checks = 0, samplesAtFirstCheck = 0;
  const site = { settlement: { id: 1, cellX: 0, cellZ: 0 }, dressing: { timberTone: 'review' },
    paving: new THREE.Group(), plan: { profile: { style: { key: 'review' } },
      buildings: [], streets: [], squareRadius: 0,
      props: Array.from({ length: 1000 }, (_, i) => ({ kind: 'bench', variant: 0, x: i * 8, z: 0, yaw: 0 })),
    } };
  site.job = SettlementSite.prototype.prepare.call(site, { sampleHeight: () => { heightSamples++; return 0; } }, 2);
  SettlementSite.prototype.advance.call(site, () => { checks++; samplesAtFirstCheck = heightSamples; return true; });
  return { placementsBeforeFirstYield: site.placements?.length ?? 0, heightSamples, checks, samplesAtFirstCheck };
}

function settle() {
  PerfCounters.reset();
  const terrainView = { getStreamingStatus: () => ({ loading: 0 }),
    settlementView: { getPreparationStatus: () => ({ ready: false, pending: 100 }) } };
  const surface = { terrainView };
  terrainView.stylizedSurface = { getPreparationStatus: () => sceneryPreparationStatus(surface) };
  const readiness = PerfQaHarness.prototype.settleReadiness.call({ playerController: {},
    terrainView,
  });
  const gate = new PerfQaSettleGate();
  let verdict;
  for (let i = 0; i < 60; i++) verdict = gate.update(readiness, 1);
  return { settlementJobs: 100, readiness, verdict };
}

function pathSetup() {
  const state = createEmptyWorldState();
  let edgeChecks = 0;
  for (let i = 0; i < 10000; i++) state.graphEdges.set(`edge${i}`, {
    id: `edge${i}`, status: 'active', data: {
      get enabled() { edgeChecks++; return true; },
      fromNodeId: i === 0 ? 'a' : `remote${i}`, toNodeId: i === 0 ? 'b' : `remoteEnd${i}`,
      baseTravelHours: 1,
    },
  });
  const first = shortestPath(state, 'a', 'b');
  const second = shortestPath(state, 'a', 'b');
  return { edges: state.graphEdges.size, searches: 2, edgeChecks,
    pathLengths: [first.edgeIds.length, second.edgeIds.length] };
}

function tradePairs() {
  const state = createEmptyWorldState();
  let buyCommodityReads = 0;
  for (let i = 0; i < 1000; i++) {
    state.tradeOffers.set(`buy${i}`, { id: `buy${i}`, status: 'active', data: {
      kind: 'buy', limitPrice: 2, get commodityId() { buyCommodityReads++; return 'grain'; },
    } });
    state.tradeOffers.set(`sell${i}`, { id: `sell${i}`, status: 'active', data: {
      kind: 'sell', limitPrice: 1, commodityId: 'timber',
    } });
  }
  matchTradeOffers(state, {}, {});
  return { buys: 1000, sells: 1000, buyCommodityReads };
}

console.log(JSON.stringify({ node: process.version, kind: 'isolated-performance-review',
  workshop: workshop(), objectResidency: objectResidency(), discovery: discovery(),
  meadow: meadow(), doorUpload: doorUpload(), settlementSlice: settlementSlice(), settle: settle(), pathSetup: pathSetup(),
  tradePairs: tradePairs() }, null, 2));
