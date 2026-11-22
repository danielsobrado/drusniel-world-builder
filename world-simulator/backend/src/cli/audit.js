#!/usr/bin/env node
import path from 'node:path';
import { loadConfig } from '../config/loadConfig.js';
import { buildWorldModel } from '../world/WorldModel.js';
import { buildReports } from '../reports/ReportBuilder.js';
import { writeReports } from '../reports/ReportWriter.js';
import { log } from '../log.js';

try {
  const config = loadConfig();
  const model = buildWorldModel(config);
  const directory = path.resolve(config.root, config.simulator.output.directory);
  const written = writeReports(buildReports(model), directory);
  const { audit, connectivity, scenarios, pilot } = model;
  log.info('audit complete', {
    mapId: audit.identity.mapId,
    sourceFingerprint: audit.identity.sourceFingerprint,
    counts: audit.counts,
    referenceCheck: audit.referenceCheck,
    population: audit.population,
    invalidRecords: audit.invalidRecords.length,
    connectivity: connectivity.summary,
    budgets: scenarios.map((b) => ({ target: b.target, allocated: b.allocated, feasible: b.feasible })),
    pilot: pilot.roles.map((r) => `${r.role}:${r.sourceId} ${r.name} (${r.npcs} NPCs)`),
    pilotNpcs: pilot.totalNpcs,
    output: path.relative(config.root, directory),
    files: written,
  });
} catch (error) {
  log.error('audit failed', error);
  process.exitCode = 1;
}
