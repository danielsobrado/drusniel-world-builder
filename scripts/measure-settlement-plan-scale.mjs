// How long one settlement plan takes, and how big it is, across Azgaar populations.
//   node scripts/measure-settlement-plan-scale.mjs
// Population is in thousands, as Azgaar reports it. Ground is gently rolling and all
// buildable, so the numbers measure the planner, not a coastline.
import { planSettlement } from '../src/editor/world/settlements/SettlementPlanner.js';

const SIZES = [
  ['hamlet', 0.4], ['village', 1.8], ['town 5k', 5], ['city 16k', 16], ['city 38k', 38.5],
];
const sampleHeight = (x, z) => 20 + Math.sin(x * 0.013) * 2 + Math.cos(z * 0.011) * 2;

for (const [label, population] of SIZES) {
  const settlement = { id: 77, name: label, cellX: 0, cellZ: 0, population, capital: population > 10,
    walls: population > 3, plaza: true, citadel: population > 10 };
  planSettlement({ settlement, worldSeed: 9, sampleHeight }); // warm the JIT
  const runs = 3;
  const started = performance.now();
  let plan;
  for (let run = 0; run < runs; run += 1) plan = planSettlement({ settlement, worldSeed: 9, sampleHeight });
  const ms = (performance.now() - started) / runs;
  console.log(`${label.padEnd(9)} pop ${String(population).padStart(5)}k  radius ${plan.profile.radius.toFixed(0).padStart(4)} m`
    + `  buildings ${String(plan.buildings.length).padStart(5)}  streets ${String(plan.streets.length).padStart(4)}`
    + `  props ${String(plan.props.length).padStart(5)}  plan ${ms.toFixed(1).padStart(7)} ms`);
}
