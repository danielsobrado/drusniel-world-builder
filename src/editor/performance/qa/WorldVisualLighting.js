import {Color} from 'three/webgpu';
import {SKY_LOOK_COLORS,SKY_LOOK_NUMBERS} from '../../stylized/sky/SkyLook.js';

export function staticLightingComponents(editor) {
 const look=editor.skyLooks?.current;if(!look)throw new Error('No resolved static sky look.');
 const values=SKY_LOOK_NUMBERS.map(key=>look[key]);
 for(const key of SKY_LOOK_COLORS)new Color(look[key]).toArray(values,values.length);
 const sky=editor.stylizedSurface.skyView;
 for(const light of [sky?.directional,sky?.hemisphere])if(light){values.push(light.intensity);light.color.toArray(values,values.length);}
 const fog=editor.terrainView.scene.fog;
 if(fog){values.push(fog.density??fog.near,fog.far??0);fog.color.toArray(values,values.length);}
 if(values.some(v=>!Number.isFinite(v)))throw new Error('Nonfinite static lighting component.');
 return values;
}
export function staticLightingChange(a,b) {
 if(!a||a.length!==b.length)return Infinity;
 return Math.max(0,...b.map((v,i)=>Math.abs(v-a[i])));
}
