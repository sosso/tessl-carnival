import { canvasFont, recordScore, theme, type CarnivalGame } from '../../carnival';
import { WORDS } from './words';

const { width: WIDTH, height: HEIGHT } = theme.canvas;

export const LIVES = 3;
export const POINTS_PER_LETTER = 10;
/** Seconds between waves, while the next wave's banner shows. */
export const WAVE_BREAK = 2;
const HORIZON = 120;
const GROUND = HEIGHT - 70;

export interface Zombie {
  id: number;
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
  phase: 'playing' | 'over';
}

/** Later waves have longer words, faster zombies and more of them at once. */
export function waveFor(wave: number): Wave {
  return {
    count: 5 + wave * 2,
    onScreen: Math.min(1 + wave, 6),
    speed: Math.min(0.06 + wave * 0.012, 0.2),
    minLength: Math.min(3 + Math.floor((wave - 1) / 2), 6),
    maxLength: Math.min(4 + wave, 13),
    spawnGap: Math.max(2.2 - wave * 0.2, 0.7),
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
    phase: 'playing',
  };
}

/**
 * Picks a word of the right length whose first letter no zombie on screen
 * has, so a keystroke never has two possible targets. Undefined if none fits.
 */
export function pickWord(
  zombies: readonly Zombie[],
  wave: Wave,
  random: () => number = Math.random,
  words: readonly string[] = WORDS,
): string | undefined {
  const taken = new Set(zombies.map((z) => z.word[0]));
  const fits = (word: string) => !taken.has(word[0]);
  const sized = words.filter(
    (w) => fits(w) && w.length >= wave.minLength && w.length <= wave.maxLength,
  );
  const choices = sized.length > 0 ? sized : words.filter(fits);
  if (choices.length === 0) return undefined;
  return choices[Math.floor(random() * choices.length)];
}

/** Adds a zombie at the far end of the midway. Returns it, or undefined if no word fits. */
export function spawnZombie(
  state: MidwayOfTheDeadState,
  random: () => number = Math.random,
  words: readonly string[] = WORDS,
): Zombie | undefined {
  const wave = waveFor(state.wave);
  const word = pickWord(state.zombies, wave, random, words);
  if (!word) return undefined;
  const zombie: Zombie = {
    id: state.nextId++,
    word,
    typed: 0,
    distance: 0,
    speed: wave.speed * (0.85 + random() * 0.3),
    lane: random() * 1.6 - 0.8,
  };
  state.zombies.push(zombie);
  state.spawned += 1;
  return zombie;
}

/** 10 points per letter, times the current combo. */
export function scoreFor(word: string, combo: number): number {
  return POINTS_PER_LETTER * word.length * combo;
}

function miss(state: MidwayOfTheDeadState) {
  state.misses += 1;
  state.combo = 1;
  state.clean = false;
}

function defeat(state: MidwayOfTheDeadState, zombie: Zombie) {
  state.score += scoreFor(zombie.word, state.combo);
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
): void {
  if (state.phase !== 'playing') return;

  for (const zombie of state.zombies) zombie.distance += zombie.speed * dt;
  const arrived = state.zombies.filter((z) => z.distance >= 1);
  if (arrived.length > 0) {
    state.lives = Math.max(state.lives - arrived.length, 0);
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
      state.waveBreak = WAVE_BREAK;
    }
    return;
  }

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0 && state.zombies.length < wave.onScreen) {
    if (spawnZombie(state, random)) state.spawnTimer = wave.spawnGap;
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

function drawZombie(ctx: CanvasRenderingContext2D, zombie: Zombie, time: number) {
  const { colors } = theme;
  const { x, y, scale } = placement(zombie);
  const sway = Math.sin(time * 3 + zombie.id) * 4 * scale;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Shadow.
  ctx.fillStyle = colors.surface;
  ctx.beginPath();
  ctx.ellipse(0, 0, 28, 7, 0, 0, Math.PI * 2);
  ctx.fill();

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
  ctx.fillStyle = colors.text;
  ctx.beginPath();
  ctx.arc(sway - 8, -104, 7, 0, Math.PI * 2);
  ctx.arc(sway + 9, -102, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.background;
  ctx.beginPath();
  ctx.arc(sway - 7, -103, 3, 0, Math.PI * 2);
  ctx.arc(sway + 9, -101, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = colors.background;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sway - 9, -90);
  ctx.quadraticCurveTo(sway, -86, sway + 9, -91);
  ctx.stroke();
  ctx.restore();
}

function drawWord(ctx: CanvasRenderingContext2D, zombie: Zombie, locked: boolean) {
  const { colors } = theme;
  const { x, y, scale } = placement(zombie);
  const done = zombie.word.slice(0, zombie.typed);
  const left = zombie.word.slice(zombie.typed);

  ctx.font = canvasFont('body', 'bold');
  const width = ctx.measureText(zombie.word).width;
  const top = y - 130 * scale - 30;
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
  ctx.fillText(left, start + ctx.measureText(done).width, top + 13);
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
  for (const zombie of zombies) drawWord(ctx, zombie, zombie.id === state.locked);

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
    'Type the word above each zombie before it shambles up to you. Clean streaks build a combo.',

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
