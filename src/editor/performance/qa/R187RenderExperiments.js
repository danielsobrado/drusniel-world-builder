import * as THREE from 'three/webgpu';
import { diffuseColor, instancedBufferAttribute, materialReference, metalness, mrt, normalView, output,
  packNormalToRGB, pass, referenceAttribute, roughness, sample, unpackRGBToNormal, vec2, vec4 } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { LightProbeGrid } from 'three/addons/lighting/LightProbeGrid.js';
import { CascadedSunShadows } from '../../../render/shadows/CascadedSunShadows.js';
import { disposeScene } from '../../assets/assetUrl.js';
import { createSecondaryUvAtlas } from './R187SecondaryUv.js';

function addMesh(scene, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

async function captureScreenEffects(renderer, scene, camera, capture) {
  const beautyPass = pass(scene, camera);
  beautyPass.setMRT(mrt({ output, normal: packNormalToRGB(normalView), diffuse: diffuseColor,
    metalRough: vec2(metalness, roughness) }));
  const color = beautyPass.getTextureNode();
  const depth = beautyPass.getTextureNode('depth');
  const normalBuffer = beautyPass.getTextureNode('normal');
  beautyPass.getTexture('normal').type = THREE.UnsignedByteType;
  beautyPass.getTexture('metalRough').type = THREE.UnsignedByteType;
  const normal = sample(uv => unpackRGBToNormal(normalBuffer.sample(uv)));
  const diffuse = beautyPass.getTextureNode('diffuse');
  const metalRough = beautyPass.getTextureNode('metalRough');
  const reflection = ssr(color, depth, normal, { camera, metalnessNode: metalRough.r,
    roughnessNode: metalRough.g, stochastic: true, binaryRefine: true });
  const ambient = ao(depth, normal, camera);
  const indirect = ssgi(color, depth, normal, camera);
  indirect.useTemporalFiltering = false;
  const pipeline = new THREE.RenderPipeline(renderer);
  const ambientColor = vec4(color.rgb.mul(ambient.getTextureNode().r), color.a);
  const indirectColor = vec4(color.rgb.mul(indirect.getAONode()).add(diffuse.rgb.mul(indirect.getGINode().rgb)), color.a);
  const render = async (id, effect, node, scale = 1) => {
    if (effect) effect.resolutionScale = scale;
    pipeline.outputNode = node;
    pipeline.needsUpdate = true;
    pipeline.render();
    await renderer.backend.device.queue.onSubmittedWorkDone();
    await capture(id, { scale });
  };
  try {
    await render('r187-screen-baseline', null, color);
    await render('r187-stochastic-ssr', reflection, vec4(color.rgb.add(reflection.rgb), color.a));
    await render('r187-gtao-half', ambient, ambientColor, 0.5);
    await render('r187-ssgi-quarter', indirect, indirectColor, 0.25);
    await render('r187-ssgi-half', indirect, indirectColor, 0.5);
  } finally {
    pipeline.dispose();
    indirect.dispose(); ambient.dispose(); reflection.dispose(); beautyPass.dispose();
  }
}

async function captureSharedShaders(renderer, capture) {
  const camera = new THREE.OrthographicCamera(-5, 5, 3.75, -3.75, 0.1, 20);
  camera.position.z = 10;
  const colors = [[0.82, 0.19, 0.1, 0.22, 0.58, 0.08], [0.18, 0.51, 0.83, 0.75, 0.62, 0.13]];
  for (const shared of [false, true]) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#141b22');
    const geometry = new THREE.BoxGeometry(1.5, 1.5, 0.5);
    const shade = materialReference('qaShade', 'float');
    const template = shared ? new THREE.MeshBasicNodeMaterial() : null;
    if (template) template.colorNode = referenceAttribute('qaTint', 'vec3').mul(shade);
    const debug = renderer.debug;
    const previous = debug.onNodeBuilderCreated;
    let nodeBuilders = 0;
    try {
      for (const [i, values] of colors.entries()) {
        const tint = new THREE.InstancedBufferAttribute(new Float32Array(values), 3);
        const material = shared ? new THREE.NodeMaterialInstance(template) : new THREE.MeshBasicNodeMaterial();
        if (!shared) material.colorNode = instancedBufferAttribute(tint, 'vec3').mul(shade);
        material.qaShade = i === 0 ? 1 : 0.7;
        const mesh = new THREE.InstancedMesh(geometry, material, 2);
        mesh.qaTint = tint;
        mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-1.2, 1.2 - 2.4 * i, 0));
        mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(1.2, 1.2 - 2.4 * i, 0));
        scene.add(mesh);
      }
      debug.onNodeBuilderCreated = (...args) => { nodeBuilders++; previous?.(...args); };
      renderer.render(scene, camera);
      await renderer.backend.device.queue.onSubmittedWorkDone();
      await capture(shared ? 'r187-shared-shaders' : 'r187-independent-shaders', { nodeBuilders });
    } finally {
      debug.onNodeBuilderCreated = previous;
      for (const mesh of scene.children) mesh.dispose();
      template?.dispose();
      disposeScene(scene);
    }
  }
}

