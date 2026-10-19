import './configPanel.css';
import './djPanel.css';
import { ACTIONS, CONTROLS, DECK_PARAMS, DECKS, type DeckId, type DeckParam } from '../audio/dj';
import { GESTURE_LABELS } from '../core/gestures';
import type { GestureId } from '../core/types';
import type { AppState, DjAxis, DjRule, HandSelector } from '../features/state';
import { checkbox, h, row, section, select } from './dom';

const HAND_OPTIONS = [
  ['any', 'Qualquer mão'],
  ['left', 'Mão esquerda'],
  ['right', 'Mão direita'],
] as const satisfies ReadonlyArray<readonly [HandSelector, string]>;

const GESTURE_OPTIONS = (Object.entries(GESTURE_LABELS) as [GestureId, string][]).map(([id, label]) => [id, label] as const);
const ALWAYS_OPTION = ['always', 'Sempre (mão visível)'] as const;

const AXIS_OPTIONS = [
  ['y', 'Altura da mão (para cima = mais)'],
  ['x', 'Mão para os lados (direita = mais)'],
  ['openness', 'Abertura da mão (aberta = mais)'],
  ['pinch', 'Pinça (juntar os dedos = mais)'],
] as const satisfies ReadonlyArray<readonly [DjAxis, string]>;

const MODE_OPTIONS = [
  ['control', 'Mover um controle'],
  ['action', 'Fazer uma ação'],
] as const;

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Slider que lê o valor de fora (para acompanhar mudanças feitas por gestos). */
interface Bound {
  el: HTMLElement;
  sync: () => void;
}

