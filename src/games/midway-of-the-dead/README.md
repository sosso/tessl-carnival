# Midway of the Dead

Zombies are shambling down the midway. Type the word above each one before it
reaches you.

## How to play

- Zombies appear at the far end of the midway and walk towards you, growing
  larger as they get closer. Each one carries a word.
- Type a zombie's first letter to lock on to it. The letters you've typed so far
  turn gold, and every letter after that goes to the locked zombie until its
  word is finished, which defeats it.
- No two zombies on screen share a first letter, so a letter never has two
  possible targets.
- A letter that doesn't match is a miss. A miss doesn't drop the lock.
- A zombie that reaches you costs one of your three lives. If you were locked
  on to it, the lock clears.
- The game comes in waves. Later waves have longer words, faster zombies and
  more of them at once.
- The round ends when your lives run out. Press Enter to play again.
- Only the letter keys count. Key repeat and keys pressed with Ctrl, Alt or
  Cmd are ignored, so browser shortcuts are never misses.

## Scoring

- Each defeated zombie scores 10 points per letter in its word, times the
  current combo.
- The combo starts at 1. It goes up by 1 for each zombie you defeat with no
  misses since the last defeat, and goes back to 1 on a miss.

For example, defeating `cat` and then `zombie` with no misses scores 30 x 1 and
then 60 x 2, for 150 points.

Your final score is saved to the carnival's score board when the round ends.

## Files

- `game.ts`: the game logic (`createState`, `typeLetter`, `step`,
  `spawnZombie`, `pickWord`, `waveFor`, `scoreFor`) and the `midwayOfTheDead`
  entry, the default export the midway finds.
- `words.ts`: the word list, lowercase a to z only.
- `game.test.ts`: tests for the game logic.
