import * as THREE from 'three';
import { evaluateRamp, RAMP_KEYS } from '../atlas/rampPainter.js';
import { setSpellWorldLight } from './SpellWorldLight.js';
import { VFX_SHADER_LIGHT_COUNT } from './VfxLightingUniforms.js';

/** Light a smoke puff can take from one effect light (the shader term saturates toward it). */
const SHADER_LIGHT_CEILING = 2;

/**
 * Effect lights that spells borrow. There are two kinds:
 *
 * - Virtual slots (`count`, one per particle-shader light): every spell light
 *   lands in one, and all of them light the smoke and decals through uniforms.
 * - Scene lights (`sceneLights`, default 1): real point lights that light the
 *   world, handed each frame to the brightest active slots.
 *
 * Scene lights are added once, before the first shader compile, and are never
 * hidden — only dimmed to 0 — because changing the scene's light set recompiles
 * every lit material, terrain included. Each one costs every lit pixel of every
 * frame even at intensity 0: four measured ~3.5 % FPS and a worse p99 on
 * `qa:perf chunk-cross`, so the world gets one.
 *
 * None casts shadows: a point shadow adds a cube depth texture and comparison
 * sampler to every lit material, and the terrain is already at WebGPU's
 * 16-sampler cap (see memory: webgpu-sampler-limit-terrain).
 */
