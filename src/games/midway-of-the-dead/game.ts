import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';
import { WORDS } from './words';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export const LIVES = 3;
export const POINTS_PER_LETTER = 10;
/** Seconds between waves, while the next wave's banner shows. */
export const WAVE_BREAK = 1;
/** Seconds for a ghost's word to fade out and back in. */
export const GHOST_CYCLE = 2;
const HORIZON = 120;
const GROUND = HEIGHT - 70;

export type EnemyKind = 'shambler' | 'runner' | 'brute' | 'ghost';

export interface EnemyType {
  /** The first wave this type appears in. */
  firstWave: number;
  /** How often it's picked, against the other types in the wave. */
  weight: number;
  /** Times the wave's speed. */
  speed: number;
  /** Word length limits. Undefined means the wave's. */
  length?: { minLength: number; maxLength: number };
  /** Lives lost when it reaches the player. */
  lives: number;
  /** Times the usual score for defeating it. */
  points: number;
}

/** The enemy types. Tune them here: the logic and drawing read this table. */
export const ENEMY_TYPES: Record<EnemyKind, EnemyType> = {
  shambler: { firstWave: 1, weight: 3, speed: 1, lives: 1, points: 1 },
  runner: {
    firstWave: 1,
    weight: 2,
    speed: 1.8,
    length: { minLength: 3, maxLength: 5 },
    lives: 1,
    points: 2,
  },
  brute: {
    firstWave: 2,
    weight: 1,
    speed: 0.6,
    length: { minLength: 9, maxLength: Infinity },
    lives: 2,
    points: 2,
  },
  ghost: { firstWave: 3, weight: 2, speed: 1, lives: 1, points: 2 },
};

export interface Zombie {
  id: number;
  kind: EnemyKind;
  word: string;
  /** How many letters of the word are typed. */
  typed: number;
  /** 0 at the far end of the midway, 1 when it reaches the player. */
  distance: number;
  /** Distance covered per second. */
  speed: number;
  /** -1 is the left edge of the midway, 1 the right. */
  lane: number;
}

export interface Wave {
  /** Zombies in the wave. */
  count: number;
  /** Most zombies on screen at once. */
  onScreen: number;
  speed: number;
  minLength: number;
  maxLength: number;
  /** Seconds between zombies appearing. */
  spawnGap: number;
}

export interface MidwayOfTheDeadState {
  zombies: Zombie[];
  /** The zombie the player has locked on to, if any. */
  locked: number | undefined;
  lives: number;
  score: number;
  combo: number;
  /** True while there have been no misses since the last defeat. */
  clean: boolean;
  misses: number;
  defeated: number;
  wave: number;
  spawned: number;
  spawnTimer: number;
  /** Seconds left before the current wave starts. */
  waveBreak: number;
  nextId: number;
  /** The type of the next zombie, kept while it waits for a word that fits. */
  nextKind: EnemyKind | undefined;
  phase: 'playing' | 'over';
}

/** Later waves have longer words, faster zombies and more of them at once. */
export function waveFor(wave: number): Wave {
  return {
    count: 8 + wave * 3,
    onScreen: Math.min(3 + wave, 10),
    speed: Math.min(0.1 + wave * 0.02, 0.4),
    minLength: Math.min(3 + Math.floor((wave - 1) / 2), 6),
    maxLength: Math.min(4 + wave, 13),
    spawnGap: Math.max(1.5 - wave * 0.15, 0.35),
  };
}

export function createState(): MidwayOfTheDeadState {
  return {
    zombies: [],
    locked: undefined,
    lives: LIVES,
    score: 0,
    combo: 1,
    clean: true,
    misses: 0,
    defeated: 0,
    wave: 1,
    spawned: 0,
    spawnTimer: 0,
    waveBreak: WAVE_BREAK,
    nextId: 1,
    nextKind: undefined,
    phase: 'playing',
  };
}

/** The types that can appear in a wave. */
export function kindsFor(wave: number): EnemyKind[] {
  return (Object.keys(ENEMY_TYPES) as EnemyKind[]).filter(
    (kind) => ENEMY_TYPES[kind].firstWave <= wave,
  );
}

/** Picks a type for the next zombie, by the types' weights. */
export function pickKind(wave: number, random: () => number = Math.random): EnemyKind {
  const kinds = kindsFor(wave);
  const total = kinds.reduce((sum, kind) => sum + ENEMY_TYPES[kind].weight, 0);
  let roll = random() * total;
  for (const kind of kinds) {
    roll -= ENEMY_TYPES[kind].weight;
    if (roll < 0) return kind;
  }
  return kinds[kinds.length - 1];
}

