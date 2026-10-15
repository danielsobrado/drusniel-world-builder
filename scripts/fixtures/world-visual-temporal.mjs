import * as THREE from 'three/webgpu';
import {loadEditorConfig} from '/src/config/loadEditorConfig.js';
import {StylizedTreeView} from '/src/editor/stylized/StylizedTreeView.js';
import {StylizedSceneAssetCache} from '/src/editor/stylized/StylizedSceneAssetCache.js';
import {createInstancedRenderers,writeInstances,disposeInstancedRenderers} from '/src/editor/stylized/lod/StylizedLodRuntime.js';
import {StylizedGodRaysPostProcess} from '/src/editor/stylized/StylizedGodRaysPostProcess.js';
import {resolveCinematicFinish} from '/src/editor/stylized/cinematicFinish.js';
import {syncFoliageLight} from '/src/editor/stylized/forest/foliageLight.js';
class FixtureTreeView extends StylizedTreeView {createRenderResources(){}}
const backend=new URLSearchParams(location.search).get('backend')??'webgpu';
const state=window.__worldGrassFixture={pendingCapture:null,continue:null,report:{backend,cases:[],checks:[],done:false}};
const renderer=new THREE.WebGPURenderer({forceWebGL:backend==='webgl',antialias:false,alpha:true});
renderer.setPixelRatio(1);renderer.setSize(800,600);renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);await renderer.init();
state.report.backend=renderer.backend.isWebGPUBackend?'webgpu':'webgl';
const config=structuredClone(loadEditorConfig().stylizedSurface);config.trees.windStrength=0;config.sky.cloudShadows.enabled=false;config.cinematicFinish.grain=0;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(68,4/3,.1,1000),sun=new THREE.DirectionalLight('#fff2d9',2.5),fill=new THREE.HemisphereLight('#b9daff','#7b7560',1.2);
sun.position.set(-80,100,20);scene.add(sun,fill,sun.target);syncFoliageLight({directional:sun,hemisphere:fill});
const cache=new StylizedSceneAssetCache({renderer}),view=new FixtureTreeView({terrainView:{scene,renderer,worldStore:{tileSize:2,chunkSize:32,revision:0},getCanonicalHeight:()=>0},config,revisionTracker:{revision:0}});
const root=new THREE.Group();scene.add(root);
const target=new THREE.RenderTarget(800,600,{format:THREE.RGBAFormat,depthBuffer:true});
let draws,owner;
const createOwner=()=>new StylizedGodRaysPostProcess({renderer,scene,config:structuredClone(config.sky.godRays),sunDirection:sun.position.clone().normalize(),sunColor:'#fff2d9',finish:resolveCinematicFinish(config.cinematicFinish)});
async function capture(id,metadata,pixels) {
 state.report.cases.push({id,...metadata});state.capturePixels=Array.from(pixels);state.pendingCapture=id;
 await new Promise(resolve=>{state.continue=resolve;});state.pendingCapture=null;state.capturePixels=null;
}
async function readOwner() {
 renderer.setRenderTarget(target);owner.render(camera);
 return renderer.readRenderTargetPixelsAsync(target,0,0,800,600);
}
function trailError(actual,reference,silhouette) {
 const dilated=new Uint8Array(800*600);let silhouettePixels=0;
 for(let y=0;y<600;y++)for(let x=0;x<800;x++)if(silhouette[(y*800+x)*4+3]>=128) {
  silhouettePixels++;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<800&&y+dy>=0&&y+dy<600)dilated[(y+dy)*800+x+dx]=1;
 }
 let changed=0,outside=0;
 for(let p=0;p<dilated.length;p++)if(!dilated[p]){outside++;if(Math.max(...[0,1,2].map(c=>Math.abs(actual[p*4+c]-reference[p*4+c])))>8)changed++;}
 return {silhouettePixels,outsidePixels:outside,changedPixels:changed,changedFrameFraction:changed/(800*600)};
}
try {
 if(state.report.backend!==backend)throw new Error('Unexpected backend.');
 await view.buildFromScene(await cache.acquire(config.assets.scene));view.time.value=0;
 const parts=view.prototypes[0];if(!parts?.length)throw new Error('No production tree prototype.');
 draws=createInstancedRenderers({root,partsByPrototype:[parts],capacity:1,name:'temporal-production-tree',tintLeaves:true,renderer});
 writeInstances(draws,[[{matrix:new THREE.Matrix4(),fade:1,seed:.5,colorVariation:1,leafTint:[1,1,1],morphology:[1,1,1]}]]);
 const bounds=new THREE.Box3();for(const part of parts){part.geometry.computeBoundingBox();bounds.union(part.geometry.boundingBox);}
 const center=bounds.getCenter(new THREE.Vector3()),height=bounds.max.y-bounds.min.y;
 camera.position.copy(center).add(new THREE.Vector3(0,height*.15,height*1.8));camera.lookAt(center);camera.rotation.order='YXZ';camera.updateMatrixWorld();
 const finalYaw=camera.rotation.y;owner=createOwner();
 if(owner.technique!=='cinematic')throw new Error('Fixture must exercise the production cinematic owner.');
 await renderer.compileAsync(scene,camera);for(let i=0;i<5;i++){owner.render(camera);await new Promise(requestAnimationFrame);}
 const frames=[],start=performance.now();let stoppedAt;
 while(true) {
  const now=await new Promise(requestAnimationFrame),elapsed=Math.min(1,(now-start)/1000);
  camera.rotation.y=finalYaw+Math.PI*(1-elapsed);camera.updateMatrixWorld();owner.render(camera);frames.push({elapsed,yaw:camera.rotation.y,timestamp:now});
  if(elapsed>=1){stoppedAt=performance.now();break;}
 }
 const samples=[];
 for(const requested of [.25,1]) {
  while(performance.now()-stoppedAt<requested*1000){await new Promise(requestAnimationFrame);owner.render(camera);}
  const actualSeconds=(performance.now()-stoppedAt)/1000,pixels=await readOwner();samples.push({requested,actualSeconds,pixels});
 }
 // Collect both timed frames before yielding to screenshot/file orchestration.
 for(const sample of samples)await capture(`temporal-stop-${sample.requested}`,{requested:sample.requested,actualSeconds:sample.actualSeconds,camera:camera.position.toArray(),yaw:camera.rotation.y,owner:owner.technique},sample.pixels);
 owner.dispose();owner=createOwner();for(let i=0;i<5;i++){owner.render(camera);await new Promise(requestAnimationFrame);}
 const reference=await readOwner();await capture('temporal-stationary-reference',{owner:owner.technique},reference);
 renderer.setRenderTarget(target);renderer.setClearColor(0,0);await renderer.render(scene,camera);
 const silhouette=await renderer.readRenderTargetPixelsAsync(target,0,0,800,600);
 for(const sample of samples) {
  const stats=trailError(sample.pixels,reference,silhouette);
  state.report.checks.push({id:`temporal-trails-${sample.requested}`,...stats,requestedSeconds:sample.requested,actualSeconds:sample.actualSeconds,
   passed:stats.silhouettePixels>1000&&stats.outsidePixels>1000&&stats.changedFrameFraction<.01});
 }
 state.report.panFrames=frames;state.report.frozen={wind:0,grain:0,particles:0};
 state.report.passed=state.report.checks.length===2&&state.report.checks.every(c=>c.passed);
}catch(error){state.report.failure=error.stack;state.report.passed=false;}
finally{renderer.setRenderTarget(null);owner?.dispose();if(draws)disposeInstancedRenderers(root,draws);view.dispose();cache.dispose();target.dispose();state.report.done=true;}
