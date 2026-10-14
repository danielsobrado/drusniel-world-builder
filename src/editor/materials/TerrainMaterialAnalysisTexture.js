import * as THREE from 'three/webgpu';
import { vec4 } from 'three/tsl';

/** Two logical RG bake channels share one RGBA8 GPU allocation, without changing either CPU channel. */
export function createTerrainMaterialAnalysisTexture(resolution) {
  const map=new THREE.DataTexture(new Uint8Array(resolution*resolution*4),resolution,resolution,THREE.RGBAFormat);
  map.name='terrain-wetness-shoreline-canopy-water';
  map.minFilter=map.magFilter=THREE.NearestFilter;
  map.colorSpace=THREE.NoColorSpace;map.generateMipmaps=false;map.unpackAlignment=1;map.needsUpdate=true;
  return map;
}

export function writeTerrainMaterialAnalysisTexture(map,wetnessShoreline,canopyWater) {
  const data=map.image.data;
  if(wetnessShoreline.length*2!==data.length || canopyWater.length!==wetnessShoreline.length) {
    throw new Error('Terrain analysis texture requires matching logical RG channels.');
  }
  for(let source=0,target=0;source<wetnessShoreline.length;source+=2,target+=4) {
    data[target]=wetnessShoreline[source];data[target+1]=wetnessShoreline[source+1];
    data[target+2]=canopyWater[source];data[target+3]=canopyWater[source+1];
  }
  map.needsUpdate=true;return data.byteLength;
}

/** Restore the original RG texture semantics before any material consumer reads a channel. */
export function terrainMaterialAnalysisChannels(sample,name) {
  if(name==='canopyWater')return vec4(sample.z,sample.w,0,1);
  if(name==='wetnessShoreline')return vec4(sample.x,sample.y,0,1);
  return sample;
}
