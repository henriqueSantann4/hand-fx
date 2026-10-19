import type { FilterDef } from './types';

export type { FilterDef, FilterParam } from './types';

/**
 * Descobre automaticamente todo arquivo "*.filter.ts" desta pasta.
 * Cada arquivo deve exportar (default) um FilterDef. Ele aparece sozinho na tela de configuração.
 */
const modules = import.meta.glob<{ default: FilterDef }>('./*.filter.ts', { eager: true });

export function loadFilters(): FilterDef[] {
  return Object.values(modules)
    .map((m) => m.default)
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}
