import {PLAYER_MAX_DELTA_SECONDS,PLAYER_MODE_WALK} from '../../player/playerConstants.js';
import {tileDistanceSquared} from '../../stylized/meadow/meadowGrassLayout.js';
import {sampleSurfaceMaskChannel} from '../../world/SurfaceMaskSampling.js';

export function visualMotionInput(elapsed,startYaw) {
 const moving=elapsed>=2&&elapsed<10||elapsed>=13&&elapsed<17;
 return {keys:moving?(elapsed>=6&&elapsed<10?['KeyW','ShiftLeft']:['KeyW']):[],
  yaw:startYaw+Math.PI*Math.max(0,Math.min(1,elapsed-12))};
}
export function visualMotionDelta(previous,current) {
 return previous==null?0:Math.min(PLAYER_MAX_DELTA_SECONDS,Math.max(0,(current-previous)/1000));
}
function nearMeadow(editor,canonical) {
 const field=editor.stylizedSurface.meadowGrass;if(!field)return {eligible:[],published:[],missing:[]};
 const ground=field.ground,eligible=[],published=[];
 for(const tile of field.blades.tiles.values()) {
  if(tile.band===null||!tile.inView||tileDistanceSquared(canonical.x,canonical.z,tile.centerX,tile.centerZ,field.blades.tileSize)>144)continue;
  const slot=ground.slotFor(...ground.chunkOf(tile.centerX,tile.centerZ));if(!slot)continue;
  let potential=false;
  const half=field.blades.tileSize/2;
  for(let z=-half+ground.tileSize/2;z<half&&!potential;z+=ground.tileSize)for(let x=-half+ground.tileSize/2;x<half;x+=ground.tileSize) {
   const wx=tile.centerX+x,wz=tile.centerZ+z,lx=wx/ground.tileSize-slot.descriptor.originCellX,lz=-wz/ground.tileSize-slot.descriptor.originCellZ;
   const id=slot.page.tiles[Math.floor(lz)*ground.chunkSize+Math.floor(lx)];
   if(!ground.eligible[id]||(ground.growth?.profiles[ground.growth.table[id]].density??1)<=0)continue;
   const E=sampleSurfaceMaskChannel(slot.page.surfaceMaskPixels,ground.chunkSize,ground.chunkSize,lx,lz,1);
   const path=sampleSurfaceMaskChannel(slot.page.surfaceMaskPixels,ground.chunkSize,ground.chunkSize,lx,lz,0);
   if(E>0&&!ground.paths.sample(wx,wz,E,path).blocked){potential=true;break;}
  }
  if(potential){eligible.push(tile.key);if(tile.output)published.push(tile.key);}
 }
 const present=new Set(published);
 return {eligible:eligible.sort(),published:published.sort(),missing:eligible.filter(key=>!present.has(key)).sort()};
}
/** Input is applied before the actual player update; samples follow the successful render. */
export class WorldVisualMotion {
 constructor(editor,{startPose,cameraMode,readiness}) {
  Object.assign(this,{editor,startPose,cameraMode,readiness});this.elapsed=0;this.frames=[];this.keys=[];
  this.startedAt=performance.now();this.wallStartMs=performance.timeOrigin+this.startedAt;
  this.finished=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});
 }
 beforeMovement(timestamp) {
  const {playerController:player,viewModeController:view}=this.editor;
  if(view.mode!==PLAYER_MODE_WALK||view.paused||!player.enabled||view.cameraOverride){this.stop(new Error('Motion lost ordinary player simulation.'));return;}
  const input=visualMotionInput(this.elapsed,this.startPose.yaw);this.keys=input.keys;
  player.setHarnessKeys(input.keys);player.yaw=input.yaw;player.applyCameraState();
  this.pendingDelta=visualMotionDelta(player.lastTimestamp,timestamp);
 }
 afterFrame(timestamp) {
  if(this.done)return;
  const e=this.editor,p=e.playerController,status=p.getStatus();
  // The owner timestamp proves that PlayerController.update actually ran.
  const dt=p.lastTimestamp===timestamp?this.pendingDelta??0:0;this.elapsed+=dt;
  const canonical=e.terrainView.floatingOrigin.toCanonical(status.position.x,status.position.z),ready=this.readiness();
  this.frames.push({elapsed:this.elapsed,deltaSeconds:dt,frameTimestamp:timestamp,wallTimeMs:performance.timeOrigin+performance.now(),keys:this.keys,
   position:{...canonical,y:status.position.y,footY:status.footY},camera:{...e.terrainView.floatingOrigin.toCanonical(e.viewModeController.camera.position.x,e.viewModeController.camera.position.z),y:e.viewModeController.camera.position.y},
   yaw:p.yaw,pitch:p.pitch,mode:e.viewModeController.mode,fov:e.viewModeController.camera.fov,collision:status.collision,waterState:status.waterState,
   scenery:{ready:ready.scenery.ready,queueDepth:ready.scenery.queueDepth,fields:ready.scenery.fields,meadow:ready.scenery.meadow,draws:ready.scenery.draws,variants:ready.scenery.variants,staged:ready.scenery.staged},
   nearMeadow:nearMeadow(e,canonical),interactionPeak:e.stylizedSurface.meadowGrass?.interaction?.peak??0});
  if(this.elapsed>=20)this.stop();
  else if(performance.now()-this.startedAt>90000)this.stop(new Error('Motion simulation did not advance 20 seconds within 90 wall seconds.'));
 }
 stop(error=null) {
  if(this.done)return;this.done=true;this.editor.playerController.setHarnessKeys([]);
  if(error){this.reject(error);return;}
  const player=this.editor.playerController;
  this.resolve({sequenceId:'walk-sprint-turn-v1',cameraMode:this.cameraMode,wallStartMs:this.wallStartMs,wallDurationMs:performance.now()-this.startedAt,
   elapsedSimulationSeconds:this.elapsed,settings:{walkSpeed:player.config.walkSpeed,runMultiplier:player.config.runMultiplier,firstPersonFov:player.camera.fov,thirdPersonFov:this.editor.viewModeController.thirdPersonCamera?.camera.fov},frames:this.frames});
 }
}
