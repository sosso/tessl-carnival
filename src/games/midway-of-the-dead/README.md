# Midway of the Dead

Zombies are coming down the midway, fast. Type the word above each one before
it reaches you.

## How to play

- Zombies appear at the far end of the midway and walk towards you, growing
  larger as they get closer. Each one carries a word.
- Type a zombie's first letter to lock on to it. The letters you've typed so far
  turn gold, and every letter after that goes to the locked zombie until its
  word is finished, which defeats it.
- No two zombies on screen share a first letter, so a letter never has two
  possible targets.
- A letter that doesn't match is a miss. A miss doesn't drop the lock.
- A zombie that reaches you costs lives: one for most types, two for a brute.
  You have three. If you were locked on to it, the lock clears.
- The game comes in waves, with a one second break between them. Later waves
  have longer words, faster zombies and more of them at once, up to ten on
  screen.

## Enemy types

Each wave mixes several types, all on screen together. Each one has its own
shape, so you can tell them apart even at the far end of the midway.

| Type     | Looks like                    | Speed            | Word length       | Reaching you costs | Points |
| -------- | ----------------------------- | ---------------- | ----------------- | ------------------ | ------ |
| Shambler | Arms out, swaying             | The wave's speed | The wave's        | 1 life             | x1     |
| Runner   | Small, leaning into a sprint  | 1.8x             | 3 to 5 letters    | 1 life             | x2     |
| Brute    | Huge and square, stomping     | 0.6x             | 9 letters or more | 2 lives            | x2     |
| Ghost    | A floating, see-through sheet | The wave's speed | The wave's        | 1 life             | x2     |

- Wave 1 has shamblers and runners. Brutes join in wave 2, and ghosts from
  wave 3.
- A brute is slow, but ignoring it is a trap: it takes two lives.
- A ghost's word fades out and back in over about two seconds. It's fully
  readable for at least half of that, and the letters you've already typed stay
  visible.
- Each zombie's word always fits its type's length. If no word fits, for
  example because every long word starts with a letter already on screen, the
  zombie waits and appears as soon as one does.
- The round ends when your lives run out. Press Enter to play again.
- Only the letter keys count. Key repeat and keys pressed with Ctrl, Alt or
  Cmd are ignored, so browser shortcuts are never misses.

## Scoring

- Each defeated zombie scores 10 points per letter in its word, times the
  current combo, times its type's points: x1 for a shambler, x2 for a runner,
  brute or ghost.
- The combo starts at 1. It goes up by 1 for each zombie you defeat with no
  misses since the last defeat, and goes back to 1 on a miss.

For example, defeating a shambler with `cat` and then a ghost with `zombie`,
with no misses, scores 30 x 1 x 1 and then 60 x 2 x 2, for 270 points.

Your final score is saved to the carnival's score board when the round ends.

## Files

- `game.ts`: the enemy types table (`ENEMY_TYPES`), the game logic
  (`createState`, `typeLetter`, `step`, `spawnZombie`, `pickKind`, `pickWord`,
  `wordLimits`, `waveFor`, `scoreFor`, `ghostAlpha`) and the `midwayOfTheDead`
  entry, the default export the midway finds.
- `words.ts`: the word list, lowercase a to z only.
- `game.test.ts`: tests for the game logic.
