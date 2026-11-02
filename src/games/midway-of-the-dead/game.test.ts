import { describe, expect, it } from 'vitest';
import {
  ENEMY_TYPES,
  GHOST_CYCLE,
  LIVES,
  WAVE_BREAK,
  createState,
  ghostAlpha,
  kindsFor,
  letterAlpha,
  pickKind,
  pickWord,
  scoreFor,
  spawnZombie,
  step,
  typeLetter,
  waveFor,
  wordLimits,
  type EnemyKind,
  type MidwayOfTheDeadState,
  type Zombie,
} from './game';
import { WORDS } from './words';

function zombie(word: string, overrides: Partial<Zombie> = {}): Zombie {
  return {
    id: word.length * 1000 + word.charCodeAt(0),
    kind: 'shambler',
    word,
    typed: 0,
    distance: 0.5,
    speed: 0.1,
    lane: 0,
    ...overrides,
  };
}

function withZombies(...words: string[]): MidwayOfTheDeadState {
  const state = createState();
  state.zombies = words.map((w) => zombie(w));
  state.waveBreak = 0;
  // Keep new zombies out of the way unless a test asks for one.
  state.spawnTimer = 99;
  return state;
}

function seeded(seed = 1) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/** A random that always picks `kind` first, then behaves like `rest`. */
function forcing(kind: EnemyKind, wave: number, rest: () => number = () => 0.5) {
  const kinds = kindsFor(wave);
  const total = kinds.reduce((sum, k) => sum + ENEMY_TYPES[k].weight, 0);
  let before = 0;
  for (const k of kinds) {
    if (k === kind) break;
    before += ENEMY_TYPES[k].weight;
  }
  let first = true;
  return () => {
    if (!first) return rest();
    first = false;
    return (before + ENEMY_TYPES[kind].weight / 2) / total;
  };
}

function typeWord(state: MidwayOfTheDeadState, word: string) {
  for (const letter of word) typeLetter(state, letter);
}

