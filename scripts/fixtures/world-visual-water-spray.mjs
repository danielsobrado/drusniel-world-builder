import * as THREE from 'three/webgpu';
import {float,uniform,vec3} from 'three/tsl';
import {loadEditorConfig} from '/src/config/loadEditorConfig.js';
import {AmbientParticleField} from '/src/editor/stylized/ambient/AmbientParticleField.js';
import {createSprayPuffTexture} from '/src/editor/stylized/mist/sprayPuffTexture.js';
import {particleBurstNodes} from '/src/editor/stylized/ambient/ParticleBurst.js';

const backend=new URLSearchParams(location.search).get('backend')??'webgpu';
const state=window.__worldGrassFixture={pendingCapture:null,continue:null,report:{backend,cases:[],checks:[],done:false}};
const renderer=new THREE.WebGPURenderer({forceWebGL:backend==='webgl',antialias:false,powerPreference:'high-performance'});
await renderer.init();renderer.setPixelRatio(1);renderer.setSize(800,600);renderer.toneMapping=THREE.NoToneMapping;document.body.append(renderer.domElement);
state.report.backend=renderer.backend.isWebGPUBackend?'webgpu':'webgl';
const scene=new THREE.Scene();scene.background=new THREE.Color(0);
const camera=new THREE.OrthographicCamera(-36,36,27,-27,.1,100);camera.position.set(0,40,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);camera.updateMatrixWorld();
const depth=uniform(1),clock=uniform(123.4),settings=loadEditorConfig().stylizedSurface.ambientEffects.fields.find(f=>f.name==='surfSpray');
const puffTexture=createSprayPuffTexture();
const makeField=settings=>new AmbientParticleField({name:'surfSpray',settings,ground:{heightNode:()=>depth.negate()},
 levels:{sea:uniform(0),lake:uniform(-100000),desert:uniform(0)},
 light:{sun:uniform(new THREE.Color(1,1,1)),sky:uniform(new THREE.Color(.5,.6,.7))},
 sun:uniform(new THREE.Vector3(0,1,0)),puffTexture,clock});
// Isolate the habitat envelope from the burst's duty cycle in these controls.
let field=makeField({...settings,burst:null});
field.update(0,{x:0,y:1.7,z:0},{x:0,z:0});field.setIntensity(1);scene.add(field.mesh);
const target=new THREE.RenderTarget(800,600,{format:THREE.RGBAFormat,depthBuffer:true});
async function draw(value,withEnvelope=true,suffix='') {
 depth.value=value;renderer.setRenderTarget(target);await renderer.render(scene,camera);
 const pixels=await renderer.readRenderTargetPixelsAsync(target,0,0,800,600);
 let visible=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>8)visible++;
 renderer.setRenderTarget(null);await renderer.render(scene,camera);
 const id=`spray-depth-${value}${suffix}`;state.report.cases.push({id,depth:value,time:clock.value,visiblePixels:visible,envelope:withEnvelope?settings.waterDepth:null,instances:field.mesh.count});
 state.pendingCapture=id;await new Promise(resolve=>{state.continue=resolve;});state.pendingCapture=null;return visible;
}
try {
 if(state.report.backend!==backend)throw new Error('Unexpected renderer backend.');
 for(const value of [-1,0,.25,1,3,4.5,20]) {
  const visible=await draw(value),shouldShow=value>.25&&value<4.5;
  state.report.checks.push({id:`spray depth ${value}`,visiblePixels:visible,passed:shouldShow?visible>1000:visible===0});
 }
 // An eye-level view catches tall repeating flags that a top-down habitat
 // mask cannot detect. Keep a deterministic time sweep as visual evidence.
 field.dispose();field=makeField(settings);field.update(0,{x:0,y:1.7,z:0},{x:0,z:0});field.setIntensity(1);scene.add(field.mesh);
 camera.position.set(0,1.7,30);camera.up.set(0,1,0);camera.lookAt(0,.25,0);camera.updateMatrixWorld();
 const populations=[];
 for(const time of [123.4,123.7,124,124.3]) {clock.value=time;populations.push(await draw(1,true,`-eye-${time}`));}
 state.report.checks.push({id:'burst survives throughout time sweep',populations,passed:populations.every(n=>n>100)});
 field.mesh.visible=false;
 camera.position.set(0,0,2);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const burst=particleBurstNodes(clock,float(0),float(.5),float(.72),settings.burst);
 const probeMaterial=new THREE.MeshBasicNodeMaterial({toneMapped:false});
 probeMaterial.colorNode=vec3(burst.height,burst.fade,burst.scale.div(4));
 const probe=new THREE.Mesh(new THREE.PlaneGeometry(72,54),probeMaterial);scene.add(probe);
 for(const [label,age] of [['birth',0],['apex',.5],['landed',1],['quiet',1.2]]) {
  clock.value=settings.burst.lifetime*settings.burst.activeShare*age;
  renderer.setRenderTarget(target);await renderer.render(scene,camera);
  const p=await renderer.readRenderTargetPixelsAsync(target,400,300,1,1);
  const height=p[0]/255,opacity=p[1]/255;
  state.report.checks.push({id:`ballistic ${label}`,height,opacity,
   passed:label==='apex'?Math.abs(height-.72)<.01&&opacity>0:height<.01&&opacity<.01});
 }
 probe.removeFromParent();probe.geometry.dispose();probeMaterial.dispose();
 state.report.passed=state.report.checks.every(c=>c.passed);
}catch(error){state.report.failure=error.stack;state.report.passed=false;}
finally{renderer.setRenderTarget(null);target.dispose();field.dispose();puffTexture.dispose();state.report.done=true;}
