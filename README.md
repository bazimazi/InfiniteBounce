# Infinite Bounce

A physics endless runner about steering a bouncing ball. Momentum is the game: speed buys distance and score, and it also costs you the landing.

## Play

```bash
npm install
npm run dev
```

Open the local URL Vite prints. `npm test` checks that the same seed rebuilds the same road and that a safe route stays survivable. `npm run build` typechecks and writes `dist/`.

## Controls

- **A / D** or arrows steer. **S** brakes. **Space** dashes along your steer. Hold **W** while dashing to pop upward.
- Drag on the ground to lean. A gamepad uses the left stick, the south button to dash, and the west button for a gravity pulse.
- **F** flips gravity once that pulse is learned.
- **Esc** pauses. **F3** shows chunk names. **F8** lets a pilot drive the safe route.
- Open the page with `?demo` to start a piloted run straight away, handy for checking visual changes.

The low road is always a possible landing. Gold trim is optional.

## What persists

Runs, echoes, cores, modules, trails, challenges, and a personal-best ghost are stored in this browser under `infinite-bounce-v1`. Notes in Settings stay on the device.

## Progression

- **Pilot rank.** Every run earns XP for distance, perfects, walls, enemies, near misses, flow, and fragments. Harder paces and mutators pay more. Each rank pays a small echo purse. Milestone ranks open daily contracts (2), the tuning bench (5 and 10), the third module slot (8), and rank-only trails.
- **Challenges** come in tiers (Horizon I–V and so on). Each tier pays echoes and XP, and the next tier opens right away.
- **Daily contracts.** Three single-run tasks, dealt from the date so everyone gets the same hand that day, with goals that scale with rank. Clearing all three pays a bonus, and clearing on consecutive days builds a streak.
- **Core mastery.** Distance travelled with a core raises its mastery, up to level 5. Each level adds 4% to the echoes that core earns.
- **Module tuning.** Owned modules can be raised to Mk II and Mk III. Tuning scales a module's upside only; its drawback stays the same.

Tuning numbers live in `src/content/progression.ts`, and the rules live in `src/game/progress.ts`. Saves from before ranks existed are migrated on load: paid challenge tiers stay paid, and past play is converted to XP.

## Layout

- `src/sim` is the deterministic simulation: fixed 120 Hz step, seeded chunks, fairness checks.
- `src/content` holds tuning, biomes, and the catalogs a new core or hazard should extend.
- `src/game`, `src/render`, `src/audio`, `src/ui`, and `src/input` are presentation. They never decide whether a landing was fair.
