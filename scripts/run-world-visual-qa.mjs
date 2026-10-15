import { chromium } from 'playwright';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { originalVisualPoses,parseVisualArguments } from './lib/world-visual-poses.mjs';
import { captureVisualSource,visualSourceStayedFixed } from './lib/world-visual-source.mjs';
import { fileHash,validateVisualReport } from './lib/world-visual-report.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
const root=new URL('../',import.meta.url),repo=fileURLToPath(root),args=parseVisualArguments(process.argv.slice(2));
const out=path.resolve(args.out);await mkdir(out,{recursive:true});
const release=await waitForPerfRunLock(path.join(repo,'tmp',`perf-browser-${process.platform}.lock`));
const report={schemaVersion:1,startedAt:new Date().toISOString(),viewport:{width:1600,height:900},
  poses:[],checks:[],artifacts:[],configHashes:{},suite:args.suite};
let browser,page,errors;
try {
  Object.assign(report,await captureVisualSource(args.url,repo));
  for(const file of ['editor.config.yaml','config/terrain-material-bake.yaml','config/ambient-effects.yaml','config/water-visual.yaml','config/exploration.yaml'])report.configHashes[file]=report.sourceSnapshot?.files[file]??await fileHash(new URL(file,root));
  report.mapHash=await fileHash(new URL('maps/Eldara Full 2026-07-23-20-37.json',root));
  browser=await chromium.launch({headless:false,args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--use-angle=default']});
  page=await browser.newPage({viewport:report.viewport,deviceScaleFactor:1});errors=createBrowserErrorMonitor(page);
  await page.goto(new URL('/?qaVisual=1',args.url).href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__worldVisualQa,null,{timeout:180000});
  report.adapter=await page.evaluate(async()=>{
    const a=await navigator.gpu.requestAdapter({powerPreference:'high-performance',featureLevel:'compatibility'});
    return {vendor:a?.info.vendor,architecture:a?.info.architecture,description:a?.info.description,
      fallback:!!(a?.info.isFallbackAdapter??a?.isFallbackAdapter),backend:window.__editor.terrainView.rendererBackendStatus.mode};
  });
  if(report.adapter.backend!=='webgpu'||report.adapter.fallback||!/\S/.test([report.adapter.vendor,report.adapter.architecture,report.adapter.description].join(''))
    ||/swiftshader|lavapipe|llvmpipe|warp|basic render/i.test(JSON.stringify(report.adapter)))throw new Error('Hardware WebGPU required.');
  await page.evaluate(()=>window.__worldVisualQa.setLighting());
  let poses=await originalVisualPoses(root);
  if(args.suite==='atmosphere') {
    poses=[poses[5],poses[6],{...poses[6],id:'original-07-reverse',yaw:poses[6].yaw+Math.PI},poses[7],poses[8]];
  }
  if(['biome-classification','extended'].includes(args.suite)) {
    const manifest=JSON.parse(await readFile(new URL('docs/qa/world-visual-quality-2026-10-14/biomes/procedural-review-poses.json',root),'utf8'));
    poses=args.suite==='extended'?manifest.additional:
      [manifest.original[10],manifest.additional.find(p=>p.expectedBiomeId===11)];
    if(poses.some(p=>!p))throw new Error('Frozen biome manifest is incomplete.');
  }
  if(['shore','imported'].includes(args.suite)) {
    const manifest=JSON.parse(await readFile(new URL('docs/qa/world-visual-quality-2026-10-14/biomes/shore-review-poses.json',root),'utf8'));
    report.poseManifestHash=await fileHash(new URL('docs/qa/world-visual-quality-2026-10-14/biomes/shore-review-poses.json',root));
    if(report.mapHash!==manifest.mapSha256)throw new Error('Frozen imported map hash changed.');
    poses=args.suite==='imported'?manifest.imported.map(p=>({...p,world:'eldara'})):[...manifest.shore.filter(p=>p.world==='procedural'),...manifest.marine,...manifest.shore.filter(p=>p.world==='eldara')];
  }
  if(args.suite==='composition') {
    const biomes=JSON.parse(await readFile(new URL('docs/qa/world-visual-quality-2026-10-14/biomes/procedural-review-poses.json',root),'utf8'));
    const shores=JSON.parse(await readFile(new URL('docs/qa/world-visual-quality-2026-10-14/biomes/shore-review-poses.json',root),'utf8'));
    if(report.mapHash!==shores.mapSha256)throw new Error('Frozen imported map hash changed.');
    poses=[...biomes.original.filter((_,i)=>i>=2&&i<=9||i===11),...biomes.additional,
      ...shores.shore.filter(p=>p.world==='procedural'),...shores.marine,
      ...shores.imported.map(p=>({...p,world:'eldara'})),...shores.shore.filter(p=>p.world==='eldara')];
  }
  if(!['original','atmosphere','biome-classification','extended','composition','shore','imported'].includes(args.suite))throw new Error(`Suite ${args.suite} requires later implementation fixtures; no fixtures were skipped.`);
  if(args.only) {
    const ids=args.only.split(',');
    if(ids.some(id=>!poses.some(p=>p.id===id)))throw new Error(`Unknown requested pose: ${args.only}`);
    poses=poses.filter(p=>ids.includes(p.id));report.only=ids;
  }
  let activeWorld='procedural';
  for(const pose of poses) {
    if(pose.world&&pose.world!==activeWorld) {await page.evaluate(name=>window.__worldVisualQa.loadWorld(name),pose.world);activeWorld=pose.world;}
    console.log(`Visual QA: ${pose.id}`);
    try {
      await page.evaluate(p=>window.__worldVisualQa.cut(p),pose);
      await page.evaluate(()=>window.__worldVisualQa.settle());
      const state=await page.evaluate(()=>window.__worldVisualQa.diagnostics());
      if(pose.expectedBiomeId!==undefined&&state.actualBiomeId!==pose.expectedBiomeId)
        throw new Error(`Frozen biome ${pose.id} expected ${pose.expectedBiomeId}, got ${state.actualBiomeId}.`);
      const files=[`${pose.id}-hud.png`,`${pose.id}.png`];
      await page.screenshot({path:path.join(out,files[0])});
      if(!await page.evaluate(()=>window.__worldVisualQa.setCaptureUi(true)))throw new Error('Clean capture mode was blocked.');
      const leaked=await page.evaluate(()=>[...document.querySelectorAll('[data-capture-ui]')]
        .filter(root=>getComputedStyle(root).visibility!=='hidden'&&!root.hidden).map(root=>root.className));
      if(leaked.length)throw new Error(`Capture UI is still visible: ${leaked.join(', ')}`);
      await page.locator('canvas').first().screenshot({path:path.join(out,files[1])});
      await page.evaluate(()=>window.__worldVisualQa.setCaptureUi(false));
      for(const file of files)report.artifacts.push({path:file,sha256:await fileHash(path.join(out,file))});
      report.poses.push({...pose,...state});
    } catch(error) {
      await page.screenshot({path:path.join(out,`failed-${pose.id}.png`)});
      report.failurePose=pose;report.failureReadiness=await page.evaluate(()=>window.__worldVisualQa.readiness());
      report.failureDiagnostics=await page.evaluate(()=>window.__worldVisualQa.diagnostics());throw error;
    }
  }
  if(args.baseline) {
    const baseline=JSON.parse(await readFile(path.join(args.baseline,'report.json'),'utf8'));
    for(const pose of report.poses) {
      const old=baseline.poses.find(old=>old.id===pose.id);
      report.checks.push({id:`pose:${pose.id}`,task:'VQ-03',expected:old&&[old.x,old.z,old.yaw,old.pitch],actual:[pose.x,pose.z,pose.yaw,pose.pitch],
        passed:!!old&&old.x===pose.x&&old.z===pose.z&&old.yaw===pose.yaw&&old.pitch===pose.pitch});
    }
  }
  const end=await captureVisualSource(args.url,repo);
  const stable=visualSourceStayedFixed(report,end);
  report.checks.push({id:'source stayed fixed',task:'VQ-03',expected:report.sourceSha,actual:end.sourceSha,passed:stable});
} catch(error) {report.failure=error.stack;process.exitCode=1;}
finally {
  report.errors=errors?.snapshot()??{count:0,errors:[]};report.finishedAt=new Date().toISOString();
  await browser?.close();release();
  const verdict=await validateVisualReport(report,pathToFileURL(`${out}${path.sep}`));
  report.passed=!report.failure&&verdict.passed;report.failures=verdict.failures;if(!report.passed)process.exitCode=1;
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,poses:report.poses.length,out,failure:report.failure,failures:report.failures},null,2));
}
