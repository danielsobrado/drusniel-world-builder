import * as THREE from 'three';
import { createParticleBufferWriter, PARTICLE_STREAMS } from '../particles/ParticleBufferWriter.js';
import { createParticleMaterial } from './ParticleMaterial.js';

const RENDER_ORDER = 4500;

/**
 * Owns the instanced quad mesh that draws the simulator's particles and
 * keeps the shared camera uniforms current.
 */
export function createParticleRenderer({ scene, atlas, lighting, capacity }) {
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.getAttribute('position'));
  geometry.setAttribute('uv', quad.getAttribute('uv'));
  const writer = createParticleBufferWriter(capacity);
  const attributes = PARTICLE_STREAMS.map((name) => {
    const attribute = new THREE.InstancedBufferAttribute(writer.streams[name], 4);
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
    return attribute;
  });
  geometry.instanceCount = 0;
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);

  const material = createParticleMaterial({ atlas, lighting });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'vfx-particles';
  mesh.frustumCulled = false;
  mesh.renderOrder = RENDER_ORDER;
  mesh.visible = false;
  mesh.matrixAutoUpdate = false;
  mesh.userData.skipWarmup = true;
  scene.add(mesh);

  const forward = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();

  return {
    mesh,
    /** Writes this frame's particles; returns the instance count drawn. */
    update(simulator, camera) {
      camera.updateMatrixWorld();
      const elements = camera.matrixWorld.elements;
      lighting.cameraRight.value.set(elements[0], elements[1], elements[2]).normalize();
      lighting.cameraUp.value.set(elements[4], elements[5], elements[6]).normalize();
      camera.getWorldPosition(cameraPosition);
      lighting.cameraPosition.value.copy(cameraPosition);
      camera.getWorldDirection(forward);
      const written = writer.write(simulator, cameraPosition, forward);
      geometry.instanceCount = written;
      mesh.visible = written > 0;
      if (written > 0) {
        for (const attribute of attributes) {
          attribute.clearUpdateRanges();
          attribute.addUpdateRange(0, written * 4);
          attribute.needsUpdate = true;
        }
      }
      return written;
    },
    /** Shows one dummy instance so the pipeline compiles before first cast. */
    prepareForCompile() {
      geometry.instanceCount = 1;
      mesh.visible = true;
      return () => {
        geometry.instanceCount = 0;
        mesh.visible = false;
      };
    },
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      quad.dispose();
      material.dispose();
    },
  };
}
