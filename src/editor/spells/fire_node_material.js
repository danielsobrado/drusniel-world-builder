import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  abs,
  clamp,
  float,
  Fn,
  length,
  max,
  mix,
  pow,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  blackbodyFireColor,
  sampleFireNoise,
  sampleFireTurbulence,
} from '../vfx/render/fireShaderNodes.js';
import { spellCardEdgeFade } from './spell_card_edge.js';

const JET_TURB_OPTS = Object.freeze({
  broadScale: vec2(0.55, 0.42),
  fineScale: vec2(1.25, 0.92),
  broadSpeed: 0.72,
  fineSpeed: 1.28,
  warpStrength: 0.22,
  gain: 1.45,
});

function createFireNodeMaterial() {
  const uTime = uniform(0);
  const uProgress = uniform(0);
  const ring = (d, radius, thickness) => float(1).sub(smoothstep(thickness, thickness.mul(1.85), abs(d.sub(radius))));

  const fragment = Fn(() => {
    const uvN = uv();
    const side = uvN.x.sub(0.5);
    const t = uvN.y;
    const castIn = smoothstep(0, 0.06, uProgress);
    const castOut = float(1).sub(smoothstep(0.76, 1, uProgress));
    const life = castIn.mul(castOut);
    const grow = smoothstep(0, 0.22, uProgress);

    // Expanding turbulent cone that widens from the caster's palm and frays into licking tips.
    let coneWidth = mix(float(0.036), float(0.28), pow(max(t, 0), 0.72));
    coneWidth = coneWidth.mul(float(1).sub(smoothstep(0.68, 1.04, t).mul(0.55)));
    coneWidth = max(coneWidth, 0.022);

    const scrollT = uTime.mul(1.75);
    const jetUv = vec2(side.div(coneWidth).mul(0.52), t);
    const turb = sampleFireTurbulence(jetUv, scrollT, vec2(0.17, 0.31), JET_TURB_OPTS);

    const sideWarp = turb.combined.mul(0.135).mul(smoothstep(0.05, 0.88, t));
    const warpedSide = side.add(sideWarp);
    const radial = abs(warpedSide).div(coneWidth);

    const baseMask = smoothstep(-0.02, 0.075, t).mul(
      float(1).sub(smoothstep(grow.mul(0.9), grow.mul(1.12).add(0.01), t)),
    );

    // Multi-layered roaring combustion body: core plume + curling cellular tongues + tattered outer licks.
    const cellCarve = turb.cells.sub(0.5).mul(0.56);
    const bodyField = float(1).sub(radial)
      .sub(t.mul(0.42))
      .add(turb.sway.mul(0.45))
      .add(turb.licks.mul(0.32))
      .add(cellCarve);
    const tipErosion = smoothstep(float(1.02), float(0.54), t.add(turb.erosion.sub(0.5).mul(0.42)));
    const density = smoothstep(0.06, 0.82, bodyField).mul(tipErosion).mul(baseMask).mul(life);

    // Hot incandescent core & flickering flame filaments running down the jet axis.
    const coreField = float(1).sub(radial.mul(1.35)).add(float(1).sub(t).mul(0.35)).add(cellCarve.mul(0.7));
    const core = smoothstep(0.55, 1.15, coreField).mul(baseMask).mul(life);
    const tongues = smoothstep(0.58, 0.92, turb.cells.add(turb.licks.mul(0.4)))
      .mul(density)
      .mul(smoothstep(0.1, 0.88, t));

    // Palm ignition heart + pulsing arcane containment rings.
    const palmDist = length(vec2(side.mul(0.74), t.mul(1.26)));
    const palmGlow = pow(float(1).sub(smoothstep(0.02, 0.27, palmDist)), 1.6).mul(life);
    const blueHeart = pow(float(1).sub(smoothstep(0.01, 0.14, palmDist)), 2.0).mul(life);
    const magicRing = ring(palmDist, float(0.14).add(sin(uTime.mul(7.5)).mul(0.015)), float(0.009)).mul(life);
    const runePulse = ring(palmDist, float(0.21).add(sin(uTime.mul(4.6)).mul(0.018)), float(0.007)).mul(life).mul(0.52);

    // Smooth elongated rushing sparks & embers (no blocky pixel-grid artifacts).
    const streakUvA = vec2(warpedSide.mul(5.8).add(0.5), t.mul(1.45).sub(uTime.mul(2.85)));
    const streakUvB = vec2(warpedSide.mul(9.2).sub(0.25), t.mul(2.1).sub(uTime.mul(3.9)));
    const streakA = sampleFireNoise(streakUvA, 'meso').b;
    const streakB = sampleFireNoise(streakUvB, 'sky').r;
    const sparkMask = smoothstep(0.14, 0.94, t).mul(float(1).sub(smoothstep(0.92, 1.08, t)))
      .mul(smoothstep(float(1.45), float(0.2), radial));
    const sparks = smoothstep(0.78, 0.95, streakA.mul(streakB).mul(1.45)).mul(sparkMask).mul(life);
    const emberFlakes = smoothstep(0.84, 0.97, streakB).mul(sparkMask).mul(life);

    // Heat-haze outer veil and faint dark-crimson smoke edge contrast.
    const heatVeil = smoothstep(0.02, 0.72, bodyField.add(0.22)).mul(baseMask).mul(life).mul(0.14);
    const flicker = sin(uTime.mul(23).add(t.mul(8))).mul(0.05).add(1.0);

    // Map internal thermal gradient through the physical blackbody ramp.
    const heat = clamp(
      density.mul(0.55)
        .add(core.mul(0.52))
        .add(tongues.mul(0.22))
        .add(float(1).sub(t).mul(0.16).mul(density))
        .sub(radial.mul(0.18)),
      0,
      1,
    );
    let color = blackbodyFireColor(heat).mul(density.mul(1.35).add(core.mul(0.55)));
    color = color.add(vec3(1.0, 0.86, 0.42).mul(tongues).mul(0.48));
    color = color.add(vec3(1.0, 0.92, 0.62).mul(palmGlow).mul(0.95));
    color = color.add(vec3(0.52, 0.78, 1.0).mul(blueHeart).mul(0.45));
    color = color.add(vec3(1.0, 0.42, 0.1).mul(magicRing.add(runePulse)).mul(0.85));
    color = color.add(vec3(1.0, 0.72, 0.24).mul(sparks).mul(1.35));
    color = color.add(vec3(1.0, 0.34, 0.06).mul(emberFlakes).mul(0.65));
    color = color.add(vec3(0.68, 0.16, 0.03).mul(heatVeil));
    color = color.mul(flicker);

    const alpha = clamp(
      density.mul(0.84)
        .add(core.mul(0.32))
        .add(tongues.mul(0.18))
        .add(palmGlow.mul(0.5))
        .add(magicRing.mul(0.48))
        .add(runePulse.mul(0.28))
        .add(sparks.mul(0.42))
        .add(emberFlakes.mul(0.24))
        .add(heatVeil),
      0,
      0.98,
    );
    return vec4(color, alpha.mul(spellCardEdgeFade()));
  })();

  const material = new MeshBasicNodeMaterial();
  material.name = 'fire-spell-node';
  material.colorNode = fragment.xyz;
  material.opacityNode = fragment.w;
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.side = THREE.FrontSide;
  material.blending = THREE.AdditiveBlending;
  material.toneMapped = false;
  return { material, uTime, uProgress };
}

export { createFireNodeMaterial };
