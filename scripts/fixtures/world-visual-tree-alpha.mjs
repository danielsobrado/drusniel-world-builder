import * as THREE from 'three/webgpu';
const coverage=pixels=>{let count=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>=.5)count++;return count;};
/** Alpha is compared in the atlas baker's orthographic view, independently of perspective material tests. */
export async function runTreeAlphaCoverage({atlas,center,draw,metadata,cpu,gpu,groups,state}) {
 const span=atlas.height*(600/240),camera=new THREE.OrthographicCamera(-span*2/3,span*2/3,span/2,-span/2,.01,atlas.radius*6);
 const elevation=THREE.MathUtils.degToRad(atlas.lowElevationDegrees);
 camera.position.copy(center).add(new THREE.Vector3(0,Math.sin(elevation),Math.cos(elevation)).multiplyScalar(atlas.radius*2.5));
 camera.lookAt(center);camera.updateMatrixWorld();
 for(const batch of [cpu,gpu].filter(Boolean))batch.update(camera,{x:0,z:0},0);
 const counts={};
 for(const representation of ['near','cpu-impostor',...(gpu?['gpu-impostor']:[])]) {
  for(const meshes of Object.values(groups))for(const mesh of meshes)mesh.visible=false;
  for(const mesh of groups[representation])mesh.visible=true;
  const pixels=await draw(`tree-${metadata.prototypeIndex}-alpha-${representation}`,
   {...metadata,representation,projection:'orthographic matching bake',fov:null,azimuth:270,spanMeters:span,camera:camera.position.toArray()},true,camera);
  counts[representation]=coverage(pixels);
 }
 for(const representation of Object.keys(counts).filter(k=>k!=='near')) {
  const ratio=counts[representation]/counts.near;
  state.report.checks.push({id:`tree-alpha-${metadata.prototypeIndex}-${representation}`,projection:'orthographic matching bake',counts,ratio,
   passed:counts.near>=1000&&ratio>=.85&&ratio<=1.15});
 }
}
