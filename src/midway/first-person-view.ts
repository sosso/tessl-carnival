import { palette } from './palette';
import { label } from './render';
import {
  BOB_CAP,
  castRay,
  createBob,
  EYE_HEIGHT,
  facing,
  MOUSE_TURN,
  NAME_DISTANCE,
  rightOf,
  SPRITE_PROPS,
  startingPose,
  stepPlayer,
  TURN_SPEED,
  turn,
  updateBob,
  WALL_HEIGHT,
  wallKinds,
  type RayHit,
  type WallKind,
} from './first-person';
import type { MidwayOptions } from './midway';
import { savedSpot, saveSpot } from './spot';
import {
  boothInReach,
  createVisitors,
  createWalker,
  distanceToRect,
  layoutMidway,
  strollTiles,
  updateVisitor,
  type BoothSlot,
  type Point,
  type PropKind,
} from './world';

/**
 * The first-person view of the midway: a raycaster on a plain 2D canvas. The
 * logic lives in `first-person.ts`; this file handles input and drawing.
 */

const FORWARD_KEYS: Record<string, number> = { KeyW: 1, ArrowUp: 1, KeyS: -1, ArrowDown: -1 };
const STRAFE_KEYS: Record<string, number> = { KeyD: 1, KeyA: -1 };
const TURN_KEYS: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
const PLAY_KEYS = new Set(['KeyE', 'Enter', 'Space']);
/** Half the field of view is atan of this: about 66 degrees across. */
const PLANE = 0.66;
/** CSS pixels per ray at full quality. */
const COLUMN_PX = 2;
const MIN_QUALITY = 0.35;
const FOG_DISTANCE = 26;

interface Face {
  a: string;
  b: string;
  aShade: string;
  bShade: string;
  /** Stripes per tile along the face. */
  stripes: number;
}

const FACES: Record<WallKind, Face> = {
  edge: {
    a: palette.hedge,
    b: palette.hedgeLight,
    aShade: palette.hedgeDark,
    bShade: palette.hedge,
    stripes: 3,
  },
  stall: {
    a: palette.woodLight,
    b: palette.board,
    aShade: palette.wood,
    bShade: palette.woodDark,
    stripes: 4,
  },
  booth: {
    a: palette.red,
    b: palette.cream,
    aShade: palette.redShade,
    bShade: palette.creamShade,
    stripes: 4,
  },
  tent: {
    a: palette.blue,
    b: palette.cream,
    aShade: palette.blueShade,
    bShade: palette.creamShade,
    stripes: 4,
  },
  'big-top': {
    a: palette.red,
    b: palette.gold,
    aShade: palette.redShade,
    bShade: palette.goldShade,
    stripes: 3,
  },
  ride: {
    a: palette.metal,
    b: palette.pink,
    aShade: palette.metalShade,
    bShade: palette.pinkShade,
    stripes: 2,
  },
};

const SPRITE_SIZE: Partial<Record<PropKind, { w: number; h: number }>> = {
  bench: { w: 0.8, h: 0.35 },
  planter: { w: 0.7, h: 0.55 },
  balloons: { w: 0.7, h: 1.4 },
  'bunting-pole': { w: 0.12, h: 1.6 },
};

