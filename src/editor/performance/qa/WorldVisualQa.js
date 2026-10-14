import { PerfCounters } from './PerfCounters.js';
import { trackedWorldResources } from './WorldVisualResources.js';
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));

/** Dev-only browser adapter. Navigation uses the engine's transaction, never private predictor fields. */
export class WorldVisualQa {
  constructor(editor) { this.editor=editor; this.disposed=false; }
  async cut(pose) {
    this.editor.playerController.setHarnessActive(true);
    const result=await this.editor.cameraCutCoordinator.cut(pose);
    if(result.cancelled) throw new Error('Visual camera cut superseded.');
    return this.diagnostics();
  }
  readiness() {
    const e=this.editor, terrain=e.terrainView.getStreamingStatus(), scenery=e.stylizedSurface.getPreparationStatus();
    const collision=e.playerController.getStatus().collision.ready;
    const construction=!(PerfCounters.get('constructionQueueDepth')>0);
    return {ready:terrain.loading===0 && terrain.pendingCommits===0 && scenery.ready && collision && construction,
      terrain,scenery,collision,construction};
  }
  setCaptureUi(hidden) {
    if(this.editor.hudVisibility) return this.editor.hudVisibility.setCapture(hidden);
    // VQ-03 capture roots; VQ-11 supplies the public controller and input policy.
    for(const root of document.querySelectorAll('[data-capture-ui]')) root.style.visibility=hidden?'hidden':'';
    return true;
  }
  diagnostics() {
    const e=this.editor, camera=e.viewModeController.camera, origin=e.terrainView.floatingOrigin;
    const canonical=origin.toCanonical(camera.position.x,camera.position.z);
    const cell=e.terrainView.worldStore.tileSize;
    const placements={};
    for(const name of ['tree','rock','bush']) {
      const view=e.stylizedSurface[`${name}View`];
      const values=name==='tree'?[...(view?.manifestStore?.cache.values()??[])].flatMap(entry=>entry.placements??[]):view?.placements??[];
      placements[name]=values.map(p=>p.stableId??`${p.x}:${p.z}`).sort();
    }
    return {canonical,origin:origin.getState(),camera:camera.position.toArray(),yaw:e.playerController.yaw,pitch:e.playerController.pitch,
      actualBiomeId:e.terrainView.worldStore.getTile(Math.floor(canonical.x/cell),Math.floor(-canonical.z/cell)),
      readiness:this.readiness(),placements,resources:trackedWorldResources(e),counters:PerfCounters.snapshot(),
      sky:e.skyLooks?.current,wind:e.worldWind?.getState?.()??null,weather:{...e.weatherSettings},
      renderPath:e.terrainView.activeRenderPath??'unknown',finishApplications:e.terrainView.finishApplications??0,
      backend:e.terrainView.rendererBackendStatus?.mode,clock:{hour:e.dayNightCycle?.hour,paused:e.dayNightCycle?.paused}};
  }
  async settle({minimumMs=16000,timeoutMs=120000}={}) {
    const start=performance.now();let readyFrames=0,last;
    while(performance.now()-start<timeoutMs && !this.disposed) {
      await frame(); last=this.readiness();
      readyFrames=performance.now()-start>=minimumMs && last.ready?readyFrames+1:0;
      if(readyFrames>=60) return {waitedMs:performance.now()-start,readyFrames,...last};
    }
    throw new Error(`Visual scenery did not settle: ${JSON.stringify(last)}`);
  }
  async setLighting({preset='highfield',hour=12,weather='off'}={}) {
    const e=this.editor;
    e.dayNightCycle?.setPaused(true);e.dayNightCycle?.setHour(hour);e.skyLooks?.setPreset(preset);
    e.weatherSettings.weatherMode=weather;e.weatherSettings.weatherIntensity=weather==='off'?0:1;
    e.weatherController?.applySettings();
  }
  async runMotion({startPose,cameraMode='first-person',sequenceId='walk-sprint-turn-v1'}) {
    if(sequenceId!=='walk-sprint-turn-v1'||!['first-person','third-person'].includes(cameraMode)) throw new Error('Invalid visual motion sequence.');
    await this.cut(startPose);await this.settle();
    const e=this.editor,player=e.playerController,view=e.viewModeController,frames=[];
    view.cameraView=cameraMode==='third-person'?'third':'first';view.thirdPersonCamera?.reset();
    const started=performance.now();
    try {
      while(!this.disposed) {
        await frame();const elapsed=(performance.now()-started)/1000;if(elapsed>20)break;
        const keys=elapsed>=2&&elapsed<6||elapsed>=13&&elapsed<17?['KeyW']:elapsed>=6&&elapsed<10?['KeyW','ShiftLeft']:[];
        player.setHarnessKeys(keys);
        if(elapsed>=12) { player.yaw=startPose.yaw+Math.PI*Math.min(1,elapsed-12);player.applyCameraState(); }
        const status=player.getStatus();
        frames.push({elapsed,keys,position:e.terrainView.floatingOrigin.toCanonical(status.position.x,status.position.z),
          camera:e.terrainView.floatingOrigin.toCanonical(view.camera.position.x,view.camera.position.z),yaw:player.yaw,
          collision:status.collision.ready,scenery:this.readiness().scenery,
          missing:PerfCounters.get('meadowInViewMissingTiles')});
      }
    } finally { player.setHarnessKeys([]); }
    return {sequenceId,cameraMode,frames};
  }
  dispose() {this.disposed=true;this.editor.playerController.setHarnessKeys([]);this.setCaptureUi(false);}
}
