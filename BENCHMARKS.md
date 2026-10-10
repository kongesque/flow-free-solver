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
Walls, blocks, Bridges, and Warps retain their existing search implementations.

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
