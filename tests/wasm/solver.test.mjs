import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import createFlowSolver from '../../public/wasm/flow_solver_c.mjs';
import { assertSolution } from '../fixtures/assert-solution.mjs';

const module = await createFlowSolver();
const solve = module.cwrap('solve_puzzle_wasm', 'string', ['string']);
const fixtures = new URL('../fixtures/puzzles/', import.meta.url);

for (const name of readdirSync(fixtures).filter(name => name.endsWith('.txt')).sort()) {
  test(`compiled C solver: ${name}`, () => {
    const input = readFileSync(new URL(name, fixtures), 'utf8');
    const result = solve(input);
    if (name.startsWith('unsolvable')) {
      assert.match(result, /^Error: No solution found \(result code 1\)/);
    } else if (name.startsWith('search_limit')) {
      assert.equal(result, 'Error: No solution found (result code 2)');
    } else {
      assert.ok(!result.startsWith('Error'), result);
      assertSolution(input, JSON.parse(result));
    }
  });
}

test('solves a 15×15 row cover', () => {
  const input = [...'RBYGOCMmPAWgTbc'].map(color => `${color}${'.'.repeat(13)}${color}`).join('\n') + '\n';
  assertSolution(input, JSON.parse(solve(input)));
});

test('accepts a board fully solved by initial forced moves', () => {
  const input = 'R.R\nB.B\nY.Y\n';
  assertSolution(input, JSON.parse(solve(input)));
});

for (const [width, height] of [[2, 15], [15, 2], [5, 8], [8, 5], [7, 10], [10, 7], [15, 14], [14, 15], [19, 2], [19, 16]]) {
  test(`compiled C solver: rectangular ${width}x${height}`, () => {
    const colors = 'RBYGOCMmPAWgTbcp';
    const input = Array.from({ length: height }, (_, y) =>
      `${colors[y]}${'.'.repeat(width - 2)}${colors[y]}`).join('\n') + '\n';
    assertSolution(input, JSON.parse(solve(input)));
    // Exercise CRLF input, then a square puzzle on the same instance.
    assertSolution(input, JSON.parse(solve(input.replaceAll('\n', '\r\n'))));
    const square = readFileSync(new URL('regular_5x5_01.txt', fixtures), 'utf8');
    assertSolution(square, JSON.parse(solve(square)));
  });
}

for (const [name, input] of Object.entries({
  empty: '', missingRows: 'R.R\n', extraRows: 'R.R\n' + '...\n'.repeat(19),
  oversized: `${'R'.repeat(20)}\n`.repeat(20), unknownColor: 'Q.Q\n...\n...\n',
  missingEndpoint: 'R..\n...\n...\n', extraEndpoint: 'RRR\n...\n...\n',
  nonSquare: 'R.R\n..\n...\n', invalidCharacter: 'R.R\n.!.\n...\n',
})) {
  test(`rejects ${name} input without corrupting the module`, () => {
    assert.equal(solve(input), 'Error: Invalid board');
    const valid = readFileSync(new URL('regular_5x5_01.txt', fixtures), 'utf8');
    assertSolution(valid, JSON.parse(solve(valid)));
  });
}

test('supports repeated calls on the same Wasm instance', () => {
  const input = readFileSync(new URL('regular_5x5_01.txt', fixtures), 'utf8');
  for (let count = 0; count < 30; count++) assertSolution(input, JSON.parse(solve(input)));
});

for (const [width, height] of [[5, 19], [16, 19]]) {
  test(`compiled C solver: transposed boundary ${width}x${height}`, () => {
    const colors = 'RBYGOCMmPAWgTbcp';
    const input = Array.from({ length: height }, (_, y) =>
      y === 0 || y === height - 1 ? colors.slice(0, width) : '.'.repeat(width)).join('\n');
    assertSolution(input, JSON.parse(solve(input)));
  });
}
