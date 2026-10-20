import './ui/theme.css';
import { startCamera } from './core/camera';
import { DebugOverlay } from './core/debug';
import { EffectManager } from './core/effectManager';
import { FingerRollDetector, GestureSmoother } from './core/gestures';
import { buildGui } from './core/gui';
import { HandTracker } from './core/handTracker';
import { Stage } from './core/stage';
import type { FrameData } from './core/types';
import { loadEffects } from './effects';
import { DjRulesEffect } from './features/djRules';
import { FrameFilterEffect } from './features/frameFilter';
import { ImageRulesEffect } from './features/imageRules';
import { AppState } from './features/state';
import { autoHideOnIdle } from './ui/autoHide';
import { createConfigPanel } from './ui/configPanel';
import { createDjPanel } from './ui/djPanel';

const video = document.getElementById('video') as HTMLVideoElement;
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;

function setStatus(text: string | null): void {
  status.textContent = text ?? '';
  status.classList.toggle('hidden', text === null);
}

async function main(): Promise<void> {
  const stage = new Stage(canvas);
  const manager = new EffectManager(stage);
  const debug = new DebugOverlay(hud);
  stage.scene.add(debug.group);

  // Recursos do app, configurados pela tela de configuração (não aparecem na lista de efeitos).
  // A moldura vem antes das imagens: quando ela está ativa, as imagens por gesto são escondidas.
  const state = new AppState();
  manager.register(new FrameFilterEffect(state, video), { listed: false, enabled: true });
  manager.register(new ImageRulesEffect(state), { listed: false, enabled: true });
  manager.register(new DjRulesEffect(state), { listed: false, enabled: true });
  createConfigPanel(state);
  createDjPanel(state);
  autoHideOnIdle(Array.from(document.querySelectorAll<HTMLElement>('.cfg-toggle')));

  // Efeitos criados por você em src/effects/*.effect.ts
  for (const effect of loadEffects()) manager.register(effect);
  buildGui(manager);

  setStatus('Abrindo a câmera...');
  await startCamera(video);

  setStatus('Carregando o rastreamento de mãos...');
  const tracker = new HandTracker();
  await tracker.init();
  setStatus(null);

  const gestures = new GestureSmoother();
  const rolls = new FingerRollDetector();
  let last = performance.now();
  const start = last;

  const loop = (now: number): void => {
    requestAnimationFrame(loop);

    const view = { width: stage.width, height: stage.height };
    const hands = tracker.update(video, view, now);
    gestures.apply(hands, now);
    rolls.apply(hands, (now - start) / 1000);

    const frame: FrameData = {
      time: (now - start) / 1000,
      delta: (now - last) / 1000,
      hands,
      view,
    };
    last = now;

    manager.update(frame);
    debug.update(hands, state.runtime.imageHands);
    stage.render();
  };
  requestAnimationFrame(loop);
}

main().catch((err: unknown) => {
  console.error(err);
  const name = err instanceof DOMException ? err.name : '';
  const message =
    name === 'NotAllowedError'
      ? 'Permissão da câmera negada.\nLibere o acesso à câmera e abra o app de novo.'
      : name === 'NotFoundError'
        ? 'Nenhuma câmera encontrada.'
        : name === 'NotReadableError'
          ? 'A câmera não pôde ser aberta.\nFeche outros programas que estejam usando a câmera e recarregue a página.'
          : `Erro ao iniciar:\n${err instanceof Error ? err.message : String(err)}`;
  setStatus(message);
});
