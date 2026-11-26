import * as THREE from 'three';
import {
  createFireballImpactDomeMaterial,
  createFireballNodeMaterial,
  createFireballShockRingMaterial,
  createFireballTrailMaterial,
  createFireballWakeMaterial,
} from './fireball_node_material.js';

const COLLISION_STEP_SECONDS = 0.05;
const TRAIL_SPACING_SECONDS = 0.026;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const TRAIL_AXIS = new THREE.Vector3(0, 0, 1);
const WAKE_AXIS = new THREE.Vector3(0, 1, 0);

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}
function seeded01(index, salt) {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}
function spellColor(color) {
  return new THREE.Color(color[0], color[1], color[2]);
}
function additiveMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color: spellColor(color),
    transparent: true,
    opacity,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexColors: true,
  });
}
function computeFireballPosition(origin, velocity, gravity, elapsedSeconds, target = new THREE.Vector3()) {
  const t = Math.max(0, elapsedSeconds);
  return target.copy(origin).addScaledVector(velocity, t).addScaledVector(WORLD_UP, -0.5 * Math.max(0, gravity) * t * t);
}
function findFireballTerrainImpact(start, end, radius, raycastTerrain) {
  const delta = end.clone().sub(start);
  const distance = delta.length();
  if (distance <= 1e-6) return null;
  const ray = new THREE.Ray(
    start.clone().addScaledVector(WORLD_UP, -Math.max(0, radius)),
    delta.multiplyScalar(1 / distance),
  );
  const hit = raycastTerrain(ray);
  if (!hit || !Number.isFinite(hit.distance) || hit.distance < 0 || hit.distance > distance + 1e-4) return null;
  return hit;
}
function createSparkStates(count) {
  return Array.from({ length: count }, (_, index) => ({
    angle: index * 2.399963229728653 + seeded01(index, 1) * 0.5,
    speed: 3.8 + seeded01(index, 2) * 8.4,
    lift: 4.2 + seeded01(index, 3) * 7.0,
    size: 0.032 + seeded01(index, 5) * 0.065,
  }));
}

