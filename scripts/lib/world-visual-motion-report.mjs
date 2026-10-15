import path from 'node:path';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import sharp from 'sharp';
import {PLAYER_MODE_WALK} from '../../src/editor/player/playerConstants.js';

export const MOTION_MARKERS=[0,6,10,12,13,17,20];
export function motionChecks(motion) {
 const frames=motion.frames,checks=[];
 const add=(id,passed,detail)=>checks.push({id,passed,detail});
 add('20 simulation seconds recorded',motion.elapsedSimulationSeconds>=20&&frames.length>1,motion.elapsedSimulationSeconds);
 add('finite canonical camera and player poses',frames.every(f=>[f.position.x,f.position.y,f.position.z,f.position.footY,f.camera.x,f.camera.y,f.camera.z,f.yaw,f.pitch,f.fov].every(Number.isFinite)));
 add('ordinary player mode throughout',frames.every(f=>f.mode===PLAYER_MODE_WALK));
 add('collision ready without query errors',frames.every(f=>f.collision.ready&&!f.collision.failure&&!f.collision.error&&!f.collision.queryError));
 add('feet remain above sampled terrain within the existing collision skin',Number.isFinite(motion.settings.collisionSkinWidth)&&frames.every(f=>Number.isFinite(f.terrainHeight)&&f.position.footY>=f.terrainHeight-motion.settings.collisionSkinWidth));
 add('prescribed movement settings',motion.settings.walkSpeed===9&&motion.settings.effectiveWalkSpeed===9&&!motion.settings.explorationBoost&&motion.settings.firstPersonFov===68&&motion.settings.thirdPersonFov===45,motion.settings);
 add('camera field of view',frames.every(f=>Math.abs(f.fov-(motion.cameraMode==='first-person'?68:45))<.001));
 const stops=[];
 for(const [start,end] of [[0,2],[10,12],[17,20]]) {
  const segment=frames.filter(f=>f.elapsed>=start&&f.elapsed<=end+.00001);
  const lastUnready=segment.findLastIndex(f=>!f.scenery.ready),firstStable=segment[lastUnready+1];
  const recoverySeconds=firstStable?Math.max(0,firstStable.elapsed-start):null;
  const maxQueueDepth=Math.max(0,...segment.map(f=>f.scenery.queueDepth??0));
  const missingNearKeys=[...new Set(segment.flatMap(f=>f.nearMeadow.missing))];
  stops.push({start,end,recoverySeconds,maxQueueDepth,missingNearKeys});
  add(`scenery settles within two seconds at ${start}`,recoverySeconds!==null&&recoverySeconds<=2,stops.at(-1));
 }
 const travel=[];
 for(const [start,end] of [[2,6],[6,10],[13,17]]) {
  const segment=frames.filter(f=>f.elapsed>=start&&f.elapsed<=end),distance=segment.slice(1).reduce((sum,f,i)=>sum+Math.hypot(f.position.x-segment[i].position.x,f.position.z-segment[i].position.z),0);
  travel.push({start,end,distance,contacts:segment.filter(f=>f.collision.contacts?.length).length});
 }
 return {checks,stops,travel,maximumMissingNearTiles:Math.max(0,...frames.map(f=>f.nearMeadow.missing.length))};
}
export async function videoMetadata(file) {
 const cache=process.env.PLAYWRIGHT_BROWSERS_PATH??(process.platform==='win32'?path.join(process.env.LOCALAPPDATA,'ms-playwright'):path.join(homedir(),'.cache/ms-playwright'));
 const entry=(await readdir(cache)).filter(name=>name.startsWith('ffmpeg-')).sort().at(-1);
 const binary=path.join(cache,entry,process.platform==='win32'?'ffmpeg-win64.exe':'ffmpeg-linux');
 let output='';try{execFileSync(binary,['-hide_banner','-i',file],{encoding:'utf8',stdio:['ignore','pipe','pipe']});}
 catch(error){output=String(error.stderr??'');}
 const match=output.match(/Video: (\w+)[^\n]*? (\d+)x(\d+)[^\n]*?, ([\d.]+) fps/);
 if(!match)throw new Error(`Cannot verify recorder stream metadata: ${output.slice(0,2000)}`);
 return {codec:match[1],width:Number(match[2]),height:Number(match[3]),framesPerSecond:Number(match[4]),ffmpegOutput:output.trim()};
}
export function selectMotionFrames(motion,captured) {
 if(!motion.frames.length||!captured.length)throw new Error('Motion states and recorder frames are both required.');
 return MOTION_MARKERS.map(marker=>{
  const state=motion.frames.reduce((best,f)=>Math.abs(f.elapsed-marker)<Math.abs(best.elapsed-marker)?f:best);
  const image=captured.reduce((best,f)=>Math.abs(f.wallTimeMs-state.wallTimeMs)<Math.abs(best.wallTimeMs-state.wallTimeMs)?f:best);
  return {marker,simulationSeconds:state.elapsed,stateWallTimeMs:state.wallTimeMs,...image,alignmentErrorMs:Math.abs(image.wallTimeMs-state.wallTimeMs)};
 });
}
export async function motionContactSheet(clips,output) {
 const width=400,imageHeight=225,labelHeight=44,height=imageHeight+labelHeight,layers=[];
 for(let row=0;row<clips.length;row++)for(let col=0;col<clips[row].contacts.length;col++) {
  const frame=clips[row].contacts[col],text=`${clips[row].cameraMode} | sim ${frame.simulationSeconds.toFixed(3)}s`;
  const detail=`capture ${new Date(frame.wallTimeMs).toISOString()}`;
  const label=Buffer.from(`<svg width="${width}" height="${labelHeight}"><rect width="100%" height="100%" fill="#101816"/><text x="8" y="17" fill="#f2f1e8" font-family="sans-serif" font-size="12">${text}</text><text x="8" y="35" fill="#d2d9ce" font-family="sans-serif" font-size="11">${detail}</text></svg>`);
  layers.push({input:await sharp(await readFile(frame.file)).resize(width,imageHeight).png().toBuffer(),left:col*width,top:row*height},
   {input:label,left:col*width,top:row*height+imageHeight});
 }
 await sharp({create:{width:7*width,height:height*clips.length,channels:3,background:'#101816'}}).composite(layers).png().toFile(output);
}
