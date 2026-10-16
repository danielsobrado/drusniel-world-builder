import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
// node tmp/compose-ab.mjs <beforeDir> <afterDir> <out.jpg> id[:label] ...
const [before, after, out, ...ids] = process.argv.slice(2);
const uri = async f => 'data:image/png;base64,' + (await readFile(f)).toString('base64');
let rows = '';
for (const spec of ids) {
  const [id, label = id] = spec.split(':');
  rows += `<div class=row><figure><img src="${await uri(`${before}/${id}.png`)}"><figcaption>Before · ${label}</figcaption></figure>
  <figure><img src="${await uri(`${after}/${id}.png`)}"><figcaption>After · ${label}</figcaption></figure></div>`;
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 400 } });
await page.setContent(`<style>body{margin:0;background:#17202a;font:15px sans-serif;color:#eee}.row{display:flex}
figure{margin:0;width:800px}img{width:800px;height:450px;display:block}figcaption{padding:6px 12px}</style>${rows}`);
await page.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 86 });
await browser.close();
