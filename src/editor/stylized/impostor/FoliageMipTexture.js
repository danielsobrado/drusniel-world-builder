import * as THREE from 'three/webgpu';

/** RGBA8 mip chain baked offline; no runtime canvas scans or downsampling. */
export async function loadFoliageMipTexture(url, fetchImpl = globalThis.fetch.bind(globalThis)) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Foliage mip atlas failed with HTTP ${response.status}.`);
  let buffer;
  if ((response.headers.get('content-encoding') ?? '').includes('gzip')) buffer = await response.arrayBuffer();
  else buffer = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const view = new DataView(buffer);
  if (view.byteLength < 16 || view.getUint32(0, true) !== 0x50494d46) throw new Error('Invalid foliage mip header.');
  const width = view.getUint32(4, true), height = view.getUint32(8, true), count = view.getUint32(12, true);
  if (!width || !height || count !== Math.floor(Math.log2(Math.max(width, height))) + 1) throw new Error('Invalid foliage mip dimensions.');
  const levels = [];
  let offset = 16, w = width, h = height;
  for (let i = 0; i < count; i++) {
    const size = w * h * 4;
    if (offset + size > buffer.byteLength) throw new Error('Truncated foliage mip chain.');
    levels.push({ data: new Uint8Array(buffer, offset, size), width: w, height: h });
    offset += size; w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
  }
  if (offset !== buffer.byteLength) throw new Error('Unexpected foliage mip payload.');
  const result = new THREE.DataTexture(levels[0].data, width, height);
  result.mipmaps = levels;
  result.generateMipmaps = false;
  result.flipY = false;
  result.colorSpace = THREE.SRGBColorSpace;
  result.minFilter = THREE.LinearMipmapLinearFilter;
  result.magFilter = THREE.LinearFilter;
  result.needsUpdate = true;
  return result;
}
