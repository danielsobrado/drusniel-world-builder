export const TERRAIN_MATERIAL_RECIPE_REVISION = 6;
function canonical(value) {
 if(Array.isArray(value))return value.map(canonical);
 if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
/** Includes every material setting and biome pigment, without changing source terrain. */
export function terrainMaterialRecipeFingerprint(config,style={}) {
 const data=JSON.stringify(canonical({revision:TERRAIN_MATERIAL_RECIPE_REVISION,classification:2,coverage:2,config,style}));
 let hash=2166136261;
 for(let i=0;i<data.length;i++)hash=Math.imul(hash^data.charCodeAt(i),16777619);
 return `r${TERRAIN_MATERIAL_RECIPE_REVISION}-${(hash>>>0).toString(16)}`;
}
