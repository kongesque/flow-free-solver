import { readFileSync } from 'node:fs';

// Both the open screenshot and this walled version now solve with Pruned DFS.
// Keep the wall case as a regression for graph search and direct C solving.
export const input = readFileSync(new URL('./puzzles/screenshot_15x18.txt', import.meta.url), 'utf8');
export const walls = [{ x: 0, y: 1, side: 'down' }];
