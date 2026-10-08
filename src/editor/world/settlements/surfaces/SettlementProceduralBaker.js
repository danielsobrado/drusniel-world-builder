import * as THREE from 'three/webgpu';
import { dot, mix, mrt, output, positionLocal, smoothstep, texture, uv, vec2, vec3, vec4 } from 'three/tsl';
import { ProceduralMaterial } from 'procedural-texture-lab';

/** Edge length, in texels, of a generated set. */
const SIZE = 512;
/**
 * Share of a tile baked past its far edges and cross-faded back over its near
 * ones. A procedural field is not periodic; this is what lets the result repeat.
 */
const SEAM = 0.18;
const LUMA = vec3(0.2126, 0.7152, 0.0722);

const CHANNELS = Object.freeze(['color', 'normal', 'arm']);

function configure(map) {
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.anisotropy = 16;
  map.userData.sharedSurface = true;
  return map;
}

function target(size, count = 1) {
  // Half-float throughout: the albedo is linear, and one format lets one pass fill all three.
  return new THREE.RenderTarget(size, size, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, count });
}

/**
 * The three channel groups of a set, as colours a flat quad can be drawn in.
 *
 * A runtime that offers `createSurfaceNodes` is asked for the surface at the
 * quad's own position: the layer stack is then compiled once, with no vertex
 * displacement, and the height comes with it. `heightRange` is the height, in
 * metres, that maps to the full range of the packed channel.
 */
function channelNodes(procedural, heightRange) {
  if (typeof procedural.createSurfaceNodes === 'function') {
    const surface = procedural.createSurfaceNodes(positionLocal, vec3(0, 0, 1));
    const height = surface.displacement;
    // Slope per metre along each axis of the tile; dividing by the position's
    // own derivative keeps the sign right whichever way the target is stored.
    const slope = vec2(height.dFdx().div(positionLocal.x.dFdx()), height.dFdy().div(positionLocal.y.dFdy()));
    return {
      positionNode: null,
      color: surface.color,
      // Packed as three reads it: occlusion in red, roughness in green, metalness in blue.
      arm: vec4(surface.ao, surface.roughness.clamp(0.045, 1), surface.metallic.clamp(0, 1), height.div(heightRange).mul(0.5).add(0.5).clamp(0, 1)),
      normal: vec4(vec3(slope.negate(), 1).normalize().mul(0.5).add(0.5), 1),
    };
  }
  const source = procedural.material;
  return {
    // The material's position node also feeds the sample position its other nodes read.
    positionNode: source.positionNode,
    color: source.colorNode,
    arm: vec4(source.aoNode, source.roughnessNode, source.metalnessNode, 1),
    // Seen square-on, the material's view-space normal *is* its tangent-space one.
    normal: vec4(source.normalNode.mul(0.5).add(0.5), 1),
  };
}

/**
 * Generates settlement surface sets from Procedural Texture Lab recipes, in GPU
 * memory.
 *
 * A recipe is a few kilobytes of layers and graph. The PTL runtime compiles it
 * to a node material; this draws that material's own colour, normal and
 * AO/roughness/metalness nodes onto a square of ground in one pass, slightly
 * oversized, and resolves the overshoot back across the opposite edges so the
 * tile repeats.
 * Nothing is downloaded but the recipe.
 */
export class SettlementProceduralBaker {
  constructor(renderer) {
    this.renderer = renderer;
    this.quad = new THREE.QuadMesh();
    this.queue = Promise.resolve();
  }

  /** Run `render` with `renderTarget` (and `outputs`, if several) bound, leaving the renderer as it was. */
  draw(renderTarget, outputs, render) {
    const { renderer } = this;
    const previousTarget = renderer.getRenderTarget();
    const previousMrt = renderer.getMRT?.() ?? null;
    renderer.setMRT?.(outputs);
    renderer.setRenderTarget(renderTarget);
    try {
      return render();
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setMRT?.(previousMrt);
    }
  }

  /**
   * @param {object} recipe a parsed `.ptl.json` material recipe
   * @param {{ name: string, bakeMetres: number, tileMetres?: number, repeat?: number, neutralGain?: number }} set
   * @returns {Promise<{ name: string, tileMetres: number, color: THREE.Texture,
   *   normal: THREE.Texture, arm: THREE.Texture, dispose: () => void }>}
   */
  bake(recipe, set) {
    // One at a time: bakes share the renderer's target and MRT state across awaits.
    const result = this.queue.then(() => this.bakeNow(recipe, set));
    this.queue = result.catch(() => {});
    return result;
  }

