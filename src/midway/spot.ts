import type { Point } from './world';

/**
 * Where the player stands on the midway and which way they face in first
 * person, kept for this page load so switching views or playing a game brings
 * them back to the same spot.
 */
export interface Spot extends Point {
  /** The first-person heading in radians, if the player has used that view. */
  angle?: number;
}

let spot: Spot | undefined;

export function savedSpot(): Spot | undefined {
  return spot && { ...spot };
}

export function saveSpot(at: Point, angle = spot?.angle) {
  spot = { x: at.x, y: at.y, angle };
}
