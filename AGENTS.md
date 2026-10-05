# Project instructions

## Layout

- `native/flow_solver.c`: source of the heuristic C solver.
- `scripts/`: reproducible Wasm compilation and installed runtime asset synchronization.
- `src/app/`: React entry point, app shell, and styles.
- `src/solver/components/`: puzzle editor and solver controls.
- `src/solver/logic/`: solver implementations and C/JavaScript board conversion.
- `src/solver/workers/`: background solver message handling.
- `src/hooks/`: IndexedDB puzzle persistence.
- `public/wasm/`: generated C artifacts and synchronized upstream Z3 runtime assets.
- `tests/fixtures/`: shared puzzles and an independent solution validator.
- `tests/wasm/`: tests against the actual compiled C module.
- `tests/e2e/`: browser tests using real Web Workers and Wasm.
- `reference/`: historical Python algorithms, outside the web build.

## Development

Use Node.js 24 LTS (`.nvmrc`) and npm. Use `npm ci` for reproducible installs; update
`package-lock.json` with intentional dependency changes. The project uses ESM,
React, TypeScript, Vite, and Tailwind's Vite plugin. Do not restore CRA configuration.

Read `README.md` before changing the Wasm build. CI pins Emscripten to the version
in `.emscripten-version`. The `EMCC` environment variable can select a compiler.
The build defaults `EM_NODE_JS` to the active Node executable and respects an
explicit override; keep Emscripten aligned with the selected project runtime.
Compile C edits with `npm run build:wasm`; use `npm run watch:wasm` during native
development. Never hand-edit generated `flow_solver_c.mjs` or `.wasm` files.
Commit both generated C artifacts with native changes so web-only installs work
without Emscripten. Z3 assets must come from the installed `z3-solver` package via
`npm run sync:wasm`, keeping its glue and binary versions matched.

Boards in TypeScript use `[x][y]` (column-major); the C API accepts text rows and
returns row-major ASCII color codes. Keep conversions in `heuristic-solver.ts`.
Load public Wasm assets using `import.meta.env.BASE_URL`. Do not import `public/`
through relative source paths. Keep expensive solving inside workers. Z3 requires
cross-origin isolation: retain COOP/COEP headers for development, preview, and hosting.

## Verification and commits

Run `npm run check` before finishing implementation changes. It recompiles C,
checks its puzzle corpus, runs unit tests and TypeScript checks, builds the web
app, and runs Chromium tests against that production build. Install Chromium with
`npx playwright install chromium` if missing. For worker or asset path changes,
also test development and a subpath build as documented in `README.md`.
Check `npm audit` after dependency updates.

Browser tests should exercise real workers and modules. Validate full-board
coverage, preserved endpoints, path degree, and connectivity; a non-null result
alone is insufficient. Add focused regression cases for fixes.

Use the user-requested feature branch and make focused commits at working
milestones. Do not commit caches, `node_modules/`, build output, or browser traces.
Preserve the heuristic solver's Matt Zucker attribution and CC BY-NC 2.0 exception.
