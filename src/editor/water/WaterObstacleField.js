const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Local analytic wakes baked into a bounded RG8 field, never a fluid sim.
 * R is downstream disturbance, G is the upstream slow/split pocket. All math
 * uses canonical doubles; shared edge texels see the same nearby rocks.
 */
export function* bakeWaterObstacleField({ pixels, size, centerX, centerZ, meters, rocks, waterAt, rockHeight }) {
  pixels.fill(0);
  const step = meters / (size - 1), minX = centerX - meters / 2, maxZ = centerZ + meters / 2;
  for (const rock of rocks) {
    yield;
    if (!rock.surfaceData?.[1]) continue;
    const radius = Math.max(.45, Math.min(3, rock.radius ?? .7)), reach = radius * 6 + 2;
    if (rock.x < minX - reach || rock.x > minX + meters + reach || rock.z < maxZ - meters - reach || rock.z > maxZ + reach) continue;
    const water = waterAt(rock.x, rock.z);
    if (water.kind !== 3 || water.coverage < .5 || water.depth < .05
      || rock.height + rockHeight(rock) < water.surfaceHeight - .15) continue;
    const magnitude = Math.hypot(water.flowX, water.flowZ);
    if (magnitude < .01) continue;
    const fx = water.flowX / magnitude, fz = -water.flowZ / magnitude;
    const x0 = Math.max(0, Math.floor((rock.x - reach - minX) / step)), x1 = Math.min(size - 1, Math.ceil((rock.x + reach - minX) / step));
    const z0 = Math.max(0, Math.floor((maxZ - rock.z - reach) / step)), z1 = Math.min(size - 1, Math.ceil((maxZ - rock.z + reach) / step));
    for (let z = z0; z <= z1; z++) {
      yield;
      for (let x = x0; x <= x1; x++) {
        const dx = minX + x * step - rock.x, dz = maxZ - z * step - rock.z;
        const along = dx * fx + dz * fz, across = -dx * fz + dz * fx;
        const width = radius * .8 + Math.max(0, along) * .17;
        const wake = Math.exp(-((across / width) ** 2)) * smooth(0, radius, along) * (1 - smooth(radius * 2, reach, along));
        const pressure = Math.exp(-((across / (radius * 1.2)) ** 2))
          * smooth(-radius * 3, -radius, along) * (1 - smooth(-radius * .2, radius * .7, along));
        const index = (z * size + x) * 2;
        pixels[index] = Math.max(pixels[index], Math.round(wake * 255));
        pixels[index + 1] = Math.max(pixels[index + 1], Math.round(pressure * 255));
      }
    }
  }
  return pixels;
}
