import { PerfCounters } from '../../performance/qa/PerfCounters.js';
import { buildingEntry } from '../../world/settlements/SettlementBuildingCatalog.js';
import { SETTLEMENT_PLAN_VERSION } from '../../world/settlements/SettlementPlanner.js';
import { isStoneKind } from '../../world/settlements/SettlementStones.js';
import { WALL_STAIR } from '../../world/settlements/SettlementTrim.js';
import { HOUSE_SHELL, houseShell, roomSolids } from '../../world/settlements/view/SettlementInteriorGeometry.js';
import { planToWorld } from '../../world/settlements/view/SettlementPlacements.js';
import { createCollisionSourceId } from '../CollisionIds.js';
import { collisionChunkCanonicalBounds, collisionChunkForCanonical } from '../colliders/ColliderBounds.js';
import { COLLISION_LAYERS } from '../CollisionLayers.js';
import { COLLIDER_TYPE_BOX, createPrimitiveCollider } from '../colliders/ColliderRecords.js';

const SETTLEMENT_COLLISION_SCHEMA = `settlements:v1:plan${SETTLEMENT_PLAN_VERSION}`;
const PLOT_MARGIN = HOUSE_SHELL.plotMargin;
/** Walls stand taller than their eaves: roofs, gables and battlements. */
const HEIGHT_HEADROOM = 3;

/**
 * What stands solid in each kind, as boxes in the footprint's own frame:
 * `[centreX, centreZ, width, depth]` in metres, x along the frontage.
 *
 * Masonry is far slimmer than the plot the planner reserves and flattens for
 * it, and a gatehouse is two piers with the road between them — one box would
 * wall the town shut. Kinds not listed are solid over their plot.
 */
const SOLID_SHAPES = Object.freeze({
  wall: [[0, 0, 12, 2.2]],
  tower: [[0, 0, 6.6, 6.6]],
  keep: [[0, 0, 10.3, 8.2]],
  // Offsets are in the footprint's frame, whose +x is the mesh's −x once placed.
  hall: [[0.6, 0.45, 14, 8.4]],
  gatehouse: [[-4.7, 0, 5, 6.8], [4.7, 0, 5, 6.8]],
});

const STAIR_STEPS_PER_TREAD = 2;

/**
 * A house as solid round its room, instead of one block: everything between
 * the plot's edge and the room the view draws (`houseShell`) blocks, the room's
 * floor is plain ground, and the front wall is left open where the mesh has
 * its door. Boxes are `[centreX, centreZ, width, depth]` in the footprint's
 * frame, front toward +z.
 */
function hollowShapes(shell, plotWidth, plotDepth) {
  const t = HOUSE_SHELL.wallThickness;
  const left = Math.min(-plotWidth / 2, shell.x0 - t);
  const right = Math.max(plotWidth / 2, shell.x1 + t);
  const rear = Math.min(-plotDepth / 2, shell.back - t);
  const { front } = shell;
  const span = (from, to, near, far) => [(from + to) / 2, (near + far) / 2, to - from, far - near];
  return [
    span(left, right, rear, shell.back),
    span(left, shell.x0, shell.back, front),
    span(shell.x1, right, shell.back, front),
    span(shell.x0, shell.doorLeft, shell.inner, front),
    span(shell.doorRight, shell.x1, shell.inner, front),
  ].filter(([, , width, depth]) => width > 0.05 && depth > 0.05);
}

/**
 * Kinds whose top is a place to stand: the wall-walk and the tower and keep
 * roofs. Their boxes stop at the real parapet walk instead of rising clear of
 * the roofline, and carry the walkable layer as well as the blocking one.
 */
const WALKABLE_TOPS = new Set(['wall', 'tower', 'keep', 'gatehouse']);

/** Props a walker cannot pass through, as `[width, depth, height]`; the rest are too slight to matter. */
const SOLID_PROPS = Object.freeze({
  well: [2.6, 2, 1.1],
  stall: [3.6, 2.1, 2.4],
  cart: [1.4, 3.4, 1.2],
  barrels: [1.3, 1.7, 1],
  quarryBlock: [1, 1, 0.7],
  boulder: [1, 1, 0.55],
});

