import { BEAM_COUNT, beamAngle } from './disco';
import { palette } from './palette';

/**
 * The disco theme's drawing, shared by both views: stars, the mirror ball, its
 * beams and the wash of colour over the scene. Each one takes pixels in whatever
 * transform the caller has set.
 */

type Ctx = CanvasRenderingContext2D;

const STAR_COUNT = 70;
const BALL_ROWS = 8;
const BALL_COLUMNS = 12;

/** A repeatable number in [0, 1), so stars and mirrors stay put between frames. */
function scatter(n: number): number {
  const v = Math.sin(n * 127.1) * 43758.5453;
  return v - Math.floor(v);
}

/** Twinkling stars across a sky `w` wide and `h` tall. */
export function drawStars(ctx: Ctx, w: number, h: number, t: number, size = 1) {
  ctx.fillStyle = palette.white;
  for (let i = 0; i < STAR_COUNT; i++) {
    const s = (1 + Math.round(scatter(i + 200))) * size;
    ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.5 + scatter(i + 300)) + i));
    ctx.fillRect(scatter(i) * w, scatter(i + 100) * h, s, s);
  }
  ctx.globalAlpha = 1;
}

/** A mirror ball of radius `r` centred on (x, y), on a wire from `wireTop`. */
export function drawMirrorBall(ctx: Ctx, x: number, y: number, r: number, t: number, wireTop = 0) {
  ctx.strokeStyle = palette.metalShade;
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath();
  ctx.moveTo(x, wireTop);
  ctx.lineTo(x, y - r);
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = palette.metalShade;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);

  // Rows of mirrors, narrowing toward the poles and turning around the ball.
  const spin = t * 0.8;
  for (let row = 0; row < BALL_ROWS; row++) {
    const top = -Math.PI / 2 + (row / BALL_ROWS) * Math.PI;
    const bottom = top + Math.PI / BALL_ROWS;
    const y0 = y + Math.sin(top) * r;
    const y1 = y + Math.sin(bottom) * r;
    const across = Math.cos((top + bottom) / 2) * r;
    for (let col = 0; col < BALL_COLUMNS; col++) {
      const a0 = ((col + row / 2) / BALL_COLUMNS) * Math.PI * 2 + spin;
      const a1 = a0 + (Math.PI * 2) / BALL_COLUMNS;
      // Only the front half of the ball shows.
      if (Math.cos((a0 + a1) / 2) < 0) continue;
      const x0 = x + Math.sin(a0) * across;
      const x1 = x + Math.sin(a1) * across;
      const glint = scatter(row * BALL_COLUMNS + col);
      const lit = Math.sin(t * 3 + glint * 40) > 0.7;
      ctx.fillStyle = lit
        ? palette.white
        : palette.disco.lights[Math.floor(glint * palette.disco.lights.length)];
      ctx.globalAlpha = lit ? 1 : 0.55 + glint * 0.35;
      ctx.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0) * 0.9, (y1 - y0) * 0.88);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Coloured beams sweeping out from (x, y), reaching `length` and `width` wide at the far end. */
export function drawBeams(
  ctx: Ctx,
  x: number,
  y: number,
  length: number,
  width: number,
  t: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < BEAM_COUNT; i++) {
    const angle = beamAngle(i, t);
    const color = palette.disco.lights[i % palette.disco.lights.length];
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const glow = ctx.createLinearGradient(x, y, x + dx * length, y + dy * length);
    glow.addColorStop(0, `${color}66`);
    glow.addColorStop(1, `${color}00`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx * length - dy * width, y + dy * length + dx * width);
    ctx.lineTo(x + dx * length + dy * width, y + dy * length - dx * width);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Tints everything drawn so far in a rectangle: 'multiply' darkens it, as if the
 * sun has gone down, and 'lighter' adds a colour on top.
 */
export function drawWash(
  ctx: Ctx,
  color: string,
  left: number,
  top: number,
  width: number,
  height: number,
  blend: 'multiply' | 'lighter' = 'multiply',
) {
  ctx.save();
  ctx.globalCompositeOperation = blend;
  ctx.fillStyle = color;
  ctx.fillRect(left, top, width, height);
  ctx.restore();
}
