import { VSMShadowMap } from 'three/webgpu';

export function* surfaceShadowOwners(surface, renderer, settings) {
  const sky = surface.skyView;
  if (!settings.surfaceShadowReclamationEnabled || !sky || renderer.shadowMap?.type === VSMShadowMap
      || surface.farShadowAdmission?.pending) return;
  for (const light of [sky.directional, ...(sky.cascades?.node?.lights ?? [])]) {
    const shadow = light?.shadow;
    if (light?.castShadow && shadow?.map && shadow.map !== renderer.getRenderTarget?.()) yield shadow;
  }
}
