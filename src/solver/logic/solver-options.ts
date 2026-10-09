import type { GameMode } from './game-modes';

export type SolverType = 'astar' | 'z3' | 'heuristic_bfs';

export function compatibleSolver(type: SolverType, mode: GameMode, width: number, height: number, wallCount: number): SolverType {
    return type === 'astar' && (mode !== 'standard' || width !== height || wallCount > 0) ? 'heuristic_bfs' : type;
}
