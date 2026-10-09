import { generateModePuzzle } from '../logic/variant-generator';
import type { GameMode } from '../logic/game-modes';
import { normalizeWalls } from '../logic/walls';

self.onmessage = (event: MessageEvent<{ width: number; height: number; seed: number; mode: GameMode; walls?: unknown }>) => {
    try {
        if (normalizeWalls(event.data.walls, event.data.width, event.data.height).length) {
            throw new Error('Clear walls to generate a puzzle');
        }
        self.postMessage({ puzzle: generateModePuzzle(event.data.width, event.data.height, event.data.mode, event.data.seed) });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
};
