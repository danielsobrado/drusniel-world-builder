import * as THREE from 'three/webgpu';
import {
  Fn,
  mix,
  rtt,
  sample,
  screenUV,
  uniform,
  unpackRGBToNormal,
  vec4,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';

/**
 * Screen-space ambient occlusion over the world scene pass.
 *
 * GTAO reads the depth and packed view normals the scene MRT pass already
 * writes, so enabling it adds no geometry pass — only the half-resolution AO
 * trace and its composite. It is still a whole-frame cost, so the graph only
 * builds this node when `ambientOcclusion.enabled` is set (the topology
 * signature recompiles on toggle), and it is off by default: it exists for
 * close building views and photographs, where crevices between stones and
 * the contact of walls with the ground carry the image.
 *
 * The occlusion multiplies the HDR scene colour. That darkens direct light as
 * well as ambient, which a lighting-context AO would not; `intensity` keeps it
 * to a restrained contact shadow rather than a dirty outline.
 */
export class AmbientOcclusionNode {
  constructor({ sourceNode, depthNode, normalNode, camera, settings }) {
    this.settings = settings;
    this.camera = camera;
    const normal = sample((uv) => unpackRGBToNormal(normalNode.sample(uv)));
    this.aoPass = ao(depthNode, normal, camera);
    this.aoPass.resolutionScale = settings.resolutionScale;
    this.aoPass.useTemporalFiltering = false;
    this.intensity = uniform(settings.intensity);
    this.applySettings(settings);
    const occlusionNode = this.aoPass.getTextureNode();
    // Downstream nodes sample their source at arbitrary UVs, so the composite
    // lands in its own target rather than staying an inline expression.
    this.compositeNode = rtt(Fn(() => {
      const source = sourceNode.sample(screenUV);
      const factor = mix(1, occlusionNode.sample(screenUV).r, this.intensity);
      return vec4(source.rgb.mul(factor), source.a);
    })(), 1, 1, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      colorSpace: THREE.NoColorSpace,
      depthBuffer: false,
    });
    this.compositeNode.renderTarget.texture.generateMipmaps = false;
    this.outputNode = this.compositeNode;
  }

  resize(width, height) {
    this.compositeNode.setSize(width, height);
  }

  get resolutionScale() {
    return this.aoPass.resolutionScale;
  }

  applySettings(settings) {
    this.settings = settings;
    // GTAO recompiles its own material when the sample count changes.
    this.aoPass.samples.value = settings.samples;
    this.aoPass.radius.value = settings.radius;
    this.aoPass.thickness.value = settings.thickness;
    this.aoPass.scale.value = 1;
    this.intensity.value = settings.intensity;
  }

  updateUniforms(frameState, settings) {
    // The graph keeps its topology across editor/player camera switches, and
    // GTAO captured the first camera's matrices and clip planes by reference.
    const camera = frameState.camera;
    if (camera && camera !== this.camera) {
      this.camera = camera;
      this.aoPass._cameraProjectionMatrix.value = camera.projectionMatrix;
      this.aoPass._cameraProjectionMatrixInverse.value = camera.projectionMatrixInverse;
      this.aoPass._cameraNear.object = camera;
      this.aoPass._cameraFar.object = camera;
    }
    this.applySettings(settings ?? this.settings);
  }

  dispose() {
    this.aoPass.dispose();
    this.compositeNode._quadMesh?.material?.dispose();
    this.compositeNode.renderTarget.dispose();
  }
}
