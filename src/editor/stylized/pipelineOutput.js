import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { renderOutput } from 'three/tsl';

import { finishFrame } from './cinematicFinish.js';

/**
 * Finishes a post pipeline's output, with FXAA when asked.
 *
 * The god-rays pipelines are the walking view's whole post chain — they return
 * before the post-processing graph, so its temporal AA never runs there — and MSAA
 * stays off (renderer.antialias in editor.config.yaml: materials that sample the
 * depth texture fail validation against a multisampled target). FXAA is the edge
 * filter that fits: one full-screen pass over the finished image, no depth, no
 * history, and it softens exactly what aliases worst while walking — grass blades
 * and card cut-outs against the sky.
 *
 * FXAA works on display-space colour, so the pipeline's automatic tone mapping and
 * output transform are turned off and applied explicitly first.
 *
 * With a `finish` (cinematicFinish.js), the linear frame first takes the donor's
 * bloom and grade, ahead of the tone mapper, as grass-test's pipeline does.
 *
 * @param {import('three/webgpu').RenderPipeline} pipeline
 * @param {object} composite the scene-referred output node
 * @param {{ fxaa?: boolean, finish?: { beauty: object, settings: object, uniforms: object } | null }} [options]
 * @returns {{ pipeline: object, bloom: object | null }}
 */
export function setPipelineOutput(pipeline, composite, { fxaa: antialias = true, finish = null } = {}) {
  const finished = finish ? finishFrame(composite, finish) : { node: composite, bloom: null };
  let filter = null;
  // Pipelines are rebuilt when the camera or AO topology changes. RenderPipeline
  // frees only its quad material, so explicitly release this finish's targets.
  const dispose = pipeline.dispose.bind(pipeline);
  let disposed = false;
  pipeline.dispose = () => {
    if (disposed) return;
    disposed = true;
    finished.bloom?.dispose();
    filter?.textureNode.dispose();
    dispose();
  };
  if (!antialias) {
    pipeline.outputNode = finished.node;
    return { pipeline, bloom: finished.bloom };
  }
  pipeline.outputColorTransform = false;
  filter = fxaa(renderOutput(finished.node));
  pipeline.outputNode = filter;
  return { pipeline, bloom: finished.bloom };
}
