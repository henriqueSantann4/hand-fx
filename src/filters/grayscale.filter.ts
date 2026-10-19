import type { FilterDef } from './types';

const filter: FilterDef = {
  id: 'grayscale',
  label: 'Preto e branco',
  params: [
    { key: 'strength', label: 'Intensidade', min: 0, max: 1, step: 0.01, value: 1 },
    { key: 'contrast', label: 'Contraste', min: 0.5, max: 3, step: 0.05, value: 1 },
  ],
  glsl: `
vec4 applyFilter(vec2 p) {
  vec4 c = sampleScene(p);
  float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  g = (g - 0.5) * uP_contrast + 0.5;
  return vec4(mix(c.rgb, vec3(g), uP_strength), 1.0);
}`,
};

export default filter;
