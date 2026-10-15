import * as THREE from 'three/webgpu';
import {resolveSkyLook,overcastSkyLook} from '/src/editor/stylized/sky/SkyLook.js';
import {skyAmbientColor} from '/src/editor/stylized/sky/skyAmbient.js';
import {updateSkyLight,updateSnowLight} from '/src/editor/stylized/sky/skyLight.js';
import {syncFoliageLight} from '/src/editor/stylized/forest/foliageLight.js';
import {jungleMistUniforms} from '/src/editor/stylized/ambient/JungleMist.js';

export function applyFixtureLighting(raw,sun,fill,id='neutral') {
 if(id==='neutral')return {id,sunIntensity:sun.intensity,fillIntensity:fill.intensity};
 const presets={day:'highfield','low-sun':'emberfall',overcast:'highfield',night:'moonrise'};
 if(!presets[id])throw new Error(`Unknown fixture lighting: ${id}`);
 const base=resolveSkyLook(raw.sky,'configured'),look=overcastSkyLook(resolveSkyLook(raw.sky,presets[id]),id==='overcast'?.8:0);
 sun.color.set(look.directionalColor);sun.intensity=look.directionalIntensity;
 skyAmbientColor(look,fill.color);fill.groundColor.set(look.groundLightColor);fill.intensity=look.ambientIntensity;
 const el=THREE.MathUtils.degToRad(look.sunElevation),az=THREE.MathUtils.degToRad(look.sunAzimuth);
 sun.position.set(Math.cos(el)*Math.cos(az)*100,Math.sin(el)*100,Math.cos(el)*Math.sin(az)*100);sun.target?.updateMatrixWorld();
 syncFoliageLight({directional:sun,hemisphere:fill});updateSkyLight(look,base);updateSnowLight(look);
 jungleMistUniforms.sun.value.copy(sun.color).multiplyScalar(sun.intensity/Math.PI);
 jungleMistUniforms.fill.value.copy(fill.color).multiplyScalar(fill.intensity/Math.PI);
 return {id,preset:presets[id],look,sunIntensity:sun.intensity,fillIntensity:fill.intensity};
}
