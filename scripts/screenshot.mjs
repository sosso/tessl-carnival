#!/usr/bin/env node
// Builds the carnival and saves a PNG of the midway and of every game, plus any
// extra pictures a plan asks for. It also reports errors the pages log.
//
// Usage: node scripts/screenshot.mjs <output folder> [plan.json]
//
// A plan is a JSON list of extra pictures. Each one needs a name, and can have a
// route, steps to run first, and a clip to crop to, in pixels of a 1280x800 page:
//
//   [
//     { "name": "sky", "clip": { "x": 0, "y": 0, "width": 1280, "height": 200 } },
//     {
//       "name": "after-walking",
//       "steps": [{ "hold": "ArrowUp", "ms": 800 }, { "press": "KeyE" }, { "wait": 500 }]
//     },
//     { "name": "a-game", "route": "#/play/water-cannon", "steps": [{ "click": [640, 400] }] }
//   ]
//
// Exit codes: 0 all good, 1 no usable pictures, 2 pictures saved but a page logged
// an error. Playwright isn't a dependency of the carnival: the cloud setup script
// installs playwright-core outside the repository, and it drives the installed
// Chrome. Set CAPTURE_TOOLS to use a copy somewhere else.

import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import process from 'node:process';

const VIEWPORT = { width: 1280, height: 800 };
const SETTLE_MS = 2000;
const PAGE_TIMEOUT_MS = 20_000;
const TOTAL_TIMEOUT_MS = 180_000;
const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function loadPlaywright() {
  const tools = process.env.CAPTURE_TOOLS ?? join(homedir(), '.local/share/carnival-capture');
  try {
    return createRequire(join(tools, 'package.json'))('playwright-core');
  } catch {
    return fail(`Playwright isn't installed: no playwright-core under ${tools}`);
  }
}

function readPlan(path) {
  if (!path) return [];
  let plan;
  try {
    plan = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return fail(`Can't read the plan ${path}: ${error.message}`);
  }
  if (!Array.isArray(plan)) fail('A plan must be a JSON list of pictures');
  for (const shot of plan) {
    // Names become file names, so they can't be allowed to leave the output folder.
    if (!/^[a-z0-9-]+$/.test(shot.name ?? '')) {
      fail(`A picture's name must use only a-z, 0-9 and -, not "${shot.name}"`);
    }
    for (const step of shot.steps ?? []) {
      if (!['press', 'hold', 'click', 'wait'].some((kind) => kind in step)) {
        fail(`Unknown step in "${shot.name}": ${JSON.stringify(step)}`);
      }
    }
  }
  return plan;
}

function defaultShots() {
  const games = readdirSync('src/games', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, route: `#/play/${entry.name}` }));
  return [{ name: 'midway' }, ...games];
}

function serve(root) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    });
    createReadStream(file).pipe(response);
  });
  // Port 0 asks for a free port, so this can't end up talking to another service.
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

async function runStep(page, step) {
  if ('press' in step) await page.keyboard.press(step.press);
  if ('hold' in step) {
    await page.keyboard.down(step.hold);
    await page.waitForTimeout(step.ms ?? 500);
    await page.keyboard.up(step.hold);
  }
  if ('click' in step) await page.mouse.click(step.click[0], step.click[1]);
  if ('wait' in step) await page.waitForTimeout(step.wait);
}

async function capture(browser, origin, out, shot, pageErrors) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_TIMEOUT_MS);
    page.on('pageerror', (error) => pageErrors.push(`${shot.name}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(`${shot.name}: ${message.text()}`);
    });
    await page.goto(`${origin}/${shot.route ?? ''}`);
    await page.waitForTimeout(SETTLE_MS);
    for (const step of shot.steps ?? []) await runStep(page, step);
    const path = join(out, `${shot.name}.png`);
    rmSync(path, { force: true });
    await page.screenshot({ path, clip: shot.clip, timeout: PAGE_TIMEOUT_MS });
    console.log(path);
  } finally {
    // A hung page can stop this from returning, and the picture is already saved.
    await Promise.race([
      context.close().catch(() => {}),
      new Promise((done) => setTimeout(done, 5000)),
    ]);
  }
}

async function main() {
  const [outArg, planPath] = process.argv.slice(2);
  if (!outArg) fail('Usage: node scripts/screenshot.mjs <output folder> [plan.json]');
  const out = resolve(outArg);
  const shots = [...defaultShots(), ...readPlan(planPath)];
  const { chromium } = loadPlaywright();

  // A hung browser must never hold up the run that called this. Exiting closes
  // the browser too, because Playwright kills what it launched when Node exits.
  setTimeout(() => fail(`Capture took over ${TOTAL_TIMEOUT_MS / 1000} seconds`), TOTAL_TIMEOUT_MS);

  const work = mkdtempSync(join(tmpdir(), 'carnival-capture-'));
  process.on('exit', () => rmSync(work, { recursive: true, force: true }));
  mkdirSync(out, { recursive: true });

  const site = join(work, 'site');
  const build = spawnSync(
    'npx',
    ['vite', 'build', '--outDir', site, '--emptyOutDir', '--base', '/', '--logLevel', 'warn'],
    { stdio: 'inherit', timeout: 120_000 },
  );
  if (build.status !== 0) fail('The site did not build');

  const server = await serve(site);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }),
    args: ['--no-sandbox', '--disable-gpu'],
    timeout: PAGE_TIMEOUT_MS,
  });

  const pageErrors = [];
  for (const shot of shots) await capture(browser, origin, out, shot, pageErrors);

  if (pageErrors.length > 0) {
    console.error('Pages logged errors:');
    for (const error of pageErrors) console.error(`- ${error}`);
    process.exit(2);
  }
  process.exit(0);
}

main().catch((error) => fail(`Capture failed: ${error.message}`));
