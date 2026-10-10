# Flow Free Solver

An open-source **Flow Free and Numberlink puzzle solver** for your browser.
Recreate a board, place matching dots, and find paths that fill every playable cell.

Solve **Classic, Classic with walls, Bridges, and Warps** puzzles on square or
rectangular boards from **5×5 to 19×19**. All solving runs locally on your device,
on desktop or mobile.

Use **Blocks** in any supported mode to mark unused cells anywhere in the board,
including missing corners, interior holes, and irregular shapes.

**[Open Flow Free Solver](https://flow.kongesque.com/)** · [How the solver works](https://www.kongesque.com/blog/flow-free-solver)

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

## How to solve a puzzle

1. Choose a **Mode** and **Size**. For a rectangle, set **Width** and **Height** in **Board options**.
2. Select **Dots** and place two endpoints of each color.
3. Add any walls, blocks, bridges, or warp openings using the matching tool.
4. Select **Solve** to see the paths. Select **Edit** to return to the same puzzle.

Use **Undo** to reverse an edit, **Cancel** to stop solving, or **Reset** to clear
the board. Each mode saves its own puzzle on your device.

Select **Generate** to create a puzzle in any supported mode. Remove existing
walls and blocks before generating a new puzzle. Generation does not preserve
custom layouts with unused cells.

Every board size generates a random number of pairs within its color limit,
capped at 16. Bridges puzzles use 1–3 spaced crossings.
Every generated puzzle has a validated full-board solution.

### Editor tools

| Tool | How to use it |
| --- | --- |
| **Dots** | Select an empty cell to place a dot. Select an existing dot to remove it. |
| **Walls** | Tap or drag along an internal grid line to block movement between neighboring cells. |
| **Blocks** | Select an empty cell to make it unused. Select it again to restore it. Available in every mode. |
| **Bridges** | Select an empty interior cell to add a crossing. The horizontal path passes over the vertical path. |
| **Warps** | Select a row or column border to connect it to the opposite edge. Paths may use these openings. |

Every solution connects matching colors and fills every playable cell. Blocks
stay empty and cannot contain dots or crossing lanes. Remove a dot or bridge
before blocking its cell; bridges need four playable neighbors. Blocking a warp
border closes that opening. Undo restores the cell and opening together. Paths can
cross only at bridges, where both lanes must be filled by different colors.

### Board options

- **Color label** adds letters to the dots. Off by default.
- **Board guides** adds column letters, row numbers, and a placement highlight.
  Off by default. On mobile, enable guides to press, slide, and release a dot or bridge.
- **Puzzle generator** shows or hides the Generate button.

**Keyboard:** use arrow keys to move, Enter or Space to place, and Shift + Arrow to
edit a wall or an outward warp edge while the corresponding tool is selected.
Ctrl/⌘ + Z undoes the last edit.

## Solver algorithms

**Heuristic BFS** is the default solver. **Z3 SAT (exact solver)** is available in Board
options for Classic, walls, Bridges, and Warps on square or rectangular boards
from 5×5 to 19×19. **A\*** is available for Classic square boards without walls.
All available algorithms support Blocks on their supported board types.

Manually entered puzzles automatically try SAT if heuristic search reaches its
limit. SAT checks playable-cell coverage, path connectivity, walls, crossing lanes, and warp openings;
a search timeout preserves the editable puzzle.
The status changes to **Solving with SAT…** only while automatic SAT fallback is
running. Finished results show the usual status and time, with no solver badge.
For Bridges and Warps, SAT first spends up to five seconds looking for paths
without self-touching contacts, then tries the general path model within the
same 30-second budget if needed.

| Solver | Implementation |
| --- | --- |
| **Heuristic BFS** | C compiled to WebAssembly, adapted from [Matt Zucker's flow_solver](https://github.com/mzucker/flow_solver). |
| **A\*** | Heuristic search written in TypeScript. |
| **Z3 SAT (exact solver)** | Constraint solving with [Z3](https://github.com/Z3Prover/z3), compiled to WebAssembly. |

All solvers run in background Web Workers so the editor stays responsive.

### Limits

The solvers return one complete solution. Difficult puzzles can reach a search
limit; solve times depend on the puzzle and device. Hexes and combined
Bridges + Warps boards are not supported.

Generated puzzles retain a validated solution, which is used if a solve reaches
its search limit. When SAT is selected, Z3 verifies that cover against its full
constraints. Editing the puzzle discards that solution. Generated puzzles are
guaranteed solvable; manually entered puzzles can be unsolvable or reach a
search limit. Generation does not check uniqueness or certify difficulty.

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

Native puzzle text uses `.` for a playable empty cell and `#` for a block.
Classic results contain zero at blocks; variant paths never include them. Native
cell IDs remain row-major, including unused slots, followed by bridge lanes.

For worker or asset changes, also verify development and subpath hosting:

```sh
E2E_SERVER=dev npm run test:e2e
VITE_BASE_PATH=/flow-free-solver/ npm run build
VITE_BASE_PATH=/flow-free-solver/ npm run test:e2e
```

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
