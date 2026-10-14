import { hash32 } from '../scatterMath.js';
const unit=v=>Math.max(0,Math.min(1,v));
export function meadowCoverageRoll(x,z,worldSeed=0) {
 return hash32(Math.imul(Math.round(x*100),0x1f123bb5)^Math.imul(Math.round(z*100),0x5f356495)^worldSeed^1201)/4294967296;
}
export function acceptsMeadowHabitat(x,z,seed,coverage,density) {
 return meadowCoverageRoll(x,z,seed)<unit(coverage)*unit(density);
}
