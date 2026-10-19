import type { FilterDef } from './types';

/**
 * Slit-scan (rastro no tempo): cada coluna da moldura mostra um momento diferente do passado.
 * O que se mexe vira ondas e esticados. Usa os últimos quadros guardados pelo app (history: true).
 */
const filter: FilterDef = {
  id: 'slitscan',
  label: 'Slit-scan',
  history: true,
  params: [
    { key: 'span', label: 'Intensidade (tamanho do rastro)', min: 1, max: 22, step: 1, value: 14 },
    { key: 'repeat', label: 'Frequência (repetições)', min: 1, max: 6, step: 1, value: 1 },
    { key: 'vertical', label: 'Direção (0 = para o lado, 1 = vertical)', min: 0, max: 1, step: 1, value: 0 },
  ],
  glsl: `
vec4 applyFilter(vec2 p) {
  vec2 size = max(uBox.zw - uBox.xy, vec2(1.0));
  vec2 t2 = clamp((p - uBox.xy) / size, 0.0, 1.0);
  float t = uP_vertical > 0.5 ? 1.0 - t2.y : t2.x;
  // Com mais de uma repetição, o atraso sobe e desce (onda triangular)
  float f = max(uP_repeat, 1.0) * t;
  float wave = 1.0 - abs(fract(f * 0.5) * 2.0 - 1.0);
  return sampleHistory(p, wave * uP_span);
}`,
};

export default filter;
