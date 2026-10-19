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
 *     uniform float uP_<key>      cada parâmetro declarado em `params`
 */
export interface FilterDef {
  id: string;
  label: string;
  params: FilterParam[];
  glsl: string;
}
