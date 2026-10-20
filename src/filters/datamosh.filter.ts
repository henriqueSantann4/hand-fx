import type { FilterDef } from './types';

/**
 * Datamosh por fluxo óptico.
 *
 * O app mede o movimento da câmera por blocos (fluxo óptico) e usa esse movimento para arrastar a imagem
 * do quadro anterior, em vez de mostrar a câmera de novo. O resultado é o "derretido" clássico do datamosh:
 * o que se mexe puxa pedaços da imagem consigo, em blocos, e deixa rastros que só vão sumindo aos poucos
 * (onde nada se mexe a câmera volta rápido). Tudo roda na placa de vídeo (veja features/motionBuffer.ts).
 *
 * Os parâmetros strength, block, hard, recover, hold, threshold e keyframe são lidos pelo app;
 * chroma, pixel e grid só mudam o acabamento visual.
 */
const filter: FilterDef = {
  id: 'datamosh',
  label: 'Datamosh',
  motion: true,
  params: [
    { key: 'strength', label: 'Intensidade do arrasto', min: 0, max: 4, step: 0.05, value: 1.6 },
    { key: 'block', label: 'Tamanho dos blocos (px)', min: 8, max: 96, step: 2, value: 32 },
    { key: 'hard', label: 'Blocos duros (0 = suave, 1 = quadrados)', min: 0, max: 1, step: 0.05, value: 0.85 },
    { key: 'recover', label: 'Tempo para a imagem voltar (s)', min: 0.3, max: 12, step: 0.1, value: 2 },
    { key: 'hold', label: 'Segurar o rastro onde há movimento', min: 0, max: 1, step: 0.05, value: 0.6 },
    { key: 'threshold', label: 'Limite de movimento (menor = mais sensível)', min: 0.005, max: 0.12, step: 0.005, value: 0.03 },
    { key: 'keyframe', label: 'Quadro-chave: renova a imagem a cada (s, 0 = nunca)', min: 0, max: 20, step: 0.5, value: 0 },
    { key: 'chroma', label: 'Aberração de cor', min: 0, max: 1, step: 0.05, value: 0.25 },
    { key: 'pixel', label: 'Compressão (blocos em movimento pixelizam)', min: 0, max: 1, step: 0.05, value: 0.25 },
    { key: 'grid', label: 'Grade dos blocos em movimento', min: 0, max: 1, step: 0.05, value: 0.25 },
  ],
  glsl: `
vec4 applyFilter(vec2 p) {
  float blk = max(uP_block, 2.0);
  // Bloco em que este ponto está (a mesma grade em que o arrasto é calculado) e quanto ele se mexe
  vec2 gp = (p + uView * 0.5) / blk;
  vec2 qc = (floor(gp) + 0.5) * blk - uView * 0.5;
  float m = sampleFlow(qc).z;

  // Aberração de cor ao longo do movimento: vermelho e azul se separam na direção em que a imagem é puxada
  vec2 d = sampleFlow(p).xy * uView * uP_chroma * 1.5;
  float len = length(d);
  if (len > 18.0) d *= 18.0 / len;
  vec3 col = vec3(sampleMosh(p + d).r, sampleMosh(p).g, sampleMosh(p - d).b);

  // Compressão: blocos em movimento perdem detalhe e viram a cor média do bloco
  col = mix(col, sampleMosh(qc).rgb, uP_pixel * m);

  // Um pouco mais de cor onde o derretido está acontecendo
  float g = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(g), col, 1.0 + 0.2 * m);

  // Grade fina e escura nas bordas dos blocos em movimento
  vec2 f = fract(gp);
  vec2 edge = min(f, 1.0 - f) * blk;
  float line = 1.0 - smoothstep(0.0, 1.5, min(edge.x, edge.y));
  col *= 1.0 - uP_grid * 0.6 * line * m;

  return vec4(clamp(col, 0.0, 1.0), 1.0);
}`,
};

export default filter;
