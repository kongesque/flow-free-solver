import React from 'react';
import { Loader2, ChevronDown, Play, Shuffle, RotateCcw } from 'lucide-react';
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
        <div className="solver-controls">
            <div className="control-actions" aria-label="Puzzle actions">
                <button className="control-button primary-action" onClick={onSolve} disabled={isBusy || unavailable}>
                    {isSolving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
                    {isSolving ? 'Solving' : 'Solve'}
                </button>
                <button className="control-button" onClick={onGenerate} disabled={isBusy || unavailable}>
                    {isGenerating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Shuffle aria-hidden="true" />}
                    {isGenerating ? 'Generating' : 'Generate'}
                </button>
                {hasGeneratedSolution && (
                    <button className="control-button solution-action" onClick={onToggleSolution}
                        disabled={isBusy || unavailable} aria-pressed={showingSolution}>
                        {showingSolution ? 'Hide solution' : 'Show solution'}
                    </button>
                )}
                <button className="control-button reset-action" onClick={onReset} disabled={!isLoaded || unavailable}>
                    <RotateCcw aria-hidden="true" /> Reset
                </button>
            </div>

            <fieldset className="board-settings" disabled={isBusy}>
                <legend className="section-label">Board settings</legend>
                <div className="settings-grid">
                    <label className="control-field">
                        <span>Mode</span>
                        <span className="select-wrap">
                            <select aria-label="Game Mode" value={mode} onChange={onModeChange}>
                                {Object.entries(GAME_MODES).map(([value, config]) => (
                                    <option key={value} value={value}>{config.label}{config.available ? '' : ' (coming soon)'}</option>
                                ))}
                            </select>
                            <ChevronDown aria-hidden="true" />
                        </span>
                    </label>
                    <label className="control-field">
                        <span>Square preset</span>
                        <span className="select-wrap">
                            <select value={width === height ? width : 'custom'} onChange={onSizeChange}
                                aria-label="Grid Size" disabled={unavailable}>
                                {width !== height && <option value="custom">Custom {width}×{height}</option>}
                                {SIZE_OPTIONS.map(option => <option key={option} value={option}>{option} × {option}</option>)}
                            </select>
                            <ChevronDown aria-hidden="true" />
                        </span>
                    </label>
                    {(['Width', 'Height'] as const).map(label => (
                        <label key={label} className="control-field">
                            <span>{label}</span>
                            <span className="select-wrap">
                                <select aria-label={`Grid ${label}`} value={label === 'Width' ? width : height}
                                    onChange={label === 'Width' ? onWidthChange : onHeightChange} disabled={unavailable}>
                                    {SIZE_OPTIONS.map(dimension => <option key={dimension} value={dimension}>{dimension}</option>)}
                                </select>
                                <ChevronDown aria-hidden="true" />
                            </span>
                        </label>
                    ))}
                    <label className="control-field algorithm-field">
                        <span>Solver algorithm</span>
                        <span className="select-wrap">
                            <select value={solverType} onChange={onSolverTypeChange} aria-label="Solver Algorithm"
                                aria-describedby="algorithm-hint"
                                disabled={wasmOnly || (RESTRICT_Z3_TO_LARGE_GRIDS && (width !== 15 || height !== 15))}>
                                <option value="heuristic_bfs">Heuristic BFS</option>
                                <option value="astar" disabled={wasmOnly}>A* Search</option>
                                <option value="z3" disabled={wasmOnly}>SAT (Z3)</option>
                            </select>
                            <ChevronDown aria-hidden="true" />
                        </span>
                    </label>
                </div>
                <p id="algorithm-hint" className="control-hint">
                    {wasmOnly ? 'Rectangular boards use Heuristic BFS.' : 'Heuristic BFS is a good place to start.'}
                </p>
                <p className="control-hint">Changing dimensions clears the board.</p>
            </fieldset>
        </div>
    );
};

export default SolverControls;
