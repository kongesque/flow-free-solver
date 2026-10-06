# Flow Free walls: research, editor design, and implementation plan

Date: 2026-10-06. Research baseline: `77b146e`; implementation branch: `feat/flow-free-walls`.

**Status: implemented for Standard square and rectangular boards.** Walls use
the C/Wasm solver. The editor supports tap/drag, stroke undo, keyboard boundaries,
mobile zoom and panning, and saved walls. Generation requires clearing walls.
The research/design below is followed by the implementation verification record.
A* and Z3 support for walls remains future work.

## 1. What a wall does

A wall occupies the shared boundary between two neighboring cells. It removes
the connection across that boundary in both directions. It leaves both cells
available for endpoints and pipes, and both must still be filled in a solution.

```text
No wall:       [ A ] ─── [ B ]     a pipe may move directly between these cells
With a wall:   [ A ]  │  [ B ]     a pipe must take another open route
```

The board is a graph: cells are vertices, and open shared boundaries are edges.
Adding a wall removes one edge. A wall can force a detour, create a corridor, or
separate the board into regions. Separate regions can still form a valid puzzle
if their endpoints and paths allow complete coverage.

The usual objectives remain: connect each matching pair, avoid overlapping
pipes, and fill every cell. Two neighboring cells may have the same pipe color
on opposite sides of a wall; their colors do not imply a connection across it.

### Research evidence and limits

- Big Duck Games' [official rules](https://www.bigduckgames.com/flowfree) describe
  matching pairs, complete coverage, and avoiding crossings and overlap.
- The developer's [App Store version history](https://apps.apple.com/us/app/flow-free/id526641427?platform=vision)
  identifies Courtyard as a wall pack in version 3.0 (August 9, 2017), Courtyard
  Spin as another wall pack in version 3.2 (November 20, 2017), and Pathway as a
  pack added in version 3.7 (December 16, 2019).
- The official listing confirms wall packs exist but does not publish a formal
  wall data format or detailed topology rules. The edge-removal model here is
  an engineering interpretation of the boundary-blocking mechanic requested
  for this app, rather than an official API specification. Before claiming
  exact compatibility with a particular pack, add a manually checked screenshot
  fixture from that pack.

Keep walls as an option on a Standard square or rectangular board. They do not
require the different cell geometry of Hexes, the crossings of Bridges, or the
extra connections of Warps.

## 2. Make adding walls easy

Place a visible **Dots / Walls** editing switch beside the board. Keep Dots as
the default. The intended workflow is:

1. Select the board dimensions and place color pairs as today.
2. Select **Walls**. Show a preview of the nearest internal boundary under the
   pointer, and the instruction: “Tap a line between cells to add or remove a wall.”
3. Tap a boundary to toggle it. Draw the wall as a thick, high-contrast line,
   visibly different from the ordinary grid. Keep it visible in solution view.
4. Drag along boundaries to paint a longer wall. Decide add/remove from the
   first boundary, then apply that operation to every distinct boundary visited.
   Revisiting a boundary during the same stroke must not toggle it repeatedly.
5. Offer **Undo** for the whole stroke and **Clear walls** with undo. **Reset**
   clears endpoints, walls, and solutions together. **Edit** preserves endpoints
   and walls when leaving solution view.
6. Click **Solve** as usual. Any wall change invalidates a previous solved board
   and the generator's retained solution.

Use pointer events and pointer capture for mouse, pen, and touch. Do not use
tiny visible lines as the only hit targets: hit-test within a wider band around
the boundary, snap to one segment, and highlight it before editing. At boundary
intersections choose one segment deterministically; never modify two at once.
Taps near a cell center in Walls mode should leave the puzzle unchanged.

For large mobile boards, offer zoom in wall-editing mode so cells can remain at
least roughly 48 CSS pixels wide. Allow panning around the enlarged board;
handle touch scrolling separately from an active captured drawing stroke. A
15×15 board fitted into a phone screen cannot offer comfortably separated edge
targets without enlargement.

Preserve the existing arrow-key cell navigation. In Walls mode, use
**Shift + Arrow** to toggle the corresponding boundary of the focused cell.
Enter/Space must not place a dot in this mode. Announce changes such as “Wall
added between column 2, row 3 and column 3, row 3” through a live region. Display
these shortcuts in the help text. Outer boundaries are fixed and not editable.

Disable editing while solving or generating. Keep wall edits independent of the
active endpoint color and whether its second dot is being placed.