function createFireballSpellVfx(deps) {
  const { scene, config } = deps;
  const now = deps.now ?? (() => performance.now());

  const projectile = new THREE.Group();
  projectile.name = 'fireball-spell-projectile';
  projectile.visible = false;
  scene.add(projectile);

  const sphereGeometry = new THREE.IcosahedronGeometry(1, 3);
  const coreMaterial = additiveMaterial([1, 0.96, 0.78], 0.98);
  coreMaterial.vertexColors = false;
  const core = new THREE.Mesh(sphereGeometry, coreMaterial);
  core.name = 'fireball-spell-core';
  core.scale.setScalar(config.projectileRadius * 0.64);
  core.renderOrder = 4200;
  projectile.add(core);

  const shellHandle = createFireballNodeMaterial(config.coreColor, config.glowColor);
  const shell = new THREE.Mesh(sphereGeometry, shellHandle.material);
  shell.name = 'fireball-spell-shell';
  shell.scale.setScalar(config.projectileRadius * 1.24);
  shell.renderOrder = 4201;
  projectile.add(shell);

  // Velocity-aligned roaring flame wake streaming behind the boiling plasma sphere.
  const wakeLength = config.projectileRadius * 4.4;
  const wakeGeometry = new THREE.ConeGeometry(config.projectileRadius * 1.15, wakeLength, 16, 4, true);
  wakeGeometry.translate(0, wakeLength * 0.42, 0);
  const wakeHandle = createFireballWakeMaterial(config.coreColor, config.glowColor);
  const wake = new THREE.Mesh(wakeGeometry, wakeHandle.material);
  wake.name = 'fireball-spell-wake';
  wake.renderOrder = 4200;
  wake.visible = false;
  scene.add(wake);

  const projectileLight = new THREE.PointLight(
    spellColor(config.glowColor),
    config.glowIntensity,
    config.glowDistance,
    config.glowDecay,
  );
  projectileLight.name = 'fireball-spell-projectile-light';
  projectile.add(projectileLight);

  const trailCapacity = Math.max(1, Math.floor(config.trailCount));
  const trailGeometry = new THREE.IcosahedronGeometry(1, 1);
  const trailHandle = createFireballTrailMaterial(config.coreColor, config.glowColor);
  const trail = new THREE.InstancedMesh(trailGeometry, trailHandle.material, trailCapacity);
  trail.name = 'fireball-spell-trail';
  trail.count = Math.max(0, Math.floor(config.trailCount));
  trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trail.frustumCulled = false;
  trail.renderOrder = 4199;
  trail.visible = false;
  for (let index = 0; index < trail.count; index++) {
    const t = trail.count <= 1 ? 0 : index / (trail.count - 1);
    const cool = new THREE.Color(1, 0.94, 0.72).lerp(spellColor(config.glowColor), Math.min(1, t * 1.25));
    cool.multiplyScalar(1 - t * 0.55);
    trail.setColorAt(index, cool);
  }
  if (trail.instanceColor) trail.instanceColor.needsUpdate = true;
  scene.add(trail);

  const impact = new THREE.Group();
  impact.name = 'fireball-spell-impact';
  impact.visible = false;
  scene.add(impact);

  const flashGeometry = new THREE.IcosahedronGeometry(1, 3);
  const flashHandle = createFireballImpactDomeMaterial(config.coreColor, config.glowColor);
  const flash = new THREE.Mesh(flashGeometry, flashHandle.material);
  flash.name = 'fireball-spell-impact-flash';
  flash.renderOrder = 4302;
  impact.add(flash);

  const ringGeometry = new THREE.PlaneGeometry(2, 2);
  const ringHandle = createFireballShockRingMaterial(config.coreColor, config.glowColor);
  const ring = new THREE.Mesh(ringGeometry, ringHandle.material);
  ring.name = 'fireball-spell-impact-ring';
  ring.renderOrder = 4300;
  impact.add(ring);

  const sparkCapacity = Math.max(1, Math.floor(config.sparkCount));
  const sparkGeometry = new THREE.OctahedronGeometry(1, 0);
  const sparkMaterial = additiveMaterial([1, 0.92, 0.58], 0);
  sparkMaterial.vertexColors = false;
  const sparks = new THREE.InstancedMesh(sparkGeometry, sparkMaterial, sparkCapacity);
  sparks.name = 'fireball-spell-impact-sparks';
  sparks.count = Math.max(0, Math.floor(config.sparkCount));
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparks.frustumCulled = false;
  sparks.renderOrder = 4301;
  impact.add(sparks);

  const impactLight = new THREE.PointLight(
    spellColor(config.glowColor),
    0,
    config.glowDistance * 1.45,
    config.glowDecay,
  );
  impactLight.name = 'fireball-spell-impact-light';
  impactLight.position.y = 0.7;
  impactLight.visible = false;
  impact.add(impactLight);

  const sparkStates = createSparkStates(sparks.count);
  const state = {
    phase: 'idle',
    startMs: 0,
    durationMs: 1,
    previousElapsedSeconds: 0,
    impactStartMs: 0,
    origin: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
  };

  const previousPosition = new THREE.Vector3();
  const nextPosition = new THREE.Vector3();
  const trailPosition = new THREE.Vector3();
  const trailDirection = new THREE.Vector3();
  const wakeDirection = new THREE.Vector3();
  const sparkVelocity = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const sparkPosition = new THREE.Vector3();
  const ringNormal = new THREE.Vector3(0, 0, 1);

  const hide = () => {
    state.phase = 'idle';
    projectile.visible = false;
    wake.visible = false;
    projectileLight.visible = false;
    projectileLight.intensity = 0;
    trail.visible = false;
    impact.visible = false;
    impactLight.visible = false;
    impactLight.intensity = 0;
  };

  const updateTrail = (elapsedSeconds) => {
    const available = Math.min(
      Math.floor(config.trailCount),
      Math.max(1, Math.floor(elapsedSeconds / TRAIL_SPACING_SECONDS) + 1),
    );
    trail.count = Math.max(0, available);
    trail.visible = trail.count > 0;
    trailHandle.uTime.value = elapsedSeconds;
    for (let index = 0; index < trail.count; index++) {
      const sampleTime = Math.max(0, elapsedSeconds - index * TRAIL_SPACING_SECONDS);
      computeFireballPosition(state.origin, state.velocity, config.gravity, sampleTime, trailPosition);
      const tail = trail.count <= 1 ? 0 : index / (trail.count - 1);
      // Gentle buoyancy curl and swirl so the fiery wake billows instead of forming a rigid line.
      const swirlAngle = index * 1.7 + elapsedSeconds * 7.5;
      const spread = config.projectileRadius * 0.42 * tail;
      trailPosition.x += Math.cos(swirlAngle) * spread;
      trailPosition.y += tail * tail * 0.48 + Math.sin(swirlAngle * 1.3) * spread * 0.6;
      trailPosition.z += Math.sin(swirlAngle) * spread;

      const jitter = 0.85 + seeded01(index, Math.floor(elapsedSeconds * 18)) * 0.3;
      const radius = config.projectileRadius * (0.42 + tail * 0.38) * (1 - tail * 0.55) * jitter;
      trailDirection.copy(state.velocity).addScaledVector(WORLD_UP, -config.gravity * sampleTime).normalize();
      rotation.setFromUnitVectors(TRAIL_AXIS, trailDirection);
      scale.set(
        Math.max(0.03, radius * 0.88),
        Math.max(0.03, radius * 0.88),
        Math.max(0.05, radius * (1.75 - tail * 0.65)),
      );
      matrix.compose(trailPosition, rotation, scale);
      trail.setMatrixAt(index, matrix);
    }
    trail.instanceMatrix.needsUpdate = true;
  };

  const beginImpact = (hit, impactAtMs) => {
    state.phase = 'impact';
    state.impactStartMs = impactAtMs;
    projectile.visible = false;
    wake.visible = false;
    projectileLight.visible = false;
    projectileLight.intensity = 0;
    trail.visible = false;
    impact.position.copy(hit.point);
    const normal = hit.normal?.clone().normalize() ?? WORLD_UP;
    ring.quaternion.setFromUnitVectors(ringNormal, normal);
    ring.position.copy(normal).multiplyScalar(0.08);
    impact.visible = true;
    impactLight.visible = true;
  };

  const updateImpact = (nowMs) => {
    const elapsedMs = Math.max(0, nowMs - state.impactStartMs);
    const progress = elapsedMs / Math.max(1, config.impactDurationMs);
    if (progress >= 1) {
      hide();
      return;
    }
    const p = clamp01(progress);
    const seconds = elapsedMs / 1e3;
    const fade = 1 - smoothstep(0.45, 1, p);

    flashHandle.uTime.value = seconds;
    flashHandle.uProgress.value = p;
    flash.scale.setScalar(config.impactRadius * (0.16 + smoothstep(0, 0.58, p) * 0.56));
    flash.position.y = config.impactRadius * 0.14 * smoothstep(0, 0.7, p);

    ringHandle.uTime.value = seconds;
    ringHandle.uProgress.value = p;
    ring.scale.setScalar(config.impactRadius * (0.28 + smoothstep(0, 0.85, p) * 1.05));

    sparkMaterial.opacity = 1 - smoothstep(0.55, 1, p);
    const flicker = 0.88 + Math.sin(seconds * 34) * 0.12;
    impactLight.intensity = config.glowIntensity * 1.85 * (1 - smoothstep(0.04, 0.88, p)) * flicker;

    for (let index = 0; index < sparkStates.length; index++) {
      const spark = sparkStates[index];
      const cosA = Math.cos(spark.angle);
      const sinA = Math.sin(spark.angle);
      const vx = cosA * spark.speed;
      const vy = spark.lift - config.gravity * seconds;
      const vz = sinA * spark.speed;
      sparkPosition.set(
        vx * seconds,
        Math.max(0.04, 0.14 + spark.lift * seconds - 0.5 * config.gravity * seconds * seconds),
        vz * seconds,
      );
      sparkVelocity.set(vx, vy, vz);
      const speed = sparkVelocity.length();
      if (speed > 1e-4) {
        sparkVelocity.multiplyScalar(1 / speed);
        rotation.setFromUnitVectors(TRAIL_AXIS, sparkVelocity);
      } else {
        rotation.identity();
      }
      const width = spark.size * Math.max(0.15, fade);
      scale.set(width, width, width * (1.8 + Math.min(6, speed * 0.35)));
      matrix.compose(sparkPosition, rotation, scale);
      sparks.setMatrixAt(index, matrix);
    }
    sparks.instanceMatrix.needsUpdate = true;
  };

  const updateFlight = (nowMs) => {
    const maxFlightSeconds = Math.max(1e-3, (state.durationMs - config.impactDurationMs) / 1e3);
    const elapsedSeconds = Math.min(maxFlightSeconds, Math.max(0, (nowMs - state.startMs) / 1e3));
    let stepStart = state.previousElapsedSeconds;
    computeFireballPosition(state.origin, state.velocity, config.gravity, stepStart, previousPosition);
    while (stepStart < elapsedSeconds - 1e-8) {
      const stepEnd = Math.min(elapsedSeconds, stepStart + COLLISION_STEP_SECONDS);
      computeFireballPosition(state.origin, state.velocity, config.gravity, stepEnd, nextPosition);
      const hit = findFireballTerrainImpact(
        previousPosition,
        nextPosition,
        config.projectileRadius,
        deps.raycastTerrain,
      );
      if (hit) {
        const segmentLength = previousPosition.distanceTo(nextPosition);
        const fraction = segmentLength > 1e-6 ? clamp01(hit.distance / segmentLength) : 0;
        const impactAtMs = state.startMs + (stepStart + (stepEnd - stepStart) * fraction) * 1e3;
        beginImpact(hit, impactAtMs);
        updateImpact(nowMs);
        return;
      }
      previousPosition.copy(nextPosition);
      stepStart = stepEnd;
    }
    state.previousElapsedSeconds = elapsedSeconds;
    projectile.position.copy(previousPosition);
    projectile.rotation.set(elapsedSeconds * 2.1, elapsedSeconds * 2.7, elapsedSeconds * 1.5);
    const pulse = 1 + Math.sin(elapsedSeconds * 21) * 0.055;
    projectile.scale.setScalar(pulse);
    shellHandle.uTime.value = elapsedSeconds;
    shellHandle.uOpacity.value = 0.98;

    // Orient the flame wake opposite the instantaneous velocity vector.
    wakeDirection.copy(state.velocity).addScaledVector(WORLD_UP, -config.gravity * elapsedSeconds);
    if (wakeDirection.lengthSq() > 1e-6) {
      wakeDirection.normalize().negate();
      wake.position.copy(previousPosition);
      wake.quaternion.setFromUnitVectors(WAKE_AXIS, wakeDirection);
      wake.visible = true;
      wakeHandle.uTime.value = elapsedSeconds;
      wakeHandle.uOpacity.value = 0.95;
    }

    projectileLight.intensity = config.glowIntensity * (0.9 + Math.sin(elapsedSeconds * 25) * 0.12);
    updateTrail(elapsedSeconds);
    if (elapsedSeconds >= maxFlightSeconds) hide();
  };

  hide();
  return {
    play: (durationMs) => {
      const source = deps.getSource();
      const direction = source.direction.clone();
      if (direction.lengthSq() < 1e-8) direction.set(0, 0, -1);
      direction.normalize();
      state.startMs = now();
      state.durationMs = Math.max(config.impactDurationMs + 1, durationMs);
      state.previousElapsedSeconds = 0;
      state.origin.copy(source.point);
      state.velocity.copy(direction).multiplyScalar(config.launchSpeed).addScaledVector(WORLD_UP, config.liftSpeed);
      state.phase = 'flight';
      projectile.position.copy(state.origin);
      projectile.rotation.set(0, 0, 0);
      projectile.scale.setScalar(1);
      projectile.visible = true;
      wake.position.copy(state.origin);
      wake.visible = true;
      projectileLight.visible = true;
      projectileLight.intensity = config.glowIntensity;
      trail.visible = config.trailCount > 0;
      impact.visible = false;
      impactLight.visible = false;
      impactLight.intensity = 0;
      shellHandle.uTime.value = 0;
      shellHandle.uOpacity.value = 0.98;
      wakeHandle.uTime.value = 0;
      wakeHandle.uOpacity.value = 0.95;
      trailHandle.uTime.value = 0;
    },
    update: (nowMs) => {
      if (state.phase === 'flight') updateFlight(nowMs);
      else if (state.phase === 'impact') updateImpact(nowMs);
    },
    dispose: () => {
      scene.remove(projectile);
      scene.remove(wake);
      scene.remove(trail);
      scene.remove(impact);
      sphereGeometry.dispose();
      coreMaterial.dispose();
      shellHandle.material.dispose();
      wakeGeometry.dispose();
      wakeHandle.material.dispose();
      trailGeometry.dispose();
      trailHandle.material.dispose();
      flashGeometry.dispose();
      flashHandle.material.dispose();
      ringGeometry.dispose();
      ringHandle.material.dispose();
      sparkGeometry.dispose();
      sparkMaterial.dispose();
    },
  };
}

export {
  computeFireballPosition,
  createFireballSpellVfx,
  findFireballTerrainImpact,
};
