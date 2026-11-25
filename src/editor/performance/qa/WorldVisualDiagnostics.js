import * as THREE from 'three/webgpu';
import {
  abs,
  attribute,
  clamp,
  float,
  fract,
  max,
  mix,
  normalWorld,
  oneMinus,
  positionWorld,
  smoothstep,
  step,
  uv,
  vec3,
  vertexColor,
} from 'three/tsl';
import { authoredTexture } from '../../stylized/AuthoredTextureNode.js';
import {
  groundContactUniforms,
  sampleGroundContactAt,
} from '../../stylized/groundContact/GroundContactState.js';
import { slotTexture } from '../../materials/TerrainSlotBindings.js';
import { meadowPatchColors } from '../../stylized/meadow/meadowColorNodes.js';
import { MEADOW_GRASS_DEFAULTS } from '../../stylized/meadow/meadowGrassConfig.js';
import { worldNoiseField } from '../../stylized/worldNoise.js';
import { WORLD_NOISE_LAYERS } from '../../stylized/worldNoiseLayout.js';
import { surfaceWetnessUniform } from '../../weather/surfaceWetness.js';
import { stormSnowCoverAt } from '../../weather/storm/snowField/snowFieldState.js';
import {
  WSC_DEFAULT_DIAGNOSTIC_MODE,
  WSC_LOD_CLASSES,
  WSC_MATERIAL_FAMILIES,
  classifySceneMesh,
  resolveWscDiagnosticMode,
} from './wscDiagnosticModes.js';

function srgbByteToLinearNode([r, g, b]) {
  const c = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  return vec3(c.r, c.g, c.b);
}

function heatRamp(t) {
  const x = clamp(t, 0, 1);
  const c0 = vec3(0.03, 0.04, 0.08);
  const c1 = vec3(0.18, 0.45, 0.85);
  const c2 = vec3(0.95, 0.72, 0.12);
  const c3 = vec3(0.98, 0.98, 0.92);
  const lo = mix(c0, c1, smoothstep(0, 0.35, x));
  const mid = mix(lo, c2, smoothstep(0.35, 0.75, x));
  return mix(mid, c3, smoothstep(0.75, 1, x));
}

function signedHeightColor(deltaMeters) {
  // Blue = buried (-0.5m), Green = exact ground (0m), Yellow = +0.5m, Red = >=1.5m.
  const buried = smoothstep(0, -0.45, deltaMeters);
  const low = smoothstep(0, 0.5, deltaMeters);
  const high = smoothstep(0.5, 1.5, deltaMeters);
  let col = mix(vec3(0.08, 0.78, 0.25), vec3(0.95, 0.85, 0.12), low);
  col = mix(col, vec3(0.92, 0.14, 0.12), high);
  return mix(col, vec3(0.1, 0.3, 0.95), buried);
}

function copyGeometryBindings(target, source) {
  if (source.positionNode) target.positionNode = source.positionNode;
  if (source.opacityNode) target.opacityNode = source.opacityNode;
  target.alphaTest = source.alphaTest ?? 0;
  target.transparent = Boolean(source.transparent);
  target.depthWrite = source.depthWrite ?? true;
  target.side = source.side ?? THREE.FrontSide;
  target.polygonOffset = Boolean(source.polygonOffset);
  target.polygonOffsetFactor = source.polygonOffsetFactor ?? 0;
  target.polygonOffsetUnits = source.polygonOffsetUnits ?? 0;
  target.fog = false;
  target.toneMapped = false;
}

function isSkyOrHelper(mesh) {
  if (!mesh?.isMesh) return true;
  const name = String(mesh.name ?? '').toLowerCase();
  let p = mesh;
  while (p) {
    const n = String(p.name ?? '').toLowerCase();
    if (n.includes('sky') || n.includes('cloud') || n.includes('star') || n.includes('sun') || n.includes('helper') || n.includes('cursor')) {
      return true;
    }
    p = p.parent;
  }
  return name.includes('sky') || name.includes('cloud');
}

function terrainSlotTemplate(editor, key) {
  const slots = editor?.terrainView?.slots ?? [];
  for (const slot of slots) {
    if (slot?.[key]) return slot[key];
  }
  return null;
}

