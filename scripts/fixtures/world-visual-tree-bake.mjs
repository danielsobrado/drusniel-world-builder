import * as THREE from 'three/webgpu';
import { texture,vec3 } from 'three/tsl';
import { TreeImpostorBaker } from '/src/editor/stylized/impostor/TreeImpostorBaker.js';

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
 const pixels=await draw('baker-linear-albedo-roundtrip',{expected,atlasColorSpace:atlas.albedo.colorSpace},true);
 const actual=[0,0,0];let count=0;
 for(let y=270;y<330;y++)for(let x=370;x<430;x++){
  const i=(y*800+x)*4;for(let c=0;c<3;c++)actual[c]+=pixels[i+c];count++;
 }
 for(let c=0;c<3;c++)actual[c]/=count;
 const error=Math.max(...actual.map((v,i)=>Math.abs(v-expected[i])));
 state.report.checks.push({id:'production-baker-linear-albedo-roundtrip',expected,actual,error,passed:error<=2/255});
 scene.remove(mesh);geometry.dispose();source.dispose();material.dispose();atlas.albedo.dispose();atlas.normal.dispose();
}
