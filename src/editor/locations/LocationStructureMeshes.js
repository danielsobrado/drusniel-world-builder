import { BufferAttribute, BufferGeometry, Mesh } from 'three/webgpu';
import { splitByCells } from './gen/SurfaceNets.js';

const UNSAFE_PROPS = new Set(['glow', 'water', 'waterfall', 'cloth', 'pelt']);

export function structureMesh(geometry, material, kind) {
  geometry.computeBoundingSphere();
  const mesh = new Mesh(geometry, material);
  mesh.name = `location-structure:${kind}`;
  mesh.userData.locationStructure = true;
  return mesh;
}

/** Split static opaque props after the full lighting bake. */
export function partitionLocationProp(geometry, material, kind, settings) {
  if (UNSAFE_PROPS.has(kind) || material.transparent || material.transmission || material.positionNode
      || material.vertexNode || material.displacementMap || material.wireframe || geometry.groups.length
      || geometry.index || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity
      || geometry.attributes.position.count / 3 < settings.minPropTriangles) return null;
  const attributes = {};
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (!(attribute.array instanceof Float32Array) || attribute.normalized || attribute.isInterleavedBufferAttribute) return null;
    attributes[name] = { array: attribute.array, size: attribute.itemSize };
  }
  const count = geometry.attributes.position.count;
  if (count % 3 !== 0 || Object.values(geometry.morphAttributes).some(entries => entries.length)) return null;
  const indices = Uint32Array.from({ length: count }, (_, index) => index);
  const chunks = splitByCells({ indices, attributes }, settings.cellMeters);
  if (chunks.length < 2) return null;
  return chunks.map(chunk => {
    const part = new BufferGeometry();
    for (const [name, { array, size }] of Object.entries(chunk.attributes)) part.setAttribute(name, new BufferAttribute(array, size));
    part.setIndex(new BufferAttribute(chunk.indices, 1));
    return structureMesh(part, material, kind);
  });
}
