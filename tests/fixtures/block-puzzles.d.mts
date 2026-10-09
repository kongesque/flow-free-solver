import type { Board } from '../../src/solver/logic/astar-solver';
import type { PuzzleTopology } from '../../src/solver/logic/topology';
import type { PuzzleSolution } from '../../src/solver/logic/solution';
export type BlockFixture = { width: number; height: number; board: Board; input: string; topology: PuzzleTopology; mode: 'standard' | 'bridges' | 'warps'; solution: PuzzleSolution };
export function blockRows(width?: number, height?: number, mode?: 'standard' | 'warps', rowCount?: number): BlockFixture;
export function blockBridge(width?: number, height?: number): BlockFixture;
export function blockWire(fixture: BlockFixture): string;
export function screenshotBlocks(): Omit<BlockFixture, 'solution'>;
