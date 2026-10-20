import type * as THREE from 'three';

/** Lado da mão, do ponto de vista de quem usa (como num espelho) */
export type Side = 'left' | 'right';

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

/** Gestos reconhecidos de uma mão só (posições que duram enquanto a mão fica assim) */
export type GestureId = 'open' | 'fist' | 'index_up' | 'ok';

/** Movimentos: acontecem num instante (só no quadro em que terminam) */
export type MotionId = 'roll';

/** O que uma regra pode usar: um gesto que dura ou um movimento */
export type RuleGesture = GestureId | MotionId;

export interface HandData {
  /** Posição da mão na lista de detecção (0 ou 1) */
  index: number;
  side: Side;
  /** Confiança do MediaPipe para o lado detectado (0 a 1) */
  score: number;
  /**
   * Os 21 pontos da mão em coordenadas da cena:
   * unidade = pixel da tela, origem no centro, y para cima, z para a frente (em direção a você).
   * Ordem dos pontos: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
   * (0 = pulso, 4 = ponta do polegar, 8 = ponta do indicador, 12 = médio, 16 = anelar, 20 = mindinho)
   */
  points: THREE.Vector3[];
  /** Centro aproximado da palma */
  palm: THREE.Vector3;
  /** Tamanho da mão em pixels (pulso até a base do dedo médio). Útil para escalar efeitos. */
  handSize: number;
  /** 0 = polegar e indicador afastados, 1 = encostando. (valores ainda não calibrados) */
  pinch: number;
  /** 0 = mão fechada, 1 = mão aberta. (valores ainda não calibrados) */
  openness: number;
  /** Quais dedos estão esticados (estimativa pela geometria da mão) */
  fingers: Record<FingerName, boolean>;
  /** Gesto reconhecido de forma estável (já filtrado no tempo), ou null se nenhum */
  gesture: GestureId | null;
  /** Verdadeiro só no quadro em que a mão terminou o movimento de fechar do mindinho ao polegar */
  rolled: boolean;
}

/** Dados entregues a cada efeito a cada quadro */
export interface FrameData {
  /** Segundos desde que o app abriu */
  time: number;
  /** Segundos desde o quadro anterior */
  delta: number;
  /** Mãos detectadas agora (lista vazia se não houver nenhuma) */
  hands: HandData[];
  /** Tamanho da área de desenho em pixels */
  view: { width: number; height: number };
}
