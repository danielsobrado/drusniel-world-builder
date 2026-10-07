import { Box3, Sphere } from 'three/webgpu';

/** Shader displacement envelopes, including live tuning and body interaction. */
export function meadowBladeBoundsPadding(uniforms, tuning, dirtCut = 0) {
  const height = Math.abs(uniforms.bladeHeight.value)
    * Math.max(Math.abs(uniforms.heightScale.value.x), Math.abs(uniforms.heightScale.value.y))
    * Math.max(1, Math.abs(1 - dirtCut));
  const restAngle = Math.abs(uniforms.baseBend.value) * Math.PI / 2;
  const windAngle = 1.3; // The blade shader clamps wind before applying bend power.
  const vertical = height * (1
    + 1 - Math.cos(Math.min(restAngle, Math.PI)) + 1 - Math.cos(windAngle));
  const width = Math.abs(uniforms.bladeWidth.value * uniforms.widthScale.value * tuning.widthScale.value)
    * Math.max(1, Math.abs(uniforms.taper.value)) * 1.12
    * Math.max(1, uniforms.appearance.lodWidenMax.value)
    * Math.max(1, Math.abs(1 - uniforms.appearance.lodThinning.value));
  const horizontal = width + height * (
    Math.abs(uniforms.curve.value) * 1.3
    + Math.sin(Math.min(restAngle, Math.PI / 2)) + Math.sin(windAngle)
    + Math.abs(tuning.flutterStrength.value) * Math.sqrt(3.5)
  ) + Math.abs(uniforms.bladeHeight.value * uniforms.bladeWidth.value) * 2.8;
  return Math.max(horizontal, vertical) + 0.01;
}

export function meadowCardBoundsPadding(uniforms) {
  return Math.abs(uniforms.cardWidth.value) / 2 + Math.abs(uniforms.cardHeight.value) * 1.25 + 0.01;
}

/** Render-space bounds; each camera can cull the page independently. */
export class MeadowPageBounds {
  constructor(geometry, tileSize, padding) {
    this.geometry = geometry;
    this.halfSize = tileSize / 2;
    this.padding = padding;
    this.ground = new Box3();
    geometry.boundingBox = new Box3();
    geometry.boundingSphere = new Sphere();
  }

  update(tiles) {
    const box = this.ground;
    box.makeEmpty();
    for (const tile of tiles) {
      const output = tile.output;
      if (!output.count) continue;
      let minHeight = output.minHeight, maxHeight = output.maxHeight;
      if (!Number.isFinite(minHeight) || !Number.isFinite(maxHeight)) {
        minHeight = Infinity;
        maxHeight = -Infinity;
        for (let i = 0; i < output.count; i += 1) {
          const height = output.position[i * 4 + 1];
          minHeight = Math.min(minHeight, height);
          maxHeight = Math.max(maxHeight, height);
        }
      }
      box.min.set(Math.min(box.min.x, tile.renderX - this.halfSize),
        Math.min(box.min.y, minHeight), Math.min(box.min.z, tile.renderZ - this.halfSize));
      box.max.set(Math.max(box.max.x, tile.renderX + this.halfSize),
        Math.max(box.max.y, maxHeight), Math.max(box.max.z, tile.renderZ + this.halfSize));
    }
    this.refresh();
  }

  setPadding(padding) {
    if (padding === this.padding) return;
    this.padding = padding;
    this.refresh();
  }

  refresh() {
    const box = this.geometry.boundingBox.copy(this.ground);
    if (box.isEmpty()) {
      this.geometry.boundingSphere.center.set(0, 0, 0);
      this.geometry.boundingSphere.radius = 0;
    } else {
      box.expandByScalar(this.padding).getBoundingSphere(this.geometry.boundingSphere);
    }
  }
}
