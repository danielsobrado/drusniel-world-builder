import * as THREE from 'three/webgpu';
import {uniform} from 'three/tsl';
import {loadEditorConfig} from '/src/config/loadEditorConfig.js';
import {GrassTuning} from '/src/editor/stylized/GrassTuning.js';
import {MeadowGrassField} from '/src/editor/stylized/meadow/MeadowGrassField.js';
import {resolveMeadowGrassConfig} from '/src/editor/stylized/meadow/meadowGrassConfig.js';
import {createSurfaceMaskConfig} from '/src/editor/world/ChunkRenderPixels.js';
import {generateBaseWorldChunk} from '/src/editor/world/generateWorldChunk.js';
import {createNoWaterSample} from '/src/editor/water/WaterSample.js';
const backend=new URLSearchParams(location.search).get('backend')??'webgpu';
const state=window.__worldGrassFixture={pendingCapture:null,continue:null,report:{backend,cases:[],checks:[],done:false}};
const renderer=new THREE.WebGPURenderer({forceWebGL:backend==='webgl',antialias:false,alpha:true});
renderer.setPixelRatio(1);renderer.setSize(800,600);renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);await renderer.init();
state.report.backend=renderer.backend.isWebGPUBackend?'webgpu':'webgl';
const camera=new THREE.OrthographicCamera(-32/3,32/3,8,-8,.1,1000),raw=loadEditorConfig().stylizedSurface;
const scene=new THREE.Scene(),sun=new THREE.DirectionalLight('#fff2d9',2.5);sun.position.set(-80,100,20);
scene.add(sun,new THREE.HemisphereLight('#b9daff','#7b7560',1.2));
const floor=new THREE.Mesh(new THREE.PlaneGeometry(896,896).rotateX(-Math.PI/2),new THREE.MeshStandardNodeMaterial({color:'#607d33',roughness:1}));scene.add(floor);
const target=new THREE.RenderTarget(800,600,{format:THREE.RGBAFormat,depthBuffer:true});
const median=a=>{a.sort((x,y)=>x-y);return a[Math.floor(a.length/2)]??0;};
async function read() {
 renderer.setRenderTarget(target);await renderer.render(scene,camera);
 return renderer.readRenderTargetPixelsAsync(target,0,0,800,600);
}
function groundRectangle() {
 const points=[[-4,-4],[4,-4],[-4,4],[4,4]].map(([x,z])=>new THREE.Vector3(x,0,z).project(camera));
 return {left:Math.ceil(Math.min(...points.map(p=>(p.x+1)*400))),right:Math.floor(Math.max(...points.map(p=>(p.x+1)*400))),
  bottom:Math.ceil(Math.min(...points.map(p=>(p.y+1)*300))),top:Math.floor(Math.max(...points.map(p=>(p.y+1)*300)))};
}
function measure(a,b,rect) {
 let first=0,last=0,pixels=0;const errors=[];
 for(let y=rect.bottom;y<rect.top;y++)for(let x=rect.left;x<rect.right;x++) {
  const i=(y*800+x)*4;pixels++;first+=a.mask[i+3]>=128;last+=b.mask[i+3]>=128;
  errors.push(Math.max(...[0,1,2].map(c=>Math.abs(a.color[i+c]-b.color[i+c]))));
 }
 return {pixels,fromCoverage:first/pixels,toCoverage:last/pixels,coverageChange:Math.abs(first-last)/pixels,medianRgbError:median(errors)};
}
try {
 if(state.report.backend!==backend)throw new Error('Unexpected backend.');
 for(const biomeId of [3,4,5,6,7,8,9,10,12]) {
  const config=structuredClone(raw);config.path.naturalTrail.enabled=false;
  const generator={sampleTile:()=>biomeId,sampleHeight:()=>0,sampleWater:()=>createNoWaterSample(0),toMetadata:()=>({seed:918273})};
  const slots=[];
  for(let cz=-7;cz<7;cz++)for(let cx=-7;cx<7;cx++) {
   const page=generateBaseWorldChunk({chunkX:cx,chunkZ:cz,chunkSize:32,worldGenerator:generator,surfaceMaskConfig:createSurfaceMaskConfig(config,{tileSize:2})});
   slots.push({page,pageRevision:1,descriptor:{key:`${cx}:${cz}`,chunkX:cx,chunkZ:cz,originCellX:cx*32,originCellZ:cz*32,centerWorldX:(cx+.5)*64,centerWorldZ:-(cz+.5)*64}});
  }
  const terrainView={slots,worldStore:{chunkSize:32,tileSize:2,generator},floatingOrigin:{getState:()=>({x:0,z:0})},getCanonicalHeight:()=>0};
  const tuning=new GrassTuning(config);tuning.setSettings({windStrength:0,windLean:0,windTurbulence:0,flutterStrength:0});
  const field=new MeadowGrassField({scene,terrainView,config,settings:resolveMeadowGrassConfig(config.grass.meadow),tuning,sunDirection:uniform(sun.position.clone().normalize())});
  const images=[];
  try {
   for(const distance of [40,45,50]) {
    // The look direction and orthographic projection stay fixed; only shader distance changes.
    camera.position.set(0,distance,distance);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    let ready=0;const started=performance.now();
    for(let frame=0;ready<3;frame++) {
     field.update(frame*16,camera);const stats=field.getState();
     ready=stats.building===0&&field.blades.stats.visibleMissing===0&&(field.cards?.stats.visibleMissing??0)===0?ready+1:0;
     if(performance.now()-started>120000)throw new Error('LOD meadow did not prepare.');await new Promise(requestAnimationFrame);
    }
    field.uniforms.time.value=Math.max(...[...field.blades.tiles.values(),...field.cards.tiles.values()].map(t=>t.revealTime??0))+2;
    await renderer.compileAsync(scene,camera);renderer.setClearColor(0,0);floor.visible=false;
    const mask=await read();floor.visible=true;const color=await read();images.push({distance,mask,color});
    renderer.setRenderTarget(null);await renderer.render(scene,camera);
    if(renderer.backend.isWebGPUBackend)await renderer.backend.device.queue.onSubmittedWorkDone();
    const id=`biome-${biomeId}-handoff-${distance}`;
    state.report.cases.push({id,biomeId,distance,rectangleMeters:{min:[-4,-4],max:[4,4]},rectanglePixels:groundRectangle(),readiness:field.getState(),wind:0,interaction:0});
    state.pendingCapture=id;await new Promise(resolve=>{state.continue=resolve;});state.pendingCapture=null;
   }
   for(let a=0;a<images.length;a++)for(let b=a+1;b<images.length;b++) {
    const stats=measure(images[a],images[b],groundRectangle());
    state.report.checks.push({id:`biome-${biomeId}-${images[a].distance}-${images[b].distance}`,...stats,
     passed:stats.fromCoverage>0&&stats.toCoverage>0&&stats.coverageChange<=.05&&stats.medianRgbError<=12});
   }
  }finally{field.dispose();}
 }
 state.report.passed=state.report.checks.length===27&&state.report.checks.every(c=>c.passed);
}catch(error){state.report.failure=error.stack;state.report.passed=false;}
finally{renderer.setRenderTarget(null);target.dispose();floor.geometry.dispose();floor.material.dispose();state.report.done=true;}
