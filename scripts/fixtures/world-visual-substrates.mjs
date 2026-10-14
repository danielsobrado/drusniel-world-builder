import * as THREE from 'three/webgpu';
import { cameraPosition,color,float,positionWorld,vec2,vec3,vec4 } from 'three/tsl';
import { createTerrainMaterialBakedSurface } from '/src/editor/materials/TerrainMaterialBakedNodes.js';
import { createTerrainMaterialBakeGpuState,attachTerrainMaterialBakeGpuState,uploadTerrainMaterialBakeGpu } from '/src/editor/materials/TerrainMaterialBakeGpu.js';
import { createTerrainMaterialFarStyle,encodeTerrainMaterialFarColor } from '/src/editor/materials/TerrainMaterialBakeFarColor.js';
import { terrainSubstrateResponse } from '/src/editor/materials/TerrainSubstrateMath.js';
import { TILE_BY_ID } from '/src/editor/tileCatalog.js';

const SWATCHES=[
 {name:'sand',tileId:1,dirt:1},{name:'mineral',tileId:6,dirt:1},
 {name:'litter',tileId:6,dirt:1,canopy:1},{name:'mud',tileId:12,dirt:1,wetness:1},
 {name:'rock',tileId:6,rock:1},{name:'snow',tileId:11,snow:1},
];
const srgb=v=>v<=.0031308?v*12.92:1.055*Math.pow(Math.max(0,v),1/2.4)-.055;
function compare(a,b,{roughness=false}={}) {
 let error=0,valid=0;
 for(let i=0;i<a.length;i+=4) {
  if(a[i]+a[i+1]+a[i+2]<1e-6||b[i]+b[i+1]+b[i+2]<1e-6)continue;
  valid++;for(let c=0;c<3;c++)error+=Math.abs((roughness?a[i+c]:srgb(a[i+c]))-(roughness?b[i+c]:srgb(b[i+c])))*255;
 }
 const meanBytes=valid?error/(valid*3):Infinity,limitBytes=roughness?2:8;
 return {validPixels:valid,meanBytes,limitBytes,passed:valid>=10000&&meanBytes<=limitBytes};
}
function fill(ArrayType,texels,values) {
 const data=new ArrayType(texels*values.length);for(let i=0;i<data.length;i++)data[i]=values[i%values.length];return data;
}
/** Exercise the production near/mid node recipe against its actual CPU far encoder. */
export async function runTerrainSubstrateSwatches({raw,scene,camera,draw,state}) {
 const style=createTerrainMaterialFarStyle({grassBottomColor:raw.color.bottom,grassBrightness:raw.color.brightness,
  dirtColor:raw.dirt.color,forestColor:raw.trees.forestFloor.groundCoreColor},raw.materialBake.render,raw.materialBake.families.substrates);
 for(const swatch of SWATCHES) {
  const config=structuredClone(raw),bake=config.materialBake;
  // Isolate substrate selection/quantization from independent noise and weather offsets.
  for(const feature of ['genomes','features','weathering','transitions'])bake.families[feature].enabled=false;
  bake.families.enabled=false;bake.render.nearMaterialBlend=1;
  const rgb=new THREE.Color(TILE_BY_ID.get(swatch.tileId).color).getHex(),source=new Uint8Array([rgb>>>16,(rgb>>>8)&255,rgb&255,swatch.tileId]);
  const far=new Uint8Array(4),macro=128/255*2,W=swatch.wetness??0,C=swatch.canopy??0;
  encodeTerrainMaterialFarColor(far,0,source,0,style,0,swatch.dirt??0,swatch.rock??0,swatch.snow??0,macro,macro,macro,0,W,C,1,0);
  const gpu=createTerrainMaterialBakeGpuState(bake),texels=gpu.resolution**2;
  const owner=new THREE.EventDispatcher();owner.userData={};attachTerrainMaterialBakeGpuState(owner,gpu);
  uploadTerrainMaterialBakeGpu(owner,{descriptor:{key:`fixture-${swatch.name}`},resolution:gpu.resolution,channels:{
   macroTint:fill(Uint8Array,texels,[128,128,128,255]),terrainShape:fill(Uint16Array,texels,[0,0]),
   materialWeights:fill(Uint8Array,texels,[0,(swatch.dirt??0)*255,(swatch.rock??0)*255,(swatch.snow??0)*255]),
   wetnessShoreline:fill(Uint8Array,texels,[W*255,0]),farColor:fill(Uint8Array,texels,far),
   farNormal:fill(Int8Array,texels,[0,0]),canopyWater:fill(Uint8Array,texels,[C*255,0]),
  }});gpu.ready.value=1;gpu.blend.value=1;
  const geometry=new THREE.PlaneGeometry(4,4);geometry.rotateX(-Math.PI/2);
  const mesh=new THREE.Mesh(geometry);scene.add(mesh);
  const materials={},roughness=swatch.dirt?terrainSubstrateResponse({tileId:swatch.tileId,canopy:C,wetness:W},bake.families.substrates).roughness:
   bake.families.profiles[swatch.rock?'rock':'snow'].roughness;
  for(const mode of ['cpu','shader']) {
   const settings=structuredClone(config);settings.materialBake.render.nearDistance=0;
   settings.materialBake.render.farDistance=mode==='cpu'?0:100000;settings.materialBake.render.transitionDistance=.01;
   const surface=createTerrainMaterialBakedSurface({terrainUv:vec2(.5),tileColor:color(TILE_BY_ID.get(swatch.tileId).color),tileId:float(swatch.tileId),
    heightShade:float(1),cameraDistance:cameraPosition.distance(positionWorld),proceduralColor:color(raw.dirt.color),worldXZ:positionWorld.xz,
    terrainHeight:float(0),familyAtlas:null,gpuState:gpu,stylizedConfig:settings});
   const material=new THREE.MeshStandardNodeMaterial({side:THREE.DoubleSide});material.name=`substrate-${swatch.name}-${mode}`;
   material.colorNode=surface.color;material.roughnessNode=surface.roughness;material.normalNode=surface.normal;
   materials[mode]={material,surface};
  }
  try {
   for(const distance of [3,20,60,140]) {
    // Far swatches are scaled to retain the same measured projected material area.
    const scale=distance===3?1:distance/3;mesh.scale.setScalar(scale);
    camera.position.set(0,1.7,8).normalize().multiplyScalar(distance);camera.lookAt(0,0,0);camera.updateMatrixWorld();
    const pixels={};
    for(const debug of ['color','roughness']) {
     for(const mode of ['cpu','shader']) {
      const {material,surface}=materials[mode];mesh.material=material;
      material.fragmentNode=debug==='roughness'?vec4(vec3(mode==='cpu'?float(roughness):surface.roughness),1):null;
      material.needsUpdate=true;
      pixels[mode]=await draw(`${swatch.name}-${distance}-${debug}-${mode}`,{swatch:swatch.name,distance,planeMeters:4*scale,scale,mode,debug,
       isolated:'substrate recipe; stochastic, genome, feature and weather offsets disabled'});
     }
     const metric=compare(pixels.cpu,pixels.shader,{roughness:debug==='roughness'});
     state.report.checks.push({id:`${swatch.name}-${distance}-${debug}-parity`,...metric});
    }
   }
  }finally {scene.remove(mesh);geometry.dispose();for(const {material} of Object.values(materials))material.dispose();owner.dispatchEvent({type:'dispose'});}
 }
}
