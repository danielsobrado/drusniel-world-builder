import * as THREE from 'three/webgpu';
import { PLASTER_PALETTES, ROOF_PALETTES, STONE_PALETTES } from '../../../workshop/ProceduralWorkshopMaterials.js';
import { finishIndexFor } from '../SettlementBuildingCatalog.js';
import { settlementSkylineArrays } from './SettlementSkylineGeometry.js';

export const SETTLEMENT_SKYLINE = Object.freeze({
  /** Towns whose edge is within this many metres are given a skyline. */
  radius: 3200,
  /** The skyline takes over from the instanced meshes at this distance from the town's centre... */
  near: 560,
  /** ...and never while the camera is inside the town's own reach. */
  maxTowns: 8,
});

const linear = ([red, green, blue]) => [red / 255, green / 255, blue / 255];

function skylineColors(style) {
  const stone = linear((STONE_PALETTES[style.style] ?? STONE_PALETTES.granite).base);
  const roof = linear((ROOF_PALETTES[style.topStyle] ?? ROOF_PALETTES.slate).ramp[0]).map((channel) => channel * 0.55);
  return {
    stone,
    roof,
    walls: (building) => {
      const finish = style.finishes[finishIndexFor(building.kind, building.variant) % style.finishes.length];
      return finish === 'masonry' ? stone : linear(PLASTER_PALETTES[finish].base).map((channel) => channel * 0.82);
    },
  };
}

/**
 * Settlements as distant massing (SettlementSkylineGeometry): one small mesh a
 * town, shown from where its instanced buildings stop being drawn out to a few
 * kilometres, so a city is on the horizon before it is underfoot.
 */
export class SettlementSkyline {
  constructor({ scene }) {
    this.root = new THREE.Group();
    this.root.name = 'settlement-skylines';
    scene.add(this.root);
    this.material = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide, flatShading: true });
    this.material.name = 'settlement-skyline';
    this.towns = new Map();
  }

  /**
   * Adopt the towns round `focus` and drop the ones left behind. Builds at most
   * one new skyline a call: planning a city takes a few milliseconds of its own.
   */
  refresh(field, focus, tileSize) {
    const near = field
      ? field.entriesNear(focus.x / tileSize, -focus.z / tileSize, SETTLEMENT_SKYLINE.radius / tileSize).slice(0, SETTLEMENT_SKYLINE.maxTowns)
      : [];
    const keep = new Set(near.map(({ entry }) => entry.settlement.id));
    for (const [id, town] of this.towns) {
      if (keep.has(id)) continue;
      town.mesh.geometry.dispose();
      town.mesh.removeFromParent();
      this.towns.delete(id);
    }
    const next = near.find(({ entry }) => !this.towns.has(entry.settlement.id));
    if (!next) return;
    const { settlement } = next.entry;
    const { plan } = field.ensurePlan(next.entry);
    const arrays = settlementSkylineArrays(plan, skylineColors(plan.profile.style));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(arrays.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(arrays.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(arrays.indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.name = `settlement-skyline-${settlement.id}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.skipWarmup = true;
    this.root.add(mesh);
    this.towns.set(settlement.id, { mesh, centre: { x: settlement.cellX * tileSize, z: -settlement.cellZ * tileSize } });
  }

  /** Place every skyline for this floating origin and show the ones far enough to need it. */
  update(focus, origin) {
    for (const { mesh, centre } of this.towns.values()) {
      mesh.position.set(centre.x - origin.x, 0, centre.z - origin.z);
      mesh.visible = Math.hypot(centre.x - focus.x, centre.z - focus.z) > SETTLEMENT_SKYLINE.near;
    }
  }

  clear() {
    for (const { mesh } of this.towns.values()) {
      mesh.geometry.dispose();
      mesh.removeFromParent();
    }
    this.towns.clear();
  }

  dispose() {
    this.clear();
    this.material.dispose();
    this.root.removeFromParent();
  }
}
