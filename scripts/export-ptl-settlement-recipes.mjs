#!/usr/bin/env node
/**
 * Exports the Procedural Texture Lab presets settlements use as portable
 * `.ptl.json` material recipes.
 *
 * The game depends only on the PTL *runtime* (`procedural-texture-lab`), which
 * regenerates a material from a recipe; the presets themselves are authored in
 * the Lab. This script drives a Lab checkout — its dev server and its own
 * `createMaterialRecipe` — and writes one recipe per `ptl` set in
 * `SETTLEMENT_SURFACE_SETS` to `public/assets/materials/settlement/`. Recipes
 * are a few kilobytes; the textures are generated from them in GPU memory when
 * a town comes into view (SettlementProceduralBaker).
 *
 * Usage: npm run export:ptl-settlement-recipes -- [--ptl <checkout>]
 * The checkout defaults to $PTL_ROOT, then ../procedural-texture-lab.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { SETTLEMENT_SURFACE_SETS } from '../src/editor/world/settlements/surfaces/SettlementDressing.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const PORT = 4187;
const PAGE = `http://${HOST}:${PORT}/thumbnail-generator.html`;

function option(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? null : process.argv[index + 1];
}

function startLab(ptlRoot) {
  const vite = path.join(ptlRoot, 'node_modules/vite/bin/vite.js');
  if (!fs.existsSync(vite)) {
    throw new Error(`No Procedural Texture Lab checkout with dependencies at ${ptlRoot}. Pass --ptl <dir> or set PTL_ROOT, and run npm ci there.`);
  }
  return spawn(process.execPath, [vite, '--host', HOST, '--port', String(PORT), '--strictPort'], { cwd: ptlRoot, stdio: 'ignore' });
}

async function waitForLab() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      if ((await fetch(PAGE)).ok) return;
    } catch {
      // The Lab's dev server is still starting.
    }
    await delay(150);
  }
  throw new Error('Timed out waiting for the Procedural Texture Lab dev server.');
}

/** Runs in the Lab page: presets → serialized recipes. */
async function exportInLab(presetIds) {
  const [constants, presets, runtime] = await Promise.all([
    import('/src/app/constants.ts'),
    import('/src/materials/presets.ts'),
    import('/src/runtime/index.ts'),
  ]);
  const byId = new Map(presets.MATERIAL_PRESETS.map((preset) => [preset.id, preset]));
  return presetIds.map((id) => {
    const preset = byId.get(id);
    if (!preset) throw new Error(`Unknown PTL preset: ${id}. Known: ${[...byId.keys()].join(', ')}`);
    const recipe = runtime.createMaterialRecipe({
      physical: { ...constants.DEFAULT_PHYSICAL, ...(preset.physical ?? {}) },
      synthesis: { ...constants.DEFAULT_SYNTHESIS, ...(preset.synthesis ?? {}) },
      groups: preset.groups ?? [],
      layers: preset.layers,
      surfaceGraph: preset.surfaceGraph ?? null,
    }, 0, 'object');
    return runtime.serializeMaterialRecipe(recipe);
  });
}

const ptlRoot = path.resolve(option('--ptl') ?? process.env.PTL_ROOT ?? path.join(rootDir, '../procedural-texture-lab'));
const outDir = path.join(rootDir, 'public/assets/materials/settlement');
const sets = Object.entries(SETTLEMENT_SURFACE_SETS).filter(([, set]) => set.ptl);
fs.mkdirSync(outDir, { recursive: true });

const lab = startLab(ptlRoot);
let browser = null;
try {
  await waitForLab();
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(PAGE, { waitUntil: 'load' });
  const recipes = await page.evaluate(exportInLab, sets.map(([, set]) => set.ptl));
  sets.forEach(([name, set], index) => {
    const recipe = typeof recipes[index] === 'string' ? recipes[index] : JSON.stringify(recipes[index]);
    const file = path.join(outDir, `${name}.ptl.json`);
    fs.writeFileSync(file, recipe.endsWith('\n') ? recipe : `${recipe}\n`);
    console.log(`${path.relative(rootDir, file)}  ←  PTL ${set.ptl}  (${recipe.length} bytes)`);
  });
} finally {
  await browser?.close();
  lab.kill();
}
