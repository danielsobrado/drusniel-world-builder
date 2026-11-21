import * as THREE from 'three/webgpu';
import {
  cameraPosition, clamp, dot, float, floor, fract, instanceIndex, length, max, mix, normalize,
  positionGeometry, positionWorld, smoothstep, vec2, vec3,
} from 'three/tsl';
import { frameUniform } from '../../../render/FrameUniforms.js';
import { hash21, hash22, noise2 } from '../SnowNoiseNodes.js';
import { snowLightUniforms } from '../sky/skyLight.js';

/**
 * High-mountain grass-budget reallocation: 6-layer shell-textured fluffy snow
 * powder & soft micro-drift cushions (adapted from Noniv/snowflow_demo's
 * `fur.fragment.wgsl`, MIT, Maksymilian Dendura).
 *
 * In lowlands, MeadowGrassField spends ~290k triangles on grass blades. Above
 * treeline and on deep tundra/glaciers where grass = 0, this single instanced
 * draw spends ~11.5k triangles (~4% of the freed grass budget) to give close
 * snow slopes and drift crests true 3D volumetric fluffiness, subtle blue
 * micro-crevice depth, and sunlit backlit powder rim glow.
 *
 * Strictly gated on `snowBudget > 0.01`: 0 draws and 0 GPU cost in lowlands.
 */

const RADIAL_RINGS = 24;
const ANGULAR_SEGMENTS = 40;
const SHELL_COUNT = 6;
const PATCH_RADIUS_METRES = 18;
const SNAP_METRES = 0.5;
const MAX_SHELL_HEIGHT_METRES = 0.085;
const CAVE_BLUE_TINT = vec3(0.68, 0.82, 1.0);

/** Pure helper: high-mountain idle-grass snow budget share (0 in meadows, 1 in deep alpine snow). */
export function highMountainSnowBudget(weights) {
  const snow = Math.max(0, Math.min(1, Number(weights?.snow) || 0));
  const meadow = Math.max(0, Math.min(1, Number(weights?.meadow) || 0));
  const t = Math.max(0, Math.min(1, (snow - 0.50) / 0.35));
  const eased = t * t * (3 - 2 * t);
  return eased * (1 - meadow);
}

