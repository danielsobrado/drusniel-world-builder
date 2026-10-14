import * as THREE from 'three/webgpu';
import { runMistCards,runNormalRotation,runOpticalDepth } from './world-visual-tree-mist.mjs';
import { runTreeRepresentations } from './world-visual-tree-representations.mjs';
import { runBakerSwatch } from './world-visual-tree-bake.mjs';
import { loadEditorConfig } from '/src/config/loadEditorConfig.js';
const params=new URLSearchParams(location.search),backend=params.get('backend')??'webgpu',phase=params.get('phase')??'after';
const state=window.__worldTreeFixture={pendingCapture:null,continue:null,report:{backend,phase,cases:[],checks:[],done:false}};
const renderer=new THREE.WebGPURenderer({forceWebGL:backend==='webgl',antialias:false,alpha:true});
renderer.setPixelRatio(1);renderer.setSize(800,600);renderer.toneMapping=THREE.NoToneMapping;document.body.append(renderer.domElement);await renderer.init();
state.report.backend=renderer.backend.isWebGPUBackend?'webgpu':'webgl';
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,800/600,.01,100000000);
const sun=new THREE.DirectionalLight('#ffffff',1),fill=new THREE.HemisphereLight('#ffffff','#ffffff',.4);scene.add(sun,fill,sun.target);
const target=new THREE.RenderTarget(800,600,{type:THREE.FloatType,format:THREE.RGBAFormat,depthBuffer:true});
target.texture.colorSpace=THREE.LinearSRGBColorSpace;renderer.setClearColor('#808080',0);
async function draw(id,metadata={},capture=true,activeCamera=camera) {
 await renderer.compileAsync(scene,activeCamera);renderer.setRenderTarget(target);await renderer.render(scene,activeCamera);
 const pixels=await renderer.readRenderTargetPixelsAsync(target,0,0,800,600);renderer.setRenderTarget(null);await renderer.render(scene,activeCamera);
 if(renderer.backend.isWebGPUBackend)await renderer.backend.device.queue.onSubmittedWorkDone();
 state.report.cases.push({id,...metadata});
 if(capture){state.pendingCapture=id;await new Promise(resolve=>{state.continue=resolve;});state.pendingCapture=null;}
 return pixels;
}
try {
 if(state.report.backend!==backend)throw new Error('Unexpected tree fixture backend.');
 const context={renderer,scene,camera,draw,state,sun,fill,ambient:loadEditorConfig().stylizedSurface.ambientEffects};
 await runOpticalDepth(context);await runNormalRotation(context);
 if(phase!=='before')await runBakerSwatch(context);
 if(phase==='after'){await runMistCards(context);await runTreeRepresentations(context);}
 state.report.passed=state.report.checks.length>0&&state.report.checks.every(c=>c.passed);
}catch(error){state.report.failure=error.stack;state.report.passed=false;}
finally{target.dispose();state.report.done=true;}
