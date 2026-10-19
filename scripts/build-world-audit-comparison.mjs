import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [beforeArg, afterArg] = process.argv.slice(2);
if (!beforeArg || !afterArg) throw new Error('Usage: node scripts/build-world-audit-comparison.mjs BEFORE_DIRECTORY AFTER_DIRECTORY');
const beforeDir = path.resolve(beforeArg), afterDir = path.resolve(afterArg);
const [before, after] = await Promise.all([beforeDir, afterDir].map(async dir =>
  JSON.parse(await readFile(path.join(dir, 'report.json'), 'utf8'))));
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const relative = file => path.relative(afterDir, file).replaceAll('\\', '/');
const baseline = new Map(before.poses.map(pose => [pose.id, pose]));
const foreground = report => report.focus?.passed ?? (report.batches?.some(b => b.focus?.passed === false)
  ? false : report.batches?.every(b => b.focus?.passed === true) ? true : null);
const shots = after.poses.map(pose => {
  const old = baseline.get(pose.id), current = `${pose.id}.png`;
  const oldImage = old ? relative(path.join(beforeDir, current)) : null;
  return `<article id="${escape(pose.id)}"><h2>${escape(pose.id)} · ${escape(pose.name ?? '')}</h2>
    <p>Azgaar ${pose.actualBiomeId ?? pose.expectedBiomeId} · ${escape(pose.world)} · ${escape(pose.mode)} · x ${pose.x}, z ${pose.z}</p>
    ${old ? `<p>Baseline: ${escape(old.captureStatus ?? 'see source report')}.</p>
    <div class="pair"><img src="${escape(oldImage)}" alt="Original ${escape(pose.id)}"><img class="candidate" src="${escape(current)}" alt="Implemented ${escape(pose.id)}"></div>
    <label>Original ← comparison → implemented <input type="range" min="0" max="100" value="50" aria-label="Compare ${escape(pose.id)}"></label>
    <p><a href="${escape(oldImage)}">Open original</a> · <a href="${escape(current)}">Open implemented</a></p>`
      : `<img class="single" src="${escape(current)}" alt="Implemented supplement ${escape(pose.id)}"><p>Supplement; no original pair.</p>`}
    <details><summary>Readiness, population and resources</summary><pre>${escape(JSON.stringify({
      original: old ? { readiness: old.readiness, counts: old.placementCounts, resources: old.resources } : null,
      implemented: { readiness: pose.readiness, counts: pose.placementCounts, resources: pose.resources },
    }, null, 2))}</pre></details></article>`;
}).join('\n');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>World visual pass · before and implementation</title><style>
body{margin:0;background:#141c1b;color:#e8ede6;font:16px/1.5 system-ui,sans-serif}main{max-width:1600px;margin:auto;padding:24px}a{color:#bee2b0}article{margin:48px 0;border-top:1px solid #52605a;padding-top:16px}.pair{position:relative;aspect-ratio:16/9;background:#000}.pair img{position:absolute;width:100%;height:100%;object-fit:contain}.candidate{clip-path:inset(0 0 0 50%)}label{display:block;margin:12px 0}input{width:min(700px,100%);display:block}.single{width:100%}pre{white-space:pre-wrap;font-size:13px}nav{display:flex;gap:14px;flex-wrap:wrap}h1{font-size:28px}h2{font-size:21px}
</style><main><h1>World visual pass · original and implemented</h1>
<p>Original source ${escape(before.sourceSha)}. Implemented source ${escape(after.sourceSha)}.</p>
<p>These are unretouched engine captures. The slider reveals the original on the left and implementation on the right. Live plant/particle phases and placement clearance may differ; this is a scene comparison, not a pixel-difference metric.</p>
<p>Candidate capture valid: <strong>${after.captureValid === true}</strong>. Original aggregate capture valid: <strong>${before.captureValid === true}</strong>. Consult each report for failures. Visual validity does not establish performance or artistic approval.</p>
<p>Native foreground monitor: candidate ${escape(foreground(after) ?? 'not established')}; original ${escape(foreground(before) ?? 'not established')}. A failed monitor makes the affected images diagnostic even when an older report's capture flag says true.</p>
<p><a href="report.json">Candidate evidence</a> · <a href="${escape(relative(path.join(beforeDir, 'report.json')))}">Original evidence</a></p>
<nav>${after.poses.map(p => `<a href="#${escape(p.id)}">${escape(p.id)}</a>`).join('')}</nav>${shots}
</main><script>document.querySelectorAll('article input').forEach(input=>input.addEventListener('input',()=>{input.closest('article').querySelector('.candidate').style.clipPath='inset(0 0 0 '+input.value+'%)'}));</script></html>`;
await writeFile(path.join(afterDir, 'comparison.html'), html);
console.log(`Wrote ${after.poses.length} comparisons to ${path.join(afterDir, 'comparison.html')}`);
