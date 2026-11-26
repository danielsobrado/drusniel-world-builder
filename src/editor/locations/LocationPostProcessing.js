import * as THREE from 'three/webgpu';
import {
  mrt,
  normalView,
  output,
  packNormalToRGB,
  pass,
  renderOutput,
  velocity,
} from 'three/tsl';
import { PostProcessingHistory } from '../../render/postprocessing/PostProcessingHistory.js';
import { packMaterialDataNode } from '../../render/postprocessing/PostProcessingMaterialData.js';
import { AmbientOcclusionNode } from '../../render/postprocessing/nodes/AmbientOcclusionNode.js';
import { BloomNode } from '../../render/postprocessing/nodes/BloomNode.js';
import { HierarchicalDepthNode } from '../../render/postprocessing/nodes/HierarchicalDepthNode.js';
import { SelectiveSsrNode } from '../../render/postprocessing/nodes/SelectiveSsrNode.js';
import { ToneMappingNode } from '../../render/postprocessing/nodes/ToneMappingNode.js';
import { AtmosphericPassAdmission } from '../../render/postprocessing/AtmosphericPassAdmission.js';

const DEFAULT_AO_SETTINGS = Object.freeze({
  enabled: true,
  resolutionScale: 0.5,
  samples: 8,
  radius: 0.85,
  thickness: 0.85,
  intensity: 0.34,
});

const DEFAULT_SSR_SETTINGS = Object.freeze({
  enabled: true,
  resolutionScale: 0.5,
  maxSteps: 18,
  binarySteps: 4,
  maxDistanceMeters: 26,
  thicknessMeters: 0.55,
  roughnessCutoff: 0.24,
  intensity: 0.46,
  edgeFade: 0.14,
  temporalFeedback: 0.62,
});

const DEFAULT_BLOOM_SETTINGS = Object.freeze({
  enabled: true,
  threshold: 1.05,
  knee: 0.45,
  intensity: 0.26,
  bloomBoost: 0.85,
  levels: 4,
  radius: 1.0,
});

/**
 * Lightweight, location-scoped WebGPU TSL post-processing chain for Frostgard
 * ice locations (`GTAO Contact AO` -> `Selective Ice-Floor SSR` -> `HDR Bloom` ->
 * `ACES Filmic Tone Mapping`).
 *
 * Reinvests the unused grass-free mountain GPU budget inside ice caves while
 * staying completely isolated from the open-world post chain and disposing
 * every GPU target cleanly on location exit.
 */
