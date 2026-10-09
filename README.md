# Flow Free Solver

A free, open-source solver for Flow Free and Numberlink. Recreate a puzzle,
place its matching dots, and find a solution right in your browser.

Supports **Classic, walls, Bridges, and Warps**, with square or rectangular
boards from **5×5 to 15×15**. Solving runs locally on your device.

**[Try the solver](https://flow.kongesque.com/)** · [How it works](https://www.kongesque.com/blog/flow-free-solver)

<p align="center">
  <a href="./assets/demos/classic.gif"><img src="./assets/demos/classic.gif" width="360" alt="Classic: place matching dots and solve a 5×5 game puzzle" /></a>
  <a href="./assets/demos/walls.gif"><img src="./assets/demos/walls.gif" width="360" alt="Classic with walls: place dots and walls, then solve a Courtyard 7×7 puzzle" /></a>
</p>
<p align="center">
  <a href="./assets/demos/bridges.gif"><img src="./assets/demos/bridges.gif" width="360" alt="Bridges: add a horizontal bridge and solve both crossing lanes" /></a>
  <a href="./assets/demos/warps.gif"><img src="./assets/demos/warps.gif" width="360" alt="Warps: open opposite board edges and solve a game puzzle" /></a>
</p>

## Solve a puzzle

1. Choose a **Mode** and **Size**. For a rectangle, set **Width** and **Height** in **Board options**.
2. Select **Dots** and place two endpoints of each color. Tap a dot to remove it.
3. Add any walls, bridges, or warp openings using the matching tool.
4. Select **Solve** to see the paths. Select **Edit** to return to the same puzzle.

Use **Undo** to reverse an edit, **Cancel** to stop a running solve, or **Reset**
to clear the board. Each mode remembers its own puzzle on your device.

Want a puzzle to try? Select **Generate** in any supported mode. Generation is
disabled while walls are present.

### Editing tools

| Tool | How to use it |
| --- | --- |
| **Dots** | Tap an empty cell to place an endpoint. Place two dots of each color; tap an existing dot to remove it. |
| **Walls** | Tap or drag along internal grid lines to block movement between cells. Both neighboring cells still need to be filled. |
| **Bridges** | Tap an empty interior cell. Two different colors pass straight through the horizontal and vertical lanes; both lanes must be filled. The horizontal route goes over the vertical one. |
| **Warps** | Tap a row or column border to connect it to the opposite edge. Openings are optional routes, not required crossings. |

Every solution connects matching colors and fills the entire board. Paths can
cross only at bridges, where both lanes must be filled by different colors.

### Board options and keyboard controls

**Color label** adds letters to the dots. **Board guides** adds row numbers,
column letters, and a highlight to help you place pieces. Both are off by
default. With guides enabled on a phone, press, slide, and release to place a
dot or bridge. **Puzzle generator** shows or hides the Generate button.

Keyboard: use arrow keys to move, Enter or Space to place, and Shift + Arrow to
edit a wall or an outward warp edge while the corresponding tool is selected.
Ctrl/⌘ + Z undoes the last edit.

## Solvers and limits

**Heuristic BFS** is the default solver. Classic square boards without walls
also offer **A\*** and **SAT (Z3)** in Board options. Walls, rectangles, Bridges,
and Warps automatically use the C/WebAssembly solver.

| Solver | Implementation |
| --- | --- |
| **Heuristic BFS** | C compiled to WebAssembly, adapted from [Matt Zucker's flow_solver](https://github.com/mzucker/flow_solver). |
| **A\*** | Heuristic search written in TypeScript. |
| **SAT (Z3)** | Constraint solving with [Z3](https://github.com/Z3Prover/z3), compiled to WebAssembly. |

All solvers run in background Web Workers so the editor stays responsive.

The solvers return one complete solution. Difficult puzzles can reach a search
limit; solve times depend on the puzzle and device. Hexes, Shapes, and combined
Bridges + Warps boards are not supported.

Generated puzzles retain a validated solution, which is used if a solve reaches
its search limit. Editing the puzzle discards that solution. Generation does not
check uniqueness or certify difficulty.

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
| `npm run build` | Type-check and build the app. |
| `npm run preview` | Serve the production build locally. |
| `npm run build:wasm` | Compile native solver changes. |
| `npm run check` | Rebuild Wasm and run unit, native, and browser checks. |

Native builds and the full check require the Emscripten version in
`.emscripten-version`. Install the test browsers with
`npx playwright install chromium webkit`. After changing C, rebuild and commit
both generated C artifacts. Never edit generated Wasm glue by hand.

Z3 requires cross-origin isolation. Keep the COOP/COEP headers in
`vite.config.js` and `vercel.json` when changing hosting configuration.

## License

[MIT](./LICENSE), with an exception for the heuristic solver adapted from
[Matt Zucker's flow_solver](https://github.com/mzucker/flow_solver). The following
files, including the native topology helper, are covered by
[CC BY-NC 2.0](https://creativecommons.org/licenses/by-nc/2.0/):

- `native/flow_solver.c` and `native/topology_solver.h`
- `public/wasm/flow_solver_c.mjs` and `public/wasm/flow_solver_c.wasm`
- `src/solver/logic/heuristic-solver.ts`

Commercial use requires excluding this module or obtaining a separate license
from its original author.

Built by [Kongesque](https://www.kongesque.com/).
