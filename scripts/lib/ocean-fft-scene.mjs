/**
 * In-app inspection of the offshore FFT (PR I phase I.3), run in the page by
 * run-coastal-review.mjs --ocean-fft-inspect: runtime state, every water slot's
 * cascade origins against the CPU formula, and the water materials' fragment
 * WGSL (texture/sampler/varying counts and a hash, read from the cached pipeline).
 */
export async function inspectOceanFftScene() {
  const editor = window.__editor, surface = editor.stylizedSurface, renderer = editor.terrainView.renderer;
  const { writeCascadeUvOrigins } = await import('/src/editor/water/fft/OceanFftCoordinates.js');
  const { CASCADE_CANDIDATES } = await import('/src/editor/water/fft/OceanFftConstants.js');
  const tiles = CASCADE_CANDIDATES.map((cascade) => cascade.tileSizeMeters);
  let checked = 0, worst = 0;
  for (const slot of surface.waterSlots) {
    const descriptor = slot.seaPhaseDescriptor;
    if (!descriptor) continue;
    const expected = writeCascadeUvOrigins(descriptor.centerWorldX, descriptor.centerWorldZ, tiles, [0, 0, 0, 0]);
    const actual = slot.oceanFftOrigin.value.toArray();
    worst = Math.max(worst, ...actual.map((value, i) => Math.abs(value - expected[i])));
    checked++;
  }
  // One water slot mesh per shared variant; getShaderAsync reads the cached pipeline's WGSL.
  const view = editor.terrainView, materials = [...surface.sharedWaterMaterials.materials.entries()];
  const hash = (text) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(16);
  const shaders = [];
  for (const [refraction, material] of materials) {
    const mesh = surface.waterSlots.map((slot) => slot.mesh).find((candidate) => candidate?.material === material);
    if (!mesh) continue;
    const { fragmentShader: wgsl, vertexShader } = await renderer.debug.getShaderAsync(view.scene, editor.viewModeController.camera, mesh);
    shaders.push({
      refraction,
      textures: (wgsl.match(/var\s+\w+\s*:\s*texture_\w+/g) ?? []).length,
      samplers: (wgsl.match(/var\s+\w+\s*:\s*sampler(?:_comparison)?\s*;/g) ?? []).length,
      // Interstage variables: user @location outputs of the vertex stage.
      varyings: new Set(vertexShader.match(/@location\(\s*\d+\s*\)(?=[^;{]*:)/g) ?? []).size,
      oceanFftReferenced: /oceanFft/i.test(wgsl),
      length: wgsl.length, hash: hash(wgsl), vertexHash: hash(vertexShader),
    });
  }
  // The underwater post (FFT caustics): its quad's fragment WGSL, once its pipeline exists (prewarm builds it).
  const post = editor.viewModeController?.playerController?.underwaterView?.causticsPostProcess;
  let underwaterPost = null;
  if (post) {
    post.prewarm(editor.viewModeController.camera);
    const quad = post.pipeline?._quadMesh;
    if (quad) {
      const { fragmentShader: wgsl } = await renderer.debug.getShaderAsync(quad, quad.camera, quad);
      underwaterPost = { textures: (wgsl.match(/var\s+\w+\s*:\s*texture_\w+/g) ?? []).length,
        oceanFftReferenced: /oceanFft/i.test(wgsl), length: wgsl.length, hash: hash(wgsl), status: post.getStatus() };
    }
  }
  const fft = surface.oceanFft;
  return {
    underwaterPost,
    oceanFft: fft ? { ...fft.runtime.diagnostics(), available: fft.binding.available.value, bindingGeneration: fft.binding.generation, tileSizes: fft.tileSizes,
      spectrumWind: { ...fft.spectrum.wind }, transitioning: fft.spectrum.transitioning } : null,
    slotOrigins: { checked, maxError: worst },
    materialVariants: materials.length,
    shaders,
  };
}
