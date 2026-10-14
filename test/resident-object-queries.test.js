import test from 'node:test';
import assert from 'node:assert/strict';
import { collectResidentObjects, residentObjectQueries, residentDescriptorSignature } from '../src/editor/world/residentObjectQueries.js';
const slot = (x,z) => ({ descriptor: { originCellX:x, originCellZ:z } });
test('distant and duplicate slots produce bounded, sorted distinct queries', () => {
  const queries = residentObjectQueries([slot(8000000,-3000000), slot(-8000000,3000000), slot(8000000,-3000000)], 64);
  assert.equal(queries.length,2);
  for (const b of queries) assert.equal((b.maxX-b.minX+1)*(b.maxZ-b.minZ+1),4096);
  assert.equal(queries[0].minZ,-3000000);
});
test('overlaps and selection are deduplicated and finite worlds retain their path', () => {
  const calls=[];
  const map={ queryBounds:b=>(calls.push(b),[{id:2},{id:1}]), getById:id=>({id}), list:()=>[{id:99}] };
  assert.deepEqual(collectResidentObjects({slots:[slot(-64,-64),slot(0,0)],chunkSize:64,objectMap:map,selectedObjectId:4}).map(o=>o.id),[1,2,4]);
  assert.equal(calls.length,2);
  assert.deepEqual(collectResidentObjects({slots:[],chunkSize:64,objectMap:map,selectedObjectId:4}),[{id:4}]);
  assert.deepEqual(collectResidentObjects({objectMap:map}),[{id:99}]);
  assert.notEqual(residentDescriptorSignature([slot(0,0)]),residentDescriptorSignature([slot(64,0)]));
});
