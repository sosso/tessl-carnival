/**
 * The midway's disco theme: whether it's on, and the timing both views share.
 * Plain functions, so the lights can be tested without a canvas. The drawing
 * lives in `disco-render.ts`.
 */

/** Seconds per beat. The floor changes on the beat: 2 a second keeps it under the 3 flashes a second that accessibility guidance warns about. */
export const BEAT_SECONDS = 0.5;
export const BEAM_COUNT = 6;
/** The furthest a beam swings from straight down, in radians. */
export const BEAM_SWING = 1.15;

let on = false;

/** Whether the disco is on. Kept for this page load, so it survives switching views or playing a game. */
export function isDisco(): boolean {
  return on;
}

/** Turns the disco on or off, and says which it is now. */
export function toggleDisco(): boolean {
  on = !on;
  return on;
}

/** The whole beats since time zero. */
export function beatAt(seconds: number): number {
  return Math.floor(seconds / BEAT_SECONDS);
}

/**
 * Which light a dance floor tile shows on a beat, out of `count`. With 5 lights
 * or more, a tile never matches a neighbour on any side.
 */
export function floorLight(x: number, y: number, beat: number, count: number): number {
  return (((x + 2 * y + beat) % count) + count) % count;
}

/** A beam's direction in radians (straight down is PI / 2), sweeping slowly. */
export function beamAngle(index: number, seconds: number): number {
  const phase = (index / BEAM_COUNT) * Math.PI * 2;
  return Math.PI / 2 + BEAM_SWING * Math.sin(seconds * 0.6 + phase);
}
