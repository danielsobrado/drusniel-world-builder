import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import yaml from 'js-yaml';
import {ProceduralWorldGenerator} from '../src/editor/world/ProceduralWorldGenerator.js';
import {AzgaarMacroWorldGenerator} from '../src/editor/world/AzgaarMacroWorldGenerator.js';
import {importAzgaarFullJson} from '../src/editor/import/AzgaarJsonImporter.js';
const option=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback;
const folder=option('--baseline','docs/qa/world-visual-quality-2026-10-14/biomes/source-baseline');
const out=option('--out','tmp/world-visual-quality/after/biome-source-contracts.json');
const readJson=async f=>JSON.parse(await readFile(f,'utf8')),report={checks:[]};
try {
 const heights=await readJson(path.join(folder,'heights-4096.json'));
 for(const baseline of heights.results) {
  const generator=new ProceduralWorldGenerator({seed:baseline.seed});let baseMismatch=0,finalMismatch=0;
  for(const s of baseline.samples){if(generator.sampleBaseHeight(s.x,s.z)!==s.base)baseMismatch++;if(generator.sampleHeight(s.x,s.z)!==s.final)finalMismatch++;}
  report.checks.push({id:`heights-${baseline.seed}`,count:baseline.samples.length,baseMismatch,finalMismatch,version:generator.toMetadata().version,
   passed:baseline.samples.length===4096&&baseMismatch===0&&finalMismatch===0&&generator.toMetadata().version===1});
 }
 const baseline=await readJson(path.join(folder,'imported-ids-4096.json')),bytes=await readFile(baseline.map);
 if(createHash('sha256').update(bytes).digest('hex')!==baseline.mapSha256)throw new Error('Imported source map changed.');
 const config=yaml.load(await readFile('editor.config.yaml','utf8'));config.import.azgaarGuidance=yaml.load(await readFile('config/azgaar-guidance.yaml','utf8'));
 const document=importAzgaarFullJson(JSON.parse(bytes),config),generator=new AzgaarMacroWorldGenerator(document.world.baseTerrain,document.world.generator);
 const mismatches=baseline.samples.filter(s=>generator.sampleTile(s.x,s.z)!==s.tileId);
 report.checks.push({id:'imported-biome-ids',count:baseline.samples.length,mismatches:mismatches.length,passed:baseline.samples.length===4096&&mismatches.length===0});
 report.passed=report.checks.every(c=>c.passed);
}catch(error){report.passed=false;report.failure=error.stack;}
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
