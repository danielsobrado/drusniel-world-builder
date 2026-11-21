import assert from 'node:assert/strict';

export const coastalDiagnostics = [
  'terrain-wire', 'water-wire', 'depth', 'surface-height', 'bed-height', 'coverage', 'ocean',
  'waterline', 'transmission', 'palette', 'opacity', 'seabed', 'flat-displacement', 'swell-normal',
  'no-foam', 'slope', 'shore-distance', 'breaker', 'no-shadows',
  'seabed-height', 'seabed-albedo', 'seabed-roughness', 'seabed-normal', 'seabed-matte', 'seabed-no-swash',
];

export const coastalLayerControls = ['seabed', 'no-grass', 'no-grass-cards', 'no-grass-blades', 'no-shadows'];

function replace(source, anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, `Coastal diagnostic anchor changed: ${anchor}`);
  return source.replace(anchor, replacement);
}

// Rewrite only the owned browser's dev-server responses. No diagnostic graph is shipped.
export async function installCoastalDiagnostics(page) {
  await page.route(/\/(StylizedWaterMaterial|SeaSurfaceShading|terrainMaterial|CoastSwashShading)\.js(?:\?|$)/, async route => {
    const response = await route.fetch();
    const file = new URL(route.request().url()).pathname.split('/').at(-1);
    // Windows checkouts serve CRLF; the multi-line anchors below are written with LF.
    let body = (await response.text()).replace(/\r\n/g, '\n');
    // Vite has already transformed the source. Reuse its resolved TSL module URL.
    const tsl = /from ["']([^"']*three_tsl[^"']*)["']/.exec(body)?.[1];
    assert.ok(tsl, `Missing TSL module in ${file}`);
    const common = `import { uniform as qaUniform, float as qaFloat, vec3 as qaVec3, vec4 as qaVec4, uv as qaUv, mix as qaMix, smoothstep as qaSmooth } from ${JSON.stringify(tsl)};
const qaModes = ${JSON.stringify(coastalDiagnostics)};
const qaView = window.__coastalDebugMode ??= qaUniform(-1);
const qaMaterials = window.__coastalDebugMaterials ??= new WeakMap();
const qaIs = name => qaView.equal(qaModes.indexOf(name));
const qaLine = (value, width) => qaSmooth(0, width.max(1e-5), value.add(0.5).fract().sub(0.5).abs()).oneMinus();
const qaWire = segments => {
  const grid = qaUv().mul(segments), diagonal = grid.x.sub(grid.y);
  return qaLine(grid.x, grid.x.fwidth()).max(qaLine(grid.y, grid.y.fwidth())).max(qaLine(diagonal, diagonal.fwidth()));
};
`;
    if (file === 'StylizedWaterMaterial.js') {
      body = replace(body, 'if (sea) surfaceHeight = surfaceHeight.add(sea.displacement.mul(swing).mul(open));',
        'if (sea) surfaceHeight = surfaceHeight.add(sea.displacement.mul(swing).mul(open).mul(qaIs("flat-displacement").select(0, 1)));');
      body = replace(body, '  material.colorNode = lit;\n  material.opacityNode = alpha;', `
  const surfaceMeters = waterField.g.add(waterSurfaceOrigin);
  const diagnostics = {
    depth: qaVec3(waterField.b.div(12).clamp(0, 1)),
    'surface-height': qaVec3(positionWorld.y.sub(surfaceMeters).add(1).div(2).clamp(0, 1)),
    'bed-height': qaVec3(surfaceMeters.sub(waterField.b).add(16).div(16).clamp(0, 1)),
    coverage: qaVec3(waterCoverage), ocean: qaVec3(oceanWeight), waterline: qaVec3(waterlineFade),
    transmission: seaResponse?.transmission ?? qaVec3(bedVisibility),
    palette: seaOptics?.color ?? bodyColor, opacity: qaVec3(alpha),
    'shore-distance': qaVec3(shoreDistance.div(80).clamp(0, 1)),
    breaker: qaVec3(sea?.qaBreaking ?? qaFloat(0)),
    slope: sea ? sea.normal.mul(.5).add(.5) : qaVec3(.5, 1, .5),
  };
  material.colorNode = lit;
  material.opacityNode = alpha;
  qaMaterials.set(material, { color: lit, alpha, fields: diagnostics,
    fieldOpacity: waterDepth.greaterThan(0).select(1, 0),
    wire: qaMix(lit, qaVec3(.05, .75, 1), qaWire(waterFieldSize - 1).mul(0.55)) });`);
      body = replace(body, '    alpha = foamed.opacity;', '    alpha = qaIs("no-foam").select(alpha, foamed.opacity);');
      body = replace(body, '    color = foamed.color;', '    color = qaIs("no-foam").select(color, foamed.color);');
    } else if (file === 'SeaSurfaceShading.js') {
      body = replace(body, 'mix(displacedSurfaceSlope(), swellSlope, surf.offshore)',
        'mix(displacedSurfaceSlope(), swellSlope, qaIs("swell-normal").select(1, surf.offshore))');
      body = replace(body, '    surfFoam: surf?.foam.mul(seaMask),', '    surfFoam: surf?.foam.mul(seaMask), qaBreaking: surf?.breaking,');
    } else if (file === 'CoastSwashShading.js') {
      body = replace(body, '      return { color: result, roughness: resultRoughness };',
        '      const isolated = qaIs("no-foam").or(qaIs("seabed-no-swash"));\n' +
        '      return { color: isolated.select(color, result), roughness: isolated.select(roughness, resultRoughness) };');
    } else {
      const anchor = '    return assignTerrainMaterialData(material);';
      body = replace(body, anchor, `
    const qaBaseColor = material.colorNode;
    qaMaterials.set(material, { color: qaBaseColor,
      wire: qaMix(qaBaseColor, qaVec3(1, 0.28, 0.06), qaWire(width).mul(0.65)),
      output: material.outputNode, roughness: material.roughnessNode, matte: qaFloat(1), fields: {
        'seabed-height': qaVec4(qaVec3(positionWorld.y.add(16).div(16).clamp(0, 1)), 1),
        'seabed-albedo': qaVec4(qaBaseColor, 1),
        'seabed-roughness': qaVec4(qaVec3(material.roughnessNode), 1),
        'seabed-normal': qaVec4((material.normalNode ?? qaVec3(0, 1, 0)).mul(0.5).add(0.5), 1),
      } });
${anchor}`);
    }
    await route.fulfill({ response, body: common + body });
  });
}

