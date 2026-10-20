import type { FilterDef } from './types';

/** Frosted glass (vidro fosco): cada pontinho lê a câmera numa posição levemente sorteada, e a mistura dá o aspecto de vidro. */
const filter: FilterDef = {
  id: 'frosted',
  label: 'Frosted glass',
  params: [
    { key: 'intensity', label: 'Intensidade', min: 0, max: 80, step: 1, value: 14 },
    { key: 'size', label: 'Tamanho do grão', min: 1, max: 20, step: 1, value: 3 },
  ],
  glsl: `
vec2 frHash(vec2 c) {
  float a = fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(c, vec2(269.5, 183.3))) * 43758.5453);
  return vec2(a, b) - 0.5;
}

vec4 applyFilter(vec2 p) {
  vec2 cell = floor(p / max(uP_size, 1.0));
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    vec2 offset = frHash(cell + vec2(float(i) * 17.0, float(i) * 31.0)) * 2.0 * uP_intensity;
    sum += sampleScene(p + offset).rgb;
  }
  return vec4(sum / 6.0, 1.0);
}`,
};

export default filter;
