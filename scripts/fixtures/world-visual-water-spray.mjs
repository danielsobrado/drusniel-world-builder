import * as THREE from 'three/webgpu';
import {uniform} from 'three/tsl';
import {loadEditorConfig} from '/src/config/loadEditorConfig.js';
import {AmbientParticleField} from '/src/editor/stylized/ambient/AmbientParticleField.js';
import {createSprayPuffTexture} from '/src/editor/stylized/mist/sprayPuffTexture.js';

const backend=new URLSearchParams(location.search).get('backend')??'webgpu';
const state=window.__worldGrassFixture={pendingCapture:null,continue:null,report:{backend,cases:[],checks:[],done:false}};
const renderer=new THREE.WebGPURenderer({forceWebGL:backend==='webgl',antialias:false,powerPreference:'high-performance'});
await renderer.init();renderer.setPixelRatio(1);renderer.setSize(800,600);renderer.toneMapping=THREE.NoToneMapping;document.body.append(renderer.domElement);
state.report.backend=renderer.backend.isWebGPUBackend?'webgpu':'webgl';
const scene=new THREE.Scene();scene.background=new THREE.Color(0);
const camera=new THREE.OrthographicCamera(-36,36,27,-27,.1,100);camera.position.set(0,40,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const depth=uniform(1),settings=loadEditorConfig().stylizedSurface.ambientEffects.fields.find(f=>f.name==='surfSpray');
const puffTexture=createSprayPuffTexture();
const field=new AmbientParticleField({name:'surfSpray',settings,ground:{heightNode:()=>depth.negate()},
 levels:{sea:uniform(0),lake:uniform(-100000),desert:uniform(0)},
 light:{sun:uniform(new THREE.Color(1,1,1)),sky:uniform(new THREE.Color(.5,.6,.7))},
 sun:uniform(new THREE.Vector3(0,1,0)),puffTexture});
field.update(0,{x:0,y:1.7,z:0},{x:0,z:0});field.setIntensity(1);scene.add(field.mesh);
const target=new THREE.RenderTarget(800,600,{format:THREE.RGBAFormat,depthBuffer:true});
async function draw(value,withEnvelope=true) {
 depth.value=value;renderer.setRenderTarget(target);await renderer.render(scene,camera);
 const pixels=await renderer.readRenderTargetPixelsAsync(target,0,0,800,600);
 let visible=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>8)visible++;
 renderer.setRenderTarget(null);await renderer.render(scene,camera);
 const id=`spray-depth-${value}`;state.report.cases.push({id,depth:value,visiblePixels:visible,envelope:withEnvelope?settings.waterDepth:null,instances:field.mesh.count});
 state.pendingCapture=id;await new Promise(resolve=>{state.continue=resolve;});state.pendingCapture=null;return visible;
}
try {
 if(state.report.backend!==backend)throw new Error('Unexpected renderer backend.');
 for(const value of [-1,0,.25,1,3,4.5,20]) {
  const visible=await draw(value),shouldShow=value>.25&&value<4.5;
  state.report.checks.push({id:`spray depth ${value}`,visiblePixels:visible,passed:shouldShow?visible>1000:visible===0});
 }
 state.report.passed=state.report.checks.length===7&&state.report.checks.every(c=>c.passed);
}catch(error){state.report.failure=error.stack;state.report.passed=false;}
finally{renderer.setRenderTarget(null);target.dispose();field.dispose();puffTexture.dispose();state.report.done=true;}
