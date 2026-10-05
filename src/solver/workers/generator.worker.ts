import { generateRectangularPuzzle } from '../logic/puzzle-generator';
import { requireStandardMode, type GameMode } from '../logic/game-modes';

self.onmessage = (event: MessageEvent<{ width: number; height: number; seed: number; mode: GameMode }>) => {
    try {
        requireStandardMode(event.data.mode);
        self.postMessage({ puzzle: generateRectangularPuzzle(event.data.width, event.data.height, event.data.seed) });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
};
