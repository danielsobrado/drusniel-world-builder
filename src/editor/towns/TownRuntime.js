import { townCollisionSource } from '../collision/providers/TownCollisionSource.js';
import { PerfCounters } from '../performance/qa/PerfCounters.js';
import { TownDoorController } from './TownDoors.js';
import { TownInteractionPrompt } from './TownInteractionPrompt.js';
import { TownInteriorAtmosphere } from './TownInteriorAtmosphere.js';
import { createTownGlassMaterial } from './TownGlassMaterial.js';
import { TownKitAssets } from './TownKitAssets.js';
import { createTownKitMaterial, townKitShared } from './TownKitMaterial.js';
import { TownMaterialPalette } from './TownMaterialPalette.js';
import { TownStreamer } from './TownStreamer.js';

export const TOWN_INTERACT_CODE = 'KeyE';
/** What window glow is told the sun's elevation is under a night sky (radians). */
const NIGHT_ELEVATION = -0.2;

/**
 * Composition root for playable towns: streaming, doors, interiors.
 *
 * @param {object} options
 * @param {object} options.terrainView scene, floating origin, god rays
 * @param {() => object|null} options.getGenerator the active world generator
 * @param {number} options.tileSize
 * @param {string} options.baseUrl
 * @param {() => {x:number,z:number}|null} options.getFocusCanonical what the view looks at
 * @param {() => {x:number,y:number,z:number}|null} options.getWalkerCanonical the walking
 *   player's feet, or null while not walking
 * @param {() => boolean} [options.isNight] whether the sky is a night look (its light is the moon)
 * @param {(x:number, z:number, height:number, tileId:number|null) => number} [options.sampleSnow]
 *   ground snow 0..1 at a canonical point, matching the terrain's snow
 */
export function createTownRuntime({
  terrainView,
  getGenerator,
  tileSize,
  baseUrl,
  getFocusCanonical,
  getWalkerCanonical,
  isNight = () => false,
  sampleSnow = null,
}) {
  const assets = new TownKitAssets({ baseUrl });
  const palette = new TownMaterialPalette(assets, {
    createKit: createTownKitMaterial,
    createGlass: createTownGlassMaterial,
  });
  const sun = sunElevationReader(terrainView.scene);
  const streamer = new TownStreamer({
    scene: terrainView.scene,
    getGenerator,
    tileSize,
    floatingOrigin: terrainView.floatingOrigin,
    assets,
    palette,
    collisionSource: townCollisionSource,
    sampleSnow,
  });
  const doors = new TownDoorController({ streamer, collisionSource: townCollisionSource });
  const atmosphere = new TownInteriorAtmosphere({
    scene: terrainView.scene,
    godRays: terrainView.godRays,
    streamer,
    floatingOrigin: terrainView.floatingOrigin,
  });
  const prompt = new TownInteractionPrompt();
  let lastTimestamp = null;
  let walker = null;

  return {
    streamer,
    doors,
    /** Live town shading knobs (albedo lift, saturation, crevice depth, relief) for tuning. */
    shading: townKitShared,
    update(timestamp) {
      const delta = lastTimestamp === null ? 0 : (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;
      townKitShared.sunElevation.value = isNight() ? NIGHT_ELEVATION : sun();
      streamer.update(timestamp, getFocusCanonical());
      walker = getWalkerCanonical();
      const focused = doors.focus(walker);
      prompt.show(focused ? (doors.isOpen(focused) ? 'Close door' : 'Open door') : '');
      doors.update(Math.min(delta, 0.1));
      atmosphere.update(walker);
      PerfCounters.set('townsResident', streamer.stats.resident);
      PerfCounters.set('townInstances', streamer.stats.instances);
    },
    rebase() {
      streamer.rebase();
    },
    /** Capture-phase key handler; returns true when it consumed the key. */
    handleKey(event) {
      if (event.code !== TOWN_INTERACT_CODE || event.repeat || !walker) return false;
      return doors.toggle();
    },
    dispose() {
      prompt.dispose();
      atmosphere.dispose();
      streamer.dispose();
      palette.dispose();
      assets.dispose();
    },
  };
}

/**
 * Reads the sky rig's sun elevation (radians) for window glow. The rig's
 * directional light is found lazily: it is built after the town runtime.
 */
function sunElevationReader(scene) {
  let light = null;
  let searchIn = 0;
  const direction = { x: 0, y: 1, z: 0 };
  return () => {
    if ((!light || !light.parent) && searchIn-- <= 0) {
      light = null;
      searchIn = 120;
      for (const object of scene.children) {
        if (object.isDirectionalLight && object.castShadow) light = object;
      }
    }
    if (!light) return 0.7;
    direction.x = light.position.x - light.target.position.x;
    direction.y = light.position.y - light.target.position.y;
    direction.z = light.position.z - light.target.position.z;
    const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
    return Math.asin(Math.max(-1, Math.min(1, direction.y / length)));
  };
}
