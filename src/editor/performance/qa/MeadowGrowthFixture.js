import * as THREE from 'three/webgpu';
import { float, uv, vec2, vec4 } from 'three/tsl';
import { meadowGrowthNodes } from '../../stylized/meadow/meadowGrowthNodes.js';
import { createMeadowUniforms } from '../../stylized/meadow/meadowUniforms.js';

/** Numerical readback of the production node recipe at 10000 canonical points. */
export async function measureMeadowGrowth(renderer,settings) {
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,2);
  camera.position.z=1;
  const uniforms=createMeadowUniforms(settings),material=new THREE.MeshBasicNodeMaterial({toneMapped:false});
  const geometry=new THREE.PlaneGeometry(2,2),quad=new THREE.Mesh(geometry,material);scene.add(quad);
  // 128 Float32 RGBA pixels occupy whole 256-byte WebGPU rows.
  const target=new THREE.RenderTarget(128,80,{type:THREE.FloatType,format:THREE.RGBAFormat,depthBuffer:false});
  target.texture.colorSpace=THREE.LinearSRGBColorSpace;
  const checks=[];
  try {
    for(let id=0;id<13;id++) {
      const profile=settings.growth.profiles[settings.growth.table[id]],instance={
        growth:float(settings.growth.table[id]),canonical:uv().mul(256).add(vec2(-8000000,4000000)),
      };
      const near=meadowGrowthNodes(uniforms,instance),far=meadowGrowthNodes(uniforms,instance,true);
      material.fragmentNode=vec4(near.height,far.height,near.width.mul(uv().x.mul(.24).add(.88)),near.density);
      material.needsUpdate=true;renderer.setRenderTarget(target);
      await renderer.render(scene,camera);
      const pixels=await renderer.readRenderTargetPixelsAsync(target,0,0,128,80);
      let minimum=Infinity,maximum=-Infinity,ratioError=0,widthError=0,densityError=0,invalid=0;
      for(let i=0;i<10000;i++) {
        const h=pixels[i*4],card=pixels[i*4+1],w=pixels[i*4+2],d=pixels[i*4+3];
        if(!Number.isFinite(h+card+w+d))invalid++;
        minimum=Math.min(minimum,h);maximum=Math.max(maximum,h);
        ratioError=Math.max(ratioError,Math.abs(card-h*1.125));
        widthError=Math.max(widthError,profile.width*.88-w,w-profile.width*1.12);
        densityError=Math.max(densityError,Math.abs(d-profile.density));
      }
      checks.push({id:`biome-${id}-growth-nodes`,samples:10000,minimum,maximum,ratioError,widthError,densityError,invalid,
        passed:invalid===0&&minimum>=profile.shortHeight-1e-6&&maximum<=profile.tallHeight+1e-6&&ratioError<1e-6&&widthError<1e-6&&densityError<1e-6});
    }
  }finally{renderer.setRenderTarget(null);target.dispose();geometry.dispose();material.dispose();}
  return checks;
}
