import test from 'node:test';import assert from 'node:assert/strict';
import {classifyProceduralBiome} from '../src/editor/world/proceduralBiomeClassification.js';
const base={height:20,temperature:-.71,moisture:0,heightScale:24,seaLevel:-1.5};
test('glaciers require cold humid elevated climate with strict boundaries',()=>{
 assert.equal(classifyProceduralBiome(base),11);
 for(const patch of [{temperature:-.7000001},{moisture:-.1499999},{height:24*.55+.000001}])assert.equal(classifyProceduralBiome({...base,...patch}),11);
 for(const patch of [{temperature:-.70},{moisture:-.15},{height:24*.55},{height:-1.5}])assert.notEqual(classifyProceduralBiome({...base,...patch}),11);
 assert.equal(classifyProceduralBiome({...base,height:-1.5}),0);
 assert.equal(classifyProceduralBiome({...base,heightScale:240,height:132.001}),11);
 assert.notEqual(classifyProceduralBiome({...base,heightScale:240,height:132}),11);
 for(const temperature of [0,.25,.7])assert.notEqual(classifyProceduralBiome({...base,temperature,height:1000}),11);
});
