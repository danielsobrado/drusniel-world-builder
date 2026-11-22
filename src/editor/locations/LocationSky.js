import * as THREE from 'three/webgpu';
import {
  acos, clamp, color, dot, exp, float, floor, hash, max, mix, normalize, positionLocal, pow, sin, smoothstep,
  time, vec2, vec3,
} from 'three/tsl';
import { createAlpineMountainBackdrop } from './AlpineMountainBackdrop.js';
import { noiseTap } from './LocationEffects.js';

/**
 * The sky over an open-air location, from a lighting profile's `sky` entry: a
 * dome drawn behind everything, and a multi-range 3D alpine massif standing in
 * the haze beyond the place itself. The world's own sky belongs to the world
 * scene and its post chain; a location draws straight to the canvas, so it
 * carries this instead. Its clouds and aurora read the shared world-noise
 * texture rather than evaluating noise per pixel.
 */

/** Radius and width of the halo ice crystals in the air draw round the sun, radians: the 22 degree halo. */
const HALO_RADIUS = 0.384, HALO_WIDTH = 0.024;
/** How far above or below the sun's own height its sundogs reach, as a share of the dome. */
const SUNDOG_HEIGHT = 0.05;

/** Overhead-plane units a second the clouds travel: about 0.7 degrees a second straight up. */
const CLOUD_WIND = [0.01, 0.004];
/** Texture tiles per overhead unit, stretched down-wind (x): a couple of masses horizon to horizon. */
const CLOUD_MASS_SCALE = [0.06, 0.12];
const CLOUD_EDGE_SCALE = [0.25, 0.5];
/** Rims travel a fifth faster than the masses carrying them, so their tears keep changing. */
const CLOUD_EDGE_BOIL = 1.2;
/** How far the rim fields push density either way. */
const CLOUD_EDGE_SWING = 0.5;
/**
 * Density from the first wisp to solid cloud: a quarter of the sky's cover, as the streaks before them had.
 * Flat noise sits just inside it, so before the texture arrives the sky wears a faint even veil.
 */
const CLOUD_COVER = [0.42, 0.72];
/** How far the billows inside thick cloud darken it; thin rims keep the full cloud colour. */
const CLOUD_SHADE = 0.25;

/** An aurora ribbon's wander, in tiles per overhead unit and tiles a second. */
const AURORA_WANDER = { scale: 0.14, rate: 0.008 };
/** Its rays, read along the curtain: some dozens across the sky, as fine as the Perlin ones they replace. */
const AURORA_RAYS = { scale: 1, rate: 0.0086 };
/** Texture tiles between the two curtains' patches. */
const AURORA_PHASE_SPREAD = 0.37;

const unit = (direction) => {
  const length = Math.hypot(...direction);
  return vec3(direction[0] / length, direction[1] / length, direction[2] / length);
};

/**
 * Billowed cloud over the overhead plane: masses from two scales of the macro
 * layer's slow Perlin (R, G) in one tap, rims torn by the sky layer's wisp (G)
 * and erosion (B), and thick cloud shaded by its billows (R), all drifting with
 * the wind.
 *
 * @returns {{ cover: object, tint: object }} cloud share 0..1 and its colour
 */
function clouds(overhead, cloudColor) {
  const drift = vec2(...CLOUD_WIND).mul(time);
  const massField = noiseTap(overhead.add(drift).mul(vec2(...CLOUD_MASS_SCALE)), 'macro');
  // Two fields averaged lose contrast; stretched back to one's.
  const mass = mix(massField.r, massField.g, 0.45).sub(0.5).mul(1.4).add(0.5);
  const rimField = noiseTap(overhead.add(drift.mul(CLOUD_EDGE_BOIL)).mul(vec2(...CLOUD_EDGE_SCALE)), 'sky');
  const density = mass.add(mix(rimField.g, rimField.b, 0.5).sub(0.5).mul(CLOUD_EDGE_SWING));
  const cover = smoothstep(CLOUD_COVER[0], CLOUD_COVER[1], density);
  return { cover, tint: color(cloudColor).mul(float(1).sub(cover.mul(rimField.r.oneMinus()).mul(CLOUD_SHADE))) };
}

