/** Um parâmetro ajustável de um filtro (vira um slider na tela de configuração). */
export interface FilterParam {
  /** Nome do parâmetro. No GLSL ele aparece como `uP_<key>` (float). */
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Valor inicial */
  value: number;
}

/**
 * Definição de um filtro de câmera aplicado dentro da moldura.
 *
 * O trecho `glsl` precisa definir a função:
 *     vec4 applyFilter(vec2 p)
 * onde `p` é a posição do pixel na cena (pixels, origem no centro da tela, y para cima).
 * Dentro dela você pode usar:
 *     vec4 sampleScene(vec2 p)    lê a cor da câmera na posição p (já espelhada, alinhada com a tela)
 *     uniform vec2 uView          tamanho da tela em pixels
 *     uniform float uTime         segundos desde que o app abriu (para filtros animados)
 *     uniform vec4 uBox           caixa da moldura na cena: (x mínimo, y mínimo, x máximo, y máximo)
 *     vec4 sampleHistory(vec2 p, float age)   só com `history: true`: a câmera em p, `age` quadros guardados atrás (0 a 22; o app guarda 1 a cada 2 quadros da câmera)
 *     float faceMask(vec2 p, float feather)   só com `face: true`: 1 dentro do rosto, 0 fora (borda suave de `feather` px);
 *                                   sem nenhum rosto na câmera vale 1 em tudo. Use uFaceRadius (px) para o tamanho do rosto.
 *     vec4 sampleMosh(vec2 p)       só com `motion: true`: a imagem "derretida" (datamosh) em p
 *     vec4 sampleFlow(vec2 p)       só com `motion: true`: movimento em p (xy = deslocamento em fração da tela, z = quanto se mexe, 0 a 1)
 *     uniform float uP_<key>      cada parâmetro declarado em `params`
 */
export interface FilterDef {
  id: string;
  label: string;
  params: FilterParam[];
  glsl: string;
  /** Se verdadeiro, o app guarda os últimos quadros e o filtro pode usar sampleHistory */
  history?: boolean;
  /**
   * Se verdadeiro, o app mede o movimento da câmera e mantém uma imagem "derretida" (datamosh) entre os quadros,
   * e o filtro pode usar sampleMosh e sampleFlow. O app lê destes parâmetros (mesmos nomes em `params`):
   * strength, block, hard, recover, hold, threshold, keyframe (veja MotionParams em features/motionBuffer.ts).
   */
  motion?: boolean;
  /**
   * Se verdadeiro, o app acha o rosto na câmera e o filtro pode usar faceMask.
   */
  face?: boolean;
  /**
   * Tamanho da área do rosto para faceMask (1 = o contorno do rosto, mais que isso inclui cabelo e pescoço).
   * Um parâmetro `faceSize` em `params`, se existir, vale no lugar deste. Padrão 1.
   */
  faceSize?: number;
}
