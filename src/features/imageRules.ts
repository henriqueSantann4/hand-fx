import * as THREE from 'three';
import { Effect } from '../core/effect';
import { FINGER_TIP } from '../core/gestures';
import type { FrameData, HandData, Side } from '../core/types';
import type { AppState, ImageRule } from './state';

/** Tempo (s) que a imagem continua na tela depois que o gesto some por um instante (evita piscar). */
const GRACE = 0.12;

interface Pose {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

/** Cada regra tem até duas imagens na tela: uma para a mão esquerda e uma para a direita. */
interface Slot {
  side: Side;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  lastSeen: number;
  pose: Pose | null;
}

/** Desenha as imagens das regras (mão + gesto + posição) definidas na tela de configuração. */
export class ImageRulesEffect extends Effect {
  readonly label = 'Imagens por gesto';
  private slots = new Map<string, Slot[]>();
  private geometry = new THREE.PlaneGeometry(1, 1);

  constructor(private state: AppState) {
    super();
  }

  update(frame: FrameData): void {
    const rules = this.state.rules;
    this.state.runtime.imageHands.clear();

    for (const id of [...this.slots.keys()]) {
      if (!rules.some((r) => r.id === id)) this.removeSlots(id);
    }

    for (const rule of rules) {
      const image = this.state.library.get(rule.imageId);
      for (const slot of this.slotsFor(rule.id)) {
        const hand = frame.hands.find((h) => h.side === slot.side);
        const matches =
          rule.enabled &&
          !!image &&
          !!hand &&
          !this.state.runtime.frameActive &&
          (rule.hand === 'any' || rule.hand === slot.side) &&
          hand.gesture === rule.gesture;

        if (matches && hand && image) {
          slot.pose = this.computePose(rule, hand, image.aspect, frame.view);
          slot.lastSeen = frame.time;
          if (slot.material.map !== image.texture) {
            slot.material.map = image.texture;
            slot.material.needsUpdate = true;
          }
        }

        const visible = !!slot.pose && !!image && rule.enabled && frame.time - slot.lastSeen <= GRACE;
        slot.mesh.visible = visible;
        // Imagem presa à própria mão (palma, pulso ou dedo): o esqueleto dessa mão some
        if (visible && rule.anchor.kind !== 'fixed') this.state.runtime.imageHands.add(slot.side);
        if (visible && slot.pose) {
          slot.mesh.position.set(slot.pose.x, slot.pose.y, 0.5);
          slot.mesh.scale.set(slot.pose.width, slot.pose.height, 1);
          slot.mesh.rotation.z = slot.pose.angle;
          slot.material.opacity = rule.opacity;
        }
      }
    }
  }

  dispose(): void {
    for (const id of [...this.slots.keys()]) this.removeSlots(id);
    this.geometry.dispose();
  }

  private computePose(rule: ImageRule, hand: HandData, aspect: number, view: FrameData['view']): Pose {
    const a = rule.anchor;
    let x: number;
    let y: number;
    switch (a.kind) {
      case 'palm':
        x = hand.palm.x;
        y = hand.palm.y;
        break;
      case 'wrist':
        x = hand.points[0].x;
        y = hand.points[0].y;
        break;
      case 'fingertip': {
        const tip = hand.points[FINGER_TIP[a.finger]];
        x = tip.x;
        y = tip.y;
        break;
      }
      case 'fixed':
        x = (a.x - 0.5) * view.width;
        y = (0.5 - a.y) * view.height;
        break;
    }

    // Ângulo da mão: do pulso até a base do dedo médio. Mão em pé = 0.
    let angle = 0;
    if (rule.rotateWithHand) {
      const wrist = hand.points[0];
      const middle = hand.points[9];
      angle = Math.atan2(middle.y - wrist.y, middle.x - wrist.x) - Math.PI / 2;
    }

    // O deslocamento gira junto com a mão, para a imagem ficar no mesmo lugar em relação a ela.
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ox = rule.offsetX * cos - rule.offsetY * sin;
    const oy = rule.offsetX * sin + rule.offsetY * cos;

    const width = rule.scaleWithHand ? rule.sizeHand * hand.handSize : rule.sizePx;
    return { x: x + ox, y: y + oy, width, height: width / aspect, angle };
  }

  private slotsFor(ruleId: string): Slot[] {
    let slots = this.slots.get(ruleId);
    if (!slots) {
      slots = (['left', 'right'] as const).map((side) => {
        const material = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
        const mesh = new THREE.Mesh(this.geometry, material);
        mesh.visible = false;
        mesh.renderOrder = 10;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        return { side, mesh, material, lastSeen: -Infinity, pose: null };
      });
      this.slots.set(ruleId, slots);
    }
    return slots;
  }

  private removeSlots(ruleId: string): void {
    for (const slot of this.slots.get(ruleId) ?? []) {
      this.group.remove(slot.mesh);
      slot.material.dispose();
    }
    this.slots.delete(ruleId);
  }
}
