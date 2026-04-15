import React from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import { SIZE_OPTIONS, RESTRICT_Z3_TO_LARGE_GRIDS, SolverType } from './constants';

interface SolverControlsProps {
    size: number;
    solverType: SolverType;
    isSolving: boolean;
    onSizeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onSolverTypeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onSolve: () => void;
    onReset: () => void;
}

const SolverControls = ({
    size,
    solverType,
    isSolving,
    onSizeChange,
    onSolverTypeChange,
    onSolve,
    onReset,
}: SolverControlsProps) => (
    <div className="flex flex-wrap items-center justify-center gap-3 mb-2">
        {/* Grid size selector */}
        <div className="relative">
            <select
                className='h-9 sm:h-10 pl-3 pr-7 text-xs border border-stoic-line bg-stoic-bg text-stoic-primary uppercase tracking-wide focus:outline-none focus:border-stoic-accent cursor-pointer appearance-none rounded-md'
                value={size}
                onChange={onSizeChange}
                aria-label="Grid Size"
            >
                {SIZE_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}×{option}</option>
                ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-stoic-secondary pointer-events-none h-3 w-3" />
        </div>

        {/* Solver algorithm selector */}
        <div className="relative">
            <select
                className='h-9 sm:h-10 pl-3 pr-7 text-xs border border-stoic-line bg-stoic-bg text-stoic-primary uppercase tracking-wide focus:outline-none focus:border-stoic-accent cursor-pointer appearance-none rounded-md'
                value={solverType}
                onChange={onSolverTypeChange}
                aria-label="Solver Algorithm"
                disabled={RESTRICT_Z3_TO_LARGE_GRIDS && size !== 15}
            >
                <option value="astar">A*</option>
                <option value="z3">SAT (Z3)</option>
                <option value="heuristic_bfs">Heuristic BFS</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-stoic-secondary pointer-events-none h-3 w-3" />
        </div>

        {/* Solve button */}
        <button
            className='h-9 sm:h-10 px-4 text-xs border-2 border-stoic-accent bg-stoic-accent text-stoic-bg font-bold uppercase tracking-wider hover:bg-transparent hover:text-stoic-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-stoic-accent disabled:hover:text-stoic-bg select-none flex items-center gap-2 rounded-md'
            onClick={onSolve}
            disabled={isSolving}
        >
            {isSolving && (
                <Loader2 className="animate-spin h-3 w-3" aria-hidden="true" />
            )}
            {isSolving ? 'Solving' : 'Solve'}
        </button>

        {/* Reset button */}
        <button
            className='h-9 sm:h-10 px-3 text-xs border border-stoic-line bg-transparent text-stoic-secondary uppercase tracking-wider hover:border-stoic-secondary hover:text-stoic-primary transition-colors select-none rounded-md'
            onClick={onReset}
        >
            Reset
        </button>
    </div>
);

export default SolverControls;
