import type * as THREE from 'three';
import type { FingerName, GestureId, HandData, Side } from './types';

export const GESTURE_LABELS: Record<GestureId, string> = {
  open: 'Mão aberta',
  fist: 'Punho fechado',
  index_up: 'Indicador levantado',
  pinch: 'Pinça',
};

export const FINGER_LABELS: Record<FingerName, string> = {
  thumb: 'Polegar',
  index: 'Indicador',
  middle: 'Médio',
  ring: 'Anelar',
  pinky: 'Mindinho',
};

/** Índice do ponto da ponta de cada dedo nos 21 pontos do MediaPipe */
export const FINGER_TIP: Record<FingerName, number> = {
  thumb: 4,
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20,
};

// ---- Constantes de calibração (ajuste aqui se os gestos não forem reconhecidos bem) ----

/** Dedo esticado: a ponta precisa estar mais longe do pulso que a articulação do meio, por esta razão */
const EXTENDED_RATIO = 1.1;
/** Polegar esticado: a ponta precisa estar mais longe da base do indicador que a articulação anterior */
const THUMB_RATIO = 1.15;
/** Pinça liga acima deste valor e só desliga abaixo do outro (evita piscar) */
const PINCH_ON = 0.7;
const PINCH_OFF = 0.5;
/** Num punho fechado a ponta do indicador fica perto do pulso; numa pinça ela fica mais longe */
const PINCH_INDEX_MIN_REACH = 1.25;
/** Tempo (ms) que um gesto novo precisa se manter para ser considerado */
const HOLD_MS = 90;
/** Tempo (ms) que o estado de uma mão sumida é guardado */
const FORGET_MS = 300;

/** Estima quais dedos estão esticados, comparando distâncias ao pulso (não depende da rotação da mão). */
export function computeFingers(points: THREE.Vector3[]): Record<FingerName, boolean> {
  const d = (a: number, b: number): number => points[a].distanceTo(points[b]);
  const extended = (tip: number, pip: number): boolean => d(tip, 0) > d(pip, 0) * EXTENDED_RATIO;
  return {
    thumb: d(4, 5) > d(3, 5) * THUMB_RATIO,
    index: extended(8, 6),
    middle: extended(12, 10),
    ring: extended(16, 14),
    pinky: extended(20, 18),
  };
}

/** Classifica a mão num único quadro (sem filtro de tempo). */
export function classifyRaw(hand: HandData, previous: GestureId | null): GestureId | null {
  const f = hand.fingers;

  const indexReach = hand.points[8].distanceTo(hand.points[0]) / hand.handSize;
  const threshold = previous === 'pinch' ? PINCH_OFF : PINCH_ON;
  if (hand.pinch >= threshold && indexReach > PINCH_INDEX_MIN_REACH) return 'pinch';

  const others = [f.index, f.middle, f.ring, f.pinky].filter(Boolean).length;
  if (others === 4) return 'open';
  if (others === 0) return 'fist';
  if (f.index && others === 1) return 'index_up';
  return null;
}

interface State {
  stable: GestureId | null;
  /** undefined = nenhum candidato em andamento (null é um candidato válido: "sem gesto") */
  candidate: GestureId | null | undefined;
  since: number;
  lastSeen: number;
}

/** Só muda o gesto de uma mão depois que o novo gesto se manteve por um tempo curto. */
export class GestureSmoother {
  private states = new Map<Side, State>();

  /** Preenche hand.gesture em cada mão. nowMs = relógio em milissegundos. */
  apply(hands: HandData[], nowMs: number): void {
    for (const hand of hands) {
      let st = this.states.get(hand.side);
      if (!st) {
        st = { stable: null, candidate: undefined, since: nowMs, lastSeen: nowMs };
        this.states.set(hand.side, st);
      }
      st.lastSeen = nowMs;

      const raw = classifyRaw(hand, st.stable);
      if (raw === st.stable) {
        st.candidate = undefined;
      } else if (raw !== st.candidate) {
        st.candidate = raw;
        st.since = nowMs;
      } else if (nowMs - st.since >= HOLD_MS) {
        st.stable = raw;
        st.candidate = undefined;
      }
      hand.gesture = st.stable;
    }

    for (const [side, st] of this.states) {
      if (nowMs - st.lastSeen > FORGET_MS) this.states.delete(side);
    }
  }
}
