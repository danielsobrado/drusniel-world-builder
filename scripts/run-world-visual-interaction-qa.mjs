import {captureVisualHarness} from './lib/world-visual-harness.mjs';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureVisualSource,visualSourceStayedFixed} from './lib/world-visual-source.mjs';
import {fileHash} from './lib/world-visual-report.mjs';
import {captureWorldCanvas} from './lib/world-visual-canvas.mjs';
import {inspectWorldMeadow,prepareClearedInteraction,stampInteraction,recoverInteraction,restoreInteraction} from './lib/world-visual-interaction-checks.mjs';
import {createBrowserErrorMonitor} from './lib/perf-browser-errors.mjs';
import {waitForPerfRunLock} from './perf-run-lock.mjs';
const option=(key,fallback)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]:fallback;
const repo=fileURLToPath(new URL('../',import.meta.url)),url=option('--url','http://localhost:5173'),out=path.resolve(option('--out','tmp/world-visual-quality/after/fixtures/interaction'));
await mkdir(out,{recursive:true});const release=await waitForPerfRunLock(path.join(repo,'tmp',`perf-browser-${process.platform}.lock`));
const report={schemaVersion:1,...await captureVisualSource(url,repo),harness:await captureVisualHarness(import.meta.url,repo),startedAt:new Date().toISOString(),states:[],checks:[],artifacts:[]};let browser,page,errors;
try {
 browser=await chromium.launch({headless:false,args:['--enable-unsafe-webgpu', '--js-flags=--max-old-space-size=8192','--ignore-gpu-blocklist','--use-angle=default']});
 page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});errors=createBrowserErrorMonitor(page);
 await page.goto(new URL('/?qaVisual=1',url).href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__worldVisualQa,null,{timeout:180000});
 report.adapter=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter({powerPreference:'high-performance',featureLevel:'compatibility'});
  return {vendor:a?.info.vendor,architecture:a?.info.architecture,fallback:!!(a?.info.isFallbackAdapter??a?.isFallbackAdapter),backend:window.__editor.terrainView.rendererBackendStatus.mode};});
 if(report.adapter.backend!=='webgpu'||report.adapter.fallback||!report.adapter.vendor||/swiftshader|lavapipe|llvmpipe|warp|basic render/i.test(JSON.stringify(report.adapter)))throw new Error('Hardware WebGPU required.');
 const manifest=JSON.parse(await readFile(path.join(repo,'docs/qa/world-visual-quality-2026-10-14/biomes/procedural-review-poses.json'),'utf8'));
 report.pose=manifest.original[7];await page.evaluate(()=>window.__worldVisualQa.setLighting());
 await page.evaluate(p=>window.__worldVisualQa.cut(p),report.pose);await page.evaluate(()=>window.__worldVisualQa.settle());
 if(!await page.evaluate(()=>window.__worldVisualQa.setCaptureUi(true)))throw new Error('Interaction capture UI refused entry.');
 for(const id of ['untouched','cleared','stamped','recovered-one-second']) {
  if(id==='cleared')await prepareClearedInteraction(page);
  if(id==='stamped')report.stamp=await stampInteraction(page);
  if(id==='recovered-one-second')report.recovery=await recoverInteraction(page);
  const state=await inspectWorldMeadow(page);report.states.push({id,...state});
  const file=`original-08-${id}.png`;await captureWorldCanvas(page,path.join(out,file));report.artifacts.push({path:file,sha256:await fileHash(path.join(out,file))});
 }
 const [untouched,cleared,stamped,recovered]=report.states;
 report.checks.push({id:'all states retain the same prepared grass population',passed:untouched.roots>0&&report.states.every(s=>s.readiness.ready&&s.roots===untouched.roots)},
  {id:'clearing removes transient body press',passed:cleared.press.normalized===0},
  {id:'configured body sphere produces a visible press value',passed:stamped.press.normalized>.1},
  {id:'press falls below three percent after one actual recovery second',passed:report.recovery.elapsedSimulationSeconds>=1&&recovered.press.normalized<.03},
  {id:'clearing and stamping preserve spell marks',passed:report.states.every(s=>s.press.markPeak===untouched.press.markPeak)});
 report.errors=errors.snapshot();report.sourceStable=visualSourceStayedFixed(report,await captureVisualSource(url,repo));
 report.passed=report.sourceStable&&!report.dirtyFiles.length&&report.errors.count===0&&report.checks.every(c=>c.passed);if(!report.passed)process.exitCode=1;
}catch(error){report.failure=error.stack;report.passed=false;report.errors=errors?.snapshot();process.exitCode=1;}
finally{if(page)await restoreInteraction(page).catch(()=>{});await browser?.close();release();report.finishedAt=new Date().toISOString();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,failedChecks:report.checks.filter(c=>!c.passed),failure:report.failure},null,2));