/**
 * Runtime visual diagnostics controller for WSC PR 0 (D00–D25).
 *
 * Disabled (`D00`) by default: zero materials are cloned or modified until
 * explicitly activated through `WorldVisualQa.setDiagnosticMode(...)`.
 * Restoring `D00` or calling `dispose()` returns the scene to its exact
 * untouched production state.
 */
export class WorldVisualDiagnostics {
  constructor(editor) {
    this.editor = editor;
    this.mode = WSC_DEFAULT_DIAGNOSTIC_MODE;
    this.savedMaterials = new Map();
    this.materialCache = new Map();
    this.savedLightState = null;
    this.savedFog = null;
    this.savedGodRaysEnabled = null;
    this.savedPostEnabled = null;
  }

  getMode() {
    return this.mode;
  }

  restore() {
    for (const [mesh, { original, replacement }] of this.savedMaterials) {
      if (mesh.material === replacement) mesh.material = original;
    }
    this.savedMaterials.clear();
    for (const { material, owned } of this.materialCache.values()) {
      if (owned) material.dispose();
    }
    this.materialCache.clear();

    if (this.savedLightState) {
      const { directional, hemisphere, scene, directionalIntensity, hemisphereIntensity, envIntensity } = this.savedLightState;
      if (directional) directional.intensity = directionalIntensity;
      if (hemisphere) hemisphere.intensity = hemisphereIntensity;
      if (scene) scene.environmentIntensity = envIntensity;
      this.savedLightState = null;
    }
    if (this.savedFog !== null && this.editor?.terrainView?.scene) {
      this.editor.terrainView.scene.fog = this.savedFog;
      this.savedFog = null;
    }
    if (this.savedGodRaysEnabled !== null && this.editor?.terrainView?.godRays) {
      this.editor.terrainView.godRays.enabled = this.savedGodRaysEnabled;
      this.savedGodRaysEnabled = null;
    }
    if (this.savedPostEnabled !== null && this.editor?.terrainView?.postProcessing) {
      this.editor.terrainView.postProcessing.enabled = this.savedPostEnabled;
      this.savedPostEnabled = null;
    }
    this.mode = WSC_DEFAULT_DIAGNOSTIC_MODE;
    return resolveWscDiagnosticMode('D00');
  }

  setMode(input) {
    const modeInfo = resolveWscDiagnosticMode(input);
    this.restore();
    if (modeInfo.id === 'D00') return modeInfo;

    const tv = this.editor?.terrainView;
    const scene = tv?.scene;
    if (!scene) throw new Error('WorldVisualDiagnostics requires an active terrainView scene.');

    // Disable post-processing bloom/vignette/grain/god-rays during unlit/false-color diagnostics
    // so measurements and diagnostic visuals remain radiometrically pure.
    const isLightingIsolation = ['D16', 'D17', 'D19'].includes(modeInfo.id);
    if (!isLightingIsolation) {
      if (tv.godRays) {
        this.savedGodRaysEnabled = tv.godRays.enabled;
        tv.godRays.enabled = false;
      }
      if (tv.postProcessing) {
        this.savedPostEnabled = tv.postProcessing.enabled;
        tv.postProcessing.enabled = false;
      }
      this.savedFog = scene.fog ?? null;
      scene.fog = null;
    }

    if (isLightingIsolation) {
      this.applyLightingIsolation(modeInfo.id);
    }

    this.mode = modeInfo.id;
    this.syncMaterials();
    return modeInfo;
  }

  syncMaterials() {
    if (this.mode === WSC_DEFAULT_DIAGNOSTIC_MODE) return;
    const scene = this.editor.terrainView.scene;
    const seen = new Set();
    const usedKeys = new Set();
    scene.traverse((node) => {
      if (!node.isMesh || isSkyOrHelper(node) || !node.material) return;
      seen.add(node);
      const saved = this.savedMaterials.get(node);
      if (saved && node.material === saved.replacement) {
        for (const key of saved.keys) usedKeys.add(key);
        return;
      }
      const original = node.material;
      const list = Array.isArray(original) ? original : [original];
      const keys = [];
      const materials = list.map((mat) => {
        const cls = classifySceneMesh(node, mat);
        const key = `${mat.uuid}:${cls.family}:${cls.lod}`;
        keys.push(key);
        usedKeys.add(key);
        if (!this.materialCache.has(key)) {
          const material = this.buildDiagnosticMaterial(this.mode, mat, node, cls);
          this.materialCache.set(key, { material, owned: Boolean(material && material !== mat) });
        }
        return this.materialCache.get(key).material;
      });
      const replacement = Array.isArray(original) ? materials : materials[0];
      this.savedMaterials.set(node, { original, replacement, keys });
      node.material = replacement;
    });
    for (const [mesh, { original, replacement }] of this.savedMaterials) {
      if (seen.has(mesh)) continue;
      if (mesh.material === replacement) mesh.material = original;
      this.savedMaterials.delete(mesh);
    }
    for (const [key, { material, owned }] of this.materialCache) {
      if (usedKeys.has(key)) continue;
      if (owned) material.dispose();
      this.materialCache.delete(key);
    }
  }

