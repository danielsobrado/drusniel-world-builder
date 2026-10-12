/**
 * Packs live particles into five vec4 instance streams, sorted back to front
 * so alpha-blended smoke composites correctly over the additive fire it
 * shares a draw call with.
 *
 *   A  position.xyz, size
 *   B  rotation, tile (fractional = flipbook blend), heat, alpha
 *   C  axis.xyz (or plane normal), axis length
 *   D  tint.rgb, emissive
 *   E  ramp·4 + orient + seed·0.9, lit + 2·billow, additive, life fraction
 *
 * Seven vertex buffers in all with position and uv — under WebGPU's eight.
 */
export const PARTICLE_STREAMS = Object.freeze(['vfxA', 'vfxB', 'vfxC', 'vfxD', 'vfxE']);

export function createParticleBufferWriter(capacity) {
  const streams = Object.fromEntries(PARTICLE_STREAMS.map((name) => [name, new Float32Array(capacity * 4)]));
  const depth = new Float32Array(capacity);
  const order = new Uint32Array(capacity);
  const look = {};

  /**
   * @param {ReturnType<import('./ParticleSimulator.js').createParticleSimulator>} simulator
   * @param {{ x: number, y: number, z: number }} cameraPosition
   * @param {{ x: number, y: number, z: number }} cameraForward
   * @returns {number} instances written
   */
  const write = (simulator, cameraPosition, cameraForward) => {
    const { state } = simulator;
    const count = simulator.count;
    for (let i = 0; i < count; i += 1) {
      order[i] = i;
      depth[i] = (state.px[i] - cameraPosition.x) * cameraForward.x
        + (state.py[i] - cameraPosition.y) * cameraForward.y
        + (state.pz[i] - cameraPosition.z) * cameraForward.z;
    }
    const sorted = order.subarray(0, count);
    sorted.sort((a, b) => depth[b] - depth[a]);

    const { vfxA, vfxB, vfxC, vfxD, vfxE } = streams;
    let written = 0;
    for (let k = 0; k < count; k += 1) {
      const i = sorted[k];
      const type = simulator.evaluate(i, look);
      let alpha = look.alpha;
      if (type.cameraFade) {
        const dx = state.px[i] - cameraPosition.x;
        const dy = state.py[i] - cameraPosition.y;
        const dz = state.pz[i] - cameraPosition.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // Big sprites near the lens fill the screen: fade them well before contact.
        const clearance = (distance - 0.3 - look.size * 0.35) / (look.size * 0.8 + 0.5);
        alpha *= clearance <= 0 ? 0 : clearance >= 1 ? 1 : clearance;
      }
      if (alpha <= 0.002 || look.size <= 0) continue;
      const o = written * 4;
      vfxA[o] = state.px[i]; vfxA[o + 1] = state.py[i]; vfxA[o + 2] = state.pz[i]; vfxA[o + 3] = look.size;
      vfxB[o] = state.rot[i]; vfxB[o + 1] = look.tile; vfxB[o + 2] = look.heat; vfxB[o + 3] = alpha;
      vfxC[o] = look.ax; vfxC[o + 1] = look.ay; vfxC[o + 2] = look.az; vfxC[o + 3] = look.axLen;
      vfxD[o] = look.r; vfxD[o + 1] = look.g; vfxD[o + 2] = look.b; vfxD[o + 3] = state.emissive[i];
      vfxE[o] = type.ramp * 4 + look.orient + look.seed * 0.9;
      vfxE[o + 1] = type.lit + (type.billow ? 2 : 0);
      vfxE[o + 2] = look.additive;
      vfxE[o + 3] = look.lifeT;
      written += 1;
    }
    return written;
  };

  return { streams, write };
}
