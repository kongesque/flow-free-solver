import React from 'react';
import { ChevronDown, Undo2, Trash2 } from 'lucide-react';
import { GAME_MODES, type GameMode } from '../logic/game-modes';
import { SIZE_OPTIONS, SolverType, type DotLabels } from './constants';
import type { WarpSeam } from '../logic/topology';
import type { EditTool } from '../logic/walls';
import type { Block } from '../logic/blocks';

const toolGlyphs: Record<EditTool, React.ReactNode> = {
    blocks: <rect x="3.5" y="3.5" width="5" height="5" rx="0.5" fill="currentColor" stroke="none" />,
    dots: <circle cx="6" cy="6" r="2.5" fill="currentColor" stroke="none" />,
    walls: <path d="M6 1v10" />,
    bridges: <path d="M1 5h2c1.5 0 1.5-3 3-3s1.5 3 3 3h2 M1 10h2c1.5 0 1.5-3 3-3s1.5 3 3 3h2" />,
    warps: <path d="M6 1v10" strokeDasharray="2 2" />,
};

interface SolverControlsProps {
    showBoardGuides: boolean;
    onBoardGuidesChange: (value: boolean) => void;
    showGenerator: boolean;
    onShowGeneratorChange: (value: boolean) => void;
    dotLabels: DotLabels;
    onDotLabelsChange: (value: DotLabels) => void;
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
    blocks: Block[];
    editTool: EditTool;
    onEditToolChange: (tool: EditTool) => void;
    canUndo: boolean;
    onUndo: () => void;
    warps: WarpSeam[];
    onWarpsChange: (warps: WarpSeam[]) => void;
}

