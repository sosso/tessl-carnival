import { describe, expect, it } from 'vitest';
import {
  LIVES,
  createState,
  pickWord,
  scoreFor,
  spawnZombie,
  step,
  typeLetter,
  waveFor,
  type MidwayOfTheDeadState,
  type Zombie,
} from './game';
import { WORDS } from './words';

function zombie(word: string, overrides: Partial<Zombie> = {}): Zombie {
  return {
    id: word.length * 1000 + word.charCodeAt(0),
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
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
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

  it('scores 10 points per letter times the combo', () => {
    expect(scoreFor('cat', 1)).toBe(30);
    expect(scoreFor('zombie', 3)).toBe(180);
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

  it('starts the next wave once a wave is cleared', () => {
    const state = createState();
    state.waveBreak = 0;
    state.spawned = waveFor(1).count;
    step(state, 0.1);
    expect(state.wave).toBe(2);
    expect(state.spawned).toBe(0);
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
});
