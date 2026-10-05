import { generatePuzzle } from '../logic/puzzle-generator';

self.onmessage = (event: MessageEvent<{ size: number; seed: number }>) => {
    try {
        self.postMessage({ puzzle: generatePuzzle(event.data.size, event.data.seed) });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
};
