import './configPanel.css';
import { FINGER_LABELS, GESTURE_LABELS } from '../core/gestures';
import type { FingerName, GestureId } from '../core/types';
import { settings } from '../core/settings';
import { ensureFilterParams, type Anchor, type AppState, type FilterSlot, type HandSelector, type ImageRule } from '../features/state';
import { loadFilters } from '../filters';
import { checkbox, h, row, section, select, slider } from './dom';

// ---------- Opções ----------

const HAND_OPTIONS = [
  ['any', 'Qualquer mão'],
  ['left', 'Mão esquerda'],
  ['right', 'Mão direita'],
] as const satisfies ReadonlyArray<readonly [HandSelector, string]>;

const GESTURE_OPTIONS = (Object.entries(GESTURE_LABELS) as [GestureId, string][]).map(([id, label]) => [id, label] as const);
const FINGER_OPTIONS = (Object.entries(FINGER_LABELS) as [FingerName, string][]).map(([id, label]) => [id, label] as const);

const ANCHOR_OPTIONS = [
  ['palm', 'Presa à palma'],
  ['wrist', 'Presa ao pulso (punho)'],
  ['fingertip', 'Ponta de um dedo'],
  ['fixed', 'Fixa na tela'],
] as const satisfies ReadonlyArray<readonly [Anchor['kind'], string]>;

function defaultAnchor(kind: Anchor['kind']): Anchor {
  switch (kind) {
    case 'palm':
      return { kind: 'palm' };
    case 'wrist':
      return { kind: 'wrist' };
    case 'fingertip':
      return { kind: 'fingertip', finger: 'index' };
    case 'fixed':
      return { kind: 'fixed', x: 0.5, y: 0.5 };
  }
}

// ---------- Tela de configuração ----------

