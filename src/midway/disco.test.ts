import { describe, expect, it } from 'vitest';
import {
  BEAM_COUNT,
  BEAM_SWING,
  beamAngle,
  beatAt,
  BEAT_SECONDS,
  floorLight,
  isDisco,
  toggleDisco,
} from './disco';

describe('toggleDisco', () => {
  it('starts off, and flips each time', () => {
    expect(isDisco()).toBe(false);
    expect(toggleDisco()).toBe(true);
    expect(isDisco()).toBe(true);
    expect(toggleDisco()).toBe(false);
    expect(isDisco()).toBe(false);
  });
});

describe('beatAt', () => {
  it('counts whole beats', () => {
    expect(beatAt(0)).toBe(0);
    expect(beatAt(BEAT_SECONDS * 0.99)).toBe(0);
    expect(beatAt(BEAT_SECONDS * 3)).toBe(3);
  });

  it('flashes slower than 3 times a second', () => {
    expect(1 / BEAT_SECONDS).toBeLessThan(3);
  });
});

describe('floorLight', () => {
  const COUNT = 5;

  it('always picks a light that exists', () => {
    for (let y = -3; y < 12; y++) {
      for (let x = -3; x < 12; x++) {
        const light = floorLight(x, y, 7, COUNT);
        expect(Number.isInteger(light)).toBe(true);
        expect(light).toBeGreaterThanOrEqual(0);
        expect(light).toBeLessThan(COUNT);
      }
    }
  });

  it('never matches a neighbouring tile', () => {
    for (let beat = 0; beat < COUNT; beat++) {
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 12; x++) {
          const light = floorLight(x, y, beat, COUNT);
          expect(floorLight(x + 1, y, beat, COUNT)).not.toBe(light);
          expect(floorLight(x, y + 1, beat, COUNT)).not.toBe(light);
        }
      }
    }
  });

  it('changes on every beat', () => {
    expect(floorLight(4, 2, 1, COUNT)).not.toBe(floorLight(4, 2, 0, COUNT));
  });
});

describe('beamAngle', () => {
  it('stays within its swing of straight down', () => {
    for (let index = 0; index < BEAM_COUNT; index++) {
      for (let seconds = 0; seconds < 30; seconds += 0.7) {
        const off = Math.abs(beamAngle(index, seconds) - Math.PI / 2);
        expect(off).toBeLessThanOrEqual(BEAM_SWING);
      }
    }
  });

  it('points each beam somewhere different', () => {
    const angles = Array.from({ length: BEAM_COUNT }, (_, i) => beamAngle(i, 1).toFixed(3));
    expect(new Set(angles).size).toBe(BEAM_COUNT);
  });
});
