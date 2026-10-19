import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { computeFingers } from './gestures';
import { settings } from './settings';
import type { HandData, Side } from './types';
import { mapToScene } from './viewport';

const absolute = (path: string): string => new URL(path, document.baseURI).href;

/** Confere se o arquivo existe de verdade (o servidor de dev devolve HTML quando falta arquivo) */
async function exists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok && !(res.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
}

export class HandTracker {
  private landmarker!: HandLandmarker;
  private lastVideoTime = -1;
  private hands: HandData[] = [];
  private tmp = new THREE.Vector3();

  async init(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(absolute(CONFIG.wasmPath));

    // Usa o modelo local se existir; senão baixa do servidor do Google
    const local = absolute(CONFIG.modelLocal);
    const modelAssetPath = (await exists(local)) ? local : CONFIG.modelRemote;

    const create = (delegate: 'GPU' | 'CPU') =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        numHands: CONFIG.numHands,
        minHandDetectionConfidence: CONFIG.tracking.minDetection,
        minHandPresenceConfidence: CONFIG.tracking.minPresence,
        minTrackingConfidence: CONFIG.tracking.minTracking,
      });

    try {
      this.landmarker = await create('GPU');
    } catch (err) {
      console.warn('GPU indisponível para o MediaPipe, usando CPU.', err);
      this.landmarker = await create('CPU');
    }
  }

  /** Roda a detecção quando há um quadro novo de vídeo; senão devolve o resultado anterior. */
  update(video: HTMLVideoElement, view: { width: number; height: number }, nowMs: number): HandData[] {
    if (video.readyState < 2 || video.currentTime === this.lastVideoTime) return this.hands;
    this.lastVideoTime = video.currentTime;

    const result = this.landmarker.detectForVideo(video, nowMs);
    const alpha = 1 - settings.smoothing;
    const previous = this.hands;
    const next: HandData[] = [];

    result.landmarks.forEach((landmarks, index) => {
      const category = result.handedness[index]?.[0];
      // O rótulo do MediaPipe já corresponde à mão real de quem usa (verificado na prática).
      const side: Side = category?.categoryName === 'Left' ? 'left' : 'right';

      const prev = previous.length === result.landmarks.length ? previous[index] : undefined;
      const points = landmarks.map((lm, i) => {
        const p = mapToScene(lm.x, lm.y, lm.z, video.videoWidth, video.videoHeight, view.width, view.height, new THREE.Vector3());
        const old = prev?.points[i];
        return old ? old.lerp(p, alpha) : p;
      });

      next.push(this.buildHand(index, side, category?.score ?? 0, points));
    });

    this.hands = next;
    return this.hands;
  }

  private buildHand(index: number, side: Side, score: number, points: THREE.Vector3[]): HandData {
    const wrist = points[0];
    const middleBase = points[9];
    const handSize = Math.max(wrist.distanceTo(middleBase), 1e-3);

    // Centro da palma: média do pulso e das bases dos dedos
    const palm = new THREE.Vector3();
    for (const i of [0, 5, 9, 13, 17]) palm.add(points[i]);
    palm.divideScalar(5);

    // Pinça: distância entre as pontas do polegar e do indicador, relativa ao tamanho da mão
    const pinchDist = points[4].distanceTo(points[8]) / handSize;
    const pinch = THREE.MathUtils.clamp(1 - pinchDist / 1.0, 0, 1);

    // Abertura: distância média das pontas dos dedos até o pulso, relativa ao tamanho da mão
    let sum = 0;
    for (const i of [8, 12, 16, 20]) sum += this.tmp.copy(points[i]).distanceTo(wrist);
    const openness = THREE.MathUtils.clamp((sum / 4 / handSize - 1.0) / 1.0, 0, 1);

    const fingers = computeFingers(points);

    return { index, side, score, points, palm, handSize, pinch, openness, fingers, gesture: null };
  }
}