interface Sprite extends Point {
  kind: PropKind | 'visitor';
  look: number;
  w: number;
  h: number;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function startFirstPerson(
  canvas: HTMLCanvasElement,
  options: MidwayOptions,
): { stop(): void } {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');

  const map = layoutMidway(options.games.map((g) => g.id));
  const names = new Map(options.games.map((g) => [g.id, g.name]));
  const kinds = wallKinds(map);
  const pose = startingPose(map, savedSpot());
  const player = createWalker(pose);
  let angle = pose.angle;
  const bob = createBob();
  const strolls = strollTiles(map);
  const visitors = createVisitors(map, 9, Math.random);
  const props: Sprite[] = map.props
    .filter((prop) => SPRITE_PROPS.includes(prop.kind))
    .map((prop) => ({
      kind: prop.kind,
      x: prop.x + prop.w / 2,
      y: prop.y + prop.h / 2,
      look: prop.variant,
      ...SPRITE_SIZE[prop.kind]!,
    }));
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let inReach: BoothSlot | undefined;

  const floor = document.createElement('canvas');
  const floorCtx = floor.getContext('2d')!;
  let floorImage: ImageData | undefined;
  const grass = [rgb(palette.grass), rgb(palette.grassLight)];
  const path = [rgb(palette.path), rgb(palette.pathShade)];
  const fog = rgb(palette.sky);

  let dpr = 1;
  /** Drops below 1 on machines too slow to keep up, casting fewer rays. */
  let quality = 1;
  let slowFrames = 0;
  let columns = 1;

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    columns = Math.max(40, Math.round((canvas.clientWidth / COLUMN_PX) * quality));
    floorImage = undefined;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const play = (booth: BoothSlot | undefined) => {
    if (!booth?.gameId) return;
    saveSpot(player, angle);
    options.onPlay(booth.gameId);
  };

  const keys = new Set<string>();
  const isControl = (target: EventTarget | null) =>
    target instanceof HTMLElement && target.closest('a, button, input, textarea, select') !== null;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const code = event.code;
    if (code in FORWARD_KEYS || code in STRAFE_KEYS || code in TURN_KEYS) {
      keys.add(code);
      event.preventDefault();
    } else if (PLAY_KEYS.has(code) && !isControl(event.target) && inReach?.gameId) {
      event.preventDefault();
      play(inReach);
    }
  };
  const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
  const onBlur = () => keys.clear();

