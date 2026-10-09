import { MAX_BOARD_SIZE } from './board-limits';
import type { Board } from './astar-solver';
import type { GameMode } from './game-modes';
import { hasWall, normalizeWalls, type Wall } from './walls';
import { blockKey, normalizeBlocks, type Block } from './blocks';

export type Bridge = { x: number; y: number; over: 'horizontal' | 'vertical' };
export type WarpSeam = { axis: 'horizontal' | 'vertical'; index: number };
export type PuzzleTopology = { walls: Wall[]; bridges: Bridge[]; warps: WarpSeam[]; blocks?: Block[] };
export type PathNode = { x: number; y: number; lane: 'cell' | 'horizontal' | 'vertical' };
export const bridgeKey = ({ x, y }: Bridge) => `${x},${y}`;
export const seamKey = ({ axis, index }: WarpSeam) => `${axis},${index}`;
export const nodeKey = ({ x, y, lane }: PathNode) => `${x},${y},${lane}`;

export function validateBoard(board: unknown): asserts board is Board {
    if (!Array.isArray(board) || board.length < 2 || board.length > MAX_BOARD_SIZE ||
        !Array.isArray(board[0]) || board[0].length < 2 || board[0].length > MAX_BOARD_SIZE ||
        board.some(column => !Array.isArray(column) || column.length !== board[0].length ||
            column.some(value => !Number.isInteger(value) || value < 0 || value > 16))) {
        throw new Error('Invalid board format');
    }
}

/** Reject incompatible data rather than silently solving a different puzzle. */
export function normalizeTopology(input: unknown, board: Board, mode: GameMode): PuzzleTopology {
    validateBoard(board);
    if (!['standard', 'bridges', 'warps'].includes(mode)) throw new Error(`${mode} mode is not available yet`);
    if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) throw new Error('Invalid topology');
    const raw = (input ?? {}) as Partial<PuzzleTopology>;
    const width = board.length, height = board[0].length;
    const walls = normalizeWalls(raw.walls, width, height);
    const blocks = normalizeBlocks(raw.blocks, board);
    const blocked = new Set(blocks.map(blockKey));
    const bridges = new Map<string, Bridge>();
    const warps = new Map<string, WarpSeam>();
    if (raw.bridges !== undefined && (!Array.isArray(raw.bridges) || raw.bridges.length > width * height)) throw new Error('Invalid bridges');
    if (raw.warps !== undefined && (!Array.isArray(raw.warps) || raw.warps.length > width + height)) throw new Error('Invalid warps');
    for (const bridge of raw.bridges ?? []) {
        if (!bridge || !Number.isInteger(bridge.x) || !Number.isInteger(bridge.y) ||
            bridge.x < 1 || bridge.y < 1 || bridge.x >= width - 1 || bridge.y >= height - 1 ||
            !['horizontal', 'vertical'].includes(bridge.over)) throw new Error('Bridges must be interior cells');
        if (board[bridge.x][bridge.y]) throw new Error('Remove this dot before adding a bridge');
        if (blocked.has(blockKey(bridge))) throw new Error('Remove this block before adding a bridge');
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
            blocked.has(`${bridge.x + dx},${bridge.y + dy}`) || hasWall(walls, [bridge.x, bridge.y], [bridge.x + dx, bridge.y + dy]))) {
            throw new Error('This bridge needs all four sides open');
        }
        const value = { x: bridge.x, y: bridge.y, over: bridge.over };
        const previous = bridges.get(bridgeKey(value));
        if (previous && previous.over !== value.over) throw new Error('Conflicting bridge orientations');
        bridges.set(bridgeKey(value), value);
    }
    for (const seam of raw.warps ?? []) {
        if (!seam || !['horizontal', 'vertical'].includes(seam.axis) || !Number.isInteger(seam.index) ||
            seam.index < 0 || seam.index >= (seam.axis === 'horizontal' ? height : width)) throw new Error('Invalid warp seam');
        if (seam.axis === 'horizontal'
            ? blocked.has(`0,${seam.index}`) || blocked.has(`${width - 1},${seam.index}`)
            : blocked.has(`${seam.index},0`) || blocked.has(`${seam.index},${height - 1}`)) throw new Error('Remove border blocks before opening this warp');
        warps.set(seamKey(seam), { axis: seam.axis, index: seam.index });
    }
    if (bridges.size && mode !== 'bridges') throw new Error('Bridges require Bridges mode');
    if (warps.size && mode !== 'warps') throw new Error('Warps require Warps mode');
    return { walls, ...(blocks.length ? { blocks } : {}), bridges: [...bridges.values()].sort((a, b) => a.y - b.y || a.x - b.x),
        warps: [...warps.values()].sort((a, b) => a.axis.localeCompare(b.axis) || a.index - b.index) };
}

/** Native IDs use row-major cells followed by vertical bridge lanes. */
export function topologyGraph(width: number, height: number, topology: PuzzleTopology) {
    const bridgeMap = new Map(topology.bridges.map((bridge, i) => [bridgeKey(bridge), i]));
    const nodes: PathNode[] = Array.from({ length: width * height }, (_, id) => {
        const x = id % width, y = Math.floor(id / width);
        return { x, y, lane: bridgeMap.has(`${x},${y}`) ? 'horizontal' : 'cell' };
    });
    nodes.push(...topology.bridges.map(({ x, y }) => ({ x, y, lane: 'vertical' as const })));
    const blocked = new Set((topology.blocks ?? []).map(blockKey));
    // Retain stable native IDs; inactive slots never have edges or require coverage.
    const active = nodes.map(node => !blocked.has(blockKey(node)));
    const edges: number[][] = nodes.map(() => []);
    const idAt = (x: number, y: number, axis: 'horizontal' | 'vertical') => {
        const bridge = bridgeMap.get(`${x},${y}`);
        return bridge !== undefined && axis === 'vertical' ? width * height + bridge : y * width + x;
    };
    const add = (a: number, b: number) => {
        if (!active[a] || !active[b]) return;
        if (!edges[a].includes(b)) edges[a].push(b);
        if (!edges[b].includes(a)) edges[b].push(a);
    };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
            if (x + dx >= width || y + dy >= height || hasWall(topology.walls, [x, y], [x + dx, y + dy])) continue;
            const axis = dx ? 'horizontal' : 'vertical';
            add(idAt(x, y, axis), idAt(x + dx, y + dy, axis));
        }
    }
    for (const { axis, index } of topology.warps) {
        if (axis === 'horizontal') add(idAt(0, index, axis), idAt(width - 1, index, axis));
        else add(idAt(index, 0, axis), idAt(index, height - 1, axis));
    }
    return { nodes, edges, active };
}