  applyLightingIsolation(modeId) {
    const sky = this.editor?.stylizedSurface?.skyView;
    const scene = this.editor?.terrainView?.scene;
    const directional = sky?.directional ?? null;
    const hemisphere = sky?.hemisphere ?? null;
    this.savedLightState = {
      directional,
      hemisphere,
      scene,
      directionalIntensity: directional?.intensity ?? 0,
      hemisphereIntensity: hemisphere?.intensity ?? 0,
      envIntensity: scene?.environmentIntensity ?? 0,
    };
    if (modeId === 'D16' || modeId === 'D19') {
      if (hemisphere) hemisphere.intensity = 0;
      if (scene) scene.environmentIntensity = 0;
    } else if (modeId === 'D17') {
      if (directional) directional.intensity = 0;
    }
  }

  buildDiagnosticMaterial(modeId, source, mesh, cls) {
    if (modeId === 'D17') {
      // Indirect lighting keeps original material lighting + emissive while sun is zeroed.
      return source;
    }
    if (modeId === 'D16') {
      const clone = source.clone();
      clone.emissiveNode = vec3(0);
      if (clone.emissive) clone.emissive.setRGB(0, 0, 0);
      clone.alphaTest = source.alphaTest ?? 0;
      return clone;
    }
    if (modeId === 'D19') {
      const shadowMat = new THREE.MeshLambertNodeMaterial({ color: '#ffffff' });
      copyGeometryBindings(shadowMat, source);
      shadowMat.toneMapped = true;
      shadowMat.colorNode = vec3(1, 1, 1);
      if (source.receivedShadowNode) shadowMat.receivedShadowNode = source.receivedShadowNode;
      return shadowMat;
    }

    const diag = new THREE.MeshBasicNodeMaterial();
    copyGeometryBindings(diag, source);
    // Provide null-initialized PBR properties so copied TSL nodes referencing
    // materialRoughness / materialMetalness never dereference undefined maps.
    diag.roughness = Number.isFinite(source.roughness) ? source.roughness : 1;
    diag.roughnessMap = source.roughnessMap ?? null;
    diag.metalness = Number.isFinite(source.metalness) ? source.metalness : 0;
    diag.metalnessMap = source.metalnessMap ?? null;
    diag.colorNode = this.buildColorNode(modeId, source, mesh, cls);
    return diag;
  }

