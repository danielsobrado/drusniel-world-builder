import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import { compileYamlModule } from '../scripts/compiled-yaml-plugin.mjs';
import { createWorldCommands, editorShortcut } from '../src/editor/ui/commands/EditorCommands.js';
import { authoredSceneTree, flattenSceneTree, sceneRowWindow } from '../src/editor/ui/workspace/SceneOutliner.js';
import { validateWorkspaceConfig, workspacePreferences } from '../src/editor/ui/workspace/WorkspaceConfig.js';

const filename = 'config/editor-workspaces.yaml';
const source = readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
const config = yaml.load(source);

test('workspace configuration compiles and invalid sizing or command IDs fail validation', () => {
  assert.match(compileYamlModule(source, filename), /^export default /);
  assert.throws(() => compileYamlModule(source.replace('maxWidth: 400', 'maxWidth: 100'), filename), /panels.toolbox/);
  assert.throws(() => validateWorkspaceConfig(config, { get: () => undefined }), /workspaces.world.tools/);
});

test('workspace preferences recover from old or malformed browser values', () => {
  const preferences = workspacePreferences(config, {
    workspace: 'invalid', theme: 'dark-forge', density: 'comfortable',
    panels: { toolbox: { width: -10, visible: false }, inspector: { width: '450' } },
  });
  assert.deepEqual(preferences, {
    workspace: 'world', theme: 'dark-forge', density: 'comfortable', compactPanel: null,
    panels: { toolbox: { width: 180, visible: false }, inspector: { width: 300, visible: true } },
  });
  assert.equal(workspacePreferences(config, null).theme, 'professional-light');
});

test('keyboard and UI share commands with the same availability and active selection', () => {
  const calls = [];
  const controller = {
    selectedObjectId: 1, undoStack: [], redoStack: [], painting: true,
    isWorldInputBlocked: () => false,
    duplicateSelected: () => calls.push('duplicate'),
    undo: () => calls.push('undo'),
    selectTerrainMode: (mode) => calls.push(mode),
  };
  const commands = createWorldCommands(controller);
  commands.execute(...editorShortcut({ key: 'k', ctrlKey: true }, 'terrain'));
  commands.execute(...editorShortcut({ key: 'k' }, 'terrain'));
  commands.execute(...editorShortcut({ key: 'd', metaKey: true }, 'select'));
  commands.execute('object.duplicate');
  controller.selectedObjectId = null;
  assert.equal(commands.execute('object.duplicate'), false);
  commands.execute(...editorShortcut({ key: 'z', ctrlKey: true }, 'terrain'));
  assert.deepEqual(calls, ['smooth', 'duplicate', 'duplicate', 'undo']);
  assert.deepEqual(editorShortcut({ key: 'Delete' }, 'construction'), ['construction.delete-part']);
});

test('scene search retains semantic ancestors and mounts a bounded window of large results', () => {
  const objects = Array.from({ length: 150_000 }, (_, index) => ({ id: index + 1, definitionKey: 'oak' }));
  const tree = authoredSceneTree({ list: () => objects }, { list: () => [{ id: 'wall-1', label: 'Stone wall' }] },
    new Map([['oak', { label: 'Oak', category: 'nature' }]]));
  assert.deepEqual(flattenSceneTree(tree, new Set(['world']), '#150000').map(({ label }) => label),
    ['World', 'Placed objects', 'Nature', 'Oak']);
  const rows = flattenSceneTree(tree, new Set(), 'oak');
  assert.equal(rows.length, 150_003);
  assert.deepEqual(sceneRowWindow(rows.length, 26, 2600, 260), [96, 114]);
  assert.equal(flattenSceneTree(tree, new Set(), 'terrain chunk').length, 0);
});