/** The word length limits for a type in a wave. */
export function wordLimits(
  kind: EnemyKind,
  wave: number,
): { minLength: number; maxLength: number } {
  return ENEMY_TYPES[kind].length ?? waveFor(wave);
}

/**
 * Picks a word within the length limits whose first letter no zombie on
 * screen has, so a keystroke never has two possible targets. Undefined if
 * none fits.
 */
export function pickWord(
  zombies: readonly Zombie[],
  limits: { minLength: number; maxLength: number },
  random: () => number = Math.random,
  words: readonly string[] = WORDS,
): string | undefined {
  const taken = new Set(zombies.map((z) => z.word[0]));
  const choices = words.filter(
    (w) => !taken.has(w[0]) && w.length >= limits.minLength && w.length <= limits.maxLength,
  );
  if (choices.length === 0) return undefined;
  return choices[Math.floor(random() * choices.length)];
}

/**
 * Adds a zombie at the far end of the midway. Returns it, or undefined if no
 * word fits its type, in which case the same type waits for the next try.
 */
export function spawnZombie(
  state: MidwayOfTheDeadState,
  random: () => number = Math.random,
  words: readonly string[] = WORDS,
): Zombie | undefined {
  const wave = waveFor(state.wave);
  const kind = state.nextKind ?? pickKind(state.wave, random);
  state.nextKind = kind;
  const word = pickWord(state.zombies, wordLimits(kind, state.wave), random, words);
  if (!word) return undefined;
  state.nextKind = undefined;
  const zombie: Zombie = {
    id: state.nextId++,
    kind,
    word,
    typed: 0,
    distance: 0,
    speed: wave.speed * ENEMY_TYPES[kind].speed * (0.85 + random() * 0.3),
    lane: random() * 1.6 - 0.8,
  };
  state.zombies.push(zombie);
  state.spawned += 1;
  return zombie;
}

/** 10 points per letter, times the current combo, times the type's points. */
export function scoreFor(word: string, combo: number, points = 1): number {
  return POINTS_PER_LETTER * word.length * combo * points;
}

/**
 * How visible a ghost's untyped letters are at `time` seconds, from 0 to 1.
 * Fully readable for the first half of each cycle, then a slow fade out and
 * back in.
 */
export function ghostAlpha(time: number): number {
  const phase = (((time / GHOST_CYCLE) % 1) + 1) % 1;
  if (phase < 0.5) return 1;
  const fade = (1 - Math.cos((phase - 0.5) * 2 * Math.PI * 2)) / 2;
  return 1 - 0.92 * fade;
}

/** How visible letter `index` of a zombie's word is. Typed letters always show. */
export function letterAlpha(zombie: Zombie, index: number, time: number): number {
  if (zombie.kind !== 'ghost' || index < zombie.typed) return 1;
  // Each ghost fades on its own beat.
  return ghostAlpha(time + zombie.id * 0.7);
}

function miss(state: MidwayOfTheDeadState) {
  state.misses += 1;
  state.combo = 1;
  state.clean = false;
}

function defeat(state: MidwayOfTheDeadState, zombie: Zombie) {
  state.score += scoreFor(zombie.word, state.combo, ENEMY_TYPES[zombie.kind].points);
  if (state.clean) state.combo += 1;
  state.clean = true;
  state.defeated += 1;
  state.zombies = state.zombies.filter((z) => z !== zombie);
  state.locked = undefined;
}

/**
 * Types one lowercase letter. Locks on to the zombie whose word starts with it,
 * or types the next letter of the locked zombie's word. Anything else is a
 * miss, which keeps the lock. Returns 'hit', 'defeat', 'miss' or 'ignored'.
 */
export function typeLetter(
  state: MidwayOfTheDeadState,
  letter: string,
): 'hit' | 'defeat' | 'miss' | 'ignored' {
  if (state.phase !== 'playing' || !/^[a-z]$/.test(letter)) return 'ignored';

  let target = state.zombies.find((z) => z.id === state.locked);
  if (!target) {
    target = state.zombies.find((z) => z.word[0] === letter);
    if (!target) {
      miss(state);
      return 'miss';
    }
    state.locked = target.id;
  } else if (target.word[target.typed] !== letter) {
    miss(state);
    return 'miss';
  }

  target.typed += 1;
  if (target.typed === target.word.length) {
    defeat(state, target);
    return 'defeat';
  }
  return 'hit';
}

