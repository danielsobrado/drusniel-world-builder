import {COLLISION_LAYERS} from '../../collision/CollisionLayers.js';
import {MEADOW_SHAPE_COUNT} from '../../stylized/meadow/meadowGrassShapes.js';
import {MAX_MEADOW_PALETTES} from '../../stylized/meadow/meadowPalettes.js';

export const VISUAL_SYNTHETIC={centerX:-8960,centerZ:7680,sideMeters:256,height:24};
/** Ordinary authored overrides, consumed by the real workers and collision pipeline. */
export function createVisualSyntheticDocument(document) {
 const {chunkSize,tileSize}=document.world,{centerX,centerZ,sideMeters,height}=VISUAL_SYNTHETIC;
 const minX=(centerX-sideMeters/2)/tileSize,maxX=(centerX+sideMeters/2)/tileSize;
 const minZ=-(centerZ+sideMeters/2)/tileSize,maxZ=-(centerZ-sideMeters/2)/tileSize;
 const chunks=new Map(),get=(x,z)=>{
  const cx=Math.floor(x/chunkSize),cz=Math.floor(z/chunkSize),key=`${cx}:${cz}`;
  if(!chunks.has(key))chunks.set(key,{x:cx,z:cz,tiles:[],heights:[]});return chunks.get(key);
 };
 for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++) {
  const chunk=get(x,z),lx=x-chunk.x*chunkSize,lz=z-chunk.z*chunkSize;
  chunk.heights.push([lz*(chunkSize+1)+lx,height]);
  if(x<maxX&&z<maxZ)chunk.tiles.push([lz*chunkSize+lx,x*tileSize<centerX?4:6]);
 }
 return {...document,world:{...document.world,baseTerrain:null},chunks:[...chunks.values()],objects:[],forestEdits:{version:1,felled:[],planted:[],patches:[]}};
}
export function selectVisualSyntheticRoute(editor) {
 const {centerX,centerZ,height}=VISUAL_SYNTHETIC,player=editor.playerController,runtime=player.collisionRuntime;
 if(!runtime)throw new Error('Synthetic route requires the production collision runtime.');
 const length=player.config.walkSpeed*4*(1+player.config.runMultiplier),attempts=[];
 for(let x=centerX-112;x<=centerX-16;x+=2) {
  const start={x,y:height,z:centerZ+100},end={x,y:height,z:start.z-length-2};
  const readiness=runtime.checkMovementReadiness({start,end,radius:1,bodyHeight:2});
  const colliders=runtime.querySweptCapsule({start,end,radius:1,bodyHeight:2,layers:COLLISION_LAYERS.blocking|COLLISION_LAYERS.walkable});
  attempts.push({x,ready:readiness.ready,candidates:colliders.map(c=>c.sourceId)});
  if(readiness.ready&&colliders.length===0)return {startPose:{id:'synthetic-open-ground',x,z:start.z,yaw:0,pitch:-.08,mode:'player',expectedBiomeId:4},length,clearanceMeters:1,attempts};
 }
 throw new Error(`No unobstructed 256 m fixture corridor: ${JSON.stringify(attempts)}`);
}
export function visualSyntheticIdentity(editor) {
 const {centerX,centerZ,sideMeters}=VISUAL_SYNTHETIC,inside=(x,z)=>Math.abs(x-centerX)<sideMeters/2&&Math.abs(z-centerZ)<sideMeters/2;
 const identities={};
 for(const kind of ['tree','rock'])identities[kind]=[...editor.stylizedSurface[`${kind}View`].manifestStore.cache.values()]
  .flatMap(e=>e.placements).filter(p=>inside(p.x,p.z)).map(p=>`${p.stableId}|${p.prototypeIndex}`).sort();
 const field=editor.stylizedSurface.meadowGrass,stems=[];
 const camera=editor.terrainView.floatingOrigin.toCanonical(editor.playerController.state.x,editor.playerController.state.z);
 for(const tile of field.blades.tiles.values()) {
  if(!tile.output||Math.hypot(tile.centerX-camera.x,tile.centerZ-camera.z)>12)continue;
  const out=tile.output;
  for(let i=0;i<out.count;i++) {
   const growth=Math.floor(Math.floor(out.data[i*4])/(MEADOW_SHAPE_COUNT*MAX_MEADOW_PALETTES));
   stems.push(`${tile.key}:${out.data[i*4+1]}|${growth}`);
  }
 }
 identities.nearGrass=stems.sort();
 identities.growthProfiles=field.ground.growth.profiles;
 return identities;
}
export function visualSyntheticResidency(editor) {
 const {centerX,centerZ,sideMeters}=VISUAL_SYNTHETIC,m=editor.terrainView.chunkWorldSize,keys=[];
 for(let z=Math.floor(-(centerZ+sideMeters/2)/m);z<=Math.floor(-(centerZ-sideMeters/2+.001)/m);z++)
  for(let x=Math.floor((centerX-sideMeters/2)/m);x<=Math.floor((centerX+sideMeters/2-.001)/m);x++)keys.push(`${x}:${z}`);
 const resident=new Set(editor.terrainView.slots.filter(s=>s.page&&!s.loading&&s.descriptor).map(s=>`${s.descriptor.chunkX}:${s.descriptor.chunkZ}`));
 return {targetKeys:keys,resident:keys.filter(k=>resident.has(k)),
  trees:keys.filter(k=>editor.stylizedSurface.treeView.manifestStore.cache.has(k)),
  rocks:keys.filter(k=>editor.stylizedSurface.rockView.manifestStore.cache.has(k)),origin:editor.terrainView.floatingOrigin.getState()};
}
