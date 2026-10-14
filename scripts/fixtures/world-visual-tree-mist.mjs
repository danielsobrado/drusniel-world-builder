import * as THREE from 'three/webgpu';
import { float, log, vec3, vec4 } from 'three/tsl';
import { applyJungleMist } from '/src/editor/stylized/ambient/jungleMistOutput.js';
import { jungleMistUniforms,createJungleMistNodes,resolveJungleMistConfig } from '/src/editor/stylized/ambient/JungleMist.js';
import { CpuTreeImpostorBatch } from '/src/editor/stylized/impostor/CpuTreeImpostorBatch.js';
import { GpuTreeImpostorBatch } from '/src/editor/stylized/impostor/GpuTreeImpostorBatch.js';
import { worldWindUniforms } from '/src/editor/weather/wind/worldWindState.js';

export function solidAtlas(width=1,height=1,normal=[128,128,255,0]) {
 const make=(data,colorSpace)=>{const t=new THREE.DataTexture(new Uint8Array(data),1,1,THREE.RGBAFormat);
  t.colorSpace=colorSpace;t.needsUpdate=true;return t;};
 return {columns:1,rows:1,tileSize:1,gutter:0,lowElevationDegrees:0,highElevationDegrees:58,
  width,height,centerY:0,radius:Math.hypot(width,height),albedo:make([150,150,150,255],THREE.SRGBColorSpace),normal:make(normal,THREE.NoColorSpace)};
}
function mean(pixels) {
 const sum=[0,0,0];let count=0;
 for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>=.9){for(let c=0;c<3;c++)sum[c]+=pixels[i+c];count++;}
 if(count<1000)throw new Error(`Neutral card has only ${count} interior pixels.`);
 return {rgb:sum.map(v=>v/count),count};
}
const difference=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
export async function runMistCards({renderer,scene,camera,draw,state,ambient}) {
 camera.fov=35;camera.position.set(0,1.7,0);camera.lookAt(0,1.7,-1);camera.updateProjectionMatrix();camera.updateMatrixWorld();
 jungleMistUniforms.ground.value=0;jungleMistUniforms.sun.value.setRGB(.35,.32,.28);jungleMistUniforms.fill.value.setRGB(.2,.24,.28);
 const paths=['near','proxy','cpu-impostor',...(renderer.backend.isWebGPUBackend?['gpu-impostor']:[])];
 for(const depth of [10,40,100,240]) {
  const size=depth*2*Math.tan(THREE.MathUtils.degToRad(35)/2)*.4;
  const atlas=solidAtlas(size,size),outputs=new Map();
  for(const representation of paths) {
   let batch,mesh,geometry;
   if(representation.endsWith('impostor')) {
    const Constructor=representation==='cpu-impostor'?CpuTreeImpostorBatch:GpuTreeImpostorBatch;
    batch=new Constructor({renderer,scene,atlas,capacity:1,name:representation});mesh=batch.mesh;
    batch.uniforms.windStrength.value=0;
    batch.setRecords([{x:0,y:1.7,z:-depth,scale:1,yaw:0,fade:1,seed:.5,radius:atlas.radius,appearance:[1,1,1,1]}]);
    batch.update(camera,{x:0,z:0},0);
   } else {
    geometry=new THREE.PlaneGeometry(size,size);mesh=new THREE.Mesh(geometry,new THREE.MeshBasicNodeMaterial({side:THREE.DoubleSide}));
    mesh.position.set(0,1.7,-depth);scene.add(mesh);
   }
   mesh.material.outputNode=vec4(.2,.25,.3,1);
   const base=mean(await draw(`mist-${representation}-${depth}-unmisted`,{representation,depth},false));
   const applied=applyJungleMist(mesh.material,ambient,{time:float(10)}),node=mesh.material.outputNode;
   const duplicate=applyJungleMist(mesh.material,ambient,{time:float(10)});
   state.report.checks.push({id:`composer-${representation}-${depth}`,passed:applied&&!duplicate&&node===mesh.material.outputNode});
   mesh.material.needsUpdate=true;
   const samples=[];
   for(const weight of [0,.25,.5,1]) {
    jungleMistUniforms.weight.value=weight;
    const sample=mean(await draw(`mist-${representation}-${depth}-${weight}`,{representation,depth,weight,time:10},depth===100&&(weight===0||weight===1)));
    samples.push(sample);
    if(weight===0||depth===10)state.report.checks.push({id:`clear-${representation}-${depth}-${weight}`,error:difference(base.rgb,sample.rgb),passed:difference(base.rgb,sample.rgb)<=1/255});
   }
   const changes=samples.map(s=>difference(base.rgb,s.rgb));
   state.report.checks.push({id:`mist-monotonic-${representation}-${depth}`,changes,passed:changes.every((v,i)=>i===0||v+1e-6>=changes[i-1])});
   outputs.set(representation,samples);
   batch?.dispose();if(!batch){scene.remove(mesh);geometry.dispose();mesh.material.dispose();}
  }
  for(const [representation,samples] of outputs)for(let i=0;i<4;i++) {
   const error=difference(samples[i].rgb,outputs.get('near')[i].rgb);
   state.report.checks.push({id:`mist-parity-${representation}-${depth}-${i}`,error,passed:error<=.01});
  }
  atlas.albedo.dispose();atlas.normal.dispose();
 }
 // The same canonical card before and after a large render-origin change.
 const canonical={x:-350,z:-910},origin={x:8000000,z:-3000000},means=[];
 const geometry=new THREE.PlaneGeometry(25,25),material=new THREE.MeshBasicNodeMaterial({side:THREE.DoubleSide});
 material.outputNode=vec4(.2,.25,.3,1);applyJungleMist(material,ambient,{time:float(10)});
 const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);jungleMistUniforms.weight.value=1;
 for(const shift of [{x:0,z:0},origin]) {
  worldWindUniforms.windowCenter.value.set(canonical.x-shift.x,canonical.z-shift.z);
  worldWindUniforms.windowCenterCanonical.value.set(canonical.x,canonical.z);
  camera.position.set(canonical.x-shift.x,1.7,canonical.z-shift.z);
  camera.lookAt(canonical.x-shift.x,1.7,canonical.z-shift.z-100);camera.updateMatrixWorld();
  mesh.position.set(canonical.x-shift.x,1.7,canonical.z-shift.z-100);mesh.updateMatrixWorld();
  means.push(mean(await draw(`mist-origin-${shift.x}`,{canonical,origin:shift,time:10},true)));
 }
 const error=difference(means[0].rgb,means[1].rgb);
 state.report.checks.push({id:'mist-negative-coordinate-origin-invariance',error,passed:error<=.01});
 scene.remove(mesh);geometry.dispose();material.dispose();jungleMistUniforms.weight.value=0;
 worldWindUniforms.windowCenter.value.set(0,0);worldWindUniforms.windowCenterCanonical.value.set(0,0);
}
export async function runNormalRotation({renderer,scene,camera,draw,state,sun,fill}) {
 jungleMistUniforms.weight.value=0;sun.intensity=1;fill.intensity=.4;
 sun.position.set(3,4,2);sun.target.position.set(0,0,0);sun.target.updateMatrixWorld();
 const worldNormal=new THREE.Vector3(.3,.8,.5).normalize(),measurements=[];
 for(const azimuth of [0,90,180,270]) {
  const angle=THREE.MathUtils.degToRad(azimuth);
  camera.position.set(Math.sin(angle)*10,0,Math.cos(angle)*10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const e=camera.matrixWorld.elements,right=new THREE.Vector3(e[0],e[1],e[2]),up=new THREE.Vector3(e[4],e[5],e[6]),back=new THREE.Vector3(e[8],e[9],e[10]);
  const encoded=[right,up,back].map(axis=>Math.round((worldNormal.dot(axis)*.5+.5)*255));
  const atlas=solidAtlas(3,3,[...encoded,0]);
  const batch=new CpuTreeImpostorBatch({scene,atlas,capacity:1,name:'normal-rotation'});batch.uniforms.windStrength.value=0;
  batch.setRecords([{x:0,y:0,z:0,scale:1,yaw:0,fade:1,seed:.5,radius:atlas.radius}]);batch.update(camera,{x:0,z:0},0);
  measurements.push(mean(await draw(`normal-rotation-${azimuth}`,{azimuth,worldNormal:worldNormal.toArray(),encoded},true)));
  batch.dispose();atlas.albedo.dispose();atlas.normal.dispose();
 }
 const error=Math.max(...measurements.map(m=>difference(m.rgb,measurements[0].rgb)));
 state.report.checks.push({id:'fixed-world-normal-rotating-view',error,means:measurements,passed:error<=.01});
}

export async function runOpticalDepth({scene,camera,draw,state,ambient}) {
 camera.position.set(0,0,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const geometry=new THREE.PlaneGeometry(3,3),material=new THREE.MeshBasicNodeMaterial(),mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
 const settings=resolveJungleMistConfig(ambient),nodes=createJungleMistNodes({settings,time:float(10),
  cameraPosition:vec3(0,1.7,0),worldPosition:vec3(0,1.7,-100),sunColor:vec3(.3),fill:vec3(.2)});
 state.report.opticalDepthSource=nodes.opticalDepth?'production optical depth':'inverted production amount';
 material.outputNode=vec4(nodes.opticalDepth??log(nodes.amount.oneMinus()).negate(),nodes.amount,0,.37);
 const samples=[];
 for(const weight of [0,.25,.5,1,4]) {
  jungleMistUniforms.weight.value=weight;
  const pixels=await draw(`mist-optical-depth-${weight}`,{weight},false);let depth=0,amount=0,alphaError=0,count=0;
  for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>.3){depth+=pixels[i];amount+=pixels[i+1];alphaError=Math.max(alphaError,Math.abs(pixels[i+3]-.37));count++;}
  if(count<1000)throw new Error('Insufficient optical-depth fixture pixels.');samples.push({weight,depth:depth/count,amount:amount/count,alphaError});
 }
 const full=samples[3].depth;
 state.report.checks.push({id:'gpu-optical-depth-weight-linearity',samples,passed:full>0&&samples.every(s=>Math.abs(s.depth-full*s.weight)<1e-5&&s.amount<=.50001&&s.alphaError<1e-6)});
 scene.remove(mesh);geometry.dispose();material.dispose();jungleMistUniforms.weight.value=0;
}
