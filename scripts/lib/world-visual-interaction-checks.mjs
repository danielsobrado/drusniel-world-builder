export async function inspectWorldMeadow(page) {
 return page.evaluate(async()=>{
  const {sampleSurfaceMaskChannel}=await import('/src/editor/world/SurfaceMaskSampling.js');
  const {meadowGrowthHeight}=await import('/src/editor/stylized/meadow/meadowGrowthMath.js');
  const e=window.__editor,field=e.stylizedSurface.meadowGrass,ground=field.ground,origin=e.terrainView.floatingOrigin;
  const camera=origin.toCanonical(e.playerController.state.x,e.playerController.state.z),rows=new Map(),strengths=[],coverage=[],heights=[];
  let roots=0;
  for(const tile of field.blades.tiles.values()) {
   const out=tile.output;if(!out)continue;
   for(let i=0;i<out.count;i++) {
    const x=tile.centerX+out.position[i*4],z=tile.centerZ+out.position[i*4+2];
    if(Math.hypot(x-camera.x,z-camera.z)>12)continue;
    const slot=ground.slotFor(...ground.chunkOf(x,z));if(!slot)throw new Error('Meadow inspection has an unpublished terrain slot.');
    const lx=x/ground.tileSize-slot.descriptor.originCellX,lz=-z/ground.tileSize-slot.descriptor.originCellZ;
    const id=slot.page.tiles[Math.floor(lz)*ground.chunkSize+Math.floor(lx)],profile=ground.growth.profiles[ground.growth.table[id]];
    rows.set(id,{biomeId:id,profile,roots:(rows.get(id)?.roots??0)+1});roots++;
    strengths.push(out.position[i*4+3]);coverage.push(sampleSurfaceMaskChannel(slot.page.surfaceMaskPixels,ground.chunkSize,ground.chunkSize,lx,lz,1));
    heights.push(meadowGrowthHeight(profile,x,z));
   }
  }
  const range=a=>{a.sort((x,y)=>x-y);return {min:a[0]??null,median:a[Math.floor(a.length/2)]??null,max:a.at(-1)??null};};
  let floatPeak=0;for(const v of field.interaction.press)floatPeak=Math.max(floatPeak,v);
  return {roots,profiles:[...rows.values()],publishedStrength:range(strengths),habitatCoverage:range(coverage),
   unpressedCpuProfileHeight:range(heights),heightMeasurement:'production CPU patch reference; published coverage strength is reported separately',
   press:{bytePeak:field.interaction.peak,floatPeak,normalized:floatPeak/255,markPeak:field.interaction.markPeak},
   canonical:camera,readiness:window.__worldVisualQa.readiness()};
 });
}
export async function prepareClearedInteraction(page) {
 await page.evaluate(async()=>{
  const field=window.__editor.stylizedSurface.meadowGrass,map=field.interaction;
  window.__visualInteractionOriginal={strength:map.strength,recoverySpeed:map.recoverySpeed};map.strength=0;map.clearPress();
  for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);
 });
}
export async function stampInteraction(page) {
 return page.evaluate(async()=>{
  const e=window.__editor,field=e.stylizedSurface.meadowGrass,map=field.interaction,p=e.playerController;
  const x=p.state.x-Math.sin(p.yaw)*3,z=p.state.z-Math.cos(p.yaw)*3,y=map.getHeight(x,z);
  map.recoverySpeed=1;map.paintSphere(x,y,z,map.bodyRadius,1);map.texture.needsUpdate=true;
  for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);
  return {render:{x,y,z},canonical:e.terrainView.floatingOrigin.toCanonical(x,z),radius:map.bodyRadius,strength:1};
 });
}
export async function recoverInteraction(page) {
 return page.evaluate(async()=>{
  const field=window.__editor.stylizedSurface.meadowGrass,map=field.interaction;
  map.recoverySpeed=window.__visualInteractionOriginal.recoverySpeed;
  let previous=field.lastInteractionTime,elapsed=0,frames=0;
  while(elapsed<1) {
   await new Promise(requestAnimationFrame);const current=field.lastInteractionTime;
   elapsed+=Math.min(.1,Math.max(0,(current-previous)/1000));previous=current;frames++;
   if(frames>2000)throw new Error('Interaction recovery did not advance.');
  }
  map.recoverySpeed=1;return {elapsedSimulationSeconds:elapsed,frames};
 });
}
export async function restoreInteraction(page) {
 await page.evaluate(()=>{
  const map=window.__editor?.stylizedSurface.meadowGrass?.interaction,original=window.__visualInteractionOriginal;
  if(map&&original){map.strength=original.strength;map.recoverySpeed=original.recoverySpeed;}delete window.__visualInteractionOriginal;
 });
}
