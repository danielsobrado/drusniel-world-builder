import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {sha256} from './world-visual-report.mjs';

/** The Node harness can be newer than the immutable browser runtime; identify both. */
export async function captureVisualHarness(entry,repo) {
 const files={},visited=new Set(),sourceSha=execFileSync('git',['-c',`safe.directory=${repo.replaceAll('\\','/').replace(/\/$/,'')}`,'rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
 async function visit(url) {
  const file=fileURLToPath(url);if(visited.has(file))return;visited.add(file);
  const source=await readFile(file,'utf8'),relative=path.relative(repo,file).replaceAll('\\','/');
  files[relative]=sha256(source);
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))await visit(new URL(match[1],url));
 }
 await visit(new URL(entry));return {sourceSha,files};
}
