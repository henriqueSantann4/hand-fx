import type * as THREE from 'three';
import type { FingerName, GestureId, HandData, MotionId, RuleGesture, Side } from './types';

export const GESTURE_LABELS: Record<GestureId, string> = {
  open: 'Mão aberta',
  fist: 'Punho fechado',
  index_up: 'Indicador levantado',
  ok: 'OK (polegar + indicador)',
};

export const MOTION_LABELS: Record<MotionId, string> = {
  roll: 'Fechar do mindinho ao polegar',
};

/** Nome de um gesto ou movimento, para as listas da tela */
export function ruleGestureLabel(id: RuleGesture): string {
  return id in MOTION_LABELS ? MOTION_LABELS[id as MotionId] : GESTURE_LABELS[id as GestureId];
}

/** Uma regra com este gesto/movimento vale para esta mão neste quadro? */
export function handDoes(hand: HandData, gesture: RuleGesture): boolean {
  return gesture === 'roll' ? hand.rolled : hand.gesture === gesture;
}

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
/*
 * OK (polegar + indicador). Valores rígidos de propósito: é melhor o OK custar um pouco a sair do que
 * a mão relaxada ou meio aberta trocar o filtro sem querer. Três condições, todas obrigatórias:
 */
/**
 * 1) Pontas do polegar e do indicador encostadas: distância menor que isto (em tamanhos de mão) para ligar...
 * O MediaPipe marca a ponta da unha, e no OK quem encosta são as polpas: um OK real mede uns 0,2 a 0,25.
 */
const OK_TOUCH_ON = 0.32;
/** ...e maior que isto para desligar (folga para não piscar) */
const OK_TOUCH_OFF = 0.42;
/** 2) Médio, anelar e mindinho bem retos: a ponta precisa estar mais longe do pulso que a articulação do meio, por esta razão */
const OK_STRAIGHT_RATIO = 1.25;
/** 3) Indicador dobrado (forma o círculo): a ponta dele fica no máximo a esta fração da distância da ponta do médio ao pulso */
const OK_INDEX_VS_MIDDLE = 0.7;
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

/** O sinal de OK: polegar e indicador encostados formando um círculo, os outros três dedos bem retos. */
function isOk(hand: HandData, wasOk: boolean): boolean {
  const p = hand.points;
  const d = (a: number, b: number): number => p[a].distanceTo(p[b]);
  const touch = d(4, 8) / hand.handSize < (wasOk ? OK_TOUCH_OFF : OK_TOUCH_ON);
  const straight = (tip: number, pip: number): boolean => d(tip, 0) > d(pip, 0) * OK_STRAIGHT_RATIO;
  const threeStraight = straight(12, 10) && straight(16, 14) && straight(20, 18);
  const indexBent = d(8, 0) < d(12, 0) * OK_INDEX_VS_MIDDLE;
  return touch && threeStraight && indexBent;
}

/** Classifica a mão num único quadro (sem filtro de tempo). */
export function classifyRaw(hand: HandData, previous: GestureId | null): GestureId | null {
  const f = hand.fingers;

  if (isOk(hand, previous === 'ok')) return 'ok';

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

// ---- Gesto de "fechar rolando": dobrar os dedos um por um, do mindinho até o polegar ----

/**
 * Dedos conferidos, na ordem em que precisam dobrar. O polegar fecha o movimento, mas não é conferido:
 * a estimativa dele num punho fechado não é confiável.
 */
const ROLL_ORDER: FingerName[] = ['pinky', 'ring', 'middle', 'index'];
/** Um dedo só conta como dobrado depois de ficar dobrado por este tempo (s), para ignorar tremidas */
const ROLL_SETTLE = 0.05;
/** Folga (s) na ordem: dois dedos vizinhos podem dobrar quase juntos */
const ROLL_SLACK = 0.06;
/** Do mindinho ao indicador precisa passar pelo menos isto (s): fechar a mão toda de uma vez não conta */
const ROLL_MIN_SPREAD = 0.15;
/** E no máximo isto (s); depois disso o gesto é abandonado */
const ROLL_MAX_TIME = 2;

interface RollState {
  /** A mão abriu (4 dedos esticados) e pode fazer o gesto */
  armed: boolean;
  /** Desde quando cada dedo está dobrado (s) */
  bentSince: Partial<Record<FingerName, number>>;
  /** Quando cada dedo dobrou de fato (já passou do ROLL_SETTLE) */
  folded: Partial<Record<FingerName, number>>;
  lastSeen: number;
}

/**
 * Reconhece o gesto de fechar a mão "rolando" os dedos: começa com a mão aberta e dobra o mindinho,
 * o anelar, o médio e o indicador, um depois do outro. Para repetir, abra a mão de novo.
 */
export class FingerRollDetector {
  private states = new Map<Side, RollState>();

  /** Marca hand.rolled nas mãos que acabaram de completar o gesto. time = segundos. */
  apply(hands: HandData[], time: number): void {
    const done = this.update(hands, time);
    for (const hand of hands) hand.rolled = done.includes(hand.side);
  }

  /** Devolve os lados das mãos que acabaram de completar o gesto. time = segundos. */
  update(hands: HandData[], time: number): Side[] {
    const done: Side[] = [];
    for (const hand of hands) {
      let st = this.states.get(hand.side);
      if (!st) {
        st = { armed: false, bentSince: {}, folded: {}, lastSeen: time };
        this.states.set(hand.side, st);
      }
      st.lastSeen = time;
      const f = hand.fingers;

      // Mão aberta: prepara para um gesto novo
      if (ROLL_ORDER.every((n) => f[n])) {
        st.armed = true;
        st.bentSince = {};
        st.folded = {};
        continue;
      }
      if (!st.armed) continue;

      for (const n of ROLL_ORDER) {
        if (f[n]) {
          delete st.bentSince[n];
          delete st.folded[n];
          continue;
        }
        const since = (st.bentSince[n] ??= time);
        if (time - since >= ROLL_SETTLE) st.folded[n] ??= since;
      }

      const times = ROLL_ORDER.map((n) => st.folded[n]);
      const known = times.filter((t): t is number => t !== undefined);
      if (known.length && time - Math.min(...known) > ROLL_MAX_TIME) {
        st.armed = false;
        continue;
      }
      if (known.length < ROLL_ORDER.length) continue;

      // Todos dobrados: confere a ordem e o tempo, e só então espera a mão abrir de novo
      st.armed = false;
      const ordered = known.every((t, i) => i === 0 || t >= known[i - 1] - ROLL_SLACK);
      const spread = known[known.length - 1] - known[0];
      if (ordered && spread >= ROLL_MIN_SPREAD && spread <= ROLL_MAX_TIME) done.push(hand.side);
    }

    for (const [side, st] of this.states) {
      if (time - st.lastSeen > FORGET_MS / 1000) this.states.delete(side);
    }
    return done;
  }
}
