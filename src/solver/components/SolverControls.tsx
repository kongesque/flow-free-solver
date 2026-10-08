import React from 'react';
import { ChevronDown, Undo2, Trash2, ZoomIn, ZoomOut, Hand } from 'lucide-react';
import { GAME_MODES, type GameMode } from '../logic/game-modes';
import { SIZE_OPTIONS, RESTRICT_Z3_TO_LARGE_GRIDS, SolverType } from './constants';
import type { Bridge, WarpSeam } from '../logic/topology';
import type { EditTool } from '../logic/walls';

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
    invalidSavedWalls: boolean;
    showingSolution: boolean;
    onSizeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onSolverTypeChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    onSolve: () => void;
    onCancel: () => void;
    onReset: () => void;
    onGenerate: () => void;
    wallCount: number;
    editTool: EditTool;
    onEditToolChange: (tool: EditTool) => void;
    canUndo: boolean;
    onUndo: () => void;
    onClearWalls: () => void;
    zoomWalls: boolean;
    onZoomWalls: () => void;
    panning: boolean; onPan: () => void;
    bridges: Bridge[]; warps: WarpSeam[];
    bridgeOver: Bridge['over']; onBridgeOver: (over: Bridge['over']) => void;
    onClearBridges: () => void; onRotateBridges: () => void;
    onWarpsChange: (warps: WarpSeam[]) => void;
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
    invalidSavedWalls,
    showingSolution,
    onSizeChange,
    onSolverTypeChange,
    onSolve, onCancel,
    onReset,
    onGenerate,
    wallCount, editTool, onEditToolChange, canUndo, onUndo, onClearWalls, zoomWalls, onZoomWalls, bridges, warps, bridgeOver, onBridgeOver, onClearBridges, onRotateBridges, onWarpsChange, panning, onPan,
}: SolverControlsProps) => {
    const isBusy = isSolving || isGenerating || !isLoaded || invalidSavedWalls;
    const unavailable = !GAME_MODES[mode].available;
    const wasmOnly = width !== height || mode !== 'standard' || wallCount > 0;
    const editingDisabled = isBusy || unavailable || showingSolution;
    const working = isSolving || isGenerating;
    const tools: EditTool[] = ['dots', 'walls', ...(mode === 'bridges' ? ['bridges' as const] : mode === 'warps' ? ['warps' as const] : [])];
    return (
        <div className="solver-controls">
            <div className="primary-settings">
                <label className="control-field">
                    <span>Mode</span><span className="select-wrap">
                        <select aria-label="Game Mode" value={mode} onChange={onModeChange} disabled={isBusy}>
                            {Object.entries(GAME_MODES).map(([value, config]) => (
                                <option key={value} value={value} disabled={!config.available}>{config.label}{config.available ? '' : ' (coming soon)'}</option>
                            ))}
                        </select><ChevronDown aria-hidden="true" />
                    </span>
                </label>
                <label className="control-field">
                    <span>Size</span><span className="select-wrap">
                        <select value={width === height ? width : 'custom'} onChange={onSizeChange}
                            aria-label="Grid Size" disabled={isBusy || unavailable}>
                            {width !== height && <option value="custom">{width} × {height}</option>}
                            {SIZE_OPTIONS.map(option => <option key={option} value={option}>{option} × {option}</option>)}
                        </select><ChevronDown aria-hidden="true" />
                    </span>
                </label>
            </div>
            <div className={`control-actions ${mode !== 'standard' ? 'without-generation' : ''}`} aria-label="Puzzle actions">
                <button type="button" className="control-button primary-action" onClick={working ? onCancel : showingSolution ? onEdit : onSolve}
                    disabled={!working && (isBusy || unavailable)}>
                    {working ? 'Cancel' : showingSolution ? 'Edit' : 'Solve'}
                </button>
                {mode === 'standard' && <button type="button" className="control-button generate-action" onClick={onGenerate}
                    disabled={isBusy || wallCount > 0} aria-describedby={wallCount > 0 ? 'wall-generation-hint' : undefined}
                    title={wallCount > 0 ? 'Clear walls to generate' : 'Generate a puzzle'}>Generate</button>}
                <button type="button" className="control-button icon-action undo-action" disabled={!canUndo || editingDisabled} onClick={onUndo}
                    aria-label="Undo" aria-keyshortcuts="Control+Z Meta+Z" title="Undo last edit (Ctrl+Z / ⌘Z)"><Undo2 aria-hidden="true" /></button>
                <button type="button" className="control-button icon-action reset-action" onClick={onReset} disabled={!isLoaded || unavailable}
                    aria-label="Reset" title="Reset puzzle"><Trash2 aria-hidden="true" /></button>
            </div>
            {mode === 'standard' && wallCount > 0 && <span id="wall-generation-hint" className="sr-only">Clear walls to generate.</span>}
            {!showingSolution && <div className="editor-toolbar">
                <div className="edit-tools" role="group" aria-label="Editing tool">
                    {tools.map(tool => <button key={tool} type="button" className="control-button" aria-pressed={editTool === tool}
                        disabled={editingDisabled} onClick={() => onEditToolChange(tool)}>
                        {tool[0].toUpperCase() + tool.slice(1)}
                        {tool === 'walls' && wallCount > 0 && <span aria-hidden="true" className="wall-count">{wallCount}</span>}
                    </button>)}
                </div>
                <button type="button" className="control-button icon-action" disabled={editingDisabled} aria-pressed={zoomWalls}
                    aria-label={zoomWalls ? 'Fit board' : 'Zoom in'} title={zoomWalls ? 'Fit board' : 'Zoom in'} onClick={onZoomWalls}>
                    {zoomWalls ? <ZoomOut aria-hidden="true" /> : <ZoomIn aria-hidden="true" />}
                </button>
                {zoomWalls && <button type="button" className="control-button icon-action" aria-pressed={panning} disabled={editingDisabled}
                    aria-label={panning ? 'Resume editing' : 'Pan board'} title={panning ? 'Resume editing' : 'Pan board'} onClick={onPan}><Hand aria-hidden="true" /></button>}
            </div>}
            <details className="board-options">
                <summary>Board options <ChevronDown aria-hidden="true" /></summary>
                <fieldset disabled={isBusy} className="custom-settings">
                    <legend className="sr-only">Board options</legend>
                    <div className="settings-grid">
                        {(['Width', 'Height'] as const).map(label => (
                            <label key={label} className="control-field">
                                <span>{label}</span><span className="select-wrap">
                                    <select aria-label={`Grid ${label}`} value={label === 'Width' ? width : height}
                                        onChange={label === 'Width' ? onWidthChange : onHeightChange} disabled={unavailable}>
                                        {SIZE_OPTIONS.map(dimension => <option key={dimension} value={dimension}>{dimension}</option>)}
                                    </select><ChevronDown aria-hidden="true" />
                                </span>
                            </label>
                        ))}
                    </div>
                    {!wasmOnly && <label className="control-field">
                        <span>Solver</span><span className="select-wrap">
                            <select value={solverType} onChange={onSolverTypeChange} aria-label="Solver Algorithm"
                                disabled={isBusy || (RESTRICT_Z3_TO_LARGE_GRIDS && width !== 15)}>
                                <option value="heuristic_bfs">Heuristic BFS</option><option value="astar">A*</option><option value="z3">SAT (Z3)</option>
                            </select><ChevronDown aria-hidden="true" />
                        </span>
                    </label>}
                    {!showingSolution && editTool === 'bridges' && <div className="wall-context">
                        <label className="control-field"><span>Bridge on top</span><span className="select-wrap">
                            <select aria-label="Bridge on top" value={bridgeOver} disabled={editingDisabled} onChange={event => onBridgeOver(event.target.value as Bridge['over'])}>
                                <option value="horizontal">Horizontal</option><option value="vertical">Vertical</option>
                            </select><ChevronDown aria-hidden="true" />
                        </span></label>
                        {bridges.length > 0 && <div className="wall-actions">
                            <button type="button" className="control-button quiet-action" disabled={editingDisabled} onClick={onRotateBridges}>Rotate bridges</button>
                            <button type="button" className="control-button quiet-action" disabled={editingDisabled} onClick={onClearBridges}>Clear bridges</button>
                        </div>}
                    </div>}
                    {!showingSolution && editTool === 'warps' && <div className="wall-context">
                        <div className="warp-actions">
                            <button type="button" className="control-button" disabled={editingDisabled} onClick={() => onWarpsChange([
                                ...warps.filter(w => w.axis !== 'horizontal'), ...Array.from({ length: height }, (_, index) => ({ axis: 'horizontal' as const, index }))])}>Open all left/right</button>
                            <button type="button" className="control-button" disabled={editingDisabled} onClick={() => onWarpsChange([
                                ...warps.filter(w => w.axis !== 'vertical'), ...Array.from({ length: width }, (_, index) => ({ axis: 'vertical' as const, index }))])}>Open all top/bottom</button>
                        </div>
                        {warps.length > 0 && <button type="button" className="control-button quiet-action" disabled={editingDisabled} onClick={() => onWarpsChange([])}>Clear warps</button>}
                    </div>}
                    {!showingSolution && editTool === 'walls' && wallCount > 0 && <button type="button" className="control-button quiet-action" disabled={editingDisabled} onClick={onClearWalls}>Clear walls</button>}
                </fieldset>
            </details>
            <div className="solver-about selectable-text"><p>
                <span className="solver-methods">Runs locally. </span>
                <a href="https://www.kongesque.com/blog/flow-free-solver" target="_blank" rel="noreferrer"
                    aria-label="Read more about this solver (opens in a new tab)">Read more</a>
            </p></div>
        </div>
    );
};

export default SolverControls;