/** Advances the game by `dt` seconds. */
export function step(
  state: MidwayOfTheDeadState,
  dt: number,
  random: () => number = Math.random,
  words: readonly string[] = WORDS,
): void {
  if (state.phase !== 'playing') return;

  for (const zombie of state.zombies) zombie.distance += zombie.speed * dt;
  const arrived = state.zombies.filter((z) => z.distance >= 1);
  if (arrived.length > 0) {
    const cost = arrived.reduce((sum, z) => sum + ENEMY_TYPES[z.kind].lives, 0);
    state.lives = Math.max(state.lives - cost, 0);
    if (arrived.some((z) => z.id === state.locked)) state.locked = undefined;
    state.zombies = state.zombies.filter((z) => z.distance < 1);
  }
  if (state.lives === 0) {
    state.phase = 'over';
    return;
  }

  if (state.waveBreak > 0) {
    state.waveBreak = Math.max(state.waveBreak - dt, 0);
    return;
  }

  const wave = waveFor(state.wave);
  if (state.spawned >= wave.count) {
    if (state.zombies.length === 0) {
      state.wave += 1;
      state.spawned = 0;
      state.spawnTimer = 0;
      state.nextKind = undefined;
      state.waveBreak = WAVE_BREAK;
    }
    return;
  }

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0 && state.zombies.length < wave.onScreen) {
    if (spawnZombie(state, random, words)) state.spawnTimer = wave.spawnGap;
  }
}

/** Where a zombie stands on screen, and how big it is, from its distance. */
function placement(zombie: Zombie) {
  const t = zombie.distance;
  const scale = 0.35 + t * 1.15;
  const y = HORIZON + (GROUND - HORIZON) * t;
  const x = WIDTH / 2 + zombie.lane * (60 + 300 * t);
  return { x, y, scale };
}

/** How big each type is drawn, and how tall, so its word sits above its head. */
const LOOKS: Record<EnemyKind, { size: number; height: number }> = {
  shambler: { size: 1, height: 130 },
  runner: { size: 0.7, height: 125 },
  brute: { size: 1.5, height: 150 },
  ghost: { size: 1, height: 125 },
};

function drawShadow(ctx: CanvasRenderingContext2D, width: number) {
  ctx.fillStyle = theme.colors.surface;
  ctx.beginPath();
  ctx.ellipse(0, 0, width, 7, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawEyes(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const { colors } = theme;
  ctx.fillStyle = colors.text;
  ctx.beginPath();
  ctx.arc(x - 8, y - 4, 7, 0, Math.PI * 2);
  ctx.arc(x + 9, y - 2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.background;
  ctx.beginPath();
  ctx.arc(x - 7, y - 3, 3, 0, Math.PI * 2);
  ctx.arc(x + 9, y - 1, 2, 0, Math.PI * 2);
  ctx.fill();
}

/** The zombie that's always been in the game: arms out, swaying. */
function drawShambler(ctx: CanvasRenderingContext2D, sway: number) {
  const { colors } = theme;
  drawShadow(ctx, 28);

  // Legs and body.
  ctx.fillStyle = colors.wood;
  ctx.fillRect(-14, -34, 10, 34);
  ctx.fillRect(4, -34, 10, 34);
  ctx.fillStyle = colors.stripeA;
  ctx.fillRect(-20 + sway / 2, -80, 40, 48);

  // Arms, held out in front.
  ctx.fillStyle = colors.muted;
  ctx.fillRect(-30 + sway / 2, -76, 12, 30);
  ctx.fillRect(18 + sway / 2, -76, 12, 30);

  // Head, with big cartoon eyes and a wobbly grin.
  ctx.beginPath();
  ctx.arc(sway, -100, 22, 0, Math.PI * 2);
  ctx.fill();
  drawEyes(ctx, sway, -100);
  ctx.strokeStyle = colors.background;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sway - 9, -90);
  ctx.quadraticCurveTo(sway, -86, sway + 9, -91);
  ctx.stroke();
}

/** A small zombie leaning into a sprint, legs scissoring. */
function drawRunner(ctx: CanvasRenderingContext2D, time: number) {
  const { colors } = theme;
  const stride = Math.sin(time * 14) * 10;
  drawShadow(ctx, 22);

  ctx.strokeStyle = colors.wood;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -40);
  ctx.lineTo(-stride, -2);
  ctx.moveTo(0, -40);
  ctx.lineTo(stride, -2);
  ctx.stroke();

  // A body tipped forward, arms flung back.
  ctx.save();
  ctx.translate(0, -40);
  ctx.rotate(0.35);
  ctx.fillStyle = colors.water;
  ctx.fillRect(-14, -44, 28, 44);
  ctx.strokeStyle = colors.muted;
  ctx.beginPath();
  ctx.moveTo(-10, -38);
  ctx.lineTo(-30, -20 + stride);
  ctx.moveTo(10, -38);
  ctx.lineTo(-18, -14 - stride);
  ctx.stroke();
  ctx.fillStyle = colors.muted;
  ctx.beginPath();
  ctx.arc(4, -62, 18, 0, Math.PI * 2);
  ctx.fill();
  drawEyes(ctx, 6, -62);
  ctx.restore();
  ctx.lineCap = 'butt';
}

/** A huge, square zombie that stomps rather than sways. */
function drawBrute(ctx: CanvasRenderingContext2D, time: number) {
  const { colors } = theme;
  const stomp = Math.abs(Math.sin(time * 2)) * 4;
  drawShadow(ctx, 44);

  ctx.fillStyle = colors.wood;
  ctx.fillRect(-30, -40, 22, 40);
  ctx.fillRect(8, -40, 22, 40);
  ctx.fillStyle = colors.danger;
  ctx.fillRect(-42, -112 + stomp, 84, 76);
  // Fists hanging to the knees.
  ctx.fillStyle = colors.muted;
  ctx.fillRect(-60, -108 + stomp, 18, 64);
  ctx.fillRect(42, -108 + stomp, 18, 64);
  ctx.fillRect(-64, -50 + stomp, 26, 22);
  ctx.fillRect(38, -50 + stomp, 26, 22);
  // A small, flat head on big shoulders.
  ctx.fillRect(-20, -140 + stomp, 40, 30);
  drawEyes(ctx, 0, -124 + stomp);
  ctx.strokeStyle = colors.background;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-10, -114 + stomp);
  ctx.lineTo(10, -114 + stomp);
  ctx.stroke();
}

