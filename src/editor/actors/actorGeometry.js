import { BufferAttribute, Float32BufferAttribute } from 'three';

/** Identical decoding for offline LOD bakes and interleaved runtime GLBs. */
export function normalizeActorGeometry(geometry) {
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (!attribute.isInterleavedBufferAttribute && !attribute.normalized
      && (name !== 'position' && name !== 'uv' || attribute.array instanceof Float32Array)) continue;
    const ArrayType = name === 'skinIndex' ? Uint16Array : Float32Array;
    const values = new ArrayType(attribute.count * attribute.itemSize);
    for (let index = 0; index < attribute.count; index++) {
      for (let component = 0; component < attribute.itemSize; component++) {
        values[index * attribute.itemSize + component] = attribute.getComponent(index, component);
      }
    }
    geometry.setAttribute(name, name === 'skinIndex'
      ? new BufferAttribute(values, attribute.itemSize)
      : new Float32BufferAttribute(values, attribute.itemSize));
  }
  return geometry;
}
