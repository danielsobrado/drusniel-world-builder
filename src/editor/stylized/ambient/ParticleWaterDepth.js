import {smoothstep} from 'three/tsl';

/** Optional shallow-water envelope: dry ground and deep water emit no spray. */
export function resolveParticleWaterDepth(value, base, path) {
  if (value === undefined) return null;
  if (!['sea','lake'].includes(base) || !Array.isArray(value) || value.length !== 4
      || value.some((v,i)=>!Number.isFinite(v)||v<0||v>100||(i>0&&v<=value[i-1]))) {
    throw new Error(`${path} requires four increasing depths in [0,100] and a sea or lake base.`);
  }
  return [...value];
}

export function particleWaterDepthMask(depth, envelope) {
  const [start,full,fade,end]=envelope;
  return smoothstep(start,full,depth).mul(smoothstep(fade,end,depth).oneMinus());
}

/** Reference for authored envelope acceptance; render fixtures exercise the node. */
export function particleWaterDepthWeight(depth, envelope) {
  if (!envelope) return 1;
  const smooth=(a,b)=>{const t=Math.min(1,Math.max(0,(depth-a)/(b-a)));return t*t*(3-2*t);};
  return smooth(envelope[0],envelope[1])*(1-smooth(envelope[2],envelope[3]));
}
