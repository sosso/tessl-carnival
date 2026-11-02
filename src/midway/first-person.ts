/**
 * The first-person view's logic: what each tile looks like as a wall, casting
 * rays through the tile grid, turning, moving relative to the way the player
 * faces, and the walking bob. Plain functions with no canvas or DOM, so Vitest
 * can run them. Movement and collision reuse `world.ts`.
 *
 * Angles are in radians in tile space: 0 faces +x, and turning right adds to
 * the angle, because +y runs down the map.
 */

import { WALK_SPEED, walk, type MidwayMap, type Point, type PropKind, type Walker } from './world';
import type { Spot } from './spot';

export type WallKind = 'edge' | 'booth' | 'tent' | 'big-top' | 'ride' | 'stall';

/** How tall each kind of wall stands, in tiles. The eye is at EYE_HEIGHT. */
export const WALL_HEIGHT: Record<WallKind, number> = {
  edge: 0.9,
  stall: 1.1,
  booth: 1.5,
  tent: 2.2,
  ride: 3,
  'big-top': 3.4,
};
export const EYE_HEIGHT = 0.6;
const TALLEST = Math.max(...Object.values(WALL_HEIGHT));

/** Facing up the avenue, from the gate towards the big top. */
export const AVENUE_ANGLE = -Math.PI / 2;
export const TURN_SPEED = 2.4;
/** Radians turned per pixel the captured mouse moves. */
export const MOUSE_TURN = 0.0035;
/** Booth names show within this many tiles of the booth. */
export const NAME_DISTANCE = 3.5;

const PROP_WALLS: Partial<Record<PropKind, WallKind>> = {
  'big-top': 'big-top',
  'round-tent': 'tent',
  'peaked-tent': 'tent',
  'ferris-wheel': 'ride',
  carousel: 'ride',
  wagon: 'stall',
  cart: 'stall',
  'ticket-booth': 'stall',
  billboard: 'stall',
};

/** Props too small to be walls. They're drawn as flat sprites instead. */
export const SPRITE_PROPS: readonly PropKind[] = ['bench', 'planter', 'balloons', 'bunting-pole'];

/**
 * The wall each tile shows, or undefined where a ray passes through: open
 * ground and small props. Every blocked tile that isn't a small prop is a wall.
 */
export function wallKinds(map: MidwayMap): (WallKind | undefined)[] {
  const kinds: (WallKind | undefined)[] = map.blocked.map((blocked) =>
    blocked ? 'edge' : undefined,
  );
  const fill = (x0: number, y0: number, w: number, h: number, kind: WallKind | undefined) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) kinds[y * map.width + x] = kind;
    }
  };
  for (const prop of map.props) {
    const kind = PROP_WALLS[prop.kind];
    fill(prop.x, prop.y, prop.w, prop.h, kind);
  }
  for (const booth of map.booths) fill(booth.x, booth.y, booth.w, booth.h, 'booth');
  return kinds;
}

export interface RayHit {
  kind: WallKind;
  /**
   * How far along the ray the wall is, in multiples of the ray's direction:
   * for a unit direction, the distance in tiles.
   */
  distance: number;
  /** True when the ray hit a wall running along x (a north or south face). */
  side: boolean;
  /** Where along the face the ray hit, from 0 to 1. */
  u: number;
  tile: Point;
}

/**
 * Walks a ray through the grid from a point, and returns each wall it meets,
 * nearest first. A ray goes on past a wall to find taller ones behind it, and
 * stops at the edge of the map, at a wall nothing can top, or at `maxDistance`.
 */
