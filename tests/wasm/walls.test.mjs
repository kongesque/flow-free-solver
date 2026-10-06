import assert from 'node:assert/strict';
import { test } from 'node:test';
import createFlowSolver from '../../public/wasm/flow_solver_c.mjs';
import { assertSolution } from '../fixtures/assert-solution.mjs';
import { wallCorridor, wallDetour, wallText } from '../fixtures/wall-puzzles.mjs';

const module = await createFlowSolver();
const solve = module.cwrap('solve_puzzle_with_walls_wasm', 'string', ['string', 'string']);
const legacy = module.cwrap('solve_puzzle_wasm', 'string', ['string']);

for (const [width, height] of [[5, 5], [5, 8], [8, 5], [2, 15], [15, 2], [15, 15]]) {
  test(`wall corridor ${width}x${height} covers every cell through open boundaries`, () => {
    const { input, walls } = wallCorridor(width, height);
    const result = solve(input, wallText(walls));
    assert.ok(!result.startsWith('Error'), result);
    assertSolution(input, JSON.parse(result), walls);
    const cut = [...walls, { x: 0, y: 0, side: 'right' }];
    assert.match(solve(input, wallText(cut)), /^Error: No solution found \(result code 1\)/);
  });
}

test('adjacent endpoints across a wall take the multi-color detour', () => {
  const { input, walls } = wallDetour;
  const solution = JSON.parse(solve(input, wallText(walls)));
  assertSolution(input, solution, walls);
  assert.ok(solution[0].every(code => code === 82));
  assert.ok(solution[1].every(code => code === 82));
  assert.throws(() => assertSolution(input, solution), /Invalid path degree/);
});

test('wall parsing accepts duplicates and CRLF; calls do not retain walls', () => {
  const { input, walls } = wallDetour;
  assertSolution(input, JSON.parse(solve(input, wallText([...walls, walls[0]]).replaceAll('\n', '\r\n'))), walls);
  const empty = 'R.R\nB.B\nY.Y\n';
  for (let i = 0; i < 5; i++) {
    assertSolution(empty, JSON.parse(legacy(empty)));
    assertSolution(empty, JSON.parse(solve(empty, '')));
    assertSolution(input, JSON.parse(solve(input, wallText(walls))), walls);
  }
});

for (const value of ['-1,0,R', '0,0,L', '4,0,R', '0,4,D', '0,5,R', '999999,0,R', '0,0,Rjunk',
  '0,0,R\r', '0,0,R\n\n', '0,0', ' 0,0,R', '0,0,R\n'.repeat(51)]) {
  test(`rejects malformed walls ${JSON.stringify(value.slice(0, 25))}`, () => {
    assert.equal(solve(wallDetour.input, value), 'Error: Invalid walls');
    const { input, walls } = wallDetour;
    assertSolution(input, JSON.parse(solve(input, wallText(walls))), walls);
  });
}