  async bakeNow(recipe, set) {
    const started = performance.now();
    const procedural = new ProceduralMaterial(recipe, { coordinateSpace: 'object', textureFieldSource: 'generated' });
    const oversize = 1 + SEAM;
    const extent = set.bakeMetres * oversize;
    const geometry = new THREE.PlaneGeometry(extent, extent).translate(extent / 2, extent / 2, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, extent, extent, 0, -10, 10);
    const raw = target(Math.round(SIZE * oversize), CHANNELS.length);
    CHANNELS.forEach((channel, index) => { raw.textures[index].name = channel; });
    const paint = new THREE.MeshBasicNodeMaterial();
    const resolved = target(SIZE);
    const finished = {};
    try {
      await procedural.prepare();
      const nodes = channelNodes(procedural, Math.max(procedural.displacementExtent, 1e-3));
      if (nodes.positionNode) paint.positionNode = nodes.positionNode;
      paint.colorNode = nodes.color;
      scene.add(new THREE.Mesh(geometry, paint));
      // One pass fills all three channels, so the recipe's (large) shader is
      // compiled once — and off the frame: a synchronous compile of it stalls
      // the GPU for seconds, and the whole game with it.
      const outputs = mrt({ color: output, normal: nodes.normal, arm: nodes.arm });
      await this.draw(raw, outputs, () => this.renderer.compileAsync(scene, camera));
      this.draw(raw, outputs, () => this.renderer.render(scene, camera));
      CHANNELS.forEach((channel, index) => {
        const blend = new THREE.MeshBasicNodeMaterial();
        blend.colorNode = this.resolveNode(raw.textures[index], channel === 'color' ? set.neutralGain : undefined);
        // The packed map keeps its fourth channel: the height.
        blend.opacityNode = blend.colorNode.a;
        this.quad.material = blend;
        this.draw(resolved, null, () => this.quad.render(this.renderer));
        blend.dispose();
        finished[channel] = this.keep(resolved);
        finished[channel].repeat.set(set.repeat ?? 1, set.repeat ?? 1);
      });
    } catch (error) {
      for (const map of Object.values(finished)) map.dispose();
      throw error;
    } finally {
      geometry.dispose();
      paint.dispose();
      raw.dispose();
      resolved.dispose();
      procedural.dispose();
    }
    return Object.freeze({
      name: set.name,
      tileMetres: set.tileMetres,
      /** Wall-clock milliseconds generation took, compiles included. */
      generatedMs: performance.now() - started,
      ...finished,
      dispose: () => {
        for (const map of Object.values(finished)) map.dispose();
      },
    });
  }

  /**
   * The resolved channel as an ordinary texture, copied GPU to GPU, so one
   * target serves all three channels and the result is mipmapped like any
   * image. The copy never touches the CPU: the editor runtime does no readback
   * (tests/webGpuRuntimeContract).
   *
   * Its texels therefore exist only on the GPU. Disposing the texture loses
   * them — unlike a loaded image, which three simply uploads again — which is
   * why every set is flagged `sharedSurface` and the workshop's material
   * clean-up must leave such textures alone.
   */
  keep(renderTarget) {
    const { width, height } = renderTarget;
    const map = configure(new THREE.DataTexture(new Uint16Array(width * height * 4), width, height, THREE.RGBAFormat, THREE.HalfFloatType));
    map.generateMipmaps = true;
    map.needsUpdate = true;
    this.renderer.initTexture(map);
    this.renderer.copyTextureToTexture(renderTarget.texture, map);
    return map;
  }

  /**
   * The oversized bake resolved to one repeating tile: inside the seam band a
   * texel fades to the one a whole tile further on, so each edge ends on exactly
   * the value the opposite edge starts from.
   */
  resolveNode(raw, neutralGain) {
    const tile = 1 / (1 + SEAM);
    // A render target is stored top row first and `keep` copies it as stored,
    // so the tile is written upside down here to come out upright there.
    const at = vec2(uv().x, uv().y.oneMinus());
    const sample = (offsetX, offsetY) => texture(raw, at.add(vec2(offsetX, offsetY)).mul(tile));
    const wrapX = smoothstep(0, SEAM, at.x).oneMinus();
    const wrapY = smoothstep(0, SEAM, at.y).oneMinus();
    const blended = mix(mix(sample(0, 0), sample(1, 0), wrapX), mix(sample(0, 1), sample(1, 1), wrapX), wrapY);
    // A tintable set keeps only its light and dark; the engine supplies the hue.
    return neutralGain ? vec4(vec3(dot(blended.rgb, LUMA).mul(neutralGain)), 1) : blended;
  }

  dispose() {
    this.quad.material?.dispose?.();
  }
}
