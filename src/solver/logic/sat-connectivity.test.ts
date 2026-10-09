import { disconnectedLoops } from './sat-connectivity';

const chars = '.RBY';
const board = (rows: string[]) => Array.from({ length: rows[0].length }, (_, x) => rows.map(row => chars.indexOf(row[x])));

test('finds the endpoint-free loop in a degree-valid SAT model', () => {
    const puzzle = board(['R..R', '....', '....', 'B..B']);
    const model = board(['RRRR', 'BBBB', 'BRRB', 'BRRB']);
    const loops = disconnectedLoops(puzzle, model, []);
    expect(loops).toHaveLength(1);
    expect(loops[0].map(cell => cell.join(',')).sort()).toEqual(['1,2', '1,3', '2,2', '2,3']);
});

test('finds a different loop after the first model has been excluded', () => {
    const puzzle = board(['R..R', '....', '....', 'B..B']);
    const model = board(['RBBR', 'RBBR', 'RRRR', 'BBBB']);
    const loops = disconnectedLoops(puzzle, model, []);
    expect(loops).toHaveLength(1);
    expect(loops[0].map(cell => cell.join(',')).sort()).toEqual(['1,0', '1,1', '2,0', '2,1']);
});

test('wall-separated cells stay separate even when their color matches', () => {
    const puzzle = board(['R.', 'R.']), model = board(['RR', 'RR']);
    expect(disconnectedLoops(puzzle, model, [])).toEqual([]);
    const walls = [{ x: 0, y: 0, side: 'right' as const }, { x: 0, y: 1, side: 'right' as const }];
    expect(disconnectedLoops(puzzle, model, walls)[0].map(cell => cell.join(',')).sort()).toEqual(['1,0', '1,1']);
});

test('connected endpoint paths need no additional SAT constraints', () => {
    expect(disconnectedLoops(board(['R.R', 'B.B', 'Y.Y']), board(['RRR', 'BBB', 'YYY']), [])).toEqual([]);
});
