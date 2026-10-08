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
- **Puzzle Generator**: Create random solvable puzzles from 5×5 to 15×15, with one color pair per initial row or column. Reveal or hide the complete solution, or independently solve the generated endpoints with any solver.
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
coverage, connectivity, and path degree. Each color retains at least three cells.
The remaining endpoints therefore always have a valid solution. Puzzles may have
multiple solutions; the generator does not certify uniqueness or difficulty.
Some large puzzles can exceed an independent solver's search budget. **Show
solution** always reveals the solution retained during construction.

The tool panel sits beside the board on desktop and below it on mobile. Size,
Undo, Solve, Generate, and Reset stay visible. Solve becomes Edit in the same
position. Board options start collapsed on both layouts and contain dimensions,
algorithm, mode, and a single Draw walls toggle. Wall tools appear only while
drawing walls. The board keeps its size and position as tools change; on phones,
the footer can scroll when browser bars leave less room.

**Undo** reverses endpoint placement/removal, wall strokes, and Clear walls in
order, restoring the endpoint color and placement state. **Ctrl+Z** or **⌘Z**
also works when focus is outside a form field. Up to 50 edits are retained for
the current session. Reset, resizing, successful generation, and reloading start
a fresh history. Undoing an edit does not restore a discarded generated solution.

---

## Board modes

**Standard** supports square and rectangular boards. **Bridges**, **Hexes**, and
**Warps** are selectable placeholders marked **coming soon**. Puzzle actions are
disabled in these modes; switching back to Standard preserves the current puzzle.
Mode, dimensions, endpoints, and the generated solution are saved locally. Legacy
square saves with a single size continue to load.

**Walls** can be added to Standard square or rectangular boards. Open **Board
options** and turn on **Draw walls**, then tap or drag along the lines between
cells to add or remove boundaries. Turn it off to place endpoints again. Both
cells beside a wall still need to be filled. **Undo** reverses the last edit;
**Clear walls** appears when walls exist and is also undoable. **Zoom in** is
available on mobile and for large desktop boards. Swipe from a cell center to
pan the enlarged board. With the keyboard, focus a cell and press **Shift +
Arrow** to toggle the wall on that side.

Wall puzzles automatically use **Heuristic BFS** (C/Wasm). **Generate** is disabled
until walls are cleared. Wall edits discard any retained generated solution;
walls and endpoints persist across reloads. **Edit** preserves walls and **Reset**
or changing dimensions clears them. See the [wall research and implementation record](docs/flow-free-walls.md)
for the data model, solver design, fixtures, and verification results.

Rectangular and future variant solving use the C/Wasm backend only. The generator
remains TypeScript in a dedicated worker; it constructs solutions without search.
Worker requests carry the mode and reject unavailable variants, so future bridge,
hex, and warp rules cannot silently run as a Standard puzzle. See [issue #2](https://github.com/kongesque/flow-free-solver/issues/2).

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

Generator tests independently validate 330 square and 330 rectangular seeded boards
across every supported dimension combination. Browser tests generate, independently solve, and reveal every size through real workers, solve
generated puzzles with all three algorithms, and check reload, editing,
cancellation, worker failure recovery, mobile controls, rectangular C/Wasm solving,
legacy saves, and safe future-mode switching.

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
