import type { Cell } from './astar-solver';

/** Each blocked boundary is stored once, in column-major editor coordinates. */
export type Wall = { x: number; y: number; side: 'right' | 'down' };
export type EditTool = 'dots' | 'walls';

export const wallKey = ({ x, y, side }: Wall) => `${x},${y},${side}`;

/** Validate untrusted saves/worker requests; never silently drop a wall. */
export function normalizeWalls(input: unknown, width: number, height: number): Wall[] {
    if (input === undefined) return [];
    if (!Array.isArray(input) || input.length > 2 * width * height) throw new Error('Invalid walls');
    const unique = new Map<string, Wall>();
    for (const value of input) {
        if (!value || typeof value !== 'object') throw new Error('Invalid wall');
        const { x, y, side } = value;
        if (!Number.isInteger(x) || !Number.isInteger(y) || (side !== 'right' && side !== 'down') ||
            x < 0 || y < 0 || x >= width || y >= height ||
            (side === 'right' ? x >= width - 1 : y >= height - 1)) throw new Error('Invalid wall boundary');
        const wall: Wall = { x, y, side };
        unique.set(wallKey(wall), wall);
    }
    return [...unique.values()].sort((a, b) => a.y - b.y || a.x - b.x || a.side.localeCompare(b.side));
}

export function wallBetween([x, y]: Cell, [nx, ny]: Cell): Wall | null {
    if (y === ny && Math.abs(nx - x) === 1) return { x: Math.min(x, nx), y, side: 'right' };
    if (x === nx && Math.abs(ny - y) === 1) return { x, y: Math.min(y, ny), side: 'down' };
    return null;
}

export function hasWall(walls: readonly Wall[], from: Cell, to: Cell): boolean {
    const wall = wallBetween(from, to);
    return wall !== null && walls.some(value => wallKey(value) === wallKey(wall));
}

/** Snap to one internal boundary. Cell centers and outer borders do nothing. */
export function wallAtPoint(gx: number, gy: number, width: number, height: number, preferred?: Wall['side']): Wall | null {
    if (gx < 0 || gy < 0 || gx >= width || gy >= height) return null;
    const vx = Math.round(gx), hy = Math.round(gy);
    const vertical = vx > 0 && vx < width && Math.abs(gx - vx) <= .22;
    const horizontal = hy > 0 && hy < height && Math.abs(gy - hy) <= .22;
    const dx = Math.abs(gx - vx), dy = Math.abs(gy - hy);
    if (vertical && (!horizontal || dx < dy - 1e-6 || (Math.abs(dx - dy) <= 1e-6 && preferred !== 'down'))) {
        return { x: vx - 1, y: Math.floor(gy), side: 'right' };
    }
    return horizontal ? { x: Math.floor(gx), y: hy - 1, side: 'down' } : null;
}
