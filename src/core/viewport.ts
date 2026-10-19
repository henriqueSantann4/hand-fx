import * as THREE from 'three';

/**
 * Converte um ponto normalizado do MediaPipe (x, y de 0 a 1 na imagem da câmera, sem espelho)
 * para coordenadas da cena, levando em conta:
 *  - o espelhamento do vídeo (x invertido);
 *  - o recorte "cover" do vídeo na tela (o vídeo preenche a tela e pode cortar as bordas).
 * Assim o ponto cai exatamente em cima da mão que você vê na tela.
 */
export function mapToScene(
  nx: number,
  ny: number,
  nz: number,
  videoW: number,
  videoH: number,
  viewW: number,
  viewH: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const scale = Math.max(viewW / videoW, viewH / videoH);
  const dispW = videoW * scale;
  const dispH = videoH * scale;
  const offX = (viewW - dispW) / 2;
  const offY = (viewH - dispH) / 2;

  const px = offX + (1 - nx) * dispW; // (1 - nx) por causa do espelho
  const py = offY + ny * dispH;

  // No MediaPipe, z menor = mais perto da câmera; no Three.js, z maior = mais perto.
  return out.set(px - viewW / 2, viewH / 2 - py, -nz * dispW);
}
