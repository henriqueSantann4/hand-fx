import { DjEngine } from '../audio/dj';
import type { FingerName, RuleGesture, Side } from '../core/types';
import type { FilterDef } from '../filters/types';
import { ImageLibrary } from './imageLibrary';
import { uid } from './uid';

/** Qual mão dispara a regra */
export type HandSelector = 'left' | 'right' | 'any';

/** Onde a imagem fica */
export type Anchor =
  | { kind: 'palm' }
  | { kind: 'wrist' }
  | { kind: 'fingertip'; finger: FingerName }
  /** x e y de 0 a 1, em fração da tela (0,0 = canto superior esquerdo) */
  | { kind: 'fixed'; x: number; y: number };

/**
 * Regra: "quando ESTA mão fizer ESTE gesto, mostre ESTA imagem NESTE lugar".
 * Com um movimento (fechar do mindinho ao polegar), cada movimento liga ou desliga a imagem.
 */
export interface ImageRule {
  id: string;
  enabled: boolean;
  hand: HandSelector;
  gesture: RuleGesture;
  imageId: string | null;
  anchor: Anchor;
  /** Se verdadeiro, o tamanho acompanha o tamanho da mão (sizeHand); senão usa pixels fixos (sizePx) */
  scaleWithHand: boolean;
  sizePx: number;
  /** Largura da imagem em múltiplos do tamanho da mão */
  sizeHand: number;
  opacity: number;
  /** Deslocamento em pixels em relação à âncora (y positivo = para cima) */
  offsetX: number;
  offsetY: number;
  rotateWithHand: boolean;
}

/** O que na mão controla um slider: altura, posição lateral, abertura ou pinça */
export type DjAxis = 'y' | 'x' | 'openness' | 'pinch';

/**
 * Regra do DJ: "quando ESTA mão fizer ESTE gesto, ..."
 * - control: enquanto o gesto durar, a posição/abertura da mão move um controle (volume, velocidade, EQ...).
 * - action: ao começar o gesto, faz uma ação (tocar/pausar, voltar 5 s...). Ações "enquanto durar" valem durante o gesto.
 */
export interface DjRule {
  id: string;
  enabled: boolean;
  hand: HandSelector;
  /** 'always' = sempre que a mão aparecer (só para controles); 'roll' = movimento (só para ações) */
  gesture: RuleGesture | 'always';
  mode: 'control' | 'action';
  control: string;
  axis: DjAxis;
  invert: boolean;
  action: string;
}

/** Um filtro escolhido e os valores dos parâmetros dele. */
export interface FilterSlot {
  filterId: string;
  /** Valores dos parâmetros, guardados por filtro: params[filterId][key] (assim trocar de filtro não perde os ajustes) */
  params: Record<string, Record<string, number>>;
}

export interface FrameConfig {
  enabled: boolean;
  /** Mostra as linhas brancas do contorno (quadrilátero e triângulos) */
  showOutline: boolean;
  /** Para ativar a moldura, as pontas dos dedos das duas mãos precisam estar mais perto que isto (em tamanhos de mão) */
  armDistance: number;
  /** Filtro da moldura normal (quadrilátero) */
  quad: FilterSlot;
  /** Quando uma mão gira e o contorno se cruza, a moldura vira dois triângulos */
  triangles: {
    /** Se verdadeiro, os dois triângulos usam o filtro `both` */
    sameFilter: boolean;
    both: FilterSlot;
    /** Triângulo que fica mais à esquerda na tela */
    left: FilterSlot;
    /** Triângulo que fica mais à direita na tela */
    right: FilterSlot;
  };
}

/** filterId que deixa o filtro da tela inteira desligado (aparece como "Desativado" na roda e na lista) */
export const NO_FILTER = 'none';

/**
 * Filtro na tela inteira. Os filtros formam uma roda, começando por "Desativado": o gesto de fechar a mão do
 * mindinho ao indicador passa para o próximo (mão direita) ou para o anterior (mão esquerda), e do último volta ao primeiro.
 */
export interface FullscreenConfig {
  /** Filtro escolhido; NO_FILTER = desligado */
  slot: FilterSlot;
}

const slot = (filterId: string): FilterSlot => ({ filterId, params: {} });

/** Tudo o que a tela de configuração edita e os efeitos leem a cada quadro. */
export class AppState {
  readonly library = new ImageLibrary();
  readonly rules: ImageRule[] = [];
  readonly dj = new DjEngine();
  readonly djRules: DjRule[] = [];
  readonly frame: FrameConfig = {
    enabled: true,
    showOutline: true,
    armDistance: 0.6,
    quad: slot('pixelate'),
    triangles: { sameFilter: false, both: slot('frosted'), left: slot('invert'), right: slot('grayscale') },
  };
  readonly fullscreen: FullscreenConfig = { slot: slot(NO_FILTER) };
  /** Informação passada entre efeitos (não é configuração) */
  readonly runtime = {
    frameActive: false,
    /** Mãos que têm uma imagem presa agora (o esqueleto delas fica escondido) */
    imageHands: new Set<Side>(),
  };

  addRule(): ImageRule {
    const rule: ImageRule = {
      id: uid(),
      enabled: true,
      hand: 'any',
      gesture: 'open',
      imageId: this.library.items[0]?.id ?? null,
      anchor: { kind: 'palm' },
      scaleWithHand: true,
      sizePx: 200,
      sizeHand: 2,
      opacity: 1,
      offsetX: 0,
      offsetY: 0,
      rotateWithHand: true,
    };
    this.rules.push(rule);
    return rule;
  }

  addDjRule(): DjRule {
    const rule: DjRule = {
      id: uid(),
      enabled: true,
      hand: 'any',
      gesture: 'fist',
      mode: 'control',
      control: 'A.volume',
      axis: 'y',
      invert: false,
      action: 'A.toggle',
    };
    this.djRules.push(rule);
    return rule;
  }

  removeDjRule(id: string): void {
    const index = this.djRules.findIndex((r) => r.id === id);
    if (index >= 0) this.djRules.splice(index, 1);
  }

  removeRule(id: string): void {
    const index = this.rules.findIndex((r) => r.id === id);
    if (index >= 0) this.rules.splice(index, 1);
  }
}

/** Garante que existem valores para todos os parâmetros do filtro e devolve o objeto editável. */
export function ensureFilterParams(slot: FilterSlot, filter: FilterDef): Record<string, number> {
  const values = (slot.params[filter.id] ??= {});
  for (const p of filter.params) values[p.key] ??= p.value;
  return values;
}
