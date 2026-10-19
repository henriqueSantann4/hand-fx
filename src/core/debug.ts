import { HandLandmarker } from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { settings } from './settings';
import type { HandData, Side } from './types';

const COLORS: Record<Side, number> = { left: 0x4cc9f0, right: 0xf72585 };

/** Desenha os 21 pontos e as ligações de uma mão. */
class HandDebug {
  readonly group = new THREE.Group();
  private position = new THREE.BufferAttribute(new Float32Array(21 * 3), 3);
  private pointsMat = new THREE.PointsMaterial({ size: 8, sizeAttenuation: false, depthTest: false, transparent: true });
  private linesMat = new THREE.LineBasicMaterial({ depthTest: false, transparent: true });
  private geometry = new THREE.BufferGeometry();

  constructor() {
    this.geometry.setAttribute('position', this.position);
    const indices: number[] = [];
    for (const c of HandLandmarker.HAND_CONNECTIONS) indices.push(c.start, c.end);
    this.geometry.setIndex(indices);

    const points = new THREE.Points(this.geometry, this.pointsMat);
    const lines = new THREE.LineSegments(this.geometry, this.linesMat);
    points.frustumCulled = lines.frustumCulled = false;
    points.renderOrder = lines.renderOrder = 999;
    this.group.add(lines, points);
  }

  set(hand: HandData): void {
    const color = COLORS[hand.side];
    this.pointsMat.color.setHex(color);
    this.linesMat.color.setHex(color);
    hand.points.forEach((p, i) => this.position.setXYZ(i, p.x, p.y, p.z));
    this.position.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.pointsMat.dispose();
    this.linesMat.dispose();
  }
}

/** Camada de diagnóstico: esqueleto das mãos na tela e texto com FPS e valores medidos. */
export class DebugOverlay {
  readonly group = new THREE.Group();
  private hands: HandDebug[] = [];
  private frames = 0;
  private lastTick = performance.now();
  private fps = 0;

  constructor(private hud: HTMLElement) {
    for (let i = 0; i < CONFIG.numHands; i++) {
      const h = new HandDebug();
      h.group.visible = false;
      this.hands.push(h);
      this.group.add(h.group);
    }
  }

  /** hiddenSides: mãos cujo esqueleto deve sumir agora (por exemplo, porque há uma imagem presa nelas). */
  update(hands: HandData[], hiddenSides: ReadonlySet<Side> = new Set()): void {
    this.frames++;
    const now = performance.now();
    if (now - this.lastTick >= 500) {
      this.fps = (this.frames * 1000) / (now - this.lastTick);
      this.frames = 0;
      this.lastTick = now;
      this.writeHud(hands);
    }

    this.hud.style.display = settings.showDebug ? 'block' : 'none';
    this.hands.forEach((h, i) => {
      const hand = hands[i];
      h.group.visible = !!hand && settings.showSkeleton && !hiddenSides.has(hand.side);
      if (hand) h.set(hand);
    });
  }

  private writeHud(hands: HandData[]): void {
    const lines = [`FPS: ${this.fps.toFixed(0)}`, `Mãos: ${hands.length}`];
    for (const h of hands) {
      const side = h.side === 'left' ? 'esquerda' : 'direita';
      lines.push(`  ${side}  gesto: ${h.gesture ?? '-'}  pinça ${h.pinch.toFixed(2)}  abertura ${h.openness.toFixed(2)}`);
      const fingers = (['thumb', 'index', 'middle', 'ring', 'pinky'] as const).map((f) => (h.fingers[f] ? '1' : '0')).join(' ');
      lines.push(`    dedos (polegar a mindinho): ${fingers}`);
    }
    this.hud.textContent = lines.join('\n');
  }
}
