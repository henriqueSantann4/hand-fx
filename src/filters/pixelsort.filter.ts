import type { FilterDef } from './types';

/**
 * Pixel sorting (baseado no script pixelsort_video.py), em versão simples.
 *
 * Em cada linha, procura trechos seguidos de pixels com brilho médio e ordena o começo de cada trecho por
 * brilho, até um comprimento sorteado por linha (o rastro "para do nada"). Roda na placa de vídeo, então o
 * comprimento é limitado (MAXC células) e a ordenação é feita por busca binária do valor de cada posição.
 *
 * Intensidade: quantos pixels entram no efeito (faixa de brilho em torno do meio: 0 = nenhum, 1 = todos).
 */
const filter: FilterDef = {
  id: 'pixelsort',
  label: 'Pixel sorting',
  params: [
    { key: 'intensity', label: 'Intensidade', min: 0, max: 1, step: 0.01, value: 0.55 },
    { key: 'length', label: 'Tamanho dos rastros', min: 10, max: 300, step: 5, value: 120 },
    { key: 'freq', label: 'Frequência (mudanças por segundo)', min: 0, max: 30, step: 1, value: 12 },
    { key: 'angle', label: 'Direção (0 = lado, 90 = vertical)', min: -90, max: 90, step: 1, value: 0 },
  ],
  glsl: `
#define MAXC 64
#define CELL 3.0

float psGray(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float psHash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }

// Entram no efeito os pixels com brilho numa faixa em torno do meio; a faixa cresce com a intensidade
bool psInRange(vec3 c) {
  float span = 0.5 * uP_intensity;
  float g = psGray(c);
  return g >= 0.5 - span && g <= 0.5 + span;
}

float psKey(vec3 c) { return floor(psGray(c) * 255.0 + 0.5); }

vec3 psCell(float j, float iv, vec2 dir, vec2 nor) {
  return sampleScene(((j + 0.5) * CELL) * dir + ((iv + 0.5) * CELL) * nor).rgb;
}

vec4 applyFilter(vec2 p) {
  vec4 orig = sampleScene(p);
  float ang = radians(uP_angle);
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 nor = vec2(-dir.y, dir.x);
  float iu = floor(dot(p, dir) / CELL);
  float iv = floor(dot(p, nor) / CELL);

  if (!psInRange(psCell(iu, iv, dir, nor))) return orig;

  // Comprimento (em células) do trecho ordenado nesta linha: sorteado, e muda com o tempo
  float tslot = uP_freq > 0.0 ? floor(uTime * uP_freq) : 0.0;
  float maxC = min(float(MAXC), max(1.0, floor(uP_length / CELL)));
  float L = floor(mix(max(1.0, maxC * 0.5), maxC, psHash(iv * 12.9898 + tslot * 78.233)) + 0.5);

  // Começo do trecho (andando para trás). Se começou há L células ou mais, este pixel fica depois do pedaço
  // ordenado e não muda.
  float start = iu;
  bool found = false;
  for (int k = 1; k <= MAXC; k++) {
    if (float(k) > L) break;
    if (!psInRange(psCell(iu - float(k), iv, dir, nor))) {
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
    vec3 s = psCell(start + float(k), iv, dir, nor);
    if (!psInRange(s)) break;
    keys[k] = psKey(s);
    cols[k] = s;
    m = k + 1;
  }
  int r = int(iu - start + 0.5);
  if (r >= m || m == 0) return orig;

  // Qual pixel fica na posição r depois de ordenar? Busca binária do menor valor t em que mais de r pixels
  // têm chave <= t.
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
