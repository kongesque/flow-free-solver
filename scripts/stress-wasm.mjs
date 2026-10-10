// Bounded, reproducible extreme cases. Node 24; optional baseline module path.
// Run --rounds=3 for repeat measurements, --filter=REGEX for selected cases,
// --timeout-ms=15000 for the per-search watchdog, --output=FILE for JSONL.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { assertSolution } from '../tests/fixtures/assert-solution.mjs';
import { assertTopologySolution, decodeNativeSolution } from '../tests/fixtures/assert-topology-solution.mjs';
import { largeBridgeCover, warpRows, warpSnake } from '../tests/fixtures/topology-puzzles.mjs';
import { wallText } from '../tests/fixtures/wall-puzzles.mjs';
import { bridgeScreenshot } from '../tests/fixtures/bridge-screenshot.mjs';

if (!isMainThread) {
  const { default: createModule } = await import(workerData.module);
  const module = await createModule();
  const classic = module.cwrap('solve_puzzle_wasm', 'string', ['string']);
  const walls = module.cwrap('solve_puzzle_with_walls_wasm', 'string', ['string', 'string']);
  const topology = module.cwrap('solve_puzzle_topology_wasm', 'string', ['string', 'string']);
  const warmup = 'R...R\nB...B\nY...Y\nG...G\nO...O\n';
  classic(warmup);
  walls(warmup, '');
  topology(warmup, 'V1\nMODE,W\n');
  parentPort.postMessage({ ready: true });
  parentPort.on('message', entry => {
    const started = performance.now();
    const result = entry.mode === 'classic' ? classic(entry.input)
      : entry.mode === 'walls' ? walls(entry.input, entry.wire) : topology(entry.input, entry.wire);
    parentPort.postMessage({ result, ms: performance.now() - started });
  });
} else {
  // The app's TS modules use extensionless imports. Limit this hook to TS
  // parents so regular Node/module resolution is unaffected.
  registerHooks({ resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('.ts') && /^\.{1,2}\//.test(specifier) && !specifier.split('/').at(-1).includes('.')) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  } });
  const { generateModePuzzle } = await import('../src/solver/logic/variant-generator.ts');
  const options = Object.fromEntries(process.argv.slice(2).filter(arg => arg.startsWith('--')).map(arg => {
    const split = arg.indexOf('=');
    assert.ok(split > 2, `Use --option=value: ${arg}`);
    return [arg.slice(2, split), arg.slice(split + 1)];
  }));
  assert.ok(Object.keys(options).every(key => ['rounds', 'filter', 'timeout-ms', 'output'].includes(key)), 'Unknown option');
  const rounds = Number(options.rounds ?? 1), timeout = Number(options['timeout-ms'] ?? 15000);
  assert.ok(Number.isInteger(rounds) && rounds > 0 && Number.isInteger(timeout) && timeout > 0, 'Invalid rounds/timeout');
  const cases = [], chars = '.RBYGOCMmPAWgTbcp';
  const inputFor = board => Array.from({ length: board[0].length }, (_, y) => board.map(column => chars[column[y]]).join('')).join('\n');
  for (const [width, height] of [[13, 13], [19, 19], [19, 5], [5, 19], [19, 13], [13, 19]]) {
    for (const seed of [16, 42]) for (const mode of ['classic', 'walls', 'bridges', 'warps']) {
      const generated = generateModePuzzle(width, height, ['classic', 'walls'].includes(mode) ? 'standard' : mode, seed);
      const entry = { ...generated, mode, input: inputFor(generated.board), name: `${mode}-${width}x${height}-seed${seed}` };
      if (mode === 'classic' || mode === 'walls') {
        entry.walls = [];
        // Sparse walls preserve the known cover but leave substantial branching.
        if (mode === 'walls') for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          if (x + 1 < width && generated.solution[x][y] !== generated.solution[x + 1][y] && (x * 7 + y * 11 + seed) % 7 === 0) entry.walls.push({ x, y, side: 'right' });
          if (y + 1 < height && generated.solution[x][y] !== generated.solution[x][y + 1] && (x * 11 + y * 7 + seed) % 7 === 0) entry.walls.push({ x, y, side: 'down' });
        }
        const cover = Array.from({ length: height }, (_, y) => generated.solution.map(column => chars[column[y]].charCodeAt(0)));
        assertSolution(entry.input, cover, entry.walls);
      } else assertTopologySolution(entry, entry.pathSolution);
      cases.push(entry);
    }
  }
  for (const [name, entry] of [
    ['bridges-dense-19x19', largeBridgeCover(19)],
    ['bridges-open-dense-19x19', largeBridgeCover(19)],
    ['warps-19x16', warpRows(19, 16)],
    ['warps-16x19', warpRows(19, 16, true)],
    ['warps-snake-19x19', warpSnake(19)],
    ['warps-open-snake-19x19', warpSnake(19)],
  ]) {
    if (name.includes('-open-')) entry.topology.walls = [];
    assertTopologySolution(entry, entry.solution);
    cases.push({ ...entry, name, pairCount: entry.solution.paths.length });
  }
  const fixtures = new URL('../tests/fixtures/puzzles/', import.meta.url);
  for (const name of ['nested_19x19', 'screenshot_15x18']) {
    cases.push({ name, mode: 'classic', input: readFileSync(new URL(`${name}.txt`, fixtures), 'utf8') });
  }
  // This manual board is independently solved/validated by the SAT browser
  // regression. Unlike generated cases, it has no retained witness to supply.
  cases.push({ ...bridgeScreenshot(), name: 'bridges-12x15-screenshot', knownSolvable: true, pairCount: 9 });
  for (const entry of cases) {
    if (entry.width == null) {
      const rows = entry.input.trim().split(/\r?\n/);
      entry.width = rows[0].length; entry.height = rows.length;
      entry.pairCount = new Set(entry.input.replace(/[.\s]/g, '')).size;
    }
    entry.wire = ['classic', 'walls'].includes(entry.mode) ? wallText(entry.walls ?? [])
      : `V1\nMODE,${entry.mode === 'warps' ? 'W' : 'B'}\n` +
        entry.topology.walls.map(w => `W,${w.x},${w.y},${w.side === 'right' ? 'R' : 'D'}\n`).join('') +
        entry.topology.bridges.map(b => `B,${b.x},${b.y},${b.over === 'horizontal' ? 'H' : 'V'}\n`).join('') +
        entry.topology.warps.map(w => `S,${w.axis === 'horizontal' ? 'H' : 'V'},${w.index}\n`).join('');
  }
  const selected = cases.filter(entry => !options.filter || new RegExp(options.filter).test(entry.name));
  assert.ok(selected.length, 'No matching cases');
  const solvers = [{ label: 'current', module: new URL('../public/wasm/flow_solver_c.mjs', import.meta.url).href }];
  const baseline = process.argv.slice(2).find(arg => !arg.startsWith('--'));
  if (baseline) solvers.push({ label: 'baseline', module: pathToFileURL(resolve(baseline)).href });
  async function start(solver) {
    solver.worker = new Worker(new URL(import.meta.url), { workerData: { module: solver.module } });
    const worker = solver.worker;
    await new Promise((resolveReady, reject) => {
      const cleanup = () => { worker.off('message', ready); worker.off('error', failed); worker.off('exit', exited); };
      const ready = () => { cleanup(); resolveReady(); };
      const failed = error => { cleanup(); reject(error); };
      const exited = code => failed(new Error(`Worker exited before ready: ${code}`));
      worker.once('message', ready); worker.once('error', failed); worker.once('exit', exited);
    });
  }
  async function run(solver, entry) {
    if (!solver.worker) await start(solver);
    const worker = solver.worker;
    const response = await new Promise((resolveResponse, reject) => {
      const cleanup = () => { clearTimeout(timer); worker.off('message', done); worker.off('error', failed); worker.off('exit', exited); };
      const done = result => { cleanup(); resolveResponse(result); };
      const failed = error => { cleanup(); reject(error); };
      const exited = code => failed(new Error(`Search worker exited: ${code}`));
      const timer = setTimeout(() => { cleanup(); resolveResponse({ status: 'deadline', ms: timeout }); }, timeout);
      worker.once('message', done); worker.once('error', failed); worker.once('exit', exited);
      // Known covers are deliberately never supplied to the solver.
      worker.postMessage({ mode: entry.mode, input: entry.input, wire: entry.wire });
    });
    if (response.status === 'deadline') {
      await worker.terminate(); solver.worker = null;
      return response;
    }
    let status, nodes;
    if (['classic', 'walls'].includes(entry.mode)) {
      if (response.result.startsWith('Error:')) {
        const code = response.result.match(/result code ([12])\)/)?.[1];
        assert.ok(code, response.result);
        status = code === '2' ? 'limit' : 'unsatisfiable';
      } else {
        assertSolution(entry.input, JSON.parse(response.result), entry.walls);
        status = 'solved';
      }
    } else {
      const raw = JSON.parse(response.result);
      status = raw.status; nodes = raw.nodeCount;
      assert.ok(['solved', 'limit', 'unsatisfiable'].includes(status), response.result);
      if (status === 'solved') assertTopologySolution(entry, decodeNativeSolution(entry, raw));
    }
    // All generated/synthetic cases have independently validated witnesses.
    assert.ok(status !== 'unsatisfiable' || !(entry.solution || entry.knownSolvable), `${solver.label}: rejected known-solvable ${entry.name}`);
    return { status, ms: response.ms, ...(nodes == null ? {} : { nodes }) };
  }
  const measurements = [];
  if (options.output) writeFileSync(options.output, '');
  console.log(`Node ${process.version}; ${selected.length} cases; ${rounds} measured round(s); ${timeout}ms watchdog; no fallback/cached cover.`);
  try {
    for (let round = 0; round < rounds; round++) for (const entry of selected) {
      for (const solver of round % 2 ? [...solvers].reverse() : solvers) {
        const result = await run(solver, entry);
        const row = { solver: solver.label, name: entry.name, mode: entry.mode, width: entry.width, height: entry.height,
          pairs: entry.pairCount, walls: (entry.walls ?? entry.topology?.walls ?? []).length,
          bridges: entry.topology?.bridges.length ?? 0, seams: entry.topology?.warps.length ?? 0, round, ...result };
        measurements.push(row);
        const line = JSON.stringify(row);
        console.log(line);
        if (options.output) appendFileSync(options.output, `${line}\n`);
      }
    }
  } finally {
    for (const solver of solvers) if (solver.worker) await solver.worker.terminate();
  }
  for (const mode of ['classic', 'walls', 'bridges', 'warps']) for (const solver of solvers) {
    const rows = measurements.filter(row => row.mode === mode && row.solver === solver.label);
    if (!rows.length) continue;
    console.log(JSON.stringify({ summary: true, solver: solver.label, mode, runs: rows.length,
      ...Object.fromEntries(['solved', 'limit', 'deadline', 'unsatisfiable'].map(status =>
        [status, rows.filter(row => row.status === status).length])) }));
  }
}
