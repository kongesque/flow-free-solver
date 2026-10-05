import React from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import { SIZE_OPTIONS, RESTRICT_Z3_TO_LARGE_GRIDS, SolverType } from './constants';

interface SolverControlsProps {
    size: number;
    solverType: SolverType;
    isSolving: boolean;
    isGenerating: boolean;
    isLoaded: boolean;
    hasGeneratedSolution: boolean;
    showingSolution: boolean;
    onSizeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onSolverTypeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onSolve: () => void;
    onReset: () => void;
    onGenerate: () => void;
    onToggleSolution: () => void;
}

const SolverControls = ({
    size,
    solverType,
    isSolving,
    isGenerating,
    isLoaded,
    hasGeneratedSolution,
    showingSolution,
    onSizeChange,
    onSolverTypeChange,
    onSolve,
    onReset,
    onGenerate,
    onToggleSolution,
}: SolverControlsProps) => {
    const isBusy = isSolving || isGenerating || !isLoaded;
    return (
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-2 max-w-[90vw]">
            {/* Grid size selector */}
            <div className="relative">
                <select
                    className='h-9 sm:h-10 pl-3 pr-7 text-xs border border-stoic-line bg-stoic-bg text-stoic-primary uppercase tracking-wide focus:outline-none focus:border-stoic-accent cursor-pointer appearance-none rounded-md'
                    value={size}
                    onChange={onSizeChange}
                    aria-label="Grid Size"
                    disabled={isBusy}
                >
                    {SIZE_OPTIONS.map(option => (
                        <option key={option} value={option}>{option}×{option}</option>
                    ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-stoic-secondary pointer-events-none h-3 w-3" />
            </div>

            <button
                className="h-9 sm:h-10 px-3 text-xs border border-stoic-accent text-stoic-accent uppercase tracking-wider hover:bg-stoic-accent hover:text-stoic-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 rounded-md"
                onClick={onGenerate}
                disabled={isBusy}
            >
                {isGenerating && <Loader2 className="animate-spin h-3 w-3" aria-hidden="true" />}
                {isGenerating ? 'Generating' : 'Generate'}
            </button>

            {hasGeneratedSolution && (
                <button
                    className="h-9 sm:h-10 px-3 text-xs border border-stoic-line text-stoic-primary uppercase tracking-wide hover:border-stoic-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
                    onClick={onToggleSolution}
                    disabled={isBusy}
                    aria-pressed={showingSolution}
                >
                    {showingSolution ? 'Hide solution' : 'Show solution'}
                </button>
            )}

            {/* Solver algorithm selector */}
            <div className="relative">
                <select
                    className='h-9 sm:h-10 pl-3 pr-7 text-xs border border-stoic-line bg-stoic-bg text-stoic-primary uppercase tracking-wide focus:outline-none focus:border-stoic-accent cursor-pointer appearance-none rounded-md'
                    value={solverType}
                    onChange={onSolverTypeChange}
                    aria-label="Solver Algorithm"
                    disabled={isBusy || (RESTRICT_Z3_TO_LARGE_GRIDS && size !== 15)}
                >
                    <option value="astar">A*</option>
                    <option value="z3">SAT (Z3)</option>
                    <option value="heuristic_bfs">Heuristic BFS</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-stoic-secondary pointer-events-none h-3 w-3" />
            </div>

            {/* Solve + Reset always stay together */}
            <div className="flex items-center gap-2 flex-shrink-0">
                {/* Solve button — fixed width so spinner doesn't shift layout */}
                <button
                    className='h-9 sm:h-10 w-24 text-xs border-2 border-stoic-accent bg-stoic-accent text-stoic-bg font-bold uppercase tracking-wider hover:bg-transparent hover:text-stoic-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-stoic-accent disabled:hover:text-stoic-bg select-none flex items-center justify-center gap-1.5 rounded-md'
                    onClick={onSolve}
                    disabled={isBusy}
                >
                    {isSolving && (
                        <Loader2 className="animate-spin h-3 w-3 flex-shrink-0" aria-hidden="true" />
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
        </div>
    );
};

export default SolverControls;
