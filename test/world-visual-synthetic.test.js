import assert from 'node:assert/strict';
import test from 'node:test';
import {createVisualSyntheticDocument,selectVisualSyntheticRoute,VISUAL_SYNTHETIC} from '../src/editor/performance/qa/WorldVisualSynthetic.js';
import {InfiniteWorldStore} from '../src/editor/world/InfiniteWorldStore.js';

test('synthetic fixture is a bounded 256 m authored grass/forest world with exact flat heights',()=>{
 const store=new InfiniteWorldStore({chunkSize:64,tileSize:2}),original={...store.toDocument(),objects:[]};
 const document=createVisualSyntheticDocument(original);store.loadDocument(document);
 const {centerX,centerZ,sideMeters,height}=VISUAL_SYNTHETIC;
 assert.equal(store.tileOverrides.size,(sideMeters/2)**2);assert.equal(store.heightOverrides.size,(sideMeters/2+1)**2);
 for(let z=centerZ-128;z<=centerZ+128;z+=2)for(let x=centerX-128;x<=centerX+128;x+=2)assert.equal(store.getHeight(x/2,-z/2),height);
 assert.equal(store.getTile((centerX-64)/2,-centerZ/2),4);assert.equal(store.getTile((centerX+64)/2,-centerZ/2),6);
 assert.deepEqual(document.world.generator,original.world.generator);assert.equal(original.chunks.length,0);
});
test('synthetic corridor selection checks production collision readiness and rejects occupied lanes',()=>{
 const seen=[],editor={playerController:{config:{walkSpeed:9,runMultiplier:1.8},collisionRuntime:{
  checkMovementReadiness:()=>({ready:true}),querySweptCapsule:query=>{seen.push(query);return seen.length===1?[{sourceId:'rock'}]:[];}}}};
 const route=selectVisualSyntheticRoute(editor);
 assert.equal(route.startPose.x,VISUAL_SYNTHETIC.centerX-110);assert.equal(route.attempts.length,2);
 assert.equal(route.length,100.8);assert.equal(seen[1].radius,1);
 assert.ok(Math.abs(seen[1].start.z-seen[1].end.z-102.8)<1e-9);
 editor.playerController.collisionRuntime.checkMovementReadiness=()=>({ready:false});
 assert.throws(()=>selectVisualSyntheticRoute(editor),/No unobstructed/);
});
