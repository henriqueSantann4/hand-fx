import * as THREE from 'three';
import { Effect } from '../core/effect';
import type { FrameData } from '../core/types';
import { loadFilters, type FilterDef } from '../filters';
import { isCrossed, quadTriangles, type Quad, type Vec2 } from './geometry';
import { HistoryBuffer } from './history';
import type { Stage } from '../core/stage';
import { ensureFilterParams, type AppState, type FilterSlot } from './state';

/** Tempo (s) que a moldura aguenta sem as duas mãos antes de desligar. */
const LOST_GRACE = 0.2;
/** A moldura só aparece (com a animação) quando a diagonal dela passa disto, em tamanhos de mão */
const REVEAL_SIZE = 0.8;
/** Duração (s) da animação da moldura crescendo ao aparecer */
const APPEAR_TIME = 0.6;

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

// Posição da cena (pixels) -> coordenada de textura do vídeo, com espelho e recorte "cover"
vec2 sceneToUv(vec2 p) {
  float scale = max(uView.x / uVideoSize.x, uView.y / uVideoSize.y);
  vec2 disp = uVideoSize * scale;
  vec2 off = (uView - disp) * 0.5;
  float px = p.x + uView.x * 0.5;
  float py = uView.y * 0.5 - p.y;
  return vec2(1.0 - (px - off.x) / disp.x, 1.0 - (py - off.y) / disp.y);
}

vec4 sampleScene(vec2 p) {
  return texture2D(uVideo, sceneToUv(p));
}
${filter.history ? HISTORY_SAMPLE_GLSL : ''}

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

  private filters = new Map<string, FilterDef>();
  private materials = new Map<string, THREE.ShaderMaterial>();
  private videoTexture: THREE.VideoTexture;
  private stage: Stage | null = null;
  private history: HistoryBuffer | null = null;
  /** Caixa (x mín., y mín., x máx., y máx.) da moldura que está sendo desenhada */
  private box = new THREE.Vector4();

  private geometry = new THREE.BufferGeometry();
  private positions = new THREE.BufferAttribute(new Float32Array(6 * 3), 3);
  private fill: THREE.Mesh;

  private outlineGeometry = new THREE.BufferGeometry();
  private outlinePositions = new THREE.BufferAttribute(new Float32Array(4 * 3), 3);
  private outline: THREE.LineLoop;
  private outlineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });

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

    this.group.add(this.fill, this.outline);
  }

  init(stage: Stage): void {
    this.stage = stage;
  }

  /** Algum dos filtros escolhidos precisa do histórico de quadros? */
  private needsHistory(): boolean {
    const f = this.state.frame;
    const slots = [f.quad, f.triangles.both, f.triangles.left, f.triangles.right];
    return slots.some((s) => this.filters.get(s.filterId)?.history);
  }

  update(frame: FrameData): void {
    const cfg = this.state.frame;

    // Guarda os quadros enquanto um filtro com histórico está escolhido (mesmo antes de a moldura abrir)
    if (this.stage && this.needsHistory()) {
      this.history ??= new HistoryBuffer(this.stage.renderer, this.videoTexture, this.video);
      this.history.record();
    }

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

  dispose(): void {
    this.geometry.dispose();
    this.outlineGeometry.dispose();
    this.outlineMaterial.dispose();
    this.videoTexture.dispose();
    this.history?.dispose();
    for (const m of this.materials.values()) m.dispose();
  }

  /** Material do filtro da vaga indicada, já com os valores atuais dos parâmetros. */
  private prepare(slotName: string, slot: FilterSlot, frame: FrameData): THREE.ShaderMaterial | null {
    const filter = this.filters.get(slot.filterId) ?? this.filters.values().next().value;
    if (!filter) return null;

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
