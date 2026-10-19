import { uid } from '../features/uid';

// ---------- Definições dos controles ----------

export type DeckId = 'A' | 'B';
export const DECKS: readonly DeckId[] = ['A', 'B'];

export type DeckParam = 'volume' | 'speed' | 'low' | 'mid' | 'high' | 'filter' | 'echo' | 'reverb';

export interface ParamDef {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
}

export const DECK_PARAMS: Record<DeckParam, ParamDef> = {
  volume: { label: 'Volume', min: 0, max: 1, step: 0.01, value: 1 },
  speed: { label: 'Velocidade', min: 0.5, max: 1.5, step: 0.01, value: 1, unit: '×' },
  low: { label: 'Graves', min: -30, max: 12, step: 0.5, value: 0, unit: ' dB' },
  mid: { label: 'Médios', min: -30, max: 12, step: 0.5, value: 0, unit: ' dB' },
  high: { label: 'Agudos', min: -30, max: 12, step: 0.5, value: 0, unit: ' dB' },
  filter: { label: 'Filtro (grave ◄ ► agudo)', min: -1, max: 1, step: 0.01, value: 0 },
  echo: { label: 'Eco', min: 0, max: 1, step: 0.01, value: 0 },
  reverb: { label: 'Reverb', min: 0, max: 1, step: 0.01, value: 0 },
};

/** Um controle contínuo (slider) que pode ser movido pela tela ou por gestos. */
export interface ControlDef extends ParamDef {
  id: string;
}

export const controlId = (deck: DeckId, param: DeckParam): string => `${deck}.${param}`;

export const CONTROLS: ControlDef[] = [
  ...DECKS.flatMap((deck) =>
    (Object.keys(DECK_PARAMS) as DeckParam[]).map((param) => ({
      ...DECK_PARAMS[param],
      id: controlId(deck, param),
      label: `Deck ${deck} · ${DECK_PARAMS[param].label}`,
    })),
  ),
  { id: 'crossfader', label: 'Crossfader (A ◄ ► B)', min: -1, max: 1, step: 0.01, value: 0 },
  { id: 'master', label: 'Volume geral', min: 0, max: 1, step: 0.01, value: 0.8 },
];

export function controlDef(id: string): ControlDef | undefined {
  return CONTROLS.find((c) => c.id === id);
}

/** Uma ação: um clique/gesto de uma vez, ou algo que vale enquanto o gesto durar (hold). */
export interface ActionDef {
  id: string;
  label: string;
  /** Se existir, vale enquanto o gesto durar: scrub = segundos de música por segundo (negativo = rebobinar), bend = ajuste de velocidade */
  hold?: { deck: DeckId; scrub?: number; bend?: number };
  run?: (engine: DjEngine) => void;
}

/** Quanto o "frear/acelerar" muda a velocidade (para sincronizar duas músicas) */
export const BEND_AMOUNT = 0.08;
/** Velocidade do rebobinar / avançar rápido, em segundos de música por segundo */
export const SCRUB_SPEED = 5;

export const ACTIONS: ActionDef[] = [
  ...DECKS.flatMap((d): ActionDef[] => [
    { id: `${d}.toggle`, label: `Deck ${d} · Tocar / pausar`, run: (e) => e.deck(d).toggle() },
    { id: `${d}.play`, label: `Deck ${d} · Tocar`, run: (e) => e.deck(d).play() },
    { id: `${d}.pause`, label: `Deck ${d} · Pausar`, run: (e) => e.deck(d).pause() },
    { id: `${d}.restart`, label: `Deck ${d} · Voltar ao início`, run: (e) => e.deck(d).seek(0) },
    { id: `${d}.back5`, label: `Deck ${d} · Voltar 5 s`, run: (e) => e.deck(d).seekBy(-5) },
    { id: `${d}.fwd5`, label: `Deck ${d} · Avançar 5 s`, run: (e) => e.deck(d).seekBy(5) },
    { id: `${d}.back05`, label: `Deck ${d} · Voltar 0,5 s`, run: (e) => e.deck(d).seekBy(-0.5) },
    { id: `${d}.fwd05`, label: `Deck ${d} · Avançar 0,5 s`, run: (e) => e.deck(d).seekBy(0.5) },
    { id: `${d}.rewind`, label: `Deck ${d} · Rebobinar (enquanto durar)`, hold: { deck: d, scrub: -SCRUB_SPEED } },
    { id: `${d}.ffwd`, label: `Deck ${d} · Avançar rápido (enquanto durar)`, hold: { deck: d, scrub: SCRUB_SPEED } },
    { id: `${d}.slow`, label: `Deck ${d} · Frear (enquanto durar)`, hold: { deck: d, bend: -BEND_AMOUNT } },
    { id: `${d}.fast`, label: `Deck ${d} · Acelerar (enquanto durar)`, hold: { deck: d, bend: BEND_AMOUNT } },
  ]),
  { id: 'cross.A', label: 'Crossfader · todo para o A', run: (e) => e.setControl('crossfader', -1) },
  { id: 'cross.center', label: 'Crossfader · centro', run: (e) => e.setControl('crossfader', 0) },
  { id: 'cross.B', label: 'Crossfader · todo para o B', run: (e) => e.setControl('crossfader', 1) },
];