  // Clicking captures the mouse for turning. It never walks the player anywhere.
  const onPointerDown = () => {
    if (document.pointerLockElement === canvas) return;
    try {
      Promise.resolve(canvas.requestPointerLock()).catch(() => {});
    } catch {
      // The browser said no: the keyboard still turns.
    }
  };
  const onMouseMove = (event: MouseEvent) => {
    if (document.pointerLockElement === canvas) angle = turn(angle, event.movementX * MOUSE_TURN);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('mousemove', onMouseMove);

  /** Paints the ground below the horizon, a few pixels per ray, into `floor`. */
  const drawFloor = (horizon: number, focal: number, scale: number) => {
    const w = columns;
    const h = Math.max(1, Math.ceil((canvas.height - horizon) / scale));
    if (!floorImage || floorImage.width !== w || floorImage.height !== h) {
      floor.width = w;
      floor.height = h;
      floorImage = floorCtx.createImageData(w, h);
    }
    const data = floorImage.data;
    const dir = facing(angle);
    const right = rightOf(angle);
    const left = { x: dir.x - right.x * PLANE, y: dir.y - right.y * PLANE };
    const across = { x: right.x * PLANE * 2, y: right.y * PLANE * 2 };
    let i = 0;
    for (let row = 0; row < h; row++) {
      const below = (row + 0.5) * scale;
      const distance = (EYE_HEIGHT * focal) / below;
      const haze = Math.min(1, distance / FOG_DISTANCE) * 0.6;
      for (let col = 0; col < w; col++) {
        const s = (col + 0.5) / w;
        const fx = player.x + distance * (left.x + across.x * s);
        const fy = player.y + distance * (left.y + across.y * s);
        const tx = Math.floor(fx);
        const ty = Math.floor(fy);
        const inside = tx >= 0 && ty >= 0 && tx < map.width && ty < map.height;
        const shades = inside && map.ground[ty * map.width + tx] === 'path' ? path : grass;
        const c = shades[(tx + ty) & 1];
        data[i++] = c[0] + (fog[0] - c[0]) * haze;
        data[i++] = c[1] + (fog[1] - c[1]) * haze;
        data[i++] = c[2] + (fog[2] - c[2]) * haze;
        data[i++] = 255;
      }
    }
    floorCtx.putImageData(floorImage, 0, 0);
  };

  const drawWall = (hit: RayHit, x: number, w: number, horizon: number, focal: number) => {
    const face = FACES[hit.kind];
    const scale = focal / hit.distance;
    const top = horizon - (WALL_HEIGHT[hit.kind] - EYE_HEIGHT) * scale;
    const bottom = horizon + EYE_HEIGHT * scale;
    const stripe = Math.floor(hit.u * face.stripes) % 2 === 0;
    const main = stripe ? (hit.side ? face.aShade : face.a) : hit.side ? face.bShade : face.b;
    ctx.fillStyle = main;
    ctx.fillRect(x, top, w, bottom - top);
    if (hit.kind === 'booth') {
      // A wooden counter under the striped awning, with a gold trim between.
      const counter = horizon + (EYE_HEIGHT - 0.8) * scale;
      ctx.fillStyle = hit.side ? palette.woodDark : palette.wood;
      ctx.fillRect(x, counter, w, bottom - counter);
      ctx.fillStyle = hit.side ? palette.goldShade : palette.gold;
      ctx.fillRect(x, counter - 0.08 * scale, w, 0.08 * scale);
    }
    const haze = Math.min(1, hit.distance / FOG_DISTANCE) * 0.6;
    if (haze > 0.02) {
      ctx.globalAlpha = haze;
      ctx.fillStyle = palette.sky;
      ctx.fillRect(x, top, w, bottom - top);
      ctx.globalAlpha = 1;
    }
    return top;
  };

  const drawSprite = (sprite: Sprite, cx: number, ground: number, scale: number) => {
    const w = sprite.w * scale;
    const h = sprite.h * scale;
    const left = cx - w / 2;
    const top = ground - h;
    switch (sprite.kind) {
      case 'visitor': {
        const n = sprite.look;
        ctx.fillStyle = palette.pants[n % palette.pants.length];
        ctx.fillRect(left + w * 0.2, top + h * 0.6, w * 0.6, h * 0.4);
        ctx.fillStyle = palette.shirts[(n * 2 + 1) % palette.shirts.length];
        ctx.fillRect(left + w * 0.1, top + h * 0.28, w * 0.8, h * 0.36);
        ctx.fillStyle = palette.skins[n % palette.skins.length];
        ctx.beginPath();
        ctx.arc(cx, top + h * 0.15, w * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.hairs[(n * 3 + 1) % palette.hairs.length];
        ctx.beginPath();
        ctx.arc(cx, top + h * 0.12, w * 0.33, Math.PI, Math.PI * 2);
        ctx.fill();
        return;
      }
      case 'bench':
        ctx.fillStyle = palette.woodDark;
        ctx.fillRect(left + w * 0.08, top + h * 0.5, w * 0.1, h * 0.5);
        ctx.fillRect(left + w * 0.82, top + h * 0.5, w * 0.1, h * 0.5);
        ctx.fillStyle = palette.wood;
        ctx.fillRect(left, top, w, h * 0.55);
        return;
      case 'planter':
        ctx.fillStyle = palette.hedge;
        ctx.beginPath();
        ctx.arc(cx, top + h * 0.35, w * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = palette.woodLight;
        ctx.fillRect(left + w * 0.15, top + h * 0.5, w * 0.7, h * 0.5);
        return;
      case 'balloons':
        ctx.fillStyle = palette.metalShade;
        ctx.fillRect(cx - w * 0.02, top + h * 0.35, w * 0.04, h * 0.65);
        palette.balloons.forEach((color, k) => {
          const a = (k / palette.balloons.length) * Math.PI * 2;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.ellipse(
            cx + Math.cos(a) * w * 0.25,
            top + h * 0.2 + Math.sin(a) * h * 0.1,
            w * 0.18,
            h * 0.12,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        });
        return;
      default:
        ctx.fillStyle = palette.woodLight;
        ctx.fillRect(left, top, w, h);
        ctx.fillStyle = palette.gold;
        ctx.beginPath();
        ctx.arc(cx, top, w * 1.2, 0, Math.PI * 2);
        ctx.fill();
    }
  };

  const draw = (bobShift: number) => {
    const W = canvas.width;
    const H = canvas.height;
    const horizon = Math.round(H / 2 + bobShift * H);
    const focal = W / 2 / PLANE;
    const colW = W / columns;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, palette.skyHigh);
    sky.addColorStop(1, palette.sky);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon + 1);
    drawFloor(horizon, focal, colW);
    ctx.drawImage(floor, 0, horizon, W, floor.height * colW);

    // Walls, far to near in each column, so nearer walls cover farther ones.
    const dir = facing(angle);
    const right = rightOf(angle);
    const occlusion: { distance: number; top: number }[][] = [];
    for (let col = 0; col < columns; col++) {
      const s = (2 * (col + 0.5)) / columns - 1;
      const ray = { x: dir.x + right.x * PLANE * s, y: dir.y + right.y * PLANE * s };
      const hits = castRay(map, kinds, player, ray);
      const x = Math.floor(col * colW);
      const w = Math.floor((col + 1) * colW) - x;
      const tops: { distance: number; top: number }[] = [];
      for (let k = hits.length - 1; k >= 0; k--) {
        tops.push({ distance: hits[k].distance, top: drawWall(hits[k], x, w, horizon, focal) });
      }
      occlusion.push(tops);
    }

    // Visitors and small props face the camera, far to near, behind any wall in front.
    const sprites: (Sprite & { depth: number; across: number })[] = [];
    for (const sprite of [
      ...props,
      ...visitors.map((v) => ({
        kind: 'visitor' as const,
        x: v.x,
        y: v.y,
        look: v.look,
        w: 0.45,
        h: 0.85,
      })),
    ]) {
      const dx = sprite.x - player.x;
      const dy = sprite.y - player.y;
      const depth = dx * dir.x + dy * dir.y;
      if (depth < 0.2) continue;
      sprites.push({ ...sprite, depth, across: dx * right.x + dy * right.y });
    }
    sprites.sort((a, b) => b.depth - a.depth);
    for (const sprite of sprites) {
      const scale = focal / sprite.depth;
      const cx = W / 2 + (sprite.across / PLANE / sprite.depth) * (W / 2);
      const half = Math.max(sprite.w, 0.4) * scale;
      const first = Math.max(0, Math.floor((cx - half) / colW));
      const last = Math.min(columns - 1, Math.floor((cx + half) / colW));
      if (first > last) continue;
      ctx.save();
      ctx.beginPath();
      let any = false;
      for (let col = first; col <= last; col++) {
        let limit = H;
        for (const t of occlusion[col])
          if (t.distance < sprite.depth) limit = Math.min(limit, t.top);
        if (limit <= 0) continue;
        ctx.rect(Math.floor(col * colW), 0, Math.ceil(colW) + 1, limit);
        any = true;
      }
      if (any) {
        ctx.clip();
        drawSprite(sprite, cx, horizon + EYE_HEIGHT * scale, scale);
      }
      ctx.restore();
    }

    // The names of booths close enough to read.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const booth of map.booths) {
      if (distanceToRect(player, booth) > NAME_DISTANCE) continue;
      const dx = booth.x + booth.w / 2 - player.x;
      const dy = booth.y + booth.h / 2 - player.y;
      const depth = dx * dir.x + dy * dir.y;
      if (depth < 0.3) continue;
      const across = dx * right.x + dy * right.y;
      const cx = W / 2 + (across / PLANE / depth) * (W / 2);
      if (cx < 0 || cx > W) continue;
      const top = horizon - (WALL_HEIGHT.booth - EYE_HEIGHT + 0.25) * (focal / depth);
      const name = booth.gameId ? (names.get(booth.gameId) ?? booth.gameId) : 'Coming soon';
      label(ctx, name, cx / dpr, Math.max(24, top / dpr));
      if (booth === inReach && booth.gameId) {
        label(ctx, 'Press E to play', cx / dpr, Math.max(24, top / dpr) + 40);
      }
    }
  };

  let frame = 0;
  let last = performance.now();
  const loop = (time: number) => {
    const elapsed = (time - last) / 1000;
    const dt = Math.min(elapsed, 0.05);
    last = time;

    // If frames keep taking longer than 1/40 s, cast fewer rays. Long gaps
    // (a background tab, a resize) don't count.
    if (elapsed < 0.25)
      slowFrames = elapsed > 1 / 40 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 90 && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality * 0.75);
      slowFrames = 0;
      resize();
    }

    let forward = 0;
    let strafe = 0;
    let turning = 0;
    for (const code of keys) {
      forward += FORWARD_KEYS[code] ?? 0;
      strafe += STRAFE_KEYS[code] ?? 0;
      turning += TURN_KEYS[code] ?? 0;
    }
    angle = turn(angle, Math.sign(turning) * TURN_SPEED * dt);
    const moved = stepPlayer(map, player, angle, Math.sign(forward), Math.sign(strafe), dt);

    for (const visitor of visitors) updateVisitor(map, visitor, dt, Math.random, strolls);

    const reach = boothInReach(map, player);
    if (reach !== inReach) {
      inReach = reach;
      options.onReach(reach);
    }

    draw(Math.min(BOB_CAP, updateBob(bob, moved, dt, calm)));
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);

  return {
    stop() {
      saveSpot(player, angle);
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('mousemove', onMouseMove);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    },
  };
}
