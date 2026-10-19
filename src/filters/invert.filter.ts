import type { FilterDef } from './types';

const filter: FilterDef = {
  id: 'invert',
  label: 'Inverter cores',
  params: [{ key: 'strength', label: 'Intensidade', min: 0, max: 1, step: 0.01, value: 1 }],
  glsl: `
vec4 applyFilter(vec2 p) {
  vec4 c = sampleScene(p);
  return vec4(mix(c.rgb, 1.0 - c.rgb, uP_strength), 1.0);
}`,
};

export default filter;