/** Fixed lighting and reflection poses. The movement runner measures world performance separately. */
export async function runR187RenderExperiments(renderer, capture) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8191ac');
  const camera = new THREE.PerspectiveCamera(42, 640 / 480, 0.1, 100);
  camera.position.set(5, 3.5, 10);
  camera.lookAt(0, 0.75, 0);
  const sun = new THREE.DirectionalLight('#ffe3b8', 2.5);
  sun.position.set(-5, 9, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target, new THREE.HemisphereLight('#b6ccff', '#59372b', 0.7));
  const floor = addMesh(scene, new THREE.PlaneGeometry(24, 24),
    new THREE.MeshStandardNodeMaterial({ color: '#68686b', metalness: 0.85, roughness: 0.24 }), 0, 0, 0);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  const block = addMesh(scene, new THREE.BoxGeometry(2.5, 1.8, 1.3),
    new THREE.MeshStandardNodeMaterial({ color: '#c74324', roughness: 0.55 }), 0, 0.9, -2.2);
  for (const [i, roughness] of [0.09, 0.37, 0.78].entries()) {
    addMesh(scene, new THREE.SphereGeometry(0.72, 32, 24),
      new THREE.MeshStandardNodeMaterial({ color: '#b5c1d4', metalness: 1, roughness }), (i - 1) * 1.8, 0.72, 0);
  }
  const environment = new THREE.Scene();
  environment.background = new THREE.Color('#43516e');
  addMesh(environment, new THREE.PlaneGeometry(6, 4), new THREE.MeshBasicNodeMaterial({ color: '#ffdb8e' }), -2, 2, -4);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const shadowEnabled = renderer.shadowMap.enabled;
  const gpu = renderer.backend.isWebGPUBackend === true;
  let target, cascades, atlas;
  const render = async (id, extra) => {
    renderer.render(scene, camera);
    if (gpu) await renderer.backend.device.queue.onSubmittedWorkDone();
    await capture(id, extra);
  };
  try {
    renderer.shadowMap.enabled = true;
    await render('r187-environment-off');
    target = pmrem.fromScene(environment, 0, 0.1, 30, { size: 128 });
    scene.environment = target.texture;
    await render('r187-cube-pmrem', { mapping: target.texture.mapping, mipmaps: target.texture.mipmaps.length });
    atlas = createSecondaryUvAtlas(block, { resolution: 256, padding: 4 });
    const source = block.geometry;
    block.geometry = atlas.geometry;
    try {
      await render('r187-secondary-uv', { charts: atlas.atlas.charts.length, warnings: atlas.atlas.warnings });
    } finally { block.geometry = source; }
    if (gpu) {
      cascades = new CascadedSunShadows(sun, 32);
      await render('r187-two-cascades');
      sun.position.set(6, 7, 2);
      cascades.prepare(camera);
      await render('r187-two-cascades-sun-moved');
      cascades.dispose(); cascades = null;
      sun.position.set(-5, 9, 3);
      const grid = new LightProbeGrid(6, 3, 6, 3, 2, 3);
      grid.position.set(0, 1.5, -1);
      try {
        grid.bake(renderer, scene, { cubemapSize: 8, far: 20 });
        scene.add(grid);
        await render('r187-light-probe-grid', { probes: grid.resolution.toArray() });
      } finally {
        grid.removeFromParent();
        grid.dispose();
      }
      // Use the same beauty, depth and normal inputs for every screen-space arm.
      await captureScreenEffects(renderer, scene, camera, capture);
      await captureSharedShaders(renderer, capture);
    }
  } finally {
    renderer.shadowMap.enabled = shadowEnabled;
    cascades?.dispose(); sun.shadow.dispose();
    scene.environment = null;
    target?.dispose(); pmrem.dispose(); atlas?.geometry.dispose();
    disposeScene(environment); disposeScene(scene);
  }
}
