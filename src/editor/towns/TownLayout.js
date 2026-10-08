import { planDressing, planPaving } from './TownDressing.js';
import { familyForStyle, prefabNameFor, propClusterFor } from './TownPrefabCatalog.js';
import { townHash as placementSeed } from './townHash.js';

/**
 * Turns one settlement plan (src/editor/world/settlements) into kit placements.
 *
 * Plan space is metres centred on the burg with +z along cell z; canonical
 * world z is the negated cell z, so a plan point (x, z) sits at canonical
 * (anchor.x + x, anchor.z - z). A plan footprint's front is local +z turned by
 * `yaw` to plan (sin yaw, cos yaw), i.e. canonical (sin yaw, -cos yaw). A prefab
 * faces +Z, and a rotation of (pi - yaw) about +Y carries +Z there — without the
 * mirror the z flip would otherwise introduce.
 *
 * Output positions are relative to the burg anchor (render precision under the
 * floating origin); collision boxes are absolute canonical metres. Every
 * placement also carries a seed in [0, 1) shared by all pieces of its building
 * (`partSeeds`), from which the renderer varies render tone, timber and roof per
 * house. Pure: no three.js, deterministic in its inputs.
 */

const STORY = 3;
const DOOR_CENTRE = Object.freeze([0.42, 1.04, 0]);
const FENCE_SEGMENT = 2;
const PAVING_MODULE = 'Paving_Stone';

function rotate(x, z, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Rotation about +Y (three.js convention): x' = x cos + z sin, z' = -x sin + z cos.
  return [x * cos + z * sin, -x * sin + z * cos];
}

class Frame {
  constructor(x, y, z, yaw) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.yaw = yaw;
  }

  point(p) {
    const [dx, dz] = rotate(p[0], p[2], this.yaw);
    return [this.x + dx, this.y + p[1], this.z + dz];
  }
}

function planFrame(item, y) {
  return new Frame(item.x, y, -item.z, Math.PI - item.yaw);
}

export class TownLayoutBuilder {
  /**
   * @param {object} options
   * @param {{id:number, cellX:number, cellZ:number}} options.settlement
   * @param {object} options.plan settlement plan
   * @param {number} options.tileSize metres per cell
   * @param {object} options.kit parsed medieval_kit_prefabs.json
   * @param {(canonicalX:number, canonicalZ:number) => number} options.sampleHeight graded ground
   */
  constructor({ settlement, plan, tileSize, kit, sampleHeight }) {
    this.settlement = settlement;
    this.plan = plan;
    this.kit = kit;
    this.sampleHeight = sampleHeight;
    this.anchor = Object.freeze({ x: settlement.cellX * tileSize, z: -settlement.cellZ * tileSize });
    this.family = familyForStyle(plan.profile?.style?.key);
    this.parts = new Map();
    this.seeds = new Map();
    this.boxes = [];
    this.doors = [];
    this.lights = [];
    this.interiors = [];
    this.placed = [];
  }

  addPart(module, position, yaw, seed = 0) {
    if (!this.parts.has(module)) {
      this.parts.set(module, []);
      this.seeds.set(module, []);
    }
    this.parts.get(module).push(position[0], position[1], position[2], yaw);
    this.seeds.get(module).push(seed);
  }

  addBox(id, centre, size, yaw) {
    this.boxes.push(Object.freeze({
      id,
      x: this.anchor.x + centre[0],
      y: centre[1],
      z: this.anchor.z + centre[2],
      sx: size[0],
      sy: size[1],
      sz: size[2],
      yaw,
    }));
  }

  groundAt(x, z) {
    const height = this.sampleHeight(this.anchor.x + x, this.anchor.z + z);
    return Number.isFinite(height) ? height : 0;
  }

  addBuilding(building, index) {
    const name = prefabNameFor(building.kind, building.variant, this.family, this.kit.prefabs);
    const prefab = name ? this.kit.prefabs[name] : null;
    if (!prefab) return;
    const pad = Number.isFinite(building.pad) ? building.pad : this.groundAt(building.x, -building.z);
    const frame = planFrame(building, pad);
    const key = `town:${this.settlement.id}:b${index}`;
    this.placed.push({ building, size: prefab.size });
    const seed = placementSeed(this.settlement.id, index, 11);
    for (const part of prefab.parts) this.addPart(part.m, frame.point(part.p), frame.yaw + part.yaw, seed);
    prefab.colliders.forEach((box, boxIndex) => {
      this.addBox(`${key}:c${boxIndex}`, frame.point(box.c), box.s, frame.yaw + box.yaw);
    });
    prefab.doors.forEach((door, doorIndex) => {
      const hinge = frame.point(door.p);
      const yaw = frame.yaw + door.yaw;
      const [dx, dz] = rotate(DOOR_CENTRE[0], DOOR_CENTRE[2], yaw);
      const centre = [hinge[0] + dx, hinge[1] + DOOR_CENTRE[1], hinge[2] + dz];
      this.doors.push(Object.freeze({
        id: `${key}:d${doorIndex}`,
        hinge,
        yaw,
        openYaw: door.openYaw,
        centre,
        box: Object.freeze({
          id: `${key}:d${doorIndex}`,
          x: this.anchor.x + centre[0],
          y: centre[1],
          z: this.anchor.z + centre[2],
          sx: door.size[0],
          sy: door.size[1],
          sz: door.size[2],
          yaw,
        }),
      }));
    });
    for (const light of prefab.lights) {
      this.lights.push(Object.freeze({ position: frame.point(light.p), energy: light.energy }));
    }
    if (prefab.kind === 'building') {
      this.interiors.push(Object.freeze({
        id: key,
        x: frame.x,
        z: frame.z,
        yaw: frame.yaw,
        halfWidth: prefab.size[0] / 2,
        halfDepth: prefab.size[1] / 2,
        minY: pad - 0.5,
        maxY: pad + prefab.stories * STORY + 1,
      }));
    }
  }

