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

## Extreme and rectangular stress cases

The bounded stress harness includes 56 puzzles, of which 35 are rectangular:
generated 13×13, 19×19, 19×5, 5×19, 19×13, and 13×19 boards with seeds 16 and 42
in all four modes; sparse walls; a 19×19 board with 289 crossings and 650 logical
vertices; open and constrained crossing/warp layouts; 19×16 and 16×19 seam
covers; and the existing difficult 15×18 screenshot puzzle.

```sh
node scripts/stress-wasm.mjs /path/to/baseline/flow_solver_c.mjs --output=/tmp/stress.jsonl
node scripts/stress-wasm.mjs /path/to/baseline/flow_solver_c.mjs \
  '--filter=19x5|5x19|walls-13x13-seed16|walls-13x19-seed42|bridges-19x13-seed42|warps-13x19-seed16' \
  --rounds=3 --output=/tmp/stress-repeat.jsonl
```

Search runs serially in isolated Node workers with tiny warmup puzzles. Timings
exclude module startup, generation, and independent validation. A 15-second
external watchdog terminates a hung search and restarts its worker; its
`deadline` result is separate from the solver's `limit` and `unsatisfiable`
results. Native node, memory, and time budgets are unchanged. Known covers are
validated before searching and never supplied to the solver. The harness fails
on an invalid solution or a false unsatisfiable result for a known cover.

The initial sweep compares each case once against `a9bb618`, so its times are
exploratory. No external deadlines, invalid solutions, false unsatisfiable
results, or lost solves occurred:

| Mode | Cases | Baseline solved / limit | Optimized solved / limit |
| --- | ---: | ---: | ---: |
| Classic | 14 | 7 / 7 | 7 / 7 |
| Walls | 12 | 6 / 6 | 7 / 5 |
| Bridges | 14 | 6 / 8 | 6 / 8 |
| Warps | 16 | 8 / 8 | 8 / 8 |

Twenty selected cases were repeated three times in alternating build order.
Representative median times:

| Case | Baseline | Optimized | Result |
| --- | ---: | ---: | --- |
| Walls 13×13, seed 16 | 630 ms | 533 ms | Baseline limit; optimized solved in all three rounds |
| Walls 13×19, seed 42 | 181 ms | 182 ms | Both solved; essentially unchanged |
| Bridges 19×5, seed 16 | 3.26 ms | 0.34 ms | Both solved |
| Bridges 19×13, seed 42 | 6,768 ms | 2,414 ms | Both reached 2,000,001 visited nodes |
| Warps 13×19, seed 16 | 8,125 ms | 2,082 ms | Both reached 2,000,001 visited nodes |

All generated 19×5 and 5×19 cases solved in every mode and every repeat.
Sub-millisecond Classic/Walls cases show small timing fluctuations, including
occasional slower results; the optimization does not make every puzzle faster.
The hard variant gains above measure lower search overhead, not additional
solves. Large, open generated boards still require fallback or their retained
cover when heuristic search reaches its budget.

The two larger sparse-wall covers are captured in `tests/fixtures/sparse-walls.json`
and checked against the actual Wasm in the native test suite. Across the initial
sweep and repeats, all 160 returned solutions passed independent validation.
The watchdog was also exercised twice with a one-millisecond deadline, including
worker restart between searches.

The expanded `npm run check` passed: 120 native tests, 110 unit tests,
TypeScript checks, the production build, and all 188 browser tests in Chromium
and mobile WebKit. This follow-up adds benchmark infrastructure and regression
fixtures; production solver code and search budgets remain as optimized above.
