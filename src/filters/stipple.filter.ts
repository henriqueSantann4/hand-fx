import type { FilterDef } from './types';

/**
 * Stippling (pontilhado) de tinta, como num desenho a bico de pena: pontos pequenos e muito numerosos, em
 * posições aleatórias, sobre papel branco. O tom vem de quantos pontos há (e um pouco do tamanho deles):
 * claro = poucos pontos, escuro = pontos juntos que quase viram preto.
 *
 * Com um rosto na câmera, só o rosto fica com a densidade cheia e o fundo clareia até quase branco
 * (o app acha o rosto com o MediaPipe, veja core/faceTracker.ts). Sem rosto, a imagem inteira é pontilhada.
 *
 * Passos: 1) o brilho ganha mais contraste local para os traços do rosto aparecerem;
 * 2) uma curva de tons manda o claro para o branco do papel e o escuro para o preto;
 * 3) cada célula sorteia se tem um ponto, de que tamanho e onde, de acordo com o tom.
 */
const filter: FilterDef = {
  id: 'stipple',
  label: 'Stippling',
  face: true,
  faceSize: 1.3,
  params: [
    { key: 'size', label: 'Tamanho dos pontos', min: 2, max: 12, step: 0.5, value: 3 },
    { key: 'ink', label: 'Tinta (mais = mais escuro)', min: 0, max: 1, step: 0.05, value: 0.5 },
    { key: 'contrast', label: 'Contraste', min: 0.5, max: 3, step: 0.05, value: 1.5 },
    { key: 'bg', label: 'Fundo (0 = branco, 1 = igual ao rosto)', min: 0, max: 1, step: 0.01, value: 0.03 },
    { key: 'color', label: 'Cor (0 = preto e branco, 1 = colorido)', min: 0, max: 1, step: 1, value: 0 },
  ],
  glsl: `
float stH(vec2 v) { return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453); }
float stLum(vec2 q) { return dot(sampleScene(q).rgb, vec3(0.299, 0.587, 0.114)); }

// Valores fixos (antes eram sliders): realce dos traços, variação do tamanho e borda do rosto
const float ST_DETAIL = 0.9;
const float ST_DOTS = 0.6;
const float ST_FEATHER = 0.35;

// Quanta tinta (0 a 1) vai neste ponto da imagem
float stInk(vec2 q, float s) {
  float l0 = stLum(q);
  // Brilho médio em volta (4 amostras): a diferença para o ponto realça bordas e traços
  float r = s * 4.0;
  float lb = 0.25 * (stLum(q + vec2(r, 0.0)) + stLum(q - vec2(r, 0.0)) + stLum(q + vec2(0.0, r)) + stLum(q - vec2(0.0, r)));
  float l = l0 + ST_DETAIL * (l0 - lb);
  // "Tinta" sobe juntos o brilho do branco (sem pontos) e o do preto (tudo tinta)
  float k = uP_ink - 0.5;
  float white = 0.8 + k * 0.4;
  float black = max(0.08 + k * 0.16, 0.0);
  float t = clamp((l - black) / max(white - black, 0.05), 0.0, 1.0);
  t = clamp(0.5 + (t - 0.5) * uP_contrast, 0.0, 1.0);
  return 1.0 - t;
}

vec4 applyFilter(vec2 p) {
  float s = max(uP_size, 1.5);
  // Fora do rosto a quantidade de tinta é multiplicada por "fundo" (quase nada)
  float area = mix(uP_bg, 1.0, faceMask(p, ST_FEATHER * uFaceRadius));

  vec2 cell = floor(p / s);
  float ink = 0.0;
  vec3 inkColor = vec3(0.0);

  // Cada pixel olha os pontos das 9 células em volta (um ponto pode passar um pouco da própria célula)
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = cell + vec2(float(i), float(j));
      vec2 jitter = vec2(stH(id), stH(id + 19.19)) - 0.5;
      vec2 c = (cell + vec2(float(i), float(j)) + 0.5 + jitter * 0.8) * s;

      float dens = stInk(c, s) * area;
      // Sorteio: a chance de a célula ter um ponto é a quantidade de tinta
      if (stH(id * 1.37 + 5.1) >= dens) continue;

      // Pontos maiores onde há mais tinta, com variação de tamanho de ponto para ponto
      float rad = s * (0.30 + 0.28 * dens) * mix(1.0, 0.55 + 0.9 * stH(id * 0.73 + 11.7), ST_DOTS);
      rad = max(rad, 0.8);
      float cov = 1.0 - smoothstep(rad - 0.7, rad + 0.7, length(p - c));
      if (cov > ink) {
        ink = cov;
        inkColor = uP_color > 0.5 ? sampleScene(c).rgb * 0.85 : vec3(0.0);
      }
    }
  }

  vec3 paper = uP_color > 0.5 ? vec3(0.96) : vec3(1.0);
  return vec4(mix(paper, inkColor, ink), 1.0);
}`,
};

export default filter;