export function actionDef(id: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.id === id);
}

// ---------- Músicas ----------

export interface TrackItem {
  id: string;
  name: string;
  duration: number;
  buffer: AudioBuffer;
}

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)$/i;

/** Músicas adicionadas pelo usuário. Ficam só na memória desta sessão (já decodificadas). */
export class TrackLibrary {
  readonly items: TrackItem[] = [];
  private listeners = new Set<() => void>();
  /** Chamado ao remover uma música, para os decks que a estão usando */
  onRemoved: (id: string) => void = () => {};

  constructor(private ctx: AudioContext) {}

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get(id: string | null): TrackItem | undefined {
    return id ? this.items.find((t) => t.id === id) : undefined;
  }

  /** Adiciona arquivos de áudio. Devolve quantos foram adicionados. */
  async addFiles(files: Iterable<File>): Promise<number> {
    let added = 0;
    for (const file of files) {
      if (!file.type.startsWith('audio/') && !AUDIO_EXT.test(file.name)) continue;
      try {
        const buffer = await this.ctx.decodeAudioData(await file.arrayBuffer());
        this.items.push({ id: uid(), name: file.name.replace(AUDIO_EXT, ''), duration: buffer.duration, buffer });
        added++;
      } catch (err) {
        console.error(`Não consegui abrir a música "${file.name}".`, err);
      }
    }
    if (added > 0) this.emit();
    return added;
  }

