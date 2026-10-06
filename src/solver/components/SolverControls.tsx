import React from 'react';
import { ChevronDown } from 'lucide-react';
import { GAME_MODES, type GameMode } from '../logic/game-modes';
import { SIZE_OPTIONS, RESTRICT_Z3_TO_LARGE_GRIDS, SolverType } from './constants';
import type { EditTool } from '../logic/walls';

interface SolverControlsProps {
    onEdit: () => void;
    width: number;
    height: number;
    mode: GameMode;
    onWidthChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onHeightChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    solverType: SolverType;
    isSolving: boolean;
    isGenerating: boolean;
    isLoaded: boolean;
    invalidSavedWalls: boolean;
    showingSolution: boolean;
    onSizeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onSolverTypeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onSolve: () => void;
    onReset: () => void;
    onGenerate: () => void;
    onCancel: () => void;
    solveTime: number | null;
    wallCount: number;
    editTool: EditTool;
    onEditToolChange: (tool: EditTool) => void;
    canUndo: boolean;
    onUndo: () => void;
    onClearWalls: () => void;
    canZoom: boolean;
    zoomed: boolean;
    onZoom: () => void;
}

const SolverControls = ({
    onEdit,
    width,
    height,
    mode,
    onWidthChange,
    onHeightChange,
    solverType,
    isSolving,
    isGenerating,
    isLoaded,
    invalidSavedWalls,
    showingSolution,
    onSizeChange,
    onSolverTypeChange,
    onSolve,
    onReset,
    onGenerate,
    onCancel,
    solveTime,
    wallCount, editTool, onEditToolChange, canUndo, onUndo, onClearWalls, canZoom, zoomed, onZoom,
}: SolverControlsProps) => {
    const isBusy = isSolving || isGenerating || !isLoaded || invalidSavedWalls;
    const unavailable = !GAME_MODES[mode].available;
    const wasmOnly = width !== height || unavailable || wallCount > 0;
    const editingDisabled = isBusy || unavailable || showingSolution;
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
                <button type="button" className="control-button undo-action" disabled={!canUndo || editingDisabled} onClick={onUndo}
                    aria-keyshortcuts="Control+Z Meta+Z" title="Undo last edit (Ctrl+Z / ⌘Z)">Undo</button>
            </div>
            <div className="control-actions" aria-label="Puzzle actions">
                <button className="control-button primary-action" onClick={isSolving || isGenerating ? onCancel : showingSolution ? onEdit : onSolve}
                    disabled={!isLoaded || invalidSavedWalls || unavailable}>
                    {isSolving || isGenerating ? 'Cancel' : showingSolution ? 'Edit' : 'Solve'}
                </button>
                <button className="control-button" onClick={onGenerate} disabled={isBusy || unavailable || wallCount > 0}
                    aria-describedby={wallCount > 0 ? 'wall-generation-hint' : undefined}>
                    Generate
                </button>
                <button className="control-button reset-action" onClick={onReset} disabled={!isLoaded || unavailable}>
                    Reset
                </button>
            </div>
            {wallCount > 0 && <p id="wall-generation-hint" className="panel-notice">Clear walls to generate.</p>}
            <details className="board-options">
                <summary>Board options{editTool === 'walls' && <span className="active-tool"> · Walls</span>} <ChevronDown aria-hidden="true" /></summary>
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
                        <label className="control-field">
                            <span>Algorithm</span>
                            <span className="select-wrap">
                                <select value={solverType} onChange={onSolverTypeChange} aria-label="Solver Algorithm"
                                    aria-describedby={wasmOnly ? 'algorithm-reason' : undefined}
                                    disabled={isBusy || wasmOnly || (RESTRICT_Z3_TO_LARGE_GRIDS && (width !== 15 || height !== 15))}>
                                    <option value="heuristic_bfs">Heuristic BFS</option>
                                    <option value="astar" disabled={wasmOnly}>A*</option>
                                    <option value="z3" disabled={wasmOnly}>SAT (Z3)</option>
                                </select>
                                <ChevronDown aria-hidden="true" />
                            </span>
                        </label>
                    </div>
                    {wasmOnly && <p className="control-hint" id="algorithm-reason">{wallCount > 0 ? 'Wall' : 'Rectangular'} boards use Heuristic BFS.</p>}
                    <p className="control-hint">Resizing clears the puzzle.</p>
                    <button type="button" className="control-button wall-toggle" aria-label="Draw walls" aria-pressed={editTool === 'walls'}
                        disabled={editingDisabled} onClick={() => onEditToolChange(editTool === 'walls' ? 'dots' : 'walls')}>
                        <span>Draw walls{wallCount > 0 && <span className="wall-count"> · {wallCount}</span>}</span>
                        <span className="wall-toggle-indicator" aria-hidden="true" />
                    </button>
                    {!showingSolution && (editTool === 'walls' || canZoom || zoomed) && <div className="wall-context">
                        <div className="wall-actions" role="group" aria-label={editTool === 'walls' ? 'Wall tools' : 'Board tools'}>
                            {editTool === 'walls' && wallCount > 0 && <button type="button" className="control-button" disabled={editingDisabled} onClick={onClearWalls}>Clear walls</button>}
                            {(canZoom || zoomed) && <button type="button" className="control-button"
                                disabled={editingDisabled} aria-pressed={zoomed} onClick={onZoom}>{zoomed ? 'Fit board' : 'Zoom in'}</button>}
                        </div>
                        {zoomed && <p className="wall-help">Drag to pan. Tap a cell to edit.</p>}
                    </div>}
                    {showingSolution && solveTime !== null && <p className="control-hint">Solved in {solveTime < 1000 ? `${Math.round(solveTime)}ms` : `${(solveTime / 1000).toFixed(2)}s`}.</p>}
                </fieldset>
            </details>
            <div className="solver-about selectable-text">
                <p>
                    <span className="solver-methods">Runs locally. </span>
                    <a href="https://www.kongesque.com/blog/flow-free-solver" target="_blank" rel="noreferrer"
                        aria-label="Read more about this solver (opens in a new tab)">Read more</a>
                </p>
            </div>
        </div>
    );
};

export default SolverControls;
