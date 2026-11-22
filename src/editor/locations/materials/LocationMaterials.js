import * as THREE from 'three/webgpu';
import { createGlowMaterial } from '../LocationEffects.js';
import { createGlacierIceMaterial } from './GlacierIceMaterial.js';
import { createIceCrystalMaterial } from './IceCrystalMaterial.js';
import { createLocationClothMaterial } from './LocationClothMaterial.js';
import { createStoneMaterial } from './StoneSurface.js';
import { createWaterfallMaterial } from './WaterfallMaterial.js';

const ICE_CRYSTAL_PACK_PATH = 'assets/textures/ice/ice-cave-crystal-pack.png';
const ALPINE_DETAIL_PACK_PATH = 'assets/textures/ice/alpine-detail-pack.png';

/**
 * Builds a site's material set from its resolved config and owns what it
 * loaded: textures (including the on-demand packed CC0 ice-crystal/caustic
 * atlas) are fetched when a location is entered and disposed when it is left,
 * never at startup.
 */
export class LocationMaterials {
  constructor({ baseUrl, anisotropy = 8 }) {
    this.baseUrl = baseUrl;
    this.anisotropy = anisotropy;
    this.loader = new THREE.TextureLoader();
    this.textures = new Map();
    this.materials = [];
    /** Optional on-demand CC0 alpine erosion/drift/grain atlas shared with mountain sky & cloth. */
    this.alpinePack = null;
  }

  async #texture(path, colorSpace) {
    if (!this.textures.has(path)) {
      this.textures.set(path, this.loader.loadAsync(`${this.baseUrl}${path}`).then((texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = colorSpace;
        texture.anisotropy = this.anisotropy;
        return texture;
      }));
    }
    return this.textures.get(path);
  }

  async #maps(files) {
    const [color, normal, rough] = await Promise.all([
      this.#texture(files.color, THREE.SRGBColorSpace),
      this.#texture(files.normal, THREE.NoColorSpace),
      this.#texture(files.rough, THREE.NoColorSpace),
    ]);
    return { color, normal, rough };
  }

  /**
   * @param {Record<string, object>} entries a resolved site's `materials`
   * @param {{ iceLayers: number, iceTransmission?: boolean }} quality
   * @param {{ usePostMrt?: boolean, wind?: number[], hasPeaks?: boolean }} [options]
   * @returns {Promise<Record<string, { material: Material, ice: number }>>} keyed for `LocationBuilder.build`
   */
  async create(entries, quality, { usePostMrt = false, wind = [0.6, 0.8], hasPeaks = false } = {}) {
    const hasIce = Object.values(entries).some((entry) => entry.kind === 'ice');
    const hasCloth = Object.values(entries).some((entry) => Boolean(entry.profile?.cloth));
    const crystalPack = hasIce
      ? await this.#texture(ICE_CRYSTAL_PACK_PATH, THREE.NoColorSpace).catch(() => null)
      : null;
    const alpinePack = (hasIce || hasCloth || hasPeaks)
      ? await this.#texture(ALPINE_DETAIL_PACK_PATH, THREE.NoColorSpace).catch(() => null)
      : null;
    this.alpinePack = alpinePack;

    const set = {};
    for (const [key, entry] of Object.entries(entries)) {
      let material;
      if (entry.kind === 'glow') {
        material = createGlowMaterial();
      } else if (entry.kind === 'waterfall') {
        const noiseMap = await this.#texture(entry.noise, THREE.NoColorSpace);
        material = createWaterfallMaterial(`location-${key}`, {
          noiseMap,
          waterTint: entry.waterTint,
          foamTint: entry.foamTint,
          speed: entry.speed,
        });
      } else if (entry.kind === 'ice') {
        const maps = {
          ice: await this.#maps(entry.surfaces.ice),
          cracks: await this.#maps(entry.surfaces.cracks),
          snow: await this.#maps(entry.surfaces.snow),
          crystalPack,
        };
        if (entry.surfaces.rock) maps.rock = await this.#maps(entry.surfaces.rock);
        if (entry.profile.crystal === true) {
          material = createIceCrystalMaterial(`location-${key}`, {
            profile: entry.profile,
            maps,
            layers: quality.iceLayers,
            transmission: quality.iceTransmission !== false,
            usePostMrt,
          });
        } else {
          material = createGlacierIceMaterial(`location-${key}`, {
            profile: entry.profile,
            maps,
            stoneProfile: entry.bedrock,
            layers: quality.iceLayers,
            masked: entry.masked,
            usePostMrt,
          });
        }
      } else if (entry.profile?.cloth) {
        material = createLocationClothMaterial(`location-${key}`, entry.profile, { wind, alpinePack });
      } else {
        const profile = entry.masked ? entry.profile : { ...entry.profile, vertexTint: true };
        const maps = await this.#maps(entry.surfaces.stone);
        if (entry.surfaces.floor) maps.floor = await this.#maps(entry.surfaces.floor);
        if (entry.surfaces.alt) maps.alt = await this.#maps(entry.surfaces.alt);
        material = createStoneMaterial(`location-${key}`, profile, maps, { masked: entry.masked });
      }
      this.materials.push(material);
      set[key] = {
        material,
        ice: entry.kind === 'ice' ? 1 : 0,
        woodGrain: Boolean(entry.profile?.woodGrain),
        cloth: Boolean(entry.profile?.cloth),
      };
    }
    return set;
  }

  dispose() {
    for (const material of this.materials.splice(0)) material.dispose();
    for (const pending of this.textures.values()) pending.then((texture) => texture.dispose(), () => {});
    this.textures.clear();
  }
}
