import type { Board } from '../../src/solver/logic/astar-solver';
import type { PuzzleTopology } from '../../src/solver/logic/topology';
import type { PuzzleSolution } from '../../src/solver/logic/solution';
export type TopologyFixture = { width: number; height: number; board: Board; input: string; topology: PuzzleTopology; mode: 'warps' | 'bridges'; solution: PuzzleSolution };
export function warpRows(width?: number, height?: number, vertical?: boolean): TopologyFixture;
export function bridgeCross(adjacent?: boolean, over?: 'horizontal' | 'vertical'): TopologyFixture;
export function largeBridgeCover(): TopologyFixture;
