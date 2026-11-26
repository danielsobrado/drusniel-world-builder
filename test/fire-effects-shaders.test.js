import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { createFlameEmbers, createFlames } from '../src/editor/locations/LocationEffects.js';
import { createFireNodeMaterial } from '../src/editor/spells/fire_node_material.js';
import {
  createFireballImpactDomeMaterial,
  createFireballNodeMaterial,
  createFireballShockRingMaterial,
  createFireballTrailMaterial,
  createFireballWakeMaterial,
} from '../src/editor/spells/fireball_node_material.js';
import { createFireballSpellVfx } from '../src/editor/spells/fireball_spell_vfx.js';
import { defaultSpellConfig } from '../src/editor/spells/spell_config.js';
import { createParticleAtlasTexture } from '../src/editor/vfx/atlas/ParticleAtlasBaker.js';
import { createEffectDirector } from '../src/editor/vfx/effects/EffectDirector.js';
import { PARTICLE_STREAMS } from '../src/editor/vfx/particles/ParticleBufferWriter.js';
import { createParticleSimulator } from '../src/editor/vfx/particles/ParticleSimulator.js';
import { EFFECT_RECIPES } from '../src/editor/vfx/recipes/index.js';
import { createParticleMaterial } from '../src/editor/vfx/render/ParticleMaterial.js';
import { createVfxLightingUniforms } from '../src/editor/vfx/render/VfxLightingUniforms.js';
import { createSpellParticleTypes } from '../src/editor/vfx/types/index.js';
import { buildShader } from './helpers/buildShader.js';

test('all fire TSL materials compile cleanly to WGSL within texture limits', () => {
  const quad = new THREE.PlaneGeometry(1, 1);
  const sphere = new THREE.IcosahedronGeometry(1, 2);
  const cone = new THREE.ConeGeometry(0.5, 1.5, 12, 2, true);

  // Particle material (VFX stack: fireball, wall of fire, meteor swarm, bog vents)
  const atlas = createParticleAtlasTexture();
  const lighting = createVfxLightingUniforms();
  const instanced = new THREE.InstancedBufferGeometry();
  instanced.index = quad.index;
  instanced.setAttribute('position', quad.getAttribute('position'));
  instanced.setAttribute('uv', quad.getAttribute('uv'));
  for (const name of PARTICLE_STREAMS) {
    instanced.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(4), 4));
  }
  instanced.instanceCount = 1;
  const particleMat = createParticleMaterial({ atlas, lighting });

  // Location flames & rising embers
  const sampleFlames = [{ x: 0, y: 1, z: 0, width: 0.8, height: 1.4, speed: 1.1, core: [1, 0.94, 0.7], outer: [1, 0.32, 0.06] }];
  const locationFlames = createFlames(sampleFlames);
  const locationEmbers = createFlameEmbers(sampleFlames, 1);

  // Elemental fire & fireball materials
  const fireMat = createFireNodeMaterial().material;
  const fireballShell = createFireballNodeMaterial([1, 0.88, 0.3], [1, 0.19, 0.025]).material;
  const fireballWake = createFireballWakeMaterial([1, 0.88, 0.3], [1, 0.19, 0.025]).material;
  const fireballTrail = createFireballTrailMaterial([1, 0.88, 0.3], [1, 0.19, 0.025]).material;
  const fireballDome = createFireballImpactDomeMaterial([1, 0.88, 0.3], [1, 0.19, 0.025]).material;
  const fireballRing = createFireballShockRingMaterial([1, 0.88, 0.3], [1, 0.19, 0.025]).material;

  const trailMesh = new THREE.InstancedMesh(sphere, fireballTrail, 4);
  trailMesh.setColorAt(0, new THREE.Color(1, 0.8, 0.3));

  const targets = [
    ['vfx-particles', new THREE.Mesh(instanced, particleMat)],
    ['location-flames', locationFlames],
    ['location-flame-embers', locationEmbers],
    ['fire-spell-node', new THREE.Mesh(quad, fireMat)],
    ['fireball-spell-node', new THREE.Mesh(sphere, fireballShell)],
    ['fireball-spell-wake', new THREE.Mesh(cone, fireballWake)],
    ['fireball-spell-trail', trailMesh],
    ['fireball-spell-impact-dome', new THREE.Mesh(sphere, fireballDome)],
    ['fireball-spell-shock-ring', new THREE.Mesh(quad, fireballRing)],
  ];

  for (const [label, object] of targets) {
    const built = buildShader(object);
    const textures = built.fragmentShader.match(/: texture_2d(_array)?</g) ?? [];
    assert.ok(textures.length <= 4, `${label}: expected <= 4 textures, got ${textures.length}`);
  }

  atlas.dispose();
  particleMat.dispose();
  locationFlames.material.dispose();
  locationEmbers.material.dispose();
  fireMat.dispose();
  fireballShell.dispose();
  fireballWake.dispose();
  fireballTrail.dispose();
  fireballDome.dispose();
  fireballRing.dispose();
  quad.dispose();
  sphere.dispose();
  cone.dispose();
  instanced.dispose();
});

