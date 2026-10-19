import type { FilterDef } from './types';

/**
 * Nuvem de pontos: a imagem vira pontos coloridos, e o brilho dá uma profundidade falsa (mais claro = mais
 * perto). Os pontos se deslocam de acordo com a profundidade, como se a câmera girasse em volta, e os mais
 * claros ficam na frente dos mais escuros. É uma simulação em shader (não há geometria 3D de verdade),
 * por isso funciona dentro da moldura.
 */
const filter: FilterDef = {
  id: 'pointcloud',
  label: 'Nuvem de pontos',
  params: [
    { key: 'size', label: 'Tamanho dos pontos', min: 4, max: 30, step: 1, value: 8 },
    { key: 'depth', label: 'Profundidade', min: 0, max: 100, step: 1, value: 40 },
    { key: 'freq', label: 'Frequência (velocidade do giro)', min: 0, max: 3, step: 0.1, value: 0.6 },
    { key: 'bg', label: 'Fundo (0 = preto, 1 = imagem)', min: 0, max: 1, step: 0.05, value: 0.15 },
  ],
  glsl: `
#define PCR 4

vec4 applyFilter(vec2 p) {
  float s = max(uP_size, 2.0);
  vec2 cell = floor(p / s);
  // A profundidade não pode passar do que a busca nas células vizinhas alcança
  float depth = min(uP_depth, float(PCR - 1) * s);
  // Direção do deslocamento: gira devagar, como uma câmera orbitando
  vec2 shift = vec2(sin(uTime * uP_freq), cos(uTime * uP_freq * 0.8)) * depth;

  vec3 bg = sampleScene(p).rgb * uP_bg;
  vec3 color = bg;
  float front = -1.0;

  for (int dy = -PCR; dy <= PCR; dy++) {
    for (int dx = -PCR; dx <= PCR; dx++) {
      vec2 center = (cell + vec2(float(dx), float(dy)) + 0.5) * s;
      vec3 c = sampleScene(center).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      // Mais claro = mais perto = desloca mais; também fica um pouco maior
      vec2 pos = center + shift * (l - 0.5);
      float radius = s * 0.5 * (0.65 + 0.5 * l);
      if (length(p - pos) < radius && l >= front) {
        front = l;
        color = c * (0.55 + 0.45 * l);
      }
    }
  }
  return vec4(color, 1.0);
}`,
};

export default filter;
