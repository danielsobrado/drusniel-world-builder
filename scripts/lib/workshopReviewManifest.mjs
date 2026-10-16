import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function sources(root, directory) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const lists = await Promise.all(entries.map(async entry => {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sources(root, file);
    if (!/\.(js|mjs|css|yaml)$/.test(file)) return [];
    return [{ file, sha256: createHash('sha256').update(await readFile(path.join(root, file))).digest('hex') }];
  }));
  return lists.flat().sort((a, b) => a.file.localeCompare(b.file));
}

/** Workshop fingerprints exclude unrelated world edits in the shared checkout. */
export async function workshopReviewSource(root) {
  const files = await sources(root, 'src/editor/workshop');
  return { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(),
    files, hash: createHash('sha256').update(JSON.stringify(files)).digest('hex') };
}

export function applyWorkshopReviewLighting(ui, mode) {
  const lights = [];
  ui.scene.traverse(object => { if (object.isLight) lights.push(object); });
  ui.__reviewLightDefaults ??= lights.map(light => ({ id: light.uuid, color: light.color.getHex(), intensity: light.intensity,
    position: light.position.toArray(), ground: light.groundColor?.getHex() }));
  for (const light of lights) {
    const base = ui.__reviewLightDefaults.find(item => item.id === light.uuid);
    if (!base) continue;
    light.color.setHex(base.color); light.intensity = base.intensity; light.position.fromArray(base.position);
    if (light.groundColor) light.groundColor.setHex(base.ground);
  }
  if (mode !== 'stage') {
    const directional = lights.filter(light => light.isDirectionalLight);
    for (const light of lights) {
      light.color.set('#ffffff');
      if (light.isHemisphereLight) { light.groundColor.set('#b0aaa0'); light.intensity = mode === 'neutral' ? 2 : 1; }
    }
    directional.forEach((light, i) => {
      light.intensity = i ? 0.35 : mode === 'neutral' ? 2.2 : 3;
      if (!i) light.position.set(...(mode === 'neutral' ? [8, 12, 10] : [-12, 4, 8]));
    });
  }
  return lights.map(light => ({ type: light.type, color: light.color.getHexString(), intensity: light.intensity,
    position: light.position.toArray(), ground: light.groundColor?.getHexString() }));
}
