import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repositoryState,fileHash } from './lib/world-visual-report.mjs';
import { waitForPerfRunLock } from './perf-run-lock.mjs';
import { createBrowserErrorMonitor } from './lib/perf-browser-errors.mjs';
const option=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback;
const repo=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(option('--out','tmp/world-visual-quality/after/fixtures/trees'));
const phase=option('--phase','after');
const url=option('--url','http://localhost:5173');await mkdir(out,{recursive:true});
const release=await waitForPerfRunLock(path.join(repo,'tmp',`perf-browser-${process.platform}.lock`));
const report={schemaVersion:1,...repositoryState(repo),startedAt:new Date().toISOString(),backends:{},artifacts:[]};let browser;
try {
 browser=await chromium.launch({headless:false,args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--use-angle=default']});
 for(const backend of ['webgpu','webgl']) {
  const page=await browser.newPage({viewport:{width:800,height:600},deviceScaleFactor:1}),errors=createBrowserErrorMonitor(page);
  await page.goto(new URL(`/scripts/fixtures/world-visual-trees.html?backend=${backend}&phase=${phase}`,url).href,{waitUntil:'domcontentloaded'});
  let previous=null;
  for(;;) {
   await page.waitForFunction(last=>window.__worldTreeFixture?.report.done ||
     window.__worldTreeFixture?.pendingCapture&&window.__worldTreeFixture.pendingCapture!==last,previous,{timeout:180000});
   const state=await page.evaluate(()=>({id:window.__worldTreeFixture.pendingCapture,report:window.__worldTreeFixture.report}));
   if(!state.id){report.backends[backend]=state.report;break;}
   const file=`${backend}-${state.id}.png`;await page.screenshot({path:path.join(out,file)});
   report.artifacts.push({path:file,sha256:await fileHash(path.join(out,file))});
   previous=state.id;await page.evaluate(()=>window.__worldTreeFixture.continue());
  }
  report.backends[backend].errors=errors.snapshot();
  if(backend==='webgpu') {
   report.adapter=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter({featureLevel:'compatibility',powerPreference:'high-performance'});
    return {vendor:a?.info.vendor,architecture:a?.info.architecture,description:a?.info.description,fallback:!!(a?.info.isFallbackAdapter??a?.isFallbackAdapter)};});
   if(report.adapter.fallback||!Object.values(report.adapter).some(v=>typeof v==='string'&&v.trim()) || /swiftshader|lavapipe|llvmpipe|warp|basic render/i.test(JSON.stringify(report.adapter)))throw new Error('Hardware WebGPU required.');
  }
  await page.close();
 }
 report.passed=report.dirtyFiles.length===0 && Object.values(report.backends).every(r=>r.passed&&r.errors.count===0);
 if(!report.passed)process.exitCode=1;
}catch(error){report.failure=error.stack;report.passed=false;process.exitCode=1;}
finally {await browser?.close();release();report.finishedAt=new Date().toISOString();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,backends:report.backends,failure:report.failure},null,2));
