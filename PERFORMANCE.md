# Heuristic solver performance

Run `node scripts/benchmark-wasm.mjs` with Node.js 24 after rebuilding Wasm.
To compare a previous build, pass its module path:

```sh
node scripts/benchmark-wasm.mjs /path/to/baseline/flow_solver_c.mjs
```

Keep the matching `flow_solver_c.wasm` next to the baseline module. The script
uses identical puzzles for both builds, runs one warmup and five measured
rounds in alternating order, and reports the median total time per mode.
Every solution is independently checked for coverage, endpoints, connectivity,
walls, and crossing lanes outside the timed interval. Worker startup, SAT
fallback, generation, and retained generated solutions are excluded.

## October 2026 optimization

Baseline: `a9bb618`. Local measurements used Node.js 24.21.0 and the pinned
Emscripten 4.0.23 compiler. Times are representative of this machine and corpus,
not guarantees for every puzzle or device.

| Mode | Puzzles | Baseline total | Optimized total |
| --- | ---: | ---: | ---: |
| Classic | 28 | 3,538 ms | 2,488 ms |
| Walls | 36 | 0.53 ms | 0.51 ms |
| Bridges | 5 | 2.93 ms | 0.20 ms |
| Warps | 5 | 1.14 ms | 0.16 ms |

The Walls corpus contains small generated puzzles and forced corridors;
its tiny total is sensitive to measurement noise. The fixed variant corpus
also favors forced routes. Additional generated 13×13 puzzles (seed 42)
reached the same two-million-node limit in both versions: Bridges took about
5.13 s before and 2.39 s after; Warps took 5.54 s before and 1.47 s after.
These cases measure lower search overhead, not an increased solve rate.

Classic now ranks colors by the starting endpoint's boundary distance with
stable input order on ties. Immutable neighbors are precomputed once after
walls are read, avoiding repeated coordinate decoding in hot search loops.
Bridges and Warps take unavoidable moves before running connectivity scans;
at branches, degree-two free vertices can force a head's next move. Reachability
scans stop once the goal is found, and reuse stamped visit storage.

The worker loads A* and Z3 only when selected or needed for fallback. Its initial
production bundle shrank from about 167 KiB to 11 KiB. Safari's worker cache
workaround and cross-origin isolation headers remain in place.

Correctness checks include the existing real-Wasm corpus, an exhaustive oracle
for small wrapped boards, and 300 crossing-board comparisons against an
independent path enumerator. Browser tests use real workers and verify that a
successful heuristic solve does not request A* or Z3 assets.

Validation completed with 118 native tests, 110 unit tests, type checking, and
the production build. All 188 production browser tests passed, including
mobile WebKit; 23 focused real-worker checks also passed in development and
under `/flow-free-solver/`. The `npm run check` browser phase initially could not
bind localhost inside the sandbox, so that phase was rerun successfully with
the required local-server permission. No dependency or hosting-header changes
were needed.
