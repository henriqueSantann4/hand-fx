import * as THREE from 'three';

/**
 * Guarda os últimos quadros do vídeo numa só textura (um "atlas" de miniaturas), para filtros que
 * precisam olhar o passado, como o slit-scan. Cada quadro novo é desenhado na próxima miniatura (anel).
 */
export class HistoryBuffer {
  static readonly COLS = 6;
  static readonly ROWS = 4;
  /** Quantos quadros ficam guardados */
  static readonly COUNT = HistoryBuffer.COLS * HistoryBuffer.ROWS;
  private static readonly TILE_W = 384;
  private static readonly TILE_H = 216;

  readonly target: THREE.WebGLRenderTarget;
  /** Índice da miniatura do quadro mais recente */
  head = 0;

  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private geometry = new THREE.PlaneGeometry(2, 2);
  private lastVideoTime = -1;
  private primed = false;

  constructor(
    private renderer: THREE.WebGLRenderer,
    videoTexture: THREE.VideoTexture,
    private video: HTMLVideoElement,
  ) {
    const { COLS, ROWS, TILE_W, TILE_H } = HistoryBuffer;
    this.target = new THREE.WebGLRenderTarget(COLS * TILE_W, ROWS * TILE_H, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      generateMipmaps: false,
    });
    this.target.scissorTest = false;

    // Cópia crua do vídeo (sem conversão de cor), igual ao que os filtros leem direto do vídeo
    this.material = new THREE.ShaderMaterial({
      uniforms: { uVideo: { value: videoTexture } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D uVideo; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(uVideo, vUv).rgb, 1.0); }',
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(this.geometry, this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  /** Guarda o quadro atual do vídeo, se for um quadro novo. */
  record(): void {
    if (this.video.readyState < 2 || !this.video.videoWidth) return;
    // A câmera pode ter menos quadros por segundo que a tela: só guarda quadros novos
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.target);

    if (!this.primed) {
      // Primeira vez: enche todas as miniaturas com o quadro atual, para o passado não começar preto
      for (let i = 0; i < HistoryBuffer.COUNT; i++) this.drawTile(i);
      this.primed = true;
    } else {
      this.head = (this.head + 1) % HistoryBuffer.COUNT;
      this.drawTile(this.head);
    }

    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = previousAutoClear;
  }

  private drawTile(index: number): void {
    const { COLS, TILE_W, TILE_H } = HistoryBuffer;
    this.target.viewport.set((index % COLS) * TILE_W, Math.floor(index / COLS) * TILE_H, TILE_W, TILE_H);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.geometry.dispose();
  }
}
