import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

// Authoritative hardware WebGPU QA & readback capture for Frostgard Ice Caves & Glacier Front.
// Enforces hardware WebGPU (rejects WebGL/software), collects WebGPU GPU timestamp readbacks,
// compiled WGSL shader hashes, canvas pixel luminance/clipping readbacks, and 1600x900 screenshots.
// Usage: node scripts/run-ice-cave-qa.mjs --url http://localhost:5174 --out <dir> [--sites refuge,front] [--quality high]

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:5174' },
    out: { type: 'string', default: 'tmp/ice-cave-qa' },
    sites: { type: 'string', default: 'refuge,front' },
    quality: { type: 'string', default: 'high' },
  },
});

const SITE_SPECS = {
  refuge: {
    id: 'showcase-frostgard-refuge',
    prefix: 'glacier',
    poses: [
      ['01-mouth', [0, 4.2, 17, 0, -0.1]],
      ['02-tube-back', [0, 0, -2, 3.1416, 0.15]],
      ['03-squeeze', [-4.6, -0.8, -15, 0.08, 0]],
      ['04-hall-bridge', [-6.75, -2, -39.5, -0.52, 0.2]],
      ['05-crevasse-up', [-0.87, -2, -46, -1.07, 0.6]],
      ['06-refuge', [-30, -1, -64, 0.74, 0.05]],
      ['07-vault', [6, -3, -87, 0, 0.1]],
      ['08-crystal-rose-closeup', [9.0, -2.0, -49.5, -2.1, -0.05]],
      ['09-organ-pipes-closeup', [-10.5, -2.0, -47.5, 1.5, 0.05]],
    ],
  },
  front: {
    id: 'showcase-frostgard-glacier',
    prefix: 'front',
    poses: [
      ['01-approach', [0, 3, 24, 0, 0.08]],
      ['02-arch', [4, 3, 9, 0, 0.16]],
      ['03-cliff', [4, 2, -13, 0.1, 0.3]],
      ['04-cave-mouth', [-4, 2, -22, 1.25, 0.22]],
    ],
  },
};

const selected = args.sites.split(',').map((s) => s.trim()).filter((s) => SITE_SPECS[s]);
if (selected.length === 0) throw new Error(`No valid sites in --sites="${args.sites}"`);

const outDir = path.resolve(args.out);
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function analyzeImagePixels(pngBuffer) {
  const { data, info } = await sharp(pngBuffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const total = info.width * info.height;
  let lumaSum = 0;
  let clippedWhite = 0;
  let crushedBlack = 0;
  let blueRich = 0;
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaSum += luma;
    if (r >= 250 && g >= 250 && b >= 250) clippedWhite += 1;
    if (luma <= 4) crushedBlack += 1;
    if (b > r + 18) blueRich += 1;
  }
  return {
    meanLuma: Number((lumaSum / total).toFixed(1)),
    clippedWhitePct: Number(((clippedWhite / total) * 100).toFixed(2)),
    crushedBlackPct: Number(((crushedBlack / total) * 100).toFixed(2)),
    coolChromaPct: Number(((blueRich / total) * 100).toFixed(1)),
  };
}

