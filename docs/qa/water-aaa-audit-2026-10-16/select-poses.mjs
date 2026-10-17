// Browser-side seeded sampling of real production geography. No terrain edits.
export function selectProceduralWaterPoses({ seed = 20261016 } = {}) {
  const store = window.__editor.terrainView.worldStore, g = store.generator, size = store.tileSize;
  let state = seed >>> 0, sampled = 0;
  const next = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const wanted = new Set([1, 4, 6, 9, 10, 12]), poses = [];
  const names = ['Marine', 'Hot desert', 'Cold desert', 'Savanna', 'Grassland', 'Tropical seasonal forest', 'Temperate deciduous forest', 'Tropical rainforest', 'Temperate rainforest', 'Taiga', 'Tundra', 'Glacier', 'Wetland'];
  for (; sampled < 100000 && wanted.size; sampled++) {
    const cx = Math.floor(next() * 16000) - 8000, cz = Math.floor(next() * 16000) - 8000;
    const biome = g.sampleTile(cx, cz);
    if (!wanted.has(biome)) continue;
    let target = null;
    for (const radius of [8, 16, 24]) {
      for (let j = 0; j < 8; j++) {
        const a = j * Math.PI / 4, tx = cx + Math.round(Math.cos(a) * radius), tz = cz + Math.round(Math.sin(a) * radius);
        if (g.sampleTile(tx, tz) !== 0) continue;
        const water = g.sampleWater(tx + .5, tz + .5);
        if (water.kind === 1 && water.depth > .6) { target = { x: (tx + .5) * size, z: -(tz + .5) * size, water }; break; }
      }
      if (target) break;
    }
    if (!target) continue;
    const x = (cx + .5) * size, z = -(cz + .5) * size;
    poses.push({ id: `coast-${String(biome).padStart(2, '0')}`, name: `${names[biome]} coast`, world: 'procedural',
      x, z, yaw: Math.atan2(x - target.x, z - target.z), pitch: -.32, mode: 'fly', heightAboveGround: 9, fov: 68,
      expectedBiomeId: biome, expectedWaterKind: 1, target, selection: 'First qualifying land point for this biome in seeded random candidates; first ocean neighbour in increasing search radius.' });
    wanted.delete(biome);
  }
  if (wanted.size) throw new Error(`Missing procedural coast biomes: ${[...wanted]}`);
  poses.sort((a, b) => a.expectedBiomeId - b.expectedBiomeId);
  const coast = poses.find(p => p.expectedBiomeId === 4);
  poses.push({ ...coast, id: 'coast-04-player', name: 'Grassland coast at player height', mode: 'player', heightAboveGround: 1.7, pitch: -.08, selection: 'Player-height companion to seeded grassland coast.' });
  // A deep point selected independently, rather than calling every blue surface a sea.
  for (let i = 0; i < 10000; i++) {
    const cx = Math.floor(next() * 16000) - 8000, cz = Math.floor(next() * 16000) - 8000;
    if (g.sampleTile(cx, cz) !== 0) continue;
    const water = g.sampleWater(cx + .5, cz + .5);
    if (water.kind !== 1 || water.depth < 10) continue;
    const x = (cx + .5) * size, z = -(cz + .5) * size;
    poses.push({ id: 'open-sea', name: 'Open sea', world: 'procedural', x, z, yaw: next() * Math.PI * 2,
      pitch: -.14, mode: 'fly', heightAboveGround: water.depth + 4, fov: 68, expectedBiomeId: 0, expectedWaterKind: 1,
      target: { x, z, water }, selection: 'First independently sampled ocean point deeper than 10 m.' });
    break;
  }
  return { seed, sampled, generator: g.toMetadata(), tileSize: size, poses };
}

