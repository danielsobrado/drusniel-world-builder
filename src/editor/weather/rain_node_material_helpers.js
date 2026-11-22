import {
  abs,
  clamp,
  cos,
  dot,
  float,
  floor,
  Fn,
  fract,
  length,
  min,
  mix,
  mod,
  sin,
  smoothstep,
  vec2,
  vec4,
  uv
} from "three/tsl";
function hash12(uv2) {
  return fract(cos(mod(dot(uv2, vec2(13.9898, 8.141)), 3.14)).mul(43758.5453));
}
function hash22(uv2) {
  const u = vec2(dot(uv2, vec2(127.1, 311.7)), dot(uv2, vec2(269.5, 183.3)));
  return float(2).mul(fract(sin(u).mul(43758.5453123)));
}
function noise(uv2) {
  const iuv = floor(uv2);
  const fuv = fract(uv2);
  const blurX = smoothstep(0, 1, fuv.x);
  const blurY = smoothstep(0, 1, fuv.y);
  return mix(
    mix(
      dot(hash22(iuv.add(vec2(0, 0))), fuv.sub(vec2(0, 0))),
      dot(hash22(iuv.add(vec2(1, 0))), fuv.sub(vec2(1, 0))),
      blurX
    ),
    mix(
      dot(hash22(iuv.add(vec2(0, 1))), fuv.sub(vec2(0, 1))),
      dot(hash22(iuv.add(vec2(1, 1))), fuv.sub(vec2(1, 1))),
      blurX
    ),
    blurY
  ).add(0.5);
}
function fbm(uv2) {
  let v = float(0);
  let amp = float(0.5);
  let u = uv2;
  for (let i = 0; i < 5; i++) {
    v = v.add(amp.mul(noise(u)));
    u = u.mul(2);
    amp = amp.mul(0.5);
  }
  return v;
}
function hardSplashFragment(age, params, color, opacity, intensity) {
  return Fn(() => {
    const p = uv().mul(2).sub(1);
    const r = length(p);
    r.greaterThan(1.04).discard();
    const young = smoothstep(0, 0.05, age).mul(float(1).sub(smoothstep(0.28, 0.48, age)));
    const radius = mix(0.06, 0.42, smoothstep(0, 0.36, age));
    const ring = float(1).sub(smoothstep(0.025, 0.07, abs(r.sub(radius))));
    const axis = min(abs(p.x), abs(p.y));
    const diag = min(abs(p.x.add(p.y)), abs(p.x.sub(p.y))).mul(0.7);
    const ray = float(1).sub(smoothstep(0.025, 0.13, min(axis, diag))).mul(smoothstep(0.04, 0.1, r)).mul(float(1).sub(smoothstep(0.24, 0.46, r)));
    const center = float(1).sub(smoothstep(0.015, 0.1, r)).mul(float(1).sub(smoothstep(0.08, 0.24, age)));
    const alpha = ring.mul(0.34).add(ray.mul(0.28)).add(center.mul(0.38)).mul(young).mul(params.w).mul(opacity).mul(clamp(intensity, 0, 1.6));
    alpha.lessThan(0.01).discard();
    return vec4(color, alpha);
  })();
}
function waterSplashFragment(age, params, color, opacity, intensity) {
  return Fn(() => {
    const p = uv().mul(2).sub(1);
    const r = length(p);
    r.greaterThan(1.04).discard();
    const seed = params.z;
    const varA = fract(sin(seed.mul(12.9898)).mul(43758.5453));
    const varB = fract(sin(seed.mul(78.233).add(1.7)).mul(28461.2317));
    const dir = p.div(r.max(1e-4));
    const c2 = dir.x.mul(dir.x).sub(dir.y.mul(dir.y));
    const s2 = dir.x.mul(dir.y).mul(2);
    const warp = c2.mul(varA.sub(0.5)).add(s2.mul(varB.sub(0.5))).mul(0.09);
    const rw = r.mul(float(1).add(warp));

    const rippleAge = clamp(age.sub(0.06).div(0.82), 0, 1);
    const maxRadius = mix(0.62, 0.94, varA);
    const rippleRadius = mix(0.09, maxRadius, smoothstep(0, 1, rippleAge));
    const rippleWidth = mix(0.011, 0.028, rippleAge);
    const rippleFade = smoothstep(0.05, 0.14, age).mul(float(1).sub(smoothstep(0.65, 0.98, age)));
    const primaryRing = float(1).sub(smoothstep(rippleWidth, rippleWidth.mul(2.1), abs(rw.sub(rippleRadius))));
    const innerRadius = rippleRadius.mul(mix(0.58, 0.72, varB));
    const innerRing = float(1).sub(smoothstep(rippleWidth.mul(0.85), rippleWidth.mul(1.9), abs(rw.sub(innerRadius))))
      .mul(smoothstep(0.18, 0.34, age)).mul(0.55);
    // Directional sky glint + subtle arc breakup along the ring.
    const arcLight = mix(0.32, 1.0, smoothstep(-0.55, 0.85, dir.x.mul(0.58).add(dir.y.mul(0.81))))
      .mul(mix(0.7, 1.0, c2.mul(0.5).add(0.5)));
    const ripple = primaryRing.add(innerRing).mul(rippleFade).mul(arcLight);

    const crownRadius = mix(0.04, mix(0.16, 0.26, varB), smoothstep(0, 0.18, age));
    const beads = smoothstep(0.15, 0.85, sin(dir.x.mul(5.2).add(dir.y.mul(4.7)).add(seed.mul(3.1))).mul(0.5).add(0.5));
    const crown = float(1).sub(smoothstep(0.014, 0.048, abs(rw.sub(crownRadius))))
      .mul(mix(0.35, 1.0, beads))
      .mul(float(1).sub(smoothstep(0.14, 0.28, age)));
    const center = float(1).sub(smoothstep(0.015, 0.075, r))
      .mul(float(1).sub(smoothstep(0.05, 0.15, age)));
    const dropGain = mix(0.52, 1.15, varA.mul(varB).add(varA).mul(0.5));
    const alpha = ripple.mul(0.46).add(crown.mul(0.34)).add(center.mul(0.28))
      .mul(dropGain).mul(params.w).mul(opacity).mul(clamp(intensity, 0, 1.6));
    alpha.lessThan(0.01).discard();
    return vec4(color, alpha);
  })();
}
export {
  fbm,
  hardSplashFragment,
  hash12,
  hash22,
  noise,
  waterSplashFragment
};
