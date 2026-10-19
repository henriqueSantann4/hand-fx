import type { FilterDef } from './types';

const filter: FilterDef = {
  id: 'blur',
  label: 'Desfoque',
  params: [{ key: 'radius', label: 'Raio (px)', min: 1, max: 80, step: 1, value: 18 }],
  glsl: `
vec4 applyFilter(vec2 p) {
  vec4 acc = vec4(0.0);
  for (int i = 0; i < 32; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 32.0);
    float a = fi * 2.39996323; // ângulo áureo: espalha as amostras em espiral
    acc += sampleScene(p + vec2(cos(a), sin(a)) * r * uP_radius);
  }
  return acc / 32.0;
}`,
};

export default filter;
