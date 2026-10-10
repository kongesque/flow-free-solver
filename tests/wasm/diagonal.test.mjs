import assert from 'node:assert/strict';
import { test } from 'node:test';
import createFlowSolver from '../../public/wasm/flow_solver_c.mjs';
import { assertSolution } from '../fixtures/assert-solution.mjs';
import { generateRectangularPuzzle } from '../../src/solver/logic/puzzle-generator.ts';

const module = await createFlowSolver();
const solve = module.cwrap('solve_puzzle_wasm', 'string', ['string']);
const chars = 'RBY';
const text = cells => [0, 3, 6].map(start => cells.slice(start, start + 3).join('')).join('\n');
const neighbors = id => [id % 3 ? id - 1 : -1, id % 3 < 2 ? id + 1 : -1,
  id >= 3 ? id - 3 : -1, id < 6 ? id + 3 : -1].filter(id => id >= 0);

// Exhaustive oracle over filled color boards, independent of the solver's
// edge traversal, components, pruning and rollback. Derive endpoints only
// from valid induced paths, then canonicalize colors by their first endpoint.
function smallCovers() {
  const covers = new Set();
  const cells = Array(9).fill(0);
  function visit(id, largest) {
    if (id < 9) {
      for (let color = 0; color <= Math.min(2, largest + 1); color++) {
        cells[id] = color;
        visit(id + 1, Math.max(largest, color));
      }
      return;
    }
    const endpoints = [];
    for (let color = 0; color <= largest; color++) {
      const group = cells.flatMap((c, id) => c === color ? [id] : []);
      const ends = [];
      for (const id of group) {
        const degree = neighbors(id).filter(n => cells[n] === color).length;
        if (degree === 1) ends.push(id);
        else if (degree !== 2) return;
      }
      if (ends.length !== 2) return;
      const seen = new Set([ends[0]]), queue = [ends[0]];
      for (const id of queue) for (const n of neighbors(id)) {
        if (cells[n] === color && !seen.has(n)) { seen.add(n); queue.push(n); }
      }
      if (seen.size !== group.length) return;
      endpoints.push(ends);
    }
    endpoints.sort((a, b) => a[0] - b[0]);
    const puzzle = Array(9).fill('.');
    endpoints.forEach((ends, color) => ends.forEach(id => { puzzle[id] = chars[color]; }));
    covers.add(text(puzzle));
  }
  visit(0, -1);
  return covers;
}

test('classic diagonal search agrees with exhaustive 3x3 covers for every 1–3 pair layout', () => {
  const covers = smallCovers();
  const layouts = new Set();
  function pair(remaining, puzzle, count) {
    if (!remaining.length) { layouts.add(text(puzzle)); return; }
    const [first, ...rest] = remaining;
    for (const last of rest) {
      const next = [...puzzle]; next[first] = next[last] = chars[count];
      pair(rest.filter(id => id !== last), next, count + 1);
    }
  }
  for (let mask = 0; mask < 512; mask++) {
    const endpoints = Array.from({ length: 9 }, (_, id) => id).filter(id => mask & (1 << id));
    if ([2, 4, 6].includes(endpoints.length)) pair(endpoints, Array(9).fill('.'), 0);
  }
  assert.equal(layouts.size, 1674);
  assert.ok(covers.size > 0);
  for (const input of layouts) {
    const result = solve(input);
    if (covers.has(input)) {
      assert.ok(!result.startsWith('Error'), `${input}\n${result}`);
      assertSolution(input, JSON.parse(result));
    } else assert.equal(result, 'Error: No solution found (result code 1)', input);
  }
});

test('rejects degree-valid disconnected cycles and resets before the next cover', () => {
  const impossible = 'R..R\n....\n....\nB..B\n';
  assert.equal(solve(impossible), 'Error: No solution found (result code 1)');
  const cover = 'R..R\nB..B\nY..Y\n';
  assertSolution(cover, JSON.parse(solve(cover)));
});

for (const [width, height] of [[13, 13], [19, 19], [19, 13], [13, 19]]) {
  for (const seed of [16, 42]) {
    test(`real C search covers large generated ${width}x${height} seed ${seed} without a candidate`, () => {
      const { board } = generateRectangularPuzzle(width, height, seed);
      const chars = '.RBYGOCMmPAWgTbcp';
      const input = Array.from({ length: height }, (_, y) => board.map(column => chars[column[y]]).join('')).join('\n');
      const result = solve(input);
      assert.ok(!result.startsWith('Error'), result);
      assertSolution(input, JSON.parse(result));
    });
  }
}
