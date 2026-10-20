import { Effect } from '../core/effect';
import { handDoes } from '../core/gestures';
import type { FrameData, HandData, Side } from '../core/types';
import { actionDef, controlDef, DECKS, type DeckId } from '../audio/dj';
import type { AppState, DjAxis } from './state';

/** Tempo mínimo (s) entre dois disparos da mesma ação (evita repetir se o rastreio falhar por um instante) */
const COOLDOWN = 0.6;
/** Suavização do movimento da mão nos controles (0 a 1; maior = mais rápido) */
const FOLLOW = 0.35;

interface Memory {
  smooth: number | null;
  was: boolean;
  last: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** Usa só do 10% ao 90% da tela, para ser fácil chegar nos extremos */
const edge = (n: number): number => clamp01((n - 0.1) / 0.8);

function axisValue(hand: HandData, axis: DjAxis, view: FrameData['view']): number {
  switch (axis) {
    case 'y':
      return edge(0.5 + hand.palm.y / view.height); // mão no alto = 1
    case 'x':
      return edge(0.5 + hand.palm.x / view.width); // mão à direita da tela = 1
    case 'openness':
      return clamp01(hand.openness);
    case 'pinch':
      return clamp01(hand.pinch);
  }
}

/** Liga as mãos à mesa de DJ: lê as regras da tela e controla os decks. */
export class DjRulesEffect extends Effect {
  readonly label = 'DJ por gestos';
  private memory = new Map<string, Memory>();

  constructor(private state: AppState) {
    super();
  }

  update(frame: FrameData): void {
    const dj = this.state.dj;
    dj.tick(frame.delta);

    const holds: Record<DeckId, { scrub: number; bend: number }> = { A: { scrub: 0, bend: 0 }, B: { scrub: 0, bend: 0 } };
    const alive = new Set<string>();

    for (const rule of this.state.djRules) {
      if (!rule.enabled) continue;
      for (const side of ['left', 'right'] as Side[]) {
        const key = `${rule.id}:${side}`;
        alive.add(key);
        const mem = this.memory.get(key) ?? { smooth: null, was: false, last: -Infinity };
        this.memory.set(key, mem);

        const hand = frame.hands.find((h) => h.side === side);
        const matches =
          !!hand &&
          (rule.hand === 'any' || rule.hand === side) &&
          (rule.gesture === 'always' || handDoes(hand, rule.gesture)) &&
          // Movimento (fechar do mindinho ao polegar) só serve para ações: ele não tem duração
          !(rule.gesture === 'roll' && rule.mode === 'control');

        if (matches && hand) {
          if (rule.mode === 'control') {
            const def = controlDef(rule.control);
            if (def) {
              let n = axisValue(hand, rule.axis, frame.view);
              if (rule.invert) n = 1 - n;
              mem.smooth = mem.smooth === null ? n : mem.smooth + (n - mem.smooth) * FOLLOW;
              let value = def.min + mem.smooth * (def.max - def.min);
              // Perto do normal a velocidade "gruda" em 1×, para ser fácil voltar ao ritmo original
              if (rule.control.endsWith('.speed') && Math.abs(value - 1) < 0.03) value = 1;
              dj.setControl(rule.control, value);
            }
          } else {
            const action = actionDef(rule.action);
            if (action?.hold) {
              holds[action.hold.deck].scrub += action.hold.scrub ?? 0;
              holds[action.hold.deck].bend += action.hold.bend ?? 0;
            } else if (action?.run && !mem.was && frame.time - mem.last > COOLDOWN) {
              action.run(dj);
              mem.last = frame.time;
            }
          }
        } else {
          mem.smooth = null;
        }
        mem.was = matches;
      }
    }

    for (const key of this.memory.keys()) if (!alive.has(key)) this.memory.delete(key);
    for (const deck of DECKS) dj.deck(deck).setHold('gesture', holds[deck].scrub, holds[deck].bend);
  }
}
