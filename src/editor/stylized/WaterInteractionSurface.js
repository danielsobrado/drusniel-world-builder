import * as THREE from 'three/webgpu';
import { abs, attribute, oneMinus, uv, vec3 } from 'three/tsl';
import { WaterInteractionState, WATER_INTERACTION_CAPACITY, WATER_INTERACTION_LIFETIME } from '../water/WaterInteractionState.js';
import { skyLightUniforms } from './sky/skyLight.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';

const SEGMENTS = 32;
const VERTICES_PER_RING = (SEGMENTS + 1) * 2;

/** One pooled batch; no viewport textures, render targets or per-splash objects. */
export class WaterInteractionSurface {
  constructor({ terrainView, player, config }) {
    this.view = terrainView; this.player = player; this.config = config;
    this.state = new WaterInteractionState(); this.status = {}; this.origin = {}; this.canonical = {};
    this.lastUpdate = -Infinity; this.generator = terrainView.worldStore.generator;
    const count = VERTICES_PER_RING * WATER_INTERACTION_CAPACITY;
    this.positions = new Float32Array(count * 3); this.opacity = new Float32Array(count);
    const uvs = new Float32Array(count * 2), indices = [];
    for (let ring = 0; ring < WATER_INTERACTION_CAPACITY; ring++) for (let segment = 0; segment <= SEGMENTS; segment++) {
      const vertex = ring * VERTICES_PER_RING + segment * 2;
      uvs.set([segment / SEGMENTS, 0, segment / SEGMENTS, 1], vertex * 2);
      if (segment < SEGMENTS) indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
    }
    this.geometry = new THREE.BufferGeometry(); this.geometry.setIndex(indices);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('waterRingAlpha', new THREE.BufferAttribute(this.opacity, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.material.colorNode = vec3(.48, .68, .66).mul(skyLightUniforms.brightness);
    this.material.opacityNode = attribute('waterRingAlpha').mul(oneMinus(abs(uv().y.mul(2).sub(1))));
    this.mesh = new THREE.Mesh(this.geometry, this.material); this.mesh.name = 'water-player-ripples';
    this.mesh.renderOrder = 3; this.mesh.frustumCulled = false; this.mesh.visible = false;
    terrainView.scene.add(this.mesh);
    terrainView.drawPreparation?.requestMaterial(this.mesh, this.material);
    this.release = player.subscribeWaterEvents(event => {
      if (!this.enabled || !this.active) return;
      const origin = terrainView.floatingOrigin.readState(this.origin);
      this.state.event(event, { x: player.state.x + origin.x, z: player.state.z + origin.z });
    });
  }
  get enabled() { return this.config.enabled !== false && this.config.qualityTier !== 'low' && this.config.interaction?.enabled !== false; }
  update(seconds, active = true) {
    const started = performance.now(); this.active = active;
    PerfCounters.set('waterInteractionCpuMs', 0);
    if (this.generator !== this.view.worldStore.generator) { this.state.clear(); this.generator = this.view.worldStore.generator; }
    this.player.readFrameStatus(this.status);
    const origin = this.view.floatingOrigin.readState(this.origin);
    this.canonical.x = this.status.position.x + origin.x; this.canonical.z = this.status.position.z + origin.z;
    const impulses = this.state.update(seconds, this.canonical, this.status, this.enabled && active);
    this.mesh.visible = this.enabled && impulses.length > 0;
    PerfCounters.set('waterInteractionActive', this.mesh.visible ? impulses.length : 0);
    if (!this.mesh.visible || seconds - this.lastUpdate < 1 / 30) return;
    this.lastUpdate = seconds; this.opacity.fill(0);
    for (let ring = 0; ring < impulses.length; ring++) {
      const impulse = impulses[ring], age = seconds - impulse.started;
      const radius = .15 + age * .85, width = .05 + age * .025;
      const alpha = impulse.strength * .4 * (1 - age / WATER_INTERACTION_LIFETIME) ** 2;
      for (let segment = 0; segment <= SEGMENTS; segment++) {
        const angle = segment / SEGMENTS * Math.PI * 2, dx = Math.cos(angle), dz = Math.sin(angle);
        const water = this.view.getCanonicalWater(impulse.x + dx * radius, impulse.z + dz * radius);
        const eligible = water.bodyId === impulse.bodyId && water.kind === impulse.kind && water.coverage > .5 && water.depth > .04;
        for (let edge = 0; edge < 2; edge++) {
          const vertex = ring * VERTICES_PER_RING + segment * 2 + edge, r = radius + (edge ? width : -width);
          this.positions.set([impulse.x + dx * r - origin.x, water.surfaceHeight + .035, impulse.z + dz * r - origin.z], vertex * 3);
          this.opacity[vertex] = eligible ? alpha : 0;
        }
      }
    }
    this.geometry.setDrawRange(0, impulses.length * SEGMENTS * 6);
    this.geometry.attributes.position.needsUpdate = true; this.geometry.attributes.waterRingAlpha.needsUpdate = true;
    PerfCounters.set('waterInteractionCpuMs', performance.now() - started);
  }
  dispose() { this.release?.(); this.state.clear(); this.view.scene.remove(this.mesh); this.geometry.dispose(); this.material.dispose(); }
}
