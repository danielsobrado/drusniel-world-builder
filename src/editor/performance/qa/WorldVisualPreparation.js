import {withinPreparationWindow} from '../../world/PlacementPreparationWindow.js';
/** Bounded on-demand dependency evidence; never invoked by the measured frame loop. */
export function worldVisualPreparation(editor) {
 const surface=editor.stylizedSurface,prepared=surface.preparedPlacement;
 const rock=surface.rockView?.manifestStore,tree=surface.treeView?.manifestStore;
 const missingFields=[];
 for(const job of (rock?.queue.queue??[]).slice(0,32)) {
  const missing=[];
  for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++) {
   const x=job.chunkX+dx,z=job.chunkZ+dz,key=`${x}:${z}`,entry=prepared?.entries.get(key);
   if(prepared&&entry?.signature!==prepared.signature(x,z))missing.push({key,inWindow:withinPreparationWindow(x,z,prepared.window),
    pending:prepared.pending.has(key),completed:prepared.completed.slice(prepared.completedHead).some(item=>item.key===key)});
  }
  if(missing.length)missingFields.push({key:job.key,missing});
 }
 const states=store=>[...(store??[])].slice(0,64).map(([key,s])=>({key,stage:s.stage,
  progress:s.builder?.progress,finalizerProgress:s.finalizer?.progress,startedAt:s.startedAt}));
 const slack=editor.deferredWork?.slack;
 return {fields:{window:prepared?.window,entries:prepared?.entries.size,pending:prepared?.pending.size,
  completed:(prepared?.completed.length??0)-(prepared?.completedHead??0),arrayBytes:prepared?.arrayBytes,missingFields},
  rock:{window:rock?.window,cache:rock?.cache.size,states:states(rock?.pending)},
  tree:{window:tree?.window,cache:tree?.cache.size,states:states(tree?.pendingBuilds)},
  budget:slack?{fixedMs:slack.fixedMs,allowanceMs:slack.allowanceMs,deferredMs:slack.deferredMs,deadline:slack.deadline}:null};
}
