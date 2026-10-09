import type { Board } from './astar-solver';

export type Block = { x: number; y: number };
export const blockKey = ({ x, y }: Block) => `${x},${y}`;

/** Missing blocks preserve older puzzles. A block can never hide an endpoint. */
export function normalizeBlocks(input: unknown, board: Board): Block[] {
    if (input === undefined) return [];
    if (!Array.isArray(input) || input.length > board.length * board[0].length) throw new Error('Invalid blocks');
    const blocks = new Map<string, Block>();
    for (const block of input) {
        if (!block || !Number.isInteger(block.x) || !Number.isInteger(block.y) ||
            block.x < 0 || block.y < 0 || block.x >= board.length || block.y >= board[0].length) throw new Error('Invalid block position');
        if (board[block.x][block.y]) throw new Error('Remove this dot before adding a block');
        blocks.set(blockKey(block), { x: block.x, y: block.y });
    }
    return [...blocks.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}