export function createConfigPanel(state: AppState): void {
  const toggle = h('button', { class: 'cfg-toggle', textContent: '⚙ Configurar (C)' });
  const panel = h('aside', { class: 'cfg-panel hidden' });
  document.body.append(toggle, panel);

  const setOpen = (open: boolean): void => {
    panel.classList.toggle('hidden', !open);
    if (open) window.dispatchEvent(new CustomEvent('handfx:panel-open', { detail: 'config' }));
  };
  window.addEventListener('handfx:panel-open', (e) => {
    if ((e as CustomEvent).detail !== 'config') panel.classList.add('hidden');
  });
  toggle.addEventListener('click', () => setOpen(panel.classList.contains('hidden')));
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    if (e.key.toLowerCase() === 'c' && !e.ctrlKey && !e.metaKey) setOpen(panel.classList.contains('hidden'));
  });

  const images = section('Imagens', true);
  const rules = section('Regras de gestos (imagens)', true);
  const frame = section('Moldura com filtro (duas mãos)', true);
  const hands = section('Mãos', true);
  const help = section('Como usar', false);
  panel.append(images.root, rules.root, frame.root, hands.root, help.root);

  // ----- Imagens -----
  const renderImages = (): void => {
    const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    fileInput.addEventListener('change', () => {
      if (fileInput.files) void state.library.addFiles(Array.from(fileInput.files));
      fileInput.value = '';
    });
    const addButton = h('button', { textContent: '+ Adicionar imagens' });
    addButton.addEventListener('click', () => fileInput.click());

    const grid = h('div', { class: 'cfg-images' });
    for (const item of state.library.items) {
      const remove = h('button', { textContent: '✕', title: 'Remover' });
      remove.addEventListener('click', () => state.library.remove(item.id));
      grid.append(h('div', { class: 'cfg-thumb' }, h('img', { src: item.url, alt: item.name }), h('span', { textContent: item.name, title: item.name }), remove));
    }

    images.body.replaceChildren(
      h('p', { class: 'cfg-hint', textContent: 'Você também pode arrastar imagens para a tela. As imagens ficam só nesta sessão: ao recarregar a página, adicione de novo.' }),
      addButton,
      fileInput,
      grid,
    );
  };

  // ----- Regras -----
  const renderRules = (): void => {
    const addRule = h('button', { textContent: '+ Nova regra' });
    addRule.addEventListener('click', () => {
      state.addRule();
      renderRules();
    });

    rules.body.replaceChildren(
      h('p', { class: 'cfg-hint', textContent: 'Cada regra diz: quando esta mão fizer este gesto, mostre esta imagem neste lugar.' }),
      addRule,
      ...state.rules.map((rule, index) => ruleCard(rule, index)),
    );
  };

  const ruleCard = (rule: ImageRule, index: number): HTMLElement => {
    const enabled = checkbox(rule.enabled, (v) => (rule.enabled = v));
    const remove = h('button', { class: 'danger', textContent: '✕', title: 'Apagar regra' });
    remove.addEventListener('click', () => {
      state.removeRule(rule.id);
      renderRules();
    });
    const card = h('div', { class: 'cfg-card' }, h('div', { class: 'cfg-card-head' }, enabled, h('span', { class: 'grow', textContent: `Regra ${index + 1}` }), remove));

    card.append(
      row('Mão', select(HAND_OPTIONS, rule.hand, (v) => (rule.hand = v as HandSelector))),
      row('Gesto', select(GESTURE_OPTIONS, rule.gesture, (v) => (rule.gesture = v as GestureId))),
      row(
        'Imagem',
        select(
          state.library.items.map((i) => [i.id, i.name] as const),
          rule.imageId ?? '',
          (v) => (rule.imageId = v || null),
          state.library.items.length ? '(escolha)' : '(adicione imagens)',
        ),
      ),
      row(
        'Posição',
        select(ANCHOR_OPTIONS, rule.anchor.kind, (v) => {
          rule.anchor = defaultAnchor(v as Anchor['kind']);
          renderRules();
        }),
      ),
    );

    const anchor = rule.anchor;
    if (anchor.kind === 'fingertip') {
      card.append(row('Dedo', select(FINGER_OPTIONS, anchor.finger, (v) => (anchor.finger = v as FingerName))));
    } else if (anchor.kind === 'fixed') {
      card.append(
        row('Posição X', slider(0, 100, 1, anchor.x * 100, (v) => (anchor.x = v / 100), '%')),
        row('Posição Y', slider(0, 100, 1, anchor.y * 100, (v) => (anchor.y = v / 100), '%')),
      );
    }

    card.append(
      row(
        'Tamanho segue a mão',
        checkbox(rule.scaleWithHand, (v) => {
          rule.scaleWithHand = v;
          renderRules();
        }),
      ),
      rule.scaleWithHand
        ? row('Tamanho', slider(0.3, 6, 0.1, rule.sizeHand, (v) => (rule.sizeHand = v), '×'))
        : row('Tamanho', slider(20, 1200, 10, rule.sizePx, (v) => (rule.sizePx = v), ' px')),
      row('Opacidade', slider(0, 1, 0.01, rule.opacity, (v) => (rule.opacity = v))),
      row('Deslocar X', slider(-400, 400, 5, rule.offsetX, (v) => (rule.offsetX = v), ' px')),
      row('Deslocar Y', slider(-400, 400, 5, rule.offsetY, (v) => (rule.offsetY = v), ' px')),
      row('Girar com a mão', checkbox(rule.rotateWithHand, (v) => (rule.rotateWithHand = v))),
    );
    return card;
  };

  // ----- Moldura -----
  /** Linhas de "Filtro" + sliders dos parâmetros para uma vaga de filtro. */
  const filterEditor = (slot: FilterSlot): HTMLElement[] => {
    const filters = loadFilters();
    const filter = filters.find((f) => f.id === slot.filterId) ?? filters[0];
    const rows: HTMLElement[] = [
      row(
        'Filtro',
        select(
          filters.map((f) => [f.id, f.label] as const),
          filter?.id ?? '',
          (v) => {
            slot.filterId = v;
            renderFrame();
          },
        ),
      ),
    ];
    if (filter) {
      const values = ensureFilterParams(slot, filter);
      for (const p of filter.params) {
        rows.push(row(p.label, slider(p.min, p.max, p.step, values[p.key], (v) => (values[p.key] = v))));
      }
    }
    return rows;
  };

  const renderFrame = (): void => {
    const cfg = state.frame;
    const tri = cfg.triangles;

    frame.body.replaceChildren(
      h('p', { class: 'cfg-hint', textContent: 'Com as duas mãos, aproxime as pontas dos polegares e dos indicadores e depois afaste para abrir a moldura. O filtro vale só dentro dela.' }),
      row('Ligada', checkbox(cfg.enabled, (v) => (cfg.enabled = v))),
      row('Mostrar linhas do contorno', checkbox(cfg.showOutline, (v) => (cfg.showOutline = v))),
      row('Distância para ativar', slider(0.02, 1.5, 0.01, cfg.armDistance, (v) => (cfg.armDistance = v), '×')),

      h('div', { class: 'cfg-subtitle', textContent: 'Quadrilátero (moldura normal)' }),
      ...filterEditor(cfg.quad),

      h('div', { class: 'cfg-subtitle', textContent: 'Dois triângulos (ao girar uma mão)' }),
      h('p', { class: 'cfg-hint', textContent: 'Quando você gira uma das mãos e o contorno se cruza, a moldura vira dois triângulos. Escolha o filtro de cada um, ou o mesmo para os dois.' }),
      row(
        'Mesmo filtro nos dois',
        checkbox(tri.sameFilter, (v) => {
          tri.sameFilter = v;
          renderFrame();
        }),
      ),
      ...(tri.sameFilter
        ? filterEditor(tri.both)
        : [
            h('div', { class: 'cfg-subtitle small', textContent: 'Triângulo da esquerda' }),
            ...filterEditor(tri.left),
            h('div', { class: 'cfg-subtitle small', textContent: 'Triângulo da direita' }),
            ...filterEditor(tri.right),
          ]),
    );
  };

  // ----- Mãos -----
  hands.body.append(
    row('Mostrar esqueleto', checkbox(settings.showSkeleton, (v) => (settings.showSkeleton = v))),
    h('p', { class: 'cfg-hint', textContent: 'Quando uma imagem está presa a uma mão (palma, pulso ou dedo), o esqueleto dessa mão some, mesmo com esta opção ligada.' }),
  );

  // ----- Ajuda -----
  help.body.append(
    h('p', { class: 'cfg-hint', textContent: 'Gestos: mão aberta (4 dedos esticados), punho fechado, indicador levantado (só o indicador esticado) e pinça (polegar e indicador juntos).' }),
    h('p', { class: 'cfg-hint', textContent: 'No diagnóstico (canto inferior esquerdo) aparece o gesto reconhecido e quais dedos estão esticados. Teclas: C abre esta tela, H esconde o painel de cima.' }),
  );

  // ----- Ligações -----
  state.library.onChange(() => {
    renderImages();
    renderRules();
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.files.length) void state.library.addFiles(Array.from(e.dataTransfer.files));
  });

  renderImages();
  renderRules();
  renderFrame();
}
