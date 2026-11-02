import { describe, expect, it } from 'vitest';
import {
  AVENUE_ANGLE,
  BOB_CAP,
  castRay,
  createBob,
  facing,
  moveDirection,
  rightOf,
  startingPose,
  stepPlayer,
  turn,
  updateBob,
  wallKinds,
} from './first-person';
import { savedSpot, saveSpot } from './spot';
import { canStand, createWalker, layoutMidway, WALK_SPEED } from './world';

const map = layoutMidway(['water-cannon', 'ring-toss']);
const kinds = wallKinds(map);
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('wallKinds', () => {
  it('makes booths, tents, rides and the edge their own kinds of wall', () => {
    const kind = (x: number, y: number) => kinds[y * map.width + x];
    const booth = map.booths[0];
    expect(kind(booth.x, booth.y)).toBe('booth');
    expect(kind(0, 5)).toBe('edge');
    expect(kind(map.avenueX, 2)).toBe('big-top');
    expect(kind(2, 2)).toBe('tent');
    expect(kind(7, 2)).toBe('ride');
  });

  it('leaves open ground and small props for rays to pass through', () => {
    const planter = map.props.find((p) => p.kind === 'planter')!;
    expect(kinds[planter.y * map.width + planter.x]).toBeUndefined();
    expect(kinds[(map.height - 4) * map.width + map.avenueX]).toBeUndefined();
  });
});

describe('castRay', () => {
  it('hits the edge of the map straight ahead, at the right distance', () => {
    // From the middle of an open tile beside the left hedge, looking west.
    const from = { x: 1.5, y: 7.5 };
    const hits = castRay(map, kinds, from, { x: -1, y: 0 });
    expect(hits).toHaveLength(1);
    expect(hits[0].kind).toBe('edge');
    close(hits[0].distance, 0.5);
    expect(hits[0].side).toBe(false);
    close(hits[0].u, 0.5);
  });

  it('hits a booth face from the avenue, and measures to that face', () => {
    const booth = map.booths[1];
    const from = { x: booth.x - 2.5, y: booth.y + 1.25 };
    const [first] = castRay(map, kinds, from, { x: 1, y: 0 });
    expect(first.kind).toBe('booth');
    close(first.distance, 2.5);
    expect(first.tile).toEqual({ x: booth.x, y: booth.y + 1 });
    close(first.u, 0.25);
  });

  it('measures along the ray direction, so a longer direction gives a shorter distance', () => {
    const from = { x: 1.5, y: 7.5 };
    const [hit] = castRay(map, kinds, from, { x: -2, y: 0 });
    close(hit.distance, 0.25);
  });

  it('reports a north or south face when the ray crosses a horizontal edge', () => {
    const from = { x: map.avenueX + 0.5, y: 8.5 };
    const hits = castRay(map, kinds, from, { x: 0, y: -1 });
    expect(hits.at(-1)!.kind).toBe('big-top');
    expect(hits.at(-1)!.side).toBe(true);
    close(hits.at(-1)!.distance, 3.5);
  });

  it('sees taller walls behind lower ones, nearest first', () => {
    const booth = map.booths[0];
    const from = { x: booth.x + 0.5, y: booth.y + 3.5 };
    const hits = castRay(map, kinds, from, { x: 0, y: -1 });
    expect(hits[0].kind).toBe('booth');
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i].distance).toBeGreaterThan(hits[i - 1].distance);
    }
    expect(hits.length).toBeGreaterThan(1);
  });

  it('stops at maxDistance', () => {
    expect(castRay(map, kinds, { x: 1.5, y: 7.5 }, { x: 1, y: 0 }, 0.4)).toEqual([]);
  });
});

