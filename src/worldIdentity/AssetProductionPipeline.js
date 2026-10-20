import fs from 'node:fs';
import path from 'node:path';

import {
  ASSET_CANDIDATE_LIST,
  ASSET_REGISTRY,
  getAssetCandidate,
  summarizeAssetBacklog,
} from './AssetRegistry.js';
import {
  ENVIRONMENTAL_OVERLAYS,
  LORE_REALM_CATALOG,
} from './VisualIdentityCatalog.js';

export const REQUIRED_REFERENCE_VIEWS = Object.freeze([
  'hero',
  'front',
  'left',
  'rear',
  'top',
  'detail',
]);

export const REQUIRED_PBR_MAPS = Object.freeze([
  'basecolor',
  'normal',
  'roughness',
  'ao',
  'height',
]);

const NEGATIVE_PROMPT_ORTHO = 'perspective distortion, vanishing point, fisheye, wide angle lens, dramatic cast shadows, fog, vignette, cut-off roof, cropped foundation, floating elements, text watermark, characters, modern steel, neon glow';

const NEGATIVE_PROMPT_MATERIAL = 'directional sunlight, hard cast shadows, specular highlights, perspective tilt, seams, borders, frames, watermark, text';

function humanizeSlug(slug) {
  return String(slug ?? '')
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function resolveContextGrammar(asset) {
  if (asset.regionDossier) {
    const realmKey = asset.regionDossier === 'contian' ? 'contia' : asset.regionDossier;
    const realm = LORE_REALM_CATALOG[realmKey] ?? LORE_REALM_CATALOG.lumeshire;
    const arch = realm.architectureGrammar;
    return {
      scopeType: 'region',
      scopeKey: realm.id,
      displayName: realm.displayName,
      wallMaterial: arch.wallMaterial.replace(/-/g, ' '),
      roofMaterial: arch.roofMaterial.replace(/-/g, ' '),
      roofForm: arch.roofForm.replace(/-/g, ' '),
      foundationType: arch.foundationType.replace(/-/g, ' '),
      silhouetteSummary: arch.silhouetteSummary,
    };
  }

  const overlay = ENVIRONMENTAL_OVERLAYS[asset.areaOverlay];
  return {
    scopeType: 'overlay',
    scopeKey: overlay?.id ?? asset.areaOverlay,
    displayName: overlay?.displayName ?? humanizeSlug(asset.areaOverlay),
    wallMaterial: 'weathered regional stone and structural timber',
    roofMaterial: 'climate-adapted slate, shingle, or reed thatch',
    roofForm: 'functional weather-shedding pitch',
    foundationType: (overlay?.foundationAdaptation ?? 'stone-plinth').replace(/-/g, ' '),
    silhouetteSummary: `Environmental adaptation module for ${overlay?.displayName ?? asset.areaOverlay}.`,
  };
}

/**
 * Build a complete 6-view reference + PBR material prompt pack for a registered asset.
 */
export function buildAssetPromptPack(assetId) {
  const asset = getAssetCandidate(assetId);
  if (!asset) {
    throw new Error(`Unknown asset ID "${assetId}" in ASSET_REGISTRY.`);
  }

  const ctx = resolveContextGrammar(asset);
  const title = humanizeSlug(asset.slug);
  const [widthM, depthM, heightM] = asset.fallback?.footprint ?? [8, 6, 5.5];
  const footprintText = `${widthM}m width × ${depthM}m depth × ${heightM}m height`;

  const viewPrompts = Object.freeze({
    hero: Object.freeze({
      view: 'hero',
      targetPath: `docs/asset-bible/references/${asset.id}/hero.png`,
      prompt: `Isolated 3/4 isometric architectural concept sheet of a ${title} (${asset.assetClass}) for ${ctx.displayName} in the world of Drusniel. Footprint ${footprintText}. Built with ${ctx.wallMaterial}, ${ctx.roofMaterial} (${ctx.roofForm}), resting on a ${ctx.foundationType} foundation. Grounded, physically believable load-bearing construction, clear human door scale (2.1m doorway), neutral studio gray background (#808080), soft even overcast key light, crisp material separation for 3D modeling reference.`,
      negativePrompt: 'busy background, environment clutter, dramatic fog, lens flare, cropped edges, floating geometry, watermark, text',
    }),
    front: Object.freeze({
      view: 'front',
      targetPath: `docs/asset-bible/references/${asset.id}/front.png`,
      prompt: `True orthographic front elevation (+Z facade) of a ${title} (${ctx.displayName}), footprint ${widthM}m wide by ${heightM}m tall. Primary entrance clearly visible, ${ctx.wallMaterial}, ${ctx.roofMaterial}, ${ctx.foundationType} base resting on a flat ground line. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.`,
      negativePrompt: NEGATIVE_PROMPT_ORTHO,
    }),
    left: Object.freeze({
      view: 'left',
      targetPath: `docs/asset-bible/references/${asset.id}/left.png`,
      prompt: `True orthographic left side elevation (-X profile) of a ${title} (${ctx.displayName}), ${depthM}m deep by ${heightM}m tall. Consistent roof ridge height, eave overhang, wall courses, and ${ctx.foundationType} plinth matching the front elevation. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.`,
      negativePrompt: NEGATIVE_PROMPT_ORTHO,
    }),
    rear: Object.freeze({
      view: 'rear',
      targetPath: `docs/asset-bible/references/${asset.id}/rear.png`,
      prompt: `True orthographic rear elevation (-Z back wall) of a ${title} (${ctx.displayName}), ${widthM}m wide by ${heightM}m tall. Service doors, chimney flue or structural buttresses, ${ctx.wallMaterial} and ${ctx.roofMaterial} matching the front elevation. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.`,
      negativePrompt: NEGATIVE_PROMPT_ORTHO,
    }),
    top: Object.freeze({
      view: 'top',
      targetPath: `docs/asset-bible/references/${asset.id}/top.png`,
      prompt: `True orthographic top-down roof plan (+Y nadir view) of a ${title} (${ctx.displayName}), ${widthM}m by ${depthM}m footprint. Shows ${ctx.roofMaterial} ridge lines, valleys, flue caps, and foundation perimeter. Flat diffuse studio lighting, neutral #808080 background, zero perspective convergence.`,
      negativePrompt: NEGATIVE_PROMPT_ORTHO,
    }),
    detail: Object.freeze({
      view: 'detail',
      targetPath: `docs/asset-bible/references/${asset.id}/detail.png`,
      prompt: `Architectural callout sheet for ${title} (${ctx.displayName}): close-up orthographic details of doorway lintel, window frame, wall-to-foundation joint (${ctx.foundationType}), and roof eave joinery (${ctx.roofMaterial}). Neutral #808080 background, even studio lighting, clear construction joints.`,
      negativePrompt: NEGATIVE_PROMPT_ORTHO,
    }),
  });

  const materialPrompts = Object.freeze([
    Object.freeze({
      slot: 'wall_primary',
      materialDescription: ctx.wallMaterial,
      prompt: `Seamless tileable 2m×2m orthographic texture reference of ${ctx.wallMaterial} for ${ctx.displayName}. Even diffuse albedo lighting, no directional cast shadows, crisp mortar and timber grain detail suitable for 2K PBR basecolor/normal/roughness extraction.`,
      negativePrompt: NEGATIVE_PROMPT_MATERIAL,
    }),
    Object.freeze({
      slot: 'roof_primary',
      materialDescription: ctx.roofMaterial,
      prompt: `Seamless tileable 2m×2m orthographic texture reference of ${ctx.roofMaterial} for ${ctx.displayName}. Even diffuse albedo lighting, no directional cast shadows, clear overlapping course geometry suitable for 2K PBR extraction.`,
      negativePrompt: NEGATIVE_PROMPT_MATERIAL,
    }),
  ]);

  return Object.freeze({
    assetId: asset.id,
    title,
    priority: asset.priority,
    assetClass: asset.assetClass,
    loreStatus: asset.loreStatus,
    modelStatus: asset.modelStatus,
    scopeType: ctx.scopeType,
    scopeKey: ctx.scopeKey,
    displayName: ctx.displayName,
    footprintMeters: Object.freeze([widthM, depthM, heightM]),
    fallback: asset.fallback,
    views: viewPrompts,
    materials: materialPrompts,
    blenderSpec: Object.freeze({
      units: 'meters',
      forwardAxis: '+Z front, +Y up (glTF 2.0 standard)',
      origin: 'bottom-center of foundation at ground plane (y=0)',
      lods: Object.freeze(['LOD0 (full detail)', 'LOD1 (45% triangles)', 'LOD2 (20% skyline proxy)']),
      collider: 'oriented box or convex hull in moduleColliders/prefabs',
    }),
  });
}

/**
 * Build a regional scene & landmark prompt pack for one of the 9 canonical lore realms.
 */
export function buildRegionScenePromptPack(realmKey) {
  const normalized = realmKey === 'contian' ? 'contia' : realmKey;
  const realm = LORE_REALM_CATALOG[normalized];
  if (!realm) {
    throw new Error(`Unknown lore realm "${realmKey}".`);
  }
  const arch = realm.architectureGrammar;
  const scenePrompt = `Wide establishing 3/4 aerial concept illustration of a ${realm.displayName} settlement in Drusniel. ${arch.silhouetteSummary} Built with ${arch.wallMaterial.replace(/-/g, ' ')} and ${arch.roofMaterial.replace(/-/g, ' ')} on ${arch.foundationType.replace(/-/g, ' ')} foundations along a ${arch.streetGrammar.replace(/-/g, ' ')} street network. Believable medieval-fantasy engineering, clear civic hierarchy, grounded materials.`;

  const landmarkPacks = realm.mandatoryLandmarks.map((id) => buildAssetPromptPack(id));
  return Object.freeze({
    realmId: realm.id,
    displayName: realm.displayName,
    loreStatus: realm.loreStatus,
    mappingConfidence: realm.mappingConfidence,
    scenePrompt,
    landmarks: Object.freeze(landmarkPacks),
  });
}

/**
 * Inspect on-disk reference images, briefs, and runtime GLB readiness for a single asset.
 */
export function inspectAssetProductionFiles(assetId, rootDir = process.cwd()) {
  const asset = getAssetCandidate(assetId);
  if (!asset) {
    throw new Error(`Unknown asset ID "${assetId}" in ASSET_REGISTRY.`);
  }

  const refDir = path.join(rootDir, 'docs', 'asset-bible', 'references', ...asset.id.split('/'));
  const presentViews = [];
  const missingViews = [];

  for (const view of REQUIRED_REFERENCE_VIEWS) {
    const viewPath = path.join(refDir, `${view}.png`);
    if (fs.existsSync(viewPath)) {
      presentViews.push(view);
    } else {
      missingViews.push(view);
    }
  }

  const briefPresent = fs.existsSync(path.join(refDir, 'brief.md'));
  const materialNotesPresent = fs.existsSync(path.join(refDir, 'material-notes.md'));
  const glbPresent = Boolean(
    asset.runtimeGlb && fs.existsSync(path.join(rootDir, 'public', asset.runtimeGlb.replace(/^\//, ''))),
  );

  const statusViolations = [];
  if (asset.modelStatus === 'reference-approved' && missingViews.length > 0) {
    statusViolations.push(
      `Asset "${asset.id}" has modelStatus="reference-approved" but is missing reference views: ${missingViews.join(', ')}`,
    );
  }
  if (asset.modelStatus === 'ready' && !glbPresent) {
    statusViolations.push(
      `Asset "${asset.id}" has modelStatus="ready" but runtimeGlb "${asset.runtimeGlb ?? ''}" does not exist on disk`,
    );
  }

  let nextRecommendedStep = 'Generate 6-view orthographic reference sheet (hero, front, left, rear, top, detail)';
  if (missingViews.length === 0 && !glbPresent) {
    nextRecommendedStep = 'Model in Blender from approved orthographic views, export GLB with LOD0-LOD2 + colliders';
  } else if (glbPresent && asset.modelStatus === 'ready') {
    nextRecommendedStep = 'Ready in runtime';
  }

  return Object.freeze({
    assetId: asset.id,
    modelStatus: asset.modelStatus,
    priority: asset.priority,
    referenceDir: refDir,
    briefPresent,
    materialNotesPresent,
    presentViews: Object.freeze(presentViews),
    missingViews: Object.freeze(missingViews),
    referenceComplete: missingViews.length === 0,
    glbPresent,
    statusViolations: Object.freeze(statusViolations),
    nextRecommendedStep,
  });
}

/**
 * Audit all 138 registered assets and verify no ungenerated image or GLB is falsely marked ready.
 */
export function auditAllAssetsProduction(rootDir = process.cwd()) {
  const summary = summarizeAssetBacklog();
  const violations = [];
  let scaffoldedBriefCount = 0;
  let completeReferenceCount = 0;
  let readyGlbCount = 0;

  for (const asset of ASSET_CANDIDATE_LIST) {
    const report = inspectAssetProductionFiles(asset.id, rootDir);
    if (report.briefPresent) scaffoldedBriefCount += 1;
    if (report.referenceComplete) completeReferenceCount += 1;
    if (report.glbPresent) readyGlbCount += 1;
    violations.push(...report.statusViolations);
  }

  return Object.freeze({
    summary,
    scaffoldedBriefCount,
    completeReferenceCount,
    readyGlbCount,
    valid: violations.length === 0,
    violations: Object.freeze(violations),
  });
}

/**
 * Scaffold the reference directory (`brief.md`, `material-notes.md`, `prompts.json`) for an asset.
 */
export function scaffoldAssetWorkspace(assetId, rootDir = process.cwd()) {
  const pack = buildAssetPromptPack(assetId);
  const refDir = path.join(rootDir, 'docs', 'asset-bible', 'references', ...pack.assetId.split('/'));
  fs.mkdirSync(refDir, { recursive: true });

  const briefPath = path.join(refDir, 'brief.md');
  const materialPath = path.join(refDir, 'material-notes.md');
  const promptsPath = path.join(refDir, 'prompts.json');

  const [w, d, h] = pack.footprintMeters;
  const briefMarkdown = `# Asset Production Brief: ${pack.title} (\`${pack.assetId}\`)

- **Scope**: ${pack.displayName} (\`${pack.scopeKey}\`)
- **Asset Class**: \`${pack.assetClass}\`
- **Priority**: \`${pack.priority}\`
- **Lore Provenance**: \`${pack.loreStatus}\`
- **Current Model Status**: \`${pack.modelStatus}\`
- **Target Footprint**: \`${w}m W × ${d}m D × ${h}m H\`
- **Runtime Fallback**: \`${pack.fallback.settlementKind}\` (variant \`${pack.fallback.settlementVariant}\`, kit prefab \`${pack.fallback.kitPrefab ?? 'n/a'}\`)

## Required Reference Views

Place approved reference images in this directory before advancing \`modelStatus\` to \`reference-approved\`:

- [ ] \`hero.png\` — 3/4 isometric architectural concept sheet
- [ ] \`front.png\` — Orthographic \`+Z\` front elevation (doorway face)
- [ ] \`left.png\` — Orthographic \`-X\` left side profile
- [ ] \`rear.png\` — Orthographic \`-Z\` rear elevation
- [ ] \`top.png\` — Orthographic \`+Y\` top-down roof plan
- [ ] \`detail.png\` — Joinery, lintel, foundation, and eave callout sheet

## View Prompts

### Hero (\`hero.png\`)
> ${pack.views.hero.prompt}
- **Negative**: \`${pack.views.hero.negativePrompt}\`

### Front Orthographic (\`front.png\`)
> ${pack.views.front.prompt}
- **Negative**: \`${pack.views.front.negativePrompt}\`

### Left Orthographic (\`left.png\`)
> ${pack.views.left.prompt}
- **Negative**: \`${pack.views.left.negativePrompt}\`

### Rear Orthographic (\`rear.png\`)
> ${pack.views.rear.prompt}
- **Negative**: \`${pack.views.rear.negativePrompt}\`

### Top Orthographic (\`top.png\`)
> ${pack.views.top.prompt}
- **Negative**: \`${pack.views.top.negativePrompt}\`

### Detail Sheet (\`detail.png\`)
> ${pack.views.detail.prompt}
- **Negative**: \`${pack.views.detail.negativePrompt}\`

## Blender & GLB Export Checklist

- **Units & Axes**: \`${pack.blenderSpec.units}\`, \`${pack.blenderSpec.forwardAxis}\`
- **Pivot / Origin**: \`${pack.blenderSpec.origin}\`
- **LOD Chain**: ${pack.blenderSpec.lods.join(', ')}
- **Collision**: ${pack.blenderSpec.collider}
`;

  const materialMarkdown = `# Material & PBR Notes: ${pack.title} (\`${pack.assetId}\`)

## Required PBR Maps (2048×2048 tileable, 1024×1024 trim/props)

${REQUIRED_PBR_MAPS.map((map) => `- \`${map}\``).join('\n')}

## Material Prompts

${pack.materials.map((m) => `### Slot: \`${m.slot}\` (${m.materialDescription})
> ${m.prompt}
- **Negative**: \`${m.negativePrompt}\`
`).join('\n')}
`;

  fs.writeFileSync(briefPath, briefMarkdown, 'utf8');
  fs.writeFileSync(materialPath, materialMarkdown, 'utf8');
  fs.writeFileSync(promptsPath, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');

  return Object.freeze({
    assetId: pack.assetId,
    refDir,
    briefPath,
    materialPath,
    promptsPath,
  });
}

export { ASSET_REGISTRY };
