// ---------- Helpers para montar HTML ----------

export type Child = Node | string;
type Props<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], 'className'>> & {
  class?: string;
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props<K> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) el.className = cls;
  Object.assign(el, rest);
  el.append(...children);
  return el;
}

export function row(label: string, control: HTMLElement): HTMLElement {
  return h('div', { class: 'cfg-row' }, h('span', { textContent: label }), control);
}

export function select<T extends string>(
  options: ReadonlyArray<readonly [T, string]>,
  value: string,
  onChange: (value: string) => void,
  placeholder?: string,
): HTMLSelectElement {
  const el = h('select');
  if (placeholder !== undefined) el.append(h('option', { value: '', textContent: placeholder }));
  for (const [v, label] of options) el.append(h('option', { value: v, textContent: label }));
  el.value = value;
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

export function slider(min: number, max: number, step: number, value: number, onInput: (value: number) => void, unit = ''): HTMLElement {
  const decimals = (String(step).split('.')[1] ?? '').length;
  const output = h('output', { textContent: value.toFixed(decimals) + unit });
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    output.textContent = v.toFixed(decimals) + unit;
    onInput(v);
  });
  return h('div', { class: 'cfg-slider' }, input, output);
}

export function checkbox(value: boolean, onChange: (value: boolean) => void): HTMLInputElement {
  const el = h('input', { type: 'checkbox', checked: value });
  el.addEventListener('change', () => onChange(el.checked));
  return el;
}

export function section(title: string, open: boolean): { root: HTMLDetailsElement; body: HTMLElement } {
  const body = h('div');
  const root = h('details', { open }, h('summary', { textContent: title }), body);
  return { root, body };
}