  buildColorNode(modeId, source, mesh, cls) {
    const config = this.editor?.config?.stylizedSurface ?? {};
    const gc = sampleGroundContactAt(positionWorld.xz);
    const isTerrain = cls.family === 'terrain';

    switch (modeId) {
      case 'D01': {
        // Resolved unlit albedo (exact material colorNode before lighting/emissive/fog).
        if (source.colorNode) return clamp(source.colorNode.rgb, 0, 1);
        const base = source.color ? vec3(source.color.r, source.color.g, source.color.b) : vec3(1);
        let col = source.map ? authoredTexture(source.map).rgb.mul(base) : base;
        if (source.vertexColors && mesh.geometry?.getAttribute?.('color')) col = col.mul(vertexColor().rgb);
        return clamp(col, 0, 1);
      }
      case 'D02': {
        // Raw source albedo (texture * base color * vertexColor before grading/weathering).
        const base = source.color ? vec3(source.color.r, source.color.g, source.color.b) : vec3(1);
        let col = source.map ? authoredTexture(source.map).rgb.mul(base) : base;
        if (mesh.geometry?.getAttribute?.('color')) col = col.mul(vertexColor().rgb);
        return clamp(col, 0, 1);
      }
      case 'D03': {
        const tileTex = isTerrain ? terrainSlotTemplate(this.editor, 'tileTexture') : null;
        if (tileTex) return slotTexture('tileTexture', tileTex, uv()).rgb;
        if (mesh.geometry?.getAttribute?.('instanceBiomeLook')) {
          return clamp(attribute('instanceBiomeLook', 'vec4').rgb, 0, 1);
        }
        return mix(vec3(0.18, 0.14, 0.22), gc.soilColor, gc.inside);
      }
      case 'D04': {
        const origin = this.editor?.terrainView?.floatingOrigin?.getState?.() ?? { x: 0, z: 0 };
        const canonical = positionWorld.xz.add(vec3(origin.x, 0, origin.z).xz);
        const appearance = { ...MEADOW_GRASS_DEFAULTS.appearance, ...(config.grass?.meadow?.appearance ?? {}) };
        const { tint, dry, dryColor } = meadowPatchColors(canonical, appearance, {
          noiseField: worldNoiseField(WORLD_NOISE_LAYERS.macro),
        });
        return clamp(mix(tint.mul(0.5), dryColor, dry), 0, 1);
      }
      case 'D05':
        return normalWorld.normalize().mul(0.5).add(0.5);
      case 'D06': {
        // Sample explicit roughness scalar * roughnessMap green channel (avoids
        // coupling MeshBasicNodeMaterial to PBR-only roughnessNode internals).
        const baseR = float(Number.isFinite(source.roughness) ? source.roughness : 1);
        const r = source.roughnessMap ? clamp(authoredTexture(source.roughnessMap).g.mul(baseR), 0, 1) : clamp(baseR, 0, 1);
        return vec3(r, r, r);
      }
      case 'D07': {
        const baseM = float(Number.isFinite(source.metalness) ? source.metalness : 0);
        const m = source.metalnessMap ? clamp(authoredTexture(source.metalnessMap).b.mul(baseM), 0, 1) : clamp(baseM, 0, 1);
        const alert = smoothstep(0.04, 0.06, m);
        return mix(vec3(0.04, 0.08, 0.18), vec3(1, 0.08, 0.55), alert);
      }
      case 'D08':
        return mix(vec3(0.12, 0.04, 0.16), heatRamp(gc.contact), gc.inside);
      case 'D09':
        return mix(vec3(0.12, 0.04, 0.16), mix(vec3(0.03, 0.05, 0.04), vec3(0.1, 0.92, 0.28), gc.canopy), gc.inside);
      case 'D10': {
        const ffTex = isTerrain ? terrainSlotTemplate(this.editor, 'forestFloorTexture') : null;
        if (ffTex) {
          const litter = slotTexture('forestFloorTexture', ffTex, uv()).b;
          return mix(vec3(0.05, 0.05, 0.06), vec3(0.95, 0.58, 0.12), litter);
        }
        return mix(vec3(0.16, 0.16, 0.18), vec3(0.95, 0.58, 0.12), gc.litter);
      }
      case 'D11': {
        if (cls.family === 'nearGrass' || cls.family === 'farGrassCards') return vec3(0.05, 0.95, 0.95);
        const maskTex = isTerrain ? terrainSlotTemplate(this.editor, 'surfaceMaskTexture') : null;
        if (maskTex) {
          const ffTex = terrainSlotTemplate(this.editor, 'forestFloorTexture');
          const rawCov = slotTexture('surfaceMaskTexture', maskTex, uv()).g;
          const fallbackCov = ffTex
            ? rawCov.mul(oneMinus(slotTexture('forestFloorTexture', ffTex, uv()).r.mul(0.84)))
            : rawCov;
          // Inside WSC window, display published ecological blade coverage (`eco.a`) directly.
          const ecoCov = mix(fallbackCov, gc.vegetationCoverage, gc.inside);
          return mix(vec3(0.16, 0.11, 0.07), vec3(0.12, 0.85, 0.22), ecoCov.clamp(0, 1));
        }
        return vec3(0.22, 0.22, 0.24);
      }
      case 'D12':
        return mix(vec3(0.16, 0.04, 0.2), gc.soilColor, gc.inside);
      case 'D13':
        return mix(vec3(0.16, 0.04, 0.2), signedHeightColor(positionWorld.y.sub(gc.height)), gc.inside);
      case 'D14':
        return mix(vec3(0.16, 0.04, 0.2), gc.normal.normalize().mul(0.5).add(0.5), gc.inside);
      case 'D15': {
        // Explicit PR 1 per-texel validity (`geo.a`) separated from window border fade.
        const win = gc.windowInside;
        const missingSlot = step(gc.texelValidity, float(0.5)).mul(step(float(0.01), win));
        const borderFade = win.mul(oneMinus(win)).mul(4);
        let status = mix(vec3(0.85, 0.12, 0.12), vec3(0.12, 0.82, 0.24), win);
        status = mix(status, vec3(0.95, 0.82, 0.12), borderFade);
        return mix(status, vec3(0.95, 0.05, 0.92), missingSlot);
      }
      case 'D18': {
        const em = source.emissiveNode ?? vec3(0);
        return clamp(em.rgb.mul(2), 0, 1);
      }
      case 'D20': {
        const entry = WSC_LOD_CLASSES[cls.lod] ?? WSC_LOD_CLASSES.other;
        return srgbByteToLinearNode(entry.rgb);
      }
      case 'D21': {
        const maskTex = isTerrain ? terrainSlotTemplate(this.editor, 'surfaceMaskTexture') : null;
        const shore = maskTex ? slotTexture('surfaceMaskTexture', maskTex, uv()).b : float(0);
        const wet = clamp(surfaceWetnessUniform.max(shore), 0, 1);
        return mix(vec3(0.08, 0.08, 0.1), vec3(0.08, 0.65, 0.98), wet);
      }
      case 'D22': {
        const up = smoothstep(0.35, 0.88, normalWorld.y);
        const potential = up.mul(gc.canopy.mul(0.6).add(0.4)).clamp(0, 1);
        return mix(vec3(0.08, 0.08, 0.08), vec3(0.24, 0.78, 0.18), potential);
      }
      case 'D23': {
        const stormSnow = stormSnowCoverAt(positionWorld.xz);
        const altSnow = smoothstep(700, 950, positionWorld.y);
        const snow = max(stormSnow, altSnow).clamp(0, 1);
        return mix(vec3(0.08, 0.1, 0.12), vec3(0.85, 0.94, 1.0), snow);
      }
      case 'D24': {
        const entry = WSC_MATERIAL_FAMILIES[cls.family] ?? WSC_MATERIAL_FAMILIES.other;
        return srgbByteToLinearNode(entry.rgb);
      }
      case 'D25': {
        const origin = this.editor?.terrainView?.floatingOrigin?.getState?.() ?? { x: 0, z: 0 };
        const canonical = positionWorld.xz.add(vec3(origin.x, 0, origin.z).xz);
        const chunkF = fract(canonical.div(128));
        const chunkDist = max(
          step(chunkF.x, float(0.012)).max(step(float(0.988), chunkF.x)),
          step(chunkF.y, float(0.012)).max(step(float(0.988), chunkF.y)),
        );
        const tileF = fract(canonical.div(8));
        const tileDist = max(
          step(tileF.x, float(0.03)).max(step(float(0.97), tileF.x)),
          step(tileF.y, float(0.03)).max(step(float(0.97), tileF.y)),
        );
        const gcUv = positionWorld.xz.sub(groundContactUniforms.renderOrigin).mul(groundContactUniforms.inverseSpan);
        const gcEdge = max(
          step(abs(gcUv.x), float(0.008)).max(step(abs(gcUv.x.sub(1)), float(0.008))),
          step(abs(gcUv.y), float(0.008)).max(step(abs(gcUv.y.sub(1)), float(0.008))),
        ).mul(step(float(-0.01), gcUv.x)).mul(step(gcUv.x, float(1.01)))
          .mul(step(float(-0.01), gcUv.y)).mul(step(gcUv.y, float(1.01)))
          .mul(groundContactUniforms.active);
        const base = source.colorNode ? clamp(source.colorNode.rgb, 0, 1).mul(0.55) : vec3(0.22);
        let col = mix(base, vec3(0.95, 0.85, 0.15), tileDist.mul(0.45));
        col = mix(col, vec3(0.98, 0.14, 0.14), chunkDist);
        return mix(col, vec3(0.08, 0.96, 0.96), gcEdge);
      }
      default:
        return vec3(1, 0, 1);
    }
  }

  dispose() {
    this.restore();
  }
}
