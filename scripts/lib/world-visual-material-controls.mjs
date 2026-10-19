/** Capture-only overrides. Shared materials stay shared; restoring disposes only
 * diagnostic clones and restores every touched object/layer/fog descriptor. */
export async function setVisualMaterialControl(page, control = 'restore') {
  return page.evaluate(async control => {
    const editor = window.__editor, scene = editor.terrainView.scene;
    const previous = window.__visualMaterialControl;
    if (previous) {
      for (const [mesh, material, mask] of previous.meshes) {
        mesh.material = material; mesh.layers.mask = mask;
      }
      for (const material of previous.materials) material.dispose();
      if (previous.fog) Object.defineProperty(scene.fog, 'density', previous.fog);
      for (const [target, key, descriptor] of previous.properties ?? []) Object.defineProperty(target, key, descriptor);
      window.__visualMaterialControl = null;
    }
    if (control === 'restore') return { restored: true };
    const allowed = ['albedo', 'terrain-normals', 'terrain-flat-normals', 'terrain-matte',
      'grass-mask', 'forest-mask', 'path-mask', 'distance-fog-off', 'local-mist-off', 'water-hidden', 'material-weights'];
    if (!allowed.includes(control)) throw new Error(`Unknown material control: ${control}`);
    const state = window.__visualMaterialControl = { meshes: [], materials: new Set(), fog: null, properties: [] };
    if (control === 'local-mist-off') {
      const { jungleMistUniforms } = await import('/src/editor/stylized/ambient/JungleMist.js');
      const weights = [editor.terrainView.valleyFog?.uniforms?.weight, jungleMistUniforms.weight].filter(Boolean);
      const values = weights.map(weight => weight.value);
      for (const weight of weights) {
        state.properties.push([weight, 'value', Object.getOwnPropertyDescriptor(weight, 'value')]);
        Object.defineProperty(weight, 'value', { configurable: true, get: () => 0, set: () => {} });
      }
      return { control, weights: values, interpretation: 'Local valley and jungle mist disabled; distance fog and finishing retained.' };
    }
    if (control === 'distance-fog-off') {
      state.fog = Object.getOwnPropertyDescriptor(scene.fog, 'density');
      Object.defineProperty(scene.fog, 'density', { configurable: true, get: () => 0, set: () => {} });
      return { control, interpretation: 'Distance fog only; local mist and finishing remain active.' };
    }
    if (control === 'water-hidden') {
      for (const slot of editor.stylizedSurface.waterSlots) {
        state.meshes.push([slot.mesh, slot.mesh.material, slot.mesh.layers.mask]); slot.mesh.layers.disableAll();
      }
      return { control, count: state.meshes.length };
    }
    // Evaluation runs outside Vite's module transform. Reuse the exact TSL
    // dependency URL of the frozen production shader rather than a bare import.
    const noiseSource = await (await fetch('/src/editor/stylized/StylizedNoiseNodes.js')).text();
    const tslUrl = noiseSource.match(/from\s*['"]([^'"]*three_tsl[^'"]*)['"]/)?.[1];
    if (!tslUrl) throw new Error('Cannot resolve the frozen shader TSL dependency.');
    const { float, faceDirection, normalViewGeometry, uv, vec2, vec3, vec4 } = await import(tslUrl);
    const { slotTexture, slotVector2, createSlotBakeGpuState } = await import('/src/editor/materials/TerrainSlotBindings.js');
    const { getTerrainMaterialBakeGpuState } = await import('/src/editor/materials/TerrainMaterialBakeGpu.js');
    const { stylizedNaturalTrailMask } = await import('/src/editor/stylized/StylizedNoiseNodes.js');
    const slots = editor.terrainView.slots, template = slots.find(slot => slot.descriptor);
    const terrain = new Set(slots.map(slot => slot.mesh));
    const tree = editor.stylizedSurface.treeView, treeMeshes = new Set();
    for (const root of tree.root ? [tree.root] : (tree.meshes ?? []).flat(Infinity)) {
      root?.traverse(mesh => { if (mesh.isMesh) treeMeshes.add(mesh); });
    }
    const clones = new Map();
    scene.traverse(mesh => {
      if (!mesh.isMesh || (!terrain.has(mesh) && !(control === 'albedo' && treeMeshes.has(mesh)))) return;
      const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const replacements = originals.map(original => {
        if (clones.has(original)) return clones.get(original);
        const material = original.clone();
        if (!['terrain-matte', 'terrain-flat-normals'].includes(control)) material.fog = false;
        if (control === 'terrain-matte') material.roughnessNode = float(1);
        else if (control === 'terrain-flat-normals') material.normalNode = normalViewGeometry.mul(faceDirection);
        else {
          let value = original.colorNode ?? vec3(...original.color.toArray());
          if (control === 'terrain-normals') value = (original.normalNode ?? normalViewGeometry).mul(.5).add(.5);
          if (control === 'material-weights') {
            const bake = createSlotBakeGpuState(getTerrainMaterialBakeGpuState(template.mesh));
            const weights = bake.sampleTexture('materialWeights', uv());
            value = vec3(weights.r, weights.g, weights.b.max(weights.a));
          }
          if (control === 'grass-mask' || control === 'forest-mask' || control === 'path-mask') {
            const surface = slotTexture('surfaceMaskTexture', template.surfaceMaskTexture, uv());
            if (control === 'grass-mask') value = vec3(surface.g);
            if (control === 'forest-mask') value = slotTexture('forestFloorTexture', template.forestFloorTexture, uv()).rgb;
            if (control === 'path-mask') {
              const center = slotVector2('chunkCenter', template.chunkCenter);
              const world = center.add(vec2(uv().x.sub(.5), float(.5).sub(uv().y)).mul(editor.terrainView.chunkWorldSize));
              const config = editor.config.stylizedSurface.path.naturalTrail;
              const natural = stylizedNaturalTrailMask(world, Object.fromEntries(
                ['scale', 'level', 'width', 'softness', 'warp'].map(key => [key, float(config[key])])));
              value = vec3(surface.r.max(natural.mul(surface.g)));
            }
          }
          material.fragmentNode = vec4(value, 1);
        }
        material.needsUpdate = true; clones.set(original, material); state.materials.add(material); return material;
      });
      state.meshes.push([mesh, mesh.material, mesh.layers.mask]);
      mesh.material = Array.isArray(mesh.material) ? replacements : replacements[0];
    });
    await editor.terrainView.renderer.compileAsync(scene, editor.viewModeController.camera);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { control, objects: state.meshes.length, materials: state.materials.size,
      interpretation: control === 'albedo' ? 'Unlit material color graph; output atmosphere and display finishing retained.' :
        'Only the named terrain input changes; other scene layers and display finishing retained.',
      camera: editor.viewModeController.camera.position.toArray() };
  }, control);
}
