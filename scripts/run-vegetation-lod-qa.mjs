/**
 * Deterministic tree + bush LOD acceptance.
 *
 * The live world is a poor visual test fixture: vegetation depends on biome,
 * streamed variants, camera angle, and asynchronous manifests. This runner
 * loads the real runtime prototype sets, validates their physical LOD contracts,
 * then rewrites the existing instanced renderers into fixed near/proxy galleries.
 *
 * Prerequisite: the app is already served by Vite.
 *
 * Usage:
 *   npm run qa:vegetation:lod -- --url http://127.0.0.1:5173
 *   npm run qa:vegetation:lod -- --headed
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function positiveInteger(name, fallback) {
  const value = Number(readArg(name, String(fallback)));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return value;
}

const baseUrl = readArg('url', 'http://localhost:5173').replace(/\/$/, '');
const outputDirectory = path.resolve(readArg(
  'out',
  path.join(root, 'tmp', 'vegetation-lod-qa'),
));
const timeoutMs = positiveInteger('timeoutMs', 240_000);
const viewportWidth = positiveInteger('viewportWidth', 1600);
const viewportHeight = positiveInteger('viewportHeight', 950);
const reportPath = path.join(outputDirectory, 'report.json');

fs.mkdirSync(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  headless: !hasFlag('headed'),
  args: [
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--use-angle=default',
    '--enable-gpu-rasterization',
  ],
});

let context = null;
const browserErrors = [];
const browserWarnings = new Set();
const screenshots = [];

function relativeArtifact(filePath) {
  return path.relative(root, filePath).replaceAll('\\', '/');
}


try {
  context = await browser.newContext({
    viewport: { width: viewportWidth, height: viewportHeight },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
    if (message.type() === 'warning') browserWarnings.add(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(`page: ${error.message}`));

  await page.goto(`${baseUrl}/?vegetationLodQa=1`, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });
  await page.waitForFunction(
    () => window.__editor?.stylizedSurface?.treeView?.prototypes?.length > 0,
    null,
    { timeout: timeoutMs },
  );
  await page.waitForFunction(
    () => window.__assetStartupTelemetry?.status === 'done'
      && document.querySelector('.loading-overlay')?.hidden === true,
    null,
    { timeout: timeoutMs },
  );

  // Variant residency deliberately loads rocks first. QA needs the bush set as
  // a fixture, not a traversal-order test, so acquire only missing bush assets
  // directly through the same shared loader and apply path used by residency.
  await page.evaluate(async () => {
    const surface = window.__editor.stylizedSurface;
    const residency = surface.variantResidency;
    const layer = residency.layers.find((entry) => entry.id === 'bushes');
    if (!layer) throw new Error('Bush variant residency layer is unavailable.');
    residency.dispose();
    const missing = layer.definitions.filter((definition) => {
      const key = definition.id ?? definition.scene;
      return !surface.bushView.prototypeIndicesByAsset.has(key);
    });
    const variants = await Promise.all(missing.map(async (definition) => ({
      definition,
      scene: await layer.acquire(definition.scene),
    })));
    if (variants.length > 0) {
      const result = layer.apply(variants);
      let installed = result;
      if (typeof result?.next === 'function') {
        let step;
        do {
          const started = performance.now();
          do { step = result.next(); } while (!step.done && performance.now() - started < 4);
          if (!step.done) await new Promise(resolve => requestAnimationFrame(resolve));
        } while (!step.done);
        installed = step.value;
      }
      if (Array.isArray(installed)) {
        for (const root of installed) surface.terrainView.drawPreparation?.register(root);
      }
    }
    await surface.treeView.impostorReady;
  });

  const report = await page.evaluate(() => {
    const editor = window.__editor;
    const surface = editor.stylizedSurface;
    const treeView = surface.treeView;
    const bushView = surface.bushView;
    const config = editor.config.stylizedSurface;
    const checks = [];

    const check = (id, passed, details = {}) => {
      checks.push({ id, passed: Boolean(passed), ...details });
    };
    const boundsOf = (geometry) => {
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      const size = bounds.getSize(bounds.min.clone());
      const center = bounds.getCenter(bounds.min.clone());
      return {
        min: bounds.min.toArray(),
        max: bounds.max.toArray(),
        size: size.toArray(),
        center: center.toArray(),
      };
    };
    const trianglesOf = (geometry) => (
      (geometry.index?.count ?? geometry.attributes.position.count) / 3
    );
    const maximumDelta = (left, right) => Math.max(
      ...left.map((value, index) => Math.abs(value - right[index])),
    );
    const horizontalDiameter = (bounds) => Math.max(bounds.size[0], bounds.size[2]);
    const stressedProxyBounds = (bounds, pivot, kind) => {
      if (!pivot) return bounds;
      const horizontalScale = kind === 'leaf' ? 0.55 : 0.94;
      const mapHorizontal = (value, axis) => (
        (value - pivot[axis]) * horizontalScale + pivot[axis]
      );
      const min = [
        mapHorizontal(bounds.min[0], 0),
        bounds.min[1],
        mapHorizontal(bounds.min[2], 2),
      ];
      const max = [
        mapHorizontal(bounds.max[0], 0),
        bounds.max[1],
        mapHorizontal(bounds.max[2], 2),
      ];
      return {
        min,
        max,
        size: max.map((value, index) => value - min[index]),
        center: max.map((value, index) => (value + min[index]) * 0.5),
      };
    };

    const treePrototypes = treeView.prototypes.map((parts, prototypeIndex) => {
      const sourceParts = parts.map((part) => ({
        kind: part.kind,
        bounds: boundsOf(part.geometry),
        triangles: trianglesOf(part.geometry),
        alphaTest: part.material.alphaTest ?? 0,
        hasOpacityNode: Boolean(part.material.opacityNode),
      }));
      const proxyParts = treeView.proxyPrototypes[prototypeIndex].map((part, partIndex) => {
        const bounds = boundsOf(part.geometry);
        const morphologyPivot = treeView.proxyRenderers[prototypeIndex][partIndex]
          .material.userData.treeMorphologyPivot ?? null;
        return {
          kind: part.kind,
          bounds,
          stressedBounds: stressedProxyBounds(bounds, morphologyPivot, part.kind),
          triangles: trianglesOf(part.geometry),
          morphologyPivot,
          trunkConnectorBounds: part.geometry.userData.trunkConnectorBounds ?? null,
        };
      });
      const crown = proxyParts.find((part) => part.kind === 'leaf');
      const trunk = proxyParts.find((part) => part.kind === 'trunk');
      const verticalOverlap = crown && trunk
        ? Math.min(crown.bounds.max[1], trunk.bounds.max[1])
          - Math.max(crown.bounds.min[1], trunk.bounds.min[1])
        : Number.NEGATIVE_INFINITY;
      const trunkInsideCrown = crown && trunk
        ? trunk.bounds.center[0] >= crown.bounds.min[0]
          && trunk.bounds.center[0] <= crown.bounds.max[0]
          && trunk.bounds.center[2] >= crown.bounds.min[2]
          && trunk.bounds.center[2] <= crown.bounds.max[2]
        : false;
      const diameterRatio = crown && trunk
        ? horizontalDiameter(trunk.bounds) / horizontalDiameter(crown.bounds)
        : Number.POSITIVE_INFINITY;
      const stressedTrunkInsideCrown = crown && trunk
        ? trunk.stressedBounds.center[0] >= crown.stressedBounds.min[0]
          && trunk.stressedBounds.center[0] <= crown.stressedBounds.max[0]
          && trunk.stressedBounds.center[2] >= crown.stressedBounds.min[2]
          && trunk.stressedBounds.center[2] <= crown.stressedBounds.max[2]
        : false;
      check(
        `tree-${prototypeIndex}-source-parts`,
        sourceParts.some((part) => part.kind === 'leaf')
          && sourceParts.some((part) => part.kind === 'trunk'),
        { sourceKinds: sourceParts.map((part) => part.kind) },
      );
      check(
        `tree-${prototypeIndex}-proxy-contact`,
          verticalOverlap > 0
          && trunkInsideCrown
          && stressedTrunkInsideCrown
          && Boolean(crown?.trunkConnectorBounds),
        {
          verticalOverlap,
          trunkInsideCrown,
          stressedTrunkInsideCrown,
          hasTrunkConnector: Boolean(crown?.trunkConnectorBounds),
        },
      );
      check(
        `tree-${prototypeIndex}-proxy-trunk-width`,
        diameterRatio <= 0.16,
        { diameterRatio },
      );
      return {
        prototypeIndex,
        sourceParts,
        proxyParts,
        verticalOverlap,
        trunkInsideCrown,
        stressedTrunkInsideCrown,
        diameterRatio,
      };
    });

    const bushPrototypes = bushView.prototypes.map((prototype, prototypeIndex) => {
      const source = boundsOf(prototype.geometry);
      const proxy = boundsOf(bushView.proxyPrototypes[prototypeIndex].geometry);
      const sourceTriangles = trianglesOf(prototype.geometry);
      const proxyTriangles = trianglesOf(bushView.proxyPrototypes[prototypeIndex].geometry);
      const boundsDelta = Math.max(
        maximumDelta(source.min, proxy.min),
        maximumDelta(source.max, proxy.max),
      );
      check(
        `bush-${prototypeIndex}-proxy-bounds`,
        boundsDelta <= 1e-4,
        { boundsDelta },
      );
      check(
        `bush-${prototypeIndex}-proxy-simplifies`,
        proxyTriangles < sourceTriangles,
        { sourceTriangles, proxyTriangles },
      );
      const proxyKind = bushView.proxyPrototypes[prototypeIndex].geometry.userData.proxyKind;
      check(
        `bush-${prototypeIndex}-proxy-is-volumetric`,
        proxyKind === 'clustered-low-poly-canopy',
        { proxyKind },
      );
      return {
        prototypeIndex,
        source,
        proxy,
        sourceTriangles,
        proxyTriangles,
        proxyKind,
        boundsDelta,
      };
    });

    const bushLod = config.lod.bush;
    check(
      'bush-has-distinct-physical-bands',
      bushLod.meshRadius < bushLod.proxyRadius,
      {
        meshRadius: bushLod.meshRadius,
        proxyRadius: bushLod.proxyRadius,
        forceNearWithinMeshRadius: bushLod.forceNearWithinMeshRadius,
      },
    );
    const treeLod = config.lod.tree;
    check(
      'tree-near-ring-cannot-select-generic-proxy',
      treeLod.forceNearWithinMeshRadius === true
        && treeLod.proxyRadius === treeLod.meshRadius,
      {
        meshRadius: treeLod.meshRadius,
        proxyRadius: treeLod.proxyRadius,
        forceNearWithinMeshRadius: treeLod.forceNearWithinMeshRadius,
      },
    );
    check(
      'tree-impostor-prototype-parity',
      treeView.impostorAtlases.length === treeView.prototypes.length,
      {
        prototypes: treeView.prototypes.length,
        atlases: treeView.impostorAtlases.length,
      },
    );
    const origin = editor.terrainView.floatingOrigin.getState();
    const camera = editor.viewModeController.camera;
    const chunkSize = editor.terrainView.chunkWorldSize;
    const cameraChunk = `${Math.floor((camera.position.x + origin.x) / chunkSize)}:${
      Math.floor(-(camera.position.z + origin.z) / chunkSize)
    }`;
    check(
      'tree-camera-chunk-keeps-full-detail',
      treeView.chunkLodStates.get(cameraChunk)?.target === 'near',
      { cameraChunk, band: treeView.chunkLodStates.get(cameraChunk)?.target ?? null },
    );
    const treeAssets = [
      { scene: config.assets.scene },
      ...(config.assets.treeVariants ?? []),
    ];
    const bushAssets = config.assets.bushVariants ?? [];
    const missingAssets = (definitions, view) => definitions
      .filter((definition) => !view.prototypeIndicesByAsset.get(definition.id ?? definition.scene)?.length)
      .map((definition) => definition.id ?? definition.scene);
    const missingTrees = missingAssets(treeAssets, treeView);
    const missingBushes = missingAssets(bushAssets, bushView);
    check(
      'configured-runtime-prototype-counts',
      missingTrees.length === 0 && missingBushes.length === 0
        && treeView.prototypes.length > 0 && bushView.prototypes.length > 0,
      {
        trees: treeView.prototypes.length,
        bushes: bushView.prototypes.length,
        missingTrees,
        missingBushes,
      },
    );

    return {
      kind: 'simcity-dnd-vegetation-lod-qa',
      version: 1,
      generatedAt: new Date().toISOString(),
      config: {
        treeLod: config.lod.tree,
        bushLod: config.lod.bush,
      },
      treePrototypes,
      bushPrototypes,
      checks,
    };
  });

  await page.evaluate(() => window.__editor.terrainView.renderer.setAnimationLoop(null));
  report.gallery = { mode: 'isolated-offscreen', morphology: 'neutral', captures: [] };
  for (const [layer, prototypes, pageSize] of [
    ['bushes', report.bushPrototypes, 4], ['trees', report.treePrototypes, 4],
  ]) {
    for (let first = 0; first < prototypes.length; first += pageSize) {
      const last = Math.min(first + pageSize, prototypes.length);
      const suffix = `${String(first).padStart(2, '0')}-${String(last - 1).padStart(2, '0')}`;
      for (const representation of ['near', 'proxy']) {
        const name = `${layer === 'trees' ? 'tree' : 'bush'}-${representation}-${suffix}`;
        const result = await page.evaluate(async options => {
          const { captureVegetationGallery } = await import('/src/editor/performance/qa/VegetationGalleryScene.js');
          return captureVegetationGallery(window.__editor, options);
        }, { layer, representation, first, last });
        const filePath = path.join(outputDirectory, `${name}.png`);
        fs.writeFileSync(filePath, Buffer.from(result.png, 'base64'));
        screenshots.push(relativeArtifact(filePath));
        report.gallery.captures.push({ name, slots: result.slots });
        for (const slot of result.slots) report.checks.push({
          id: `${name}-${slot.prototypeIndex}-pixel-coverage`, passed: slot.passed, ...slot,
        });
      }
    }
  }

  report.url = baseUrl;
  report.screenshots = screenshots;
  report.browserErrors = browserErrors;
  report.browserWarnings = [...browserWarnings];
  report.passed = report.checks.every((check) => check.passed)
    && browserErrors.length === 0;
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  const failed = report.checks.filter((check) => !check.passed);
  console.log(
    `vegetation LOD QA: ${report.checks.length - failed.length}/${report.checks.length} checks`,
  );
  for (const check of failed) {
    console.error(`FAIL ${check.id}: ${JSON.stringify(check)}`);
  }
  for (const error of browserErrors) console.error(error);
  console.log(`wrote ${relativeArtifact(reportPath)}`);
  if (!report.passed) process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await browser.close();
}
