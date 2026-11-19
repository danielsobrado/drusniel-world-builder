import { mix, smoothstep } from 'three/tsl';
import { stormSnowCoverUniform } from '../../weather/storm/stormGroundUniforms.js';
import { meadowGroundStyle } from './meadowGroundStyle.js';
import { meadowMicrohabitatNodes, meadowMicrohabitatShare } from './meadowMicrohabitat.js';
import { meadowNoise } from './meadowNoise.js';
import { meadowStandNodes } from './meadowStandNodes.js';
import { meadowPlantNodes } from './meadowPlantNodes.js';
import { MEADOW_CARD_HEIGHT_CONTRAST, MEADOW_GAP_RAMP, MEADOW_SHORT_FLOOR, MEADOW_SHORT_STAND, MEADOW_TALL_RAMP, MEADOW_TALL_TUFT_RELIEF } from './meadowTuftField.js';
import { meadowTuftNodes } from './meadowTuftNodes.js';
/** 1 in a short stand, 0 in a sward tall enough to shade its own roots. */
export function meadowShortStand(tallHeight) {
  return smoothstep(MEADOW_SHORT_STAND[0],MEADOW_SHORT_STAND[1],tallHeight).oneMinus();
}
/** Combine patch, tuft, species and microhabitat responses within the stand envelope. */
export function meadowGrowthNodes(uniforms,instance,cards=false) {
  const dimensions=uniforms.growth.dimensions.element(instance.growth.toInt());
  const noise=meadowNoise(instance.canonical.div(dimensions.w)).clamp(0,1);
  const tuft=meadowTuftNodes(instance.canonical);
  const ramp=smoothstep(MEADOW_TALL_RAMP[0],MEADOW_TALL_RAMP[1],noise).toVar();
  const weight=uniforms.tufts.height.mul(ramp.mul(-MEADOW_TALL_TUFT_RELIEF).add(1));
  const stemShare=mix(ramp,tuft.occupancy,weight).clamp(0,1);
  const area=uniforms.groundStyle
    ? meadowGroundStyle(instance.canonical,uniforms.groundStyle.mul(uniforms.growth.areaStyle.element(instance.growth.toInt())))
    : null;
  const micro=meadowMicrohabitatNodes(
    area,uniforms.growth.accents.element(instance.growth.toInt().add(48)),
  );
  const plant=meadowPlantNodes(uniforms,instance,micro);
  // Accent reeds and broad leaves retain their shape even inside grass tufts.
  const moundStrength=plant.shape.lessThan(.5).select(uniforms.tufts.moundHeight,0);
  const crowned=stemShare.add(stemShare.oneMinus().mul(tuft.crown).mul(moundStrength)).clamp(0,1);
  const microShare=meadowMicrohabitatShare(crowned,micro);
  const share=cards?microShare.sub(.5).mul(MEADOW_CARD_HEIGHT_CONTRAST).add(.5):microShare;
  const response=uniforms.growth.density.element(instance.growth.toInt());
  const species=cards?null:meadowStandNodes(
    instance.canonical,instance.rank,uniforms.growth.accents.element(instance.growth.toInt().add(32)),
  );
  const stand=cards?1.125:species.height;
  const areaHeight=area?.height??1;
  // A short stand gathers into plants: stragglers between tufts drop out rather
  // than standing as an even speckle of spikes over bare ground.
  const gap=cards?1:mix(1,smoothstep(MEADOW_GAP_RAMP[0],MEADOW_GAP_RAMP[1],tuft.occupancy),uniforms.tufts.gapCut.mul(meadowShortStand(dimensions.y)));
  // Storm snow (SnowCover) weighs a stand down, as biome frost does (applyBiomeLooks SNOW_FLATTEN).
  const stormSettle=stormSnowCoverUniform.mul(-.4).add(1);
  return {height:mix(dimensions.x.mul(MEADOW_SHORT_FLOOR),dimensions.y,share).mul(stand).mul(areaHeight).mul(gap).mul(stormSettle),
    tallHeight:dimensions.y,tuft,micro,plant,
    width:dimensions.z.mul(micro.width),density:response.x,wind:response.y.mul(micro.wind),rest:response.z,curve:response.w,
    speciesWidth:cards?1:species.width,speciesRest:cards?1:species.rest,speciesCurve:cards?1:species.curve};
}
