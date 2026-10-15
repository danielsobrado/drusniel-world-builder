import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureVisualSource,visualSourceStayedFixed} from './lib/world-visual-source.mjs';
import {captureVisualHarness} from './lib/world-visual-harness.mjs';
import {fileHash} from './lib/world-visual-report.mjs';
import {captureWorldCanvas} from './lib/world-visual-canvas.mjs';
import {createBrowserErrorMonitor} from './lib/perf-browser-errors.mjs';
import {waitForPerfRunLock} from './perf-run-lock.mjs';
const option=(key,fallback)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]:fallback;
const repo=fileURLToPath(new URL('../',import.meta.url)),url=option('--url','http://localhost:5190'),out=path.resolve(option('--out','tmp/world-visual-quality/water-pattern-before'));
await mkdir(out,{recursive:true});const release=await waitForPerfRunLock(path.join(repo,'tmp',`perf-browser-${process.platform}.lock`));
const report={schemaVersion:1,...await captureVisualSource(url,repo),harness:await captureVisualHarness(import.meta.url,repo),startedAt:new Date().toISOString(),cases:[],artifacts:[]};let browser,errors;
try {
 browser=await chromium.launch({headless:false,args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--use-angle=default']});
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});errors=createBrowserErrorMonitor(page);
 await page.goto(new URL('/?qaVisual=1',url).href,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__worldVisualQa,null,{timeout:180000});
 report.adapter=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter({powerPreference:'high-performance',featureLevel:'compatibility'});
  return {vendor:a?.info.vendor,architecture:a?.info.architecture,fallback:!!(a?.info.isFallbackAdapter??a?.isFallbackAdapter),backend:window.__editor.terrainView.rendererBackendStatus.mode};});
 if(report.adapter.backend!=='webgpu'||report.adapter.fallback||!report.adapter.vendor||/swiftshader|lavapipe|llvmpipe|warp|basic render/i.test(JSON.stringify(report.adapter)))throw new Error('Hardware WebGPU required.');
 const poses=JSON.parse(await readFile(path.join(repo,'docs/qa/world-visual-quality-2026-10-14/biomes/shore-review-poses.json'),'utf8'));
 report.pose=poses.marine.find(p=>p.id==='marine-coast-overview');
 await page.evaluate(()=>window.__worldVisualQa.setLighting());
 // Enter at the same ground point so the ordinary player path prepares destination collision.
 await page.evaluate(p=>window.__worldVisualQa.cut({...p,mode:'player',heightAboveGround:1.7}),report.pose);await page.evaluate(()=>window.__worldVisualQa.settle());
 await page.evaluate(p=>window.__worldVisualQa.cut(p),report.pose);await page.evaluate(()=>window.__worldVisualQa.settle({minimumMs:0}));
 if(!await page.evaluate(()=>window.__worldVisualQa.setCaptureUi(true)))throw new Error('Water capture UI refused entry.');
 const variants=option('--variants','default,foam-off,reflections-off,surf-off,detail-off').split(',');
 if(variants.some(v=>!['default','foam-off','reflections-off','surf-off','detail-off','sea-off','water-off','sun-highlights-off','refraction-off','caustics-off'].includes(v)))throw new Error('Unknown water diagnostic variant.');
 for(const variant of variants) {
  console.log(`Water pattern review: ${variant}`);
  const controls=await page.evaluate(async variant=>{
   const {SharedWaterMaterials,WATER_SLOT_OPTIONS}=await import('/src/editor/stylized/SharedWaterMaterials.js');
   const {skyLightUniforms}=await import('/src/editor/stylized/sky/skyLight.js');
   const {Color}=await import('three/webgpu');
   const e=window.__editor,surface=e.stylizedSurface,config=structuredClone(e.config.stylizedSurface);
   const black=new Color(0);skyLightUniforms.sunColor.onObjectUpdate(()=>variant==='sun-highlights-off'?black:skyLightUniforms.sunColor.value);
   if(variant==='foam-off')config.water.foam.enabled=false;
   if(variant==='surf-off')config.water.sea.surf.enabled=false;
   if(variant==='detail-off')config.water.sea.detail.enabled=false;
   if(variant==='sea-off')config.water.sea.enabled=false;
   if(variant==='refraction-off')config.water.refraction.enabled=false;
   if(variant==='caustics-off')config.water.caustics.intensity=0;
   // Preserve the water reflection classification when replacing its capture.
   const pool=new SharedWaterMaterials(variant==='reflections-off'?{sample:(_direction,fallback)=>fallback}:surface.reflections),previous=surface.sharedWaterMaterials;
   surface.sharedWaterMaterials=pool;
   for(const slot of surface.waterSlots) {
    if(variant==='water-off')e.terrainView.scene.remove(slot.mesh);
    else if(!slot.mesh.parent)e.terrainView.scene.add(slot.mesh);
    slot.materialOptions={...slot.materialOptions,config,time:{value:123.4}};
    slot.mesh.userData[WATER_SLOT_OPTIONS]=slot.materialOptions;slot.sharedMaterials=pool;
    slot.material=slot.createMaterial(false);slot.refractiveMaterial=null;slot.refractionPrewarmed=false;slot.mesh.material=slot.material;
   }
   previous?.dispose();await e.terrainView.renderer.compileAsync(e.terrainView.scene,e.viewModeController.camera);
   return {variant,clock:123.4,foam:config.water.foam.enabled,surf:config.water.sea.surf.enabled,detail:config.water.sea.detail.enabled,reflections:variant!=='reflections-off',water:variant!=='water-off',sea:config.water.sea.enabled,refraction:config.water.refraction.enabled,caustics:config.water.caustics.intensity,sunHighlights:variant!=='sun-highlights-off'};
  },variant);
  const readiness=await page.evaluate(()=>window.__worldVisualQa.settle({minimumMs:0}));
  const file=`${variant}.png`;await captureWorldCanvas(page,path.join(out,file));
  report.cases.push({...controls,readiness});report.artifacts.push({path:file,sha256:await fileHash(path.join(out,file))});
 }
 report.errors=errors.snapshot();report.sourceStable=visualSourceStayedFixed(report,await captureVisualSource(url,repo));
 report.passed=report.sourceStable&&!report.dirtyFiles.length&&report.errors.count===0&&report.cases.every(c=>c.readiness.ready);if(!report.passed)process.exitCode=1;
}catch(error){report.failure=error.stack;report.passed=false;report.errors=errors?.snapshot();process.exitCode=1;}
finally{await browser?.close();release();report.finishedAt=new Date().toISOString();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,failure:report.failure,cases:report.cases.length,errors:report.errors},null,2));
