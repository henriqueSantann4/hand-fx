import * as THREE from 'three';
import { SCENE_SAMPLE_GLSL } from './sceneGlsl';

/** Parâmetros que o buffer de movimento lê do filtro (as chaves dos sliders têm exatamente estes nomes). */
export interface MotionParams {
  /** Multiplica o arrasto: 1 = acompanha o movimento real, mais que isso exagera */
  strength: number;
  /** Tamanho dos blocos (px da tela) em que o movimento é "quantizado" */
  block: number;
  /** 0 = o movimento varia suave de um bloco ao outro, 1 = cada bloco é um quadrado com um só movimento */
  hard: number;
  /** Segundos para a imagem real voltar onde nada se mexe */
  recover: number;
  /** 0 = o rastro some tão rápido quanto no resto, 1 = o rastro fica muito mais tempo onde há movimento */
  hold: number;
  /** Diferença média de brilho (0 a 1) a partir da qual um bloco conta como "em movimento" */
  threshold: number;
  /** A cada quantos segundos a imagem é renovada de uma vez, como um quadro-chave (0 = nunca) */
  keyframe: number;
}

/** Lê os parâmetros do filtro, com valores padrão para o que faltar. */
export function readMotionParams(values: Record<string, number>): MotionParams {
  return {
    strength: values.strength ?? 1.6,
    block: values.block ?? 32,
    hard: values.hard ?? 0.85,
    recover: values.recover ?? 2,
    hold: values.hold ?? 0.6,
    threshold: values.threshold ?? 0.03,
    keyframe: values.keyframe ?? 0,
  };
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** 1) Copia a câmera já alinhada com a tela, em tamanho pequeno (para medir o movimento). */
const CAPTURE_FRAGMENT = /* glsl */ `
uniform sampler2D uVideo;
uniform vec2 uView;
uniform vec2 uVideoSize;
uniform float uTexel;
varying vec2 vUv;
${SCENE_SAMPLE_GLSL}

void main() {
  vec2 p = (vUv - 0.5) * uView;
  // 4 amostras: o vídeo é bem maior que a imagem de análise, e isso também tira um pouco do ruído da câmera
  float h = 0.3 * uTexel;
  vec3 c = sampleScene(p + vec2(-h, -h)).rgb + sampleScene(p + vec2(h, -h)).rgb
         + sampleScene(p + vec2(-h, h)).rgb + sampleScene(p + vec2(h, h)).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

/**
 * 2) Fluxo óptico por blocos (block matching). Para cada célula da grade de movimento, procura onde o trecho
 * da imagem de agora estava no quadro anterior: primeiro uma busca larga, depois um ajuste fino.
 *
 * Saída (RGBA, meia precisão):
 *   rg = de onde buscar a cor no quadro anterior, em fração da imagem (deslocamento "para trás")
 *   b  = quanto movimento há ali (0 a 1)
 */
const FLOW_FRAGMENT = /* glsl */ `
uniform sampler2D uCur;
uniform sampler2D uPrev;
uniform vec2 uAn;
uniform float uThr;
// Quantidade de candidatos das duas buscas (uniforms, para o compilador não desenrolar milhares de amostras)
uniform int uCoarseN;
uniform int uFineN;
varying vec2 vUv;

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float cs[16];

// Diferença média de brilho entre a janela de agora e a janela do quadro anterior deslocada de o (px de análise)
float cost(vec2 c, vec2 o) {
  float s = 0.0;
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 w = (vec2(float(i), float(j)) - 1.5) * 3.0;
      s += abs(cs[j * 4 + i] - lum(textureLod(uPrev, c + (w + o) / uAn, 0.0).rgb));
    }
  }
  return s / 16.0;
}