  addProp(prop, index) {
    const cluster = propClusterFor(prop.kind, prop.variant, this.settlement.id + index,
      this.plan.profile?.rank ?? 0);
    if (!cluster.length) return;
    const frame = new Frame(prop.x, 0, -prop.z, Math.PI - prop.yaw);
    cluster.forEach(([module, dx, dz, yaw, dy], partIndex) => {
      const [x, , z] = frame.point([dx, 0, dz]);
      const y = this.groundAt(x, z) + dy;
      this.addPart(module, [x, y, z], frame.yaw + yaw, placementSeed(this.settlement.id, index, partIndex, 23));
      for (const [boxIndex, box] of (this.kit.moduleColliders[module] ?? []).entries()) {
        const [bx, bz] = rotate(box.c[0], box.c[2], frame.yaw + yaw);
        this.addBox(`town:${this.settlement.id}:p${index}:${partIndex}:${boxIndex}`,
          [x + bx, y + box.c[1], z + bz], box.s, frame.yaw + yaw);
      }
    });
  }

  /** Split-rail fence round each farm field. */
  addField(field, index) {
    const frame = new Frame(field.x, 0, -field.z, Math.PI - field.yaw);
    const halfW = field.width / 2;
    const halfD = field.depth / 2;
    const sides = [
      [[-halfW, -halfD], [halfW, -halfD]], [[halfW, -halfD], [halfW, halfD]],
      [[halfW, halfD], [-halfW, halfD]], [[-halfW, halfD], [-halfW, -halfD]],
    ];
    for (const [[ax, az], [bx, bz]] of sides) {
      const length = Math.hypot(bx - ax, bz - az);
      const along = Math.atan2(-(bz - az), bx - ax);
      const count = Math.floor(length / FENCE_SEGMENT);
      for (let s = 0; s < count; s += 1) {
        const t = s * FENCE_SEGMENT / length;
        const [x, , z] = frame.point([ax + (bx - ax) * t, 0, az + (bz - az) * t]);
        this.addPart('Fence_Wood', [x, this.groundAt(x, z), z], frame.yaw + along);
      }
    }
    return index;
  }

  build() {
    this.plan.buildings.forEach((building, index) => this.addBuilding(building, index));
    (this.plan.props ?? []).forEach((prop, index) => this.addProp(prop, index));
    (this.plan.fields ?? []).forEach((field, index) => this.addField(field, index));
    const props = this.plan.props?.length ?? 0;
    planDressing({ plan: this.plan, seed: this.settlement.id, placed: this.placed })
      .forEach((prop, index) => this.addProp(prop, props + index));
    for (const tile of planPaving(this.plan)) {
      const z = -tile.z;
      this.addPart(PAVING_MODULE, [tile.x, this.groundAt(tile.x, z), z], Math.PI - tile.yaw);
    }
    const parts = new Map([...this.parts].map(([module, values]) => [module, Float32Array.from(values)]));
    const partSeeds = new Map([...this.seeds].map(([module, values]) => [module, Float32Array.from(values)]));
    return Object.freeze({
      settlementId: this.settlement.id,
      name: this.plan.name ?? '',
      family: this.family,
      rank: this.plan.profile?.rank ?? 0,
      capital: Boolean(this.settlement.capital),
      citadel: Boolean(this.settlement.citadel),
      culture: Number.isFinite(this.settlement.culture) ? this.settlement.culture : null,
      styleKey: this.plan.profile?.style?.key ?? null,
      finishes: this.plan.profile?.style?.finishes ?? [],
      anchor: this.anchor,
      parts,
      partSeeds,
      boxes: Object.freeze(this.boxes),
      doors: Object.freeze(this.doors),
      lights: Object.freeze(this.lights),
      interiors: Object.freeze(this.interiors),
    });
  }
}

export function layoutTown(options) {
  return new TownLayoutBuilder(options).build();
}

/** Whether a canonical point lies inside an interior volume (relative to its town anchor). */
export function interiorContains(interior, anchor, x, y, z) {
  if (y < interior.minY || y > interior.maxY) return false;
  const [lx, lz] = rotate(x - anchor.x - interior.x, z - anchor.z - interior.z, -interior.yaw);
  return Math.abs(lx) <= interior.halfWidth && Math.abs(lz) <= interior.halfDepth;
}
