import type { Effect } from '../core/effect';

/**
 * Descobre automaticamente todo arquivo "*.effect.ts" desta pasta.
 * Cada arquivo deve exportar (default) uma classe que estende Effect.
 * Por enquanto a pasta está vazia, então nenhum efeito é carregado.
 */
const modules = import.meta.glob<{ default: new () => Effect }>('./*.effect.ts', { eager: true });

export function loadEffects(): Effect[] {
  return Object.entries(modules).map(([path, mod]) => {
    if (typeof mod.default !== 'function') {
      throw new Error(`${path} precisa exportar uma classe como default.`);
    }
    return new mod.default();
  });
}
