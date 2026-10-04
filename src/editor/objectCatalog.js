import yaml from 'js-yaml';
import objectCatalogYaml from '../../config/objects.yaml?raw';
import editorConfigYaml from '../../editor.config.yaml?raw';
import godsEndCatalog from './assets/godsEnd/catalog.generated.json';
import { createGodsEndObjectCatalog } from './assets/godsEnd/objectCatalog.js';
import { TILE_BY_KEY } from './tileCatalog.js';
import { createObjectCatalog } from './objectCatalogSchema.js';

const parsed = yaml.load(objectCatalogYaml);

export const OBJECT_CATALOG = Object.freeze([
  ...createObjectCatalog(parsed?.objects, TILE_BY_KEY),
  ...createGodsEndObjectCatalog(godsEndCatalog.objects, TILE_BY_KEY, yaml.load(editorConfigYaml).map.tileSize),
]);
export const OBJECT_BY_KEY = new Map(OBJECT_CATALOG.map((definition) => [definition.key, definition]));
