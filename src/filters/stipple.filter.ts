import type { FilterDef } from './types';

/** Pontilhado: pontos que ficam maiores nas áreas escuras e menores nas claras. */
const filter: FilterDef = {
  id: 'stipple',
  label: 'Pontilhado',
  params: [
    { key: 'size', label: 'Tamanho dos pontos', min: 3, max: 40, step: 1, value: 8 },
    { key: 'intensity', label: 'Intensidade (tamanho dos pontos escuros)', min: 0.3, max: 1.6, step: 0.05, value: 1 },
    { key: 'color', label: 'Cor (0 = preto e branco, 1 = colorido)', min: 0, max: 1, step: 1, value: 0 },
  ],
  glsl: `
vec4 applyFilter(vec2 p) {
  float s = max(uP_size, 2.0);
  vec2 cell = floor(p / s);
  vec2 center = (cell + 0.5) * s;
  vec3 c = sampleScene(center).rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float radius = (1.0 - lum) * s * 0.7 * uP_intensity;
  float d = length(p - center);
  float dot_ = 1.0 - smoothstep(radius - 1.0, radius + 1.0, d);
  vec3 paper = uP_color > 0.5 ? vec3(0.96) : vec3(1.0);
  vec3 ink = uP_color > 0.5 ? c * 0.9 : vec3(0.0);
  return vec4(mix(paper, ink, dot_), 1.0);
}`,
};

export default filter;
