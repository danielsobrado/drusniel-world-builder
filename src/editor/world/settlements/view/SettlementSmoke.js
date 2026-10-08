import * as THREE from 'three/webgpu';
import { float, fract, instancedBufferAttribute, mix, sin, smoothstep, time, uv, vec3 } from 'three/tsl';
import { buildingEntry } from '../SettlementBuildingCatalog.js';
import { settlementDusk } from './SettlementDusk.js';

/** Kinds with a fire that is always lit; a share of ordinary houses join them. */
const HEARTH_KINDS = new Set(['tavern', 'smithy', 'bakery']);
const HOUSE_KINDS = new Set(['house', 'townhouse', 'farmhouse', 'shop']);
const HOUSE_SHARE = 0.4;
/** Puffs in the air at once over one chimney. */
const PUFFS = 5;
const RISE_METRES = 9;

/**
 * A town's plumes: a soft disc that rises, swells, drifts down wind and thins
 * out over its life. The whole motion is in the shader, from a per-puff phase,
 * so a town's smoke costs one draw and no per-frame work. One material a town:
 * it reads that town's own puff buffer.
 */
function smokeMaterial(puffs) {
  const material = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
  const life = fract(time.mul(0.085).add(puffs.w));
  const sway = sin(time.mul(0.6).add(puffs.w.mul(40))).mul(0.35);
  material.positionNode = puffs.xyz.add(vec3(life.mul(2.6).add(sway.mul(life)), life.mul(RISE_METRES), life.mul(1.1)));
  material.scaleNode = mix(float(0.7), float(3.4), life);
  const disc = smoothstep(0.5, 0.12, uv().sub(0.5).length());
  material.opacityNode = disc.mul(smoothstep(0, 0.12, life)).mul(smoothstep(1, 0.35, life)).mul(0.26);
  material.colorNode = mix(vec3(0.62, 0.6, 0.58), vec3(0.86, 0.86, 0.88), life);
  material.name = 'settlement-smoke';
  return material;
}

/** Whether a building keeps a fire, decided once and for good from its place in the plan. */
function hasHearth(building, index) {
  if (HEARTH_KINDS.has(building.kind)) return true;
  if (!HOUSE_KINDS.has(building.kind)) return false;
  return ((Math.imul(index + 1, 0x9e3779b1) >>> 8) / 16777216) < HOUSE_SHARE;
}

/**
 * Chimney smoke for one settlement, in settlement-local space (x is plan x, z
 * is minus plan z, y absolute). Returns null for a plan with no hearths.
 */
export function createSettlementSmoke(plan) {
  const hearths = plan.buildings.filter(hasHearth);
  if (hearths.length === 0) return null;
  const puffs = new Float32Array(hearths.length * PUFFS * 4);
  hearths.forEach((building, index) => {
    // Over the ridge: wall height plus a 40° roof on the shorter side.
    const top = building.pad + buildingEntry(building.kind, building.variant).height + Math.min(building.width, building.depth) * 0.42;
    for (let puff = 0; puff < PUFFS; puff += 1) {
      const offset = (index * PUFFS + puff) * 4;
      puffs[offset] = building.x;
      puffs[offset + 1] = top;
      puffs[offset + 2] = -building.z;
      // Evenly spaced through a plume's life, and out of step with the next chimney's.
      puffs[offset + 3] = puff / PUFFS + ((index * 0.618) % 1);
    }
  });
  const sprite = new THREE.Sprite(smokeMaterial(instancedBufferAttribute(new THREE.InstancedBufferAttribute(puffs, 4))));
  sprite.count = hearths.length * PUFFS;
  sprite.frustumCulled = false;
  sprite.userData.skipWarmup = true;
  sprite.name = 'settlement-smoke';
  return sprite;
}

/** Metres between haze banks along a street, and how high they hang. */
const HAZE = Object.freeze({ spacing: 14, height: 2.2, size: 13 });

/**
 * Haze down the streets and over the square: big, faint, slow discs of dust
 * and woodsmoke that put air between the near houses and the far ones. Thicker
 * toward evening, when the fires are lit. One draw a town, like the smoke.
 */
export function createSettlementHaze(plan, heightAt) {
  const banks = [];
  if (plan.squareRadius > 0) banks.push([0, 0]);
  for (const street of plan.streets) {
    if (street.kind !== 'main' && street.kind !== 'ring') continue;
    let travelled = HAZE.spacing / 2;
    for (let index = 1; index < street.points.length; index += 1) {
      const [ax, az] = street.points[index - 1];
      const [bx, bz] = street.points[index];
      const length = Math.hypot(bx - ax, bz - az);
      for (; travelled < length; travelled += HAZE.spacing) {
        const x = ax + (bx - ax) * travelled / length;
        const z = az + (bz - az) * travelled / length;
        if (Math.hypot(x, z) < plan.profile.radius) banks.push([x, z]);
      }
      travelled -= length;
    }
  }
  if (banks.length === 0) return null;
  const data = new Float32Array(banks.length * 4);
  banks.forEach(([x, z], index) => {
    data[index * 4] = x;
    data[index * 4 + 1] = heightAt(x, z) + HAZE.height;
    data[index * 4 + 2] = -z;
    data[index * 4 + 3] = (index * 0.618) % 1;
  });
  const bank = instancedBufferAttribute(new THREE.InstancedBufferAttribute(data, 4));
  const material = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
  const drift = sin(time.mul(0.11).add(bank.w.mul(6.28)));
  material.positionNode = bank.xyz.add(vec3(drift.mul(1.6), drift.mul(0.25), drift.mul(0.9)));
  material.scaleNode = float(HAZE.size).mul(bank.w.mul(0.5).add(0.75));
  const disc = smoothstep(0.5, 0.05, uv().sub(0.5).length());
  material.opacityNode = disc.mul(settlementDusk.mul(0.07).add(0.035));
  material.colorNode = mix(vec3(0.86, 0.84, 0.78), vec3(0.95, 0.72, 0.5), settlementDusk);
  material.name = 'settlement-haze';
  const sprite = new THREE.Sprite(material);
  sprite.count = banks.length;
  sprite.frustumCulled = false;
  sprite.userData.skipWarmup = true;
  sprite.name = 'settlement-haze';
  return sprite;
}