/** A floating sheet with a wavy hem, see-through and bobbing. */
function drawGhost(ctx: CanvasRenderingContext2D, time: number, id: number) {
  const { colors } = theme;
  const bob = Math.sin(time * 2.5 + id) * 6;
  ctx.globalAlpha = 0.35;
  drawShadow(ctx, 24);
  ctx.globalAlpha = 0.8;

  ctx.fillStyle = colors.stripeB;
  ctx.beginPath();
  ctx.moveTo(-26, -20 + bob);
  ctx.lineTo(-26, -86 + bob);
  ctx.arc(0, -86 + bob, 26, Math.PI, 0);
  ctx.lineTo(26, -20 + bob);
  const wave = time * 6 + id;
  for (let i = 0; i < 4; i++) {
    const x = 26 - (i + 1) * 13;
    const y = -20 + bob + (i % 2 === 0 ? 8 : 0) + Math.sin(wave + i) * 3;
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  // Hollow eyes and an open mouth.
  ctx.fillStyle = colors.background;
  ctx.beginPath();
  ctx.ellipse(-9, -90 + bob, 5, 8, 0, 0, Math.PI * 2);
  ctx.ellipse(9, -90 + bob, 5, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -70 + bob, 6, 8, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawZombie(ctx: CanvasRenderingContext2D, zombie: Zombie, time: number) {
  const { x, y, scale } = placement(zombie);
  const sway = Math.sin(time * 3 + zombie.id) * 4 * scale;
  const size = scale * LOOKS[zombie.kind].size;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  if (zombie.kind === 'runner') drawRunner(ctx, time);
  else if (zombie.kind === 'brute') drawBrute(ctx, time);
  else if (zombie.kind === 'ghost') drawGhost(ctx, time, zombie.id);
  else drawShambler(ctx, sway);
  ctx.restore();
}

function drawWord(ctx: CanvasRenderingContext2D, zombie: Zombie, locked: boolean, time: number) {
  const { colors } = theme;
  const { x, y, scale } = placement(zombie);
  const done = zombie.word.slice(0, zombie.typed);
  const left = zombie.word.slice(zombie.typed);

  ctx.font = canvasFont('body', 'bold');
  const width = ctx.measureText(zombie.word).width;
  const look = LOOKS[zombie.kind];
  // Kept on the canvas, however tall the zombie stands.
  const top = Math.max(y - look.height * look.size * scale - 30, 4);
  ctx.fillStyle = colors.surface;
  ctx.fillRect(x - width / 2 - 8, top, width + 16, 26);
  if (locked) {
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - width / 2 - 8, top, width + 16, 26);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const start = x - width / 2;
  ctx.fillStyle = colors.accent;
  ctx.fillText(done, start, top + 13);
  ctx.fillStyle = colors.text;
  ctx.globalAlpha = letterAlpha(zombie, zombie.typed, time);
  ctx.fillText(left, start + ctx.measureText(done).width, top + 13);
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
}

function draw(ctx: CanvasRenderingContext2D, state: MidwayOfTheDeadState, time: number) {
  const { colors } = theme;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // A moon over the far end of the midway.
  ctx.fillStyle = colors.text;
  ctx.beginPath();
  ctx.arc(WIDTH - 110, 60, 28, 0, Math.PI * 2);
  ctx.fill();

  // The midway path, narrowing towards the horizon.
  ctx.fillStyle = colors.surface;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 70, HORIZON);
  ctx.lineTo(WIDTH / 2 + 70, HORIZON);
  ctx.lineTo(WIDTH + 40, HEIGHT);
  ctx.lineTo(-40, HEIGHT);
  ctx.closePath();
  ctx.fill();

  // Striped tents on both sides of the path.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x = WIDTH / 2 + side * (130 + i * 110);
      const size = 24 + i * 14;
      const base = HORIZON + 10 + i * 30;
      ctx.fillStyle = i % 2 === 0 ? colors.stripeA : colors.stripeB;
      ctx.beginPath();
      ctx.moveTo(x - size, base);
      ctx.lineTo(x, base - size * 1.2);
      ctx.lineTo(x + size, base);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Far zombies first, so near ones stand in front.
  const zombies = [...state.zombies].sort((a, b) => a.distance - b.distance);
  for (const zombie of zombies) drawZombie(ctx, zombie, time);
  for (const zombie of zombies) drawWord(ctx, zombie, zombie.id === state.locked, time);

  // The booth counter the player stands behind.
  ctx.fillStyle = colors.wood;
  ctx.fillRect(0, HEIGHT - 44, WIDTH, 44);

  ctx.fillStyle = colors.text;
  ctx.font = canvasFont('body', 'bold');
  ctx.textAlign = 'left';
  ctx.fillText(`Score ${state.score}`, 16, HEIGHT - 16);
  ctx.textAlign = 'center';
  ctx.fillText(`Wave ${state.wave} · Combo x${state.combo}`, WIDTH / 2, HEIGHT - 16);
  ctx.textAlign = 'right';
  ctx.fillStyle = colors.danger;
  ctx.fillText('♥'.repeat(state.lives) + '♡'.repeat(LIVES - state.lives), WIDTH - 16, HEIGHT - 16);

  if (state.phase === 'playing' && state.waveBreak > 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    ctx.fillText(`Wave ${state.wave}`, WIDTH / 2, HEIGHT / 2 - 20);
    if (state.wave === 1) {
      ctx.fillStyle = colors.text;
      ctx.font = canvasFont('body');
      ctx.fillText('Type the word above a zombie to stop it', WIDTH / 2, HEIGHT / 2 + 16);
    }
  }

  if (state.phase === 'over') {
    ctx.fillStyle = colors.background;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.accent;
    ctx.font = canvasFont('title', 'bold');
    ctx.fillText(`The horde got through! You scored ${state.score}`, WIDTH / 2, HEIGHT / 2);
    ctx.fillStyle = colors.text;
    ctx.font = canvasFont('body');
    ctx.fillText('Press Enter to play again', WIDTH / 2, HEIGHT / 2 + 40);
  }
}

export const midwayOfTheDead: CarnivalGame = {
  id: 'midway-of-the-dead',
  name: 'Midway of the Dead',
  description:
    'Type the word above each zombie before it reaches you. Runners, brutes and ghosts join the horde.',

  start(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;

    let state = createState();
    let scoreRecorded = false;
    const restart = () => {
      state = createState();
      scoreRecorded = false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Key repeat and shortcuts never count as typing.
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (state.phase === 'over') {
        if (event.key === 'Enter') {
          event.preventDefault();
          restart();
        }
        return;
      }
      const letter = event.key.toLowerCase();
      if (!/^[a-z]$/.test(letter)) return;
      event.preventDefault();
      typeLetter(state, letter);
    };
    window.addEventListener('keydown', onKeyDown);

    let frame = 0;
    let last = performance.now();
    const loop = (time: number) => {
      // Cap the step so a background tab doesn't teleport everything.
      const dt = Math.min((time - last) / 1000, 0.05);
      last = time;
      step(state, dt);
      if (state.phase === 'over' && !scoreRecorded) {
        recordScore(midwayOfTheDead.id, state.score);
        scoreRecorded = true;
      }
      draw(ctx, state, time / 1000);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
    };
  },
};

export default midwayOfTheDead;
