export { meadowCoverageRoll, acceptsMeadowHabitat } from './meadowHabitat.js';
const unit=v=>Math.max(0,Math.min(1,v));
const smooth=(a,b,v)=>{const t=unit((v-a)/(b-a));return t*t*(3-2*t);};
/** CPU twin of the existing meadow gradient noise; coordinates are pre-scaled. */
export function meadowNoiseNumber(x,z) {
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
  const fade=t=>t*t*(3-2*t);
  const gradient=(dx,dz)=>{
    const s=Math.sin((ix+dx)*.1+(iz+dz)*.7)*43758.5453;
    const angle=(s-Math.floor(s))*Math.PI*2;
    return Math.cos(angle)*(fx-dx)+Math.sin(angle)*(fz-dz);
  };
  const north=gradient(0,0)+(gradient(1,0)-gradient(0,0))*fade(fx);
  const south=gradient(0,1)+(gradient(1,1)-gradient(0,1))*fade(fx);
  return north+(south-north)*fade(fz)+.5;
}
export function meadowGrowthHeight(profile,x,z,cards=false) {
  const tall=smooth(.55,.75,unit(meadowNoiseNumber(x/profile.patchMeters,z/profile.patchMeters)));
  return (profile.shortHeight+(profile.tallHeight-profile.shortHeight)*tall)*(cards?1.125:1);
}
