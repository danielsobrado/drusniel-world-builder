import * as THREE from 'three/webgpu';
import {float,uniform,uv,vec3} from 'three/tsl';
import {PatternOrigins} from '/src/editor/stylized/PatternOrigins.js';
import {createSeaFoamNoise} from '/src/editor/stylized/SeaSurfNodes.js';
import {resolveSeaSurf,seaSurfPatternFrames} from '/src/editor/water/SeaSurf.js';
import {createSeaSurfaceNodes} from '/src/editor/stylized/SeaSurfaceShading.js';
import {loadEditorConfig} from '/src/config/loadEditorConfig.js';
import {SEA_SWELL_COMPONENTS} from '/src/editor/water/SeaSwell.js';
import {seaStateUniforms} from '/src/editor/water/seaState.js';
import {COAST_SWASH_PATTERN_FRAMES,createCoastFoamBreakup} from '/src/editor/stylized/CoastSwashShading.js';

// Measure the production shader itself; a CPU approximation cannot catch GPU
// integer-hash, interpolation, or large-origin precision regressions.
const backend=new URLSearchParams(location.search).get('backend')??'webgpu';
const state=window.__worldGrassFixture={pendingCapture:null,continue:null,report:{backend,cases:[],checks:[],done:false}};
const renderer=new THREE.WebGPURenderer({forceWebGL:backend==='webgl',antialias:false,powerPreference:'high-performance'});
await renderer.init();renderer.setPixelRatio(1);renderer.setSize(800,600);renderer.toneMapping=THREE.NoToneMapping;document.body.append(renderer.domElement);
state.report.backend=renderer.backend.isWebGPUBackend?'webgpu':'webgl';
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=2;
const settings=resolveSeaSurf(),patterns=new PatternOrigins({...seaSurfPatternFrames(settings),...COAST_SWASH_PATTERN_FRAMES});
const localOffset=uniform(new THREE.Vector2()),clock=uniform(123.4);
const material=new THREE.MeshBasicNodeMaterial({toneMapped:false});
material.colorNode=vec3(createSeaFoamNoise(patterns,uv().sub(.5).mul(128).add(localOffset),clock));
const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);scene.add(mesh);
const size=256,target=new THREE.RenderTarget(size,size,{type:THREE.FloatType,format:THREE.RGBAFormat,depthBuffer:false});
target.texture.colorSpace=THREE.LinearSRGBColorSpace;
async function draw(id,center,offset=[0,0],time=123.4,capture=false) {
 patterns.update(...center);localOffset.value.set(...offset);clock.value=time;
 renderer.setRenderTarget(target);await renderer.render(scene,camera);
 const raw=await renderer.readRenderTargetPixelsAsync(target,0,0,size,size);
 const pixels=Float32Array.from({length:size*size},(_,i)=>raw[i*4]);
 renderer.setRenderTarget(null);await renderer.render(scene,camera);
 state.report.cases.push({id,center,offset,time,fieldMeters:128,sampleSize:size});
 if(capture){state.pendingCapture=id;await new Promise(resolve=>{state.continue=resolve;});state.pendingCapture=null;}
 return pixels;
}
function difference(a,b) {
 let max=0,squares=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);squares+=d*d;}
 return {max,rms:Math.sqrt(squares/a.length)};
}
function correlation(a,b) {
 const mean=x=>x.reduce((s,v)=>s+v,0)/x.length,ma=mean(a),mb=mean(b);let ab=0,aa=0,bb=0;
 for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;ab+=x*y;aa+=x*x;bb+=y*y;}
 return ab/Math.sqrt(aa*bb);
}
try {
 if(state.report.backend!==backend)throw new Error('Unexpected renderer backend.');
 for(const center of [[0,0],[-4226432,278528],[-9000000,6000000]]) {
  const id=center.join('_'),base=await draw(`${id}-base`,center,[0,0],123.4,true);
  let min=Infinity,max=-Infinity,sum=0,squares=0,finite=true;
  for(const x of base){finite&&=Number.isFinite(x);min=Math.min(min,x);max=Math.max(max,x);sum+=x;squares+=x*x;}
  const std=Math.sqrt(squares/base.length-(sum/base.length)**2);
  state.report.checks.push({id:`${id}-range`,min,max,std,finite,passed:finite&&min>=0&&max<=1&&min<.2&&max>.8&&std>.1});
  for(const offset of [[1/settings.laceScale,0],[0,1/settings.laceScale],[2/settings.laceScale,0],[0,2/settings.laceScale]]) {
   const moved=await draw(`${id}-shift-${offset.join('_')}`,center,offset),r=correlation(base,moved);
   state.report.checks.push({id:`${id}-former-tile-${offset.join('_')}`,correlation:r,limit:.5,passed:Number.isFinite(r)&&Math.abs(r)<=.5});
  }
  for(const delta of [[64,0],[0,64]]) {
   const adjacent=await draw(`${id}-adjacent-${delta.join('_')}`,center.map((v,i)=>v+delta[i]),delta.map(v=>-v));
   const error=difference(base,adjacent);
   state.report.checks.push({id:`${id}-chunk-seam-${delta.join('_')}`,...error,limit:.001,passed:error.max<=.001});
  }
  mesh.position.set(-8000000,3000000,0);camera.position.set(-8000000,3000000,2);camera.updateMatrixWorld();
  const rebased=await draw(`${id}-rebase`,center),error=difference(base,rebased);
  state.report.checks.push({id:`${id}-rebase`,...error,passed:error.max<=.001});
  mesh.position.set(0,0,0);camera.position.set(0,0,2);camera.updateMatrixWorld();
  const later=await draw(`${id}-later`,center,[0,0],124.4),change=difference(base,later);
  state.report.checks.push({id:`${id}-animation`,...change,passed:change.max>.005});
 }
 // Sample the actual crest-lighting graph at the peak of every wave component.
 // Black must remain black; coloured water may brighten but cannot bleach.
 const config=structuredClone(loadEditorConfig().stylizedSurface.water.sea);config.surf.enabled=false;
 const sea=createSeaSurfaceNodes({terrainUv:uv(),chunkWorldSize:.000001,surfaceWorldHeight:seaStateUniforms.seaLevel,
  waterDepth:float(10),waterCoverage:float(1),currentStrength:float(0),time:float(0),
  phaseOrigin:SEA_SWELL_COMPONENTS.map(()=>float(Math.PI/2)),sunDirection:vec3(0,1,0),config});
 for(const base of [[0,0,0],[.02,.08,.12],[.08,.3,.28]]) {
  material.colorNode=sea.shade(vec3(...base));material.needsUpdate=true;
  renderer.setRenderTarget(target);await renderer.render(scene,camera);
  const pixels=await renderer.readRenderTargetPixelsAsync(target,0,0,size,size),expected=base.map(v=>v*(1+config.crestLift));
  let error=0;for(let i=0;i<pixels.length;i++)if(i%4!==3)error=Math.max(error,Math.abs(pixels[i]-expected[i%4]));
  renderer.setRenderTarget(null);await renderer.render(scene,camera);
  const id=`crest-chroma-${base.join('_')}`;state.report.cases.push({id,base,expected,crestLift:config.crestLift});
  state.report.checks.push({id,maxError:error,limit:.001,passed:Number.isFinite(error)&&error<=.001});
  state.pendingCapture=id;await new Promise(resolve=>{state.continue=resolve;});state.pendingCapture=null;
 }
 // The actual shared shoreline field must have transparent gaps and solid
 // patches at both local and imported-world coordinates, with no chunk seam.
 material.colorNode=vec3(createCoastFoamBreakup(patterns,uv().sub(.5).mul(128).add(localOffset),clock,
  loadEditorConfig().stylizedSurface.water.coast.breakupStrength));
 material.needsUpdate=true;
 for(const center of [[0,0],[-4226432,278528],[-9000000,6000000]]) {
  const id=`swash-${center.join('_')}`,base=await draw(id,center,[0,0],123.4,true);
  const gaps=base.filter(v=>v<.01).length/base.length,solid=base.filter(v=>v>.99).length/base.length;
  const finite=base.every(v=>Number.isFinite(v)&&v>=0&&v<=1);
  state.report.checks.push({id:`${id}-broken-coverage`,gaps,solid,passed:finite&&gaps>.1&&solid>.1});
  for(const delta of [[64,0],[0,64]]) {
   const adjacent=await draw(`${id}-adjacent-${delta.join('_')}`,center.map((v,i)=>v+delta[i]),delta.map(v=>-v));
   const error=difference(base,adjacent);
   state.report.checks.push({id:`${id}-seam-${delta.join('_')}`,...error,passed:error.max<=.001});
  }
 }
 state.report.passed=state.report.checks.every(c=>c.passed);
}catch(error){state.report.failure=error.stack;state.report.passed=false;}
finally{renderer.setRenderTarget(null);target.dispose();mesh.geometry.dispose();material.dispose();state.report.done=true;}
