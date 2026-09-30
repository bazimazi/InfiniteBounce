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

## Layout

- `src/sim` is the deterministic simulation: fixed 120 Hz step, seeded chunks, fairness checks.
- `src/content` holds tuning, biomes, and the catalogs a new core or hazard should extend.
- `src/game`, `src/render`, `src/audio`, `src/ui`, and `src/input` are presentation. They never decide whether a landing was fair.
