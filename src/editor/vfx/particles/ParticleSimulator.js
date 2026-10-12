import { createNoise } from '../math/vfxNoise.js';
import { createRandom, ease, sampleRange, smoothstep } from '../math/vfxRandom.js';
import { COLLIDE, ORIENT } from './ParticleTypeRegistry.js';

const FLOAT_FIELDS = Object.freeze([
  'px', 'py', 'pz', 'vx', 'vy', 'vz', 'age', 'life', 'size0', 'size1', 'rot', 'spin',
  'heat0', 'heat1', 'emissive', 'opacity', 'tile', 'ax', 'ay', 'az', 'axLen',
  'anchorX', 'anchorY', 'anchorZ', 'groundY', 'trailAcc', 'tr', 'tg', 'tb', 'seed',
]);
const INT_FIELDS = Object.freeze(['type', 'flags']);
const FLAG_IMPACTED = 1;
const FLAG_RESTING = 2;
const GROUND_REFRESH_FRAMES = 6;
const MIN_STRETCH_SPEED = 0.05;

/**
 * Reusable spawn description. Recipes fill one and call `emit`; only the
 * fields they set differ from neutral defaults, so `reset()` between uses.
 */
export function createSpawnParams() {
  const params = {
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    sizeScale: 1, lifeScale: 1, heatScale: 1, emissiveScale: 1, opacityScale: 1,
    axisX: 0, axisY: 1, axisZ: 0, axisLength: 0,
    anchorX: 0, anchorY: 0, anchorZ: 0,
    tintR: 1, tintG: 1, tintB: 1,
    rotation: null,
  };
  params.reset = () => {
    params.vx = 0; params.vy = 0; params.vz = 0;
    params.sizeScale = 1; params.lifeScale = 1; params.heatScale = 1;
    params.emissiveScale = 1; params.opacityScale = 1;
    params.axisX = 0; params.axisY = 1; params.axisZ = 0; params.axisLength = 0;
    params.anchorX = params.x; params.anchorY = params.y; params.anchorZ = params.z;
    params.tintR = 1; params.tintG = 1; params.tintB = 1;
    params.rotation = null;
    return params;
  };
  return params;
}

/**
 * CPU particle simulator: dense struct-of-arrays, swap-remove on death,
 * sub-emitters (trails, impact and death bursts), terrain collision and a
 * smooth turbulence field. It knows nothing about rendering; see
 * ParticleBufferWriter for the GPU side.
 *
 * @param {object} deps
 * @param {ReturnType<import('./ParticleTypeRegistry.js').createParticleTypeRegistry>} deps.types
 * @param {(x: number, z: number) => number} [deps.groundHeight]
 * @param {number} [deps.capacity]
 */