export function createDjPanel(state: AppState): void {
  const dj = state.dj;

  const toggle = h('button', { class: 'cfg-toggle dj-toggle', textContent: '🎧 DJ (D)' });
  const panel = h('aside', { class: 'cfg-panel dj-panel hidden' });
  document.body.append(toggle, panel);

  const isOpen = (): boolean => !panel.classList.contains('hidden');
  const setOpen = (open: boolean): void => {
    panel.classList.toggle('hidden', !open);
    if (open) window.dispatchEvent(new CustomEvent('handfx:panel-open', { detail: 'dj' }));
  };
  window.addEventListener('handfx:panel-open', (e) => {
    if ((e as CustomEvent).detail !== 'dj') panel.classList.add('hidden');
  });
  toggle.addEventListener('click', () => setOpen(!isOpen()));
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey) setOpen(!isOpen());
  });

  // Enquanto o usuário arrasta um slider, a tela não o sobrescreve
  let dragging: HTMLInputElement | null = null;
  window.addEventListener('pointerup', () => (dragging = null));

  const bound = (min: number, max: number, step: number, get: () => number, set: (v: number) => void, unit = ''): Bound => {
    const decimals = (String(step).split('.')[1] ?? '').length;
    const output = h('output');
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
    const show = (): void => {
      input.value = String(get());
      output.textContent = get().toFixed(decimals) + unit;
    };
    input.addEventListener('pointerdown', () => (dragging = input));
    input.addEventListener('input', () => {
      const v = Number(input.value);
      set(v);
      output.textContent = v.toFixed(decimals) + unit;
    });
    show();
    return {
      el: h('div', { class: 'cfg-slider' }, input, output),
      sync: () => {
        if (dragging !== input) show();
      },
    };
  };

  // ----- Músicas -----
  const library = section('Músicas', true);
  const decksSection = section('Decks', true);
  const mixer = section('Mesa', true);
  const rules = section('Regras de gestos (DJ)', true);
  const help = section('Como usar', false);
  panel.append(library.root, decksSection.root, mixer.root, rules.root, help.root);

  const audioWarning = h('p', { class: 'cfg-hint dj-warning', textContent: '⚠ O navegador bloqueou o áudio. Clique em qualquer lugar da página para liberar.' });

  const renderLibrary = (): void => {
    const fileInput = h('input', { type: 'file', accept: 'audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.opus', multiple: true, hidden: true });
    fileInput.addEventListener('change', () => {
      if (fileInput.files) void dj.tracks.addFiles(Array.from(fileInput.files));
      fileInput.value = '';
    });
    const addButton = h('button', { textContent: '+ Adicionar músicas' });
    addButton.addEventListener('click', () => fileInput.click());

    const list = h('div', { class: 'dj-tracks' });
    for (const track of dj.tracks.items) {
      const load = (deck: DeckId): HTMLButtonElement => {
        const b = h('button', { textContent: deck, title: `Carregar no deck ${deck}` });
        b.addEventListener('click', () => {
          dj.deck(deck).load(track);
          refreshAll();
        });
        return b;
      };
      const remove = h('button', { class: 'danger', textContent: '✕', title: 'Remover' });
      remove.addEventListener('click', () => dj.tracks.remove(track.id));
      list.append(
        h('div', { class: 'dj-track' }, h('span', { class: 'name', textContent: track.name, title: track.name }), h('span', { class: 'time', textContent: formatTime(track.duration) }), load('A'), load('B'), remove),
      );
    }

    library.body.replaceChildren(
      h('p', { class: 'cfg-hint', textContent: 'Você também pode arrastar músicas (mp3, wav, ogg, m4a, flac) para a tela. As músicas ficam só nesta sessão: ao recarregar a página, adicione de novo.' }),
      audioWarning,
      addButton,
      fileInput,
      list,
    );
  };

  // ----- Decks -----
  interface DeckView {
    root: HTMLElement;
    /** Refaz a lista de músicas e atualiza tudo */
    refresh: () => void;
    /** Só atualiza o que muda sozinho (posição, botão de tocar, sliders) */
    live: () => void;
  }

  const holdButton = (label: string, title: string, deck: DeckId, scrub: number, bend: number): HTMLButtonElement => {
    const b = h('button', { textContent: label, title });
    const release = (): void => dj.deck(deck).setHold('ui', 0, 0);
    b.addEventListener('pointerdown', () => dj.deck(deck).setHold('ui', scrub, bend));
    b.addEventListener('pointerup', release);
    b.addEventListener('pointerleave', release);
    b.addEventListener('pointercancel', release);
    return b;
  };

  const buildDeck = (id: DeckId): DeckView => {
    const deck = dj.deck(id);
    const title = h('div', { class: 'cfg-subtitle', textContent: `Deck ${id}` });

    const trackSelect = h('select');
    const fillTracks = (): void => {
      trackSelect.replaceChildren(h('option', { value: '', textContent: dj.tracks.items.length ? '(vazio)' : '(adicione músicas)' }));
      for (const t of dj.tracks.items) trackSelect.append(h('option', { value: t.id, textContent: t.name }));
      trackSelect.value = deck.track?.id ?? '';
    };
    trackSelect.addEventListener('change', () => {
      deck.load(dj.tracks.get(trackSelect.value) ?? null);
      refreshAll();
    });

    const time = h('span', { class: 'dj-time' });
    const seek = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: '0' });
    seek.addEventListener('pointerdown', () => (dragging = seek));
    seek.addEventListener('input', () => deck.seek(Number(seek.value)));

    const playButton = h('button', { class: 'dj-play', textContent: '▶' });
    playButton.addEventListener('click', () => deck.toggle());
    const step = (label: string, delta: number): HTMLButtonElement => {
      const b = h('button', { textContent: label, title: `${delta > 0 ? 'Avançar' : 'Voltar'} ${Math.abs(delta)} s` });
      b.addEventListener('click', () => deck.seekBy(delta));
      return b;
    };
    const restart = h('button', { textContent: '⏮', title: 'Voltar ao início' });
    restart.addEventListener('click', () => deck.seek(0));

    const transport = h(
      'div',
      { class: 'dj-transport' },
      restart,
      holdButton('⏪', 'Segure para rebobinar', id, -5, 0),
      step('−5s', -5),
      step('−½s', -0.5),
      playButton,
      step('+½s', 0.5),
      step('+5s', 5),
      holdButton('⏩', 'Segure para avançar rápido', id, 5, 0),
    );
    const bend = h(
      'div',
      { class: 'dj-transport' },
      h('span', { class: 'dj-label', textContent: 'Sincronizar' }),
      holdButton('Frear', 'Segure para diminuir a velocidade um pouco (sincronizar com a outra música)', id, 0, -0.08),
      holdButton('Acelerar', 'Segure para aumentar a velocidade um pouco (sincronizar com a outra música)', id, 0, 0.08),
    );

    const root = h('div', { class: 'cfg-card' }, title, row('Música', trackSelect), h('div', { class: 'dj-seek' }, seek, time), transport, bend);

    const sliders: Bound[] = [];
    for (const param of Object.keys(DECK_PARAMS) as DeckParam[]) {
      const def = DECK_PARAMS[param];
      const s = bound(def.min, def.max, def.step, () => deck.values[param], (v) => dj.setControl(`${id}.${param}`, v), def.unit);
      sliders.push(s);
      root.append(row(def.label, s.el));
    }

    return {
      root,
      refresh: () => {
        fillTracks();
        refreshLive();
      },
      live: refreshLive,
    };

    function refreshLive(): void {
      const duration = deck.track?.duration ?? 0;
      seek.max = String(duration || 1);
      seek.disabled = !deck.track;
      if (dragging !== seek) seek.value = String(deck.position);
      time.textContent = deck.track ? `${formatTime(deck.position)} / ${formatTime(duration)}` : '–:–';
      playButton.textContent = deck.playing ? '⏸' : '▶';
      playButton.classList.toggle('on', deck.playing);
      for (const s of sliders) s.sync();
    }
  };

  const deckViews = DECKS.map(buildDeck);
  decksSection.body.append(...deckViews.map((d) => d.root));

  // ----- Mesa -----
  const crossfader = bound(-1, 1, 0.01, () => dj.crossfader, (v) => dj.setControl('crossfader', v));
  const master = bound(0, 1, 0.01, () => dj.masterVolume, (v) => dj.setControl('master', v));
  mixer.body.append(row('Crossfader', crossfader.el), row('Volume geral', master.el));

  // ----- Regras -----
  const renderRules = (): void => {
    const add = h('button', { textContent: '+ Nova regra' });
    add.addEventListener('click', () => {
      state.addDjRule();
      renderRules();
    });
    rules.body.replaceChildren(
      h('p', { class: 'cfg-hint', textContent: 'Cada regra diz: quando esta mão fizer este gesto, mova um controle (com a posição da mão) ou faça uma ação.' }),
      add,
      ...state.djRules.map((rule, i) => ruleCard(rule, i)),
    );
  };

  const ruleCard = (rule: DjRule, index: number): HTMLElement => {
    const remove = h('button', { class: 'danger', textContent: '✕', title: 'Apagar regra' });
    remove.addEventListener('click', () => {
      state.removeDjRule(rule.id);
      renderRules();
    });
    const card = h(
      'div',
      { class: 'cfg-card' },
      h('div', { class: 'cfg-card-head' }, checkbox(rule.enabled, (v) => (rule.enabled = v)), h('span', { class: 'grow', textContent: `Regra ${index + 1}` }), remove),
    );

    const gestureOptions = rule.mode === 'control' ? [ALWAYS_OPTION, ...GESTURE_OPTIONS] : GESTURE_OPTIONS;
    card.append(
      row(
        'O que faz',
        select(MODE_OPTIONS, rule.mode, (v) => {
          rule.mode = v as DjRule['mode'];
          if (rule.mode === 'action' && rule.gesture === 'always') rule.gesture = 'fist';
          renderRules();
        }),
      ),
      row('Mão', select(HAND_OPTIONS, rule.hand, (v) => (rule.hand = v as HandSelector))),
      row('Gesto', select(gestureOptions, rule.gesture, (v) => (rule.gesture = v as DjRule['gesture']))),
    );

    if (rule.mode === 'control') {
      card.append(
        row('Controle', select(CONTROLS.map((c) => [c.id, c.label] as const), rule.control, (v) => (rule.control = v))),
        row('Movimento', select(AXIS_OPTIONS, rule.axis, (v) => (rule.axis = v as DjAxis))),
        row('Inverter', checkbox(rule.invert, (v) => (rule.invert = v))),
      );
    } else {
      card.append(row('Ação', select(ACTIONS.map((a) => [a.id, a.label] as const), rule.action, (v) => (rule.action = v))));
    }
    return card;
  };

  help.body.append(
    h('p', { class: 'cfg-hint', textContent: '1. Adicione músicas e carregue cada uma em um deck (botões A e B). 2. Use os botões e sliders, ou crie regras para controlar com as mãos.' }),
    h('p', { class: 'cfg-hint', textContent: 'Sincronizar duas músicas: toque uma, comece a outra e use "Frear" / "Acelerar" (segurando) até as batidas casarem. Para rebobinar ou avançar rápido, segure ⏪ ou ⏩.' }),
    h('p', { class: 'cfg-hint', textContent: 'Exemplo de regra: mão esquerda + punho + "Mover um controle" + Deck A · Volume + altura da mão. Fechando o punho e subindo/descendo a mão, o volume do deck A muda.' }),
    h('p', { class: 'cfg-hint', textContent: 'A velocidade muda o tom junto (como um disco de vinil). Tecla D abre/fecha esta tela.' }),
  );

  // ----- Ligações -----
  const refreshAll = (): void => {
    for (const d of deckViews) d.refresh();
  };
  dj.tracks.onChange(() => {
    renderLibrary();
    refreshAll();
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files.length) void dj.tracks.addFiles(Array.from(e.dataTransfer.files));
  });

  renderLibrary();
  renderRules();
  refreshAll();

  // Mantém tempo, botão de tocar e sliders em dia (os gestos também mexem neles) enquanto a tela está aberta
  const loop = (): void => {
    requestAnimationFrame(loop);
    if (!isOpen()) return;
    audioWarning.style.display = dj.audioRunning ? 'none' : 'block';
    for (const d of deckViews) d.live();
    crossfader.sync();
    master.sync();
  };
  requestAnimationFrame(loop);
}
