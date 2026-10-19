import GUI from 'lil-gui';
import type { EffectManager } from './effectManager';
import { settings } from './settings';

/** Painel de controle no canto da tela. Tecla "H" mostra/esconde. */
export function buildGui(manager: EffectManager): GUI {
  const gui = new GUI({ title: 'HandFX' });

  const general = gui.addFolder('Geral');
  general.add(settings, 'showDebug').name('Mostrar texto de diagnóstico');
  general.add(settings, 'smoothing', 0, 0.95, 0.01).name('Suavização das mãos');

  const effects = gui.addFolder('Efeitos');
  if (!manager.list.some((e) => e.listed)) {
    effects.add({ info: 'nenhum efeito ainda' }, 'info').name('Vazio').disable();
  }

  for (const { effect, listed } of manager.list) {
    if (!listed) continue;
    const folder = effects.addFolder(effect.label);
    const proxy = { enabled: manager.isEnabled(effect) };
    folder
      .add(proxy, 'enabled')
      .name('Ligado')
      .onChange((value: boolean) => manager.setEnabled(effect, value));
    effect.buildGui(folder);
  }

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    if (e.key.toLowerCase() === 'h') gui.show(gui._hidden);
  });

  return gui;
}
