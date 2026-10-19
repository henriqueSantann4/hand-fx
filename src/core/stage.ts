import * as THREE from 'three';

const FOV = 50;

/**
 * Cena 3D transparente por cima do vídeo.
 * A câmera é posicionada de forma que 1 unidade no plano z = 0 equivale a 1 pixel da tela.
 * Origem no centro da tela, y para cima, z em direção a quem olha.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10000);
  width = 1;
  height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height, false);

    this.camera.aspect = this.width / this.height;
    this.camera.position.z = this.height / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    this.camera.far = this.camera.position.z * 10;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
