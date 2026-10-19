/** Tempo (ms) que os botões ficam na tela depois que o mouse para */
export const HIDE_DELAY = 500;

/**
 * Os botões ficam escondidos e aparecem quando o mouse se mexe.
 * Somem de novo HIDE_DELAY ms depois que o mouse para (se o mouse estiver em cima de um botão, ele continua).
 */
export function autoHideOnIdle(buttons: HTMLElement[]): void {
  let timer: number | undefined;
  const hovering = (): boolean => buttons.some((b) => b.matches(':hover') || b === document.activeElement);

  const hide = (): void => {
    if (hovering()) {
      timer = window.setTimeout(hide, HIDE_DELAY);
      return;
    }
    for (const b of buttons) b.classList.remove('shown');
  };
  const show = (): void => {
    for (const b of buttons) b.classList.add('shown');
    window.clearTimeout(timer);
    timer = window.setTimeout(hide, HIDE_DELAY);
  };

  window.addEventListener('mousemove', show);
  window.addEventListener('pointerdown', show);
}
