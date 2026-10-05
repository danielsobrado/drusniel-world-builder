import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';

/** Compile authoring YAML into module data; runtime resolution stays in the app. */
export function compileYamlModule(source, filename) {
  const value = yaml.load(source, { filename, schema: yaml.JSON_SCHEMA });
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${filename} must contain a configuration object.`);
  }
  return `export default ${JSON.stringify(value)};\n`;
}

export function compiledYamlPlugin() {
  return {
    name: 'compiled-authoring-yaml',
    enforce: 'pre',
    async load(id) {
      if (!id.endsWith('.yaml?compiled')) return null;
      const filename = id.slice(0, -'?compiled'.length);
      this.addWatchFile(filename);
      return compileYamlModule(await readFile(filename, 'utf8'), filename);
    },
  };
}
