import { generateRectangularPuzzle } from '../logic/puzzle-generator';
import { requireStandardMode, type GameMode } from '../logic/game-modes';
import { normalizeWalls } from '../logic/walls';

self.onmessage = (event: MessageEvent<{ width: number; height: number; seed: number; mode: GameMode; walls?: unknown }>) => {
    try {
        requireStandardMode(event.data.mode);
        if (normalizeWalls(event.data.walls, event.data.width, event.data.height).length) {
            throw new Error('Clear walls to generate a puzzle');
        }
        self.postMessage({ puzzle: generateRectangularPuzzle(event.data.width, event.data.height, event.data.seed) });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
};
