import { Box3, MeshBasicMaterial, Vector3 } from 'three';
import { HouseBuilder } from './HouseBuilder.js';
import { HOUSE_DESIGNS } from './houseDesigns.js';

const LABELS = { '003': 'Cottage', '004': 'Red Tavern', '005': 'Blacksmith', '006': 'Town House', '009': 'Slate Tavern' };

export function createHouseBuilder(id) {
  const design = HOUSE_DESIGNS[id];
  if (!design) throw new Error(`Unknown Gods’ End house: ${id}.`);
  const builder = new HouseBuilder({ seed: design.seed, grimeHeight: design.grimeHeight ?? 0, palette: design.palette });
  design.build(builder);
  return builder;
}

/** Catalog metadata is derived from the recipe, never used to reconstruct it. */
export function createHouseCatalogEntries() {
  return Object.entries(HOUSE_DESIGNS).map(([id, design]) => {
    const builder = createHouseBuilder(id);
    const material = new MeshBasicMaterial();
    const group = builder.build(Object.fromEntries([...builder.parts.keys()].map((name) => [name, material])));
    const bounds = new Box3().setFromObject(group);
    group.traverse((mesh) => mesh.geometry?.dispose());
    material.dispose();
    const dimensions = bounds.getSize(new Vector3()).toArray();
    dimensions[1] = bounds.max.y - (design.groundY ?? 0);
    return {
      key: `gods-end-house-${id}`, label: `Gods’ End ${LABELS[id]}`, category: 'building', icon: '🏠', color: '#95694f',
      asset: { kind: 'house', design: id, scale: 1, groundY: design.groundY ?? 0,
        bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, dimensions },
      collision: 'bounds',
    };
  });
}
