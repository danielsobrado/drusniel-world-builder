import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import yaml from 'js-yaml';
import {ProceduralWorldGenerator} from '../src/editor/world/ProceduralWorldGenerator.js';
import {AzgaarMacroWorldGenerator} from '../src/editor/world/AzgaarMacroWorldGenerator.js';
import {importAzgaarFullJson} from '../src/editor/import/AzgaarJsonImporter.js';
import {originalVisualPoses} from './lib/world-visual-poses.mjs';
import {repositoryState,fileHash} from './lib/world-visual-report.mjs';
const root=new URL('../',import.meta.url),state=repositoryState(fileURLToPath(root));
if(state.dirtyFiles.length)throw new Error('Commit sources before freezing the shore manifest.');
const config=yaml.load(await readFile(new URL('editor.config.yaml',root),'utf8'));
config.import.azgaarGuidance=yaml.load(await readFile(new URL('config/azgaar-guidance.yaml',root),'utf8'));
const map='maps/Eldara Full 2026-07-23-20-37.json';
const document=importAzgaarFullJson(JSON.parse(await readFile(new URL(map,root),'utf8')),config);
const imported=new AzgaarMacroWorldGenerator(document.world.baseTerrain,document.world.generator);
const procedural=new ProceduralWorldGenerator({seed:config.world.seed,version:config.world.generatorVersion,heightScale:config.world.heightScale,seaLevel:config.world.seaLevel,waterDomain:config.waterDomain});
function offsets(radius) {
 const cells=radius/8,points=[];
 for(let z=-cells;z<=cells;z++)for(let x=-cells;x<=cells;x++)if(x*x+z*z<=cells*cells)points.push({x:x*8,z:z*8,distanceSquared:(x*x+z*z)*64});
 return points.sort((a,b)=>a.distanceSquared-b.distanceSquared||a.z-b.z||a.x-b.x);
}
const shoreOffsets=offsets(1024),coastOffsets=offsets(4096),nearOffsets=offsets(32);
const water=(g,x,z)=>g.sampleWater(x/2,-z/2);
const tile=(g,x,z)=>g.sampleTile(Math.floor(x/2),Math.floor(-z/2));
function target(g,pose,grid=shoreOffsets) {
 for(const offset of grid) {
  const x=pose.x+offset.x,z=pose.z+offset.z,sample=water(g,x,z);
  if(sample.depth>=.5)return {x,z,depth:sample.depth,distanceSquared:offset.distanceSquared};
 }
 return null;
}
const aim=(pose,to)=>to?Math.atan2(pose.x-to.x,pose.z-to.z):pose.yaw;
const base=[['forest',6,-7134127,1081563],['taiga',9,-982683,371387],['tundra',10,-4995717,970835],['glacier',11,-2747061,316061],['wetland',12,993673,1701497]];
const importedPoses=[];
for(const [name,expectedBiomeId,x,z] of base) {
 if(tile(imported,x,z)!==expectedBiomeId)throw new Error(`Imported ${name} expected ${expectedBiomeId}, got ${tile(imported,x,z)}.`);
 const pose={id:`eldara-${name}`,expectedBiomeId,x,z,yaw:0,pitch:-.08,mode:'player',heightAboveGround:1.7};
 importedPoses.push(pose,{...pose,id:`${pose.id}-reverse`,yaw:Math.PI},{...pose,id:`${pose.id}-overview`,mode:'fly',heightAboveGround:80,pitch:-.45,fov:60});
}
const original=await originalVisualPoses(root),shorePoses=[];
for(const [g,pose] of [[procedural,original[4]],[procedural,original[11]],[imported,importedPoses.find(p=>p.id==='eldara-wetland')]]) {
 const to=target(g,pose);
 shorePoses.push({...pose,id:`${pose.id}-shore`,world:g===imported?'eldara':'procedural',expectedBiomeId:tile(g,pose.x,pose.z),shoreTarget:to,yaw:aim(pose,to)});
}
const start={x:-1893,z:1803};let marine=null;
for(const offset of coastOffsets) {
 const x=start.x+offset.x,z=start.z+offset.z;
 if(tile(procedural,x,z)===0||water(procedural,x,z).depth>0)continue;
 const to=target(procedural,{x,z},nearOffsets);
 if(to){marine={id:'marine-coast',x,z,yaw:aim({x,z},to),pitch:-.08,mode:'player',heightAboveGround:1.7,expectedBiomeId:tile(procedural,x,z),shoreTarget:to};break;}
}
if(!marine)throw new Error('No dry marine point within 4096 m and water within 32 m.');
const manifest={schemaVersion:1,selectionSourceSha:state.sourceSha,configSha256:await fileHash(new URL('editor.config.yaml',root)),map,mapSha256:await fileHash(new URL(map,root)),
 gridMeters:8,tieBreak:['distanceSquared','z','x'],imported:importedPoses,shore:shorePoses,marine:[marine,{...marine,id:'marine-coast-overview',mode:'fly',heightAboveGround:30,pitch:-.45,fov:60}]};
await writeFile(new URL('docs/qa/world-visual-quality-2026-10-14/biomes/shore-review-poses.json',root),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({imported:importedPoses.length,shore:shorePoses,marine},null,2));
