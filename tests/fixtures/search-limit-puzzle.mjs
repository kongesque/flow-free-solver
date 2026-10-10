import { readFileSync } from 'node:fs';

// The open screenshot now solves with the diagonal probe. A wall between
// different paths preserves that cover while exercising the legacy search's
// real memory limit and the worker's SAT fallback/recovery behavior.
export const input = readFileSync(new URL('./puzzles/screenshot_15x18.txt', import.meta.url), 'utf8');
export const walls = [{ x: 0, y: 1, side: 'down' }];