## 3. Data model and coordinate contract

Retain the existing column-major `board[x][y]`. Store each internal wall once:

```ts
type Wall = { x: number; y: number; side: 'right' | 'down' };

// right: blocks (x, y) <-> (x + 1, y); rendered as a vertical line
// down:  blocks (x, y) <-> (x, y + 1); rendered as a horizontal line
type PuzzleTopology = { walls: Wall[] };
```

Coordinates are zero-based in data. `right` requires `0 <= x < width - 1`;
`down` requires `0 <= y < height - 1`. Both require a valid cell coordinate.
Normalize left/up interactions into this representation. Deduplicate records
and sort them for deterministic saves and fixtures. Reject malformed coordinates
and sides at the worker/API boundary instead of silently solving without them.

An omitted `walls` property means `[]`, maintaining compatibility with existing
saves and requests. Adding an optional field to the existing IndexedDB record
does not itself require changing the object-store version. Validate it on load,
include it in the existing debounced save, and clear it when dimensions reset.

The shared TypeScript module `src/solver/logic/walls.ts` provides `normalizeWalls`,
`hasWall`, `wallBetween`, and pointer boundary lookup. Workers use its input
validation; the C solver maintains its own open-neighbor traversal. The test
validator independently implements blocked-edge lookup so solver bugs cannot
validate their own output.

## 4. Integration points in this repository

| File | Required change |
| --- | --- |
| `src/solver/components/PuzzleGrid.tsx` | Add wall overlay, pointer hit-testing, previews, stroke handling, and keyboard wall editing. Avoid breaking its current cell-button focus indexing. |
| `src/solver/components/SolverControls.tsx` | Add Dots/Walls controls, Undo, and Clear walls; explain solver availability when walls exist. |
| `src/solver/components/FlowSolver.tsx` | Own wall state and edit history, invalidate both solution states, include walls in saves and worker requests, and clear walls on reset/resize. |
| `src/app/index.css` | Add distinct wall styling, focus/hover previews, and zoom layout. |
| `src/hooks/useStorage.ts` | Extend `PuzzleState` with walls and safely load records that omit them. |
| `src/solver/workers/solver.worker.ts` | Validate topology and reject unsupported solver/wall combinations. |
| `src/solver/logic/heuristic-solver.ts` | Convert wall records to the new C API format; keep row-major/column-major conversion here. |
| `native/flow_solver.c` | Make move legality, completion, region analysis, and pruning respect blocked boundaries. |
| `scripts/build-wasm.mjs` | Export any added wall-capable C entry point through the reproducible build. |
| `tests/fixtures/assert-solution.mjs` and its declaration | Accept wall fixtures and validate connectivity and degree using only open boundaries. |
| `tests/wasm/`, `tests/e2e/` | Exercise the real compiled module and workers with wall-aware fixtures. |
| `src/solver/logic/puzzle-generator.ts`, `src/solver/workers/generator.worker.ts` | Define generation behavior explicitly; never reuse a solution across incompatible wall edits. |

The solver worker now carries `board`, solver `type`, `mode`, and `walls`.
The C bridge serializes endpoints and walls separately. The independent validator
checks same-color degree and connectivity only across open boundaries.

### Start with C/Wasm solving

Use Heuristic BFS for boards with walls, consistent with the repository's
C/Wasm route for rectangles and future variants. Keep A* and Z3 available under
their existing rules for wall-free Standard squares. Enforce this capability in
both the controls and worker; a direct worker message must not bypass it.

The exported entry point `solve_puzzle_with_walls_wasm(boardText, wallText)`
preserves `solve_puzzle_wasm(boardText)` for existing callers. Wall encoding uses
one zero-based `x,y,R` or `x,y,D` record per LF/CRLF line, with an optional final
newline. The API accepts at most `2 * width * height` records, deduplicates them,
and rejects invalid coordinates, sides, whitespace, and incomplete records. Both
APIs share the solver internally, with the legacy API using an empty wall mask.
See `native/README.md` for the full input contract.

Store an immutable direction bitmask per C cell in `game_info_t`, setting the
blocked direction and its opposite together. Index it using C's position helper;
this solver uses a fixed 16-cell row stride internally, not `y * width + x`.
Initialize the mask for every call, including after invalid input.

Adding a check only to `game_can_move` is insufficient. Audit these paths:

- `offset_pos` / `pos_offset_pos` neighbor traversal and the direct-coordinate
  movement in `game_can_move` and `game_make_move`.
