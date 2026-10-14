import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
// The browser fixture evaluates the production normalNode. This independent
// geometry oracle checks the rotating basis and the fixed-world-light invariant.
test('view-space lighting preserves a fixed world normal as the camera rotates',()=>{
 const normal=new THREE.Vector3(.3,.8,.5).normalize(),light=new THREE.Vector3(3,4,2).normalize(),expected=normal.dot(light);
 for(const azimuth of [0,45,90,180,270])for(const elevation of [0,12,58]) {
  const camera=new THREE.PerspectiveCamera(35,4/3,.01,1000),az=THREE.MathUtils.degToRad(azimuth),el=THREE.MathUtils.degToRad(elevation);
  camera.position.set(Math.sin(az)*Math.cos(el)*10,Math.sin(el)*10,Math.cos(az)*Math.cos(el)*10);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const view=new THREE.Matrix3().setFromMatrix4(camera.matrixWorldInverse);
  const n=normal.clone().applyMatrix3(view).normalize(),l=light.clone().applyMatrix3(view).normalize();
  assert.ok(Math.abs(n.dot(l)-expected)<1e-12);
  if(azimuth===90&&elevation===0)assert.ok(Math.abs(normal.dot(l)-expected)>.1,'using a world normal with a view light must fail this oracle');
 }
});
