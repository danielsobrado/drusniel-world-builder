import { TEXTURE_METRES } from '../assets/godsEnd/houseTextureData.js';

const surfaces = [
  ['stone', 'Village stone', 'walls'], ['darkStone', 'Village dark stone', 'walls'],
  ['plaster', 'Village plaster', 'walls'], ['wood', 'Village timber', 'wood'],
  ['planks', 'Village planks', 'wood'], ['deck', 'Village deck', 'wood'],
  ['roofTiles', 'Village clay tiles', 'roof'], ['roofSlate', 'Village slate', 'roof'],
  ['window', 'Village leaded glass', 'recess'],
];

export const GODS_END_WORKSHOP_PRESETS = Object.freeze(Object.fromEntries(
  surfaces.map(([surface, label, family]) => {
    const id = `gods-end-${surface.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    return [id, Object.freeze({
      id, label, family, proceduralSurface: surface,
      baseColor: '#ffffff', tint: '#ffffff', roughness: surface === 'window' ? 0.35 : 0.9,
      metalness: surface === 'window' ? 0.2 : 0, normalStrength: 1, aoStrength: 1,
      heightStrength: 0, weathering: 0, mapping: 'projected',
      repeat: 1 / TEXTURE_METRES[surface], rotation: 0, alignment: 'world',
      sources: Object.freeze({}),
    })];
  }),
));
