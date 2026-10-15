import assert from 'node:assert/strict';
import test from 'node:test';
import { MeadowInteractionMap } from '../src/editor/stylized/meadow/MeadowInteractionMap.js';

function texelAt(map, x, z) {
  const px = Math.floor(((x - map.center.x) / map.worldSize + 0.5) * map.resolution);
  const py = Math.floor(((z - map.center.y) / map.worldSize + 0.5) * map.resolution);
  return map.pixels[(py * map.resolution + px) * 4];
}

test('pressDisc flattens a plateau that fades to the rim and recovers', () => {
  const map = new MeadowInteractionMap({ getHeight: () => 0 });
  map.pressDisc(2, -1, 4, 1, 0.5);
  assert.equal(texelAt(map, 2, -1), 255);
  assert.ok(texelAt(map, 2 + 1.5, -1) > 240, 'plateau inside the inner fraction');
  assert.ok(texelAt(map, 2 + 3.6, -1) < 80, 'fades toward the rim');
  assert.equal(texelAt(map, 2 + 4.5, -1), 0);
  assert.ok(map.texture.needsUpdate !== false);
  map.update(null);
  assert.ok(texelAt(map, 2, -1) < 255, 'the grass starts standing back up');
});

test('pressDisc ignores discs off the window and empty strength', () => {
  const map = new MeadowInteractionMap({ getHeight: () => 0 });
  map.pressDisc(500, 500, 3, 1);
  map.pressDisc(0, 0, 3, 0);
  assert.equal(map.peak, 0);
});

test('30, 60 and 144 Hz recovery agree within one byte after equal elapsed time',()=>{
 const maps=[30,60,144].map(hz=>{
  const map=new MeadowInteractionMap({resolution:32,worldSize:8});
  map.pressDisc(0,0,2,1);for(let i=0;i<hz;i++)map.update(null,{dtSeconds:1/hz});return map;
 });
 try {
  for(let i=0;i<maps[0].pixels.length;i+=4) {
   const values=maps.map(m=>m.pixels[i]);assert.ok(Math.max(...values)-Math.min(...values)<=1);
  }
  for(const map of maps)assert.ok(map.peak/255<.03);
 }finally{maps.forEach(m=>m.dispose());}
});

test('scroll preserves float press and mark channels; cut clear removes only transient press',()=>{
 const map=new MeadowInteractionMap({resolution:32,worldSize:8});
 try {
  map.pressDisc(0,0,2,.73123);map.markDisc(0,0,2,3,.8);
  const old=map.press.slice(),oldPixels=map.pixels.slice();
  map.scroll(.5,0);
  for(let y=0;y<32;y++)for(let x=0;x<30;x++) {
   assert.equal(map.press[y*32+x],old[y*32+x+2]);
   assert.equal(map.pixels[(y*32+x)*4+1],oldPixels[(y*32+x+2)*4+1]);
  }
  const marks=Array.from(map.pixels).filter((_,i)=>i%4===1||i%4===2);
  map.shiftOrigin(8000000,-8000000);const values=map.press.slice();map.shiftOrigin(-8000000,8000000);assert.deepEqual(map.press,values);
  map.clearPress();assert.ok(map.press.every(v=>v===0));assert.ok(map.pressScratch.every(v=>v===0));assert.equal(map.peak,0);
  assert.deepEqual(Array.from(map.pixels).filter((_,i)=>i%4===1||i%4===2),marks);
 }finally{map.dispose();}
});
