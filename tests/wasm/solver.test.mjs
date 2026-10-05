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
    } else {
      assert.ok(!result.startsWith('Error'), result);
      assertSolution(input, JSON.parse(result));
    }
  });
}

test('solves the maximum 15×15 board', () => {
  const input = [...'RBYGOCMmPAWgTbc'].map(color => `${color}${'.'.repeat(13)}${color}`).join('\n') + '\n';
  assertSolution(input, JSON.parse(solve(input)));
});

test('accepts a board fully solved by initial forced moves', () => {
  const input = 'R.R\nB.B\nY.Y\n';
  assertSolution(input, JSON.parse(solve(input)));
});

for (const [name, input] of Object.entries({
  empty: '', missingRows: 'R.R\n...\n', extraRows: 'R.R\n...\n...\n...\n',
  oversized: `${'R'.repeat(16)}\n`.repeat(16), unknownColor: 'Q.Q\n...\n...\n',
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
