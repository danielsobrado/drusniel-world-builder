import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureVisualSource,visualSourceStayedFixed} from './lib/world-visual-source.mjs';
import {fileHash} from './lib/world-visual-report.mjs';
import {motionChecks,videoMetadata,selectMotionFrames,motionContactSheet} from './lib/world-visual-motion-report.mjs';
import {createBrowserErrorMonitor} from './lib/perf-browser-errors.mjs';
import {waitForPerfRunLock} from './perf-run-lock.mjs';
import {observeVisualAudio,beginVisualFunctionalCheck,finishVisualFunctionalCheck} from './lib/world-visual-functional.mjs';
const option=(key,fallback)=>process.argv.includes(key)?process.argv[process.argv.indexOf(key)+1]:fallback;
const repo=fileURLToPath(new URL('../',import.meta.url)),url=option('--url','http://localhost:5173'),out=path.resolve(option('--out','tmp/world-visual-quality/after/motion'));
const only=option('--only',null)?.split(',');await mkdir(out,{recursive:true});
const release=await waitForPerfRunLock(path.join(repo,'tmp',`perf-browser-${process.platform}.lock`));
const report={schemaVersion:1,...await captureVisualSource(url,repo),startedAt:new Date().toISOString(),clips:[],checks:[],artifacts:[],errors:{count:0,errors:[]},videoOverheadExcludedFromPerformance:true};let browser,page,errors;
try {
 const manifest=JSON.parse(await readFile(path.join(repo,'docs/qa/world-visual-quality-2026-10-14/biomes/procedural-review-poses.json'),'utf8'));
 const poses=[...[3,5,4,9].map(i=>manifest.original[i]),{id:'synthetic-open-ground',synthetic:true}];
 const cases=poses.flatMap(startPose=>['first-person','third-person'].map(cameraMode=>({id:`${startPose.id}-${cameraMode}`,startPose,cameraMode,sequenceId:'walk-sprint-turn-v1'})));
 if(only?.some(id=>!cases.some(c=>c.id===id)))throw new Error(`Unknown motion case ${only}`);
 browser=await chromium.launch({headless:false,args:['--enable-unsafe-webgpu','--ignore-gpu-blocklist','--use-angle=default']});
 for(const c of cases.filter(c=>!only||only.includes(c.id))) {
  console.log(`Motion QA: ${c.id}`);
  const context=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1});await observeVisualAudio(context);page=await context.newPage();errors=createBrowserErrorMonitor(page);
  const clipDir=path.join(out,c.id),framesDir=path.join(clipDir,'frames');await mkdir(framesDir,{recursive:true});
  let recording=false;
  try {
   await page.goto(new URL('/?qaVisual=1',url).href,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!window.__worldVisualQa,null,{timeout:180000});
   const adapter=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter({powerPreference:'high-performance',featureLevel:'compatibility'});
    return {vendor:a?.info.vendor,architecture:a?.info.architecture,fallback:!!(a?.info.isFallbackAdapter??a?.isFallbackAdapter),backend:window.__editor.terrainView.rendererBackendStatus.mode};});
   if(adapter.backend!=='webgpu'||adapter.fallback||!adapter.vendor||/swiftshader|lavapipe|llvmpipe|warp|basic render/i.test(JSON.stringify(adapter)))throw new Error('Hardware WebGPU required.');
   report.adapter??=adapter;
   await page.evaluate(()=>window.__worldVisualQa.setLighting());
   let synthetic=null;
   if(c.startPose.synthetic){synthetic=await page.evaluate(()=>window.__worldVisualQa.loadSynthetic());c.startPose=synthetic.startPose;}
   const request={startPose:c.startPose,cameraMode:c.cameraMode,sequenceId:c.sequenceId};
   const preparation=await page.evaluate(request=>window.__worldVisualQa.prepareMotion(request),request);
   const beforeIdentity=synthetic?await page.evaluate(()=>window.__worldVisualQa.syntheticIdentity()):null;
   const beforeResidency=synthetic?await page.evaluate(()=>window.__worldVisualQa.syntheticResidency()):null;
   const functionalBefore=await beginVisualFunctionalCheck(page);
   if(preparation.diagnostics.actualBiomeId!==c.startPose.expectedBiomeId)throw new Error('Motion start biome changed.');
   if(!await page.evaluate(()=>window.__worldVisualQa.setCaptureUi(true)))throw new Error('Motion capture UI refused entry.');
   const captured=[],video=path.join(clipDir,'capture.webm');let lastSaved=-Infinity;
   await page.screencast.start({path:video,size:{width:1600,height:900},quality:90,onFrame:async frame=>{
    // Save contact-sheet candidates at <=29 Hz; the video keeps its independent output cadence.
    if(frame.timestamp-lastSaved<.035)return;lastSaved=frame.timestamp;
    const file=path.join(framesDir,`${String(captured.length).padStart(5,'0')}.jpg`);
    captured.push({file,wallTimeMs:frame.timestamp*1000,width:frame.viewportWidth,height:frame.viewportHeight});await writeFile(file,frame.data);
   }});recording=true;
   const motion=await page.evaluate(request=>window.__worldVisualQa.runMotion({...request,prepared:true}),request);
   await page.screencast.stop();recording=false;
   await writeFile(path.join(clipDir,'raw-motion.json'),JSON.stringify({request,motion,captured},null,2));
   const inputReleased=await page.evaluate(()=>window.__editor.playerController.keys.size===0);
   const functional=await finishVisualFunctionalCheck(page,functionalBefore);
   const metadata=await videoMetadata(video),analysis=motionChecks(motion),contacts=selectMotionFrames(motion,captured);
   const checks=[...analysis.checks,...functional.checks,{id:'input released at completion',passed:inputReleased},
    {id:'recorded dimensions and actual output cadence verified',passed:metadata.width===1600&&metadata.height===900&&metadata.framesPerSecond>0,detail:metadata},
    {id:'contact frames align to actual simulation states',passed:contacts.every(f=>f.alignmentErrorMs<250),detail:contacts.map(f=>({marker:f.marker,errorMs:f.alignmentErrorMs}))}];
   let eviction=null;
   if(synthetic) {
    const visits=[];
    for(let visit=1;visit<=10;visit++) {
     await page.evaluate(async pose=>{await window.__worldVisualQa.cut(pose);await window.__worldVisualQa.settle({minimumMs:0});},
      {x:synthetic.centerX+16384*visit,z:synthetic.centerZ+16384*visit,yaw:0,pitch:-.45,mode:'fly',heightAboveGround:80});
     const residency=await page.evaluate(()=>window.__worldVisualQa.syntheticResidency());visits.push(residency);
     if(!residency.resident.length&&!residency.trees.length&&!residency.rocks.length)break;
    }
    await page.evaluate(request=>window.__worldVisualQa.prepareMotion(request),request);
    const afterIdentity=await page.evaluate(()=>window.__worldVisualQa.syntheticIdentity());
    eviction={beforeResidency,visits,afterResidency:await page.evaluate(()=>window.__worldVisualQa.syntheticResidency()),beforeIdentity,afterIdentity};
    checks.push({id:'no missing or unavailable eligible near tiles on the synthetic route',passed:motion.frames.every(f=>f.nearMeadow.missing.length===0&&f.nearMeadow.unavailable.length===0)},
     {id:'actual terrain and source manifest eviction before return',passed:visits.length>0&&['resident','trees','rocks'].every(key=>visits.at(-1)[key].length===0)},
     {id:'identical source IDs and growth assignments after eviction and rebase',passed:JSON.stringify(beforeIdentity)===JSON.stringify(afterIdentity)},
     {id:'synthetic feet stay on flat terrain',passed:motion.frames.every(f=>f.position.footY>=synthetic.height-.05)},
     {id:'synthetic path remains unobstructed',passed:analysis.travel.every(segment=>Math.abs(segment.distance-4*motion.settings.walkSpeed*(segment.start===6?motion.settings.runMultiplier:1))<1)});
   }
   const state={...c,...motion,synthetic,eviction,functional,preparation,analysis,metadata,capturedFrames:captured,contacts,checks,adapter};
   const stateFile=path.join(clipDir,'state.json');await writeFile(stateFile,JSON.stringify(state,null,2));
   report.clips.push({id:c.id,cameraMode:c.cameraMode,startPose:c.startPose,contacts,analysis,metadata,state:path.relative(out,stateFile),video:path.relative(out,video)});
   report.checks.push(...checks.map(check=>({...check,id:`${c.id}: ${check.id}`})));
   for(const file of [stateFile,video])report.artifacts.push({path:path.relative(out,file),sha256:await fileHash(file),localOnly:file===video});
   const observed=errors.snapshot();report.errors.count+=observed.count;report.errors.errors.push(...observed.errors);
   if(observed.count)throw new Error(`Browser errors in ${c.id}.`);
  }catch(error){report.failureCase=c;report.failureDiagnostics=await page.evaluate(()=>window.__worldVisualQa?.diagnostics()).catch(()=>null);
   await page.screenshot({path:path.join(clipDir,'failed.png')}).catch(()=>{});throw error;
  }finally{if(recording)await page.screencast.stop().catch(()=>{});await context.close();page=null;}
 }
 for(const pose of poses) {
  const clips=report.clips.filter(c=>c.startPose.id===pose.id);if(!clips.length)continue;
  const file=`${pose.id}-contact-sheet.png`;await motionContactSheet(clips,path.join(out,file));
  report.artifacts.push({path:file,sha256:await fileHash(path.join(out,file))});
 }
 report.sourceStable=visualSourceStayedFixed(report,await captureVisualSource(url,repo));
 report.passed=report.sourceStable&&!report.dirtyFiles.length&&report.errors.count===0&&report.clips.length===(only?.length??10)&&report.checks.every(c=>c.passed);
 if(!report.passed)process.exitCode=1;
}catch(error){report.failure=error.stack;report.passed=false;process.exitCode=1;}
finally{await browser?.close();release();report.finishedAt=new Date().toISOString();await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,clips:report.clips.length,failedChecks:report.checks.filter(c=>!c.passed),failure:report.failure},null,2));
