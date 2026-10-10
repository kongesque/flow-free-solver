# Flow Free Solver

> **Connect matching dots. Fill every playable cell. Solve in your browser.**

An open-source **Flow Free and Numberlink puzzle solver** for desktop and
mobile. Recreate a puzzle or generate a new one, then find a complete solution
locally on your device.

**[Open the solver →](https://flow.kongesque.com/)** ·
[How it works](https://www.kongesque.com/blog/flow-free-solver) ·
[Development](#local-development)

## Supported puzzles

| Mode | What it supports |
| --- | --- |
| **Classic / Numberlink** | Connect matching endpoints with paths that fill the board. |
| **Classic with walls** | Add barriers between neighboring cells, including Courtyard layouts. |
| **Bridges** | Cross two different colors at an overpass. |
| **Warps** | Connect paths through openings on opposite board edges. |

- **5×5 to 19×19 boards**, with independent width and height for rectangles.
- **Blocks in every mode** for missing corners, interior holes, and irregular shapes.
- **Local solving in Web Workers**, keeping the editor responsive.
- **Puzzle generation, undo, and saved boards** for each mode on your device.

## See it in action

<table width="100%">
  <tr>
    <td align="center" width="50%">
      <a href="./assets/demos/classic.gif"><img src="./assets/demos/classic.gif" width="100%" alt="Solving a 5×5 Classic Flow Free puzzle" /></a><br />
      <strong>Classic</strong>
    </td>
    <td align="center" width="50%">
      <a href="./assets/demos/walls.gif"><img src="./assets/demos/walls.gif" width="100%" alt="Solving a 7×7 Courtyard puzzle with walls" /></a><br />
      <strong>Classic with walls</strong>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <a href="./assets/demos/bridges.gif"><img src="./assets/demos/bridges.gif" width="100%" alt="Solving a Bridges puzzle with two paths crossing at an overpass" /></a><br />
      <strong>Bridges</strong>
    </td>
    <td align="center" width="50%">
      <a href="./assets/demos/warps.gif"><img src="./assets/demos/warps.gif" width="100%" alt="Solving a Warps puzzle through opposite board edges" /></a><br />
      <strong>Warps</strong>
    </td>
  </tr>
</table>

## How to solve a Flow Free puzzle

1. Choose a **Mode** and **Size**. For a rectangle, set **Width** and **Height** in **Board options**.
2. Select **Dots** and place two endpoints of each color.
3. Recreate any walls, blocks, bridges, or warp openings with the matching tool.
4. Select **Solve** to reveal the paths, then **Edit** to return to your puzzle.

Use **Undo** to reverse an edit, **Cancel** to stop solving, and **Reset** to clear
the board. Each mode saves its own puzzle on your device.

### Editor tools

| Tool | How to use it |
| --- | --- |
| **Dots** | Select an empty cell to place a dot, or an existing dot to remove it. |
| **Walls** | Tap or drag along an internal grid line to block movement between neighboring cells. |
| **Blocks** | Select an empty cell to make it unused; select it again to restore it. Available in every mode. |
| **Bridges** | Select an empty interior cell to add a crossing. The horizontal path passes over the vertical path. |
| **Warps** | Select a row or column border to connect it to the opposite edge. Paths may use these openings. |

Every solution preserves the endpoints, connects matching colors, and fills
every playable cell. Paths cross only at bridges, where both lanes must be
filled by different colors.

Blocks stay empty and cannot contain dots or crossing lanes. Remove a dot or
bridge before blocking its cell; bridges need four playable neighbors. Blocking
a warp border closes that opening. Undo restores the cell and opening together.

### Board options and keyboard controls

| Option | Purpose |
| --- | --- |
| **Color label** | Add letters to the dots. Off by default. |
| **Board guides** | Show column letters, row numbers, and a placement highlight. Off by default. On mobile, enable guides to press, slide, and release a dot or bridge. |
| **Puzzle generator** | Show or hide the Generate button. |
| **Solver Algorithm** | Choose an available solver for the current board. |

**Keyboard:** arrow keys move between cells; Enter or Space places the selected
item. With Walls or Warps selected, Shift + Arrow edits a wall or an outward warp
edge. Ctrl/⌘ + Z undoes the last edit.

## Generate a solvable puzzle

Select **Generate** to create a puzzle in any supported mode. Remove existing
walls and blocks first: generation does not preserve custom layouts with unused
cells.

Each generated puzzle has a validated full-board solution. The number of pairs
is random within the board's color limit, capped at 16. Bridges puzzles use 1–3
spaced crossings. Generation does not check uniqueness or certify difficulty.

## How the solvers work

| Solver | Available boards | Implementation |
| --- | --- | --- |
| **Pruned DFS** · default | Classic, walls, Bridges, and Warps; square or rectangular | C compiled to WebAssembly, adapted from [Matt Zucker's flow_solver](https://github.com/mzucker/flow_solver), with an independent diagonal search inspired by [Thomas Ahle's Numberlink](https://github.com/thomasahle/numberlink). |
| **Z3 SAT** · exact solver | Classic, walls, Bridges, and Warps; square or rectangular | Constraint solving with [Z3](https://github.com/Z3Prover/z3), compiled to WebAssembly. |
| **A\*** | Classic square boards without walls | Heuristic search written in TypeScript. |

All available solvers support **Blocks** on their supported board types and run
in background Web Workers.

For classic boards without walls or blocks, Pruned DFS first tries a bounded
diagonal edge search inspired by [Thomas Ahle's Numberlink algorithm](https://github.com/thomasahle/numberlink#how-it-works).
Our independent C implementation tracks partial-path components and prunes
cycles, mismatched endpoints, and self-touching paths before extending them.
If this probe fails or reaches its budget, the existing heuristic search runs.
Walls, blocks, Bridges, and Warps continue to use their existing searches.

Manually entered puzzles automatically try SAT if heuristic search reaches its
limit. SAT checks playable-cell coverage, path connectivity, walls, crossing
lanes, and warp openings. A timeout preserves the editable puzzle.

For Bridges and Warps, SAT spends up to five seconds looking for paths without
self-touching contacts, then tries the general path model within the same
30-second budget if needed. The status shows **Solving with SAT…** during
automatic fallback; completed results show the usual status and elapsed time.

Generated puzzles retain their validated solution for use if a solve reaches
its search limit. When SAT is selected, Z3 verifies that solution against its
full constraints. Editing the puzzle discards the retained solution.

The solvers return one complete solution when they find one. Manually entered
puzzles can be unsolvable or reach a search limit; solve times depend on the
puzzle and device. Hexes and combined Bridges + Warps boards are not supported.

## Local development

Use **Node.js 24 LTS** and npm:

```sh
npm ci
npm run dev
```

Built with React, TypeScript, Vite, and WebAssembly. Compiled Wasm assets are
checked in, so web development does not require Emscripten.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run build` | Type-check and build the app. |
| `npm run preview` | Serve the production build locally. |
| `npm run build:wasm` | Compile native solver changes. |
| `npm run watch:wasm` | Recompile when native source files change. |
| `npm run sync:wasm` | Copy matched Z3 runtime assets from the installed package. |
| `npm run check` | Rebuild Wasm and run unit, native, and browser checks. |

### Native solver and runtime assets

Native builds and the full check require the Emscripten version in
`.emscripten-version`. Install the test browsers with:

```sh
npx playwright install chromium webkit
```

After changing C, run `npm run build:wasm` and include both generated C artifacts
with the source change. Never edit generated Wasm glue by hand. Use
`npm run sync:wasm` to keep Z3's glue and binary matched to the installed
`z3-solver` package.

To compare search performance, preserve a baseline copy of both C Wasm assets,
then run `node scripts/benchmark-wasm.mjs /path/to/baseline/flow_solver_c.mjs --output=/tmp/benchmark.json`.
It performs one warmup and five measured rounds, validates every returned cover,
and records per-puzzle medians without worker startup, SAT fallback, or cached
generated solutions. `scripts/stress-wasm.mjs` adds large generated boards and a
per-search watchdog (see its command-line options).
See [the recorded diagonal-search comparison](./BENCHMARKS.md) for measured
search and production-worker timings.

TypeScript boards use `[x][y]` (column-major). The C API takes text rows and
returns row-major ASCII color codes; conversions belong in
`src/solver/logic/heuristic-solver.ts`.

Native puzzle text uses `.` for a playable empty cell and `#` for a block.
Classic results contain zero at blocks; variant paths never include them. Native
cell IDs remain row-major, including unused slots, followed by bridge lanes.

### Verification and hosting

Run `npm run check` before finishing implementation changes. For worker or asset
changes, also verify development and subpath hosting:

```sh
E2E_SERVER=dev npm run test:e2e
VITE_BASE_PATH=/flow-free-solver/ npm run build
VITE_BASE_PATH=/flow-free-solver/ npm run test:e2e
```

Load public Wasm assets using `import.meta.env.BASE_URL`. Z3 requires
cross-origin isolation: keep the COOP/COEP headers in `vite.config.js` and
`vercel.json` when changing hosting configuration.

## License

[MIT](./LICENSE), with an exception for the heuristic solver adapted from
[Matt Zucker's flow_solver](https://github.com/mzucker/flow_solver). The following
files, including the native topology helper, are covered by
[CC BY-NC 2.0](https://creativecommons.org/licenses/by-nc/2.0/):

- `native/flow_solver.c`, `native/diagonal_solver.h`, and `native/topology_solver.h`
- `public/wasm/flow_solver_c.mjs` and `public/wasm/flow_solver_c.wasm`
- `src/solver/logic/heuristic-solver.ts`

Commercial use requires excluding this module or obtaining a separate license
from its original author.

Built by [Kongesque](https://www.kongesque.com/).
