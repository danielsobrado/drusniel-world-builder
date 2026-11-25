function storage(attribute) {
  return attribute?.isInterleavedBufferAttribute ? attribute.data : attribute;
}

function buffersFor(mesh) {
  const geometry = mesh.geometry;
  const attributes = [...Object.values(geometry?.attributes ?? {}), geometry?.index,
    mesh.instanceMatrix, mesh.instanceColor, ...Object.values(geometry?.morphAttributes ?? {}).flat()];
  return new Set(attributes.map(storage).filter(buffer => buffer?.array));
}

/** Count new storage once, including shared and interleaved geometry. */
export class DrawUploadEstimate {
  constructor() { this.published = new WeakSet(); }
  mark(mesh) { for (const buffer of buffersFor(mesh)) this.published.add(buffer); }
  estimate(mesh, planned = new Set(), sliced = []) {
    const excluded = new Set(sliced.map(storage));
    const buffers = [];
    let bytes = 0;
    for (const buffer of buffersFor(mesh)) {
      if (this.published.has(buffer) || planned.has(buffer) || excluded.has(buffer)) continue;
      buffers.push(buffer);
      bytes += buffer.array.byteLength;
    }
    return { bytes, buffers };
  }
}
