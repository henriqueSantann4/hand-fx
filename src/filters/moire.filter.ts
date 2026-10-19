import type { FilterDef } from './types';

/** Moiré: duas grades de linhas, uma levemente girada, que se movem e criam as ondas de interferência. */
const filter: FilterDef = {
  id: 'moire',
  label: 'Moiré',
  params: [
    { key: 'intensity', label: 'Intensidade', min: 0, max: 1, step: 0.01, value: 0.5 },
    { key: 'size', label: 'Tamanho das linhas', min: 3, max: 40, step: 1, value: 8 },
    { key: 'angle', label: 'Ângulo entre as grades', min: 1, max: 25, step: 1, value: 6 },
    { key: 'freq', label: 'Frequência (velocidade)', min: 0, max: 5, step: 0.1, value: 0.6 },
  ],
  glsl: `
float mrGrid(vec2 p, float angle, float period, float shift) {
  vec2 d = vec2(cos(angle), sin(angle));
  return 0.5 + 0.5 * sin(6.2831853 * (dot(p, d) + shift) / period);
}

vec4 applyFilter(vec2 p) {
  vec4 c = sampleScene(p);
  float period = max(uP_size, 2.0);
  float a = mrGrid(p, 0.0, period, uTime * uP_freq * period * 0.5);
  float b = mrGrid(p, radians(uP_angle), period, 0.0);
  // As duas grades juntas: onde as duas são escuras, escurece
  float pattern = smoothstep(0.25, 0.75, a * b * 2.0);
  vec3 shaded = c.rgb * mix(1.0, pattern, uP_intensity);
  return vec4(shaded, 1.0);
}`,
};

export default filter;
