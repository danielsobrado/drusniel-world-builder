import assert from 'node:assert/strict';
import test from 'node:test';
import {Scene,Texture,TextureLoader,PerspectiveCamera} from 'three/webgpu';
import {vec3} from 'three/tsl';
import {load} from 'js-yaml';
import {readFileSync} from 'node:fs';
import {MeadowGrassField} from '../src/editor/stylized/meadow/MeadowGrassField.js';
import {GrassTuning} from '../src/editor/stylized/GrassTuning.js';
import {resolveMeadowGrassConfig} from '../src/editor/stylized/meadow/meadowGrassConfig.js';
const config=load(readFileSync(new URL('../editor.config.yaml',import.meta.url),'utf8')).stylizedSurface;
test('a following camera across a chunk edge still publishes grass, while superseded focus cannot advance',t=>{
 t.mock.method(TextureLoader.prototype,'load',()=>new Texture());
 const slot=cx=>({descriptor:{key:`${cx}:0`,chunkX:cx,chunkZ:0,originCellX:cx*8,originCellZ:0,centerWorldX:cx*16+8,centerWorldZ:-8},pageRevision:1,
  page:{tiles:new Uint8Array(64).fill(4),heights:new Float32Array(81),surfaceMaskPixels:Uint8Array.from({length:256},(_,i)=>i%4===1?255:0)}});
 const terrainView={slots:[slot(0),slot(1)],contentRevision:0,chunkWorldSize:16,focusChunk:{chunkX:1,chunkZ:0},
  floatingOrigin:{getState:()=>({x:0,z:0})},worldStore:{chunkSize:8,tileSize:2,generator:{toMetadata:()=>({seed:918273})}}};
 const settings=resolveMeadowGrassConfig({...config.grass.meadow,maxDistance:16,buildBudgetMs:20,far:{enabled:false},interaction:{enabled:false}});
 const field=new MeadowGrassField({scene:new Scene(),terrainView,config,settings,tuning:new GrassTuning(config),sunDirection:vec3(0,1,0)});
 const camera=new PerspectiveCamera(68,16/9,.1,1000);camera.position.set(15.5,1.7,-8);camera.lookAt(15.5,1.7,-20);camera.updateMatrixWorld();
 try {
  for(let i=0;i<20;i++){field.updateFrame(i*16,camera);field.prepareFrame();}
  assert.ok([...field.blades.tiles.values()].some(tile=>tile.centerX<16&&tile.output?.count>0),'camera-side grass publishes despite player focus being across the boundary');
  field.updateFrame(400,camera);terrainView.focusChunk.chunkX=2;
  const advance=t.mock.method(field.blades,'update');field.prepareFrame();assert.equal(advance.mock.callCount(),0,'a cut after layout blocks obsolete preparation');
 }finally{field.dispose();}
});