void main() {
  vec2 c = vUv;
  for (int j = 0; j < 4; j++) {
    for (int i = 0; i < 4; i++) {
      vec2 w = (vec2(float(i), float(j)) - 1.5) * 3.0;
      cs[j * 4 + i] = lum(textureLod(uCur, c + w / uAn, 0.0).rgb);
    }
  }

  float c0 = cost(c, vec2(0.0));
  float best = c0;
  vec2 bo = vec2(0.0);

  // Busca larga: 13 x 13 candidatos, +-36 px de análise em passos de 6.
  // O pequeno custo por distância evita saltos sem motivo.
  for (int n = 0; n < uCoarseN; n++) {
    vec2 o = vec2(float(n - (n / 13) * 13 - 6), float(n / 13 - 6)) * 6.0;
    if (o.x == 0.0 && o.y == 0.0) continue;
    float k = cost(c, o) + 0.0002 * length(o);
    if (k < best) { best = k; bo = o; }
  }

  // Ajuste fino em volta do melhor ponto: 7 x 7 candidatos, de 1 em 1 px
  vec2 base = bo;
  for (int n = 0; n < uFineN; n++) {
    vec2 o = base + vec2(float(n - (n / 7) * 7 - 3), float(n / 7 - 3));
    if (o == base) continue;
    float k = cost(c, o) + 0.0002 * length(o);
    if (k < best) { best = k; bo = o; }
  }

  // Só vale se há movimento de verdade e o deslocamento explica bem a imagem (senão é ruído da câmera)
  vec2 o = bo;
  if (c0 < uThr || best > c0 * 0.8) o = vec2(0.0);
  float m = smoothstep(uThr, uThr * 3.0, c0);
  gl_FragColor = vec4(o / uAn, m, 1.0);
}`;

/**
 * 2b) Limpa o movimento: onde há movimento, cada célula adota o vetor "do meio" entre os vizinhos que também se
 * mexem (mediana de vetores). Isso tira os palpites errados isolados (ruído e o "problema da abertura": uma
 * borda reta só mostra o movimento perpendicular a ela) e deixa os blocos andando juntos. Onde não há
 * movimento nada muda, então as bordas continuam nítidas.
 */
const SMOOTH_FRAGMENT = /* glsl */ `
uniform sampler2D uRaw;
uniform vec2 uCells;
varying vec2 vUv;

void main() {
  vec2 px = 1.0 / uCells;
  vec3 v[9];
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 3; i++) {
      v[j * 3 + i] = textureLod(uRaw, vUv + vec2(float(i - 1), float(j - 1)) * px, 0.0).rgb;
    }
  }
  vec3 c = v[4];
  if (c.z < 0.02) {
    gl_FragColor = vec4(0.0, 0.0, c.z, 1.0);
    return;
  }

  float bestSum = 1e9;
  vec2 med = c.xy;
  float mean = 0.0;
  for (int a = 0; a < 9; a++) {
    mean += v[a].z;
    if (v[a].z < 0.02) continue;
    float s = 0.0;
    for (int b = 0; b < 9; b++) {
      if (v[b].z < 0.02) continue;
      s += length(v[a].xy - v[b].xy);
    }
    if (s < bestSum) { bestSum = s; med = v[a].xy; }
  }
  gl_FragColor = vec4(med, c.z * 0.7 + (mean / 9.0) * 0.3, 1.0);
}`;

/**
 * 3) O "datamosh": a imagem do quadro anterior é arrastada pelo movimento (cada pixel busca a cor de onde o
 * movimento diz que ela veio) e só volta aos poucos para a imagem real da câmera. Onde nada se mexe a
 * imagem real volta rápido; onde há movimento o rastro fica mais tempo.
 */
const MOSH_FRAGMENT = /* glsl */ `
uniform sampler2D uPrev;
uniform sampler2D uFlow;
uniform sampler2D uVideo;
uniform vec2 uView;
uniform vec2 uVideoSize;
uniform float uStrength;
uniform float uBlock;
uniform float uHard;
uniform float uRecStatic;
uniform float uRecMove;
uniform vec2 uCells;
varying vec2 vUv;
${SCENE_SAMPLE_GLSL}