export function setCoastalDiagnostic({ mode, index }) {
  const { terrainView, stylizedSurface } = window.__editor;
  if (window.__coastalDebugMode) window.__coastalDebugMode.value = index;
  const waterMaterials = new Set();
  for (const mesh of terrainView.scene.children) if (mesh.name.startsWith('stylized-water-')) {
    mesh.layers.mask = mode?.startsWith('seabed') || mode === 'terrain-wire' ? 0 : 1;
    waterMaterials.add(mesh.material);
  }
  for (const material of waterMaterials) {
    const probe = window.__coastalDebugMaterials?.get(material);
    if (!probe) continue;
    const field = probe.fields[mode];
    const color = field ?? (mode === 'water-wire' ? probe.wire : probe.color);
    const opacity = field ? probe.fieldOpacity : probe.alpha;
    if (material.colorNode === color && material.opacityNode === opacity) continue;
    material.colorNode = color;
    material.opacityNode = opacity;
    material.needsUpdate = true;
  }
  for (const material of new Set(terrainView.slots.map(slot => slot.mesh.material))) {
    const probe = window.__coastalDebugMaterials?.get(material);
    if (!probe) continue;
    const color = mode === 'terrain-wire' ? probe.wire : probe.color;
    const output = probe.fields[mode] ?? probe.output;
    const roughness = mode === 'seabed-matte' ? probe.matte : probe.roughness;
    if (material.colorNode === color && material.outputNode === output && material.roughnessNode === roughness) continue;
    material.colorNode = color;
    material.outputNode = output;
    material.roughnessNode = roughness;
    material.needsUpdate = true;
  }
  terrainView.renderer.shadowMap.enabled = mode !== 'no-shadows';
  const grassMasks = window.__coastalGrassMasks ??= new Map();
  for (const [mesh, mask] of grassMasks) mesh.layers.mask = mask;
  grassMasks.clear();
  window.__worldVisualQa.setLayers(mode === 'no-grass' ? { grass: false } : {});
  if (mode === 'no-grass-cards' || mode === 'no-grass-blades') {
    for (const mesh of stylizedSurface.meadowGrass.meshes) {
      if (mesh.name.startsWith('meadow-grass-cards-') !== (mode === 'no-grass-cards')) continue;
      grassMasks.set(mesh, mesh.layers.mask);
      mesh.layers.disableAll();
    }
  }
}
