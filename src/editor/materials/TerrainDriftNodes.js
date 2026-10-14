import { color, float, mix, oneMinus, max } from 'three/tsl';
import { blownStreaks } from '../stylized/ambient/BlownStreaks.js';
const clamp01 = value => Math.max(0, Math.min(1,value));
export function terrainDriftAlphas({ sandMask=0, snowMask=0, grass=0, snow=0, wetness=0, packing=0 }) {
  return {sand:clamp01(sandMask*(1-clamp01(grass))*(1-clamp01(snow))*(1-clamp01(wetness))**2)*.16,
    snow:clamp01(snowMask*clamp01(snow)*(1-clamp01(packing)))*.22};
}
/** Surface drift is bounded albedo. It never adds a light source or texture read. */
export function createTerrainDriftNodes({worldXZ,grassCoverage,snow=float(0),wetness=float(0),pathMask=float(0),pressed=float(0),settings}) {
  if(!settings?.enabled)return null;
  const sandMask=settings.sand ? blownStreaks({worldXZ,kind:'sand',
    weight:oneMinus(grassCoverage).mul(oneMinus(snow)).mul(oneMinus(wetness)),packing:wetness,settings}) : null;
  const snowMask=settings.snow ? blownStreaks({worldXZ,kind:'snow',weight:snow,packing:max(pathMask,pressed).clamp(0,1),settings}) : null;
  return {sandMask,snowMask,apply(base){
    const sandy=sandMask?mix(base,color(settings.sand.color),sandMask.mul(settings.sand.maxOpacity)):base;
    return snowMask?mix(sandy,color(settings.snow.color),snowMask.mul(settings.snow.maxOpacity)):sandy;
  }};
}
