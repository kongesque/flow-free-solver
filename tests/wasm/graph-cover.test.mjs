import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import createModule from '../../public/wasm/flow_solver_c.mjs';
import { assertSolution } from '../fixtures/assert-solution.mjs';
import { assertTopologySolution, decodeNativeSolution } from '../fixtures/assert-topology-solution.mjs';
import { bridgeScreenshot } from '../fixtures/bridge-screenshot.mjs';
import { blockRows, blockWire } from '../fixtures/block-puzzles.mjs';

registerHooks({ resolve(specifier, context, next) {
  return next(context.parentURL?.endsWith('.ts') && /^\.{1,2}\//.test(specifier) && !specifier.split('/').at(-1).includes('.')
    ? `${specifier}.ts` : specifier, context);
} });
const { generateModePuzzle } = await import('../../src/solver/logic/variant-generator.ts');
const module = await createModule();
const walls = module.cwrap('solve_puzzle_with_walls_wasm', 'string', ['string', 'string']);
const topology = module.cwrap('solve_puzzle_topology_wasm', 'string', ['string', 'string']);
const chars = '.RBYGOCMmPAWgTbcp';
const inputFor = f => Array.from({ length: f.height }, (_, y) => f.board.map((col, x) =>
  f.topology.blocks?.some(b => b.x === x && b.y === y) ? '#' : chars[col[y]]).join('')).join('\n');

for (const [width, height] of [[13, 13], [19, 19], [19, 13], [13, 19]]) for (const mode of ['standard', 'bridges', 'warps']) {
  test(`graph probe covers uncached ${mode} ${width}x${height} seed 42`, () => {
    const f = generateModePuzzle(width, height, mode, 42);
    if (mode === 'standard') {
      // Sparse walls leave real branching, while preserving the known cover.
      for (let y = 0; y < height; y++) for (let x = 0; x + 1 < width; x++) {
        if ((x * 7 + y * 11) % 7 === 0 && f.solution[x][y] !== f.solution[x + 1][y]) f.topology.walls.push({ x, y, side: 'right' });
      }
      const input = inputFor(f), wire = f.topology.walls.map(w => `${w.x},${w.y},R\n`).join('');
      assertSolution(input, JSON.parse(walls(input, wire)), f.topology.walls);
    } else {
      const raw = JSON.parse(topology(inputFor(f), blockWire(f)));
      assert.equal(raw.status, 'solved'); assert.equal(raw.searchMethod, 'pruned-dfs');
      assertTopologySolution(f, decodeNativeSolution(f, raw));
    }
  });
}

for (const mode of ['standard', 'bridges', 'warps']) {
  test(`graph probe combines Blocks and walls with ${mode} on 13x13`, () => {
    const f = generateModePuzzle(13, 13, mode, 42);
    const bridges = f.topology.bridges;
    // Remove an entire path, avoiding bridge sides and active seam borders.
    // The other paths remain a witness; none is passed to the native solver.
    const removable = f.pathSolution.paths.find(path => path.nodes.every(n =>
      !bridges.some(b => Math.abs(b.x - n.x) + Math.abs(b.y - n.y) <= 1) &&
      !f.topology.warps.some(s => s.axis === 'horizontal'
        ? n.y === s.index && (n.x === 0 || n.x + 1 === f.width)
        : n.x === s.index && (n.y === 0 || n.y + 1 === f.height))));
    assert.ok(removable, 'Fixture must retain a valid removable path');
    f.topology.blocks = removable.nodes.map(({ x, y }) => ({ x, y }));
    f.board = f.board.map(col => col.map(c => c === removable.color ? 0 : c));
    const witness = { version: 1, paths: f.pathSolution.paths.filter(p => p !== removable) };
    const owner = new Map(witness.paths.flatMap(p => p.nodes.map(n => [`${n.x},${n.y}`, p.color])));
    for (let y = 0; y < f.height; y++) for (let x = 0; x + 1 < f.width; x++) {
      if (!owner.has(`${x},${y}`) || !owner.has(`${x + 1},${y}`) || owner.get(`${x},${y}`) === owner.get(`${x + 1},${y}`) ||
          bridges.some(b => b.y === y && (b.x === x || b.x === x + 1))) continue;
      if ((x + y) % 3 === 0) f.topology.walls.push({ x, y, side: 'right' });
    }
    assert.ok(f.topology.walls.length && f.topology.blocks.length);
    assertTopologySolution(f, witness);
    const input = inputFor(f);
    if (mode === 'standard') {
      const wire = f.topology.walls.map(w => `${w.x},${w.y},R\n`).join('');
      assertSolution(input, JSON.parse(walls(input, wire)), f.topology.walls);
    } else {
      const raw = JSON.parse(topology(input, blockWire(f)));
      assert.equal(raw.status, 'solved'); assert.equal(raw.searchMethod, 'pruned-dfs');
      assertTopologySolution(f, decodeNativeSolution(f, raw));
    }
  });
}

test('graph probe covers the previously limited 12x15 Bridges screenshot without a candidate', () => {
  const f = bridgeScreenshot(), raw = JSON.parse(topology(f.input, blockWire(f)));
  assert.equal(raw.status, 'solved'); assert.equal(raw.searchMethod, 'pruned-dfs');
  assertTopologySolution(f, decodeNativeSolution(f, raw));
});

test('masked Classic and variant calls retain their different self-touch rules', () => {
  const input = 'RR#\n..#\n###\n';
  assert.match(walls(input, ''), /result code 1/);
  const f = { width: 3, height: 3, board: [[1, 0, 0], [1, 0, 0], [0, 0, 0]],
    topology: { blocks: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }], bridges: [], walls: [], warps: [] } };
  for (const mode of ['bridges', 'warps']) {
    const fixture = { ...f, mode }, raw = JSON.parse(topology(input, blockWire(fixture)));
    assert.equal(raw.status, 'solved'); assertTopologySolution(fixture, decodeNativeSolution(fixture, raw));
  }
  const next = blockRows();
  assertSolution(next.input, JSON.parse(walls(next.input, '')));
});

test('relaxed graph probe finds a self-touching cover after the induced attempt fails', () => {
  // A single-color 4x4 cover needs unselected same-color contacts. The wall
  // blocks the direct endpoint join; the fifth row is entirely excluded.
  const input = 'RR..\n....\n....\n....\n####\n';
  const board = Array.from({ length: 4 }, (_, x) => Array.from({ length: 5 }, (_, y) => y === 0 && x < 2 ? 1 : 0));
  const f = { width: 4, height: 5, board, topology: { bridges: [], warps: [],
    blocks: Array.from({ length: 4 }, (_, x) => ({ x, y: 4 })), walls: [{ x: 0, y: 0, side: 'right' }] } };
  assert.match(walls(input, '0,0,R\n'), /result code 1/);
  for (const mode of ['bridges', 'warps']) {
    const fixture = { ...f, mode }, raw = JSON.parse(topology(input, blockWire(fixture)));
    assert.equal(raw.status, 'solved'); assert.equal(raw.searchMethod, 'pruned-dfs');
    assertTopologySolution(fixture, decodeNativeSolution(fixture, raw));
  }
});
