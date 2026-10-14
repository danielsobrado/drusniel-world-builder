import { readFile } from 'node:fs/promises';
export async function originalVisualPoses(root) {
  const data=JSON.parse(await readFile(new URL('docs/qa/visual-audit-2026-10-13/procedural-captures.json',root),'utf8'));
  return data.shots.map(p=>({id:`original-${String(p.id).padStart(2,'0')}`,historicalBiomeId:p.id,x:p.x,z:p.z,yaw:p.yaw,pitch:p.pitch,mode:'player'}));
}
export function selectAdditionalPoses({sampleTile,original=[],seed=20261014,maxCandidates=1000000}) {
  let state=seed>>>0;const next=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const selected=Array.from({length:13},()=>[]),required=new Map();
  for(let id=1;id<=12;id++) {
    selected[id]=original.filter(p=>sampleTile(Math.floor(p.x/2),Math.floor(-p.z/2))===id);
    required.set(id,Math.max(0,3-selected[id].length));
  }
  const poses=[];let sampled=0;
  while([...required.values()].some(n=>n>0)&&sampled<maxCandidates) {
    sampled++;const cx=Math.floor(next()*16000)-8000,cz=Math.floor(next()*16000)-8000,id=sampleTile(cx,cz);
    if(!required.get(id))continue;
    const x=(cx+.5)*2,z=-(cz+.5)*2;
    if(selected[id].some(p=>Math.hypot(p.x-x,p.z-z)<512))continue;
    const pose={id:`additional-${String(id).padStart(2,'0')}-${selected[id].length+1}`,historicalBiomeId:id,x,z,yaw:next()*2*Math.PI,pitch:-.08,mode:'player'};
    selected[id].push(pose);poses.push(pose);required.set(id,required.get(id)-1);
  }
  if([...required.values()].some(n=>n>0))throw new Error(`Insufficient biome coverage after ${sampled} candidates: ${JSON.stringify([...required])}`);
  return {seed,sampled,poses};
}
export function parseVisualArguments(args) {
  const result={suite:'all',url:'http://localhost:5173'};
  for(let i=0;i<args.length;i++) {
    const key=args[i];if(!['--out','--suite','--baseline','--url'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Invalid visual QA argument: ${key}`);
    result[key.slice(2)]=args[++i];
  }
  if(!result.out||!['original','extended','lighting','motion','all'].includes(result.suite))throw new Error('Visual QA requires --out PATH and a valid suite.');
  return result;
}
