import { abs, atan, cos, dot, exp, float, floor, mix, smoothstep, texture, time, uv, vec2 } from 'three/tsl';
import { stylizedFbm2 } from '../StylizedNoiseNodes.js';
const TWO_PI = Math.PI * 2;

/** Value noise in [-1,1], matching the original shaft dust term. */
function signedNoise(point) { return stylizedFbm2(point).mul(2).sub(1); }

export function ambientParticleShapeAlpha(shape, local, seed, puffTexture) {
  const r2 = dot(local, local);
  const r = r2.sqrt();
  const disc = smoothstep(0.75, 1, r).oneMinus();
  switch (shape) {
    case 'glint': {
      // A pinpoint with a faint four-point flare, like ice catching the sun.
      const core = exp(r2.mul(-26));
      const flare = exp(abs(local.x).mul(-9)).mul(exp(local.y.mul(local.y).mul(-160)))
        .add(exp(abs(local.y).mul(-9)).mul(exp(local.x.mul(local.x).mul(-160))));
      return core.add(flare.mul(0.45)).mul(disc);
    }
    case 'streak': {
      // Stretched along the wind (local.x); the leading end is the densest.
      const along = abs(local.x);
      const body = smoothstep(0.25, 1, along).oneMinus().mul(exp(local.y.mul(local.y).mul(-5)));
      return body.mul(mix(float(0.45), float(1), local.x.mul(0.5).add(0.5)));
    }
    case 'firefly':
      return exp(r2.mul(-34)).add(exp(r2.mul(-5)).mul(0.28)).mul(disc);
    case 'fluff': {
      // A seed head: a small core and fine radial filaments.
      const angle = atan(local.y, local.x);
      const spokes = abs(cos(angle.mul(9).add(seed.mul(TWO_PI)))).pow(24);
      return exp(r2.mul(-60)).add(spokes.mul(r.oneMinus().max(0)).mul(0.55))
        .add(exp(r2.mul(-3)).mul(0.12)).mul(disc);
    }
    case 'shaft': {
      // local.x across the beam, local.y along it (from the ground up).
      const across = exp(local.x.mul(local.x).mul(-7));
      const ends = smoothstep(-1, -0.35, local.y).mul(smoothstep(0.2, 1, local.y).oneMinus());
      const dust = signedNoise(vec2(local.x.mul(1.6), local.y.mul(5).sub(time.mul(0.12))).add(seed.mul(40)))
        .mul(0.5).add(0.75).clamp(0.25, 1.25);
      return across.mul(ends).mul(dust);
    }
    case 'puff': {
      if (!puffTexture) return exp(r2.mul(-3.5)).mul(disc);
      const sample = texture(puffTexture, uv());
      const variant = floor(seed.mul(4));
      return variant.lessThan(1).select(sample.r, variant.lessThan(2).select(sample.g,
        variant.lessThan(3).select(sample.b, sample.a)));
    }
    default:
      // 'soft': a round mote.
      return exp(r2.mul(-4.5)).mul(disc);
  }
}

