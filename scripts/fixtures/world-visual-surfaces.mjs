import * as THREE from 'three/webgpu';
import {float,vec2,vec4} from 'three/tsl';
import {loadEditorConfig} from '/src/config/loadEditorConfig.js';
import {createTerrainMaterial} from '/src/editor/terrainMaterial.js';
import {getTerrainMaterialBakeGpuState} from '/src/editor/materials/TerrainMaterialBakeGpu.js';
import {resolveBlownStreaks,blownStreakUniforms,advanceBlownStreaks} from '/src/editor/stylized/ambient/BlownStreaks.js';
import {worldWindUniforms} from '/src/editor/weather/wind/worldWindState.js';
import {installUnusedSamplerPruning} from '/src/render/UnusedSamplerBindings.js';
import {raiseDeviceLimits} from '/src/render/deviceLimits.js';
import {runTerrainSubstrateSwatches} from './world-visual-substrates.mjs';
import {runRockSwatches} from './world-visual-rocks.mjs';
import {applyFixtureLighting} from './world-visual-fixture-lighting.mjs';
import {runTerrainNormalMetric} from './world-visual-normal-metric.mjs';
const backend=new URLSearchParams(location.search).get('backend')??'webgpu';
const requiredLimits=backend==='webgpu'?await raiseDeviceLimits({}, {powerPreference:'high-performance'}):{};
const renderer=new THREE.WebGPURenderer({antialias:false,forceWebGL:backend==='webgl',requiredLimits,powerPreference:'high-performance'});
installUnusedSamplerPruning(renderer);await renderer.init();renderer.setSize(800,600);renderer.setPixelRatio(1);
renderer.toneMapping=THREE.NoToneMapping;document.body.append(renderer.domElement);
const state={report:{backend:renderer.backend.isWebGPUBackend?'webgpu':'webgl',cases:[],checks:[]},pendingCapture:null};
window.__worldSurfaceFixture=state;
state.report.shaders=[];
const previousBuilderHook=renderer.debug.onNodeBuilderCreated;
renderer.debug.onNodeBuilderCreated=(builder,...args)=>{
 previousBuilderHook?.(builder,...args);
 const record=()=>state.report.shaders.push({material:builder.material?.name,
  textures:(builder.uniforms.fragment??[]).filter(u=>u.node?.value?.isTexture)
   .map(u=>({uniform:u.name,name:u.node.value.name,uuid:u.node.value.uuid})),
  samplerDeclarations:[...(builder.fragmentShader??'').matchAll(/uniform\s+\w*sampler\w*\s+(\w+)/g)].map(m=>m[1])});
 const build=builder.build;builder.build=function(...params){const result=build.apply(this,params);record();return result;};
 const buildAsync=builder.buildAsync;
 if(buildAsync)builder.buildAsync=async function(...params){const result=await buildAsync.apply(this,params);record();return result;};
};
const scene=new THREE.Scene();scene.background=new THREE.Color(0);
const camera=new THREE.PerspectiveCamera(68,800/600,.01,1000);camera.position.set(0,1.7,8);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const sun=new THREE.DirectionalLight('#ffffff',1);sun.position.set(0,10,10);scene.add(sun);
const fill=new THREE.HemisphereLight('#ffffff','#ffffff',.4);scene.add(fill);
const target=new THREE.RenderTarget(800,600,{type:THREE.FloatType,format:THREE.RGBAFormat,depthBuffer:true});
target.texture.colorSpace=THREE.LinearSRGBColorSpace;
async function draw(id,metadata={}) {
 await renderer.compileAsync(scene,camera);renderer.setRenderTarget(target);renderer.render(scene,camera);
 const pixels=await renderer.readRenderTargetPixelsAsync(target,0,0,800,600);renderer.setRenderTarget(null);renderer.render(scene,camera);
 if(renderer.backend.isWebGPUBackend)await renderer.backend.device.queue.onSubmittedWorkDone();
 state.report.cases.push({id,...metadata});state.pendingCapture=id;
 await new Promise(resolve=>{state.continue=resolve;});state.pendingCapture=null;
 return pixels;
}
function texture(data,size,format,type=THREE.UnsignedByteType) {
 const t=new THREE.DataTexture(data,size,size,format,type);t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;return t;
}
function fillChannels(gpu,kind,base) {
 for(const [name,map] of Object.entries(gpu.textures)) {
  map.name=`terrain-bake-${name}`;
  const channels=map.format===THREE.RGFormat?2:4;
  const value=name==='materialWeights'?(kind==='sand'?[0,255,0,0]:[0,0,0,255]):
   name==='macroTint'?[128,128,128,255]:name==='farColor'?[...base,255]:
   ['wetnessShoreline','canopyWater'].includes(name)?[0,0,0,0]:[0,0,0,255];
  for(let i=0;i<map.image.data.length;i++)map.image.data[i]=value[i%channels];
  map.needsUpdate=true;
 }
 gpu.ready.value=1;gpu.blend.value=1;
}
try {
 if(state.report.backend!==backend)throw new Error('Unexpected fixture backend.');
 // Fixed wind goes through the production drift dependency; no fixture wind pass is needed.
 worldWindUniforms.prevailing.value.set(1,0);worldWindUniforms.prevailingStrength.value=.18;
 worldWindUniforms.referenceStrength.value=.18;worldWindUniforms.windowCenter.value.set(0,0);
 worldWindUniforms.windowCenterCanonical.value.set(0,0);
 renderer.setClearColor(0,1);
 const raw=loadEditorConfig().stylizedSurface,settings=resolveBlownStreaks(raw.ambientEffects);
 await runTerrainNormalMetric({scene,camera,draw,state});
 const fixtureLight=new URLSearchParams(location.search).get('light')??'neutral';
 state.report.lighting=applyFixtureLighting(raw,sun,fill,fixtureLight);
 blownStreakUniforms.sand.value=settings.sand.strength;blownStreakUniforms.snow.value=settings.snow.strength;
 blownStreakUniforms.sandTravel.value=0;blownStreakUniforms.snowTravel.value=0;advanceBlownStreaks({delta:10,envelope:1,gust:.5});
 for(const kind of ['sand','snow']) {
  const config=structuredClone(raw);config.ambientEffects=null;config.sky.cloudShadows.enabled=false;
  config.grass.system='clumps';config.groundCover.enabled=false;config.contactShade.enabled=false;
  config.path.paint={...(config.path.paint??{}),enabled:false};
  config.path.naturalTrail={...(config.path.naturalTrail??{}),enabled:false};
  config.snowSurface={...(config.snowSurface??{}),enabled:false};
  config.snowWake={...(config.snowWake??{}),enabled:false};
  const base=kind==='sand'?[184,162,124]:[220,230,234],id=kind==='sand'?1:11,maps=[];
  const map=(data,size,format,type)=>{const t=texture(data,size,format,type);maps.push(t);return t;};
  const tileTexture=map(new Uint8Array([...base,id]),1,THREE.RGBAFormat);tileTexture.colorSpace=THREE.SRGBColorSpace;
  const options={tileTexture,heightTexture:map(new Float32Array(4),2,THREE.RedFormat,THREE.FloatType),
   surfaceMaskTexture:map(new Uint8Array([0,0,0,255]),1,THREE.RGBAFormat),
   forestFloorTexture:map(new Uint8Array([0,0,0,255]),1,THREE.RGBAFormat),
   chunkCenter:{value:new THREE.Vector2()},chunkWorldSize:20,width:1,stylizedConfig:config,
   surfaceDriftWind:{direction:vec2(1,0),envelope:float(1),gust:float(.5)}};
  // chunkCenter is a real uniform supplied through the material's slot binding.
  const {uniform}=await import('three/tsl');options.chunkCenter=uniform(new THREE.Vector2());
  const materials={};
  for(const enabled of [false,true]) {
   const material=createTerrainMaterial({...options,surfaceEffects:{blownStreaks:enabled?settings:null}});
   material.name=`surface-${kind}-${enabled?'on':'off'}`;
   fillChannels(getTerrainMaterialBakeGpuState(material),kind,base);
   material.emissiveNode=float(0);materials[enabled?'on':'off']=material;
  }
  const geometry=new THREE.PlaneGeometry(20,20);geometry.rotateX(-Math.PI/2);
  const mesh=new THREE.Mesh(geometry,materials.off);scene.add(mesh);
  try {
   for(const light of ['noon','night']) {
    sun.intensity=light==='noon'?1:0;fill.intensity=light==='noon'?.4:0;
    if(light==='noon')applyFixtureLighting(raw,sun,fill,fixtureLight);
    for(const effect of ['off','on']) {
     mesh.material=materials[effect];const pixels=await draw(`${kind}-${light}-${effect}`,{kind,light,effect,planeMeters:20,camera:camera.position.toArray(),time:10,wind:[1,0],envelope:1,gust:.5});
     if(light==='night') {
      let maximum=0;for(let i=0;i<pixels.length;i++)if(i%4!==3)maximum=Math.max(maximum,pixels[i]);
      state.report.checks.push({id:`${kind}-${effect}-night-emission`,maximum,passed:maximum<1e-6});
     }
    }
   }
   const values={};
   for(const effect of ['off','on']) {
    mesh.material=materials[effect];mesh.material.outputNode=vec4(mesh.material.colorNode,1);mesh.material.needsUpdate=true;
    values[effect]=await draw(`${kind}-albedo-${effect}`,{kind,debug:'linear albedo'});
   }
   let maximumChange=0,clipped=0,nonfinite=0;
   for(let i=0;i<values.on.length;i++)if(i%4!==3){
    if(!Number.isFinite(values.on[i]))nonfinite++;
    maximumChange=Math.max(maximumChange,Math.abs(values.on[i]-values.off[i]));
    if(values.on[i]>1&&values.off[i]<=1)clipped++;
   }
   const alpha=settings[kind].maxOpacity;
   state.report.checks.push({id:`${kind}-bounded-albedo`,maximumChange,alpha,clipped,nonfinite,
    passed:maximumChange>1e-6&&maximumChange<=alpha+1e-5&&clipped===0&&nonfinite===0});
  }finally {scene.remove(mesh);geometry.dispose();Object.values(materials).forEach(m=>m.dispose());maps.forEach(t=>t.dispose());}
 }
 if(raw.materialBake.families.substrates) {
  sun.intensity=1;fill.intensity=.4;
  applyFixtureLighting(raw,sun,fill,fixtureLight);
  await runTerrainSubstrateSwatches({raw,scene,camera,draw,state});
 }
 await runRockSwatches({raw,renderer,scene,camera,draw,state});
 state.report.passed=state.report.checks.every(c=>c.passed);
}catch(error){state.report.failure=error.stack;state.report.passed=false;}
finally {target.dispose();state.report.done=true;}
