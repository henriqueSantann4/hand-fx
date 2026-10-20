import * as THREE from 'three';
import { Effect } from '../core/effect';
import type { FrameData } from '../core/types';
import { loadFilters, type FilterDef } from '../filters';
import { isCrossed, quadTriangles, type Quad, type Vec2 } from './geometry';
import { HistoryBuffer } from './history';
import { FaceTracker } from '../core/faceTracker';
import { MotionBuffer, readMotionParams, type MotionParams } from './motionBuffer';
import { SCENE_SAMPLE_GLSL } from './sceneGlsl';
import type { Stage } from '../core/stage';
import { ensureFilterParams, NO_FILTER, type AppState, type FilterSlot } from './state';
import { FilterWheel } from '../ui/filterWheel';
import type { HandData, Side } from '../core/types';

/** Tempo (s) que a moldura aguenta sem as duas mãos antes de desligar. */
const LOST_GRACE = 0.2;
/** A moldura só aparece (com a animação) quando a diagonal dela passa disto, em tamanhos de mão */
const REVEAL_SIZE = 0.8;
/** Duração (s) da animação da moldura crescendo ao aparecer */
const APPEAR_TIME = 0.6;
/** OK + arrastar (filtro da tela inteira): a roda aparece depois de arrastar isto, em tamanhos de mão */
const WHEEL_SHOW = 0.5;
/** ...e passa um filtro a cada isto arrastado, em tamanhos de mão */
const WHEEL_STEP = 1;
/** Se o OK falhar por menos que isto (s) durante o arrasto, o arrasto continua */
const WHEEL_GRACE = 0.2;

/** Ponto do OK: entre as pontas do polegar e do indicador (x na tela, direita = positivo) */
const okX = (hand: HandData): number => (hand.points[4].x + hand.points[8].x) / 2;

