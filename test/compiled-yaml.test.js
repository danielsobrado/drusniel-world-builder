import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import yaml from 'js-yaml';
import { compileYamlModule, compiledYamlPlugin } from '../scripts/compiled-yaml-plugin.mjs';
import { resolveExplorationConfig } from '../src/editor/exploration/ExplorationConfig.js';

test('compiled configuration preserves all current YAML authoring values', async () => {
  const files = ['editor.config.yaml', ...(await readdir('config'))
    .filter(file => file.endsWith('.yaml')).map(file => `config/${file}`)];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const module = await import(`data:text/javascript;base64,${Buffer.from(compileYamlModule(source, file)).toString('base64')}`);
    assert.deepEqual(module.default, yaml.load(source), file);
    const copy = structuredClone(module.default);
    copy.runtimeOnly = true;
    assert.equal(module.default.runtimeOnly, undefined, 'every runtime can receive independent data');
  }
});

test('compiled YAML resolves merge keys with the original precedence and explicit overrides', async () => {
  const source = `defaults: &defaults
  enabled: true
  speedMultiplier: 4
  doubleTapWindowMs: 300
fallback: &fallback
  speedMultiplier: 2
speedBoost:
  <<: [*defaults, *fallback]
  doubleTapWindowMs: 250
`;
  const module = await import(`data:text/javascript;base64,${Buffer.from(compileYamlModule(source, 'exploration.yaml')).toString('base64')}`);
  assert.deepEqual(module.default, yaml.load(source));
  assert.equal(Object.hasOwn(module.default.speedBoost, '<<'), false);
  const { speedBoost } = resolveExplorationConfig(module.default);
  assert.equal(speedBoost.speedMultiplier, 4, 'the first merged mapping wins');
  assert.equal(speedBoost.doubleTapWindowMs, 250, 'explicit settings override merged defaults');
});

test('the config compiler reports malformed sources and watches YAML for HMR', async () => {
  assert.throws(() => compileYamlModule('a: [', 'broken.yaml'), /broken.yaml/);
  assert.throws(() => compileYamlModule('- a', 'array.yaml'), /configuration object/);
  const watched = [];
  const plugin = compiledYamlPlugin();
  assert.equal(await plugin.load.call({ addWatchFile: file => watched.push(file) }, 'other.js'), null);
  const id = `${process.cwd()}/config/exploration.yaml`;
  assert.match(await plugin.load.call({ addWatchFile: file => watched.push(file) }, `${id}?compiled`), /^export default /);
  assert.deepEqual(watched, [id]);
});