function boxRecord({ sourceId, x, y, z, yaw, width, depth, height, walkable, chunkWorldSize }) {
  // A footprint's local +x is (cos yaw, −sin yaw) in plan space and plan z is
  // minus canonical z, so the box is turned by π − yaw (SettlementPlacements).
  const rotationY = Math.PI - yaw;
  const sin = Math.abs(Math.sin(rotationY));
  const cos = Math.abs(Math.cos(rotationY));
  const halfX = (width * cos + depth * sin) / 2;
  const halfZ = (width * sin + depth * cos) / 2;
  const owner = collisionChunkForCanonical(x, z, chunkWorldSize);
  return createPrimitiveCollider({
    sourceId,
    type: COLLIDER_TYPE_BOX,
    layers: walkable ? COLLISION_LAYERS.solid : COLLISION_LAYERS.blocking,
    ownerChunkX: owner.chunkX,
    ownerChunkZ: owner.chunkZ,
    aabb: { minX: x - halfX, maxX: x + halfX, minY: y, maxY: y + height, minZ: z - halfZ, maxZ: z + halfZ },
    position: [x, y + height / 2, z],
    rotationY,
    // Full extents, as the character contacts read a box.
    dimensions: [width, height, depth],
    prototypeId: null,
  });
}

/**
 * Collision for planned settlements: every building and the heavier street
 * furniture as oriented boxes.
 *
 * Like the view, it holds nothing: it reads the same derived plans from the
 * generator's settlement field, so what blocks the player is exactly what is
 * drawn. Each solid is owned by the chunk its centre falls in.
 */
export class SettlementCollisionProvider {
  /** @param {boolean} [options.enterable] build houses as walls with a doorway rather than solid blocks */
  constructor({ terrainView, chunkWorldSize, enterable = true }) {
    if (!terrainView?.worldStore || !(chunkWorldSize > 0)) {
      throw new Error('Settlement collision provider requires the terrain view and a chunk size.');
    }
    this.terrainView = terrainView;
    this.chunkWorldSize = chunkWorldSize;
    this.enterable = enterable;
    this.descriptor = Object.freeze({ id: 'production-settlements' });
    this.generators = new WeakMap();
    this.generatorCount = 0;
    /** Solids per planned settlement: a town spans many chunks, and each asks. */
    this.solids = new WeakMap();
  }

  /** Changes with the world: another generator plans other towns. */
  getEpoch() {
    const generator = this.terrainView.worldStore.generator;
    if (!generator) return SETTLEMENT_COLLISION_SCHEMA;
    if (!this.generators.has(generator)) this.generators.set(generator, this.generatorCount += 1);
    return `${SETTLEMENT_COLLISION_SCHEMA}:${this.generators.get(generator)}`;
  }

