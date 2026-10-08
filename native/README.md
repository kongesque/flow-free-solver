# C solver

`flow_solver.c` is the editable source for the heuristic BFS solver, adapted from
[Matt Zucker's flow_solver](https://github.com/mzucker/flow_solver). This module
retains the [CC BY-NC 2.0](https://creativecommons.org/licenses/by-nc/2.0/) license
exception described in the root README.

Run `npm run build:wasm` from the repository root. The compiler command lives in
`scripts/build-wasm.mjs` and produces `public/wasm/flow_solver_c.mjs` plus
`flow_solver_c.wasm`. Emscripten's modular ES module factory exports `cwrap` and
`solve_puzzle_wasm` and `solve_puzzle_with_walls_wasm`. It supports browsers, Web Workers, and Node.js for regression
tests, with memory growth capped at 512 MiB and search storage capped at 128 MiB.
The filesystem is disabled; puzzle input and result output stay in memory.

The API accepts rectangular text boards with each dimension between 2 and 15.
The first row determines width; the number of equally sized rows determines height. Each color must appear
twice; empty cells are `.`. Valid colors are `RBYGOCMmPAWgTbcp`. Results are JSON
rows containing ASCII color codes. Invalid input and failed searches return an
`Error:` string. The result string is a static buffer overwritten by the next
call; `cwrap` copies it into a JavaScript string immediately.

`solve_puzzle_with_walls_wasm(boardText, wallText)` accepts the same board plus
zero-based `x,y,R` (right boundary) or `x,y,D` (down boundary) records. Use LF or
CRLF between records; the final newline is optional. Coordinates must be unsigned
decimal integers within the board, and the boundary must have a neighboring cell.
Empty wall text means no walls. Duplicate boundaries are idempotent, with at most
`2 * width * height` input records. Invalid wall text returns `Error: Invalid walls`.

Walls block both directions without removing cells. The immutable direction mask
uses the native position helpers' fixed stride. Movement, completion, connected
regions, forced moves, and dead-end checks use open boundaries. The geometric
bottleneck pruning is disabled for wall boards because it assumes open grid edges.
The legacy one-argument API uses an empty mask, and each call initializes its own
topology. Rectangular wall fixtures and same-module repeated-call tests cover both
exports; solution validation ignores blocked boundaries when checking path degree
and connectivity.

See [Emscripten's modular output documentation](https://emscripten.org/docs/compiling/Modularized-Output.html)
and [C/JavaScript interaction documentation](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/Interacting-with-code.html)
for the compiler flags and exported interface.

## Warps and Bridges graph API

`solve_puzzle_topology_wasm(boardText, topologyText)` preserves the legacy exports.
The versioned topology grammar is one record per LF/CRLF line, with an optional
final newline, no spaces, signs, bare CRs, empty lines, or trailing data:

```text
V1
MODE,W
W,1,2,R
S,H,2
```

`MODE,W` selects Warps; `MODE,B` selects Bridges. `W,x,y,R|D` blocks an internal
edge, using the existing coordinates. `S,H,row` opens a left/right seam;
`S,V,column` opens a top/bottom seam. `B,x,y,H|V` adds an interior bridge with
the named axis drawn on top. Bridges cannot contain endpoints or have blocked
ports. Duplicate identical records are idempotent; conflicting bridge axes are
invalid. Mode-incompatible records are rejected. Input is bounded to 16 KiB and
`2 * width * height + width + height` topology records.

Graph IDs are row-major `y * width + x` for ordinary cells and horizontal bridge
lanes. Vertical bridge lanes start at `width * height`, sorted by `(y,x)`.
IDs and counts use 16 bits; the conservative graph capacity is 450 nodes. The
separate graph search lives in `topology_solver.h`, included by `flow_solver.c`.
It uses selected steps, two independent bridge lanes, and graph reachability
and degree pruning. It does not inherit Standard's planar/touch/parity pruning.
All nodes must be occupied, and bridge lanes must have different colors.

Results are JSON with `version: 1` and `status` (`solved`, `unsatisfiable`, `limit`,
`invalid`, or `error`). Solved results contain `paths: [{color, nodes}]`, where
colors are ASCII codes and nodes are ordered IDs. Search results include
`nodeCount`. Exhausting two million recursive visits or ten seconds of CPU
reports `limit`; this does not prove unsatisfiability. Cancellation terminates
the worker. State is allocated per call and freed afterward; result storage is
static and copied by `cwrap`. The 64 KiB result buffer comfortably bounds 450
node IDs plus 16 path headers. Input errors return a constant status string.

Like the original heuristic module, the included native helper is covered by
this repository's Matt Zucker attribution and CC BY-NC 2.0 exception. Native
changes must be compiled using the pinned Emscripten release and committed with
both generated runtime artifacts.
