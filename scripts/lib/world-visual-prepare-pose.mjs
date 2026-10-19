/** Prepare destination collision through the actual player before an aerial cut.
 * Free flight disables the player motor, so its last collision status otherwise
 * belongs to an old destination (or remains uninitialized in a fresh context).
 */
export async function prepareVisualPose(page,pose,{minimumMs=16000,timeoutMs=120000,onPhase=()=>{}}={}) {
  let groundPreparation=null;
  if(pose.mode==='fly') {
    const groundPose={...pose,mode:'player',heightAboveGround:1.7};
    onPhase('ground cut');
    await page.evaluate(p=>window.__worldVisualQa.cut(p),groundPose);
    onPhase('ground settle');
    groundPreparation=await page.evaluate(timeoutMs=>window.__worldVisualQa.settle({minimumMs:0,timeoutMs}),timeoutMs);
  }
  onPhase('camera cut');
  await page.evaluate(p=>window.__worldVisualQa.cut(p),pose);
  onPhase('camera settle');
  const readiness=await page.evaluate(options=>window.__worldVisualQa.settle(options),{minimumMs,timeoutMs});
  return {groundPreparation,readiness};
}
