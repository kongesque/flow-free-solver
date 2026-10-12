import assert from 'node:assert/strict';
import { test } from 'node:test';
import createFlowSolver from '../../public/wasm/flow_solver_c.mjs';
import { assertSolution } from '../fixtures/assert-solution.mjs';
import { generateRectangularPuzzle } from '../../src/solver/logic/puzzle-generator.ts';

const module = await createFlowSolver();
const solve = module.cwrap('solve_puzzle_wasm', 'string', ['string']);
import { smallCovers, smallLayouts } from '../fixtures/classic-oracle.mjs';

test('classic diagonal search agrees with exhaustive 3x3 covers for every 1–3 pair layout', () => {
  const covers = smallCovers();
  const layouts = smallLayouts();
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
