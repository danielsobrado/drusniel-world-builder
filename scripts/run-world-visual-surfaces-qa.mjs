import {captureVisualHarness} from './lib/world-visual-harness.mjs';
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileHash } from './lib/world-visual-report.mjs';
import {captureVisualSource,visualSourceStayedFixed} from './lib/world-visual-source.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
const option=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback;
const repo=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(option('--out','tmp/world-visual-quality/after/fixtures/surfaces'));
const url=option('--url','http://localhost:5173');await mkdir(out,{recursive:true});
const lights=option('--lights','neutral')==='all'?['day','low-sun','overcast','night']:option('--lights','neutral').split(',');
if(lights.some(l=>!['neutral','day','low-sun','overcast','night'].includes(l)))throw new Error('Unknown fixture lighting.');
const release=await waitForPerfRunLock(path.join(repo,'tmp',`perf-browser-${process.platform}.lock`));
const report={schemaVersion:1,...await captureVisualSource(url,repo),harness:await captureVisualHarness(import.meta.url,repo),startedAt:new Date().toISOString(),backends:{},artifacts:[]};let browser;
try {
 browser=await chromium.launch({headless:false,args:['--enable-unsafe-webgpu', '--js-flags=--max-old-space-size=8192','--ignore-gpu-blocklist','--use-angle=default']});
 for(const light of lights)for(const backend of ['webgpu','webgl']) {
  const key=light==='neutral'?backend:`${light}-${backend}`;console.log(`Surface fixture QA: ${key}`);
  const page=await browser.newPage({viewport:{width:800,height:600},deviceScaleFactor:1}),errors=createBrowserErrorMonitor(page);
  await page.goto(new URL(`/scripts/fixtures/world-visual-surfaces.html?backend=${backend}&light=${light}`,url).href,{waitUntil:'domcontentloaded'});
  let previous=null;
  for(;;) {
   await page.waitForFunction(last=>window.__worldSurfaceFixture?.report.done ||
     window.__worldSurfaceFixture?.pendingCapture&&window.__worldSurfaceFixture.pendingCapture!==last,previous,{timeout:180000});
   const state=await page.evaluate(()=>({id:window.__worldSurfaceFixture.pendingCapture,report:window.__worldSurfaceFixture.report}));
   if(!state.id){report.backends[key]=state.report;break;}
   const file=`${key}-${state.id}.png`;await page.screenshot({path:path.join(out,file)});
   report.artifacts.push({path:file,sha256:await fileHash(path.join(out,file))});
   previous=state.id;await page.evaluate(()=>window.__worldSurfaceFixture.continue());
  }
  report.backends[key].errors=errors.snapshot();
  if(backend==='webgpu') {
   report.adapter=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter({featureLevel:'compatibility',powerPreference:'high-performance'});
    return {vendor:a?.info.vendor,architecture:a?.info.architecture,description:a?.info.description,fallback:!!(a?.info.isFallbackAdapter??a?.isFallbackAdapter)};});
   if(report.adapter.fallback||!Object.values(report.adapter).some(v=>typeof v==='string'&&v.trim()) || /swiftshader|lavapipe|llvmpipe|warp|basic render/i.test(JSON.stringify(report.adapter)))throw new Error('Hardware WebGPU required.');
  }
  await page.close();
 }
 report.sourceStable=visualSourceStayedFixed(report,await captureVisualSource(url,repo));
 report.passed=report.sourceStable&&report.dirtyFiles.length===0 && Object.values(report.backends).every(r=>r.passed&&r.errors.count===0);
 if(!report.passed)process.exitCode=1;
}catch(error){report.failure=error.stack;report.passed=false;process.exitCode=1;}
finally {await browser?.close();release();report.finishedAt=new Date().toISOString();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,backends:report.backends,failure:report.failure},null,2));