const SolverControls = ({
    showBoardGuides, onBoardGuidesChange,
    dotLabels, onDotLabelsChange, showGenerator, onShowGeneratorChange,
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
    wallCount, blocks, editTool, onEditToolChange, canUndo, onUndo, warps, onWarpsChange,
}: SolverControlsProps) => {
    const isBusy = isSolving || isGenerating || !isLoaded || invalidSavedWalls;
    const unavailable = !GAME_MODES[mode].available;
    const supportsAStar = width === height && mode === 'standard' && wallCount === 0;
    const editingDisabled = isBusy || unavailable || showingSolution;
    const working = isSolving || isGenerating;
    const tools: EditTool[] = ['dots', 'walls', 'blocks', ...(mode === 'bridges' ? ['bridges' as const] : mode === 'warps' ? ['warps' as const] : [])];
    const hasGenerationObstacles = wallCount > 0 || blocks.length > 0;
    const generationHint = blocks.length ? wallCount ? 'Clear blocks and walls to generate' : 'Clear blocks to generate' : 'Clear walls to generate';
    const openSeams = (axis: WarpSeam['axis'], count: number) => [
        ...warps.filter(w => w.axis !== axis),
        ...Array.from({ length: count }, (_, index) => ({ axis, index })).filter(seam => !blocks.some(block => axis === 'horizontal'
            ? block.y === seam.index && (block.x === 0 || block.x === width - 1)
            : block.x === seam.index && (block.y === 0 || block.y === height - 1))),
    ];
    return (
        <div className="solver-controls">
            <div className="primary-settings">
                <label className="control-field">
                    <span>Mode</span><span className="select-wrap">
                        <select aria-label="Game Mode" value={mode} onChange={onModeChange} disabled={!isLoaded || invalidSavedWalls}>
                            {Object.entries(GAME_MODES).filter(([, config]) => config.available).map(([value, config]) => (
                                <option key={value} value={value}>{config.label}</option>
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
            <div className="editor-toolbar">
                <div className="edit-tools" role="group" aria-label="Editing tool">
                    {tools.map(tool => <button key={tool} type="button" className="control-button" aria-pressed={editTool === tool}
                        disabled={isBusy || unavailable} onClick={() => { if (showingSolution) onEdit(); onEditToolChange(tool); }}>
                        <svg className="tool-glyph" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={tool === 'walls' || tool === 'warps' ? 1.5 : 1.2} aria-hidden="true" focusable="false">
                            {toolGlyphs[tool]}
                        </svg>
                        {tool[0].toUpperCase() + tool.slice(1)}
                    </button>)}
                </div>
            </div>
            <div className={`control-actions ${showGenerator ? '' : 'single-action'}`} aria-label="Puzzle actions">
                <button type="button" className="control-button primary-action" onClick={working ? onCancel : showingSolution ? onEdit : onSolve}
                    disabled={!working && (isBusy || unavailable)}>
                    {working ? 'Cancel' : showingSolution ? 'Edit' : 'Solve'}
                </button>
                {showGenerator && <button type="button" className="control-button generate-action" onClick={onGenerate}
                    disabled={isBusy || unavailable || hasGenerationObstacles} aria-describedby={hasGenerationObstacles ? 'wall-generation-hint' : undefined}
                    title={hasGenerationObstacles ? generationHint : 'Generate a puzzle'}>Generate</button>}
            </div>
            {hasGenerationObstacles && <span id="wall-generation-hint" className="sr-only">{generationHint}.</span>}
            <div className="board-settings">
                <details className="board-options">
                    <summary>Board options <ChevronDown aria-hidden="true" /></summary>
                    <fieldset disabled={!isLoaded || invalidSavedWalls} className="custom-settings">
                        <legend className="sr-only">Board options</legend>
                        <div className="settings-grid">
                            {(['Width', 'Height'] as const).map(label => (
                                <label key={label} className="control-field">
                                    <span>{label}</span><span className="select-wrap">
                                        <select aria-label={`Grid ${label}`} value={label === 'Width' ? width : height}
                                            onChange={label === 'Width' ? onWidthChange : onHeightChange} disabled={isBusy || unavailable}>
                                            {SIZE_OPTIONS.map(dimension => <option key={dimension} value={dimension}>{dimension}</option>)}
                                        </select><ChevronDown aria-hidden="true" />
                                    </span>
                                </label>
                            ))}
                        </div>
                        <label className="control-field">
                            <span>Solver</span><span className="select-wrap">
                                <select value={solverType} onChange={onSolverTypeChange} aria-label="Solver Algorithm"
                                    disabled={isBusy || unavailable}>
                                    <option value="heuristic_bfs">Pruned DFS (recommended)</option>
                                    {supportsAStar && <option value="astar">A*</option>}
                                    <option value="z3">Z3 SAT (exact solver)</option>
                                </select><ChevronDown aria-hidden="true" />
                            </span>
                        </label>
                        {!showingSolution && editTool === 'warps' && <div className="wall-context">
                            <div className="warp-actions">
                                <button type="button" className="control-button" disabled={editingDisabled} onClick={() => onWarpsChange(openSeams('horizontal', height))}>Open all left/right</button>
                                <button type="button" className="control-button" disabled={editingDisabled} onClick={() => onWarpsChange(openSeams('vertical', width))}>Open all top/bottom</button>
                            </div>
                        </div>}
                        <div className="settings-toggles">
                            <label className="label-setting">
                                <span className="label-setting-title">Color label</span>
                                <input type="checkbox" role="switch" aria-label="Color label" checked={dotLabels === 'letters'} onChange={event => onDotLabelsChange(event.target.checked ? 'letters' : 'none')} />
                            </label>
                            <label className="label-setting">
                                <span className="label-setting-title">Board guides</span>
                                <input type="checkbox" role="switch" aria-label="Board guides" checked={showBoardGuides} onChange={event => onBoardGuidesChange(event.target.checked)} />
                            </label>
                            <label className="label-setting">
                                <span className="label-setting-title">Puzzle generator</span>
                                <input type="checkbox" role="switch" aria-label="Puzzle generator" checked={showGenerator} onChange={event => onShowGeneratorChange(event.target.checked)} />
                            </label>
                        </div>
                    </fieldset>
                </details>
                <div className="edit-history" role="group" aria-label="Edit history">
                    <button type="button" className="control-button icon-action undo-action" disabled={!canUndo || editingDisabled} onClick={onUndo}
                        aria-label="Undo" aria-keyshortcuts="Control+Z Meta+Z" title="Undo last edit (Ctrl+Z / ⌘Z)"><Undo2 aria-hidden="true" /></button>
                    <button type="button" className="control-button icon-action reset-action" onClick={onReset} disabled={!isLoaded || unavailable}
                        aria-label="Reset" title="Reset puzzle"><Trash2 aria-hidden="true" /></button>
                </div>
            </div>
            <div className="solver-about selectable-text">
                <p>
                    <span className="solver-methods">Solve Flow Free &amp; Numberlink locally. </span>
                    <a href="https://www.kongesque.com/blog/flow-free-solver" target="_blank" rel="noreferrer"
                        aria-label="Read more about this solver (opens in a new tab)">Read more</a>
                </p>
            </div>
        </div>
    );
};

export default SolverControls;
