import React from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import { GAME_MODES, type GameMode } from '../logic/game-modes';
import { SIZE_OPTIONS, RESTRICT_Z3_TO_LARGE_GRIDS, SolverType } from './constants';

interface SolverControlsProps {
    width: number;
    height: number;
    mode: GameMode;
    onModeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onWidthChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onHeightChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
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
    width,
    height,
    mode,
    onModeChange,
    onWidthChange,
    onHeightChange,
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
    const unavailable = !GAME_MODES[mode].available;
    const wasmOnly = width !== height || unavailable;
    return (
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-2 max-w-[90vw]">
            <label className="flex items-center gap-1 text-xs text-stoic-secondary">
                Mode
                <select aria-label="Game Mode" value={mode} onChange={onModeChange} disabled={isBusy}
                    className="h-9 sm:h-10 px-2 border border-stoic-line bg-stoic-bg text-stoic-primary rounded-md">
                    {Object.entries(GAME_MODES).map(([value, config]) => (
                        <option key={value} value={value}>{config.label}{config.available ? '' : ' (coming soon)'}</option>
                    ))}
                </select>
            </label>
            {(['Width', 'Height'] as const).map(label => (
                <label key={label} className="flex items-center gap-1 text-xs text-stoic-secondary">
                    {label}
                    <select aria-label={`Grid ${label}`} value={label === 'Width' ? width : height}
                        onChange={label === 'Width' ? onWidthChange : onHeightChange} disabled={isBusy || unavailable}
                        className="h-9 sm:h-10 px-2 border border-stoic-line bg-stoic-bg text-stoic-primary rounded-md">
                        {SIZE_OPTIONS.map(dimension => <option key={dimension} value={dimension}>{dimension}</option>)}
                    </select>
                </label>
            ))}
            {/* Square presets remain convenient alongside independent dimensions. */}
            <div className="relative">
                <select
                    className='h-9 sm:h-10 pl-3 pr-7 text-xs border border-stoic-line bg-stoic-bg text-stoic-primary uppercase tracking-wide focus:outline-none focus:border-stoic-accent cursor-pointer appearance-none rounded-md'
                    value={width === height ? width : 'custom'}
                    onChange={onSizeChange}
                    aria-label="Grid Size"
                    disabled={isBusy || unavailable}
                >
                    {width !== height && <option value="custom">{width}×{height}</option>}
                    {SIZE_OPTIONS.map(option => (
                        <option key={option} value={option}>{option}×{option}</option>
                    ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-stoic-secondary pointer-events-none h-3 w-3" />
            </div>

            <button
                className="h-9 sm:h-10 px-3 text-xs border border-stoic-accent text-stoic-accent uppercase tracking-wider hover:bg-stoic-accent hover:text-stoic-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 rounded-md"
                onClick={onGenerate}
                disabled={isBusy || unavailable}
            >
                {isGenerating && <Loader2 className="animate-spin h-3 w-3" aria-hidden="true" />}
                {isGenerating ? 'Generating' : 'Generate'}
            </button>

            {hasGeneratedSolution && (
                <button
                    className="h-9 sm:h-10 px-3 text-xs border border-stoic-line text-stoic-primary uppercase tracking-wide hover:border-stoic-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
                    onClick={onToggleSolution}
                    disabled={isBusy || unavailable}
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
                    disabled={isBusy || wasmOnly || (RESTRICT_Z3_TO_LARGE_GRIDS && (width !== 15 || height !== 15))}
                >
                    <option value="astar" disabled={wasmOnly}>A*</option>
                    <option value="z3" disabled={wasmOnly}>SAT (Z3)</option>
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
                    disabled={isBusy || unavailable}
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
                    disabled={!isLoaded || unavailable}
                >
                    Reset
                </button>
            </div>
        </div>
    );
};

export default SolverControls;
