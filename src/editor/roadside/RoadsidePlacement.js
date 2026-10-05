export function normalizeRoadsidePlacement(value, tileSize = 2) {
  if (value == null) return undefined;
  if (!value || typeof value !== 'object' || !/^lantern-v1:[0-9a-f]+:\d+:[LR]$/.test(value.sourceKey)
    || !Number.isFinite(value.yaw) || Math.abs(value.yaw) > Math.PI * 2
    || !Number.isFinite(value.offsetX) || Math.abs(value.offsetX) > tileSize
    || !Number.isFinite(value.offsetZ) || Math.abs(value.offsetZ) > tileSize) {
    throw new Error('Invalid promoted roadside placement.');
  }
  const offsetY = value.offsetY ?? 0;
  if (!Number.isFinite(offsetY) || Math.abs(offsetY) > tileSize) throw new Error('Invalid promoted roadside height.');
  return Object.freeze({ sourceKey: value.sourceKey, offsetX: value.offsetX, offsetZ: value.offsetZ, offsetY, yaw: value.yaw });
}
