import * as THREE from 'three/webgpu';
import { Rng } from '../../_clod_shims/seed.js';
import { DEFAULT_WEATHER_EFFECTS } from '../WeatherEffectsConfig.js';
import { createSnowfallMaterial, createSnowfallUniforms } from './snowfallFieldMaterial.js';

/** Resolve contiguous populations, with the last absorbing count rounding. */
export function snowfallPopulations(settings = DEFAULT_WEATHER_EFFECTS.snowfall) {
  const total = settings.layers.reduce((sum, layer) => sum + layer.share, 0);
  let start = 0;
  return settings.layers.map((layer, index) => {
    const end = index === settings.layers.length - 1 ? settings.count
      : Math.min(settings.count, start + Math.round(settings.count * layer.share / total));
    const population = { ...layer, count: end - start, width: layer.area,
      height: settings.top - settings.bottom, fallSpeed: settings.speed * layer.speedScale };
    start = end;
    return Object.freeze(population);
  });
}

export const SNOWFALL_POPULATIONS = Object.freeze(snowfallPopulations());
export function snowfallFlakeCount(populations = SNOWFALL_POPULATIONS) {
  return populations.reduce((total, population) => total + population.count, 0);
}

/** Shared four-vertex quad; each flake stores only its seed and population data. */
export function createSnowfallGeometry(populations = SNOWFALL_POPULATIONS, random = Math.random) {
  const count = snowfallFlakeCount(populations);
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry().copy(base);
  const seeds = new Float32Array(count * 4);
  const shapes = new Float32Array(count * 4);
  const appearances = new Float32Array(count * 4);
  const layers = new Float32Array(count);
  let flake = 0;
  for (const [layer, population] of populations.entries()) {
    for (let index = 0; index < population.count; index += 1) {
      const at = flake * 4;
      seeds.set([random(), random(), random(), (index + random()) / population.count], at);
      const size = THREE.MathUtils.lerp(population.sizeMin, population.sizeMax, random());
      shapes.set([population.width, population.height, size,
        population.fallSpeed * (0.6 + random() * 0.75)], at);
      appearances.set([population.nearFade, population.softness,
        population.brightness, population.opacity * (0.55 + random() * 0.45)], at);
      layers[flake] = layer;
      flake += 1;
    }
  }
  geometry.setAttribute('snowSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.setAttribute('snowShape', new THREE.InstancedBufferAttribute(shapes, 4));
  geometry.setAttribute('snowAppearance', new THREE.InstancedBufferAttribute(appearances, 4));
  geometry.setAttribute('snowLayer', new THREE.InstancedBufferAttribute(layers, 1));
  geometry.instanceCount = count;
  return geometry;
}

export function gustFactor(seconds, settings = DEFAULT_WEATHER_EFFECTS.snowfall) {
  const rate = Math.PI * 2 / settings.gustPeriod;
  return 1 + settings.gustStrength * Math.cos(seconds * rate)
    + settings.gustStrength * 0.4 * Math.cos(seconds * rate * 2.7 + 1.3);
}

/** Analytic integral from Gods' End: no discontinuous time-times-gust drift. */
export function snowWindIntegral(seconds, settings = DEFAULT_WEATHER_EFFECTS.snowfall) {
  const rate = Math.PI * 2 / settings.gustPeriod;
  return seconds + Math.sin(seconds * rate) * settings.gustStrength / rate
    + Math.sin(seconds * rate * 2.7 + 1.3) * settings.gustStrength * 0.4 / (rate * 2.7);
}

export function createSnowfallField(settings = DEFAULT_WEATHER_EFFECTS.snowfall, seed = 0x51eaf00d) {
  const uniforms = createSnowfallUniforms(settings);
  const material = createSnowfallMaterial(uniforms, settings);
  const rng = new Rng(seed);
  const geometry = createSnowfallGeometry(snowfallPopulations(settings), () => rng.float());
  const wind = new THREE.Vector2(-0.62, 0.21);
  const origin = new THREE.Vector2();
  const updatePhases = () => {
    settings.layers.forEach((layer, index) => {
      // Reduce canonical coordinates in double precision on the CPU. A large
      // Azgaar origin never enters the float32 shader, and rebasing preserves flakes.
      uniforms.phases.array[index].set(
        ((uniforms.center.value.x + origin.x - uniforms.drift.value.x) % layer.area) / layer.area,
        ((uniforms.center.value.z + origin.y - uniforms.drift.value.y) % layer.area) / layer.area,
      );
    });
  };
  let lastTime = null;
  let disposed = false;
  return {
    material, geometry, uniforms,
    setTime(seconds) {
      if (lastTime !== null) {
        const start = Math.max(lastTime, seconds - 0.25);
        const travel = seconds > start ? snowWindIntegral(seconds, settings) - snowWindIntegral(start, settings) : 0;
        uniforms.drift.value.addScaledVector(wind, travel);
      }
      lastTime = seconds;
      uniforms.time.value = seconds;
      updatePhases();
    },
    setIntensity(value) { uniforms.intensity.value = value; },
    setCenter(center) { uniforms.center.value.copy(center); updatePhases(); },
    setOrigin(value) { origin.set(value?.x ?? 0, value?.z ?? 0); updatePhases(); },
    setWind(x, z) { wind.set(x, z); },
    dispose() {
      if (disposed) return;
      disposed = true;
      material.dispose();
      geometry.dispose();
    },
  };
}
