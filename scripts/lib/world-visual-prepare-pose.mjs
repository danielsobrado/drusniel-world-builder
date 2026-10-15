/** Prepare destination collision through the actual player before an aerial cut.
 * Free flight disables the player motor, so its last collision status otherwise
 * belongs to an old destination (or remains uninitialized in a fresh context).
 */
export async function prepareVisualPose(page,pose,{minimumMs=16000}={}) {
  let groundPreparation=null;
  if(pose.mode==='fly') {
    const groundPose={...pose,mode:'player',heightAboveGround:1.7};
    await page.evaluate(p=>window.__worldVisualQa.cut(p),groundPose);
    groundPreparation=await page.evaluate(()=>window.__worldVisualQa.settle({minimumMs:0}));
  }
  await page.evaluate(p=>window.__worldVisualQa.cut(p),pose);
  const readiness=await page.evaluate(minimumMs=>window.__worldVisualQa.settle({minimumMs}),minimumMs);
  return {groundPreparation,readiness};
}
