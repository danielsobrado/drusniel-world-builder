import * as THREE from 'three/webgpu';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { skyAmbientColor } from './skyAmbient.js';

const lightColor = new THREE.Color();
const luminance = (color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;

function illuminance(look) {
  const sky = luminance(skyAmbientColor(look, lightColor));
  const ground = luminance(lightColor.set(look.groundLightColor));
  const sun = luminance(lightColor.set(look.directionalColor));
  return (sky + ground) * 0.5 * look.ambientIntensity + sun * look.directionalIntensity;
}

/** Scale the existing HDR by resolved light energy; exposure remains an output operation. */
export function environmentLightScale(look, baseLook) {
  const base = illuminance(baseLook);
  return base > 1e-6 ? Math.max(0, Math.min(1.5, illuminance(look) / base)) : 0;
}

/**
 * The scene's image-based light, after grass-test's `loadEnvironment`: a soft
 * outdoor HDR (Poly Haven's "Zwartkops Straight Morning", CC0) as
 * `scene.environment` at a low intensity.
 *
 * Standard materials take their ambient fill and their reflections from it.
 * Without one, anything metallic — the hero's armour above all — has nothing to
 * reflect and reads as a black cut-out against the light, and every standard
 * surface loses the soft sky fill the donor's look is built on.
 *
 * Loaded in the background; the world renders without it until it arrives.
 *
 * @param {THREE.Scene} scene
 * @param {{ url?: string, intensity?: number } | null | undefined} settings sky.environment
 * @returns {{ ready: Promise<THREE.Texture | null>, setLightScale: (scale: number) => void, dispose: () => void }}
 */
export function applySceneEnvironment(scene, settings) {
  if (!settings?.url || settings.enabled === false) {
    return { ready: Promise.resolve(null), setLightScale() {}, dispose() {} };
  }
  let texture = null;
  let disposed = false;
  let lightScale = 1;
  const ready = new HDRLoader().loadAsync(settings.url)
    .then((loaded) => {
      if (disposed) {
        loaded.dispose();
        return null;
      }
      loaded.mapping = THREE.EquirectangularReflectionMapping;
      texture = loaded;
      scene.environment = loaded;
      scene.environmentIntensity = (settings.intensity ?? 0.3) * lightScale;
      return loaded;
    })
    .catch((error) => {
      console.warn('Scene environment could not be loaded; lighting stays without it.', error);
      return null;
    });
  return {
    ready,
    setLightScale(scale) {
      if (disposed || !Number.isFinite(scale)) return;
      lightScale = Math.max(0, Math.min(1.5, scale));
      if (texture && scene.environment === texture) {
        scene.environmentIntensity = (settings.intensity ?? 0.3) * lightScale;
      }
    },
    dispose() {
      disposed = true;
      if (texture && scene.environment === texture) scene.environment = null;
      texture?.dispose();
    },
  };
}