export function createParticleSimulator(deps) {
  const capacity = deps.capacity ?? 8192;
  const types = deps.types;
  const groundHeight = deps.groundHeight ?? (() => -Infinity);
  const random = createRandom(deps.seed ?? 4242);
  const noise = createNoise(deps.seed ?? 4242);
  const state = {};
  for (const field of FLOAT_FIELDS) state[field] = new Float32Array(capacity);
  for (const field of INT_FIELDS) state[field] = new Uint16Array(capacity);
  const arrays = [...FLOAT_FIELDS, ...INT_FIELDS].map((field) => state[field]);
  const subSpawn = createSpawnParams();
  const turbulence = { x: 0, y: 0, z: 0 };
  let count = 0;
  let frame = 0;
  let time = 0;
  let dropped = 0;

  const emit = (typeIndex, params) => {
    if (count >= capacity) {
      dropped += 1;
      return -1;
    }
    const type = types.get(typeIndex);
    const i = count;
    count += 1;
    const sizeScale = params.sizeScale;
    state.type[i] = typeIndex;
    state.flags[i] = 0;
    state.px[i] = params.x; state.py[i] = params.y; state.pz[i] = params.z;
    state.vx[i] = params.vx; state.vy[i] = params.vy; state.vz[i] = params.vz;
    state.age[i] = 0;
    state.life[i] = Math.max(0.016, sampleRange(type.life, random) * params.lifeScale);
    state.size0[i] = sampleRange(type.size, random) * sizeScale;
    state.size1[i] = state.size0[i] * sampleRange(type.sizeEnd, random);
    state.rot[i] = params.rotation ?? random() * Math.PI * 2;
    state.spin[i] = sampleRange(type.spin, random) * (random() < 0.5 ? -1 : 1);
    state.heat0[i] = sampleRange(type.heat, random) * params.heatScale;
    state.heat1[i] = type.heatEnd * params.heatScale;
    state.emissive[i] = type.emissive * params.emissiveScale;
    state.opacity[i] = type.opacity * params.opacityScale;
    const [firstTile, lastTile] = type.tiles;
    state.tile[i] = type.tileMode === 'random'
      ? firstTile + Math.floor(random() * (lastTile - firstTile + 1))
      : firstTile;
    state.ax[i] = params.axisX; state.ay[i] = params.axisY; state.az[i] = params.axisZ;
    // 0 means "follow the size": cylindrical flames grow with the particle.
    state.axLen[i] = params.axisLength > 0 ? params.axisLength : 0;
    state.anchorX[i] = params.anchorX; state.anchorY[i] = params.anchorY; state.anchorZ[i] = params.anchorZ;
    state.groundY[i] = type.groundFade || type.collideCode !== COLLIDE.NONE
      ? groundHeight(params.x, params.z)
      : -Infinity;
    state.trailAcc[i] = random();
    state.seed[i] = random();
    state.tr[i] = params.tintR; state.tg[i] = params.tintG; state.tb[i] = params.tintB;
    return i;
  };

  const burst = (reference, i, normalUp) => {
    if (!reference) return;
    if (Array.isArray(reference)) {
      for (const entry of reference) burst(entry, i, normalUp);
      return;
    }
    const typeIndex = types.indexOf(reference.type);
    const amount = Math.round(sampleRange(reference.count ?? 1, random));
    for (let n = 0; n < amount; n += 1) {
      subSpawn.x = state.px[i]; subSpawn.y = state.py[i] + (reference.lift ?? 0); subSpawn.z = state.pz[i];
      subSpawn.reset();
      const speed = sampleRange(reference.speed ?? 0, random);
      random.direction(turbulence);
      if (normalUp && turbulence.y < 0) turbulence.y = -turbulence.y;
      subSpawn.vx = turbulence.x * speed + state.vx[i] * (reference.inherit ?? 0);
      subSpawn.vy = turbulence.y * speed + state.vy[i] * (reference.inherit ?? 0) + (reference.up ?? 0);
      subSpawn.vz = turbulence.z * speed + state.vz[i] * (reference.inherit ?? 0);
      subSpawn.sizeScale = reference.sizeScale ?? 1;
      subSpawn.heatScale = reference.heatScale ?? 1;
      emit(typeIndex, subSpawn);
    }
  };

  const kill = (i) => {
    count -= 1;
    if (i === count) return;
    for (const array of arrays) array[i] = array[count];
  };

  const integrate = (i, type, dt) => {
    if (type.gravity !== 0) state.vy[i] -= type.gravity * dt;
    if (type.turbulence > 0) {
      const scale = type.turbulenceScale;
      noise.turbulence3(state.px[i] * scale, state.py[i] * scale + time * 0.4, state.pz[i] * scale, turbulence);
      state.vx[i] += turbulence.x * type.turbulence * dt;
      state.vy[i] += turbulence.y * type.turbulence * dt;
      state.vz[i] += turbulence.z * type.turbulence * dt;
    }
    if (type.swirl !== 0 || type.attract !== 0) {
      const dx = state.px[i] - state.anchorX[i];
      const dz = state.pz[i] - state.anchorZ[i];
      const distance = Math.hypot(dx, dz) || 1;
      state.vx[i] += (-dz / distance * type.swirl - dx / distance * type.attract) * dt;
      state.vz[i] += (dx / distance * type.swirl - dz / distance * type.attract) * dt;
      if (type.attract !== 0) state.vy[i] += (state.anchorY[i] - state.py[i]) * type.attract * 0.3 * dt;
    }
    if (type.drag > 0) {
      const damping = Math.exp(-type.drag * dt);
      state.vx[i] *= damping; state.vy[i] *= damping; state.vz[i] *= damping;
    }
    state.px[i] += state.vx[i] * dt;
    state.py[i] += state.vy[i] * dt;
    state.pz[i] += state.vz[i] * dt;
    state.rot[i] += state.spin[i] * dt;
    if (type.spinDrag > 0) state.spin[i] *= Math.exp(-type.spinDrag * dt);
  };

  /** @returns {boolean} false when the particle died on contact */
  const collide = (i, type) => {
    if (type.collideCode === COLLIDE.NONE) {
      if (type.groundFade && (frame + i) % GROUND_REFRESH_FRAMES === 0) {
        state.groundY[i] = groundHeight(state.px[i], state.pz[i]);
      }
      return true;
    }
    const ground = groundHeight(state.px[i], state.pz[i]);
    state.groundY[i] = ground;
    const radius = type.collideCode === COLLIDE.BOUNCE ? currentSize(i, type) * 0.3 : 0;
    if (state.py[i] - radius > ground) return true;
    state.py[i] = ground + radius;
    if ((state.flags[i] & FLAG_IMPACTED) === 0) {
      state.flags[i] |= FLAG_IMPACTED;
      burst(type.onImpact, i, true);
    }
    if (type.collideCode === COLLIDE.DIE) return false;
    if (type.collideCode === COLLIDE.STICK || (state.flags[i] & FLAG_RESTING) !== 0) {
      state.vx[i] = 0; state.vy[i] = 0; state.vz[i] = 0; state.spin[i] = 0;
      return true;
    }
    state.vy[i] = Math.abs(state.vy[i]) * type.restitution;
    state.vx[i] *= type.friction;
    state.vz[i] *= type.friction;
    state.spin[i] *= type.friction;
    if (state.vy[i] < 0.6) {
      // Too slow to bounce again: settle where it lies.
      state.flags[i] |= FLAG_RESTING;
      state.vx[i] = 0; state.vy[i] = 0; state.vz[i] = 0; state.spin[i] = 0;
    }
    return true;
  };

  const currentSize = (i, type) => {
    const t = state.age[i] / state.life[i];
    return state.size0[i] + (state.size1[i] - state.size0[i]) * ease(type.sizeEase, t);
  };

  const emitTrail = (i, type, dt) => {
    const trail = type.trail;
    state.trailAcc[i] += trail.rate * dt;
    if (state.trailAcc[i] < 1) return;
    const typeIndex = types.indexOf(trail.type);
    const fade = 1 - state.age[i] / state.life[i];
    while (state.trailAcc[i] >= 1) {
      state.trailAcc[i] -= 1;
      subSpawn.x = state.px[i]; subSpawn.y = state.py[i]; subSpawn.z = state.pz[i];
      subSpawn.reset();
      const spread = trail.spread ?? 0;
      subSpawn.vx = state.vx[i] * (trail.inherit ?? 0) + random.signed() * spread;
      subSpawn.vy = state.vy[i] * (trail.inherit ?? 0) + random.signed() * spread + (trail.up ?? 0);
      subSpawn.vz = state.vz[i] * (trail.inherit ?? 0) + random.signed() * spread;
      subSpawn.sizeScale = (trail.sizeScale ?? 1) * (trail.shrink ? 0.35 + 0.65 * fade : 1);
      subSpawn.heatScale = trail.heatScale ?? 1;
      subSpawn.tintR = state.tr[i]; subSpawn.tintG = state.tg[i]; subSpawn.tintB = state.tb[i];
      emit(typeIndex, subSpawn);
    }
  };

  const update = (dt) => {
    if (!(dt > 0)) return;
    frame += 1;
    time += dt;
    let i = 0;
    while (i < count) {
      const type = types.get(state.type[i]);
      state.age[i] += dt;
      if (state.age[i] >= state.life[i]) {
        burst(type.onDeath, i, false);
        kill(i);
        continue;
      }
      if ((state.flags[i] & FLAG_RESTING) === 0 || type.collideCode === COLLIDE.NONE) integrate(i, type, dt);
      if (!collide(i, type)) {
        kill(i);
        continue;
      }
      if (type.trail) emitTrail(i, type, dt);
      i += 1;
    }
  };

  /** Moves every live particle when the floating origin snaps. */
  const shiftOrigin = (shiftX, shiftZ) => {
    for (let n = 0; n < count; n += 1) {
      state.px[n] -= shiftX; state.pz[n] -= shiftZ;
      state.anchorX[n] -= shiftX; state.anchorZ[n] -= shiftZ;
    }
  };

  /**
   * Writes the per-particle look at its current age into `out` (an object
   * reused by the buffer writer). Keeps the age curves in one place.
   */
  const evaluate = (i, out) => {
    const type = types.get(state.type[i]);
    const t = Math.min(1, state.age[i] / state.life[i]);
    const heatT = ease(type.heatEase, t);
    out.lifeT = t;
    out.seed = state.seed[i];
    out.size = state.size0[i] + (state.size1[i] - state.size0[i]) * ease(type.sizeEase, t);
    out.heat = state.heat0[i] + (state.heat1[i] - state.heat0[i]) * heatT;
    out.additive = type.additive + (type.additiveEnd - type.additive) * heatT;
    out.alpha = state.opacity[i]
      * (type.fadeIn > 0 ? smoothstep(0, type.fadeIn, t) : 1)
      * (1 - smoothstep(type.fadeOut, 1, t));
    if (type.groundFade) {
      const clearance = state.py[i] - state.groundY[i];
      // Only where the sprite's centre nears the ground; big puffs must not vanish.
      out.alpha *= smoothstep(-out.size * 0.3, out.size * 0.12, clearance);
    }
    out.tile = type.tileMode === 'life'
      ? type.tiles[0] + (type.tiles[1] - type.tiles[0]) * t
      : state.tile[i];
    out.r = (type.tint[0] + (type.tintEnd[0] - type.tint[0]) * t) * state.tr[i];
    out.g = (type.tint[1] + (type.tintEnd[1] - type.tint[1]) * t) * state.tg[i];
    out.b = (type.tint[2] + (type.tintEnd[2] - type.tint[2]) * t) * state.tb[i];
    out.orient = type.orientCode;
    out.axLen = state.axLen[i] > 0
      ? state.axLen[i] * (1 + (type.axisGrow - 1) * ease(type.sizeEase, t))
      : out.size * type.aspect;
    out.ax = state.ax[i]; out.ay = state.ay[i]; out.az = state.az[i];
    if (type.orientCode === ORIENT.VELOCITY) {
      const speed = Math.hypot(state.vx[i], state.vy[i], state.vz[i]);
      out.orient = ORIENT.AXIS;
      if (speed > MIN_STRETCH_SPEED) {
        out.ax = state.vx[i] / speed; out.ay = state.vy[i] / speed; out.az = state.vz[i] / speed;
        state.ax[i] = out.ax; state.ay[i] = out.ay; state.az[i] = out.az;
      }
      out.axLen = out.size * type.aspect + speed * type.stretch;
    }
    return type;
  };

  return {
    state,
    emit,
    update,
    evaluate,
    shiftOrigin,
    clear: () => { count = 0; },
    get count() { return count; },
    get capacity() { return capacity; },
    get dropped() { return dropped; },
    random,
  };
}
