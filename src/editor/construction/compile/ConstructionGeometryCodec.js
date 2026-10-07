import * as THREE from 'three/webgpu';

export function encodeConstructionGeometry(built) {
  return { stats: built.stats, meshes: built.meshes.map(mesh => ({
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, attribute]) =>
      [name, { array: attribute.array, itemSize: attribute.itemSize, normalized: attribute.normalized }])),
    index: mesh.geometry.index?.array ?? null,
    box: mesh.geometry.boundingBox?.toArray?.() ?? (mesh.geometry.boundingBox
      ? [...mesh.geometry.boundingBox.min.toArray(), ...mesh.geometry.boundingBox.max.toArray()] : null),
    sphere: mesh.geometry.boundingSphere
      ? [...mesh.geometry.boundingSphere.center.toArray(), mesh.geometry.boundingSphere.radius] : null,
    userData: mesh.userData, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow,
  })) };
}

export function constructionGeometryBuffers(product) {
  const buffers = new Set();
  for (const mesh of product.meshes) {
    for (const attribute of Object.values(mesh.attributes)) buffers.add(attribute.array.buffer);
    if (mesh.index) buffers.add(mesh.index.buffer);
  }
  return [...buffers];
}

/** Publication only: attach transferred arrays and worker-computed bounds. */
export function decodeConstructionGeometry(product, materials) {
  return { stats: product.stats, meshes: product.meshes.map(source => {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) {
      geometry.setAttribute(name, new THREE.BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized));
    }
    if (source.index) geometry.setIndex(new THREE.BufferAttribute(source.index, 1));
    if (source.box) geometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(...source.box.slice(0, 3)), new THREE.Vector3(...source.box.slice(3, 6)));
    if (source.sphere) geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(...source.sphere.slice(0, 3)), source.sphere[3]);
    const mesh = new THREE.Mesh(geometry, materials[source.userData.constructionMaterialSlot] ?? materials.stone);
    Object.assign(mesh.userData, source.userData);
    mesh.castShadow = source.castShadow; mesh.receiveShadow = source.receiveShadow;
    return mesh;
  }) };
}