- Goal adjacency and automatic completion: neighboring endpoints separated by
  a wall cannot finish directly.
- Same-color touch checks: a same-color cell across a wall is not an open neighbor.
- `game_build_regions`: left/up unions currently use geometry directly and must
  check whether those boundaries are open.
- Region endpoint flags, dead-end detection, forced moves, and the numerical
  adjacency shortcut in `game_check_stranded`.
- Chokepoint and other geometry-based pruning: establish that each rule remains
  sound on a board with removed edges. Disable a pruning rule for wall boards
  until it is proved safe; incorrect pruning can reject solvable puzzles.

Use an explicit wall-aware adjacency helper while retaining raw geometric
coordinate helpers where needed. Manhattan distance remains a lower bound with
walls, but cannot establish connectivity. Keep expensive work in workers.

Rebuild with `npm run build:wasm`, using the pinned Emscripten version. Commit
both generated artifacts alongside native changes. Preserve Matt Zucker's
attribution and the existing CC BY-NC 2.0 exception. Continue using
`import.meta.env.BASE_URL` and the existing COOP/COEP headers.

### Later solver and generator extensions

For A*, filter every traversal and pruning neighbor set through the topology.
For Z3, count only open neighboring boundaries. Also constrain colors to actual
endpoint colors and enforce connectivity: the current degree constraints alone
can permit disconnected cycles, especially in a region enclosed by walls.
Handle a cell with no open neighbors explicitly rather than constructing an
empty Z3 `Sum`. These changes need separate solver regression tests.

The existing app returns a color board, so it infers path connections from open
same-color adjacency. Walls must participate in that inference. If supporting
paths that touch themselves across an *open* boundary becomes a requirement,
return selected path edges explicitly; colors alone cannot describe that case.

For the first wall release, disable **Generate** when walls are present and show
“Clear walls to generate a puzzle.” Arbitrary walls can make the generator's
initial row/column path cover invalid, so filtering its neighbor list alone
would not guarantee solvability. A later feature can generate a complete path
cover first and add walls only across boundaries unused by its paths. Generating
within a user-drawn wall layout requires constructing a valid cover for that
layout and reporting failure when one cannot be found.

## 5. Fixtures that demonstrate correctness

### A known solvable 5×5 wall corridor

Use one pair with endpoints at `(0,0)` and `(4,4)`:

```text
R....
.....
.....
.....
....R
```

For each row boundary `y = 0..3`, add `down` walls at every `x = 0..4` except:
`x = 4` when `y` is even, and `x = 0` when `y` is odd. This gives 16 walls,
leaving one alternating opening at each row boundary. Leave all `right`
boundaries open.

The expected path snakes left-to-right on row 0, right-to-left on row 1, and so
on through row 4. All 25 solution cells are `R`; the wall topology distinguishes
the path. It has 24 open path edges, endpoint degree 1, interior degree 2, and
one connected component. This directly catches validators that incorrectly
count same-color neighbors across a wall.

Add `right` at `(0,0)` to the same fixture. It isolates the first endpoint,
making the puzzle unsatisfiable. A solver that ignores walls will mishandle
these cases. This synthetic fixture is not an imported official Flow Free level.

### Regression and acceptance checklist

- [x] Wall lookup is symmetric; left/up interactions normalize correctly.
- [x] Right and down wall serialization are correct on both tall and wide boards.
- [x] Invalid, outside-board, and duplicate wall records have specified behavior.
- [x] The corridor solves in the real C module; the isolated-endpoint case fails.
- [x] A multi-color wall fixture forces a detour, with a valid independently
  checked solution; endpoints adjacent across a wall cannot finish directly.
- [x] Zero-wall calls still solve the existing corpus and legacy entry point.
- [x] Repeated valid, invalid, and wall-free calls do not retain old wall masks.
- [x] Validation checks full coverage, original endpoints, known colors, degree,
  connectivity, and absence of selected path steps across walls. A non-null
  solution is insufficient.
- [x] Real browser worker requests include walls; unsupported algorithms reject
  wall requests explicitly rather than ignoring the field.
- [x] Mouse, touch, and keyboard edits change only the intended boundary, preserve
  endpoint colors, and support stroke-level undo.
