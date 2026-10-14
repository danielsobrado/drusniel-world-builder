import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import yaml from 'js-yaml';
import {ProceduralWorldGenerator} from '../src/editor/world/ProceduralWorldGenerator.js';
import {originalVisualPoses,selectAdditionalPoses} from './lib/world-visual-poses.mjs';
import {repositoryState,fileHash} from './lib/world-visual-report.mjs';
const root=new URL('../',import.meta.url),repo=fileURLToPath(root),state=repositoryState(repo);
if(state.dirtyFiles.length)throw new Error('Freeze the biome review manifest from committed sources.');
const config=yaml.load(await readFile(new URL('editor.config.yaml',root),'utf8'));
const generator=new ProceduralWorldGenerator({seed:config.world.seed,version:config.world.generatorVersion,
 heightScale:config.world.heightScale,seaLevel:config.world.seaLevel});
const sampleTile=generator.sampleTile.bind(generator);
const label=p=>({...p,expectedBiomeId:sampleTile(Math.floor(p.x/2),Math.floor(-p.z/2))});
const original=(await originalVisualPoses(root)).map(label);
const selection=selectAdditionalPoses({sampleTile,original,seed:20261014,maxCandidates:1000000});
const manifest={schemaVersion:1,selectionSourceSha:state.sourceSha,configSha256:await fileHash(new URL('editor.config.yaml',root)),
 seed:selection.seed,sampledCandidates:selection.sampled,generator:generator.toMetadata(),original,additional:selection.poses.map(label)};
const destination=path.join(repo,'docs/qa/world-visual-quality-2026-10-14/biomes/procedural-review-poses.json');
await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({destination,source:state.sourceSha,additional:manifest.additional.length,sampled:selection.sampled}));
