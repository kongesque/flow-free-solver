import { generateModePuzzle } from '../logic/variant-generator';
import type { GameMode } from '../logic/game-modes';
import { normalizeWalls } from '../logic/walls';
import { normalizeBlocks } from '../logic/blocks';
import { MAX_BOARD_SIZE } from '../logic/board-limits';

self.onmessage = (event: MessageEvent<{ width: number; height: number; seed: number; mode: GameMode; walls?: unknown; blocks?: unknown }>) => {
    try {
        const { width, height } = event.data;
        if (![width, height].every(n => Number.isInteger(n) && n >= 5 && n <= MAX_BOARD_SIZE)) throw new Error('Invalid generator dimensions');
        if (event.data.blocks !== undefined && normalizeBlocks(event.data.blocks, Array.from({ length: width }, () => Array(height).fill(0))).length) {
            throw new Error('Clear blocks to generate a puzzle');
        }
        if (normalizeWalls(event.data.walls, event.data.width, event.data.height).length) {
            throw new Error('Clear walls to generate a puzzle');
        }
        self.postMessage({ puzzle: generateModePuzzle(event.data.width, event.data.height, event.data.mode, event.data.seed) });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
};
