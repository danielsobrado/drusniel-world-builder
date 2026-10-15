import { repositoryState } from './world-visual-report.mjs';

/** A frozen server proves its immutable archive; live servers require a clean checkout. */
export async function captureVisualSource(url,repo) {
 const response=await fetch(new URL('/__worldVisualSource',url));
 if(response.ok&&response.headers.get('content-type')?.includes('application/json')) {
  const snapshot=await response.json();
  if(snapshot.frozen&&/^[0-9a-f]{40}$/.test(snapshot.sourceSha)&&/^[0-9a-f]{64}$/.test(snapshot.sha256)&&snapshot.files?.['editor.config.yaml']) {
   return {sourceSha:snapshot.sourceSha,dirtyFiles:[],sourceSnapshot:snapshot};
  }
 }
 return repositoryState(repo);
}
export function visualSourceStayedFixed(start,end) {
 return end.sourceSha===start.sourceSha&&(start.sourceSnapshot
  ?end.sourceSnapshot?.sha256===start.sourceSnapshot.sha256
  :end.dirtyFiles.length===0);
}
