# C solver

`flow_solver.c` is the editable source for the heuristic BFS solver, adapted from
[Matt Zucker's flow_solver](https://github.com/mzucker/flow_solver). This module
retains the [CC BY-NC 2.0](https://creativecommons.org/licenses/by-nc/2.0/) license
exception described in the root README.

Run `npm run build:wasm` from the repository root. The compiler command lives in
`scripts/build-wasm.mjs` and produces `public/wasm/flow_solver_c.mjs` plus
`flow_solver_c.wasm`. Emscripten's modular ES module factory exports `cwrap` and
`solve_puzzle_wasm`. It supports browsers, Web Workers, and Node.js for regression
tests, with memory growth capped at 512 MiB and search storage capped at 128 MiB.
The filesystem is disabled; puzzle input and result output stay in memory.

The API accepts square text boards between 2×2 and 15×15. Each color must appear
twice; empty cells are `.`. Valid colors are `RBYGOCMmPAWgTbcp`. Results are JSON
rows containing ASCII color codes. Invalid input and failed searches return an
`Error:` string. The result string is a static buffer overwritten by the next
call; `cwrap` copies it into a JavaScript string immediately.

See [Emscripten's modular output documentation](https://emscripten.org/docs/compiling/Modularized-Output.html)
and [C/JavaScript interaction documentation](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/Interacting-with-code.html)
for the compiler flags and exported interface.
