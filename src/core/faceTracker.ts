import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { absolute, exists } from './handTracker';
import { mapToScene } from './viewport';

/** Pontos do contorno do rosto (índices do Face Landmarker), em ordem ao redor do rosto */
const OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

/** Segundos que o último rosto visto continua valendo depois de a detecção falhar */
const HOLD = 0.6;

/**
 * Acha o rosto na câmera (MediaPipe Face Landmarker) e guarda o contorno dele em coordenadas da cena,
 * já suavizado. Os filtros com `face: true` usam isso para destacar o rosto.
 */
export class FaceTracker {
  static readonly COUNT = OVAL.length;

  /** Contorno do rosto na cena (pixels, origem no centro, y para cima) */
  readonly outline: THREE.Vector2[] = OVAL.map(() => new THREE.Vector2());
  /** 0 = sem rosto, 1 = rosto presente (sobe rápido, desce devagar) */
  presence = 0;
  /** O modelo já carregou? */
  ready = false;

  private landmarker: FaceLandmarker | null = null;
  private lastVideoTime = -1;
  private lastTs = 0;
  private lastSeen = -Infinity;
  private has = false;
  private tmp = new THREE.Vector3();

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(absolute(CONFIG.wasmPath));

    // Usa o modelo local se existir; senão baixa do servidor do Google
    const local = absolute(CONFIG.faceModelLocal);
    const modelAssetPath = (await exists(local)) ? local : CONFIG.faceModelRemote;

    const create = (delegate: 'GPU' | 'CPU') =>
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: CONFIG.tracking.minDetection,
        minFacePresenceConfidence: CONFIG.tracking.minPresence,
        minTrackingConfidence: CONFIG.tracking.minTracking,
      });

    try {
      this.landmarker = await create('GPU');
    } catch (err) {
      console.warn('GPU indisponível para o rosto, usando CPU.', err);
      this.landmarker = await create('CPU');
    }
    this.ready = true;
  }

  /** Roda a detecção quando há um quadro novo de vídeo e atualiza a presença do rosto. */
  update(video: HTMLVideoElement, view: { width: number; height: number }, nowMs: number, dt: number): void {
    if (this.landmarker && video.readyState >= 2 && video.videoWidth && video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      // O MediaPipe exige tempos sempre crescentes
      const ts = Math.max(nowMs, this.lastTs + 1);
      this.lastTs = ts;

      const landmarks = this.landmarker.detectForVideo(video, ts).faceLandmarks[0];
      if (landmarks) {
        // Se o rosto acabou de aparecer, vai direto; senão suaviza para o contorno não tremer
        const alpha = this.has && this.presence > 0.3 ? 0.55 : 1;
        OVAL.forEach((index, k) => {
          const lm = landmarks[index];
          mapToScene(lm.x, lm.y, 0, video.videoWidth, video.videoHeight, view.width, view.height, this.tmp);
          const o = this.outline[k];
          o.x += (this.tmp.x - o.x) * alpha;
          o.y += (this.tmp.y - o.y) * alpha;
        });
        this.has = true;
        this.lastSeen = nowMs;
      }
    }

    const target = this.has && nowMs - this.lastSeen < HOLD * 1000 ? 1 : 0;
    const rate = target > this.presence ? 8 : 1.6;
    const diff = target - this.presence;
    this.presence += Math.sign(diff) * Math.min(Math.abs(diff), rate * Math.max(dt, 0));
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }

  /** Nenhum filtro está usando o rosto agora: esquece o que viu. */
  idle(): void {
    this.presence = 0;
    this.has = false;
    this.lastVideoTime = -1;
  }

  /**
   * Copia o contorno para `out`, aumentado (ou diminuído) por `scale` em volta do centro do rosto.
   * Devolve o raio médio do contorno resultante (pixels).
   */
  fill(out: THREE.Vector2[], scale: number): number {
    let cx = 0;
    let cy = 0;
    for (const p of this.outline) {
      cx += p.x;
      cy += p.y;
    }
    cx /= this.outline.length;
    cy /= this.outline.length;

    let radius = 0;
    this.outline.forEach((p, k) => {
      const x = cx + (p.x - cx) * scale;
      const y = cy + (p.y - cy) * scale;
      out[k].set(x, y);
      radius += Math.hypot(x - cx, y - cy);
    });
    return Math.max(radius / this.outline.length, 1);
  }
}