export function createEffectLightPool({ scene, lighting, count = VFX_SHADER_LIGHT_COUNT, sceneLights = 0 }) {
  const colour = [0, 0, 0, 0];
  const slots = Array.from({ length: count }, () => ({
    spec: null, age: 0, level: 0, power: 0, x: 0, y: -1e5, z: 0, r: 0, g: 0, b: 0,
  }));
  const worldLights = Array.from({ length: sceneLights }, (_, index) => {
    const light = new THREE.PointLight(0xffffff, 0, 10, 2);
    light.name = `vfx-light-${index}`;
    light.castShadow = false;
    light.position.set(0, -1e5, 0);
    scene.add(light);
    return light;
  });
  const ranked = [];

  const envelope = (spec, age) => {
    if (age < spec.attack) return age / Math.max(1e-4, spec.attack);
    const afterAttack = age - spec.attack;
    if (afterAttack < spec.hold) return 1;
    return Math.exp(-(afterAttack - spec.hold) * spec.decay);
  };

  /**
   * @param {object} spec
   * @param {{x:number,y:number,z:number}} spec.position copied, unless `follow` is set
   * @param {number[]} [spec.color] fixed linear colour
   * @param {number} [spec.ramp] colour follows this ramp as the light fades
   * @param {number} spec.intensity peak
   * @param {number} spec.range metres
   * @param {number} [spec.attack] seconds to peak
   * @param {number} [spec.hold] seconds at peak
   * @param {number} [spec.decay] exponential decay rate after hold
   * @param {number} [spec.flicker] 0..1
   * @param {() => {x:number,y:number,z:number} | null} [spec.follow]
   * @returns {{ release(): void, setPosition(x:number,y:number,z:number): void }}
   */
  const acquire = (spec) => {
    let chosen = slots.find((slot) => slot.spec === null);
    if (!chosen) chosen = slots.reduce((dimmest, slot) => (slot.level < dimmest.level ? slot : dimmest));
    chosen.spec = { attack: 0.02, hold: 0, decay: 4, flicker: 0, color: [1, 1, 1], ...spec };
    chosen.age = 0;
    chosen.x = spec.position?.x ?? 0;
    chosen.y = spec.position?.y ?? 0;
    chosen.z = spec.position?.z ?? 0;
    const owned = chosen.spec;
    return {
      release: () => {
        if (chosen.spec === owned) chosen.spec = { ...owned, hold: 0, attack: 0, decay: Math.max(owned.decay, 12) };
      },
      setPosition: (x, y, z) => {
        if (chosen.spec !== owned) return;
        chosen.x = x; chosen.y = y; chosen.z = z;
      },
    };
  };

  const update = (dt, time) => {
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      const position = lighting.lightPositionValues[index];
      const shaderColour = lighting.lightColorValues[index];
      if (!slot.spec) {
        slot.level = 0;
        slot.power = 0;
        position.set(0, -1e6, 0, 1);
        shaderColour.set(0, 0, 0, 0);
        continue;
      }
      slot.age += dt;
      const spec = slot.spec;
      const followed = spec.follow?.();
      if (followed) {
        slot.x = followed.x; slot.y = followed.y; slot.z = followed.z;
      }
      const flicker = spec.flicker > 0
        ? 1 - spec.flicker * 0.5 + spec.flicker * 0.5 * Math.sin(time * 37 + index * 2.1) * Math.sin(time * 23.3 + index)
        : 1;
      const level = envelope(spec, slot.age) * flicker;
      slot.level = level;
      if (level < 0.004 && slot.age > spec.attack + spec.hold) {
        slot.spec = null;
        slot.power = 0;
        position.set(0, -1e6, 0, 1);
        shaderColour.set(0, 0, 0, 0);
        continue;
      }
      if (spec.ramp !== undefined) evaluateRamp(RAMP_KEYS[spec.ramp], 0.3 + 0.7 * Math.min(1, level), colour);
      const [r, g, b] = spec.ramp !== undefined ? colour : spec.color;
      slot.r = r; slot.g = g; slot.b = b;
      slot.power = spec.intensity * level;
      // The shader term is unitless; scale so a 1-candela light reads sensibly,
      // easing toward a ceiling so a meteor's blast lights its smoke orange
      // instead of washing it out to cream.
      const shaderScale = SHADER_LIGHT_CEILING * (1 - Math.exp(-spec.intensity * level * 0.004 / SHADER_LIGHT_CEILING));
      position.set(slot.x, slot.y, slot.z, spec.range);
      shaderColour.set(r * shaderScale, g * shaderScale, b * shaderScale, 0);
    }
    assignWorldLights();
  };

  const brightest = { x: 0, y: 0, z: 0, power: 0, range: 0, r: 0, g: 0, b: 0 };

  /** The world's lights follow the brightest slots this frame. */
  const assignWorldLights = () => {
    ranked.length = 0;
    for (const slot of slots) if (slot.spec && slot.power > 0) ranked.push(slot);
    ranked.sort((a, b) => b.power - a.power);
    // Terrain and grass see the brightest one through the shader-level world light.
    const top = ranked[0];
    if (top) {
      Object.assign(brightest, { x: top.x, y: top.y, z: top.z, power: top.power, range: top.spec.range, r: top.r, g: top.g, b: top.b });
    }
    setSpellWorldLight(top ? brightest : null);
    worldLights.forEach((light, index) => {
      const slot = ranked[index];
      if (!slot) {
        light.intensity = 0;
        return;
      }
      light.color.setRGB(slot.r, slot.g, slot.b);
      light.intensity = slot.power;
      light.distance = slot.spec.range;
      light.position.set(slot.x, slot.y, slot.z);
    });
  };

  const shiftOrigin = (shiftX, shiftZ) => {
    for (const slot of slots) {
      slot.x -= shiftX;
      slot.z -= shiftZ;
    }
  };

  return {
    acquire,
    update,
    shiftOrigin,
    get activeCount() {
      return slots.filter((slot) => slot.spec !== null).length;
    },
    /** Visits every lit slot: `(x, y, z, power, range, r, g, b)`. */
    forEachLit(visit) {
      for (const slot of slots) {
        if (slot.spec && slot.power > 0) visit(slot.x, slot.y, slot.z, slot.power, slot.spec.range, slot.r, slot.g, slot.b);
      }
    },
    dispose() {
      setSpellWorldLight(null);
      for (const light of worldLights) scene.remove(light);
    },
  };
}
