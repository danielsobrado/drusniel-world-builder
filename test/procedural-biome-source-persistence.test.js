import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createAzgaarBiomeDefinitions} from '../src/editor/AzgaarBiomeCatalog.js';
import {createMacroAtlasPayload} from '../src/editor/import/AzgaarMacroWorldSource.js';
import {InfiniteWorldStore} from '../src/editor/world/InfiniteWorldStore.js';
import {AzgaarMacroWorldGenerator} from '../src/editor/world/AzgaarMacroWorldGenerator.js';
const ids=[...Array(13).keys(),32];
function source() {
 const names=Array(14).fill(null);names[13]='Moonlit moor';
 return {kind:'azgaar-macro-v1',version:1,source:{mapId:'classification-contract'},
  atlas:{width:14,height:1,...createMacroAtlasPayload({heights:Uint8Array.from(ids,id=>id===0?0:40),biomes:Uint8Array.from(ids,id=>id===32?13:id),features:Uint16Array.from(ids,id=>id===0?2:1)})},
  physical:{widthMeters:28,heightMeters:2,distanceScale:1,distanceUnit:'km'},
  bounds:{minCellX:0,minCellZ:0,widthCells:14,heightCells:1},oceanTransitionCells:4,
  terrain:{minHeight:-16,maxHeight:48,seaLevel:-1.5},biomes:createAzgaarBiomeDefinitions({name:names},[13]),rivers:[]};
}
test('all standard imported terrain IDs and custom 32 retain their source identities',()=>{
 const generator=new AzgaarMacroWorldGenerator(source(),{seed:918273,version:1,heightScale:24,seaLevel:-1.5});
 for(const [x,id]of ids.entries())assert.equal(generator.sampleTile(x,0),id);
});
test('custom definitions and explicit edits survive save/load across the old glacier pose',()=>{
 const pose=JSON.parse(readFileSync(new URL('../docs/qa/visual-audit-2026-10-13/procedural-captures.json',import.meta.url))).shots[10];
 const x=Math.floor(pose.x/2),z=Math.floor(-pose.z/2),world=new InfiniteWorldStore({chunkSize:8,tileSize:2});world.setBaseTerrain(source());
 for(const [offset,id]of [[0,32],[1,1],[2,10]]){world.setTile(x+offset,z,id);world.setHeight(x+offset,z,12.25+offset);}
 const document=JSON.parse(JSON.stringify(world.toDocument())),loaded=new InfiniteWorldStore({chunkSize:8,tileSize:2});loaded.loadDocument(document);
 assert.equal(document.version,6);assert.equal(document.world.generator.version,1);
 assert.deepEqual(loaded.baseTerrain.biomes,world.baseTerrain.biomes);
 assert.equal(loaded.baseTerrain.biomes.find(b=>b.tileId===32).name,'Moonlit moor');
 for(const [offset,id]of [[0,32],[1,1],[2,10]]){assert.equal(loaded.getTile(x+offset,z),id);assert.equal(loaded.getHeight(x+offset,z),12.25+offset);}
});
