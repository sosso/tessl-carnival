---
name: review-carnival-house-rules
description: Review a change to a carnival game for the house rules that keep every booth on the midway alike, registering through its folder's default export, reporting scores through the shared scores module, and drawing with the carnival's theme. Use as one lens in a code review run on changes under src/games/.
---

# Review lens: Carnival House Rules

Review changes to the games under `src/games/` against house rules 1 to 3 in the root `AGENTS.md`, for a game that drifts from what every other booth on the midway shares.

## Scope

- **Registration** Whether each game's `src/games/<game-id>/game.ts` has its `CarnivalGame` as the default export, and whether that game's `id` matches its folder name.
- **Scores** Whether a game reports a finished round through `recordScore` from `src/carnival`, once per round, rather than reading or writing local storage itself or keeping its own high score table.
- **Theme** Whether a game takes its colours, fonts and sizes from `theme` and `canvasFont` in `src/carnival/theme.ts`, rather than writing its own colour or font values.

## Method

Read house rules 1 to 3 in the root `AGENTS.md` before the diff, since they are the standard this lens holds a game to.

Start at each changed `game.ts` and work outward to the files in the same game folder that it draws or scores through. For a new value passed to the canvas, trace it back: a value read from `theme`, or computed from one, follows the rule wherever it ends up. For a round ending, trace each path that ends one, and check it reaches `recordScore` once and only once.

`src/games/index.ts` throws when a `game.ts` has no default export, or exports a game whose `id` differs from its folder, and `src/games/index.test.ts` fails on both. Read it to state what a broken registration does to the midway, rather than guessing.

## Threshold

Report a game that breaks one of these three rules in the code the change adds or alters.

Do not report:

- Code outside `src/games/`. `src/carnival/` defines the theme and the scores module, and `src/midway/palette.ts` keeps its own scenery colours on purpose.
- A value derived from the theme, such as a size computed from `theme.canvas` or a colour picked from `theme.colors`.
- Test data in `game.test.ts`, which describes inputs rather than drawing anything.
- Anything lint, the type-checker or the test suite already enforces, such as a malformed `CarnivalGame` shape.
- Another lens's subject: a game logic bug belongs to `review-correctness-and-data-integrity`, and naming or structure to `review-maintainability-and-code-quality`.

## Reporting

- Name the rule, the game, and the line that breaks it.
- State the consequence as the code has it. A `game.ts` with no default export, or with an `id` that differs from its folder, makes `src/games/index.ts` throw when the midway loads, so no game opens and `npm run check` fails. A score kept outside `recordScore` never shows as the best score on its booth card. A colour or font of the game's own makes its booth stop matching the rest when the theme changes.
- State the fix: the default export or `id` to change, the `recordScore(game.id, score)` call to make, or the `theme` or `canvasFont` value to use instead.
