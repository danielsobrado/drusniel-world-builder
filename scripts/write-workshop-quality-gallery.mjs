import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { workshopReviewSource } from './lib/workshopReviewManifest.mjs';

const root = process.cwd(), out = path.join(root, 'tmp/workshop-shapes-qa');
const beforeDirectory = 'workshop-quality-before-2026-10-16';
const report = JSON.parse(await readFile(path.join(out, 'report.json'), 'utf8'));
const after = JSON.parse(await readFile(path.join(out, 'review/report.json'), 'utf8'));
const before = JSON.parse(await readFile(path.join(root, 'tmp', beforeDirectory, 'report.json'), 'utf8'));
const currentSource = await workshopReviewSource(root);
if (report.failure || after.failure || before.failure) throw new Error('Gallery requires passing capture and interaction reports.');
if (report.source?.hash !== after.source?.hash) throw new Error('Interaction and capture reports must use the same workshop sources.');
if (report.source?.hash !== currentSource.hash) throw new Error('Workshop sources changed since validation; rerun the browser checks and captures.');
if (after.captures.length !== before.captures.length) throw new Error('The gallery requires the complete matched capture set.');
for (const capture of after.captures) {
  const reference = before.captures.find(c => c.preset === capture.preset && c.view.id === capture.view.id);
  if (!reference || ['position','target'].some(key => reference.camera[key].some((v,i) => Math.abs(v - capture.camera[key][i]) > 1e-6))) throw new Error(`Camera mismatch: ${capture.preset}/${capture.view.id}`);
}
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const figure = (id, label, view = 'a') => `<figure><div class="pair"><img class="before" src="../${beforeDirectory}/${id}-${view}.png" alt="${escape(label)}, before" loading="lazy"><img class="after" src="review/${id}-${view}.png" alt="${escape(label)}, after" loading="lazy"></div><figcaption>${escape(label)}</figcaption></figure>`;
const cards = report.presets.map(p => figure(p.id, `${p.label} · ${p.stats.drawParts} ${p.stats.drawParts === 1 ? 'batch' : 'batches'}`)).join('');
const close = ['timber-cottage','balcony-tower','bay-porch-cottage','courtyard-pavilion'].map(id => figure(id, `${report.presets.find(p=>p.id===id).label} · close view`, 'close')).join('');
const detailCards = report.details.map(d => `<figure><img src="${d.id}.png" alt="${escape(d.label)}" loading="lazy"><figcaption>${escape(d.label)}</figcaption></figure>`).join('');
const coarse = ['rounded-cottage','buttressed-chapel','balcony-tower','courtyard-pavilion'].map(id => `<figure><img src="review/${id}-a-coarse.png" alt="${escape(id)} at coarse detail" loading="lazy"><figcaption>${escape(report.presets.find(p=>p.id===id).label)} · coarse detail</figcaption></figure>`).join('');
const materials = ['timber-cottage','bay-porch-cottage','buttressed-chapel','balcony-tower'].flatMap(id => ['neutral','grazing'].map(light =>
  `<figure><img src="review/${id}-close-${light}.png" alt="${escape(id)} under ${light} lighting" loading="lazy"><figcaption>${escape(report.presets.find(p=>p.id===id).label)} · ${light} light</figcaption></figure>`)).join('');
await writeFile(path.join(out, 'comparison.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Workshop quality improvements</title><style>
body{margin:24px;background:#171b20;color:#eee;font:16px system-ui;line-height:1.5}h1{line-height:1.15}main,section{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin:20px 0}figure{margin:0;background:#222b2a;border-radius:10px;overflow:hidden}img{width:100%;display:block}figcaption{padding:10px 14px}.before{display:none}#before:checked~main .before,#before:checked~.paired .before{display:block}#before:checked~main .after,#before:checked~.paired .after{display:none}a{color:#b6d7fa}.evidence{font-size:14px;color:#bfcec8;max-width:85ch}@media(max-width:900px){main,section{grid-template-columns:1fr}}
</style><h1>Workshop quality improvements</h1><p>Continuous window crossbars, attached material grain, slate courses laid along the slope, continuous eaves, clustered planting and grounded paving. The inspector adds focused property tabs, exact dimensions and independent dressing controls.</p>
<p class="evidence">${report.assertions.length} browser interaction checks passed on ${escape(report.renderer.vendor)} ${escape(report.renderer.architecture)} WebGPU. Model comparisons reuse the baseline cameras. <a href="review/report.json">Near capture manifest</a> · <a href="review/report-coarse.json">Coarse manifest</a> · <a href="report.json">Interaction and responsiveness report</a></p>
<input type="checkbox" id="before"><label for="before"> Show the preceding version in matched model views</label><main>${cards}</main><h2>Architectural close views</h2><section class="paired">${close}</section><h2>Craft and editing detail</h2><section>${detailCards}</section><h2>Distance detail</h2><section>${coarse}</section><h2>Neutral and grazing light</h2><section>${materials}</section><p class="evidence">Responsiveness reports distinguish CPU build time, frame intervals and pointer-to-submission proxies. These proxies do not measure physical display latency.</p></html>`);
console.log(`Updated ${path.join(out, 'comparison.html')} with ${after.captures.length} matched near views.`);

const evidencePath = process.argv.find(arg => arg.startsWith('--evidence='))?.slice(11);
if (evidencePath) {
  const matrix = JSON.parse(await readFile(path.join(out, 'review/report-matrix.json'), 'utf8'));
  const cpu = await Promise.all([`tmp/${beforeDirectory}/cpu.json`, 'tmp/workshop-quality-after-cpu.json', 'tmp/workshop-quality-after-cpu-repeat.json'].map(async file => {
    const data = JSON.parse(await readFile(path.join(root, file), 'utf8'));
    return { file, sourceHash: data.source.hash, fixtures: data.fixtures.map(({id,p50,p95,samples}) => ({id,p50,p95,sampleCount:samples.length})), beams: data.beams };
  }));
  const tests = await Promise.all(['tmp/workshop-quality-tests.log','tmp/workshop-quality-full-tests.log'].map(async file => {
    const log = await readFile(path.join(root,file), 'utf8');
    return { file, tests: Number(log.match(/# tests (\d+)/)?.[1]), passed: Number(log.match(/# pass (\d+)/)?.[1]), failed: Number(log.match(/# fail (\d+)/)?.[1]) };
  }));
  const evidence = { source: { commit:report.source.commit, hash:report.source.hash }, verifiedAgainstCommit:currentSource.commit, renderer:report.renderer,
    captureCount:matrix.captures.length, matchingNearViews:after.captures.length, checks:report.assertions,
    consoleErrors:report.consoleErrors, pageErrors:report.pageErrors, tests, cpu, responsiveness:report.responsiveness,
    reviewCeilings: { scope:'The measured NVIDIA Lovelace workstation and four fixtures; advisory, not a universal hardware SLA.',
      cpuP50Ms:60,cpuP95Ms:120,pointerSubmissionP95Ms:60,geometrySubmissionP95Ms:150,frameIntervalP95Ms:100,geometryBytes:12*1024*1024,previewBatches:32 },
    limits:['Submission proxies do not measure physical display latency.','Eight pointer samples per fixture do not establish a long-run latency percentile.','The neutral-light before capture was unavailable; stage and grazing comparisons retain the baseline cameras.'] };
  await writeFile(path.resolve(root,evidencePath), JSON.stringify(evidence,null,2));
  console.log(`Recorded ${evidencePath}`);
}
