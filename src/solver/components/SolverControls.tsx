import React from 'react';
import { ChevronDown } from 'lucide-react';
import { GAME_MODES, type GameMode } from '../logic/game-modes';
import { SIZE_OPTIONS, RESTRICT_Z3_TO_LARGE_GRIDS, SolverType } from './constants';

interface SolverControlsProps {
    onEdit: () => void;
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
    showingSolution: boolean;
    onSizeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onSolverTypeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onSolve: () => void;
    onReset: () => void;
    onGenerate: () => void;
}

const SolverControls = ({
    onEdit,
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
    showingSolution,
    onSizeChange,
    onSolverTypeChange,
    onSolve,
    onReset,
    onGenerate,
}: SolverControlsProps) => {
    const isBusy = isSolving || isGenerating || !isLoaded;
    const unavailable = !GAME_MODES[mode].available;
    const wasmOnly = width !== height || unavailable;
    const boardSettings = (
        <fieldset disabled={isBusy} className="custom-settings">
            <legend className="sr-only">Board options</legend>
            <div className="settings-grid">
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
                <label className="control-field mode-field">
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
            </div>
            <p className="control-hint">Changing dimensions clears the board.</p>
        </fieldset>
    );
    return (
        <div className="solver-controls">
            <div className="primary-settings">
                <label className="control-field">
                    <span>Size</span>
                    <span className="select-wrap">
                        <select value={width === height ? width : 'custom'} onChange={onSizeChange}
                            aria-label="Grid Size" disabled={isBusy || unavailable}>
                            {width !== height && <option value="custom">{width} × {height}</option>}
                            {SIZE_OPTIONS.map(option => <option key={option} value={option}>{option} × {option}</option>)}
                        </select>
                        <ChevronDown aria-hidden="true" />
                    </span>
                </label>
                <label className="control-field">
                    <span>Algorithm</span>
                    <span className="select-wrap">
                        <select value={solverType} onChange={onSolverTypeChange} aria-label="Solver Algorithm"
                            disabled={isBusy || wasmOnly || (RESTRICT_Z3_TO_LARGE_GRIDS && (width !== 15 || height !== 15))}>
                            <option value="heuristic_bfs">Heuristic BFS</option>
                            <option value="astar" disabled={wasmOnly}>A*</option>
                            <option value="z3" disabled={wasmOnly}>SAT (Z3)</option>
                        </select>
                        <ChevronDown aria-hidden="true" />
                    </span>
                </label>
            </div>
            <section className="board-options desktop-board-options" aria-label="Board options">
                <h2 className="board-options-title">Board options</h2>
                {boardSettings}
            </section>
            <div className="control-actions" aria-label="Puzzle actions">
                <button className="control-button primary-action" onClick={showingSolution ? onEdit : onSolve} disabled={isBusy || unavailable}>
                    {showingSolution ? 'Edit' : 'Solve'}
                </button>
                <button className="control-button" onClick={onGenerate} disabled={isBusy || unavailable}>
                    Generate
                </button>
                <button className="control-button reset-action" onClick={onReset} disabled={!isLoaded || unavailable}>
                    Reset
                </button>
            </div>
            <details className="board-options mobile-board-options">
                <summary>Board options <ChevronDown aria-hidden="true" /></summary>
                {boardSettings}
            </details>
            <div className="solver-about selectable-text">
                <p>Solve Flow Free and Numberlink in your browser.</p>
                <p>Powered by Heuristic BFS (C/Wasm), SAT (Z3), and A* search.</p>
                <div className="solver-about-links">
                    <a href="https://www.kongesque.com/blog/flow-free-solver" target="_blank" rel="noreferrer"
                        aria-label="Read more about this solver (opens in a new tab)">
                        Read more
                    </a>
                    <a href="https://github.com/Kongesque/flow-free-solver" target="_blank" rel="noreferrer"
                        aria-label="View source on GitHub (opens in a new tab)">
                        GitHub
                    </a>
                </div>
            </div>
        </div>
    );
};

export default SolverControls;
