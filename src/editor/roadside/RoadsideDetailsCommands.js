/** Generated-to-authored promotion is an explicit, undoable semantic transaction. */
export function changeRoadsideDetail(controller, detail, { promote = false } = {}) {
  const store = controller.roadsideDetails;
  const before = store.toDocument();
  let object = null;
  try {
    if (promote) {
      const x = Math.floor(detail.cellX), z = Math.floor(detail.cellZ);
      const validation = controller.validateObjectPlacement({ definitionKey: detail.definitionKey, x, z, rotation: 0 });
      if (!validation.valid) throw new Error(validation.reason);
      object = controller.objectMap.place({ definitionKey: detail.definitionKey, x, z, rotation: 0,
        roadsidePlacement: { offsetX: detail.x - (x + 0.5) * controller.tileMap.tileSize,
          offsetZ: detail.z + (z + 0.5) * controller.tileMap.tileSize,
          offsetY: detail.height - validation.surface.baseHeight, yaw: detail.rotationY, sourceKey: detail.key } });
    }
    store.suppress(detail.key);
    controller.commitHistory({ kind: 'roadside-detail', before, after: store.toDocument(), object });
    controller.refreshObjects();
    controller.emitMap();
    if (object) controller.setSelectedObject(object.id);
    return object;
  } catch (error) {
    if (object) controller.objectMap.remove(object.id);
    store.replaceDocument(before);
    throw error;
  }
}
