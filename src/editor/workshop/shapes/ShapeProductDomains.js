export function shapeProductDomains(plan, recipe) {
  if (plan.primitive.kind === 'traversal') return ['traversal'];
  return [
    'walls',
    ...(plan.primitive.roof ? ['roof'] : []),
    ...(plan.primitive.facade === 'timber' || plan.primitive.shutters || plan.decorations?.some((d) => d.role === 'window-box') ? ['facade'] : []),
    ...(plan.supports?.length ? ['supports'] : []),
    ...(recipe.ivy ? ['ivy'] : []),
  ];
}

const body = (primitive) => {
  const { roof, openings, suppressed, facade, shutters, automaticGates, craft, ...fields } = primitive;
  void roof;
  void suppressed;
  void facade;
  void shutters;
  void automaticGates;
  void craft;
  return { ...fields, openings };
};

/** Keys express consumer dependencies, so roof edits do not rebuild masonry. */
export function shapeProductKey(recipe, plan, domain) {
  const p = plan.primitive;
  const neighbors = (plan.neighbors ?? []).map((n) => ({
    id: n.id,
    boundary: n.boundary,
    topBoundary: n.topBoundary,
    primitive: body(n.primitive),
  }));
  const shape =
    domain === 'supports'
      ? { id: p.id, label: p.label, supports: plan.supports }
      : domain === 'roof'
        ? {
            id: p.id,
            label: p.label,
            position: p.position,
            rotation: p.rotation,
            elevation: p.elevation,
            height: p.height,
            thickness: p.thickness,
            taper: p.taper,
            footprint: p.footprint,
            roof: p.roof,
            decorations: plan.decorations?.filter((d) => d.role === 'chimney'),
            neighbors: (plan.neighbors ?? []).map((n) => ({
              id: n.id,
              boundary: n.boundary,
              topBoundary: n.topBoundary,
              curve: n.curve,
              primitive: { ...body(n.primitive), roof: n.primitive.roof },
            })),
          }
        : domain === 'facade'
          ? {
              primitive: body(p),
              facade: p.facade,
              shutters: p.shutters,
              decorations: plan.decorations?.filter((d) => d.role === 'window-box'),
              roof: p.facade === 'timber' ? p.roof : null,
              neighbors,
            }
          : domain === 'traversal'
            ? plan
            : {
                primitive: body(p),
                openings: plan.openings,
                neighbors,
                flatCoping: p.roof?.family === 'flat',
              };
  const regions = {
    walls: ['walls', 'trim', 'inserts', 'glazing', 'metal'],
    roof: ['roof', 'walls', 'trim', 'metal'],
    supports: ['trim'],
    ivy: ['foliage'],
    traversal: ['deck', 'trim'],
    facade: ['inserts', 'foliage'],
  }[domain];
  const overrides = Object.fromEntries(
    Object.entries(recipe.materialAreaOverrides ?? {}).filter(
      ([id]) => id.startsWith(`${p.id}:`) && regions.includes(id.slice(p.id.length + 1)),
    ),
  );
  return JSON.stringify([
    domain,
    shape,
    recipe.seed,
    recipe.detail,
    recipe.style,
    recipe.finish,
    domain === 'roof' ? recipe.topStyle : null,
    recipe.surfaceTextures,
    recipe.materialLibrary,
    recipe.materialDefaults,
    overrides,
  ]);
}
