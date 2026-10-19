import * as THREE from 'three/webgpu';
import { texture,vec3 } from 'three/tsl';
import { TreeImpostorBaker } from '/src/editor/stylized/impostor/TreeImpostorBaker.js';
import { gradeBark, gradeBarkRgb, resolveBarkGrade } from '/src/editor/stylized/forest/barkGrade.js';

/** Float-target checks exercise the production shader against a linear-light
 * reference, including black crevices and pale birch under the same grade. */
export async function runBarkGradeSwatches({ scene, camera, draw, state }) {
 const geometry=new THREE.PlaneGeometry(3,3),settings=resolveBarkGrade({enabled:true});
 camera.position.set(0,0,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 for(const sample of [[0,0,0],[.02,.01,.005],[.18,.09,.035],[.85,.88,.8]]) {
  const material=new THREE.MeshBasicNodeMaterial({side:THREE.DoubleSide});
  material.colorNode=gradeBark(vec3(...sample),settings);
  const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
  try {
   const expected=gradeBarkRgb(sample,settings),id=`bark-grade-${sample.join('-')}`;
   const pixels=await draw(id,{sample,expected},true),center=(300*800+400)*4;
   const actual=Array.from(pixels.subarray(center,center+3));
   const error=Math.max(...actual.map((value,index)=>Math.abs(value-expected[index])));
   state.report.checks.push({id,sample,expected,actual,error,passed:error<.0001});
  }finally{scene.remove(mesh);material.dispose();}
 }
 geometry.dispose();
}

/** Round-trip an actual production bake through its tagged PNG/canvas texture. */
export async function runBakerSwatch({renderer,scene,camera,draw,state}) {
 const geometry=new THREE.PlaneGeometry(3,3),source=new THREE.MeshLambertNodeMaterial();
 const expected=[.18,.08,.03];source.colorNode=vec3(...expected);
 const settings={columns:1,rows:1,tileSize:128,gutter:4,lowElevationDegrees:0,highElevationDegrees:0};
 const baker=new TreeImpostorBaker({renderer,config:{lod:{impostor:settings}}});
 const atlas=await baker.bakePrototype([{kind:'leaf',geometry,material:source}],0,settings,renderer);
 const material=new THREE.MeshBasicNodeMaterial({side:THREE.DoubleSide});material.colorNode=texture(atlas.albedo).rgb;
 const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
 camera.position.set(0,0,10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const bakedSample=Array.from(atlas.albedoCanvas.getContext('2d').getImageData(64,64,1,1).data);
 const pixels=await draw('baker-linear-albedo-roundtrip',{expected,atlasColorSpace:atlas.albedo.colorSpace,bakedSample},true);
 const actual=[0,0,0],range={minimum:Infinity,maximum:-Infinity,alphaMinimum:Infinity};let count=0;
 for(let y=270;y<330;y++)for(let x=370;x<430;x++){
  const i=(y*800+x)*4;for(let c=0;c<3;c++)actual[c]+=pixels[i+c];
  range.minimum=Math.min(range.minimum,pixels[i]);range.maximum=Math.max(range.maximum,pixels[i]);range.alphaMinimum=Math.min(range.alphaMinimum,pixels[i+3]);count++;
 }
 for(let c=0;c<3;c++)actual[c]/=count;
 const error=Math.max(...actual.map((v,i)=>Math.abs(v-expected[i])));
 state.report.checks.push({id:'production-baker-linear-albedo-roundtrip',expected,actual,bakedSample,range,center:Array.from(pixels.subarray((300*800+400)*4,(300*800+400)*4+4)),error,passed:error<=2/255});
 scene.remove(mesh);geometry.dispose();source.dispose();material.dispose();atlas.albedo.dispose();atlas.normal.dispose();
 const trunkGeometry=new THREE.PlaneGeometry(3,3),trunkSource=new THREE.MeshLambertNodeMaterial();
 trunkSource.colorNode=vec3(...expected);
 const trunk=await baker.bakePrototype([{kind:'trunk',geometry:trunkGeometry,material:trunkSource}],0,settings,renderer);
 const trunkMaterial=new THREE.MeshBasicNodeMaterial({side:THREE.DoubleSide});
 trunkMaterial.colorNode=texture(trunk.normal).rgb;
 const trunkMesh=new THREE.Mesh(trunkGeometry,trunkMaterial);scene.add(trunkMesh);
 const normalPixels=await draw('baker-trunk-normal-roundtrip',{normalEncoding:trunk.normalEncoding},true);
 const center=(300*800+400)*4,actualNormal=Array.from(normalPixels.subarray(center,center+3));
 const encoded=Array.from(trunk.normalCanvas.getContext('2d').getImageData(64,64,1,1).data);
 state.report.checks.push({id:'production-baker-trunk-normal-roundtrip',actualNormal,encoded,
  passed:encoded[3]===128&&Math.max(...actualNormal.map((v,i)=>Math.abs(v-[.5,.5,1][i])))<2/255});
 scene.remove(trunkMesh);trunkGeometry.dispose();trunkSource.dispose();trunkMaterial.dispose();trunk.albedo.dispose();trunk.normal.dispose();
}