const errors = [];
const browser = await chromium.launch({
  headless: false,
  args: [
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--use-angle=default',
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--disable-features=CalculateNativeWinOcclusion',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
});

const report = {
  startedAt: new Date().toISOString(),
  quality: args.quality,
  sites: [],
  errors,
};

try {
  for (const key of selected) {
    const spec = SITE_SPECS[key];
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') {
        const msg = `[${key}] ${m.text()}`;
        errors.push(msg);
        console.error(msg);
      }
    });
    page.on('pageerror', (e) => {
      const msg = `[${key}] pageerror: ${e.message}`;
      errors.push(msg);
      console.error(msg);
    });

    const overlayHidden = 'document.querySelector(".loading-overlay")?.hidden === true || !document.querySelector(".loading-overlay")';
    const t0 = Date.now();
    const targetUrl = `${args.url}/?location=${spec.id}&locationQuality=${args.quality}&gpuTimings=1`;
    await page.goto(targetUrl, { waitUntil: 'commit', timeout: 180000 });
    await page.waitForFunction(
      `(window.__editor?.locations?.state === 'inside' && (${overlayHidden})) || Boolean(document.querySelector('.loading-overlay [data-role=error]')?.textContent?.trim())`,
      null,
      { timeout: 240000, polling: 500 },
    );
    const overlayErr = await page.evaluate(() => document.querySelector('.loading-overlay [data-role=error]')?.textContent?.trim() || '');
    if (overlayErr) {
      throw new Error(`Location "${spec.id}" loading error: ${overlayErr}`);
    }
    const loadSeconds = Number(((Date.now() - t0) / 1000).toFixed(2));

    const adapter = await page.evaluate(async () => {
      const a = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
      const e = window.__editor;
      const renderer = e.terrainView?.renderer;
      const loc = e.locations?.current;
      let meshes = 0;
      let triangles = 0;
      let crystalInstances = 0;
      const materials = new Set();
      loc?.scene?.traverse((obj) => {
        if (obj.isMesh || obj.isSprite) {
          meshes += 1;
          if (obj.material) materials.add(obj.material.name || obj.material.type);
          if (obj.isInstancedMesh && /crystal|hoarfrost/i.test(obj.name)) {
            crystalInstances += obj.count;
          }
          const geo = obj.geometry;
          if (geo) {
            const count = geo.index ? geo.index.count : (geo.attributes?.position?.count ?? 0);
            triangles += Math.floor(count / 3) * (obj.count ?? 1);
          }
        }
      });
      return {
        vendor: a?.info?.vendor,
        architecture: a?.info?.architecture,
        isFallbackAdapter: Boolean(a?.isFallbackAdapter),
        backend: e.terrainView?.rendererBackendStatus?.mode,
        hasTimestampQuery: Boolean(renderer?.backend?.device?.features?.has?.('timestamp-query')),
        hasPostProcessing: Boolean(loc?.postProcessing),
        meshes,
        triangles,
        crystalInstances,
        materials: [...materials],
      };
    });

    if (adapter.backend !== 'webgpu' || adapter.isFallbackAdapter) {
      throw new Error(`Hardware WebGPU required, got backend=${adapter.backend} fallback=${adapter.isFallbackAdapter}`);
    }

    // Read back compiled WGSL shader hashes for location materials.
    const shaders = await page.evaluate(async () => {
      const e = window.__editor;
      const renderer = e.terrainView.renderer;
      const loc = e.locations.current;
      const camera = e.viewModeController.camera;
      const hash = (text) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(16);
      const seen = new Map();
      loc.scene.traverseVisible((obj) => {
        if (!obj.isMesh || Array.isArray(obj.material) || !obj.material?.isNodeMaterial) return;
        if (!seen.has(obj.material)) seen.set(obj.material, obj);
      });
      const rows = [];
      for (const [mat, mesh] of seen) {
        try {
          const { fragmentShader } = await renderer.debug.getShaderAsync(loc.scene, camera, mesh);
          rows.push({ name: mat.name || mat.type, hash: hash(fragmentShader), wgslBytes: fragmentShader.length });
        } catch (err) {
          rows.push({ name: mat.name || mat.type, error: String(err) });
        }
      }
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    });

    const poses = [];
    for (const [poseName, [x, y, z, yaw, pitch]] of spec.poses) {
      await page.evaluate((p) => window.__editor.playerController.placeAt(p), { x, y, z, yaw, pitch });
      await sleep(600);

      const perf = await page.evaluate(async () => {
        const e = window.__editor;
        const renderer = e.terrainView.renderer;
        const backend = renderer.backend;
        const dts = [];
        let prev = performance.now();
        for (let i = 0; i < 45; i += 1) {
          await new Promise((r) => requestAnimationFrame(r));
          const now = performance.now();
          if (i >= 5) dts.push(now - prev);
          prev = now;
        }
        dts.sort((a, b) => a - b);

        const gpuSamples = [];
        let passBreakdown = null;
        if (backend?.device?.features?.has?.('timestamp-query')) {
          const origBegin = backend.beginRender;
          let activeUids = new Map();
          let collecting = false;
          backend.beginRender = function wrappedBegin(context) {
            const res = origBegin.call(this, context);
            if (collecting) {
              const uid = this.getTimestampUID(context);
              const t = context.renderTarget;
              const label = context.color === false ? 'depth' : (t?.texture?.name || t?.name || (t ? 'offscreen' : 'screen'));
              activeUids.set(uid, `${label}#${context.id}`);
            }
            return res;
          };
          try {
            for (let i = 0; i < 16; i += 1) {
              activeUids = new Map();
              collecting = true;
              backend.trackTimestamp = true;
              await new Promise((r) => requestAnimationFrame(r));
              collecting = false;
              const uids = new Map(activeUids);
              try {
                await renderer.resolveTimestampsAsync('render');
                backend.trackTimestamp = false;
                let totalMs = 0;
                const passes = {};
                for (const [uid, label] of uids) {
                  const v = backend.getTimestamp(uid);
                  if (Number.isFinite(v) && v >= 0) {
                    totalMs += v;
                    passes[label] = Number(v.toFixed(3));
                  }
                }
                if (totalMs > 0) {
                  gpuSamples.push(totalMs);
                  if (!passBreakdown) passBreakdown = passes;
                }
              } catch {
                backend.trackTimestamp = false;
              }
            }
          } finally {
            backend.trackTimestamp = false;
            backend.beginRender = origBegin;
          }
        }
        gpuSamples.sort((a, b) => a - b);

        const info = renderer.info?.render ?? {};
        return {
          dtP50Ms: Number((dts[Math.floor(dts.length * 0.5)] ?? 0).toFixed(3)),
          dtP95Ms: Number((dts[Math.floor(dts.length * 0.95)] ?? 0).toFixed(3)),
          avgFps: Number((1000 / (dts.reduce((a, b) => a + b, 0) / Math.max(1, dts.length))).toFixed(1)),
          gpuSamples: gpuSamples.length,
          gpuTotalP50Ms: gpuSamples.length ? Number(gpuSamples[Math.floor(gpuSamples.length * 0.5)].toFixed(3)) : null,
          gpuTotalP95Ms: gpuSamples.length ? Number(gpuSamples[Math.floor(gpuSamples.length * 0.95)].toFixed(3)) : null,
          passCount: passBreakdown ? Object.keys(passBreakdown).length : 0,
          drawCalls: info.drawCalls ?? info.calls ?? null,
          renderedTriangles: info.triangles ?? null,
        };
      });

      const png = await page.screenshot({ type: 'png' });
      const pixels = await analyzeImagePixels(png);
      const jpgPath = path.join(outDir, `${spec.prefix}-${poseName}.jpg`);
      await sharp(png).jpeg({ quality: 90 }).toFile(jpgPath);
      poses.push({ name: poseName, ...perf, pixels });
    }

    report.sites.push({ key, id: spec.id, loadSeconds, adapter, shaders, poses });
    await context.close();
  }
} finally {
  await browser.close();
}

report.finishedAt = new Date().toISOString();
report.passed = errors.length === 0;
writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
