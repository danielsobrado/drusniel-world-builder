import { BufferAttribute, BufferGeometry, InterleavedBuffer, InterleavedBufferAttribute } from 'three/webgpu';

/** Separate attribute identities give each geometry its own GPU lifetime; only
 * immutable CPU arrays are shared when an instance tier changes capacity. */
export function instanceGeometryArrays(source) {
  const geometry = new BufferGeometry(), interleaved = new Map();
  const attribute = original => {
    let result;
    if (original.isInterleavedBufferAttribute) {
      let data = interleaved.get(original.data);
      if (!data) {
        data = new InterleavedBuffer(original.data.array, original.data.stride);
        data.setUsage(original.data.usage);
        interleaved.set(original.data, data);
      }
      result = new InterleavedBufferAttribute(data, original.itemSize, original.offset, original.normalized);
    } else {
      result = new BufferAttribute(original.array, original.itemSize, original.normalized);
      result.setUsage(original.usage);
      result.gpuType = original.gpuType;
    }
    result.name = original.name;
    return result;
  };
  for (const [name, original] of Object.entries(source.attributes)) {
    if (!original.isInstancedBufferAttribute && !original.data?.isInstancedInterleavedBuffer) {
      geometry.setAttribute(name, attribute(original));
    }
  }
  if (source.index) geometry.setIndex(attribute(source.index));
  geometry.morphAttributes = Object.fromEntries(Object.entries(source.morphAttributes)
    .map(([name, attributes]) => [name, attributes.map(attribute)]));
  geometry.morphTargetsRelative = source.morphTargetsRelative;
  for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
  geometry.boundingBox = source.boundingBox?.clone() ?? null;
  geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
  return geometry;
}