describe('turning and moving', () => {
  it('faces up the avenue from the gate on the way in', () => {
    const pose = startingPose(map, undefined);
    expect(pose).toEqual({ ...map.spawn, angle: AVENUE_ANGLE });
    close(facing(pose.angle).x, 0);
    close(facing(pose.angle).y, -1);
  });

  it('turns right by adding to the angle, and wraps round', () => {
    close(turn(0, Math.PI / 2), Math.PI / 2);
    close(turn(Math.PI - 0.1, 0.2), -Math.PI + 0.1);
    close(turn(-Math.PI + 0.1, -0.2), Math.PI - 0.1);
    let angle = 0.3;
    for (let i = 0; i < 36; i++) angle = turn(angle, Math.PI / 18);
    close(angle, 0.3);
  });

  it('keeps right a quarter turn clockwise from forward', () => {
    for (const angle of [0, 1, -2, AVENUE_ANGLE]) {
      const r = rightOf(angle);
      const f = facing(turn(angle, Math.PI / 2));
      close(r.x, f.x);
      close(r.y, f.y);
    }
  });

  it('moves forward, back and sideways relative to the way the player faces', () => {
    const angle = AVENUE_ANGLE;
    const forward = moveDirection(angle, 1, 0);
    close(forward.x, 0);
    close(forward.y, -1);
    const back = moveDirection(angle, -1, 0);
    close(back.y, 1);
    const right = moveDirection(angle, 0, 1);
    close(right.x, 1);
    close(right.y, 0);
    const left = moveDirection(angle, 0, -1);
    close(left.x, -1);
    const diagonal = moveDirection(0, 1, 1);
    close(Math.hypot(diagonal.x, diagonal.y), 1);
    expect(moveDirection(1, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('walks at the isometric walking speed in the direction faced', () => {
    const player = createWalker({ x: map.avenueX + 1, y: map.height - 3 });
    const moved = stepPlayer(map, player, AVENUE_ANGLE, 1, 0, 0.1);
    close(moved, WALK_SPEED * 0.1);
    close(player.x, map.avenueX + 1);
    close(player.y, map.height - 3 - WALK_SPEED * 0.1);
  });

  it('strafes without changing where the player faces', () => {
    const player = createWalker({ x: map.avenueX + 1, y: map.height - 3 });
    stepPlayer(map, player, AVENUE_ANGLE, 0, 1, 0.1);
    close(player.x, map.avenueX + 1 + WALK_SPEED * 0.1);
    close(player.y, map.height - 3);
  });

  it('never walks through a blocked tile', () => {
    const booth = map.booths[1];
    const player = createWalker({ x: booth.x - 1, y: booth.y + 1 });
    for (let i = 0; i < 200; i++) stepPlayer(map, player, 0, 1, 0, 0.05);
    expect(player.x).toBeLessThanOrEqual(booth.x);
    expect(canStand(map, player.x, player.y)).toBe(true);

    const edge = createWalker({ x: 1.5, y: 7.5 });
    for (let i = 0; i < 200; i++) stepPlayer(map, edge, Math.PI, 1, 1, 0.05);
    expect(canStand(map, edge.x, edge.y)).toBe(true);
  });

  it('stands still with no input, and when turning on the spot', () => {
    const player = createWalker({ x: map.avenueX + 1, y: map.height - 3 });
    expect(stepPlayer(map, player, turn(0, 1), 0, 0, 0.1)).toBe(0);
    expect(player.walking).toBe(false);
  });
});

describe('switching views', () => {
  it('keeps the player on the same spot and heading', () => {
    saveSpot({ x: 7.25, y: 12.5 }, 1.2);
    expect(startingPose(map, savedSpot())).toEqual({ x: 7.25, y: 12.5, angle: 1.2 });
    // The isometric view saves only where the player stands; the heading stays.
    saveSpot({ x: 9.5, y: 13 });
    expect(savedSpot()).toEqual({ x: 9.5, y: 13, angle: 1.2 });
    expect(startingPose(map, savedSpot())).toEqual({ x: 9.5, y: 13, angle: 1.2 });
  });

  it('faces up the avenue when the isometric view is the only one used', () => {
    expect(startingPose(map, { x: 4, y: 5 })).toEqual({ x: 4, y: 5, angle: AVENUE_ANGLE });
  });
});

describe('updateBob', () => {
  const dt = 1 / 60;

  it('does not bob when standing still', () => {
    const bob = createBob();
    for (let i = 0; i < 60; i++) expect(updateBob(bob, 0, dt, false)).toBe(0);
  });

  it('does not bob when turning on the spot', () => {
    const player = createWalker({ x: map.avenueX + 1, y: map.height - 3 });
    const bob = createBob();
    let angle = 0;
    for (let i = 0; i < 120; i++) {
      angle = turn(angle, 0.05);
      expect(updateBob(bob, stepPlayer(map, player, angle, 0, 0, dt), dt, false)).toBe(0);
    }
  });

  it('bobs up and down while walking, and never above its cap', () => {
    const bob = createBob();
    const shifts: number[] = [];
    for (let i = 0; i < 240; i++) shifts.push(updateBob(bob, WALK_SPEED * dt, dt, false));
    expect(Math.max(...shifts)).toBeGreaterThan(BOB_CAP * 0.8);
    expect(Math.min(...shifts)).toBeLessThan(-BOB_CAP * 0.8);
    for (const s of shifts) expect(Math.abs(s)).toBeLessThanOrEqual(BOB_CAP);
    // Faster than walking still stays under the cap.
    for (let i = 0; i < 120; i++) {
      expect(Math.abs(updateBob(bob, WALK_SPEED * 3 * dt, dt, false))).toBeLessThanOrEqual(BOB_CAP);
    }
  });

  it('grows with walking speed', () => {
    const slow = createBob();
    const fast = createBob();
    for (let i = 0; i < 120; i++) {
      updateBob(slow, WALK_SPEED * 0.3 * dt, dt, false);
      updateBob(fast, WALK_SPEED * dt, dt, false);
    }
    expect(fast.amount).toBeGreaterThan(slow.amount * 2);
  });

  it('settles quickly when the player stops', () => {
    const bob = createBob();
    for (let i = 0; i < 120; i++) updateBob(bob, WALK_SPEED * dt, dt, false);
    for (let i = 0; i < 30; i++) updateBob(bob, 0, dt, false);
    expect(bob.amount).toBeLessThan(BOB_CAP * 0.01);
  });

  it('never bobs with reduced motion', () => {
    const bob = createBob();
    for (let i = 0; i < 240; i++) expect(updateBob(bob, WALK_SPEED * dt, dt, true)).toBe(0);
  });
});
