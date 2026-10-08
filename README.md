# Flow Free Solver

**Flow Free Solver** (also known as a **Number Link Solver**) is a high-performance web tool that **solves complex logic puzzles in milliseconds** locally in your browser. Built with **React** and **WebAssembly**, it uses advanced constraint solving algorithms (*Z3 Theorem Prover* and *A\**) to find solutions for square and rectangular grids with widths and heights from 5 to 15 without sending data to a server.

<p align="center">
  <img src="./assets/5x5_demo.gif" width="49%" alt="5x5 Demo" />
  <img src="./assets/14x14_demo.gif" width="49%" alt="14x14 Demo" />
</p>

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://flow.kongesque.com/)
[![React](https://img.shields.io/badge/React-19.3-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite)](https://vite.dev/)

### 🧩 What is Flow Free?
Flow Free (classically known as **Number Link**) is a logic puzzle where players must connect colored dots on a grid.
The rules seem simple, but the puzzle becomes exponentially harder as the grid size increases:
1.  **Connect Matching Colors**: Draw a pipe to pair every matching color (e.g., Red to Red).
2.  **No Crossings**: Pipes cannot cross or overlap each other.
3.  **Fill the Board**: **Critical!** You must occupy every single square on the grid. A solution is only valid if there are no empty spaces left.

While 5x5 grids are trivial, **15x15 grids** require finding a specific Hamiltonian-like path that satisfies global constraints, making it a classic NP-complete problem for computers.

Try it online: **[https://flow.kongesque.com](https://flow.kongesque.com)**

## 🔬 Algorithms Used

| Algorithm | Type | Description |
|-----------|------|-------------|
| [Z3 Theorem Prover](https://github.com/Z3Prover/z3) | SAT/SMT Solver | Microsoft Research's industrial-strength constraint solver, compiled to WebAssembly |
| [A* Search Algorithm](https://en.wikipedia.org/wiki/A*_search_algorithm) | Heuristic Search | Pathfinding with Manhattan distance heuristic and lookahead pruning |
| [Heuristic BFS](https://mzucker.github.io/2016/08/28/flow-solver.html) | Algorithm Search | Optimized C implementation of Breadth-First Search with domain-specific heuristics by [Matt Zucker](https://mzucker.github.io/), compiled to WebAssembly |

### 📊 Algorithm Comparison

| Algorithm | Implementation | Best For | Grid Size | Speed | Memory Usage |
|-----------|----------------|----------|-----------|-------|--------------|
| Heuristic BFS | C + WebAssembly | Real-time solving, interactive use | 5×5 - 14×14 | ⚡ Fastest | Low |
| SAT (Z3) | Z3 + WebAssembly | Guaranteed solutions, verification | 5×5 - 15×15 | 🐢 Slow | High |
| A* Search | Pure TypeScript | Learning, debugging, small puzzles | 5×5 - 10×10 | 🚶 Moderate | Medium |

## ✨ Key Features

- **Instant AI Solutions**: Solves complex Number Link puzzles in milliseconds using the Z3 SMT Solver (compiled to Wasm).
- **Interactive Editor**: Draw your own puzzles or test specific configurations on grids up to 15x15.
- **Puzzle Generator**: Create random solvable Standard, Bridges, and Warps puzzles from 5×5 to 15×15, including rectangular boards. Each generated puzzle retains a validated complete solution.
- **Multiple Algorithms**: Compare the performance of heuristic search (A*), constraint satisfaction (SAT), and optimized C BFS.

---

## 🎮 How to Use

1.  **Select Dimensions**: Choose a square **Grid Size** preset, or open **Board options** to set **Width** and **Height** independently from 5 to 15. Rectangular boards automatically select **Heuristic BFS**, the C/Wasm solver. A* and Z3 remain available for Standard square boards.
2.  **Generate a Puzzle**: Click **Generate** for a new solvable puzzle. If you have placed or edited endpoints, confirm before replacing them; Cancel keeps your board and current color. The puzzle and its generated solution are saved locally across reloads.
3.  **Paint the Board**: Alternatively, click an empty cell to place an endpoint, or click a filled cell to remove it. Editing a generated puzzle discards its saved solution.
    - With a keyboard, Tab enters the board, arrow keys move between cells, and Enter or Space places or removes a dot. Home and End move to the edges of a row.
    - *Tip*: You need exactly two dots of the same color to form a pair.
4.  **Click Solve**: The selected solver calculates non-overlapping paths. **Solve** becomes **Edit** after solving; click it to return to the original endpoints. Generated puzzles use their saved solution if the selected solver reaches its search limit. **Reset** asks for confirmation before clearing a puzzle or cancelling active solving or generation; Cancel preserves your current work. An empty, idle board resets immediately.

Generation runs in a dedicated Web Worker. It starts with a complete path cover
and randomly transfers cells between path endpoints while preserving full-board
coverage, connectivity, and path degree. Standard colors retain at least three cells.
The remaining endpoints therefore always have a valid solution. Puzzles may have
multiple solutions; the generator does not certify uniqueness or difficulty.
Warps shift a complete cover across board borders and open the seams its paths
use. Bridges construct independent crossing lanes, then transfer endpoint cells
through the topology graph; up to 16 pairs cover both lanes at every crossing.
Some large puzzles can exceed an independent solver's search budget. **Solve**
then displays the validated solution retained during construction.

The tool panel sits beside the board on desktop and below it on mobile. Mode and
Size stay visible above the primary actions. Compact Undo and Reset buttons sit
beside Board options, separated from Solve and Generate.
Solve becomes Cancel while working and Edit after solving, in the same position.
Dots/Walls and the active variant's tool are directly accessible during editing,
in one full-width tray with matching glyphs and a softly filled selected button. Selecting a tool keeps it selected; choose Dots
to return to endpoint placement. Editing tools stay visible when viewing a solution; selecting one returns to editing.
Board options start collapsed and contain custom dimensions, applicable solver
choices, and contextual bulk edits. Generate appears in all implemented modes; variants,
walls, and rectangles select the C/Wasm engine automatically. The board keeps its
size and position as tools change; on phones, the footer can scroll when browser
bars leave less room.

**Undo** reverses endpoint placement/removal, wall strokes, bridge/seam edits, and bulk changes in
order, restoring the endpoint color and placement state. **Ctrl+Z** or **⌘Z**
also works when focus is outside a form field. Up to 50 edits are retained for
each mode during the current session. Reset, resizing, successful generation, and reloading start
a fresh history for the affected draft. Undoing an edit does not restore a discarded generated solution.

---

## Board modes

**Standard**, **Bridges**, and **Warps** support square and rectangular boards from
5×5 through 15×15. **Hexes** remains unavailable. Each implemented mode has its
own locally saved draft and session Undo history. Switching modes restores its
dimensions, endpoints, and topology. Reset and confirmed resizing clear only the
active draft. Legacy square saves still load; an old variant placeholder's
endpoint puzzle becomes its Standard draft, with an empty variant draft.

In **Warps**, choose the **Warps** editing tool and tap the border of a row or
column to connect it to the opposite edge. Both matching border controls open or
close together and highlight together on focus/hover. Open **Board options** for **Open all left/right**,
**Open all top/bottom**, or **Clear warps** for bulk edits. With keyboard focus on
a boundary cell, **Shift + an outward Arrow** toggles that seam; regular arrows
move focus without wrapping. Available seams are optional route choices, and
solved paths show edge stubs rather than a line across the board.

In **Bridges**, choose **Bridges** and tap an empty interior cell to add or remove
a crossing. Its horizontal and vertical lanes remain straight, use different
colors, and both must be filled. Two continuous horizontal rails mark the overpass; the
vertical route passes underneath it. Orientation is fixed, so no selector or
rotation control is needed. **Clear bridges** in Board options is undoable.
Bridges cannot replace dots or touch a wall that blocks any of their four ports.
Solved crossings retain both rails and a raised deck separating the pipes.
Walls and warp openings use the same thin, neutral rails; warp openings have
straight dashed lines at both connected borders and highlight together on focus.

Variant solving uses the C/Wasm engine. **Generate** creates a new puzzle with
its mode's topology, replacing manual endpoints and crossings/seams only after
confirmation. Clear walls before generation. **Cancel** preserves the puzzle.
The graph search has a 2,000,000-visit / 10-second CPU budget; reaching it is
reported as a search limit, so difficult puzzles can remain unresolved. Mixed
Warps + Bridges boards and exact official-pack compatibility are outside this release.

See the [Warps and Bridges research and implementation plan](docs/flow-free-warps-bridges.md)
for rule evidence, the C/Wasm topology model, editor interactions,
delivery milestones, and regression criteria.

**Walls** can be added in all implemented modes. Choose the **Walls** tool,
then tap or drag along the lines between
cells to add or remove boundaries. Choose **Dots** to place endpoints again. Both
cells beside a wall still need to be filled. **Undo** reverses the last edit;
**Clear walls** appears in Board options when walls exist and is also undoable.
The board stays fitted to the available space in every mode.
With the keyboard, focus a cell and press **Shift +
Arrow** to toggle the wall on that side.

Wall puzzles automatically use **Heuristic BFS** (C/Wasm). **Generate** is disabled
until walls are cleared. Wall edits discard any retained generated solution;
walls and endpoints persist across reloads. **Edit** preserves walls and **Reset**
or changing dimensions clears them. See the [wall research and implementation record](docs/flow-free-walls.md)
for the data model, solver design, fixtures, and verification results.

Rectangular and variant solving use the C/Wasm backend only. The generator
remains TypeScript in a dedicated worker; it constructs solutions without search.
Worker requests carry the mode and reject unsupported algorithms and unavailable
modes instead of silently applying Standard rules. Generated ordered paths and
topology survive reload and mode switching; endpoint/topology edits discard the
retained solution. See [issue #2](https://github.com/kongesque/flow-free-solver/issues/2).

## 🧠 Technical Architecture

This project is a showcase of bringing competitive programming algorithms to the client-side web.

### Method 1: Z3 SAT Solver
We treat the puzzle as a **Constraint Satisfaction Problem (CSP)**. By compiling the Microsoft Z3 Theorem Prover to WebAssembly, we can run industrial-strength logic solving directly in the browser without a backend.
- **Constraint 1**: Every cell must have a color or be empty (initially).
- **Constraint 2**: Every color endpoint has exactly one neighbor of the same color.
- **Constraint 3**: Every path cell has exactly two neighbors of the same color (flow conservation).

### Method 2: Heuristic Search (A*)
A traditional graph search approach:
- **Path Construction**: BFS explores potential routes.
- **Heuristics**: A* estimates the remaining distance (Manhattan distance) to guide the search.
- **Pruning**: `lookaheadHeuristics` discard invalid states early (e.g., if a color gets trapped).

### Method 3: Heuristic BFS
An optimized solver (based on [Matt Zucker's flow_solver](https://mzucker.github.io/2016/08/28/flow-solver.html)) written in C and compiled to WebAssembly. It achieves extreme performance through advanced pruning techniques:

-   **Active Color Selection**: At each step, it only moves the "most constrained" color (the one with the fewest valid moves), drastically reducing the search tree size.
-   **Dead-End & Stranding Checks**: It immediately discards states where a color is cut off from its goal or a region of the board becomes unreachable (using connected component labeling).
-   **Forced Moves & Fast-Forwarding**: If a color has only one valid move, it is taken automatically (zero cost). Chains of forced moves are "fast-forwarded" without clogging the search queue.
-   **Chokepoint Detection**: It identifies narrow passages that would inevitably block other colors, pruning those branches early.

---

## 🚀 Local Development

### Prerequisites

- Node.js 24 LTS (see `.nvmrc`) and npm.
- Emscripten for editing and compiling C. CI uses the version in `.emscripten-version`.
- Chromium for browser tests: `npx playwright install chromium`.

### Select Node.js 24 on macOS

If you already use Homebrew, no additional version manager is required:

```bash
brew install node@24
export PATH="$(brew --prefix node@24)/bin:$PATH"
node --version # Should print v24.x.x
```

The `export` selects Node 24 for the current terminal. Run it in new terminals as
needed. `.nvmrc` records the project's preferred version for tools that read it;
it does not install `nvm` or change your shell automatically. Homebrew installs
[`node@24`](https://formulae.brew.sh/formula/node%4024) alongside other Node versions.

### Web development

```bash
npm ci
npm run dev
```

The compiled C artifacts are checked in, so web-only development and production
builds do not need Emscripten. Installation and web builds synchronize Z3 and the
cross-origin isolation service worker from the installed dependency versions.

### Edit C and rebuild Wasm

Install [Emscripten's SDK](https://emscripten.org/docs/getting_started/downloads.html)
once (or use your existing `emcc` installation):

```bash
git clone https://github.com/emscripten-core/emsdk.git .emsdk
./.emsdk/emsdk install "$(cat .emscripten-version)"
./.emsdk/emsdk activate "$(cat .emscripten-version)"
source .emsdk/emsdk_env.sh
```

Edit `native/flow_solver.c`, then run:

```bash
npm run build:wasm
npm run test:wasm
npm run dev
```

The build script generates **both** `public/wasm/flow_solver_c.mjs` and
`public/wasm/flow_solver_c.wasm`. Commit both files with C changes. Never edit the
generated JavaScript by hand. Set `EMCC=/path/to/emcc` if the compiler is outside
`PATH`. The build uses the active Node executable for Emscripten as well; set
`EM_NODE_JS` only if you need a different compiler runtime. Compilation failures
return a nonzero exit code and retain the previous artifacts. See [native/README.md](native/README.md) for flags and the C API.

For automatic compilation, run `npm run watch:wasm` in one terminal and
`npm run dev` in another. Refresh the page after a rebuild to load the new module;
Vite does not hot-reload runtime imports from `public/`.

### Project layout

```text
native/                 Editable C solver
reference/              Historical Python implementations
scripts/                C compilation and runtime asset synchronization
src/app/                App shell, entry point, styles
src/solver/components/  Puzzle editor and controls
src/solver/logic/       TypeScript solvers and C bridge
src/solver/workers/     Background solving
src/hooks/              IndexedDB persistence
public/wasm/            Generated and upstream runtime artifacts
tests/fixtures/         Puzzle corpus and independent solution validation
tests/wasm/             Compiled C regression tests
tests/e2e/              Real browser, worker, and Wasm checks
```

### Commands and verification

| Command | Description |
|---------|-------------|
| `npm run dev` / `npm start` | Start the development server |
| `npm run build:wasm` | Compile C into the browser's Wasm module |
| `npm run watch:wasm` | Recompile when native sources change |
| `npm run sync:wasm` | Copy matching installed Z3/runtime assets |
| `npm run build` | Type-check and build the web app using existing C artifacts |
| `npm run build:all` | Rebuild C, type-check, and build the web app |
| `npm run preview` | Serve the production build with COOP/COEP headers |
| `npm test` | Run TypeScript/React unit tests |
| `npm run test:wasm` | Recompile C and run its full puzzle regression suite |
| `npm run test:e2e` | Test the existing production build in Chromium |
| `npm run check` | Compile C, run tests, type-check, build, and test the browser |

```bash
npx playwright install chromium
npm run check
E2E_SERVER=dev npm run test:e2e
VITE_BASE_PATH=/flow-free-solver/ npm run build
VITE_BASE_PATH=/flow-free-solver/ npm run test:e2e
npm run build # Restore the default root-hosted build
```

Browser tests solve a puzzle with each of C/Wasm, A*, and Z3 in real workers,
validate the resulting paths, reset the grid, cancel active solving, check input
validation, and verify IndexedDB persistence. C tests cover every fixture, 15×15 grids, malformed input,
and repeated calls. CI runs these checks for production, development, and subpath
hosting. Z3 uses shared memory and requires cross-origin isolation; preserve the
COOP/COEP headers in `vite.config.js` and `vercel.json`.

Generator tests independently validate 330 square and 330 rectangular Standard
boards, plus 726 seeded variant covers across all supported dimension pairs.
Browser tests generate and independently solve through real workers, solve
generated puzzles with all three algorithms, and check reload, editing,
cancellation, worker failure recovery, mobile controls, rectangular C/Wasm solving,
legacy saves, and separate mode drafts. Variant tests validate ordered paths
independently, including required seams, independent bridge lanes, adjacent
crossings, and a 15×15 board with 169 bridges (394 occupied nodes). An exhaustive
small-board oracle checks wrapped graphs without relying on planar pruning.

---

## 🌐 Live Deployment

**[Flow Free Solver Live Demo](https://flow.kongesque.com/)**

---

## 📄 License


This project is open source under the [MIT License](LICENSE).

**Exception:** The "Heuristic BFS" solver module is based on [flow_solver](https://github.com/mzucker/flow_solver) by Matt Zucker and is licensed under **[CC BY-NC 2.0](https://creativecommons.org/licenses/by-nc/2.0/)**. This exception explicitly applies to:
- `native/flow_solver.c`
- `public/wasm/flow_solver_c.mjs`
- `public/wasm/flow_solver_c.wasm`
- The integration logic in `src/solver/logic/heuristic-solver.ts`

If you use this project for commercial purposes, you must exclude the Heuristic BFS solver module or obtain a separate license from the original author.

Created by **[Kongesque](https://www.kongesque.com/)**.

Board options includes **Color label**, an optional switch that shows letters A–P (starting with red). It is off by default. The display preference is remembered on this device and applies to endpoints in the editor and solved board.

The component picker sits above Solve. **Puzzle generator** is on by default; its Board options switch controls Generate and remembers your choice on this device. Warp bulk-opening actions appear above the display switches. Remove individual walls, bridges, and warps on the board, or use Undo/Reset.

The component picker stays visible after solving. Selecting a tool returns to the editor with the same puzzle.

Switching modes cancels active solving or generation and restores that mode's draft. Display switches remain available while working. Worker startup, request, and response failures release the busy state so you can retry without refreshing; invalid results leave the current puzzle intact. Interrupted saved-state reads retry once, and screen resizing cancels unfinished wall strokes.
