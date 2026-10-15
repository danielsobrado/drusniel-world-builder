export const MEADOW_MAX_BODY_BEND = 80 * Math.PI / 180;
const unit = v => Math.max(0,Math.min(1,v));
export function meadowInteractionArc({press,vertexHeight,bladeHeight}) {
  const h=Math.max(0,bladeHeight),r=unit(vertexHeight/Math.max(h,1e-5)),a=unit(press)*MEADOW_MAX_BODY_BEND;
  return a<1e-4 ? {horizontal:0,vertical:h*r} :
    {horizontal:h*(1-Math.cos(a*r))/a,vertical:Math.max(0,Math.min(h,h*Math.sin(a*r)/a))};
}
export function meadowPressRecoveryFactor(dtSeconds,recoverySpeed=.94) {
  return Math.pow(recoverySpeed,Math.max(0,Math.min(.1,Number.isFinite(dtSeconds)?dtSeconds:0))*60);
}