describe('midway of the dead', () => {
  it('starts with three lives, no score and a combo of 1', () => {
    const state = createState();
    expect(state.lives).toBe(LIVES);
    expect(LIVES).toBe(3);
    expect(state.score).toBe(0);
    expect(state.combo).toBe(1);
    expect(state.phase).toBe('playing');
  });

  it('locks on to the zombie whose word starts with the letter typed', () => {
    const state = withZombies('bat', 'cat');
    expect(typeLetter(state, 'c')).toBe('hit');
    expect(state.locked).toBe(state.zombies[1].id);
    expect(state.zombies[1].typed).toBe(1);
    expect(state.zombies[0].typed).toBe(0);
  });

  it('sends further letters to the locked zombie', () => {
    const state = withZombies('cat', 'axe');
    typeLetter(state, 'c');
    // 'a' starts another zombie's word, but the lock holds.
    expect(typeLetter(state, 'a')).toBe('hit');
    expect(state.zombies[0].typed).toBe(2);
    expect(state.zombies[1].typed).toBe(0);
  });

  it('counts a wrong letter as a miss and keeps the lock', () => {
    const state = withZombies('cat');
    typeLetter(state, 'c');
    expect(typeLetter(state, 'x')).toBe('miss');
    expect(state.misses).toBe(1);
    expect(state.locked).toBe(state.zombies[0].id);
    expect(state.zombies[0].typed).toBe(1);
    expect(typeLetter(state, 'a')).toBe('hit');
  });

  it('counts a letter no zombie starts with as a miss', () => {
    const state = withZombies('cat');
    expect(typeLetter(state, 'z')).toBe('miss');
    expect(state.locked).toBeUndefined();
    expect(state.misses).toBe(1);
  });

  it('defeats a zombie when its word is finished, and clears the lock', () => {
    const state = withZombies('cat', 'bun');
    typeLetter(state, 'c');
    typeLetter(state, 'a');
    expect(typeLetter(state, 't')).toBe('defeat');
    expect(state.zombies.map((z) => z.word)).toEqual(['bun']);
    expect(state.locked).toBeUndefined();
    expect(state.score).toBe(30);
    expect(state.defeated).toBe(1);
  });

  it('only gives a new zombie a word whose first letter is free', () => {
    const state = withZombies('cat', 'bat');
    const words = ['cake', 'bell', 'drum', 'claw'];
    for (let i = 0; i < 20; i++) {
      expect(pickWord(state.zombies, waveFor(1), () => i / 20, words)).toBe('drum');
    }
  });

  it('spawns no zombie when every first letter is taken', () => {
    const state = withZombies('cat', 'bat');
    expect(spawnZombie(state, () => 0, ['cake', 'bell'])).toBeUndefined();
    expect(state.zombies).toHaveLength(2);
  });

  it('never has two zombies on screen with the same first letter', () => {
    const state = createState();
    const random = seeded();
    for (let i = 0; i < 26; i++) spawnZombie(state, random);
    const firsts = state.zombies.map((z) => z.word[0]);
    expect(new Set(firsts).size).toBe(firsts.length);
  });

  it('costs a life when a zombie reaches the player, and clears its lock', () => {
    const state = withZombies('cat', 'bun');
    typeLetter(state, 'c');
    state.zombies[0].distance = 0.99;
    step(state, 0.2);
    expect(state.lives).toBe(LIVES - 1);
    expect(state.zombies.map((z) => z.word)).toEqual(['bun']);
    expect(state.locked).toBeUndefined();
    // The next letter starts a new lock rather than typing into the old one.
    expect(typeLetter(state, 'b')).toBe('hit');
  });

  it('scores 10 points per letter times the combo, times the type points', () => {
    expect(scoreFor('cat', 1)).toBe(30);
    expect(scoreFor('zombie', 3)).toBe(180);
    expect(scoreFor('zombie', 3, 2)).toBe(360);
  });

  it('builds the combo with clean defeats and resets it on a miss', () => {
    const state = withZombies('cat', 'bun', 'drum', 'eek');
    typeWord(state, 'cat'); // 30 x 1
    expect(state.combo).toBe(2);
    typeWord(state, 'bun'); // 30 x 2
    expect(state.combo).toBe(3);
    expect(state.score).toBe(90);

    typeLetter(state, 'd');
    typeLetter(state, 'q'); // miss
    expect(state.combo).toBe(1);
    typeWord(state, 'rum'); // 40 x 1, after a miss: combo stays at 1
    expect(state.score).toBe(130);
    expect(state.combo).toBe(1);

    typeWord(state, 'eek'); // 30 x 1, clean: combo goes up
    expect(state.score).toBe(160);
    expect(state.combo).toBe(2);
  });

  it('ends the round when the last life is lost', () => {
    const state = withZombies('cat');
    state.lives = 1;
    state.zombies[0].distance = 0.999;
    step(state, 0.1);
    expect(state.lives).toBe(0);
    expect(state.phase).toBe('over');
    expect(typeLetter(state, 'c')).toBe('ignored');
    step(state, 1);
    expect(state.phase).toBe('over');
  });

  it('keeps playing while lives remain', () => {
    const state = withZombies('cat');
    state.zombies[0].distance = 0.999;
    step(state, 0.1);
    expect(state.phase).toBe('playing');
  });

  it('starts the next wave once a wave is cleared, after a one second break', () => {
    const state = createState();
    state.waveBreak = 0;
    state.spawned = waveFor(1).count;
    step(state, 0.1);
    expect(state.wave).toBe(2);
    expect(state.spawned).toBe(0);
    expect(state.waveBreak).toBe(WAVE_BREAK);
    expect(WAVE_BREAK).toBe(1);
  });

  it('uses the wave numbers from the tuning table', () => {
    expect(waveFor(1)).toMatchObject({ count: 11, onScreen: 4, spawnGap: 1.35 });
    expect(waveFor(1).speed).toBeCloseTo(0.12);
    expect(waveFor(5)).toMatchObject({ count: 23, onScreen: 8 });
    expect(waveFor(5).speed).toBeCloseTo(0.2);
    expect(waveFor(5).spawnGap).toBeCloseTo(0.75);
    expect(waveFor(20)).toMatchObject({ onScreen: 10, speed: 0.4, spawnGap: 0.35 });
  });

  it('brings in runners in wave 1, brutes in wave 2 and ghosts from wave 3', () => {
    expect(kindsFor(1)).toEqual(['shambler', 'runner']);
    expect(kindsFor(2)).toEqual(['shambler', 'runner', 'brute']);
    expect(kindsFor(3)).toEqual(['shambler', 'runner', 'brute', 'ghost']);
    expect(kindsFor(9)).toEqual(['shambler', 'runner', 'brute', 'ghost']);
    const random = seeded(7);
    const picked = new Set(Array.from({ length: 200 }, () => pickKind(1, random)));
    expect(picked).toEqual(new Set(['shambler', 'runner']));
  });

  it.each([
    ['shambler', 1, 1, 1],
    ['runner', 1.8, 1, 2],
    ['brute', 0.6, 2, 2],
    ['ghost', 1, 1, 2],
  ] as const)(
    'gives a %s %fx speed, a cost of %i lives and %ix points',
    (kind, speed, lives, points) => {
      expect(ENEMY_TYPES[kind]).toMatchObject({ speed, lives, points });
      // Spawned with the random at its midpoint, the spread is 1x.
      const state = createState();
      state.wave = 3;
      const zombie = spawnZombie(state, forcing(kind, 3));
      expect(zombie?.kind).toBe(kind);
      expect(zombie?.speed).toBeCloseTo(waveFor(3).speed * speed);
    },
  );

  it('keeps each type within its word length', () => {
    expect(wordLimits('runner', 7)).toEqual({ minLength: 3, maxLength: 5 });
    expect(wordLimits('brute', 2).minLength).toBe(9);
    expect(wordLimits('shambler', 4)).toMatchObject({
      minLength: waveFor(4).minLength,
      maxLength: waveFor(4).maxLength,
    });
    expect(wordLimits('ghost', 4)).toMatchObject({
      minLength: waveFor(4).minLength,
      maxLength: waveFor(4).maxLength,
    });
    for (const wave of [1, 2, 3, 6, 12]) {
      const state = createState();
      state.wave = wave;
      const random = seeded(wave);
      for (let i = 0; i < 300; i++) {
        if (state.zombies.length >= 8) state.zombies = [];
        const zombie = spawnZombie(state, random);
        if (!zombie) continue;
        const { minLength, maxLength } = wordLimits(zombie.kind, wave);
        expect(zombie.word.length).toBeGreaterThanOrEqual(minLength);
        expect(zombie.word.length).toBeLessThanOrEqual(maxLength);
      }
    }
  });

  it('never picks a word outside the limits, even when nothing else fits', () => {
    expect(pickWord([], { minLength: 9, maxLength: Infinity }, () => 0, ['cat', 'zombie'])).toBe(
      undefined,
    );
    expect(
      pickWord([zombie('nightmare')], { minLength: 9, maxLength: 99 }, () => 0, [
        'nightmare',
        'bun',
      ]),
    ).toBeUndefined();
  });

  it('holds a spawn until a word fits, then tries again on the next frame', () => {
    const state = withZombies('nightmare');
    state.wave = 2;
    state.spawnTimer = 0;
    const random = forcing('brute', 2);
    // The only long word starts with the same letter as the zombie on screen.
    expect(spawnZombie(state, random, ['nightmare', 'cat'])).toBeUndefined();
    expect(state.zombies).toHaveLength(1);
    expect(state.nextKind).toBe('brute');
    // Still a brute when one fits, not a shorter word or another type.
    state.zombies = [];
    const zombie = spawnZombie(state, () => 0, ['nightmare', 'cat']);
    expect(zombie).toMatchObject({ kind: 'brute', word: 'nightmare' });
    expect(state.nextKind).toBeUndefined();
  });

  it('keeps trying to spawn every frame while no word fits', () => {
    const state = withZombies('cat');
    state.spawnTimer = 0;
    const words = ['cake'];
    step(state, 0.01, () => 0.5, words);
    expect(state.zombies).toHaveLength(1);
    step(state, 0.01, () => 0.5, words);
    expect(state.zombies).toHaveLength(1);
    // The next frame after the first letter frees up, it spawns.
    state.zombies = [];
    step(state, 0.01, () => 0.5, words);
    expect(state.zombies.map((z) => z.word)).toEqual(['cake']);
  });

  it('keeps first letters unique across every type', () => {
    const state = createState();
    state.wave = 3;
    const random = seeded(3);
    for (let i = 0; i < 40; i++) spawnZombie(state, random);
    expect(new Set(state.zombies.map((z) => z.kind)).size).toBe(4);
    const firsts = state.zombies.map((z) => z.word[0]);
    expect(new Set(firsts).size).toBe(firsts.length);
  });

  it('puts all four types on screen together in a seeded wave 3', () => {
    const state = createState();
    state.wave = 3;
    state.lives = 999;
    const random = seeded(1);
    let together = false;
    for (let t = 0; t < 2000 && state.wave === 3; t++) {
      step(state, 0.05, random);
      if (new Set(state.zombies.map((z) => z.kind)).size === 4) together = true;
    }
    expect(together).toBe(true);
  });

  it('costs two lives when a brute gets through, which ends a round at one life', () => {
    const state = withZombies('nightmare');
    state.zombies[0].kind = 'brute';
    state.zombies[0].distance = 0.999;
    step(state, 0.1);
    expect(state.lives).toBe(LIVES - 2);
    expect(state.phase).toBe('playing');

    const last = withZombies('nightmare');
    last.lives = 1;
    last.zombies[0].kind = 'brute';
    last.zombies[0].distance = 0.999;
    step(last, 0.1);
    expect(last.lives).toBe(0);
    expect(last.phase).toBe('over');
  });

  it('scores double for runners, brutes and ghosts', () => {
    const state = withZombies('cat', 'bun', 'drum', 'eek');
    state.zombies[1].kind = 'runner';
    state.zombies[2].kind = 'brute';
    state.zombies[3].kind = 'ghost';
    typeWord(state, 'cat'); // 30 x 1 x 1
    expect(state.score).toBe(30);
    typeWord(state, 'bun'); // 30 x 2 x 2
    expect(state.score).toBe(150);
    typeWord(state, 'drum'); // 40 x 3 x 2
    expect(state.score).toBe(390);
    typeWord(state, 'eek'); // 30 x 4 x 2
    expect(state.score).toBe(630);
  });

  it('fades a ghost word slowly, readable for at least half of each cycle', () => {
    expect(GHOST_CYCLE).toBeGreaterThanOrEqual(1.5);
    expect(GHOST_CYCLE).toBeLessThanOrEqual(2.5);
    const samples = 400;
    let readable = 0;
    let lowest = 1;
    let previous = ghostAlpha(0);
    let biggestJump = 0;
    for (let i = 0; i <= samples; i++) {
      const alpha = ghostAlpha((i / samples) * GHOST_CYCLE);
      if (alpha === 1) readable += 1;
      lowest = Math.min(lowest, alpha);
      biggestJump = Math.max(biggestJump, Math.abs(alpha - previous));
      previous = alpha;
    }
    expect(readable / samples).toBeGreaterThanOrEqual(0.5);
    expect(lowest).toBeLessThan(0.2);
    // No flashing: it changes by under 5% per two hundredths of a second.
    expect(biggestJump).toBeLessThan(0.05);
    expect(ghostAlpha(GHOST_CYCLE * 0.25)).toBe(1);
    expect(ghostAlpha(GHOST_CYCLE * 0.75)).toBeLessThan(0.2);
  });

  it('keeps the letters already typed on a ghost visible', () => {
    const ghost = zombie('ghoul', { kind: 'ghost', typed: 2, id: 0 });
    const faded = GHOST_CYCLE * 0.75;
    expect(letterAlpha(ghost, 0, faded)).toBe(1);
    expect(letterAlpha(ghost, 1, faded)).toBe(1);
    expect(letterAlpha(ghost, 2, faded)).toBeLessThan(0.2);
    expect(letterAlpha(zombie('cat'), 0, faded)).toBe(1);
  });

  it('makes later waves longer, faster and more crowded', () => {
    const first = waveFor(1);
    const later = waveFor(4);
    expect(later.maxLength).toBeGreaterThan(first.maxLength);
    expect(later.speed).toBeGreaterThan(first.speed);
    expect(later.onScreen).toBeGreaterThan(first.onScreen);
  });

  it('ignores anything but a lowercase letter', () => {
    const state = withZombies('cat');
    expect(typeLetter(state, 'C')).toBe('ignored');
    expect(typeLetter(state, '1')).toBe('ignored');
    expect(state.misses).toBe(0);
  });

  it('has a word list of lowercase a to z only', () => {
    for (const word of WORDS) expect(word).toMatch(/^[a-z]+$/);
  });

  it('has long words for brutes under at least 18 first letters', () => {
    const long = WORDS.filter((w) => w.length >= 9);
    expect(new Set(long.map((w) => w[0])).size).toBeGreaterThanOrEqual(18);
  });
});
