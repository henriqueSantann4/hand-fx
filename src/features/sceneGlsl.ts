/**
 * Trecho de shader compartilhado: lê a câmera alinhada com a tela (espelhada e com recorte "cover").
 * Quem usar precisa declarar antes: uniform sampler2D uVideo; uniform vec2 uView; uniform vec2 uVideoSize;
 */
export const SCENE_SAMPLE_GLSL = /* glsl */ `
// Posição da cena (pixels) -> coordenada de textura do vídeo, com espelho e recorte "cover"
vec2 sceneToUv(vec2 p) {
  float scale = max(uView.x / uVideoSize.x, uView.y / uVideoSize.y);
  vec2 disp = uVideoSize * scale;
  vec2 off = (uView - disp) * 0.5;
  float px = p.x + uView.x * 0.5;
  float py = uView.y * 0.5 - p.y;
  return vec2(1.0 - (px - off.x) / disp.x, 1.0 - (py - off.y) / disp.y);
}

vec4 sampleScene(vec2 p) {
  return texture2D(uVideo, sceneToUv(p));
}
`;
