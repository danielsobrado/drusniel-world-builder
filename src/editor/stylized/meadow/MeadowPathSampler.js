import { createNaturalTrailSampler } from '../naturalTrailMath.js';

// Gods' End's vegetation policy clears half a metre beyond the path mask.
export const MEADOW_PATH_CLEARANCE_METERS = .5;
const DIAGONAL = Math.SQRT1_2;
const OFFSETS = [[1,0],[-1,0],[0,1],[0,-1],[DIAGONAL,DIAGONAL],[-DIAGONAL,DIAGONAL],[DIAGONAL,-DIAGONAL],[-DIAGONAL,-DIAGONAL]];
function answer(out,path,blocked) {out.path=path;out.blocked=blocked;return out;}
/** Shared near/card placement rule: discard path stems before publishing buffers. */
export function createMeadowPathSampler(pathConfig=null) {
  const trail=createNaturalTrailSampler(pathConfig?.naturalTrail??{});
  const threshold=trail.settings.clearThreshold;
  const {scale,warp,width,softness}=trail.settings;
  // Upper bound on |gradient(field)|, used only to skip distant clearance probes.
  const bound=scale*(.52*(1+.73*Math.abs(warp))+.33*.83*(1+.61*Math.abs(warp))+.15*.47*(2+1.34*Math.abs(warp)));
  const probeThresholdDistance=width+softness+bound*MEADOW_PATH_CLEARANCE_METERS;
  const signature=pathConfig?`paths1:${JSON.stringify({trail:trail.settings,clearance:MEADOW_PATH_CLEARANCE_METERS})}`:'';
  return {
    signature,
    sample(x,z,coverage,paintedMask=0,out={}) {
      if(paintedMask>=threshold)return answer(out,paintedMask,true);
      if(!trail.settings.enabled)return answer(out,paintedMask,false);
      // A Lipschitz bound skips probes outside the trail and clearance fringe.
      if(Math.abs(trail.fieldAt(x,z)-trail.settings.level)>probeThresholdDistance)return answer(out,paintedMask,false);
      const path=Math.max(paintedMask,trail.maskAt(x,z)*coverage);
      if(path>=threshold)return answer(out,path,true);
      if(coverage<threshold)return answer(out,path,false);
      for(const [dx,dz] of OFFSETS)if(trail.maskAt(x+dx*MEADOW_PATH_CLEARANCE_METERS,z+dz*MEADOW_PATH_CLEARANCE_METERS)*coverage>=threshold)return answer(out,path,true);
      return answer(out,path,false);
    },
  };
}