function skyColor(sky) {
  const toSky = normalize(positionLocal);
  const height = toSky.y;
  let tone = mix(color(sky.horizon), color(sky.zenith), pow(clamp(height, 0, 1), 0.45));

  const toSun = clamp(dot(toSky, unit(sky.sun.direction)), 0, 1);
  tone = tone.add(color(sky.sun.color).mul(
    pow(toSun, 1400).mul(sky.sun.disc).add(pow(toSun, 28).mul(0.4).add(pow(toSun, 5).mul(0.14)).mul(sky.sun.glow)),
  ));

  if (sky.sun.halo > 0) {
    // Diamond dust rings the sun, and flares into sundogs where the ring is level with it.
    const away = acos(clamp(dot(toSky, unit(sky.sun.direction)), -1, 1)).sub(HALO_RADIUS).div(HALO_WIDTH);
    const level = height.sub(sky.sun.direction[1] / Math.hypot(...sky.sun.direction)).div(SUNDOG_HEIGHT);
    const dogs = exp(level.mul(level).negate());
    tone = tone.add(color(sky.sun.color).mul(exp(away.mul(away).negate())).mul(dogs.mul(1.6).add(0.3))
      .mul(smoothstep(0, 0.08, height)).mul(sky.sun.halo));
  }

  // The dome flattened to a plane overhead, so cloud and aurora foreshorten toward the horizon.
  // Held level below it, where both are masked off, so the plane never reaches infinity.
  const overhead = toSky.xz.div(max(height, 0).add(0.22));
  if (sky.clouds > 0) {
    const { cover, tint } = clouds(overhead, sky.cloudColor);
    tone = mix(tone, tint, cover.mul(smoothstep(0.02, 0.3, height)).mul(sky.clouds));
  }
  if (sky.stars > 0) {
    const cell = floor(toSky.mul(190));
    const star = smoothstep(0.9975, 1, hash(cell.x.add(cell.y.mul(157.3)).add(cell.z.mul(311.7))));
    tone = tone.add(star.mul(smoothstep(0.08, 0.5, height)).mul(sky.stars));
  }
  if (sky.aurora) {
    for (const [offset, phase] of [[0, 0], [0.9, 2.4]]) {
      // A curtain: a ribbon across the northern sky wandering on the macro layer's slow Perlin (R),
      // rayed along its length by the bright side of the sky layer's turbulent filaments (B).
      const patch = phase * AURORA_PHASE_SPREAD;
      const wander = noiseTap(vec2(overhead.x.mul(AURORA_WANDER.scale), time.mul(AURORA_WANDER.rate).add(patch)), 'macro').r;
      const line = sin(overhead.x.mul(0.7).add(time.mul(0.03)).add(phase)).mul(0.5)
        .add(wander.sub(0.5).mul(0.6)).sub(1.1 + offset);
      const across = overhead.y.sub(line);
      const ribbon = exp(across.mul(across).mul(-9));
      const rays = noiseTap(vec2(overhead.x.mul(AURORA_RAYS.scale).add(patch), time.mul(AURORA_RAYS.rate)), 'sky').b.oneMinus();
      const curtain = ribbon.mul(rays.mul(0.75).add(0.25)).mul(smoothstep(0.06, 0.3, height));
      tone = tone.add(mix(color(sky.aurora.color), color(sky.aurora.crown), clamp(across.mul(1.6).add(0.3), 0, 1))
        .mul(curtain).mul(sky.aurora.strength));
    }
  }
  // Below the horizon the dome is the haze the land fades into.
  return mix(tone, color(sky.ground), smoothstep(0.02, -0.06, height));
}

/**
 * @param {object} sky a resolved `lightingProfiles.*.sky` entry
 * @param {{ alpinePack?: THREE.Texture | null }} [options]
 * @returns {{ group: THREE.Group, follow(camera: THREE.Camera): void }}
 */
export function createSky(sky, { alpinePack = null } = {}) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicNodeMaterial({ name: 'location-sky', side: THREE.BackSide, fog: false, depthWrite: false });
  material.colorNode = skyColor(sky);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  dome.frustumCulled = false;
  dome.renderOrder = -2;
  group.add(dome);
  if (sky.peaks) group.add(createAlpineMountainBackdrop(sky, alpinePack));
  return {
    group,
    /** The dome rides with the camera, just inside its far plane; the peaks stay where they stand. */
    follow(camera) {
      dome.position.copy(camera.position);
      dome.scale.setScalar(camera.far * 0.9);
    },
  };
}
