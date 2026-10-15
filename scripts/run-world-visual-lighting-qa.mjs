import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureVisualSource,visualSourceStayedFixed} from './lib/world-visual-source.mjs';
import {fileHash} from './lib/world-visual-report.mjs';
import {createBrowserErrorMonitor} from './lib/perf-browser-errors.mjs';
import {waitForPerfRunLock} from './perf-run-lock.mjs';
import {captureWorldCanvas} from './lib/world-visual-canvas.mjs';
const option=(key,fallback)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]:fallback;
const repo=fileURLToPath(new URL('../',import.meta.url)),url=option('--url','http://localhost:5173'),out=path.resolve(option('--out','tmp/world-visual-quality/after/lighting'));
const only=option('--only',null)?.split(',');await mkdir(out,{recursive:true});
const release=await waitForPerfRunLock(path.join(repo,'tmp',`perf-browser-${process.platform}.lock`));
const report={...await captureVisualSource(url,repo),startedAt:new Date().toISOString(),poses:[],checks:[],artifacts:[],errors:{count:0,errors:[]}};let browser,page,errors;
try {
 const manifest=JSON.parse(await readFile(path.join(repo,'docs/qa/world-visual-quality-2026-10-14/biomes/procedural-review-poses.json'),'utf8'));
 const poses=[...manifest.original.filter((_,i)=>[0,1,3,5,6,9,10,11].includes(i)),manifest.additional.find(p=>p.expectedBiomeId===11)];
 const lights=[{id:'day',preset:'highfield',hour:12,weather:'off'},
  {id:'low-sun',preset:'emberfall',hour:18,weather:'off'},
  {id:'overcast',preset:'highfield',hour:12,weather:'rain'},
  {id:'night',preset:'moonrise',hour:0,weather:'off'}];
 const cases=poses.flatMap(p=>lights.map(light=>({id:`${p.id}-${light.id}`,pose:p,light})));
 if(only?.some(id=>!cases.some(c=>c.id===id)))throw new Error(`Unknown lighting case ${only}`);
 browser=await chromium.launch({headless:false,args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--use-angle=default']});
 for(const c of cases.filter(c=>!only||only.includes(c.id))) {
  console.log(`Lighting QA: ${c.id}`);
  // A new context gives each pose/light pair fresh weather, wetness and temporal history.
  const context=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1});page=await context.newPage();errors=createBrowserErrorMonitor(page);
  try {
   await page.goto(new URL('/?qaVisual=1',url).href,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!window.__worldVisualQa,null,{timeout:180000});
   const adapter=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter({powerPreference:'high-performance',featureLevel:'compatibility'});
    return {vendor:a?.info.vendor,architecture:a?.info.architecture,fallback:!!(a?.info.isFallbackAdapter??a?.isFallbackAdapter),backend:window.__editor.terrainView.rendererBackendStatus.mode};});
   if(adapter.backend!=='webgpu'||adapter.fallback||!adapter.vendor||/swiftshader|lavapipe|llvmpipe|warp/i.test(JSON.stringify(adapter)))throw new Error('Hardware WebGPU required.');
   report.adapter??=adapter;
   const freshWetness=await page.evaluate(()=>window.__editor.surfaceWetness.value);
   if(freshWetness!==0)throw new Error('Fresh lighting context already has rain wetness.');
   await page.evaluate(light=>window.__worldVisualQa.setLighting(light),c.light);
   await page.evaluate(p=>window.__worldVisualQa.cut(p),c.pose);
   const warmup=await page.evaluate(()=>window.__worldVisualQa.warmWeather(20));
   const convergence=await page.evaluate(()=>window.__worldVisualQa.settleLighting());
   const readiness=await page.evaluate(()=>window.__worldVisualQa.settle({minimumMs:0}));
   const diagnostics=await page.evaluate(()=>window.__worldVisualQa.diagnostics());
   if(diagnostics.actualBiomeId!==c.pose.expectedBiomeId)throw new Error(`Lighting provenance expected biome ${c.pose.expectedBiomeId}, got ${diagnostics.actualBiomeId}.`);
   const resolvedWeather=await page.evaluate(()=>({wetness:window.__editor.surfaceWetness.value,
    overcast:window.__editor.skyLooks.overcast,overcastTarget:window.__editor.skyLooks.overcastTarget,
    regional:window.__editor.skyLooks.region,stats:window.__editor.weatherController?.getStats?.()}));
   report.checks.push({id:c.id,passed:readiness.ready&&warmup.simulationSeconds>=20&&convergence.stableFrames>=60&&convergence.maximumChange<.001
    &&(!diagnostics.renderPath.includes('cinematic')||diagnostics.finishApplications===1)});
   report.poses.push({...c,freshWetness,warmup,convergence,readiness,resolvedWeather,diagnostics,adapter});
   if(!await page.evaluate(()=>window.__worldVisualQa.setCaptureUi(true)))throw new Error('Lighting capture UI refused entry.');
   const file=`${c.id}.png`;await captureWorldCanvas(page,path.join(out,file));
   report.artifacts.push({path:file,sha256:await fileHash(path.join(out,file))});
   const observed=errors.snapshot();report.errors.count+=observed.count;report.errors.errors.push(...observed.errors);
   if(observed.count)throw new Error(`Browser errors in ${c.id}.`);
  }catch(error){report.failureCase=c;report.failureDiagnostics=await page.evaluate(()=>window.__worldVisualQa?.diagnostics()).catch(()=>null);
   await page.screenshot({path:path.join(out,`failed-${c.id}.png`)}).catch(()=>{});throw error;
  }finally{await context.close();page=null;}
 }
 report.sourceStable=visualSourceStayedFixed(report,await captureVisualSource(url,repo));
 report.passed=report.sourceStable&&report.dirtyFiles.length===0&&report.errors.count===0&&report.checks.length===(only?.length??36)&&report.checks.every(c=>c.passed);
 if(!report.passed)process.exitCode=1;
}catch(error){report.failure=error.stack;report.passed=false;process.exitCode=1;}
finally{await browser?.close();release();report.finishedAt=new Date().toISOString();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,poses:report.poses.length,failure:report.failure},null,2));
