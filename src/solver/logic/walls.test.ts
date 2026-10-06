import { hasWall, normalizeWalls, wallAtPoint, wallBetween } from './walls';
import { serializeWalls } from './heuristic-solver';

test('walls block both directions and normalize opposite-side interactions', () => {
    const walls = normalizeWalls([{ x: 1, y: 2, side: 'right' }, { x: 1, y: 2, side: 'right' }], 5, 8);
    expect(walls).toHaveLength(1);
    expect(hasWall(walls, [1, 2], [2, 2])).toBe(true);
    expect(hasWall(walls, [2, 2], [1, 2])).toBe(true);
    expect(hasWall(walls, [1, 2], [1, 3])).toBe(false);
    expect(wallBetween([2, 3], [2, 2])).toEqual({ x: 2, y: 2, side: 'down' });
    expect(serializeWalls([...walls, { x: 4, y: 6, side: 'down' }], 5, 8)).toBe('1,2,R\n4,6,D\n');
});

test('boundary hit targets exclude centers and borders and select one edge at intersections', () => {
    expect(wallAtPoint(1.1, 2.5, 5, 8)).toEqual({ x: 0, y: 2, side: 'right' });
    expect(wallAtPoint(2.5, 3.1, 5, 8)).toEqual({ x: 2, y: 2, side: 'down' });
    expect(wallAtPoint(1, 1, 5, 8)).toEqual({ x: 0, y: 1, side: 'right' });
    for (const [x, y] of [[.5, .5], [0, .5], [5, .5], [.5, 8], [-.1, .5]]) {
        expect(wallAtPoint(x, y, 5, 8)).toBeNull();
    }
});

test('missing legacy walls load empty; malformed walls are rejected instead of dropped', () => {
    expect(normalizeWalls(undefined, 5, 8)).toEqual([]);
    for (const value of [null, {}, [null], [{ x: 4, y: 0, side: 'right' }],
        [{ x: 0, y: 7, side: 'down' }], [{ x: .5, y: 0, side: 'right' }], [{ x: 0, y: 0, side: 'left' }]]) {
        expect(() => normalizeWalls(value, 5, 8)).toThrow(/Invalid wall/);
    }
});
