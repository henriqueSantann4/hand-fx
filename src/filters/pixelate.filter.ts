import type { FilterDef } from './types';

const filter: FilterDef = {
  id: 'pixelate',
  label: 'Pixelização',
  params: [{ key: 'size', label: 'Força (tamanho dos pixels)', min: 2, max: 200, step: 1, value: 24 }],
  glsl: `
vec4 applyFilter(vec2 p) {
  float s = max(uP_size, 1.0);
  vec2 q = (floor((p + uView * 0.5) / s) + 0.5) * s - uView * 0.5;
  return sampleScene(q);
}`,
};

export default filter;