/** Cresce de 0 a 1 passando um pouquinho de 1 no fim (efeito elástico leve) */
function easeOutBack(t: number): number {
  const c1 = 1.0;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Textura com os últimos quadros (veja history.ts) */
const HISTORY_GLSL = /* glsl */ `
uniform sampler2D uHist;
uniform float uHistHead;
uniform float uHistN;
uniform vec2 uHistGrid;
`;

const HISTORY_SAMPLE_GLSL = /* glsl */ `
vec4 histTile(vec2 uv, float age) {
  float idx = mod(uHistHead - age + uHistN * 4.0, uHistN);
  vec2 tile = vec2(mod(idx, uHistGrid.x), floor(idx / uHistGrid.x));
  vec2 inner = clamp(uv, 0.003, 0.997);
  return texture2D(uHist, (tile + inner) / uHistGrid);
}

// A câmera na posição p da cena, "age" quadros atrás (aceita valores quebrados)
vec4 sampleHistory(vec2 p, float age) {
  vec2 uv = sceneToUv(p);
  float a = clamp(age, 0.0, uHistN - 2.0);
  float a0 = floor(a);
  return mix(histTile(uv, a0), histTile(uv, a0 + 1.0), a - a0);
}
`;

/** Imagem "derretida" e movimento da câmera (veja motionBuffer.ts) */
const MOTION_GLSL = /* glsl */ `
uniform sampler2D uMosh;
uniform sampler2D uFlow;

// A imagem derretida na posição p da cena
vec4 sampleMosh(vec2 p) {
  return texture2D(uMosh, p / uView + 0.5);
}

// O movimento na posição p da cena: xy = deslocamento, z = quanto se mexe
vec4 sampleFlow(vec2 p) {
  return texture2D(uFlow, p / uView + 0.5);
}
`;

/** Contorno do rosto (veja core/faceTracker.ts) */
const FACE_GLSL = /* glsl */ `
uniform vec2 uFace[${FaceTracker.COUNT}];
uniform float uFacePresence;
uniform float uFaceRadius;

// 1 dentro do rosto, 0 fora, com borda suave de "feather" pixels. Sem rosto na câmera: 1 em tudo.
float faceMask(vec2 p, float feather) {
  float d = 1e9;
  bool inside = false;
  for (int i = 0; i < ${FaceTracker.COUNT}; i++) {
    vec2 a = uFace[i];
    vec2 b = uFace[i == ${FaceTracker.COUNT - 1} ? 0 : i + 1];
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
    d = min(d, length(pa - ba * h));
    if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  float sd = inside ? -d : d;
  float m = 1.0 - smoothstep(-feather, feather, sd);
  return mix(1.0, m, uFacePresence);
}
`;

const VERTEX = /* glsl */ `
varying vec2 vPos;
void main() {
  vPos = position.xy; // a malha já está em coordenadas da cena (pixels)
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Monta o shader: parte comum (ler a câmera alinhada com a tela) + o trecho do filtro. */
function buildFragment(filter: FilterDef): string {
  const uniforms = filter.params.map((p) => `uniform float uP_${p.key};`).join('\n');
  return /* glsl */ `
uniform sampler2D uVideo;
uniform vec2 uView;
uniform vec2 uVideoSize;
uniform float uTime;
uniform vec4 uBox;
${filter.history ? HISTORY_GLSL : ''}
${uniforms}
varying vec2 vPos;
${SCENE_SAMPLE_GLSL}
${filter.history ? HISTORY_SAMPLE_GLSL : ''}
${filter.motion ? MOTION_GLSL : ''}
${filter.face ? FACE_GLSL : ''}

${filter.glsl}

void main() {
  gl_FragColor = vec4(applyFilter(vPos).rgb, 1.0);
}`;
}

/**
 * Moldura feita com as duas mãos: as pontas dos polegares e indicadores formam um quadrilátero
 * (polegar esq., indicador esq., indicador dir., polegar dir.). Dentro dele a câmera recebe um filtro.
 *
 * Ativa quando as pontas dos dois polegares e dos dois indicadores se aproximam; depois, ao afastar as
 * mãos, o quadrilátero se abre. Se uma mão girar, o contorno se cruza e vira dois triângulos, cada um
 * com o seu filtro (esquerdo e direito na tela) ou um filtro só para os dois.
 */
export class FrameFilterEffect extends Effect {
  readonly label = 'Filtro da moldura';

  /** Evento disparado quando o filtro da tela inteira muda por gesto (a tela de configuração se atualiza) */
  static readonly FULLSCREEN_EVENT = 'handfx:fullscreen-filter';

  private filters = new Map<string, FilterDef>();
  private materials = new Map<string, THREE.ShaderMaterial>();
  private videoTexture: THREE.VideoTexture;
  private stage: Stage | null = null;
  private history: HistoryBuffer | null = null;
  private motion: MotionBuffer | null = null;
  private face: FaceTracker | null = null;
  /** Caixa (x mín., y mín., x máx., y máx.) da moldura que está sendo desenhada */
  private box = new THREE.Vector4();

  private geometry = new THREE.BufferGeometry();
  private positions = new THREE.BufferAttribute(new Float32Array(6 * 3), 3);
  private fill: THREE.Mesh;

  private outlineGeometry = new THREE.BufferGeometry();
  private outlinePositions = new THREE.BufferAttribute(new Float32Array(4 * 3), 3);
  private outline: THREE.LineLoop;
  private outlineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });

  /** Filtro na tela inteira: um retângulo do tamanho da tela, atrás da moldura */
  private fullGeometry = new THREE.BufferGeometry();
  private fullPositions = new THREE.BufferAttribute(new Float32Array(6 * 3), 3);
  private full: THREE.Mesh;
  private wheel = new FilterWheel();
  /** Arrasto com OK em andamento: de onde começou, quantos filtros já passou e quando o OK foi visto */
  private drag: { side: Side; startX: number; step: number; start: number; steps: number; shown: boolean; seen: number } | null = null;
  /** Última posição da roda (sem dar a volta), para ela sumir mostrando o filtro escolhido */
  private wheelAt = 0;

  private active = false;
  private lostSince: number | null = null;
  private activeSince = 0;
  /** A moldura já abriu o bastante para aparecer? (antes disso as pontas ainda estão juntas) */
  private revealed = false;
  private revealDiagonal = 0;
  private corners: Quad | null = null;

  constructor(
    private state: AppState,
    private video: HTMLVideoElement,
  ) {
    super();
    for (const f of loadFilters()) this.filters.set(f.id, f);

    this.videoTexture = new THREE.VideoTexture(video);
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;

    this.geometry.setAttribute('position', this.positions);
    this.fill = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial());
    this.fill.frustumCulled = false;
    this.fill.renderOrder = 1;
    this.fill.visible = false;

    this.outlineGeometry.setAttribute('position', this.outlinePositions);
    this.outline = new THREE.LineLoop(this.outlineGeometry, this.outlineMaterial);
    this.outline.frustumCulled = false;
    this.outline.renderOrder = 2;
    this.outline.visible = false;

    this.fullGeometry.setAttribute('position', this.fullPositions);
    this.full = new THREE.Mesh(this.fullGeometry, new THREE.MeshBasicMaterial());
    this.full.frustumCulled = false;
    this.full.renderOrder = 0;
    this.full.visible = false;

    this.group.add(this.full, this.fill, this.outline);
  }

  init(stage: Stage): void {
    this.stage = stage;
  }

  /** Vagas de filtro em uso: a tela inteira (se ligada), o quadrilátero e os triângulos */
  private slots(): FilterSlot[] {
    const f = this.state.frame;
    const list = [f.quad, f.triangles.both, f.triangles.left, f.triangles.right];
    const full = this.state.fullscreen.slot;
    return full.filterId === NO_FILTER ? list : [full, ...list];
  }

  /** Algum dos filtros escolhidos precisa do histórico de quadros? */
  private needsHistory(): boolean {
    return this.slots().some((s) => this.filters.get(s.filterId)?.history);
  }

  /** Vagas (quadrilátero e triângulos) cujo filtro usa o movimento da câmera (datamosh). */
  private motionSlot(): { slot: FilterSlot; filter: FilterDef } | null {
    for (const slot of this.slots()) {
      const filter = this.filters.get(slot.filterId);
      if (filter?.motion) return { slot, filter };
    }
    return null;
  }

  /** Algum dos filtros escolhidos usa o rosto? */
  private needsFace(): boolean {
    return this.slots().some((s) => this.filters.get(s.filterId)?.face);
  }

  private motionParams(): MotionParams {
    const found = this.motionSlot();
    return readMotionParams(found ? ensureFilterParams(found.slot, found.filter) : {});
  }

  update(frame: FrameData): void {
    const cfg = this.state.frame;

    // Guarda os quadros enquanto um filtro com histórico está escolhido (mesmo antes de a moldura abrir)
    if (this.stage && this.needsHistory()) {
      this.history ??= new HistoryBuffer(this.stage.renderer, this.videoTexture, this.video);
      this.history.record();
    }

    // O datamosh também trabalha antes de a moldura abrir, para já estar "quente" quando ela aparecer
    if (this.stage && this.motionSlot()) {
      this.motion ??= new MotionBuffer(this.stage.renderer, this.videoTexture, this.video);
      this.motion.update(frame.time, frame.view, this.motionParams());
    } else {
      this.motion?.idle();
    }

    // O rosto também é seguido antes de a moldura abrir
    if (this.stage && this.needsFace()) {
      if (!this.face) {
        this.face = new FaceTracker();
        this.face.init().catch((err: unknown) => console.warn('Não consegui carregar o modelo de rosto.', err));
      }
      this.face.update(this.video, frame.view, performance.now(), frame.delta);
    } else {
      this.face?.idle();
    }

    this.updateFullscreen(frame);

    const left = frame.hands.find((h) => h.side === 'left');
    const right = frame.hands.find((h) => h.side === 'right');
    const bothIndexUp = cfg.enabled && !!left && !!right && left.fingers.index && right.fingers.index;

    if (!this.active) {
      if (bothIndexUp && left && right) {
        const arm = cfg.armDistance * ((left.handSize + right.handSize) / 2);
        // Distância só na tela (x, y): o z de cada mão é medido a partir do pulso dela, então
        // comparar o z de mãos diferentes não faz sentido e atrapalharia juntar as pontas.
        const thumbsClose = distance2D(left.points[4], right.points[4]) < arm;
        const indexesClose = distance2D(left.points[8], right.points[8]) < arm;
        if (thumbsClose && indexesClose) {
          this.active = true;
          this.revealed = false;
          this.revealDiagonal = REVEAL_SIZE * ((left.handSize + right.handSize) / 2);
          this.lostSince = null;
        }
      }
    } else if (bothIndexUp) {
      this.lostSince = null;
    } else {
      this.lostSince ??= frame.time;
      if (frame.time - this.lostSince > LOST_GRACE) this.active = false;
    }
    this.state.runtime.frameActive = this.active;

    if (this.active && left && right) {
      const flat = (p: { x: number; y: number }): Vec2 => ({ x: p.x, y: p.y });
      this.corners = [flat(left.points[4]), flat(left.points[8]), flat(right.points[8]), flat(right.points[4])];
    }

    if (!this.active || !this.corners) {
      this.fill.visible = false;
      this.outline.visible = false;
      return;
    }

    // Escolhe o filtro de cada triângulo. Contorno normal: o mesmo filtro (quadrilátero) nos dois.
    // Contorno cruzado (mão girada): dois triângulos, ordenados da esquerda para a direita na tela.
    // Enquanto as pontas ainda estão juntas não desenha nada; quando a moldura abre o bastante, ela "nasce" crescendo
    if (!this.revealed) {
      const xs = this.corners.map((c) => c.x);
      const ys = this.corners.map((c) => c.y);
      const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      if (diagonal < this.revealDiagonal) {
        this.fill.visible = false;
        this.outline.visible = false;
        return;
      }
      this.revealed = true;
      this.activeSince = frame.time;
    }

    // Animação de entrada: o contorno e o filtro crescem a partir do centro da moldura
    const progress = Math.min(1, Math.max(0, (frame.time - this.activeSince) / APPEAR_TIME));
    const grow = easeOutBack(progress);
    const cx = this.corners.reduce((a, c) => a + c.x, 0) / 4;
    const cy = this.corners.reduce((a, c) => a + c.y, 0) / 4;
    const scaled = (c: Vec2): Vec2 => ({ x: cx + (c.x - cx) * grow, y: cy + (c.y - cy) * grow });
    const [c0, c1, c2, c3] = this.corners;
    const shown: Quad = [scaled(c0), scaled(c1), scaled(c2), scaled(c3)];

    const triangles = quadTriangles(shown);
    const xs = shown.map((c) => c.x);
    const ys = shown.map((c) => c.y);
    this.box.set(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    let materials: [THREE.ShaderMaterial, THREE.ShaderMaterial] | null;
    if (!isCrossed(this.corners)) {
      const m = this.prepare('quad', cfg.quad, frame);
      materials = m && [m, m];
    } else {
      triangles.sort((a, b) => centerX(a) - centerX(b));
      const t = cfg.triangles;
      if (t.sameFilter) {
        const m = this.prepare('both', t.both, frame);
        materials = m && [m, m];
      } else {
        const l = this.prepare('left', t.left, frame);
        const r = this.prepare('right', t.right, frame);
        materials = l && r ? [l, r] : null;
      }
    }
    if (!materials) {
      this.fill.visible = false;
      this.outline.visible = false;
      return;
    }

    // Preenchimento: dois triângulos, cada um com o seu material
    let i = 0;
    for (const tri of triangles) {
      for (const v of tri) {
        this.positions.setXYZ(i++, v.x, v.y, 0);
      }
    }
    this.positions.needsUpdate = true;
    this.geometry.clearGroups();
    this.geometry.addGroup(0, 3, 0);
    this.geometry.addGroup(3, 3, 1);
    this.fill.material = materials;
    this.fill.visible = true;

    // Contorno (linhas brancas)
    shown.forEach((c, k) => this.outlinePositions.setXYZ(k, c.x, c.y, 0));
    this.outlinePositions.needsUpdate = true;
    this.outline.visible = cfg.showOutline;
  }

  /**
   * Filtro na tela inteira e a troca dele com OK + arrastar: fazendo o OK, arrastar para a direita
   * passa para os próximos filtros da roda e para a esquerda volta, um a cada WHEEL_STEP mãos. A roda começa por "Desativado".
   */
  private updateFullscreen(frame: FrameData): void {
    const fs = this.state.fullscreen;
    const wheel = [{ id: NO_FILTER, label: 'Desativado' }, ...this.filters.values()];
    const n = wheel.length;
    const current = Math.max(0, wheel.findIndex((f) => f.id === fs.slot.filterId));

    let hand = this.drag && frame.hands.find((h) => h.side === this.drag?.side && h.gesture === 'ok');
    if (hand && this.drag) this.drag.seen = frame.time;
    // O OK sumiu: espera um pouco antes de encerrar (o rastreio pode perder um dedo por um instante)
    if (!hand && this.drag && frame.time - this.drag.seen > WHEEL_GRACE) this.drag = null;
    if (!this.drag) {
      // Começa um arrasto novo com qualquer mão que esteja fazendo o OK
      hand = frame.hands.find((h) => h.gesture === 'ok');
      if (hand) {
        this.drag = { side: hand.side, startX: okX(hand), step: WHEEL_STEP * hand.handSize, start: current, steps: 0, shown: false, seen: frame.time };
      }
    }

    let jump = false;
    if (this.drag && hand) {
      const d = this.drag;
      const dx = okX(hand) - d.startX;
      if (!d.shown && Math.abs(dx) >= (WHEEL_SHOW / WHEEL_STEP) * d.step) {
        d.shown = true;
        jump = true;
      }
      const steps = d.shown ? Math.trunc(dx / d.step) : 0;
      if (steps !== d.steps) {
        d.steps = steps;
        fs.slot.filterId = wheel[(((d.start + steps) % n) + n) % n].id;
        window.dispatchEvent(new CustomEvent(FrameFilterEffect.FULLSCREEN_EVENT));
      }
      if (d.shown) this.wheelAt = d.start + steps;
    }
    this.wheel.update(
      wheel.map((f) => f.label),
      this.wheelAt,
      !!this.drag?.shown,
      frame.delta,
      jump,
    );

    if (fs.slot.filterId === NO_FILTER) {
      this.full.visible = false;
      return;
    }

    const w = frame.view.width / 2;
    const hh = frame.view.height / 2;
    const corners = [-w, -hh, w, -hh, w, hh, -w, -hh, w, hh, -w, hh];
    for (let k = 0; k < 6; k++) this.fullPositions.setXYZ(k, corners[k * 2], corners[k * 2 + 1], 0);
    this.fullPositions.needsUpdate = true;

    this.box.set(-w, -hh, w, hh);
    const material = this.prepare('full', fs.slot, frame);
    this.full.visible = !!material;
    if (material) this.full.material = material;
  }

  dispose(): void {
    this.fullGeometry.dispose();
    this.geometry.dispose();
    this.outlineGeometry.dispose();
    this.outlineMaterial.dispose();
    this.videoTexture.dispose();
    this.history?.dispose();
    this.motion?.dispose();
    this.face?.dispose();
    for (const m of this.materials.values()) m.dispose();
  }

  /** Material do filtro da vaga indicada, já com os valores atuais dos parâmetros. */
  private prepare(slotName: string, slot: FilterSlot, frame: FrameData): THREE.ShaderMaterial | null {
    const filter = this.filters.get(slot.filterId) ?? this.filters.values().next().value;
    if (!filter) return null;

    // O datamosh só aparece depois de a câmera entregar o primeiro quadro
    const moshTexture = this.motion?.moshTexture;
    const flowTexture = this.motion?.flowTexture;
    if (filter.motion && (!moshTexture || !flowTexture)) return null;

    const material = this.materialFor(`${slotName}:${filter.id}`, filter);
    const values = ensureFilterParams(slot, filter);
    for (const p of filter.params) material.uniforms[`uP_${p.key}`].value = values[p.key];
    (material.uniforms.uView.value as THREE.Vector2).set(frame.view.width, frame.view.height);
    material.uniforms.uTime.value = frame.time;
    (material.uniforms.uBox.value as THREE.Vector4).copy(this.box);
    if (filter.history && this.history) {
      material.uniforms.uHist.value = this.history.target.texture;
      material.uniforms.uHistHead.value = this.history.head;
    }
    if (filter.face && this.face) {
      const u = material.uniforms;
      const hasSlider = filter.params.some((p) => p.key === 'faceSize');
      const radius = this.face.fill(u.uFace.value as THREE.Vector2[], (hasSlider ? values.faceSize : filter.faceSize) ?? 1);
      u.uFacePresence.value = this.face.presence;
      u.uFaceRadius.value = radius;
    }
    if (filter.motion && moshTexture && flowTexture) {
      material.uniforms.uMosh.value = moshTexture;
      material.uniforms.uFlow.value = flowTexture;
    }
    (material.uniforms.uVideoSize.value as THREE.Vector2).set(this.video.videoWidth || 1, this.video.videoHeight || 1);
    return material;
  }

  /** Cada vaga (quadrilátero, triângulo esquerdo, direito, ambos) tem o seu material, para ter parâmetros próprios. */
  private materialFor(key: string, filter: FilterDef): THREE.ShaderMaterial {
    let material = this.materials.get(key);
    if (!material) {
      const uniforms: Record<string, THREE.IUniform> = {
        uVideo: { value: this.videoTexture },
        uView: { value: new THREE.Vector2(1, 1) },
        uVideoSize: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uBox: { value: new THREE.Vector4() },
      };
      if (filter.history) {
        uniforms.uHist = { value: null };
        uniforms.uHistHead = { value: 0 };
        uniforms.uHistN = { value: HistoryBuffer.COUNT };
        uniforms.uHistGrid = { value: new THREE.Vector2(HistoryBuffer.COLS, HistoryBuffer.ROWS) };
      }
      if (filter.face) {
        uniforms.uFace = { value: Array.from({ length: FaceTracker.COUNT }, () => new THREE.Vector2()) };
        uniforms.uFacePresence = { value: 0 };
        uniforms.uFaceRadius = { value: 1 };
      }
      if (filter.motion) {
        uniforms.uMosh = { value: null };
        uniforms.uFlow = { value: null };
      }
      for (const p of filter.params) uniforms[`uP_${p.key}`] = { value: p.value };

      material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERTEX,
        fragmentShader: buildFragment(filter),
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      this.materials.set(key, material);
    }
    return material;
  }
}

function distance2D(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centerX(tri: Vec2[]): number {
  return (tri[0].x + tri[1].x + tri[2].x) / 3;
}
