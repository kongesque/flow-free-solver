import { parseSolution, serializeBoard } from './heuristic-solver';

test('serializes column-major boards with nonconsecutive colors', () => {
  expect(serializeBoard([[1, 0, 1], [0, 0, 0], [16, 0, 16]]))
    .toBe('R.p\n...\nR.p\n');
});

test('transposes C row-major results back to UI coordinates', () => {
  expect(parseSolution('[[82,112],[82,112]]', 2)).toEqual([[1, 1], [16, 16]]);
});

test('serializes and transposes rectangular boards without swapping dimensions', () => {
  expect(serializeBoard([[1, 0, 1], [2, 0, 2]])).toBe('RB\n..\nRB\n');
  expect(parseSolution('[[82,66],[82,66],[82,66]]', 2, 3)).toEqual([[1, 1, 1], [2, 2, 2]]);
  expect(() => parseSolution('[[82,66],[82,66],[82,66]]', 3, 2)).toThrow();
});

test('accepts each 19-cell boundary and rejects either dimension at 20', () => {
  for (const [width, height] of [[19, 5], [5, 19], [19, 19]]) {
    const board = Array.from({ length: width }, () => Array(height).fill(0));
    board[0][0] = board[width - 1][height - 1] = 1;
    const rows = serializeBoard(board).trim().split('\n');
    expect(rows).toHaveLength(height);
    expect(rows.every(row => row.length === width)).toBe(true);
  }
  for (const [width, height] of [[20, 5], [5, 20]]) {
    expect(() => serializeBoard(Array.from({ length: width }, () => Array(height).fill(0))))
      .toThrow('between 2 and 19');
  }
});

test('distinguishes unsolvable puzzles from C runtime errors', () => {
  expect(parseSolution('Error: No solution found (result code 1)', 5)).toBeNull();
  expect(() => parseSolution('Error: No solution found (result code 2)', 5)).toThrow();
  expect(() => parseSolution('[[82]]', 5)).toThrow();
});

for (const board of [[], [[1, 1, 1]], [[1, 0], [0, 0]], [[1, 17], [1, 17]]]) {
  test(`rejects invalid board ${JSON.stringify(board)} before crossing the C boundary`, () => {
    expect(() => serializeBoard(board)).toThrow();
  });
}
