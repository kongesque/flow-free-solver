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
