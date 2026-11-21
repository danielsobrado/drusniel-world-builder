/**
 * In-app inspection of the offshore FFT (PR I phase I.3), run in the page by
 * run-coastal-review.mjs --ocean-fft-inspect: runtime state, every water slot's
 * cascade origins against the CPU formula, and the water materials' fragment
 * WGSL (texture/sampler counts and a hash, captured by forcing one rebuild).
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
  const materials = [...surface.sharedWaterMaterials.materials.entries()];
  const captured = new Map();
  const previous = renderer.debug.onNodeBuilderCreated;
  renderer.debug.onNodeBuilderCreated = (builder, target) => {
    previous?.(builder, target);
    const entry = materials.find(([, material]) => material === builder.material);
    if (!entry) return;
    for (const name of ['build', 'buildAsync']) {
      const original = builder[name];
      if (!original) continue;
      builder[name] = function wrapped(...args) {
        const record = () => captured.set(entry[0], builder.fragmentShader);
        const result = original.apply(this, args);
        if (result?.then) return result.then((value) => { record(); return value; });
        record();
        return result;
      };
    }
  };
  for (const [, material] of materials) material.needsUpdate = true;
  for (let i = 0; i < 60 && captured.size < materials.length; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
  renderer.debug.onNodeBuilderCreated = previous;
  const hash = (text) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(16);
  const shaders = [...captured].map(([refraction, wgsl]) => ({
    refraction,
    textures: (wgsl.match(/var\s+\w+\s*:\s*texture_\w+/g) ?? []).length,
    samplers: (wgsl.match(/var\s+\w+\s*:\s*sampler(?:_comparison)?\s*;/g) ?? []).length,
    oceanFftReferenced: /oceanFft/i.test(wgsl),
    length: wgsl.length, hash: hash(wgsl),
  }));
  const fft = surface.oceanFft;
  return {
    oceanFft: fft ? { ...fft.runtime.diagnostics(), available: fft.binding.available.value, bindingGeneration: fft.binding.generation, tileSizes: fft.tileSizes } : null,
    slotOrigins: { checked, maxError: worst },
    materialVariants: materials.length,
    shaders,
  };
}
