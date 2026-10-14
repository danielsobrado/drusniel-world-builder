import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
export const sha256=data=>createHash('sha256').update(data).digest('hex');
export function repositoryState(root) {
  const git=args=>execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,...args],{cwd:root,encoding:'utf8'}).trim();
  return {sourceSha:git(['rev-parse','HEAD']),dirtyFiles:git(['status','--porcelain']).split('\n').filter(Boolean)};
}
export async function fileHash(file) {return sha256(await readFile(file));}
export async function validateVisualReport(report,root) {
  const failures=[];
  if(!report.poses?.length)failures.push('No captured poses.');
  if(report.errors?.count>0)failures.push('Browser errors.');
  if(report.dirtyFiles?.length)failures.push('Dirty runtime sources.');
  for(const pose of report.poses??[])if(!pose.readiness?.ready)failures.push(`${pose.id} did not settle.`);
  for(const check of report.checks??[])if(!check.passed)failures.push(`${check.id} failed.`);
  for(const pose of report.poses??[]) {
    const names=[`${pose.id}.png`];
    if(report.suite==='original')names.push(`${pose.id}-hud.png`);
    for(const name of names)if(!report.artifacts?.some(a=>a.path===name))failures.push(`${name}: artifact not declared.`);
  }
  for(const artifact of report.artifacts??[]) {
    try {if(await fileHash(new URL(artifact.path,root))!==artifact.sha256)failures.push(`${artifact.path}: hash mismatch.`);}
    catch {failures.push(`${artifact.path}: missing artifact.`);}
  }
  return {passed:failures.length===0,failures};
}