export function castRay(
  map: MidwayMap,
  kinds: readonly (WallKind | undefined)[],
  from: Point,
  direction: Point,
  maxDistance = 64,
): RayHit[] {
  const hits: RayHit[] = [];
  let tx = Math.floor(from.x);
  let ty = Math.floor(from.y);
  const stepX = direction.x < 0 ? -1 : 1;
  const stepY = direction.y < 0 ? -1 : 1;
  const deltaX = direction.x === 0 ? Infinity : Math.abs(1 / direction.x);
  const deltaY = direction.y === 0 ? Infinity : Math.abs(1 / direction.y);
  let nextX = (direction.x < 0 ? from.x - tx : tx + 1 - from.x) * deltaX;
  let nextY = (direction.y < 0 ? from.y - ty : ty + 1 - from.y) * deltaY;
  let previous: WallKind | undefined;
  let tallest = 0;

  for (;;) {
    let distance: number;
    let side: boolean;
    if (nextX < nextY) {
      distance = nextX;
      nextX += deltaX;
      tx += stepX;
      side = false;
    } else {
      distance = nextY;
      nextY += deltaY;
      ty += stepY;
      side = true;
    }
    if (distance > maxDistance) return hits;
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return hits;

    const kind = kinds[ty * map.width + tx];
    // Inside one wall, the tiles behind its face are hidden.
    if (kind && kind !== previous && WALL_HEIGHT[kind] > tallest) {
      const along = side ? from.x + direction.x * distance : from.y + direction.y * distance;
      hits.push({ kind, distance, side, u: along - Math.floor(along), tile: { x: tx, y: ty } });
      tallest = WALL_HEIGHT[kind];
    }
    if (kind === 'edge' || tallest >= TALLEST) return hits;
    previous = kind;
  }
}

/** The unit vector the player faces. */
export function facing(angle: number): Point {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** The unit vector to the player's right. */
export function rightOf(angle: number): Point {
  return { x: -Math.sin(angle), y: Math.cos(angle) };
}

/** Turns by `delta` radians (right is positive), keeping the angle in (-π, π]. */
export function turn(angle: number, delta: number): number {
  let a = (angle + delta) % (Math.PI * 2);
  if (a <= -Math.PI) a += Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  return a;
}

/**
 * The tile direction to walk for forward and right input (each -1, 0 or 1)
 * while facing `angle`: a unit vector, or zero when there's no input.
 */
export function moveDirection(angle: number, forward: number, right: number): Point {
  const f = facing(angle);
  const r = rightOf(angle);
  const x = f.x * forward + r.x * right;
  const y = f.y * forward + r.y * right;
  const length = Math.hypot(x, y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
}

/**
 * Walks the player for `dt` seconds with the same collision as the isometric
 * view. Returns how far they actually moved.
 */
export function stepPlayer(
  map: MidwayMap,
  player: Walker,
  angle: number,
  forward: number,
  right: number,
  dt: number,
): number {
  const direction = moveDirection(angle, forward, right);
  if (direction.x === 0 && direction.y === 0) {
    player.walking = false;
    return 0;
  }
  return walk(map, player, direction, dt);
}

/** Where the player starts in first person: their saved spot, or the gate facing up the avenue. */
export function startingPose(map: MidwayMap, spot: Spot | undefined): Required<Spot> {
  const at = spot ?? map.spawn;
  return { x: at.x, y: at.y, angle: spot?.angle ?? AVENUE_ANGLE };
}

/** The tallest bob, as a share of the view's height. */
export const BOB_CAP = 0.03;
/** Bob cycles per tile walked. */
const BOB_PER_TILE = 0.5;
/** How fast the bob grows and settles, per second. */
const BOB_EASE = 14;

export interface Bob {
  /** Where in the up-and-down cycle the view is, in radians. */
  phase: number;
  /** How big the bob is now, as a share of the view's height. */
  amount: number;
}

export function createBob(): Bob {
  return { phase: 0, amount: 0 };
}

/**
 * Updates the bob after the player moved `moved` tiles in `dt` seconds, and
 * returns how far to shift the view, as a share of its height. It grows with
 * walking speed up to BOB_CAP and settles quickly when the player stops.
 * Turning doesn't move the player, so it doesn't bob. With reduced motion
 * there is no bob.
 */
export function updateBob(bob: Bob, moved: number, dt: number, calm: boolean): number {
  if (calm) {
    bob.amount = 0;
    return 0;
  }
  if (dt > 0) {
    const target = Math.min(BOB_CAP, (BOB_CAP * moved) / dt / WALK_SPEED);
    bob.amount += (target - bob.amount) * (1 - Math.exp(-BOB_EASE * dt));
    if (target === 0 && bob.amount < 1e-4) bob.amount = 0;
  }
  bob.phase = (bob.phase + moved * BOB_PER_TILE * Math.PI * 2) % (Math.PI * 2);
  return Math.sin(bob.phase) * bob.amount;
}
