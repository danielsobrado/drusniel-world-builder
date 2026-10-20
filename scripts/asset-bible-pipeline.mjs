import process from 'node:process';

import {
  auditAllAssetsProduction,
  buildAssetPromptPack,
  buildRegionScenePromptPack,
  inspectAssetProductionFiles,
  scaffoldAssetWorkspace,
} from '../src/worldIdentity/AssetProductionPipeline.js';
import { LORE_REALM_CATALOG } from '../src/worldIdentity/VisualIdentityCatalog.js';

function printUsage() {
  console.log(`Usage: node scripts/asset-bible-pipeline.mjs <command> [target]

Commands:
  status                    Report asset production counts by status, priority, region, and overlay
  validate                  Verify no asset claims reference-approved or ready without on-disk files
  prompts <asset-id|realm>  Print 6-view orthographic + PBR material prompt pack JSON
  inspect <asset-id>        Inspect reference views, brief, and GLB readiness for one asset
  scaffold <asset-id>       Create docs/asset-bible/references/<asset-id>/brief.md, material-notes.md, prompts.json
`);
}

const [, , command = 'status', target = ''] = process.argv;

if (command === 'status' || command === 'validate') {
  const report = auditAllAssetsProduction(process.cwd());
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) {
    process.exitCode = 1;
  }
} else if (command === 'prompts') {
  if (!target) {
    printUsage();
    process.exitCode = 1;
  } else if (LORE_REALM_CATALOG[target] || target === 'contian') {
    console.log(JSON.stringify(buildRegionScenePromptPack(target), null, 2));
  } else {
    console.log(JSON.stringify(buildAssetPromptPack(target), null, 2));
  }
} else if (command === 'inspect') {
  if (!target) {
    printUsage();
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(inspectAssetProductionFiles(target, process.cwd()), null, 2));
  }
} else if (command === 'scaffold') {
  if (!target) {
    printUsage();
    process.exitCode = 1;
  } else {
    const result = scaffoldAssetWorkspace(target, process.cwd());
    console.log(JSON.stringify(result, null, 2));
  }
} else {
  printUsage();
  process.exitCode = 1;
}
