import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { loadEditorConfig } from '/src/config/loadEditorConfig.js';
import { createTerrainMaterial } from '/src/editor/terrainMaterial.js';
import { GrassTuning } from '/src/editor/stylized/GrassTuning.js';
import { MeadowGrassField } from '/src/editor/stylized/meadow/MeadowGrassField.js';
import { resolveMeadowGrassConfig } from '/src/editor/stylized/meadow/meadowGrassConfig.js';
import { createSurfaceMaskConfig } from '/src/editor/world/ChunkRenderPixels.js';
import { generateBaseWorldChunk } from '/src/editor/world/generateWorldChunk.js';
import { createNoWaterSample } from '/src/editor/water/WaterSample.js';
import { sampleSurfaceMaskChannel } from '/src/editor/world/SurfaceMaskSampling.js';
import { naturalTrailMaskAt } from '/src/editor/stylized/naturalTrailMath.js';
import { installUnusedSamplerPruning } from '/src/render/UnusedSamplerBindings.js';
import { raiseDeviceLimits } from '/src/render/deviceLimits.js';
const backend=new URLSearchParams(location.search).get('backend')??'webgpu';
const state=window.__worldGrassFixture={pendingCapture:null,continue:null,report:{backend,cases:[],checks:[],done:false}};
const requiredLimits=backend==='webgpu'?await raiseDeviceLimits({}, {powerPreference:'high-performance'}):{};
const renderer=new THREE.WebGPURenderer({forceWebGL:backend==='webgl',antialias:true,requiredLimits});
const pruning=installUnusedSamplerPruning(renderer);
renderer.setPixelRatio(1);renderer.setSize(1600,900);renderer.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(renderer.domElement);await renderer.init();
state.report.backend=renderer.backend.isWebGPUBackend?'webgpu':'webgl';
const camera=new THREE.PerspectiveCamera(68,1600/900,.1,1000),raw=loadEditorConfig().stylizedSurface;
try {
 for(const kind of ['natural','painted']) {
  const config=structuredClone(raw);config.path.naturalTrail.enabled=kind==='natural';
  config.materialBake.enabled=false;config.groundCover.enabled=false;config.sky.cloudShadows.enabled=false;config.ambientEffects=null;config.contactShade.enabled=false;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#b2c9d2');
  const sun=new THREE.DirectionalLight('#fff2d9',2.5);sun.position.set(-80,100,20);scene.add(sun,new THREE.HemisphereLight('#b9daff','#7b7560',1.2));
  const generator={sampleTile:x=>kind==='painted'&&x>=4&&x<6?13:4,sampleHeight:()=>0,sampleWater:()=>createNoWaterSample(0),toMetadata:()=>({seed:918273})};
  const slots=[],size=448,tilePixels=new Uint8Array(size**2*4),mask=new Uint8Array(size**2*4);
  for(let cz=-7;cz<7;cz++)for(let cx=-7;cx<7;cx++) {
   const page=generateBaseWorldChunk({chunkX:cx,chunkZ:cz,chunkSize:32,worldGenerator:generator,surfaceMaskConfig:createSurfaceMaskConfig(config,{tileSize:2})});
   slots.push({page,pageRevision:1,descriptor:{key:`${cx}:${cz}`,chunkX:cx,chunkZ:cz,originCellX:cx*32,originCellZ:cz*32,centerWorldX:(cx+.5)*64,centerWorldZ:-(cz+.5)*64}});
   for(let z=0;z<32;z++)for(let x=0;x<32;x++) {
    const from=(z*32+x)*4,to=(((cz+7)*32+z)*size+(cx+7)*32+x)*4;
    mask.set(page.surfaceMaskPixels.subarray(from,from+4),to);tilePixels.set(page.tilePixels.subarray(from,from+4),to);
   }
  }
  const maps=[],makeMap=(pixels,width,format=THREE.RGBAFormat,type=THREE.UnsignedByteType)=>{
   const map=new THREE.DataTexture(pixels,width,width,format,type);map.minFilter=map.magFilter=THREE.LinearFilter;map.needsUpdate=true;maps.push(map);return map;
  };
  const tileTexture=makeMap(tilePixels,size);tileTexture.colorSpace=THREE.SRGBColorSpace;tileTexture.minFilter=tileTexture.magFilter=THREE.NearestFilter;
  const floorMaterial=createTerrainMaterial({tileTexture,heightTexture:makeMap(new Float32Array(33**2),33,THREE.RedFormat,THREE.FloatType),
   surfaceMaskTexture:makeMap(mask,size),forestFloorTexture:makeMap(new Uint8Array(4),1),chunkCenter:uniform(new THREE.Vector2()),width:32,chunkWorldSize:896,stylizedConfig:config});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(896,896,32,32),floorMaterial);floor.rotation.x=-Math.PI/2;scene.add(floor);
  const terrainView={slots,worldStore:{chunkSize:32,tileSize:2,generator},floatingOrigin:{getState:()=>({x:0,z:0})},getCanonicalHeight:()=>0};
  const tuning=new GrassTuning(config);tuning.setSettings({windStrength:0,windLean:0,windTurbulence:0,flutterStrength:0});
  const field=new MeadowGrassField({scene,terrainView,config,settings:resolveMeadowGrassConfig(config.grass.meadow),tuning,sunDirection:uniform(sun.position.clone().normalize())});
  let target={x:10,z:0};
  if(kind==='natural') {
   const points=[];for(let z=-64;z<=64;z++)for(let x=-64;x<=64;x++)if(naturalTrailMaskAt(x,z,config.path.naturalTrail)>.99)points.push({x,z});
   points.sort((a,b)=>a.x*a.x+a.z*a.z-b.x*b.x-b.z*b.z||a.z-b.z||a.x-b.x);target=points[0];
   if(!target)throw new Error('No natural trail in the controlled scene.');
  }
  try {
   for(const distance of [8,30,70]) {
    camera.position.set(target.x+distance,1.7,target.z+10);camera.lookAt(target.x,0,target.z);camera.updateMatrixWorld();
    const started=performance.now();let ready=0;
    for(let frame=0;ready<3;frame++) {
     field.update(frame*16,camera);const stats=field.getState();
     ready=stats.building===0&&field.blades.stats.visibleMissing===0&&(field.cards?.stats.visibleMissing??0)===0?ready+1:0;
     if(performance.now()-started>120000)throw new Error('Path meadow did not prepare.');await new Promise(requestAnimationFrame);
    }
    field.uniforms.time.value=Math.max(...[...field.blades.tiles.values(),...field.cards.tiles.values()].map(t=>t.revealTime??0))+2;
    const counts={blades:0,cards:0,naturalTreadRoots:0,paintedTreadRoots:0};
    for(const [name,layer] of [['blades',field.blades],['cards',field.cards]])for(const tile of layer.tiles.values()) {
     const out=tile.output;if(!out)continue;
     for(let i=0;i<out.count;i++) {
      const x=tile.centerX+out.position[i*4],z=tile.centerZ+out.position[i*4+2],slot=field.ground.slotFor(...field.ground.chunkOf(x,z));
      const channel=c=>sampleSurfaceMaskChannel(slot.page.surfaceMaskPixels,32,32,x/2-slot.descriptor.originCellX,-z/2-slot.descriptor.originCellZ,c);
      counts[name]++;
      if(naturalTrailMaskAt(x,z,config.path.naturalTrail)*channel(1)>=config.path.naturalTrail.clearThreshold)counts.naturalTreadRoots++;
      if(channel(0)>=config.path.naturalTrail.clearThreshold)counts.paintedTreadRoots++;
     }
    }
    const id=`${kind}-path-${distance}`,check={id,...counts,passed:counts.blades>0&&counts.cards>0&&counts.naturalTreadRoots===0&&counts.paintedTreadRoots===0};
    state.report.checks.push(check);state.report.cases.push({id,target,distance,eyeHeight:1.7,counts,readiness:field.getState()});
    await renderer.compileAsync(scene,camera);await renderer.render(scene,camera);
    if(renderer.backend.isWebGPUBackend)await renderer.backend.device.queue.onSubmittedWorkDone();
    state.pendingCapture=id;await new Promise(resolve=>{state.continue=resolve;});state.pendingCapture=null;
   }
  }finally{field.dispose();floor.geometry.dispose();floorMaterial.dispose();maps.forEach(m=>m.dispose());}
 }
 state.report.passed=state.report.checks.length===6&&state.report.checks.every(c=>c.passed);
}catch(error){state.report.failure=error.stack;state.report.passed=false;}
finally{pruning.dispose();state.report.done=true;}
