// Measure actual Wasm search, without worker startup, SAT fallback, or cached
// generated solutions. Measures only the current checked-in solver.
// --output=FILE writes raw samples and per-puzzle medians.
// --batch=N and --rounds=N support steadier throughput measurements (defaults 1/5).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { assertSolution } from '../tests/fixtures/assert-solution.mjs';
import { assertTopologySolution, decodeNativeSolution } from '../tests/fixtures/assert-topology-solution.mjs';
import { wallCorridor, wallDetour, wallText } from '../tests/fixtures/wall-puzzles.mjs';
import { warpRows, warpSnake, bridgeCross, largeBridgeCover } from '../tests/fixtures/topology-puzzles.mjs';
import { generateRectangularPuzzle } from '../src/solver/logic/puzzle-generator.ts';

const fixtures = new URL('../tests/fixtures/puzzles/', import.meta.url);
const cases = readdirSync(fixtures).filter(name => /^(regular|extreme|jumbo)_.*\.txt$/.test(name))
  .sort().map(name => ({ name, mode: 'classic', input: readFileSync(new URL(name, fixtures), 'utf8') }));
for (const [width, height] of [[5, 5], [5, 8], [8, 5], [15, 15], [19, 19]]) {
  cases.push({ name: `corridor-${width}x${height}`, mode: 'walls', ...wallCorridor(width, height) });
}
cases.push({ name: 'detour', mode: 'walls', ...wallDetour });
for (const [width, height] of [[5, 5], [5, 8], [8, 5]]) for (let seed = 0; seed < 10; seed++) {
  const { board, solution } = generateRectangularPuzzle(width, height, seed);
  const chars = '.RBYGOCMmPAWgTbcp';
  const input = Array.from({ length: height }, (_, y) => board.map(column => chars[column[y]]).join('')).join('\n');
  const walls = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x + 1 < width && solution[x][y] !== solution[x + 1][y] && (x + y + seed) % 3 !== 0) walls.push({ x, y, side: 'right' });
    if (y + 1 < height && solution[x][y] !== solution[x][y + 1] && (x + y + seed) % 2 === 0) walls.push({ x, y, side: 'down' });
  }
  cases.push({ name: `generated-${width}x${height}-${seed}`, mode: 'walls', input, walls });
}
for (const fixture of [warpRows(), warpRows(8, 5), warpRows(8, 5, true), warpRows(19, 16), warpSnake(),
  bridgeCross(), bridgeCross(true), bridgeCross(false, 'vertical'), largeBridgeCover(), largeBridgeCover(19)]) {
  cases.push({ name: `${fixture.width}x${fixture.height}-${cases.length}`, ...fixture });
}
const wire = ({ mode, topology }) => `V1\nMODE,${mode === 'warps' ? 'W' : 'B'}\n` +
  topology.walls.map(w => `W,${w.x},${w.y},${w.side === 'right' ? 'R' : 'D'}\n`).join('') +
  topology.bridges.map(b => `B,${b.x},${b.y},${b.over === 'horizontal' ? 'H' : 'V'}\n`).join('') +
  topology.warps.map(w => `S,${w.axis === 'horizontal' ? 'H' : 'V'},${w.index}\n`).join('');
for (const entry of cases) entry.wire = entry.topology ? wire(entry) : wallText(entry.walls ?? []);

const args = process.argv.slice(2);
const output = args.find(arg => arg.startsWith('--output='))?.slice('--output='.length);
const batch = Number(args.find(arg => arg.startsWith('--batch='))?.slice('--batch='.length) ?? 1);
const rounds = Number(args.find(arg => arg.startsWith('--rounds='))?.slice('--rounds='.length) ?? 5);
if (!Number.isInteger(batch) || batch < 1 || batch > 256 || !Number.isInteger(rounds) || rounds < 1) throw new Error('Invalid batch/rounds');
if (args.some(arg => !arg.startsWith('--')) || args.some(arg => arg.startsWith('--') && !['--output=', '--batch=', '--rounds='].some(prefix => arg.startsWith(prefix)))) {
  throw new Error('Usage: node scripts/benchmark-wasm.mjs [--output=FILE] [--batch=N] [--rounds=N]');
}
const { default: createModule } = await import('../public/wasm/flow_solver_c.mjs');
const module = await createModule();
const solvers = [{ label: 'current',
  classic: module.cwrap('solve_puzzle_wasm', 'string', ['string']),
  walls: module.cwrap('solve_puzzle_with_walls_wasm', 'string', ['string', 'string']),
  topology: module.cwrap('solve_puzzle_topology_wasm', 'string', ['string', 'string']) }];
const samples = [];
for (let round = -1; round < rounds; round++) for (const solver of solvers) {
  for (const entry of cases) {
    const results = Array(batch);
    const started = performance.now();
    for (let i = 0; i < batch; i++) results[i] = entry.mode === 'classic' ? solver.classic(entry.input)
      : entry.mode === 'walls' ? solver.walls(entry.input, entry.wire) : solver.topology(entry.input, entry.wire);
    const ms = (performance.now() - started) / batch;
    // Validate every cover from every batch outside the measured interval.
    for (const result of results) {
      if (entry.topology) {
        const raw = JSON.parse(result);
        if (raw.status !== 'solved') throw new Error(`${solver.label}: ${entry.name}: ${raw.status}`);
        assertTopologySolution(entry, decodeNativeSolution(entry, raw));
      } else assertSolution(entry.input, JSON.parse(result), entry.walls);
    }
    if (round >= 0) samples.push({ solver: solver.label, mode: entry.mode, name: entry.name, round, ms });
  }
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const puzzles = cases.map(entry => ({ name: entry.name, mode: entry.mode,
  medianMs: Object.fromEntries(solvers.map(solver => [solver.label, median(samples
    .filter(row => row.name === entry.name && row.solver === solver.label).map(row => row.ms))])) }));
if (output) writeFileSync(resolve(output), JSON.stringify({ node: process.version, warmups: 1, rounds, batch, puzzles, samples }, null, 2) + '\n');
console.log(`Node ${process.version}; 1 warmup + ${rounds} measured rounds, ${batch} calls per batch; every solution independently validated.`);
for (const mode of ['classic', 'walls', 'bridges', 'warps']) {
  const totals = {};
  for (const solver of solvers) totals[solver.label] = median(Array.from({ length: rounds }, (_, round) =>
    samples.filter(row => row.mode === mode && row.solver === solver.label && row.round === round).reduce((sum, row) => sum + row.ms, 0)));
  console.log(JSON.stringify({ mode, puzzles: cases.filter(entry => entry.mode === mode).length, medianTotalMs: totals }));
}