  remove(id: string): void {
    const index = this.items.findIndex((t) => t.id === id);
    if (index < 0) return;
    this.items.splice(index, 1);
    this.onRemoved(id);
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

// ---------- Deck (um toca-discos) ----------

const SMOOTH = 0.015;
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export class Deck {
  track: TrackItem | null = null;
  playing = false;
  readonly values = {} as Record<DeckParam, number>;
  /** Entrada do deck (cada fonte de áudio se liga aqui) */
  private readonly input: GainNode;
  private readonly low: BiquadFilterNode;
  private readonly mid: BiquadFilterNode;
  private readonly high: BiquadFilterNode;
  private readonly filter: BiquadFilterNode;
  private readonly echoWet: GainNode;
  private readonly reverbWet: GainNode;
  private readonly level: GainNode;
  private cross = 1;

  private source: AudioBufferSourceNode | null = null;
  private offset = 0;
  private startedAt = 0;
  private holds = new Map<string, { scrub: number; bend: number }>();
  private scrub = 0;
  private bend = 0;
  private scrubbing = false;
  private resumeAfterScrub = false;

  constructor(
    readonly id: DeckId,
    private ctx: AudioContext,
    out: AudioNode,
    reverbImpulse: AudioBuffer,
  ) {
    for (const key of Object.keys(DECK_PARAMS) as DeckParam[]) this.values[key] = DECK_PARAMS[key].value;

    this.input = ctx.createGain();
    this.low = ctx.createBiquadFilter();
    this.low.type = 'lowshelf';
    this.low.frequency.value = 200;
    this.mid = ctx.createBiquadFilter();
    this.mid.type = 'peaking';
    this.mid.frequency.value = 1000;
    this.mid.Q.value = 0.7;
    this.high = ctx.createBiquadFilter();
    this.high.type = 'highshelf';
    this.high.frequency.value = 3500;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'highpass';
    this.filter.frequency.value = 20;

    // Eco: atraso com realimentação. Reverb: convolução com um ruído que vai sumindo.
    const mix = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.375;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.4;
    this.echoWet = ctx.createGain();
    this.echoWet.gain.value = 0;
    const convolver = ctx.createConvolver();
    convolver.buffer = reverbImpulse;
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = 0;
    this.level = ctx.createGain();

    this.input.connect(this.low);
    this.low.connect(this.mid);
    this.mid.connect(this.high);
    this.high.connect(this.filter);
    this.filter.connect(mix);
    this.filter.connect(this.echoWet);
    this.echoWet.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(mix);
    this.filter.connect(this.reverbWet);
    this.reverbWet.connect(convolver);
    convolver.connect(mix);
    mix.connect(this.level);
    this.level.connect(out);
  }

  // ----- Estado -----

  get rate(): number {
    return this.values.speed * (1 + this.bend);
  }

  /** Posição atual na música, em segundos */
  get position(): number {
    if (!this.track) return 0;
    if (!this.playing) return this.offset;
    return Math.min(this.offset + (this.ctx.currentTime - this.startedAt) * this.rate, this.track.duration);
  }

  get isScrubbing(): boolean {
    return this.scrubbing;
  }

  // ----- Controles -----

  load(track: TrackItem | null): void {
    this.stopSource();
    this.playing = false;
    this.scrubbing = false;
    this.resumeAfterScrub = false;
    this.offset = 0;
    this.track = track;
  }

  play(): void {
    if (!this.track) return;
    if (this.scrubbing) {
      this.resumeAfterScrub = true;
      return;
    }
    if (this.playing) return;
    if (this.offset >= this.track.duration - 0.01) this.offset = 0;
    this.startSource();
  }

  pause(): void {
    if (this.scrubbing) {
      this.resumeAfterScrub = false;
      return;
    }
    if (!this.playing) return;
    this.offset = this.position;
    this.stopSource();
    this.playing = false;
  }

  toggle(): void {
    if (this.scrubbing) this.resumeAfterScrub = !this.resumeAfterScrub;
    else if (this.playing) this.pause();
    else this.play();
  }

  seek(time: number): void {
    if (!this.track) return;
    const t = clamp(time, 0, this.track.duration);
    if (this.playing) {
      this.stopSource();
      this.offset = t;
      this.startSource();
    } else {
      this.offset = t;
    }
  }

  seekBy(delta: number): void {
    this.seek(this.position + delta);
  }

  /** Define um "segurar" vindo de uma fonte (tela ou gesto). scrub: rebobinar/avançar; bend: frear/acelerar. */
  setHold(source: string, scrub: number, bend: number): void {
    if (scrub === 0 && bend === 0) this.holds.delete(source);
    else this.holds.set(source, { scrub, bend });
    let s = 0;
    let b = 0;
    for (const hold of this.holds.values()) {
      s += hold.scrub;
      b += hold.bend;
    }
    s = clamp(s, -SCRUB_SPEED, SCRUB_SPEED);
    b = clamp(b, -BEND_AMOUNT, BEND_AMOUNT);

    if (b !== this.bend) {
      this.rebase();
      this.bend = b;
      this.applyRate();
    }
    if (s !== this.scrub) {
      this.scrub = s;
      if (s !== 0 && !this.scrubbing && this.track) {
        // Começa a rebobinar/avançar: o som para e a posição anda sozinha
        this.resumeAfterScrub = this.playing || this.resumeAfterScrub;
        if (this.playing) {
          this.offset = this.position;
          this.stopSource();
          this.playing = false;
        }
        this.scrubbing = true;
      } else if (s === 0 && this.scrubbing) {
        this.scrubbing = false;
        if (this.resumeAfterScrub) {
          this.resumeAfterScrub = false;
          this.play();
        }
      }
    }
  }

  set(param: DeckParam, value: number): void {
    const def = DECK_PARAMS[param];
    const v = clamp(value, def.min, def.max);
    // A posição precisa ser guardada com a velocidade antiga, antes de trocar
    if (param === 'speed') this.rebase();
    this.values[param] = v;
    const now = this.ctx.currentTime;
    switch (param) {
      case 'volume':
        this.updateLevel();
        break;
      case 'speed':
        this.applyRate();
        break;
      case 'low':
        this.low.gain.setTargetAtTime(v, now, SMOOTH);
        break;
      case 'mid':
        this.mid.gain.setTargetAtTime(v, now, SMOOTH);
        break;
      case 'high':
        this.high.gain.setTargetAtTime(v, now, SMOOTH);
        break;
      case 'filter': {
        // Negativo: corta os agudos (passa-baixas). Positivo: corta os graves (passa-altas).
        const freq = v < 0 ? 20000 * Math.pow(250 / 20000, -v) : 20 * Math.pow(250, v);
        const type = v < 0 ? 'lowpass' : 'highpass';
        if (this.filter.type !== type) this.filter.type = type;
        this.filter.frequency.setTargetAtTime(freq, now, SMOOTH);
        break;
      }
      case 'echo':
        this.echoWet.gain.setTargetAtTime(v, now, SMOOTH);
        break;
      case 'reverb':
        this.reverbWet.gain.setTargetAtTime(v * 0.8, now, SMOOTH);
        break;
    }
  }

  setCross(gain: number): void {
    this.cross = gain;
    this.updateLevel();
  }

  /** Chamado a cada quadro */
  update(dt: number): void {
    if (this.scrubbing && this.track) {
      this.offset = clamp(this.offset + this.scrub * dt, 0, this.track.duration);
    }
    if (this.playing && this.track && this.position >= this.track.duration) {
      this.stopSource();
      this.playing = false;
      this.offset = 0;
    }
  }

  // ----- Internos -----

  private updateLevel(): void {
    this.level.gain.setTargetAtTime(this.values.volume * this.cross, this.ctx.currentTime, SMOOTH);
  }

  private startSource(): void {
    if (!this.track) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.track.buffer;
    source.playbackRate.value = this.rate;
    source.connect(this.input);
    source.start(0, this.offset);
    this.source = source;
    this.startedAt = this.ctx.currentTime;
    this.playing = true;
  }

  private stopSource(): void {
    const source = this.source;
    this.source = null;
    if (!source) return;
    try {
      source.stop();
    } catch {
      // já parou
    }
    source.disconnect();
  }

  /** Guarda a posição atual antes de mudar a velocidade (para a conta da posição continuar certa) */
  private rebase(): void {
    if (!this.playing) return;
    this.offset = this.position;
    this.startedAt = this.ctx.currentTime;
  }

  private applyRate(): void {
    this.source?.playbackRate.setValueAtTime(this.rate, this.ctx.currentTime);
  }
}

// ---------- Mesa de som ----------

function makeImpulse(ctx: AudioContext, seconds = 2.2, decay = 3): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return buffer;
}

/** Dois decks + crossfader + volume geral. Os controles da tela e os gestos usam esta classe. */
export class DjEngine {
  readonly ctx: AudioContext;
  readonly tracks: TrackLibrary;
  private decks: Record<DeckId, Deck>;
  private master: GainNode;
  crossfader = 0;
  masterVolume = 0.8;

