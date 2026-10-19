import type { FilterDef } from './types';

/**
 * Pixel sorting (baseado no script pixelsort_video.py).
 *
 * Em cada linha, procura trechos seguidos de pixels cujo brilho está entre "mínimo" e "máximo". O começo de
 * cada trecho é ordenado pelo critério escolhido (brilho, matiz ou saturação), até um comprimento sorteado
 * por linha (o rastro "para do nada"). O que fica fora dos limites de brilho não muda.
 *
 * Diferenças para o script: roda na placa de vídeo, então a imagem é dividida em "células" (parâmetro
 * Tamanho do pixel) e o comprimento máximo é limitado (veja MAXC). A ordenação é feita por busca binária
 * do valor que cai em cada posição, sem precisar ordenar de verdade.
 */
const filter: FilterDef = {
  id: 'pixelsort',
  label: 'Pixel sorting',
  params: [
    { key: 'lo', label: 'Brilho mínimo', min: 0, max: 255, step: 1, value: 60 },
    { key: 'hi', label: 'Brilho máximo', min: 0, max: 255, step: 1, value: 200 },
    { key: 'length', label: 'Comprimento do rastro (px)', min: 10, max: 300, step: 5, value: 120 },
    { key: 'angle', label: 'Ângulo (0 = horizontal, 90 = vertical)', min: -90, max: 90, step: 1, value: 0 },
    { key: 'cell', label: 'Tamanho do pixel', min: 1, max: 8, step: 1, value: 3 },
    { key: 'key', label: 'Ordenar por (0 brilho, 1 matiz, 2 saturação)', min: 0, max: 2, step: 1, value: 0 },
    { key: 'reverse', label: 'Inverter a ordem (0 = não, 1 = sim)', min: 0, max: 1, step: 1, value: 0 },
    { key: 'shake', label: 'Agitação (mudanças por segundo)', min: 0, max: 30, step: 1, value: 12 },
    { key: 'flicker', label: 'Rajadas (0 = sempre ligado)', min: 0, max: 0.95, step: 0.05, value: 0 },
  ],
  glsl: `
#define MAXC 64

float psGray(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float psHash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }

// Valor (0 a 255) pelo qual os pixels são ordenados
float psKey(vec3 c) {
  if (uP_key < 0.5) return floor(psGray(c) * 255.0 + 0.5);
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float d = mx - mn;
  if (uP_key < 1.5) {
    float h = 0.0;
    if (d > 0.00001) {
      if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
      else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
      else h = (c.r - c.g) / d + 4.0;
      h /= 6.0;
    }
    return floor(h * 255.0 + 0.5);
  }
  return floor((mx > 0.0 ? d / mx : 0.0) * 255.0 + 0.5);
}

bool psInRange(vec3 c) {
  float g = psGray(c) * 255.0;
  return g >= uP_lo && g <= uP_hi;
}

// Cor da célula j da linha iv (a linha é a reta na direção dir, com cél. de tamanho cs)
vec3 psCell(float j, float iv, float cs, vec2 dir, vec2 nor) {
  return sampleScene(((j + 0.5) * cs) * dir + ((iv + 0.5) * cs) * nor).rgb;
}

vec4 applyFilter(vec2 p) {
  vec4 orig = sampleScene(p);

  // Rajadas: o efeito liga e desliga em blocos de tempo sorteados
  if (uP_flicker > 0.0 && psHash(floor(uTime * 6.0) * 1.37) < uP_flicker) return orig;

  float ang = radians(uP_angle);
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 nor = vec2(-dir.y, dir.x);
  float cs = max(uP_cell, 1.0);
  float iu = floor(dot(p, dir) / cs);
  float iv = floor(dot(p, nor) / cs);

  if (!psInRange(psCell(iu, iv, cs, dir, nor))) return orig;

  // Comprimento (em células) do trecho ordenado nesta linha: sorteado, e muda com o tempo
  float tslot = uP_shake > 0.0 ? floor(uTime * uP_shake) : 0.0;
  float maxC = min(float(MAXC), max(1.0, floor(uP_length / cs)));
  float L = floor(mix(max(1.0, maxC * 0.5), maxC, psHash(iv * 12.9898 + tslot * 78.233)) + 0.5);

  // Procura o começo do trecho, andando para trás. Se ele começou há L células ou mais, este pixel está
  // depois do pedaço ordenado e não muda.
  float start = iu;
  bool found = false;
  for (int k = 1; k <= MAXC; k++) {
    if (float(k) > L) break;
    if (!psInRange(psCell(iu - float(k), iv, cs, dir, nor))) {
      start = iu - float(k) + 1.0;
      found = true;
      break;
    }
  }
  if (!found) return orig;

  // Lê o pedaço (do começo do trecho até o fim dele ou até L células)
  float keys[MAXC];
  vec3 cols[MAXC];
  int m = 0;
  for (int k = 0; k < MAXC; k++) {
    if (float(k) >= L) break;
    vec3 s = psCell(start + float(k), iv, cs, dir, nor);
    if (!psInRange(s)) break;
    keys[k] = psKey(s);
    cols[k] = s;
    m = k + 1;
  }
  int r = int(iu - start + 0.5);
  if (r >= m || m == 0) return orig;
  if (uP_reverse > 0.5) r = m - 1 - r;

  // Qual pixel fica na posição r depois de ordenar? Busca binária do menor valor t em que
  // mais de r pixels têm chave <= t.
  float lowT = 0.0;
  float highT = 255.0;
  for (int it = 0; it < 8; it++) {
    float mid = floor((lowT + highT) * 0.5);
    int cnt = 0;
    for (int k = 0; k < MAXC; k++) {
      if (k >= m) break;
      if (keys[k] <= mid) cnt++;
    }
    if (cnt > r) highT = mid; else lowT = mid + 1.0;
  }
  vec3 result = cols[0];
  for (int k = 0; k < MAXC; k++) {
    if (k >= m) break;
    if (keys[k] == lowT) { result = cols[k]; break; }
  }
  return vec4(result, 1.0);
}`,
};

export default filter;
