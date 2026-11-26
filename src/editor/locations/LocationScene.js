import * as THREE from 'three/webgpu';
import { generateLocation } from './LocationBuilder.js';
import { createFlameEmbers, createFlames, createHalos, createLightShaft, createParticles } from './LocationEffects.js';
import { createBreath, createEmitters } from './LocationEmitters.js';
import { LocationPostProcessing } from './LocationPostProcessing.js';
import { createSky } from './LocationSky.js';
import { locationLight } from './materials/LocationShading.js';
import { LocationMaterials } from './materials/LocationMaterials.js';
import { LocationLightPool } from './LocationLightPool.js';

/** Share of the gap to the target that the indoor/outdoor weather fade closes each frame. */
const WEATHER_EASE = 0.06;

/**
 * One prepared location: its own `THREE.Scene`, walkable ground and every GPU
 * resource it brought into existence. Nothing here touches the world scene, so
 * a failed `prepare` can be thrown away without the world noticing, and
 * `dispose` returns the renderer to exactly what it held before.
 */
export class LocationScene {
  /**
   * Builds a site, yielding between stages so the loading screen keeps painting.
   *
   * @param {object} options
   * @param {object} options.site a resolved site from the catalog
   * @param {{ bounds: object, generate: Function }} options.generator
   * @param {object} options.quality the active quality tier
   * @param {string} options.baseUrl
   * @param {THREE.WebGPURenderer} options.renderer
   * @param {THREE.Camera} options.camera for shader warm-up
   * @param {(stepId: string) => Promise<void>} options.progress marks a loading step and yields a frame
   */
  static async prepare({ site, generator, quality, baseUrl, renderer, camera, progress }) {
    const location = new LocationScene(site);
    const isIceSite = site.materials?.terrain?.kind === 'ice';
    const isStoneholdSite = Boolean(site.archetypeKey?.startsWith('stonehold') || site.id?.includes('stonehold'));
    const enableLocationPost = (isIceSite || isStoneholdSite) && quality.icePost !== false && Boolean(renderer?.backend);
    const softShaftDepth = isIceSite && quality.iceTransmission !== false;

    try {
      await progress('load-assets');
      location.materials = new LocationMaterials({ baseUrl, anisotropy: renderer.getMaxAnisotropy?.() ?? 8 });
      const siteWind = site.params?.snow?.wind ?? [0.6, 0.8];
      const materials = await location.materials.create(site.materials, quality, {
        usePostMrt: enableLocationPost,
        wind: siteWind,
        hasPeaks: Boolean(site.lighting?.sky?.peaks),
      });

      await progress('build-geometry');
      const builder = generateLocation(site, generator);
      if (!builder.spawns.entry) throw new Error(`Location "${site.id}" generated no entry spawn.`);
      if (builder.exits.length === 0) throw new Error(`Location "${site.id}" generated no exit.`);

      await progress('bake-lighting');
      const crystalScale = quality.crystalScale ?? 1;
      const rawCrystalField = site.params?.crystalField ?? null;
      const crystalField = rawCrystalField && crystalScale > 0
        ? {
          maxClusters: Math.round((rawCrystalField.clusters ?? 0) * crystalScale),
          maxNeedles: Math.round((rawCrystalField.needles ?? 0) * crystalScale),
        }
        : null;
      const understoryScale = quality.understoryScale ?? 1;
      const rawUnderstory = site.params?.alpineUnderstory ?? null;
      const alpineUnderstory = rawUnderstory && understoryScale > 0
        ? {
          wind: siteWind,
          cobbles: Math.round((rawUnderstory.cobbles ?? 0) * understoryScale),
          iceShards: Math.round((rawUnderstory.iceShards ?? 0) * understoryScale),
          tundraSedge: Math.round((rawUnderstory.tundraSedge ?? 0) * understoryScale),
          tundraLichen: Math.round((rawUnderstory.tundraLichen ?? 0) * understoryScale),
        }
        : null;

      location.scene.add(builder.build({
        materials,
        absorption: site.lighting.absorption,
        bakeGain: site.lighting.bakeGain ?? 1,
        indirectBounce: site.lighting.indirectBounce ?? null,
        propShadows: site.lighting.propShadows ?? null,
        crystalField,
        alpineUnderstory,
      }));
      location.lightPool = new LocationLightPool(builder.dynamicLights, {
        gain: site.lighting.dynamicGain ?? (site.lighting.indirectBounce ? 0.28 : 0.14),
      });
      if (builder.halos.length > 0) location.scene.add(createHalos(builder.halos));
      if (builder.flames.length > 0) {
        location.scene.add(createFlames(builder.flames));
        location.scene.add(createFlameEmbers(builder.flames, quality.particleScale));
      }
      for (const shaft of builder.shafts) {
        location.scene.add(createLightShaft({ ...shaft, softDepth: softShaftDepth }));
      }
      for (const profile of site.atmosphere.particles ?? []) {
        const anchor = profile.anchor ? builder.anchors[profile.anchor] : null;
        if (profile.anchor && !anchor) throw new Error(`Location "${site.id}" has no "${profile.anchor}" anchor for its particles.`);
        location.scene.add(createParticles({
          ...profile, count: Math.max(1, Math.round(profile.count * quality.particleScale)), anchorPoint: anchor,
        }));
      }
      for (const [kind, points] of Object.entries(builder.emitters)) {
        const profile = site.atmosphere.emitters?.[kind];
        if (!profile) throw new Error(`Location "${site.id}" sheds "${kind}" but its atmosphere profile has no such emitter.`);
        location.scene.add(createEmitters(profile, points, quality.particleScale));
      }
      if (site.atmosphere.breath) {
        location.breath = createBreath(site.atmosphere.breath);
        location.scene.add(location.breath.sprite);
      }
      if (site.lighting.sky) {
        location.sky = createSky(site.lighting.sky, { alpinePack: location.materials.alpinePack });
        location.scene.add(location.sky.group);
      }
      location.skyAbove = (point) => builder.skyAbove(point.x, point.y, point.z);
      location.nav = builder.nav;
      location.spawns = builder.spawns;
      location.exits = builder.exits;

      await progress('prepare-shaders');
      location.applyLighting();
      location.lightPool?.update(builder.spawns.entry, 0);
      if (enableLocationPost) {
        location.postProcessing = new LocationPostProcessing({
          renderer,
          scene: location.scene,
          camera,
          exposure: site.lighting.exposure ?? (isIceSite ? 1.15 : 1.12),
          enableSsr: isIceSite && quality.iceSsr !== false,
          enableAo: true,
          enableBloom: true,
        });
      } else {
        await renderer.compileAsync(location.scene, camera);
      }
      return location;
    } catch (error) {
      location.dispose();
      throw error;
    }
  }