test('elemental fire and fireball shaders use worldNoise rather than procedural 3D noise loops', async () => {
  for (const file of ['fire_node_material.js', 'fireball_node_material.js']) {
    const source = await readFile(new URL(`../src/editor/spells/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /createSpellEffectNoiseNodes/, `${file} should not stack procedural noise loops`);
    assert.match(source, /fireShaderNodes\.js/, `${file} should sample shared worldNoise fire helpers`);
  }
});

test('enhanced fire recipes spawn new wake, spark, groundroll, hearth base, and wisp layers', () => {
  const types = createSpellParticleTypes();
  const context = {
    origin: { x: 0.3, y: 1.4, z: -0.5 },
    target: { x: 0, y: 0, z: -18 },
    normal: { x: 0, y: 1, z: 0 },
    direction: { x: 0, y: -0.07, z: -1 },
    forward: { x: 0, y: 0, z: -1 },
    right: { x: 1, y: 0, z: 0 },
    caster: { x: 0, y: 0, z: 0 },
    sunDirection: { x: 0.4, y: 0.8, z: 0.2 },
  };

  const runRecipe = (recipeId, seconds) => {
    const simulator = createParticleSimulator({ types, groundHeight: () => 0, capacity: 8192 });
    const seen = new Set();
    let director = null;
    director = createEffectDirector({
      simulator,
      types,
      groundHeight: () => 0,
      getListener: () => ({ x: 0, y: 2, z: 10 }),
      lights: { acquire: () => ({ release() {}, setPosition() {} }) },
      decals: { spawn: () => 0 },
      shake: { add() {} },
      sound: { play() {} },
      pressGround() {},
      markGround() {},
      play: (id, ctx) => director.play(EFFECT_RECIPES[id], ctx),
    });
    director.play(EFFECT_RECIPES[recipeId], { ...context });
    for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
      director.update(1 / 60);
      simulator.update(1 / 60);
      for (let i = 0; i < simulator.count; i += 1) seen.add(types.get(simulator.state.type[i]).id);
    }
    assert.equal(simulator.dropped, 0, `${recipeId} dropped particles`);
    return seen;
  };

  const fbSeen = runRecipe('fireball', 4);
  for (const id of ['fire.wake', 'fire.spark', 'explosion.groundroll', 'explosion.updraft.spark']) {
    assert.ok(fbSeen.has(id), `fireball missing ${id}`);
  }

  const wallSeen = runRecipe('wallOfFire', 3);
  for (const id of ['wall.base', 'wall.wisp', 'wall.flame', 'wall.roar']) {
    assert.ok(wallSeen.has(id), `wallOfFire missing ${id}`);
  }

  const meteorSeen = runRecipe('meteorSwarm', 4);
  assert.ok(meteorSeen.has('meteor.spark'), 'meteorSwarm missing meteor.spark');

  const bogSeen = runRecipe('bogGasFlame', 3);
  for (const id of ['wall.base', 'wall.wisp', 'wall.flame']) {
    assert.ok(bogSeen.has(id), `bogGasFlame missing ${id}`);
  }
});

test('elemental fireball VFX plays through flight, impact, and clean disposal', () => {
  const scene = new THREE.Scene();
  let clockMs = 1000;
  let hitFired = false;
  const vfx = createFireballSpellVfx({
    scene,
    config: defaultSpellConfig.fireball.vfx,
    now: () => clockMs,
    getSource: () => ({ point: new THREE.Vector3(0, 2, 0), direction: new THREE.Vector3(0, -0.2, -1).normalize() }),
    raycastTerrain: (ray) => {
      if (hitFired || ray.origin.y > 1.0) return null;
      hitFired = true;
      return { distance: 0.2, point: new THREE.Vector3(0, 0, -5), normal: new THREE.Vector3(0, 1, 0) };
    },
  });

  assert.ok(scene.getObjectByName('fireball-spell-wake'), 'projectile flame wake should be added to scene');
  vfx.play(4200);
  for (let step = 0; step < 80; step += 1) {
    clockMs += 33;
    vfx.update(clockMs);
  }
  assert.ok(hitFired, 'fireball should reach terrain impact');
  vfx.dispose();
  assert.equal(scene.children.length, 0, 'dispose should remove all fireball scene objects');
});
