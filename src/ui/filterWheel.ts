import './filterWheel.css';
import { h } from './dom';

/** Distância (px) entre os nomes na faixa */
const SPACING = 140;
/** Quantos nomes aparecem de cada lado do atual */
const NEIGHBORS = 2;
/** Rapidez com que a faixa desliza até o filtro escolhido (por segundo) */
const SPEED = 14;

/**
 * Roda de filtros: faixa de vidro embaixo, no centro da tela. O filtro escolhido fica no meio, maior e nítido;
 * os vizinhos (2 de cada lado) vão ficando menores e mais apagados, e o resto da roda não aparece.
 */
export class FilterWheel {
  private root = h('div', { class: 'fwheel' });
  private items: HTMLElement[] = [];
  /** Posição mostrada (desliza até o alvo); sem "dar a volta", para deslizar sempre pelo caminho do arrasto */
  private shown = 0;

  constructor() {
    for (let k = 0; k < NEIGHBORS * 2 + 3; k++) {
      const item = h('span', { class: 'fwheel-item' });
      this.items.push(item);
      this.root.append(item);
    }
    document.body.append(this.root);
  }

  /**
   * Chame a cada quadro. `target` é a posição na roda sem dar a volta (pode passar do fim ou ser negativa);
   * o nome mostrado é labels[target mod n]. `jump` posiciona na hora, sem deslizar.
   */
  update(labels: string[], target: number, visible: boolean, delta: number, jump = false): void {
    this.root.classList.toggle('shown', visible);
    if (jump) this.shown = target;
    else this.shown += (target - this.shown) * Math.min(1, delta * SPEED);

    const n = labels.length;
    const base = Math.round(this.shown);
    this.items.forEach((item, k) => {
      const index = base + k - NEIGHBORS - 1;
      const d = index - this.shown;
      const far = Math.abs(d);
      item.textContent = labels[((index % n) + n) % n];
      item.style.transform = `translate(-50%, -50%) translateX(${d * SPACING}px) scale(${1 - Math.min(far, 3) * 0.13})`;
      item.style.opacity = String(Math.max(0, 1 - far / (NEIGHBORS + 0.6)));
      item.classList.toggle('current', far < 0.5);
    });
  }
}