  constructor() {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error('Este navegador não tem Web Audio.');
    this.ctx = new Ctor();
    this.tracks = new TrackLibrary(this.ctx);

    // Um compressor no final evita estourar o som quando os dois decks estão no máximo
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.connect(this.ctx.destination);
    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterVolume;
    this.master.connect(compressor);

    const impulse = makeImpulse(this.ctx);
    this.decks = {
      A: new Deck('A', this.ctx, this.master, impulse),
      B: new Deck('B', this.ctx, this.master, impulse),
    };
    this.applyCrossfader();
    this.tracks.onRemoved = (id) => {
      for (const d of DECKS) if (this.decks[d].track?.id === id) this.decks[d].load(null);
    };

    // O navegador só libera o som depois de um clique/tecla do usuário
    const resume = (): void => {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    window.addEventListener('drop', resume);
  }

  deck(id: DeckId): Deck {
    return this.decks[id];
  }

  get audioRunning(): boolean {
    return this.ctx.state === 'running';
  }

  getControl(id: string): number {
    if (id === 'crossfader') return this.crossfader;
    if (id === 'master') return this.masterVolume;
    const [deck, param] = id.split('.') as [DeckId, DeckParam];
    return this.decks[deck]?.values[param] ?? 0;
  }

  setControl(id: string, value: number): void {
    const def = controlDef(id);
    if (!def) return;
    const v = clamp(value, def.min, def.max);
    if (id === 'crossfader') {
      this.crossfader = v;
      this.applyCrossfader();
    } else if (id === 'master') {
      this.masterVolume = v;
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, SMOOTH);
    } else {
      const [deck, param] = id.split('.') as [DeckId, DeckParam];
      this.decks[deck]?.set(param, v);
    }
  }

  /** Chamado a cada quadro */
  tick(dt: number): void {
    for (const d of DECKS) this.decks[d].update(dt);
  }

  /** Crossfader: no centro os dois decks estão inteiros; indo para um lado, o outro vai sumindo. */
  private applyCrossfader(): void {
    const x = (this.crossfader + 1) / 2;
    const a = Math.min(1, Math.SQRT2 * Math.cos((x * Math.PI) / 2));
    const b = Math.min(1, Math.SQRT2 * Math.sin((x * Math.PI) / 2));
    this.decks.A.setCross(a);
    this.decks.B.setCross(b);
  }
}
