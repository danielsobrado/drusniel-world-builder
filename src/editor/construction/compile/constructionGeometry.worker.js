import { buildConstructionGeometry } from './buildConstructionGeometry.js';
import { constructionGeometryBuffers } from './ConstructionGeometryCodec.js';

self.addEventListener('message', ({ data }) => {
  const { id, request } = data;
  try {
    const product = buildConstructionGeometry(request);
    self.postMessage({ id, product }, constructionGeometryBuffers(product));
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
