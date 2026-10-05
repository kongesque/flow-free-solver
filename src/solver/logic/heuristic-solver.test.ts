import { parseSolution, serializeBoard } from './heuristic-solver';

test('serializes column-major boards with nonconsecutive colors', () => {
  expect(serializeBoard([[1, 0, 1], [0, 0, 0], [16, 0, 16]]))
    .toBe('R.p\n...\nR.p\n');
});

test('transposes C row-major results back to UI coordinates', () => {
  expect(parseSolution('[[82,112],[82,112]]', 2)).toEqual([[1, 1], [16, 16]]);
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
