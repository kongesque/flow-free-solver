# Pruned DFS benchmark

Measured on an Apple Silicon Mac on 2026-10-11, comparing the Wasm artifacts
from commit `8e33a55` with the diagonal fast path. Both use Emscripten 4.0.23.
Every completed cover was independently validated for endpoints, full coverage,
path degree, and connectivity. No SAT fallback or generated-solution candidates
were supplied.

## Production browser workers

Chromium 153.0.8010.12; one warmup and three measured runs per case/build,
alternating build order. A fresh real production worker runs each solve. The
same server and worker script serve both versions; request interception selects
the baseline or current Wasm binary. Times include worker startup, Wasm loading
and initialization, board conversion, search, and the message round trip.
Browser timing can vary with device load and asset caching.

| Puzzle | Baseline median | Current median | Result |
| --- | ---: | ---: | --- |
| Extreme 12×12 #28 | 422.42 ms | 8.51 ms | Both solved |
| Jumbo 14×14 #19 | 668.99 ms | 10.52 ms | Both solved |
| Jumbo 14×14 #30 | 743.25 ms | 8.55 ms | Both solved |
| Nested 19×19 | 266.42 ms | 9.84 ms | Both solved |
| Screenshot 15×18 | 2939.69 ms | 10.96 ms | Baseline limit; current solved |

## Wasm search without worker startup

Node 24.21.0; `scripts/benchmark-wasm.mjs` performs one warmup and five measured
rounds in the actual modules, alternating build order. The median total for its
28 regular/extreme/jumbo classic fixtures was **2708.61 ms → 1.67 ms** (about
1621×). This measures the search/API call, not end-to-end browser latency.

The separate large classic stress set (12 generated square/rectangular boards,
nested 19×19, and screenshot 15×18) improved from **7/14 solved to 14/14 solved**
in one measured run per build. The baseline reached its search limit on the
other seven cases. Both benchmarks validate covers outside the timed interval.
That initial optimization left walls, Blocks, Bridges, and Warps unchanged.

Reproduce with Node 24, preserving both baseline assets together:

```sh
node scripts/benchmark-wasm.mjs /path/to/baseline/flow_solver_c.mjs --output=/tmp/benchmark.json
node scripts/stress-wasm.mjs /path/to/baseline/flow_solver_c.mjs --filter='^(classic|nested|screenshot)' --rounds=1 --output=/tmp/stress.jsonl
```

The new probe processes grid vertices diagonally and maintains rollback
components plus constraints against contacts over unselected edges. It rejects
cycles, mismatched endpoints, and same-color contacts early. It is bounded by
50,000 visits and a roughly 25 ms clock budget checked every 256 visits. Failure
or a budget limit invokes the original heuristic search; the probe never
declares a puzzle unsatisfiable. Boards with walls or blocks bypass the probe.

This is an independent C implementation inspired by the traversal and
partial-link ideas in [Thomas Ahle's Numberlink](https://github.com/thomasahle/numberlink#how-it-works).
No Go source was imported or translated. The heuristic module's Matt Zucker
attribution and CC BY-NC 2.0 exception are preserved.

## Extension to walls, Blocks, Bridges, and Warps

The graph extension is compared against `f1b5b26`, which already includes the
fast Classic search above. The specialized open-Classic search is unchanged.
Node 24.21.0, Emscripten 4.0.23, Apple Silicon; no SAT fallback or retained
generated cover was supplied. Every returned cover was independently validated.

The regular corpus comparison uses one warmup and five alternating measured
rounds. The 28 open-Classic puzzles took **1.326 ms before → 1.190 ms after**
in total: no measured Classic regression. The corresponding easy wall, Bridges,
and Warps totals were 0.656 → 0.593 ms, 0.199 → 0.188 ms, and 0.162 → 0.162 ms.
These submillisecond totals vary with runtime warmup and device load.

Fresh production Chromium workers were also compared in 15 alternating rounds
after two warmups, including startup, Wasm loading, conversion, search, and the
message round trip. Both binaries used the same worker and generated glue, with
identical response interception. Every cover was independently validated.

| Open Classic puzzle | Before median | After median |
| --- | ---: | ---: |
| Extreme 12×12 #28 | 6.855 ms | 6.955 ms |
| Jumbo 14×14 #19 | 7.185 ms | 7.330 ms |
| Jumbo 14×14 #30 | 7.110 ms | 7.330 ms |
| Nested 19×19 | 7.770 ms | 7.735 ms |
| Screenshot 15×18 | 7.510 ms | 7.735 ms |

The changes ranged from −0.035 to +0.225 ms. A separate calibration running the
same baseline binary under both labels varied from −0.515 to +0.570 ms across
these medians, so no material Classic slowdown was observed. The all-mode Wasm
binary grows from 52,735 to 59,563 bytes; the specialized Classic search and
generated JavaScript glue are unchanged.

The large stress corpus uses three rounds, alternating build order. Counts below
are unique cases; outcomes were the same in all three rounds.

| Mode | Cases | Solved before | Solved after |
| --- | ---: | ---: | ---: |
| Sparse walls | 12 | 7 | 12 |
| Bridges | 15 | 7 | 15 |
| Warps | 16 | 8 | 14 |

Selected median search/API times, excluding worker startup:

| Puzzle | Before | After |
| --- | ---: | ---: |
| Sparse walls 13×13 seed 42 | 16.827 ms | 0.115 ms |
| Bridges 13×13 seed 42 | 16.503 ms | 0.215 ms |
| Bridges 12×15 screenshot | Limit at 2113 ms | Solved in 0.374 ms |
| Warps 13×13 seed 16 | Limit at 975 ms | Solved in 0.545 ms |
| Warps 13×13 seed 42 | Limit at 834 ms | Solved in 0.148 ms |

Two Warps cases still reach the native search limit. Probes share a roughly
25 ms time budget; their failures delegate to the original solver and never
claim unsatisfiability. Forced variant covers finish before allocating a probe.
Graph search removes blocked vertices and wall edges, separates bridge lanes,
rejects same-color crossings, and treats warp seams as graph edges. Variants
first try induced covers, then allow legitimate self-touching paths.

Blocks and walls together are checked in all modes, including exhaustive small
board oracles and a captured masked-Warps fixture that exercises native limits,
SAT loading, cancellation, and recovery. The formerly limited 19×19 Blocks
fixture and 15×18 wall screenshot now solve directly in C.

```sh
node scripts/benchmark-wasm.mjs /path/to/f1b5b26/flow_solver_c.mjs --output=/tmp/all-modes.json
node scripts/stress-wasm.mjs /path/to/f1b5b26/flow_solver_c.mjs --filter='^(walls|bridges|warps)' --rounds=3 --output=/tmp/all-modes-stress.jsonl
```
