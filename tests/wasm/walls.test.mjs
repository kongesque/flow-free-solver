import assert from 'node:assert/strict';
import { test } from 'node:test';
import createFlowSolver from '../../public/wasm/flow_solver_c.mjs';
import { assertSolution } from '../fixtures/assert-solution.mjs';
import { wallCorridor, wallDetour, wallText } from '../fixtures/wall-puzzles.mjs';
import { generateRectangularPuzzle } from '../../src/solver/logic/puzzle-generator.ts';

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

test('disconnected wall regions can be solved when each has its own pair', () => {
  const input = 'R.R\nB.B\nY.Y\n';
  const walls = Array.from({ length: 6 }, (_, i) => ({ x: i % 3, y: Math.floor(i / 3), side: 'down' }));
  assertSolution(input, JSON.parse(solve(input, wallText(walls))), walls);
  const allEndpoints = 'RR\nBB\n';
  assertSolution(allEndpoints, JSON.parse(solve(allEndpoints, '')));
  assert.match(solve(allEndpoints, '0,0,R'), /^Error: No solution found \(result code 1\)/);
});

for (const [width, height] of [[5, 5], [5, 8], [8, 5]]) {
  test(`solves 20 generated ${width}x${height} boards with walls outside their known paths`, () => {
    const chars = '.RBYGOCMmPAWgTbcp';
    for (let seed = 0; seed < 20; seed++) {
      const puzzle = generateRectangularPuzzle(width, height, seed);
      const input = Array.from({ length: height }, (_, y) =>
        Array.from({ length: width }, (_, x) => chars[puzzle.board[x][y]]).join('')).join('\n');
      const walls = [];
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (x + 1 < width && puzzle.solution[x][y] !== puzzle.solution[x + 1][y] && (x + y + seed) % 3 !== 0) {
          walls.push({ x, y, side: 'right' });
        }
        if (y + 1 < height && puzzle.solution[x][y] !== puzzle.solution[x][y + 1] && (x + y + seed) % 2 === 0) {
          walls.push({ x, y, side: 'down' });
        }
      }
      const known = Array.from({ length: height }, (_, y) =>
        Array.from({ length: width }, (_, x) => chars.charCodeAt(puzzle.solution[x][y])));
      assertSolution(input, known, walls);
      const result = solve(input, wallText(walls));
      assert.ok(!result.startsWith('Error'), `Seed ${seed}: ${result}`);
      assertSolution(input, JSON.parse(result), walls);
    }
  });
}

for (const value of ['-1,0,R', '0,0,L', '4,0,R', '0,4,D', '0,5,R', '999999,0,R', '0,0,Rjunk',
  '0,0,R\r', '0,0,R\n\n', '0,0', ' 0,0,R', '0,0,R\n'.repeat(51)]) {
  test(`rejects malformed walls ${JSON.stringify(value.slice(0, 25))}`, () => {
    assert.equal(solve(wallDetour.input, value), 'Error: Invalid walls');
    const { input, walls } = wallDetour;
    assertSolution(input, JSON.parse(solve(input, wallText(walls))), walls);
  });
}
