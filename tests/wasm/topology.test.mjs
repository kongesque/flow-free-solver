import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import createModule from '../../public/wasm/flow_solver_c.mjs';
import { warpRows, warpSnake, bridgeCross, largeBridgeCover } from '../fixtures/topology-puzzles.mjs';
import { assertTopologySolution, decodeNativeSolution } from '../fixtures/assert-topology-solution.mjs';

const module = await createModule();
const solve = module.cwrap('solve_puzzle_topology_wasm', 'string', ['string', 'string']);
const wire = ({ mode, topology }) => `V1\nMODE,${mode === 'warps' ? 'W' : 'B'}\n` +
  topology.walls.map(w => `W,${w.x},${w.y},${w.side === 'right' ? 'R' : 'D'}\n`).join('') +
  [...topology.bridges].reverse().map(b => `B,${b.x},${b.y},${b.over === 'horizontal' ? 'H' : 'V'}\n`).join('') +
  topology.warps.map(w => `S,${w.axis === 'horizontal' ? 'H' : 'V'},${w.index}\n`).join('');

for (const fixture of [warpRows(), warpRows(8, 5), warpRows(15, 15), warpRows(19, 16), warpRows(19, 16, true), warpSnake(), warpRows(8, 5, true), bridgeCross(), bridgeCross(true), bridgeCross(false, 'vertical'), largeBridgeCover(), largeBridgeCover(19)]) {
  test(`real C graph cover: ${fixture.mode} ${fixture.width}x${fixture.height}`, () => {
    const result = JSON.parse(solve(fixture.input, wire(fixture)));
    assert.equal(result.status, 'solved');
    assertTopologySolution(fixture, decodeNativeSolution(fixture, result));
  });
}

test('closing a required seam is unsatisfiable; duplicate records and CRLF are accepted', () => {
  const f = warpRows();
  assert.equal(JSON.parse(solve(f.input, wire(f).replace('S,H,0\n', ''))).status, 'unsatisfiable');
  const result = JSON.parse(solve(f.input, (wire(f) + 'S,H,0\n').trimEnd().replaceAll('\n', '\r\n')));
  assert.equal(result.status, 'solved');
  assertTopologySolution(f, decodeNativeSolution(f, result));
});

for (const topology of ['', 'V2\nMODE,W\n', 'V1\nMODE,X\n', 'V1\nMODE,W\nS,H,5', 'V1\nMODE,W\nS,H,-1', 'V1\nMODE,W\nS,H,0junk',
  'V1\nMODE,B\nB,0,0,H', 'V1\nMODE,W\nB,2,2,H', 'V1\nMODE,B\nS,H,0', 'V1\nMODE,B\nB,2,2,H\nW,2,2,R',
  'V1\nMODE,B\nB,2,2,H\nB,2,2,V', 'V1\nMODE,B\nW,4,0,R', 'V1\nMODE,W\n\n', 'V1\rMODE,W']) {
  test(`rejects malformed topology ${JSON.stringify(topology)}`, () => {
    assert.equal(JSON.parse(solve(warpRows().input, topology)).status, 'invalid');
  });
}

test('repeated variant, invalid and Standard calls do not retain topology', () => {
  const legacy = module.cwrap('solve_puzzle_wasm', 'string', ['string']);
  for (let i = 0; i < 5; i++) {
    for (const f of [bridgeCross(), warpRows()]) {
      const result = JSON.parse(solve(f.input, wire(f)));
      assertTopologySolution(f, decodeNativeSolution(f, result));
      assert.equal(JSON.parse(solve(f.input, 'invalid')).status, 'invalid');
    }
    assert.ok(Array.isArray(JSON.parse(legacy('R...R\nB...B\nY...Y\nG...G\nO...O\n'))));
  }
});

test('exhausting graph search reports limit rather than unsatisfiable and frees its state', () => {
  const input = readFileSync(new URL('../fixtures/puzzles/generated_13x13_seed42.txt', import.meta.url), 'utf8');
  const result = JSON.parse(solve(input, 'V1\nMODE,W\nS,H,0\n'));
  assert.equal(result.status, 'limit');
  assert.ok(result.nodeCount > 0 && result.nodeCount <= 2000001);
  assert.equal(result.paths, undefined);
  const f = bridgeCross(), next = JSON.parse(solve(f.input, wire(f)));
  assertTopologySolution(f, decodeNativeSolution(f, next));
});

