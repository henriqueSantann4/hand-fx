import * as THREE from 'three';
import type GUI from 'lil-gui';
import type { Stage } from './stage';
import type { FrameData } from './types';

/**
 * Base de todo efeito. Para criar um efeito novo, crie um arquivo em src/effects
 * com o nome terminando em ".effect.ts" e exporte (default) uma classe que estenda esta.
 * Ele é descoberto automaticamente, sem precisar registrar em lugar nenhum.
 */
export abstract class Effect {
  /** Nome que aparece no painel */
  abstract readonly label: string;

  /** Tudo que o efeito desenha deve ser adicionado aqui. Fica oculto quando o efeito está desligado. */
  readonly group = new THREE.Group();

  /** Chamado uma vez, quando o app inicia. Crie aqui geometrias, materiais e objetos. */
  init(_stage: Stage): void {}

  /** Chamado a cada quadro, somente enquanto o efeito está ligado. */
  abstract update(frame: FrameData): void;

  /** Adicione aqui controles (sliders, cores...) ao painel. Opcional. */
  buildGui(_folder: GUI): void {}

  /** Chamado quando o efeito é ligado. */
  onEnable(): void {}

  /** Chamado quando o efeito é desligado. */
  onDisable(): void {}

  /** Chamado se o efeito for removido de vez. Libere geometrias, materiais e texturas aqui. */
  dispose(): void {}
}