  constructor(site) {
    this.site = site;
    this.scene = new THREE.Scene();
    this.scene.name = `location:${site.id}`;
    this.scene.background = new THREE.Color(site.lighting.background);
    this.scene.fog = new THREE.FogExp2(site.lighting.fog.color, site.lighting.fog.density);
    this.materials = null;
    this.lightPool = null;
    this.postProcessing = null;
    this.sky = null;
    this.breath = null;
    this.clockStartMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.skyAbove = () => false;
    this.nav = null;
    this.spawns = {};
    this.exits = [];
    this.disposed = false;
  }

  /** Points the shared lighting uniforms at this location's profile. */
  applyLighting() {
    const { ambientUp, ambientDown, carried } = this.site.lighting;
    locationLight.ambientUp.value.set(ambientUp);
    locationLight.ambientDown.value.set(ambientDown);
    locationLight.carriedColor.value.set(carried.color).multiplyScalar(carried.intensity);
    locationLight.carriedRange.value = carried.range;
    locationLight.outdoors.value = 1;
    this.lightPool?.update(locationLight.carriedPosition.value, 0);
  }

  /** The carried lamp sits just below the eye so it lights what is looked at without flattening it. */
  update(camera) {
    locationLight.carriedPosition.value.copy(camera.position);
    locationLight.carriedPosition.value.y -= 0.35;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const seconds = (nowMs - this.clockStartMs) * 0.001;
    this.lightPool?.update(camera.position, seconds);
    this.breath?.update(camera, seconds);
    this.sky?.follow(camera);
    // Eased, so snowfall thins out over a few steps through a doorway instead of switching off.
    const outdoors = locationLight.outdoors;
    outdoors.value += ((this.skyAbove(camera.position) ? 1 : 0) - outdoors.value) * WEATHER_EASE;
  }

  /** The exit within reach of a foot position, or null. */
  exitNear(x, y, z) {
    for (const exit of this.exits) {
      if (Math.abs(y - exit.y) < 3 && Math.hypot(x - exit.x, z - exit.z) <= exit.radius) return exit;
    }
    return null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.postProcessing?.dispose();
    this.postProcessing = null;
    this.lightPool?.dispose();
    const owned = new Set();
    this.scene.traverse((object) => {
      object.geometry?.dispose();
      if (object.material) owned.add(object.material);
    });
    for (const material of owned) material.dispose();
    this.materials?.dispose();
    this.scene.clear();
  }
}