void main() {
  vec2 p = (vUv - 0.5) * uView;

  // Movimento "duro": um só vetor para o bloco inteiro (média dos vetores em volta do centro do bloco,
  // contando mais onde há mais movimento). Movimento "suave": o do próprio ponto.
  vec2 cell = vec2(uBlock) / uView;
  vec2 q = (floor(vUv / cell) + 0.5) * cell;
  vec2 stp = max(cell * 0.5, 1.0 / uCells);
  vec2 sum = vec2(0.0);
  float wsum = 0.0;
  float msum = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec4 f = texture2D(uFlow, q + vec2(float(i), float(j)) * stp);
      sum += f.xy * f.z;
      wsum += f.z;
      msum += f.z;
    }
  }
  vec4 blockFlow = vec4(wsum > 0.001 ? sum / wsum : vec2(0.0), msum / 9.0, 1.0);
  vec4 fl = mix(texture2D(uFlow, vUv), blockFlow, uHard);

  vec3 dragged = texture2D(uPrev, vUv + fl.xy * uStrength).rgb;
  vec3 live = sampleScene(p).rgb;
  float rec = mix(uRecStatic, uRecMove, fl.z);
  gl_FragColor = vec4(mix(dragged, live, rec), 1.0);
}`;

/**
 * Guarda o estado do filtro de datamosh entre os quadros: duas imagens pequenas da câmera (a de agora e a
 * anterior), a grade de movimento e a imagem "derretida" (que é refeita a cada quadro novo da câmera).
 * Só trabalha quando chega um quadro novo da câmera.
 */
export class MotionBuffer {
  /** Largura da imagem em que o movimento é medido */
  private static readonly AN_W = 480;
  /** Tamanho (px de análise) de cada célula da grade de movimento */
  private static readonly CELL = 4;
  /** Largura máxima da imagem derretida */
  private static readonly MOSH_MAX_W = 1600;

  private an: THREE.WebGLRenderTarget[] = [];
  /** Movimento medido (bruto) e movimento já limpo */
  private flowRaw: THREE.WebGLRenderTarget | null = null;
  private flow: THREE.WebGLRenderTarget | null = null;
  private mosh: THREE.WebGLRenderTarget[] = [];
  private anCur = 0;
  private moshCur = 0;

  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private geometry = new THREE.PlaneGeometry(2, 2);
  private quad: THREE.Mesh;
  private capture: THREE.ShaderMaterial;
  private flowMat: THREE.ShaderMaterial;
  private smoothMat: THREE.ShaderMaterial;
  private moshMat: THREE.ShaderMaterial;

  private sizeKey = '';
  private anSize = new THREE.Vector2(1, 1);
  private cells = new THREE.Vector2(1, 1);
  private primed = false;
  private lastVideoTime = -1;
  private lastTime = 0;
  private lastKeySlot = -1;

  constructor(
    private renderer: THREE.WebGLRenderer,
    videoTexture: THREE.VideoTexture,
    private video: HTMLVideoElement,
  ) {
    const common = () => ({
      uVideo: { value: videoTexture },
      uView: { value: new THREE.Vector2(1, 1) },
      uVideoSize: { value: new THREE.Vector2(1, 1) },
    });
    const make = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader, depthTest: false, depthWrite: false });

    this.capture = make(CAPTURE_FRAGMENT, { ...common(), uTexel: { value: 1 } });
    this.flowMat = make(FLOW_FRAGMENT, {
      uCur: { value: null },
      uPrev: { value: null },
      uAn: { value: this.anSize },
      uThr: { value: 0.03 },
      uCoarseN: { value: 169 },
      uFineN: { value: 49 },
    });
    this.smoothMat = make(SMOOTH_FRAGMENT, { uRaw: { value: null }, uCells: { value: this.cells } });
    this.moshMat = make(MOSH_FRAGMENT, {
      ...common(),
      uPrev: { value: null },
      uFlow: { value: null },
      uStrength: { value: 1 },
      uBlock: { value: 32 },
      uHard: { value: 1 },
      uRecStatic: { value: 1 },
      uRecMove: { value: 1 },
      uCells: { value: this.cells },
    });

    this.quad = new THREE.Mesh(this.geometry, this.capture);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** Imagem "derretida" mais recente (na escala da tela, y para cima) */
  get moshTexture(): THREE.Texture | null {
    return this.primed ? this.mosh[this.moshCur].texture : null;
  }

  /** Grade de movimento mais recente: rg = deslocamento, b = quantidade de movimento */
  get flowTexture(): THREE.Texture | null {
    return this.primed && this.flow ? this.flow.texture : null;
  }

  /** O filtro deixou de ser usado: da próxima vez começa de novo, com a imagem real da câmera. */
  idle(): void {
    this.primed = false;
    this.lastVideoTime = -1;
    this.lastKeySlot = -1;
  }

  update(time: number, view: { width: number; height: number }, params: MotionParams): void {
    const video = this.video;
    if (video.readyState < 2 || !video.videoWidth || view.width < 2 || view.height < 2) return;
    this.ensureSize(view.width, view.height);

    // Só trabalha com quadro novo da câmera (ela costuma ter menos quadros por segundo que a tela)
    if (this.primed && video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;
    const dt = this.primed ? Math.min(Math.max(time - this.lastTime, 1 / 120), 0.25) : 0;
    this.lastTime = time;

    // Quadro-chave: de tempos em tempos a imagem real volta de uma vez
    let flash = !this.primed;
    if (params.keyframe > 0) {
      const slot = Math.floor(time / params.keyframe);
      if (this.lastKeySlot >= 0 && slot !== this.lastKeySlot) flash = true;
      this.lastKeySlot = slot;
    } else {
      this.lastKeySlot = -1;
    }

    const tau = Math.max(params.recover, 0.05);
    const recStatic = flash ? 1 : 1 - Math.exp(-dt / tau);
    const recMove = flash ? 1 : 1 - Math.exp(-dt / (tau * (1 + 7 * params.hold)));

    const r = this.renderer;
    const previousTarget = r.getRenderTarget();
    const previousAutoClear = r.autoClear;
    r.autoClear = false;

    const videoSize = new THREE.Vector2(video.videoWidth, video.videoHeight);
    const viewSize = new THREE.Vector2(view.width, view.height);

    // 1) imagem de análise de agora (a que era "de agora" vira "anterior")
    this.anCur ^= 1;
    this.capture.uniforms.uView.value = viewSize;
    this.capture.uniforms.uVideoSize.value = videoSize;
    this.capture.uniforms.uTexel.value = view.width / MotionBuffer.AN_W;
    this.draw(this.capture, this.an[this.anCur]);
    if (!this.primed) this.draw(this.capture, this.an[this.anCur ^ 1]);

    // 2) movimento entre o quadro anterior e o de agora
    this.flowMat.uniforms.uCur.value = this.an[this.anCur].texture;
    this.flowMat.uniforms.uPrev.value = this.an[this.anCur ^ 1].texture;
    this.flowMat.uniforms.uThr.value = Math.max(params.threshold, 0.001);
    this.draw(this.flowMat, this.flowRaw as THREE.WebGLRenderTarget);
    this.smoothMat.uniforms.uRaw.value = (this.flowRaw as THREE.WebGLRenderTarget).texture;
    this.draw(this.smoothMat, this.flow as THREE.WebGLRenderTarget);

    // 3) arrasta a imagem derretida pelo movimento
    const u = this.moshMat.uniforms;
    u.uPrev.value = this.mosh[this.moshCur].texture;
    u.uFlow.value = (this.flow as THREE.WebGLRenderTarget).texture;
    u.uView.value = viewSize;
    u.uVideoSize.value = videoSize;
    u.uStrength.value = params.strength;
    u.uBlock.value = Math.max(params.block, 2);
    u.uHard.value = params.hard;
    u.uRecStatic.value = recStatic;
    u.uRecMove.value = recMove;
    this.draw(this.moshMat, this.mosh[this.moshCur ^ 1]);
    this.moshCur ^= 1;

    r.setRenderTarget(previousTarget);
    r.autoClear = previousAutoClear;
    this.primed = true;
  }

  dispose(): void {
    this.freeTargets();
    this.geometry.dispose();
    this.capture.dispose();
    this.flowMat.dispose();
    this.smoothMat.dispose();
    this.moshMat.dispose();
  }

  private draw(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  /** (Re)cria as imagens quando o tamanho da tela muda. */
  private ensureSize(viewW: number, viewH: number): void {
    const key = `${Math.round(viewW)}x${Math.round(viewH)}`;
    if (key === this.sizeKey) return;
    this.sizeKey = key;
    this.freeTargets();
    this.primed = false;

    const { AN_W, CELL, MOSH_MAX_W } = MotionBuffer;
    const anH = Math.max(CELL * 8, Math.round((AN_W * viewH) / viewW / CELL) * CELL);
    const moshW = Math.min(Math.round(viewW), MOSH_MAX_W);
    const moshH = Math.max(2, Math.round((moshW * viewH) / viewW));
    this.anSize.set(AN_W, anH);

    const target = (w: number, h: number, type: THREE.TextureDataType) =>
      new THREE.WebGLRenderTarget(w, h, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        type,
        depthBuffer: false,
        generateMipmaps: false,
      });
    this.an = [target(AN_W, anH, THREE.UnsignedByteType), target(AN_W, anH, THREE.UnsignedByteType)];
    this.flowRaw = target(AN_W / CELL, anH / CELL, THREE.HalfFloatType);
    this.flow = target(AN_W / CELL, anH / CELL, THREE.HalfFloatType);
    this.cells.set(AN_W / CELL, anH / CELL);
    this.mosh = [target(moshW, moshH, THREE.HalfFloatType), target(moshW, moshH, THREE.HalfFloatType)];
    this.anCur = 0;
    this.moshCur = 0;
  }

  private freeTargets(): void {
    for (const t of [...this.an, ...this.mosh, this.flowRaw, this.flow]) t?.dispose();
    this.an = [];
    this.mosh = [];
    this.flowRaw = null;
    this.flow = null;
  }
}
