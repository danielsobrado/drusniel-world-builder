import * as THREE from 'three/webgpu';

import { interiorContains } from './TownLayout.js';

const LIGHT_POOL = 4;
const LIGHT_RANGE = 28;
const WARM = new THREE.Color(1.0, 0.66, 0.36);

/**
 * What changes when you step indoors.
 *
 * Inside a building the god rays switch to the volumetric technique, which ray
 * marches the sun's shadow map: walls and roofs cast it, the translucent panes
 * do not, so shafts of light fall through the windows into the room. Leaving
 * restores whatever the player had. A small pool of warm point lights follows
 * the lanterns and hearths nearest the walker.
 */
export class TownInteriorAtmosphere {
  constructor({ scene, godRays, streamer, floatingOrigin }) {
    this.godRays = godRays;
    this.streamer = streamer;
    this.floatingOrigin = floatingOrigin;
    this.inside = null;
    this.saved = null;
    this.lights = Array.from({ length: LIGHT_POOL }, () => {
      const light = new THREE.PointLight(WARM, 0, 9, 2);
      light.castShadow = false;
      scene.add(light);
      return light;
    });
  }

  findInterior(position) {
    for (const town of this.streamer.towns.values()) {
      for (const interior of town.layout.interiors) {
        if (interiorContains(interior, town.layout.anchor, position.x, position.y, position.z)) {
          return interior;
        }
      }
    }
    return null;
  }

  update(position) {
    const interior = position ? this.findInterior(position) : null;
    if (Boolean(interior) !== Boolean(this.inside)) this.setIndoors(Boolean(interior));
    this.inside = interior;
    this.placeLights(position);
  }

  setIndoors(indoors) {
    if (!this.godRays?.setSettings) return;
    if (indoors) {
      const { enabled, technique } = this.godRays.getSettings();
      this.saved = { enabled, technique };
      this.godRays.setSettings({ enabled: true, technique: 'volumetric' });
    } else if (this.saved) {
      this.godRays.setSettings(this.saved);
      this.saved = null;
    }
  }

  placeLights(position) {
    const candidates = [];
    if (position) {
      for (const town of this.streamer.towns.values()) {
        const { anchor } = town.layout;
        for (const light of town.layout.lights) {
          const x = anchor.x + light.position[0];
          const z = anchor.z + light.position[2];
          const distance = Math.hypot(x - position.x, light.position[1] - position.y, z - position.z);
          if (distance < LIGHT_RANGE) candidates.push({ x, y: light.position[1], z, distance, light });
        }
      }
      candidates.sort((left, right) => left.distance - right.distance);
    }
    const origin = this.floatingOrigin.getState();
    this.lights.forEach((light, index) => {
      const candidate = candidates[index];
      light.visible = Boolean(candidate);
      if (!candidate) return;
      light.position.set(candidate.x - origin.x, candidate.y, candidate.z - origin.z);
      light.intensity = candidate.light.energy >= 80 ? 6 : 3;
      light.distance = candidate.light.energy >= 80 ? 10 : 7;
    });
  }

  dispose() {
    if (this.inside) this.setIndoors(false);
    for (const light of this.lights) light.removeFromParent();
  }
}
