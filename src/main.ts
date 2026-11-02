import './style.css';
import { applyTheme, bestScore, type CarnivalGame } from './carnival';
import { registry } from './games';
import { isDisco, toggleDisco } from './midway/disco';
import { startFirstPerson } from './midway/first-person-view';
import { startMidway } from './midway/midway';
import type { BoothSlot } from './midway/world';
import { carnivalLink, REPO_URL, shareLinks } from './share';

applyTheme();

const app = document.querySelector<HTMLElement>('#app')!;
let stop: (() => void) | undefined;

type MidwayView = 'isometric' | 'first-person';
const VIEW_ROUTES: Record<MidwayView, string> = {
  isometric: '#/',
  'first-person': '#/first-person',
};
/** The view the player last walked the midway in, so a game's back link returns there. */
let lastView: MidwayView = 'isometric';

function bestText(game: CarnivalGame): string {
  const best = bestScore(game.id);
  return best === undefined ? 'No scores yet' : `Best: ${best}`;
}

const HELP: Record<MidwayView, string> = {
  isometric: `
    <kbd>WASD</kbd> or <kbd>arrows</kbd> to walk, or click where you want to go.
    <kbd>E</kbd> to play. <kbd>V</kbd> for first person. <kbd>B</kbd> for disco.`,
  'first-person': `
    <kbd>W</kbd> <kbd>S</kbd> to walk, <kbd>A</kbd> <kbd>D</kbd> to step sideways,
    <kbd>←</kbd> <kbd>→</kbd> to turn. Click to turn with the mouse, <kbd>Esc</kbd> to let go.
    <kbd>E</kbd> to play. <kbd>V</kbd> for the map. <kbd>B</kbd> for disco.`,
};

function renderMidway(view: MidwayView) {
  lastView = view;
  const other: MidwayView = view === 'isometric' ? 'first-person' : 'isometric';
  document.body.dataset.view = 'midway';
  app.innerHTML = `
    <section class="midway" data-midway-view="${view}">
      <canvas class="midway-map" aria-label="The carnival midway. Walk up to a booth to play its game."></canvas>
      <p class="midway-help">${HELP[view]}</p>
      <a class="view-switch" href="${VIEW_ROUTES[other]}">${
        other === 'first-person' ? 'First person' : 'Map view'
      }</a>
      <button class="disco-switch" type="button">Disco</button>
      <p class="midway-credit">
        Built with
        <a href="https://tessl.io/?utm_source=carnival&amp;utm_medium=midway-credit&amp;utm_campaign=tessl-carnival" target="_blank" rel="noopener">Tessl</a>
        at
        <a href="https://tessl.io/devcon?utm_source=carnival&amp;utm_medium=midway-credit&amp;utm_campaign=tessl-carnival" target="_blank" rel="noopener">AI DevCon NYC</a>
        <span class="midway-links">
          <a href="${REPO_URL}" target="_blank" rel="noopener">Build your own</a>
          <span class="midway-share" hidden>
            · Share on
            <a class="share-x" target="_blank" rel="noopener">X</a>
            or
            <a class="share-linkedin" target="_blank" rel="noopener">LinkedIn</a>
          </span>
        </span>
      </p>
      <nav class="midway-guide" aria-label="Booths">
        <h2>Booths</h2>
        <ul></ul>
      </nav>
      <div class="booth-card" aria-live="polite" hidden>
        <h2></h2>
        <p class="description"></p>
        <p class="best"></p>
        <a class="play">Play</a>
      </div>
    </section>`;

  const link = carnivalLink(location.href);
  if (link) {
    const share = shareLinks(link);
    app.querySelector<HTMLAnchorElement>('.share-x')!.href = share.x;
    app.querySelector<HTMLAnchorElement>('.share-linkedin')!.href = share.linkedIn;
    app.querySelector<HTMLElement>('.midway-share')!.hidden = false;
  }

  const guide = app.querySelector('.midway-guide ul')!;
  for (const game of registry.all()) {
    const item = document.createElement('li');
    item.innerHTML = `<a href="#/play/${game.id}"><span class="name"></span> <span class="best"></span></a>`;
    item.querySelector('.name')!.textContent = game.name;
    item.querySelector('.best')!.textContent = bestText(game);
    guide.append(item);
  }

  const card = app.querySelector<HTMLElement>('.booth-card')!;
  const showBooth = (booth: BoothSlot | undefined) => {
    const game = booth?.gameId ? registry.get(booth.gameId) : undefined;
    card.hidden = booth === undefined;
    card.classList.toggle('closed', booth !== undefined && !game);
    card.querySelector('h2')!.textContent = game?.name ?? 'Coming soon';
    card.querySelector('.description')!.textContent =
      game?.description ?? 'This booth is waiting for a game. Build one and it opens here.';
    card.querySelector('.best')!.textContent = game ? bestText(game) : '';
    const link = card.querySelector<HTMLAnchorElement>('.play')!;
    link.hidden = !game;
    if (game) link.href = `#/play/${game.id}`;
  };

  const options = {
    games: registry.all(),
    onPlay: (gameId: string) => (location.hash = `#/play/${gameId}`),
    onReach: showBooth,
  };
  const canvas = app.querySelector('canvas')!;
  const midway =
    view === 'first-person' ? startFirstPerson(canvas, options) : startMidway(canvas, options);

  const discoSwitch = app.querySelector<HTMLButtonElement>('.disco-switch')!;
  const showDisco = () => discoSwitch.setAttribute('aria-pressed', String(isDisco()));
  showDisco();
  discoSwitch.addEventListener('click', () => {
    toggleDisco();
    showDisco();
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'KeyV' && event.code !== 'KeyB') return;
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select'))
      return;
    event.preventDefault();
    if (event.code === 'KeyV') {
      location.hash = VIEW_ROUTES[other];
    } else {
      toggleDisco();
      showDisco();
    }
  };
  window.addEventListener('keydown', onKeyDown);
  stop = () => {
    window.removeEventListener('keydown', onKeyDown);
    midway.stop();
  };
}

function renderGame(game: CarnivalGame) {
  document.body.dataset.view = 'game';
  app.innerHTML = `
    <section class="game">
      <div class="game-header">
        <a href="${VIEW_ROUTES[lastView]}">← Back to the midway</a>
        <h1></h1>
      </div>
      <canvas></canvas>
    </section>`;
  app.querySelector('h1')!.textContent = game.name;
  stop = game.start(app.querySelector('canvas')!);
}

function route() {
  stop?.();
  stop = undefined;

  const match = location.hash.match(/^#\/play\/([\w-]+)$/);
  const game = match ? registry.get(match[1]) : undefined;
  if (game) renderGame(game);
  else renderMidway(location.hash === VIEW_ROUTES['first-person'] ? 'first-person' : 'isometric');
}

window.addEventListener('hashchange', route);
route();
