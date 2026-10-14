import test from 'node:test';import assert from 'node:assert/strict';
import { validateVisualReport } from '../scripts/lib/world-visual-report.mjs';
test('missing artifacts, unresolved queues and errors cannot pass',async()=>{
 const report={poses:[{id:'one',readiness:{ready:false}}],errors:{count:1},artifacts:[{path:'missing.png',sha256:'bad'}]};
 const result=await validateVisualReport(report,new URL('../tmp/',import.meta.url));assert.equal(result.passed,false);assert.equal(result.failures.length,4);
});
test('empty reports and undeclared captures fail',async()=>{
 assert.equal((await validateVisualReport({},new URL('../',import.meta.url))).passed,false);
 assert.equal((await validateVisualReport({poses:[{id:'one',readiness:{ready:true}}]},new URL('../',import.meta.url))).passed,false);
});
