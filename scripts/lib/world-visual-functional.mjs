export async function observeVisualAudio(context) {
 await context.addInitScript(()=>{
  localStorage.setItem('drusniel_audio_enabled','false');window.__visualAudioContexts=[];
  const Original=window.AudioContext;
  if(!Original)return;
  const Observed=new Proxy(Original,{construct(target,args,newTarget){const instance=Reflect.construct(target,args,newTarget);window.__visualAudioContexts.push(instance);return instance;}});
  window.AudioContext=Observed;if(window.webkitAudioContext===Original)window.webkitAudioContext=Observed;
 });
}
export async function beginVisualFunctionalCheck(page) {
 // A real, nonmoving key gesture initializes the existing lazy audio context.
 await page.keyboard.press('Shift');
 return page.evaluate(()=>{
  const e=window.__editor;window.__visualFunctionalOwners={controller:e.worldSoundscape,soundscape:e.worldSoundscape.soundscape,wind:e.worldWind};
  return {contexts:window.__visualAudioContexts.length,enabled:e.worldSoundscape.audioBus.synthManager.isEnabled(),storedEnabled:localStorage.getItem('drusniel_audio_enabled'),windTime:e.worldWind.time};
 });
}
export async function finishVisualFunctionalCheck(page,before) {
 const after=await page.evaluate(()=>{
  const e=window.__editor,owners=window.__visualFunctionalOwners,camera=e.viewModeController.camera;
  return {contexts:window.__visualAudioContexts.length,enabled:e.worldSoundscape.audioBus.synthManager.isEnabled(),storedEnabled:localStorage.getItem('drusniel_audio_enabled'),
   sameController:owners.controller===e.worldSoundscape&&owners.soundscape===e.worldSoundscape.soundscape,sameWind:owners.wind===e.worldWind,
   windTime:e.worldWind.time,wind:e.worldWind.sample(camera.position.x,camera.position.z),ambienceWeights:e.worldSoundscape.weights,
   listeningQualityAutomaticallyGraded:false};
 });
 const finite=value=>typeof value==='number'?Number.isFinite(value):value&&typeof value==='object'?Object.values(value).every(finite):true;
 return {before,after,checks:[
  {id:'one existing audio context and ambience owner',passed:before.contexts===1&&after.contexts===before.contexts&&after.sameController},
  {id:'existing mute state retained',passed:before.enabled===false&&after.enabled===false&&before.storedEnabled===after.storedEnabled},
  {id:'wind and ambience continue with finite state',passed:after.sameWind&&after.windTime>before.windTime&&finite(after.wind)&&after.ambienceWeights!==null&&finite(after.ambienceWeights)},
 ]};
}