  solidsOf(entry, plan, tileSize, field) {
    const cached = this.solids.get(plan);
    if (cached) return cached;
    const solids = [];
    this.solids.set(plan, solids);
    const { settlement } = entry;
    plan.buildings.forEach((building, index) => {
      const plotWidth = Math.max(1, building.width - PLOT_MARGIN);
      const plotDepth = Math.max(1, building.depth - PLOT_MARGIN);
      const shell = this.enterable ? houseShell(building) : null;
      const shapes = SOLID_SHAPES[building.kind] ?? (shell ? hollowShapes(shell, plotWidth, plotDepth) : [[0, 0, plotWidth, plotDepth]]);
      const sin = Math.sin(building.yaw);
      const cos = Math.cos(building.yaw);
      const walkable = WALKABLE_TOPS.has(building.kind);
      const height = buildingEntry(building.kind, building.variant).height + (walkable ? 0 : HEIGHT_HEADROOM);
      shapes.forEach(([localX, localZ, width, depth], part) => {
        const world = planToWorld(settlement, tileSize, building.x + cos * localX + sin * localZ, building.z - sin * localX + cos * localZ);
        solids.push({ id: `b${index}.${part}`, ...world, y: building.pad, yaw: building.yaw, width, depth, height, walkable });
      });
    });
    // What stands in the rooms: a table is not walked through.
    plan.buildings.forEach((building, index) => {
      const shell = this.enterable ? houseShell(building) : null;
      if (!shell) return;
      const sin = Math.sin(building.yaw);
      const cos = Math.cos(building.yaw);
      roomSolids(building, shell).forEach(([x0, x1, z0, z1, height], piece) => {
        const [localX, localZ] = [(x0 + x1) / 2, (z0 + z1) / 2];
        const world = planToWorld(settlement, tileSize, building.x + cos * localX + sin * localZ, building.z - sin * localX + cos * localZ);
        solids.push({ id: `r${index}.${piece}`, ...world, y: building.pad, yaw: building.yaw, width: x1 - x0, depth: z1 - z0, height });
      });
    });
    plan.props.forEach((prop, index) => {
      if (prop.kind === 'wallStair') {
        // One box a tread, each solid to the ground, each a little higher: a
        // flight the character motor climbs, ending level with the wall-walk.
        // Two drawn steps to a tread: the motor only stands on a box wider than
        // the character, and a drawn step is not.
        const steps = Math.round(WALL_STAIR.height / WALL_STAIR.rise) / STAIR_STEPS_PER_TREAD;
        const run = WALL_STAIR.run * STAIR_STEPS_PER_TREAD;
        const rise = WALL_STAIR.rise * STAIR_STEPS_PER_TREAD;
        const sin = Math.sin(prop.yaw);
        const cos = Math.cos(prop.yaw);
        const y = field.sampleGround(settlement.cellX + prop.x / tileSize, settlement.cellZ + prop.z / tileSize);
        for (let step = 0; step < steps; step += 1) {
          const localX = -steps * run / 2 + run * (step + 0.5);
          const world = planToWorld(settlement, tileSize, prop.x + cos * localX, prop.z - sin * localX);
          solids.push({ id: `p${index}.${step}`, ...world, y, yaw: prop.yaw, width: run, depth: WALL_STAIR.width,
            height: rise * (step + 1), walkable: true });
        }
        return;
      }
      const shape = SOLID_PROPS[prop.kind];
      if (!shape) return;
      const scale = isStoneKind(prop.kind) ? prop.scale : 1;
      const world = planToWorld(settlement, tileSize, prop.x, prop.z);
      const y = field.sampleGround(settlement.cellX + prop.x / tileSize, settlement.cellZ + prop.z / tileSize);
      solids.push({ id: `p${index}`, ...world, y, yaw: prop.yaw, width: shape[0] * scale, depth: shape[1] * scale, height: shape[2] * scale });
    });
    return solids;
  }

  buildChunkData(chunkX, chunkZ) {
    const field = this.terrainView.worldStore.generator?.ensureSettlementField?.() ?? null;
    const colliders = [];
    if (field) {
      const { tileSize } = field;
      const bounds = collisionChunkCanonicalBounds(chunkX, chunkZ, this.chunkWorldSize);
      const centreX = (bounds.minX + bounds.maxX) / 2;
      const centreZ = (bounds.minZ + bounds.maxZ) / 2;
      const reach = this.chunkWorldSize * Math.SQRT1_2 / tileSize;
      for (const { entry } of field.entriesNear(centreX / tileSize, -centreZ / tileSize, reach)) {
        const { plan } = field.ensurePlan(entry);
        for (const solid of this.solidsOf(entry, plan, tileSize, field)) {
          // Ask the shared mapping, not the bounds: it alone decides which edge a chunk owns.
          const owner = collisionChunkForCanonical(solid.x, solid.z, this.chunkWorldSize);
          if (owner.chunkX !== chunkX || owner.chunkZ !== chunkZ) continue;
          colliders.push(boxRecord({
            ...solid,
            sourceId: createCollisionSourceId('settlement', entry.settlement.id, solid.id),
            chunkWorldSize: this.chunkWorldSize,
          }));
        }
      }
    }
    colliders.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
    PerfCounters.inc('collisionSettlementChunkBuilds');
    return Object.freeze({
      signature: `${this.getEpoch()}|${colliders.map(({ sourceId }) => sourceId).join(',')}`,
      colliders: Object.freeze(colliders),
      stats: Object.freeze({ colliders: colliders.length }),
      sample: null,
    });
  }

  dispose() {
    this.generators = new WeakMap();
    this.solids = new WeakMap();
  }
}