test('fully wrapped and unused seams still yield independently valid covers', () => {
  const f = warpRows();
  f.topology.warps.push(...Array.from({ length: f.width }, (_, index) => ({ axis: 'vertical', index })));
  const result = JSON.parse(solve(f.input, wire(f)));
  assert.equal(result.status, 'solved'); assertTopologySolution(f, decodeNativeSolution(f, result));
  const plain = { ...f, input: 'R...R\nB...B\nY...Y\nG...G\nO...O\n',
    board: Array.from({ length: 5 }, (_, x) => Array.from({ length: 5 }, (_, y) => x === 0 || x === 4 ? y + 1 : 0)),
    topology: { walls: [], bridges: [], warps: f.topology.warps } };
  const cover = JSON.parse(solve(plain.input, wire(plain)));
  assert.equal(cover.status, 'solved'); assertTopologySolution(plain, decodeNativeSolution(plain, cover));
});

test('graph pruning agrees with a tiny exhaustive oracle, including odd wrapped cycles', () => {
  // Independent unpruned path enumeration, 3x3 boards with two colors.
  function oracle(f) {
    const neighbors = Array.from({ length: 9 }, () => new Set());
    const add = (a, b) => { neighbors[a].add(b); neighbors[b].add(a); };
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) for (const [dx, dy, side] of [[1, 0, 'right'], [0, 1, 'down']]) {
      if (x + dx < 3 && y + dy < 3 && !f.topology.walls.some(w => w.x === x && w.y === y && w.side === side)) add(y * 3 + x, (y + dy) * 3 + x + dx);
    }
    for (const s of f.topology.warps) add(s.axis === 'horizontal' ? s.index * 3 : s.index,
      s.axis === 'horizontal' ? s.index * 3 + 2 : s.index + 6);
    const pairs = [1, 2].map(c => Array.from({ length: 9 }, (_, id) => id).filter(id => f.board[id % 3][Math.floor(id / 3)] === c));
    const occupied = new Set(pairs.flat());
    function nextColor(color) {
      if (color === 2) return occupied.size === 9;
      const [start, goal] = pairs[color];
      function path(id) {
        for (const n of neighbors[id]) {
          if (n === goal) { if (nextColor(color + 1)) return true; }
          else if (!occupied.has(n)) {
            occupied.add(n); if (path(n)) return true; occupied.delete(n);
          }
        }
        return false;
      }
      return path(start);
    }
    return nextColor(0);
  }
  let seed = 7331;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let i = 0; i < 80; i++) {
    const board = Array.from({ length: 3 }, () => Array(3).fill(0));
    const cells = Array.from({ length: 9 }, (_, id) => id);
    for (let j = 8; j > 0; j--) { const k = random(j + 1); [cells[j], cells[k]] = [cells[k], cells[j]]; }
    cells.slice(0, 4).forEach((id, j) => { board[id % 3][Math.floor(id / 3)] = j < 2 ? 1 : 2; });
    const topology = { walls: [], bridges: [], warps: [] };
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      if (x < 2 && random(4) === 0) topology.walls.push({ x, y, side: 'right' });
      if (y < 2 && random(4) === 0) topology.walls.push({ x, y, side: 'down' });
    }
    for (const axis of ['horizontal', 'vertical']) for (let index = 0; index < 3; index++) if (random(2)) topology.warps.push({ axis, index });
    const f = { width: 3, height: 3, mode: 'warps', board, topology,
      input: Array.from({ length: 3 }, (_, y) => board.map(col => '.RB'[col[y]]).join('')).join('\n') };
    const result = JSON.parse(solve(f.input, wire(f)));
    assert.equal(result.status === 'solved', oracle(f), `Oracle disagreement at seed ${i}`);
    assert.notEqual(result.status, 'limit');
    if (result.status === 'solved') assertTopologySolution(f, decodeNativeSolution(f, result));
  }
});