export function selectImportedWaterPoses({ seed = 20261017 } = {}) {
  const store = window.__editor.terrainView.worldStore, g = store.generator, size = store.tileSize, model = g.waterTerrainModel;
  let state = seed >>> 0;
  const next = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  const names = ['Marine', 'Hot desert', 'Cold desert', 'Savanna', 'Grassland', 'Tropical seasonal forest', 'Temperate deciduous forest', 'Tropical rainforest', 'Temperate rainforest', 'Taiga', 'Tundra', 'Glacier', 'Wetland'];
  const segments = model.riverChannel.segments, poses = [], biomes = new Set();
  let sampled = 0;
  for (; sampled < 10000 && poses.length < 4; sampled++) {
    const index = Math.floor(next() * segments.length), s = segments[index], t = .15 + next() * .7;
    if (s.radiusCells * size > 150 || s.radiusCells * size < 4) continue;
    const cx = s.ax + s.dx * t, cz = s.az + s.dz * t, water = g.sampleWater(cx, cz);
    if (water.kind !== 3 || water.depth < .3) continue;
    const nx = -s.dz / s.length, nz = s.dx / s.length, side = next() > .5 ? 1 : -1;
    const bx = cx + nx * (s.radiusCells + 5 / size) * side, bz = cz + nz * (s.radiusCells + 5 / size) * side;
    const biome = g.sampleTile(Math.floor(bx), Math.floor(bz));
    if (!biome || biomes.has(biome)) continue;
    const x = bx * size, z = -bz * size, target = { x: cx * size, z: -cz * size, water };
    const pitch = -Math.atan2(g.sampleHeight(bx, bz) + 7 - water.surfaceHeight, Math.hypot(target.x - x, target.z - z));
    if (pitch < -.9 || pitch > -.05) continue;
    poses.push({ id: `river-${String(biome).padStart(2, '0')}`, name: `${names[biome]} river`, world: 'eldara', x, z,
      yaw: Math.atan2(x - target.x, z - target.z), pitch, mode: 'fly', heightAboveGround: 7, fov: 68,
      expectedBiomeId: biome, expectedWaterKind: 3, target, segmentIndex: index, radiusMeters: s.radiusCells * size,
      selection: 'Seeded random segment and longitudinal position, first qualifying bank for each distinct biome; nominal channel radius 4–150 m.' });
    biomes.add(biome);
  }
  const lakes = model.lakes?.lakes ?? [];
  for (let attempt = 0; attempt < 1000 && !poses.some(p => p.id === 'lake-bank'); attempt++) {
    const lake = lakes[Math.floor(next() * lakes.length)];
    if (!lake) break;
    const index = Math.floor(next() * lake.xs.length), j = (index + 1) % lake.xs.length, t = .2 + next() * .6;
    const cx = lake.xs[index] * (1 - t) + lake.xs[j] * t, cz = lake.zs[index] * (1 - t) + lake.zs[j] * t;
    const dx = lake.xs[j] - lake.xs[index], dz = lake.zs[j] - lake.zs[index], len = Math.hypot(dx, dz);
    if (len < 1) continue;
    const nx = -dz / len, nz = dx / len;
    let previous = null;
    for (let offset = -700 / size; offset <= 700 / size; offset += 2 / size) {
      const px = cx + nx * offset, pz = cz + nz * offset, loc = model.lakes.locate(px, pz);
      if (!loc) continue;
      const inside = loc.distanceMeters < 0;
      if (previous && previous.inside !== inside) {
        const toward = inside ? 1 : -1;
        const bx = px - nx * toward * 8 / size, bz = pz - nz * toward * 8 / size;
        const tx = px + nx * toward * 24 / size, tz = pz + nz * toward * 24 / size;
        const water = g.sampleWater(tx, tz), biome = g.sampleTile(Math.floor(bx), Math.floor(bz));
        if (water.kind !== 2 || biome === 0) break;
        const x = bx * size, z = -bz * size, target = { x: tx * size, z: -tz * size, water };
        poses.push({ id: 'lake-bank', name: `${names[biome]} lake bank`, world: 'eldara', x, z,
          yaw: Math.atan2(x - target.x, z - target.z), pitch: -.25, mode: 'fly', heightAboveGround: 5, fov: 68,
          expectedBiomeId: biome, expectedWaterKind: 2, target, lakeId: lake.id, lakeName: lake.name,
          selection: 'Seeded random lake outline segment, then a 2 m cross-section search for the resolved noisy shoreline.' });
        break;
      }
      previous = { inside };
    }
  }
  return { seed, sampled, segmentCount: segments.length, lakeCount: lakes.length, tileSize: size, poses };
}
