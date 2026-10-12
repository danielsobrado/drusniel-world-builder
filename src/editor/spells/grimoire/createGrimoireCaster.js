import * as THREE from 'three';
import { findGrimoireSpell } from './grimoireCatalog.js';

const EYE_HEIGHT_M = 1.65;
const HAND = Object.freeze({ forward: 0.6, right: 0.32, up: -0.32 });
const THIRD_PERSON_GAP_M = 1.2;
const CHARACTER_HAND = Object.freeze({ forward: 0.55, right: 0.28, up: 1.35 });

function plain(vector) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

/**
 * Resolves where a grimoire spell starts and lands — hand, aim, target,
 * caster's feet — and hands that context to the VFX recipe.
 *
 * @param {object} deps
 * @param {ReturnType<import('../../vfx/VfxSystem.js').createVfxSystem>} deps.vfx
 * @param {() => THREE.Camera} deps.getCamera
 * @param {(ray: THREE.Ray, maxRange: number) => ({ point: THREE.Vector3, normal?: THREE.Vector3 } | null)} deps.raycastTerrain
 * @param {(x: number, z: number) => number} deps.groundHeight
 * @param {() => ({ x: number, y: number, z: number } | null)} [deps.getCasterFeet]
 */
export function createGrimoireCaster(deps) {
  const ray = new THREE.Ray();
  const aim = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const eye = new THREE.Vector3();

  const resolveCaster = (camera) => {
    const feet = deps.getCasterFeet?.();
    if (feet && Number.isFinite(feet.x)) return { feet: { ...feet }, thirdPerson: Math.hypot(feet.x - eye.x, feet.z - eye.z) > THIRD_PERSON_GAP_M };
    return { feet: { x: eye.x, y: deps.groundHeight(eye.x, eye.z), z: eye.z }, thirdPerson: false };
  };

  const resolveHand = (caster) => {
    if (caster.thirdPerson) {
      return {
        x: caster.feet.x + forward.x * CHARACTER_HAND.forward + right.x * CHARACTER_HAND.right,
        y: caster.feet.y + CHARACTER_HAND.up,
        z: caster.feet.z + forward.z * CHARACTER_HAND.forward + right.z * CHARACTER_HAND.right,
      };
    }
    return {
      x: eye.x + aim.x * HAND.forward + right.x * HAND.right + up.x * HAND.up,
      y: eye.y + aim.y * HAND.forward + right.y * HAND.right + up.y * HAND.up,
      z: eye.z + aim.z * HAND.forward + right.z * HAND.right + up.z * HAND.up,
    };
  };

  /** The spell's context, or null when it has nowhere to land. */
  const resolveContext = (spell) => {
    const camera = deps.getCamera();
    camera.updateMatrixWorld();
    camera.getWorldPosition(eye);
    camera.getWorldDirection(aim).normalize();
    forward.set(aim.x, 0, aim.z);
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    right.crossVectors(forward, worldUp).normalize();
    up.crossVectors(right, aim).normalize();
    const caster = resolveCaster(camera);
    const origin = resolveHand(caster);
    let target = null;
    let normal = { x: 0, y: 1, z: 0 };
    if (spell.targeting !== 'self') {
      ray.origin.copy(eye);
      ray.direction.copy(aim);
      const range = spell.rangeM + (caster.thirdPerson ? Math.hypot(caster.feet.x - eye.x, caster.feet.z - eye.z) : 0);
      const hit = deps.raycastTerrain(ray, range);
      if (hit) {
        target = plain(hit.point);
        if (hit.normal) normal = plain(hit.normal);
      } else {
        target = { x: eye.x + aim.x * range, y: eye.y + aim.y * range, z: eye.z + aim.z * range };
      }
    } else {
      target = { ...caster.feet };
    }
    // Aim from the hand, not the eye, so lines and cones leave the hand.
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dz = target.z - origin.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    return {
      origin,
      target,
      normal,
      direction: spell.targeting === 'cone' ? plain(aim) : { x: dx / length, y: dy / length, z: dz / length },
      forward: plain(forward),
      right: plain(right),
      caster: caster.feet,
      eyeHeight: EYE_HEIGHT_M,
    };
  };

  return {
    resolveContext,
    /** @returns {boolean} whether the spell was cast */
    cast(spellId) {
      const spell = findGrimoireSpell(spellId);
      if (!spell) return false;
      const context = resolveContext(spell);
      if (!context) return false;
      return deps.vfx.play(spell.recipe, context);
    },
  };
}
