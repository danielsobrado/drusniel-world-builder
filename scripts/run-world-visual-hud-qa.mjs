import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureVisualSource,visualSourceStayedFixed} from './lib/world-visual-source.mjs';
import {fileHash} from './lib/world-visual-report.mjs';
import {checkHudInput,measureHudLayout} from './lib/world-visual-hud-checks.mjs';
import {originalVisualPoses} from './lib/world-visual-poses.mjs';
import {createBrowserErrorMonitor} from './lib/perf-browser-errors.mjs';
import {waitForPerfRunLock} from './perf-run-lock.mjs';
const option=(key,fallback)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]:fallback;
const repo=fileURLToPath(new URL('../',import.meta.url)),url=option('--url','http://localhost:5173'),out=path.resolve(option('--out','tmp/world-visual-quality/after/fixtures/hud'));
await mkdir(out,{recursive:true});const release=await waitForPerfRunLock(path.join(repo,'tmp',`perf-browser-${process.platform}.lock`));
const report={...await captureVisualSource(url,repo),startedAt:new Date().toISOString(),checks:[],artifacts:[],poses:[]};let browser,errors;
try {
 browser=await chromium.launch({headless:false,args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--use-angle=default']});
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});errors=createBrowserErrorMonitor(page);
 await page.goto(new URL('/?qaVisual=1',url).href,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.__worldVisualQa,null,{timeout:180000});await page.evaluate(()=>window.__worldVisualQa.setLighting());
 report.adapter=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter({powerPreference:'high-performance',featureLevel:'compatibility'});
  return {vendor:a?.info.vendor,architecture:a?.info.architecture,fallback:!!(a?.info.isFallbackAdapter??a?.isFallbackAdapter),backend:window.__editor.terrainView.rendererBackendStatus.mode};});
 if(report.adapter.backend!=='webgpu'||report.adapter.fallback||!report.adapter.vendor||/swiftshader|llvmpipe|lavapipe|warp/i.test(JSON.stringify(report.adapter)))throw new Error('Hardware WebGPU required.');
 const original=await originalVisualPoses(new URL('../',import.meta.url)),shore=JSON.parse(await readFile(path.join(repo,'docs/qa/world-visual-quality-2026-10-14/biomes/shore-review-poses.json'),'utf8'));
 const poses=[original[0],original[9],original[5],shore.marine[0]];
 await page.evaluate(p=>window.__worldVisualQa.cut(p),poses[0]);await page.evaluate(()=>window.__worldVisualQa.settle());
 report.checks.push(...await checkHudInput(page));
 await page.evaluate(async()=>{const {writeHudMetricsPreference}=await import('/src/editor/player/hud/HudMetricsPreference.js');writeHudMetricsPreference(true);});
 for(const pose of poses) {
  await page.evaluate(p=>window.__worldVisualQa.cut(p),pose);await page.evaluate(()=>window.__worldVisualQa.settle());
  for(const size of [[1600,900],[1280,720],[760,600]]) {
   await page.setViewportSize({width:size[0],height:size[1]});await page.evaluate(()=>window.__worldVisualQa.settle({minimumMs:0}));
   const layout=await measureHudLayout(page),id=`${pose.id}-${size[0]}`;
   report.checks.push({id,...layout,passed:layout.overlaps.length===0&&layout.contrasts.every(r=>r>=4.5)&&(size[0]!==760||layout.keysHidden)});
   const file=`${id}.png`;await page.screenshot({path:path.join(out,file)});report.artifacts.push({path:file,sha256:await fileHash(path.join(out,file))});
  }
  report.poses.push({id:pose.id,...await page.evaluate(()=>window.__worldVisualQa.diagnostics())});
 }
 await page.evaluate(()=>window.__editor.hudPresentation.dispose());await page.keyboard.press('F8');
 report.checks.push({id:'disposed presentation removes F8 listener',passed:!await page.evaluate(()=>window.__editor.hudVisibility.captured)});
 report.sourceStable=visualSourceStayedFixed(report,await captureVisualSource(url,repo));report.errors=errors.snapshot();
 report.passed=report.sourceStable&&!report.dirtyFiles.length&&report.errors.count===0&&report.checks.every(c=>c.passed);
 if(!report.passed)process.exitCode=1;
}catch(error){report.passed=false;report.failure=error.stack;report.errors=errors?.snapshot();process.exitCode=1;}
finally{await browser?.close();release();report.finishedAt=new Date().toISOString();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,checks:report.checks.filter(c=>!c.passed),failure:report.failure},null,2));