/** Builds a circular radially graded ground disc (denser near camera, zero square corners). */
function buildGradedShellGeometry() {
  const positions = [0, 0, 0];
  const indices = [];
  for (let r = 1; r <= RADIAL_RINGS; r += 1) {
    const t = r / RADIAL_RINGS;
    const rad = Math.pow(t, 1.35) * PATCH_RADIUS_METRES;
    for (let a = 0; a < ANGULAR_SEGMENTS; a += 1) {
      const ang = (a / ANGULAR_SEGMENTS) * Math.PI * 2;
      positions.push(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
    }
  }
  for (let a = 0; a < ANGULAR_SEGMENTS; a += 1) {
    indices.push(0, 1 + ((a + 1) % ANGULAR_SEGMENTS), 1 + a);
  }
  for (let r = 1; r < RADIAL_RINGS; r += 1) {
    const row = 1 + (r - 1) * ANGULAR_SEGMENTS;
    const next = 1 + r * ANGULAR_SEGMENTS;
    for (let a = 0; a < ANGULAR_SEGMENTS; a += 1) {
      const an = (a + 1) % ANGULAR_SEGMENTS;
      indices.push(row + a, row + an, next + a);
      indices.push(row + an, next + an, next + a);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeBoundingSphere();
  return geom;
}

export class AlpineSnowShellField {
  constructor({ ground, light, sun }) {
    this.name = 'alpine-snow-shells';
    this.ground = ground;
    this.intensity = frameUniform(0);
    this.center = frameUniform(new THREE.Vector2());
    /** Canonical modulo offset so world-locked tuft hashes never swim across origin snaps. */
    this.canonOffset = frameUniform(new THREE.Vector2());
    this.current = 0;

    this.geometry = buildGradedShellGeometry();
    this.material = this.createMaterial({ ground, light, sun });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, SHELL_COUNT);
    this.mesh.name = 'alpine-snow-shells';
    const identity = new THREE.Matrix4();
    for (let i = 0; i < SHELL_COUNT; i += 1) this.mesh.setMatrixAt(i, identity);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 2;
  }

  createMaterial({ ground, light, sun }) {
    const shellT = instanceIndex.toFloat().add(0.5).div(float(SHELL_COUNT));
    const localX = positionGeometry.x;
    const localZ = positionGeometry.z;
    const renderX = this.center.x.add(localX);
    const renderZ = this.center.y.add(localZ);
    const worldXZ = this.canonOffset.add(vec2(localX, localZ));

    // Sample LocalGroundHeight + central-difference terrain normal right in the vertex shader!
    const h0 = ground.heightNode(renderX, renderZ);
    const hE = ground.heightNode(renderX.add(1.2), renderZ);
    const hW = ground.heightNode(renderX.sub(1.2), renderZ);
    const hN = ground.heightNode(renderX, renderZ.add(1.2));
    const hS = ground.heightNode(renderX, renderZ.sub(1.2));
    const slopeVec = vec2(hE.sub(hW), hN.sub(hS)).div(2.4);
    const groundN = normalize(vec3(slopeVec.x.negate(), float(1), slopeVec.y.negate()));

    // Pillow modulation: deeper fluffiness on rolling crests & sheltered flats, thinned on steep rock/ice faces.
    const flatMask = smoothstep(0.72, 0.92, groundN.y);
    const pillow = noise2(worldXZ.mul(0.16)).mul(0.5).add(0.5).mul(0.6).add(0.4);
    const radialDist = length(vec2(localX, localZ));
    const edgeFade = smoothstep(PATCH_RADIUS_METRES * 0.42, PATCH_RADIUS_METRES * 0.90, radialDist).oneMinus();
    // Tuck outer perimeter smoothly beneath the terrain so coarse LocalGroundHeight never shows a rim seam.
    const lift = mix(
      float(-0.045),
      shellT.mul(MAX_SHELL_HEIGHT_METRES).mul(pillow).mul(flatMask),
      edgeFade,
    );

    const material = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      forceSinglePass: true,
    });
    material.name = 'alpine-snow-shells';
    material.positionNode = vec3(renderX, h0.add(lift), renderZ);

    // Fragment: Snowflow shell-fur powder tuft field (world-locked cells, tapered by shell height).
    const fragWorld = this.canonOffset.add(positionWorld.xz.sub(this.center));
    const cellCoord = fragWorld.mul(6.4);
    const cell = floor(cellCoord);
    const cellF = fract(cellCoord);
    const h = hash21(cell);
    const jitter = hash22(cell.add(vec2(11.3, 5.7))).sub(0.5);
    const tuftLen = float(0.26).add(h.mul(0.74));
    const survive = smoothstep(tuftLen.add(0.06), tuftLen.sub(0.08), shellT);

    // Tapered soft powder clump radius (broad pillowy base -> airy tapered tip).
    const dist = length(cellF.sub(0.5).sub(jitter.mul(0.48)));
    const taper = max(float(0), float(1).sub(shellT.div(max(tuftLen, float(0.05)))));
    const radius = float(0.54).mul(float(0.6).add(hash21(cell.add(vec2(3.1, 9.4))).mul(0.4))).mul(taper.sqrt());
    const clump = smoothstep(radius.add(0.10), radius.mul(0.32), dist);

    // Soft macro pillow wave keeps the fluffiness feeling like drifting snow rather than uniform carpet.
    const driftWave = noise2(fragWorld.mul(0.24)).mul(0.5).add(0.5).smoothstep(0.24, 0.78);
    const viewDist = cameraPosition.distance(positionWorld);
    const nearKeep = smoothstep(0.8, 2.6, viewDist);
    const farFade = smoothstep(PATCH_RADIUS_METRES * 0.40, PATCH_RADIUS_METRES * 0.85, viewDist).oneMinus();

    // Luminous airy powder lighting calibrated to light.sun/light.sky (already in 1/pi radiance units!).
    const depth = clamp(shellT.div(max(tuftLen, float(0.05))), 0, 1);
    const selfAO = float(0.88).add(depth.mul(depth).mul(0.12));
    const caveTint = mix(vec3(1, 1, 1), CAVE_BLUE_TINT, selfAO.oneMinus().mul(1.8));

    const V = normalize(cameraPosition.sub(positionWorld));
    const N = groundN;
    const ndl = dot(N, sun);
    const wrapDiff = max(ndl.add(0.65).div(1.65), float(0));
    const transDir = normalize(sun.add(N.mul(0.45)));
    const backGlow = clamp(dot(V, transDir.negate()), 0, 1).pow(2.4).mul(depth).mul(0.65);
    const rim = float(1).sub(clamp(dot(N, V), 0, 1)).pow(2.5).mul(depth).mul(0.35);

    const snowAlbedo = vec3(0.95, 0.97, 1.0).mul(snowLightUniforms.brightness.max(0.88));
    const lit = snowAlbedo
      .mul(light.sun.mul(wrapDiff.add(backGlow).add(rim)).add(light.sky.mul(1.35)))
      .mul(selfAO)
      .mul(caveTint);

    material.colorNode = lit;
    material.opacityNode = clump
      .mul(survive)
      .mul(driftWave)
      .mul(nearKeep)
      .mul(farFade)
      .mul(edgeFade)
      .mul(flatMask)
      .mul(mix(float(0.18), float(0.08), shellT))
      .mul(this.intensity);
    return material;
  }

  update(delta, state) {
    const { focus, origin, weights, step } = state;
    const target = highMountainSnowBudget(weights);
    const next = step ? step(this.current, target) : target;
    this.current = next < 0.006 ? 0 : next;
    this.intensity.value = this.current;
    this.mesh.visible = this.current > 0 && this.ground.ready;
    if (!this.mesh.visible) return;

    const canonX = focus.x + origin.x;
    const canonZ = focus.z + origin.z;
    const snappedX = Math.round(canonX / SNAP_METRES) * SNAP_METRES;
    const snappedZ = Math.round(canonZ / SNAP_METRES) * SNAP_METRES;
    this.center.value.set(snappedX - origin.x, snappedZ - origin.z);
    // Bounded canonical coordinate modulo 1024 m keeps float32 tuft hashes rock-solid at planet scale.
    this.canonOffset.value.set(((snappedX % 1024) + 1024) % 1024, ((snappedZ % 1024) + 1024) % 1024);
  }

  getState() {
    return { intensity: Number(this.current.toFixed(3)), shells: SHELL_COUNT, visible: this.mesh.visible };
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