- [x] Walls survive save/reload and Edit; legacy saves load with no walls.
- [x] Wall edits discard retained generated solutions; Reset/resize clears walls.
- [x] Generator fallback never reveals a solution invalidated by a wall edit.
- [x] Walls remain visible after solving and can be edited after returning to Edit.
- [x] Mobile large-board zoom, cancellation, production, development, and subpath
  worker/Wasm loading all work.

Run the required checks after implementation:

```sh
npm run check
E2E_SERVER=dev npm run test:e2e
VITE_BASE_PATH=/flow-free-solver/ npm run build
VITE_BASE_PATH=/flow-free-solver/ npm run test:e2e
npm run build
```

## 6. Delivery milestones

1. Add wall types, independent validation, and solvable/unsatisfiable fixtures.
2. Add the C API, topology-aware search, and actual Wasm regression tests.
3. Connect worker capability checks and persistence; keep empty-wall compatibility.
4. Add Dots/Walls editing, undo, mobile zoom, and keyboard support.
5. Add real-browser wall tests, run all hosting checks, and document the workflow.

Implementation is on `feat/flow-free-walls`, with focused research, native-solver,
and editor milestones. Generated C artifacts were built using Emscripten 4.0.23
from a temporary SDK in `/private/tmp/flow-walls-emsdk`; no global compiler changes
or repository toolchain caches are included.

## 7. Historical verification before implementation

Checked on 2026-10-06 with Node.js `v24.21.0`:

| Check | Result |
| --- | --- |
| `npm test` | Passed: 39 tests in 5 files. |
| `node --test tests/wasm/solver.test.mjs` | Passed: 51 tests against the existing checked-in C/Wasm artifact. |
| `npm run build` | Passed: TypeScript check and production build. |
| Proposed 5×5 fixture, independent scratch graph check | Passed: 25-cell coverage, 24 path edges, correct degrees and connectivity; the extra wall isolates the first endpoint. This did not call a wall-capable app solver. |
| `npm run test:e2e` | Passed: 51 Chromium tests against the production build, including real workers and Wasm. The preview server required permission to bind its local port outside the sandbox. |
| `npm run check` | Could not complete: native compilation attempted to write a lock in the sandbox-restricted Homebrew Emscripten cache. Installed compiler is 5.0.0; project pin is 4.0.23. No successful recompilation is claimed. |

These results record the original app baseline. The earlier compiler-cache
limitation was resolved for implementation by using the pinned temporary SDK.
The wall feature is verified separately below.

## 8. Implementation verification

The implemented regression suite includes real C/Wasm wall corridors through
15×15, a multi-color detour, disconnected regions with complete pairs, malformed
wall text, duplicate boundaries, repeated calls, and 60 generated boards whose
known solutions are preserved by their wall layouts. Every returned solution is
checked for full coverage, original endpoints, path degree, and connectivity.

Browser wall tests exercise real workers, reload, undo, clear/reset/resize,
generated-solution invalidation, unsupported A*/Z3 requests, invalid worker wall
input, cancelled pointer strokes, touch tapping, and native touch panning.
Screenshots were visually inspected for solved-wall visibility and mobile layout.

Verified on 2026-10-06 with Node.js `v24.21.0` and Emscripten `4.0.23`:

| Check | Result |
| --- | --- |
| `npm run check` | Passed: 76 native/Wasm tests, 42 unit tests, TypeScript check, production build, and 72 browser tests. |
| `E2E_SERVER=dev npm run test:e2e` | Passed: all 72 browser tests against the development server. |
| `VITE_BASE_PATH=/flow-free-solver/ npm run build` | Passed: TypeScript check and subpath production build. |
| `VITE_BASE_PATH=/flow-free-solver/ npm run test:e2e` | Passed: all 72 browser tests with real workers and Wasm under the subpath. |
| Final root build | Restored by the final successful `npm run check`. |
| `git diff --check` | Passed. |

The browser suite includes 68 Chromium tests and 4 WebKit mobile layout tests.
Wall touch and zoom behavior is exercised in Chromium with touch enabled; the
WebKit cases cover the existing responsive layout. These checks validate the
boundary-blocking implementation and synthetic fixtures, rather than exact
compatibility with every official wall pack.

The local native check used the pinned temporary compiler:

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
EMCC=/private/tmp/flow-walls-emsdk/upstream/emscripten/emcc npm run check
```

A normal web-only install uses the committed generated C artifacts and does not
need that temporary SDK. Difficult wall puzzles still have the solver's existing
search and memory limits; wall-specific geometric bottleneck pruning remains
disabled, as described above.
