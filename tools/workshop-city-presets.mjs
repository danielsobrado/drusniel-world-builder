import fs from 'node:fs';
import yaml from 'js-yaml';
import { expandPlacedPrimitive } from '../src/editor/workshop/shapes/cities/ShapeSidePlacement.js';
import { buildCityKitPreset } from '../src/editor/workshop/shapes/cities/ShapeCityKit.js';

const ID = /^[a-z][a-z0-9-]*$/;

/**
 * Every config/cities/*.yml realm catalog, in file order. Kit entries stay compact (the
 * editor draws them from blueprints at runtime) but are built here once so a bad entry
 * fails generation; hand-authored landmarks are expanded to plain shape data.
 */
export function loadCityCatalogs(directory) {
  if (!fs.existsSync(directory)) return [];
  const ids = new Set();
  const claim = (id, name) => {
    if (!ID.test(id ?? '')) throw new Error(`Invalid preset id in ${name}: ${id}`);
    if (ids.has(id)) throw new Error(`Duplicate city preset id: ${id}`);
    ids.add(id);
  };
  return fs.readdirSync(directory).filter((name) => name.endsWith('.yml')).sort().map((name) => {
    const c = yaml.load(fs.readFileSync(new URL(name, directory), 'utf8'));
    if (typeof c?.group !== 'string' || !(c.kit?.length || c.presets?.length)) throw new Error(`${name} requires a group and kit or presets.`);
    const kit = (c.kit ?? []).map((entry) => {
      claim(entry.id, name);
      if (typeof entry.label !== 'string') throw new Error(`${name}: ${entry.id} needs a label.`);
      buildCityKitPreset(c.style ?? {}, entry);
      return Object.fromEntries(['id', 'label', 'blueprint', 'style', 'palette', 'with'].filter((k) => entry[k] !== undefined).map((k) => [k, entry[k]]));
    });
    const presets = (c.presets ?? []).map((preset) => {
      claim(preset.id, name);
      if (typeof preset.label !== 'string' || !Array.isArray(preset.primitives) || !preset.primitives.length)
        throw new Error(`Invalid preset in ${name}: ${preset.id}`);
      return { id: preset.id, label: preset.label, ...(preset.palette ? { palette: preset.palette } : {}),
        primitives: preset.primitives.map((p) => expandPlacedPrimitive(p, preset.id)) };
    });
    const realm = name.replace(/^\d+-/, '').replace(/\.yml$/, '');
    if (!ID.test(realm)) throw new Error(`Realm file name must be NN-<id>.yml: ${name}`);
    if (!c.palette) throw new Error(`${name} needs a material palette.`);
    return { realm, group: c.group, style: c.style ?? {}, palette: c.palette, kit, presets };
  });
}
