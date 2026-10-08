import { buildSettlementMeshData } from './SettlementMeshData.js';

self.onmessage = ({ data: { id, style, kind, variant } }) => {
  try {
    const { data, transfer } = buildSettlementMeshData(style, kind, variant);
    self.postMessage({ id, data }, transfer);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
