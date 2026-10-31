import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { float, mix, screenUV, uniform } from 'three/tsl';

/**
 * Contact occlusion shared by the cinematic and volumetric god-ray pipelines.
 *
 * The default god rays own the whole frame (they bypass the post-processing
 * graph, and its ambient occlusion with it), so without this nothing darkens
 * the corners of a room, the foot of a wall or the gap under a table. It traces
 * GTAO over the depth the god-ray scene pass already writes, rebuilding normals
 * from that depth, so it adds no geometry pass — only the half-resolution trace.
 * It is still a whole-frame cost, so it is built only when enabled.
 *
 * @param {object} options
 * @param {import('three/tsl').Node} options.depth the scene pass's depth texture node
 * @param {object} options.camera
 * @param {?{ enabled?: boolean, resolutionScale?: number, samples?: number, radius?: number,
 *   thickness?: number, intensity?: number }} options.settings
 * @returns {?{ factor: import('three/tsl').Node, intensity: import('three/tsl').Node, dispose: () => void }} null when disabled
 */
export function createContactOcclusion({ depth, camera, settings }) {
  if (!settings?.enabled) return null;
  const trace = ao(depth, null, camera);
  trace.resolutionScale = settings.resolutionScale ?? 0.5;
  trace.useTemporalFiltering = false;
  trace.samples.value = settings.samples ?? 8;
  trace.radius.value = settings.radius ?? 0.5;
  trace.thickness.value = settings.thickness ?? 1;
  trace.scale.value = 1;
  const intensity = uniform(settings.intensity ?? 0.6);
  return {
    intensity,
    // Multiplies the scene colour: a restrained contact shadow, not a dirty outline.
    factor: mix(float(1), trace.getTextureNode().sample(screenUV).r, intensity),
    dispose: () => trace.dispose(),
  };
}