export class LocationPostProcessing {
  constructor({
    renderer,
    scene,
    camera,
    exposure = 1.15,
    enableSsr = true,
    enableAo = true,
    enableBloom = true,
    atmosphericBudget = null,
  }) {
    this.renderer = renderer;
    this.atmosphericAdmission = atmosphericBudget ? new AtmosphericPassAdmission(atmosphericBudget, 'location') : null;
    this.camera = camera;
    this.disposed = false;
    this.width = 0;
    this.height = 0;
    this.pixelRatio = 1;
    this._size = new THREE.Vector2();

    this.settings = {
      ao: { ...DEFAULT_AO_SETTINGS, enabled: enableAo },
      ssr: { ...DEFAULT_SSR_SETTINGS, enabled: enableSsr },
      bloom: { ...DEFAULT_BLOOM_SETTINGS, enabled: enableBloom },
      toneMapping: {
        mode: 'aces',
        exposure,
        contrast: 1.03,
        saturation: 1.04,
      },
    };

    this.history = new PostProcessingHistory();
    const initialSize = renderer.getSize(this._size);
    const pr = renderer.getPixelRatio();
    const initW = Math.max(1, Math.floor(initialSize.x * pr));
    const initH = Math.max(1, Math.floor(initialSize.y * pr));

    if (enableSsr) {
      this.history.ensureSsrResources(
        Math.max(1, Math.floor(initW * this.settings.ssr.resolutionScale)),
        Math.max(1, Math.floor(initH * this.settings.ssr.resolutionScale)),
      );
    }

    this.scenePass = pass(scene, camera);
    this.scenePass.name = 'Location Ice Post Scene Pass';
    this.scenePass.setMRT(mrt({
      output,
      normal: packNormalToRGB(normalView),
      velocity,
      material: packMaterialDataNode(),
    }));

    const outTex = this.scenePass.getTexture('output');
    outTex.format = THREE.RGBAFormat;
    outTex.type = THREE.HalfFloatType;

    const normTex = this.scenePass.getTexture('normal');
    normTex.format = THREE.RGBAFormat;
    normTex.type = THREE.UnsignedByteType;
    normTex.colorSpace = THREE.NoColorSpace;

    const velTex = this.scenePass.getTexture('velocity');
    velTex.format = THREE.RGFormat;
    velTex.type = THREE.HalfFloatType;
    velTex.colorSpace = THREE.NoColorSpace;

    const matTex = this.scenePass.getTexture('material');
    matTex.format = THREE.RGBAFormat;
    matTex.type = THREE.UnsignedByteType;
    matTex.colorSpace = THREE.NoColorSpace;

    this.inputs = Object.freeze({
      output: this.scenePass.getTextureNode('output'),
      normal: this.scenePass.getTextureNode('normal'),
      velocity: this.scenePass.getTextureNode('velocity'),
      material: this.scenePass.getTextureNode('material'),
      depth: this.scenePass.getTextureNode('depth'),
    });

    this.ambientOcclusion = enableAo
      ? new AmbientOcclusionNode({
        sourceNode: this.inputs.output,
        depthNode: this.inputs.depth,
        normalNode: this.inputs.normal,
        camera,
        settings: this.settings.ao,
      })
      : null;
    const postAo = this.ambientOcclusion?.outputNode ?? this.inputs.output;

    this.hierarchicalDepth = enableSsr
      ? new HierarchicalDepthNode({
        rawDepthNode: this.inputs.depth,
        linearDepthNode: this.scenePass.getViewZNode().negate(),
        resolutionScale: this.settings.ssr.resolutionScale,
      })
      : null;
    this.ssr = this.hierarchicalDepth
      ? new SelectiveSsrNode({
        sourceNode: postAo,
        inputs: this.inputs,
        depthPyramid: this.hierarchicalDepth,
        history: this.history,
        settings: this.settings.ssr,
      })
      : null;
    const postSsr = this.ssr?.outputNode ?? postAo;

    this.bloom = enableBloom
      ? new BloomNode({
        sourceNode: postSsr,
        materialNode: this.inputs.material,
        settings: this.settings.bloom,
        exposure: this.settings.toneMapping.exposure,
        adaptiveAtmosphere: Boolean(this.atmosphericAdmission),
      })
      : null;

    this.toneMapping = new ToneMappingNode({
      sourceNode: postSsr,
      bloomNode: this.bloom?.outputNode ?? null,
      settings: this.settings.toneMapping,
      bloomIntensity: enableBloom ? this.settings.bloom.intensity : 0,
    });

    this.outputConversion = renderOutput(
      this.toneMapping.outputNode,
      THREE.NoToneMapping,
      renderer.outputColorSpace,
    );

    this.pipeline = new THREE.RenderPipeline(renderer);
    this.pipeline.outputColorTransform = false;
    this.pipeline.outputNode = this.outputConversion;

    this.resize(initialSize.x, initialSize.y, pr);
  }

  resize(width, height, pixelRatio = 1) {
    if (this.disposed) return;
    const pw = Math.max(1, Math.floor(width * pixelRatio));
    const ph = Math.max(1, Math.floor(height * pixelRatio));
    if (pw === this.width && ph === this.height && pixelRatio === this.pixelRatio) return;
    this.width = pw;
    this.height = ph;
    this.pixelRatio = pixelRatio;
    this.scenePass.setSize(pw, ph);
    this.ambientOcclusion?.resize(pw, ph);
    this.hierarchicalDepth?.resize(pw, ph);
    this.ssr?.resize(pw, ph);
    this.bloom?.resize(pw, ph);
  }

  render(camera) {
    if (this.disposed) return;
    const size = this.renderer.getSize(this._size);
    const pr = this.renderer.getPixelRatio();
    this.resize(size.x, size.y, pr);

    this.scenePass.camera = camera;
    const frameState = { camera, width: size.x, height: size.y, pixelRatio: pr };
    const previous = this.atmosphericAdmission?.reduced;
    const atmosphere = this.atmosphericAdmission?.update(performance.now()) ?? null;
    if (previous !== this.atmosphericAdmission?.reduced) this.history.ssrValid = false;
    this.ambientOcclusion?.updateUniforms(frameState, this.settings.ao, atmosphere);
    this.ssr?.updateUniforms(frameState, this.settings.ssr, atmosphere);
    this.bloom?.updateUniforms(this.settings.bloom, this.settings.toneMapping.exposure, atmosphere);
    this.toneMapping.updateUniforms(
      this.settings.toneMapping,
      this.settings.bloom.enabled ? this.settings.bloom.intensity : 0,
    );

    this.pipeline.render();
    if (this.ssr) this.history.latchSsrFrame();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ambientOcclusion?.dispose();
    this.ssr?.dispose();
    this.hierarchicalDepth?.dispose();
    this.bloom?.dispose();
    this.history.dispose();
    this.scenePass.dispose();
    this.pipeline.dispose();
  }
}
