import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';

/** Two shadow cascades under the existing sun; no additional illumination. */
export class CascadedSunShadows {
  constructor(light, distance) {
    this.light = light;
    this.previous = light.shadow.shadowNode;
    this.node = new CSMShadowNode(light, { cascades: 2, maxFar: distance, lightMargin: distance, mode: 'practical' });
    this.node.fade = true;
    light.shadow.shadowNode = this.node;
    this.signature = '';
  }

  prepare(camera) {
    if (!this.node.mainFrustum) return; // Three initializes on the first actual pass.
    const signature = [camera.uuid, camera.near, camera.far, ...camera.projectionMatrix.elements].join(',');
    this.node.camera = camera;
    if (signature !== this.signature) { this.node.updateFrustums(); this.signature = signature; }
  }

  dispose() {
    if (this.light.shadow.shadowNode === this.node) this.light.shadow.shadowNode = this.previous;
    this.node.dispose();
  }
}
