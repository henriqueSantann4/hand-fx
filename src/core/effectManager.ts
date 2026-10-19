import type { Effect } from './effect';
import type { Stage } from './stage';
import type { FrameData } from './types';

interface Entry {
  effect: Effect;
  enabled: boolean;
  failed: boolean;
  /** Se aparece na lista de efeitos do painel (efeitos internos do app ficam de fora) */
  listed: boolean;
}

/** Guarda os efeitos, liga/desliga e chama o update de cada um a cada quadro. */
export class EffectManager {
  private entries: Entry[] = [];

  constructor(private stage: Stage) {}

  get list(): readonly Entry[] {
    return this.entries;
  }

  register(effect: Effect, options: { listed?: boolean; enabled?: boolean } = {}): void {
    effect.init(this.stage);
    effect.group.visible = false;
    this.stage.scene.add(effect.group);
    this.entries.push({ effect, enabled: false, failed: false, listed: options.listed ?? true });
    if (options.enabled) this.setEnabled(effect, true);
  }

  isEnabled(effect: Effect): boolean {
    return this.entries.find((e) => e.effect === effect)?.enabled ?? false;
  }

  setEnabled(effect: Effect, enabled: boolean): void {
    const entry = this.entries.find((e) => e.effect === effect);
    if (!entry || entry.enabled === enabled) return;
    entry.enabled = enabled;
    entry.failed = false;
    effect.group.visible = enabled;
    this.guard(entry, () => (enabled ? effect.onEnable() : effect.onDisable()));
  }

  update(frame: FrameData): void {
    for (const entry of this.entries) {
      if (entry.enabled && !entry.failed) this.guard(entry, () => entry.effect.update(frame));
    }
  }

  /** Se um efeito der erro, ele é pausado e o resto do app continua funcionando. */
  private guard(entry: Entry, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      entry.failed = true;
      entry.effect.group.visible = false;
      console.error(`[efeito "${entry.effect.label}"] erro, efeito pausado:`, err);
    }
  }
}
