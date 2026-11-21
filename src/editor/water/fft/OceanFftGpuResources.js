import * as THREE from 'three/webgpu';
import { oceanFftByteBudget } from './OceanFftGpuLayout.js';

/**
 * Every GPU allocation of one FFT configuration (PR I phase I.2), sized by
 * OceanFftGpuLayout. Owned by OceanFftRuntime; nothing else creates or frees
 * these. Layout of the buffers: see OceanFftGpuLayout.js.
 *
 * Output: one RG16F RenderTarget array, layer c = cascade c, N×N, texel
 * (x, z) = (∂H/∂x, ∂H/∂z) at (x·L/N, z·L/N) — row z, column x, as written by
 * the output pass from screen coordinates. Linear data (NoColorSpace), repeat
 * wrapped, trilinear with a full mip chain.
 */
export class OceanFftGpuResources {
  constructor(topology) {
    const { size, cascades, total } = topology;
    this.topology = topology;
    this.bytes = oceanFftByteBudget(topology);
    this.h0 = named(new THREE.StorageBufferAttribute(new Float32Array(4 * total), 4), 'ocean-fft-h0');
    this.cycles = named(new THREE.StorageBufferAttribute(new Float32Array(total), 1), 'ocean-fft-cycles');
    this.ping = named(new THREE.StorageBufferAttribute(new Float32Array(2 * total), 2), 'ocean-fft-ping');
    this.pong = named(new THREE.StorageBufferAttribute(new Float32Array(2 * total), 2), 'ocean-fft-pong');
    this.output = new THREE.RenderTarget(size, size, {
      depth: cascades, type: THREE.HalfFloatType, format: THREE.RGFormat, colorSpace: THREE.NoColorSpace,
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, depthBuffer: false, stencilBuffer: false,
    });
    this.output.texture.name = 'ocean-fft-slope';
    this.disposed = false;
  }

  /** Copy packed upload arrays into the input buffers; the renderer re-uploads on its next dispatch. */
  upload({ h0, cycles }) {
    this.h0.array.set(h0);
    this.cycles.array.set(cycles);
    this.h0.needsUpdate = true;
    this.cycles.needsUpdate = true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.output.dispose();
    // r187 BufferAttribute.dispose() makes the renderer destroy the GPU buffer.
    for (const buffer of [this.h0, this.cycles, this.ping, this.pong]) buffer.dispose();
  }
}

function named(attribute, name) {
  attribute.name = name;
  return attribute;
}
