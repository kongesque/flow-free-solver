import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import PipeOverlay from './PipeOverlay';
import type { PuzzleSolution } from '../logic/solution';
import { seamKey, type Bridge, type WarpSeam } from '../logic/topology';
import { COLORS, COLOR_LABELS, dotLabel, dotLabelColor, type DotLabels } from './constants';
import { wallAtPoint, wallBetween, wallKey, type Wall, type EditTool } from '../logic/walls';

interface PuzzleGridProps {
    dotLabels: DotLabels;
    showBoardGuides: boolean;
    width: number;
    height: number;
    currentBoard: number[][];
    solvedBoard: number[][] | null;
    isSolving: boolean;
    activeColor: number;
    isResetting: boolean;
    onCellClick: (x: number, y: number) => void;
    walls: Wall[];
    editTool: EditTool;
    onWallsChange: (walls: Wall[]) => void;
    endpointBoard: number[][];
    solution: PuzzleSolution | null;
    bridges: Bridge[];
    warps: WarpSeam[];
    onBridgeClick: (x: number, y: number) => void;
    onSeamClick: (seam: WarpSeam) => void;
}

const PuzzleGrid = ({
    dotLabels,
    showBoardGuides,
    width,
    height,
    currentBoard,
    solvedBoard,
    isSolving,
    activeColor,
    isResetting,
    onCellClick,
    walls, editTool, onWallsChange, endpointBoard, solution, bridges, warps, onBridgeClick, onSeamClick,
}: PuzzleGridProps) => {
    const gridRef = useRef<HTMLElement>(null);
    const [highlightSeam, setHighlightSeam] = useState<string | null>(null);
    const [focusedCell, setFocusedCell] = useState(0);
    const [preview, setPreview] = useState<Wall | null>(null);
    const [draft, setDraft] = useState<Wall[] | null>(null);
    const [announcement, setAnnouncement] = useState('');
    const [guideCell, setGuideCell] = useState<[number, number] | null>(null);
    const [touchPreview, setTouchPreview] = useState(false);
    const [coordinateStep, setCoordinateStep] = useState({ column: 1, row: 1 });
    const placement = useRef<{ pointerId: number; tool: 'dots' | 'bridges'; origin: [number, number]; guided: boolean } | null>(null);
    const suppressClickUntil = useRef(0);
    const cancelledPlacement = useRef<number | null>(null);
    const stroke = useRef<{ pointerId: number; adding: boolean; walls: Wall[]; seen: Set<string>; point: [number, number]; side: Wall['side'] } | null>(null);
    const editingWalls = editTool === 'walls' && !isSolving && !solvedBoard;
    const editing = !isSolving && !solvedBoard;
    const visibleWalls = draft ?? walls;
    const cancelStroke = useCallback(() => {
        const pointerId = stroke.current?.pointerId ?? placement.current?.pointerId;
        if (placement.current) {
            cancelledPlacement.current = placement.current.pointerId;
            suppressClickUntil.current = performance.now() + 500;
        }
        stroke.current = null;
        placement.current = null;
        if (pointerId !== undefined && gridRef.current?.hasPointerCapture(pointerId)) {
            gridRef.current.releasePointerCapture(pointerId);
        }
        setDraft(null);
        setPreview(null);
        setGuideCell(null);
        setTouchPreview(false);
    }, []);
    // Cancel an in-flight stroke when the board or its screen geometry changes.
    useEffect(() => {
        cancelStroke();
        setHighlightSeam(null);
    }, [cancelStroke, walls, width, height, editTool, isSolving, solvedBoard, isResetting, showBoardGuides]);
    useEffect(() => {
        const grid = gridRef.current;
        if (!grid) return;
        let previous: DOMRect | null = null;
        const resize = () => {
            const bounds = grid.getBoundingClientRect();
            if (previous && (bounds.width !== previous.width || bounds.height !== previous.height || bounds.left !== previous.left || bounds.top !== previous.top)) cancelStroke();
            previous = bounds;
            if (!bounds.width || !bounds.height) return;
            const column = Math.max(1, Math.ceil(14 * width / bounds.width));
            const row = Math.max(1, Math.ceil(14 * height / bounds.height));
            setCoordinateStep(current => current.column === column && current.row === row ? current : { column, row });
        };
        resize();
        window.addEventListener('resize', resize);
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
        observer?.observe(grid);
        return () => {
            window.removeEventListener('resize', resize);
            observer?.disconnect();
        };
    }, [cancelStroke, width, height]);
    const showCoordinate = (index: number, count: number, step: number, active: number | undefined) => {
        if (active !== undefined && index === active) return true;
        if (active !== undefined && Math.abs(index - active) < step) return false;
        return index === count - 1 || (index % step === 0 && (index === count - 1 || count - 1 - index >= step));
    };
    const announce = (wall: Wall, adding: boolean) => {
        const nx = wall.x + (wall.side === 'right' ? 1 : 0), ny = wall.y + (wall.side === 'down' ? 1 : 0);
        setAnnouncement(`Wall ${adding ? 'added' : 'removed'} between column ${wall.x + 1}, row ${wall.y + 1} and column ${nx + 1}, row ${ny + 1}.`);
    };
    const pointerPoint = (event: PointerEvent<HTMLElement>): [number, number] => {
        const bounds = event.currentTarget.getBoundingClientRect();
        return [(event.clientX - bounds.left) / bounds.width * width, (event.clientY - bounds.top) / bounds.height * height];
    };
    const pointerCell = (event: PointerEvent<HTMLElement>): [number, number] | null => {
        const [x, y] = pointerPoint(event);
        return x >= 0 && y >= 0 && x < width && y < height ? [Math.floor(x), Math.floor(y)] : null;
    };
    const updateGuide = (cell: [number, number] | null) => {
        if (!showBoardGuides) return;
        setGuideCell(current => current?.[0] === cell?.[0] && current?.[1] === cell?.[1] ? current : cell);
    };
    const startPlacement = (event: PointerEvent<HTMLElement>) => {
        if (!editing || event.pointerType === 'mouse' || event.button !== 0 || !event.isPrimary ||
            (editTool !== 'dots' && editTool !== 'bridges') ||
            stroke.current || placement.current) return;
        const cell = pointerCell(event);
        if (!cell) return;
        // Ordinary touch taps also commit on pointer-up. A browser may omit the
        // compatibility click after a previous touch gesture was cancelled.
        if (showBoardGuides) event.preventDefault();
        suppressClickUntil.current = performance.now() + 500;
        placement.current = { pointerId: event.pointerId, tool: editTool, origin: cell, guided: showBoardGuides };
        updateGuide(cell); setTouchPreview(showBoardGuides);
        if (showBoardGuides) event.currentTarget.setPointerCapture(event.pointerId);
    };
    const finishPlacement = (event: PointerEvent<HTMLElement>, cancel = false) => {
        const active = placement.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const cell = cancel ? null : pointerCell(event);
        placement.current = null;
        setTouchPreview(false); updateGuide(cell);
        suppressClickUntil.current = performance.now() + 500;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (cell && (active.guided || (cell[0] === active.origin[0] && cell[1] === active.origin[1]))) {
            if (active.tool === 'dots') onCellClick(...cell);
            else onBridgeClick(...cell);
        }
    };
    const paint = (point: [number, number]) => {
        const active = stroke.current;
        if (!active) return;
        // Interpolate fast pointer moves so a continuous stroke has no missing segments.
        const [x0, y0] = active.point;
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(point[0] - x0), Math.abs(point[1] - y0)) * 8));
        for (let i = 1; i <= steps; i++) {
            const wall = wallAtPoint(x0 + (point[0] - x0) * i / steps, y0 + (point[1] - y0) * i / steps, width, height, active.side);
            if (!wall) continue;
            const key = wallKey(wall);
            if (active.seen.has(key)) continue;
            active.seen.add(key);
            active.walls = active.adding
                ? [...active.walls.filter(value => wallKey(value) !== key), wall]
                : active.walls.filter(value => wallKey(value) !== key);
            setPreview(wall);
        }
        active.point = point;
        setDraft(active.walls);
    };
    const startStroke = (event: PointerEvent<HTMLElement>) => {
        if (!editingWalls || event.button !== 0 || !event.isPrimary || stroke.current) return;
        const point = pointerPoint(event);
        const wall = wallAtPoint(...point, width, height);
        if (!wall) return; // Only boundaries start a wall stroke.
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const adding = !walls.some(value => wallKey(value) === wallKey(wall));
        stroke.current = { pointerId: event.pointerId, adding, walls, seen: new Set(), point, side: wall.side };
        paint(point);
        announce(wall, adding);
    };
    const movePointer = (event: PointerEvent<HTMLElement>) => {
        const cell = editing ? pointerCell(event) : null;
        if (editing) updateGuide(cell);
        if (placement.current?.pointerId === event.pointerId) {
            setTouchPreview(placement.current.guided && cell !== null);
            return;
        }
        if (!editingWalls) return;
        const point = pointerPoint(event);
        if (stroke.current?.pointerId === event.pointerId) paint(point);
        else if (!stroke.current) setPreview(wallAtPoint(...point, width, height));
    };
    const finishStroke = (event: PointerEvent<HTMLElement>, cancel = false) => {
        const active = stroke.current;
        if (!active || active.pointerId !== event.pointerId) return;
        if (!cancel) paint(pointerPoint(event));
        stroke.current = null;
        setDraft(null);
        setPreview(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (!cancel) onWallsChange(active.walls);
    };
    // Grid lines belong to the nearest cell, so small touch targets have no dead gaps.
    const handleGridClick = (event: MouseEvent<HTMLElement>) => {
        if (event.detail !== 0 && performance.now() < suppressClickUntil.current) return;
        if (editTool !== 'dots' || event.target !== event.currentTarget || isSolving || solvedBoard) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = Math.min(width - 1, Math.floor((event.clientX - bounds.left) / bounds.width * width));
        const y = Math.min(height - 1, Math.floor((event.clientY - bounds.top) / bounds.height * height));
        onCellClick(Math.max(0, x), Math.max(0, y));
    };
    const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, x: number, y: number) => {
        if (editTool === 'walls' && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            return;
        }
        let nextX = x;
        let nextY = y;
        switch (event.key) {
            case 'ArrowLeft': nextX = Math.max(0, x - 1); break;
            case 'ArrowRight': nextX = Math.min(width - 1, x + 1); break;
            case 'ArrowUp': nextY = Math.max(0, y - 1); break;
            case 'ArrowDown': nextY = Math.min(height - 1, y + 1); break;
            case 'Home': nextX = 0; break;
            case 'End': nextX = width - 1; break;
            default: return;
        }
        event.preventDefault();
        if (editTool === 'warps' && event.shiftKey && !isSolving && !solvedBoard) {
            const axis = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'horizontal' : 'vertical';
            if ((event.key === 'ArrowLeft' && x === 0) || (event.key === 'ArrowRight' && x === width - 1) ||
                (event.key === 'ArrowUp' && y === 0) || (event.key === 'ArrowDown' && y === height - 1)) {
                const seam: WarpSeam = { axis, index: axis === 'horizontal' ? y : x };
                onSeamClick(seam); setAnnouncement(`${axis === 'horizontal' ? 'Row' : 'Column'} ${seam.index + 1} warp toggled.`);
            }
            return;
        }
        if (editingWalls && event.shiftKey && event.key.startsWith('Arrow')) {
            const wall = wallBetween([x, y], [nextX, nextY]);
            if (!wall) return;
            const adding = !walls.some(value => wallKey(value) === wallKey(wall));
            onWallsChange(adding ? [...walls, wall] : walls.filter(value => wallKey(value) !== wallKey(wall)));
            announce(wall, adding);
            return;
        }
        const index = nextY * width + nextX;
        setFocusedCell(index);
        gridRef.current?.querySelectorAll<HTMLButtonElement>('[data-cell]')[index]?.focus();
    };
    return (
    <div className="puzzle-grid-frame" style={{ width: `${100 * width / Math.max(width, height)}%` }}>
    {showBoardGuides && <>
        <div className="board-coordinates board-columns" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}>
            {Array.from({ length: width }, (_, x) => <span key={x} className={editing && guideCell?.[0] === x ? 'coordinate-active' : undefined}>{showCoordinate(x, width, coordinateStep.column, editing ? guideCell?.[0] : undefined) ? String.fromCharCode(65 + x) : ''}</span>)}
        </div>
        <div className="board-coordinates board-rows" aria-hidden="true" style={{ gridTemplateRows: `repeat(${height}, minmax(0, 1fr))` }}>
            {Array.from({ length: height }, (_, y) => <span key={y} className={editing && guideCell?.[1] === y ? 'coordinate-active' : undefined}>{showCoordinate(y, height, coordinateStep.row, editing ? guideCell?.[1] : undefined) ? y + 1 : ''}</span>)}
        </div>
    </>}
    <article
        ref={gridRef}
        aria-label="Puzzle Grid Board"
        aria-describedby="board-instructions board-keyboard-help"
        data-solution={solution ? JSON.stringify(solution) : undefined}
        className={`puzzle-grid ${editingWalls ? 'editing-walls' : ''} ${showBoardGuides && editing && (editTool === 'dots' || editTool === 'bridges') ? 'placing-touch' : ''}`}
        onClick={handleGridClick}
        onPointerDown={event => {
            // A fresh gesture must not inherit the previous gesture's compatibility-click guard.
            suppressClickUntil.current = 0;
            cancelledPlacement.current = null;
            startPlacement(event); startStroke(event);
        }}
        onPointerMove={movePointer}
        onPointerUp={event => {
            if ((showBoardGuides && event.pointerType !== 'mouse') || cancelledPlacement.current === event.pointerId) {
                suppressClickUntil.current = performance.now() + 500;
                cancelledPlacement.current = null;
            }
            finishPlacement(event); finishStroke(event);
        }}
        onPointerCancel={event => { finishPlacement(event, true); finishStroke(event, true); }}
        onLostPointerCapture={event => { finishPlacement(event, true); finishStroke(event, true); }}
        onPointerLeave={() => {
            if (!stroke.current) setPreview(null);
            if (!placement.current && !gridRef.current?.contains(document.activeElement)) updateGuide(null);
        }}
        onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) updateGuide(null); }}
        style={{
            gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${height}, minmax(0, 1fr))`,
            '--cell-size': `calc(var(--play-area-size) / ${Math.max(width, height)})`,
            aspectRatio: `${width} / ${height}`,
        } as CSSProperties}
    >
        {Array.from({ length: height }).map((_, y) =>
            Array.from({ length: width }).map((_, x) => {
                const cellValue = currentBoard[x]?.[y] ?? 0;
                const hasColor = cellValue !== 0;
                const endpoint = endpointBoard[x]?.[y] ?? 0;
                const bridge = bridges.find(b => b.x === x && b.y === y);
                const laneColors = solution?.paths.filter(path => path.nodes.some(node => node.x === x && node.y === y)) ?? [];

                return (
                    <button
                        key={`${x}-${y}`}
                        data-cell={`${x},${y}`}
                        type="button"
                        disabled={isSolving || solvedBoard !== null}
                        tabIndex={y * width + x === Math.min(focusedCell, width * height - 1) ? 0 : -1}
                        onFocus={() => { setFocusedCell(y * width + x); if (editing) updateGuide([x, y]); }}
                        onKeyDown={event => moveFocus(event, x, y)}
                        className={`
                            group
                            w-full h-full min-w-0 min-h-0
                            bg-stoic-block-bg
                            p-0 m-0 appearance-none cursor-pointer 
                            flex items-center justify-center 
                            transition-all duration-150
                            touch-manipulation
                            select-none
                            ${solvedBoard ? 'cursor-default' : 'hover:bg-stoic-block-hover active:bg-stoic-block-hover'}
                            ${showBoardGuides && editing && guideCell && (guideCell[0] === x || guideCell[1] === y) ? 'cell-guide' : ''}
                            ${showBoardGuides && editing && guideCell?.[0] === x && guideCell?.[1] === y ? `cell-guide-active ${touchPreview ? 'touch-preview' : ''}` : ''}
                        `}
                        onClick={event => {
                            if (event.detail !== 0 && performance.now() < suppressClickUntil.current) return;
                            if (isSolving || solvedBoard) return;
                            if (editTool === 'dots') onCellClick(x, y);
                            if (editTool === 'bridges') { onBridgeClick(x, y); setAnnouncement(`Bridge toggled, column ${x + 1}, row ${y + 1}.`); }
                        }}
                        aria-label={`Cell ${x},${y} ${bridge ? `Bridge ${bridge.over} on top${laneColors.map(p => `; ${p.nodes.find(n => n.x === x && n.y === y)?.lane} Color ${p.color}`).join('')}` : hasColor ? `Color ${cellValue}` : 'Empty'}`}
                        aria-description={[
                            showBoardGuides ? `${String.fromCharCode(65 + x)}${y + 1}` : '',
                            endpoint && dotLabels === 'letters' ? `${dotLabel(endpoint, dotLabels)}, ${COLOR_LABELS[endpoint].name}` : '',
                        ].filter(Boolean).join('; ') || undefined}
                    >
                        {endpoint ? (
                            <span
                                className="endpoint-dot rounded-full w-[70%] h-[70%]"
                                style={{ backgroundColor: COLORS[endpoint] || '#888', color: dotLabelColor(endpoint) }}
                                aria-hidden="true"
                            >{dotLabel(endpoint, dotLabels)}</span>
                        ) : showBoardGuides && !bridge && editTool === 'dots' && activeColor <= 16 && !solvedBoard && !isResetting && (
                            <span
                                className="endpoint-preview rounded-full w-[70%] h-[70%] transition-opacity duration-75"
                                style={{ backgroundColor: COLORS[activeColor] || '#888' }}
                            />
                        )}
                    </button>
                );
            })
        )}
        <PipeOverlay width={width} height={height} solution={solution} bridges={bridges} />
        {editTool === 'warps' && !solvedBoard && !isSolving && (['left', 'right', 'top', 'bottom'] as const).flatMap(side =>
            Array.from({ length: side === 'left' || side === 'right' ? height : width }, (_, index) => {
                const axis = side === 'left' || side === 'right' ? 'horizontal' : 'vertical';
                const seam: WarpSeam = { axis, index }, key = seamKey(seam);
                const open = warps.some(s => seamKey(s) === key);
                const style: CSSProperties = axis === 'horizontal'
                    ? { [side]: 0, top: `${index / height * 100}%`, height: `${100 / height}%`, width: '12px' }
                    : { [side]: 0, left: `${index / width * 100}%`, width: `${100 / width}%`, height: '12px' };
                return <button key={`${side}-${index}`} data-axis={axis} className={`seam-target ${open ? 'open' : ''} ${highlightSeam === key ? 'paired' : ''}`} style={style}
                    type="button" aria-label={`${axis === 'horizontal' ? 'Row' : 'Column'} ${index + 1} warp, ${side}`} aria-pressed={open}
                    onMouseEnter={() => setHighlightSeam(key)} onMouseLeave={() => setHighlightSeam(null)} onFocus={() => setHighlightSeam(key)} onBlur={() => setHighlightSeam(null)}
                    onClick={event => { event.stopPropagation(); onSeamClick(seam); setAnnouncement(`${axis === 'horizontal' ? 'Row' : 'Column'} ${index + 1} warp ${open ? 'closed' : 'opened'}.`); }} />;
            }))}
        <svg className="warp-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            {warps.flatMap(({ axis, index }) => ['start', 'end'].map(end => {
                const atStart = end === 'start';
                const transform = axis === 'horizontal'
                    ? `translate(${atStart ? 0 : width} ${index}) scale(${atStart ? 1 : -1} 1)`
                    : `translate(${index} ${atStart ? 0 : height}) matrix(0 ${atStart ? 1 : -1} 1 0 0 0)`;
                return <path key={`${axis}-${index}-${end}`} data-warp={`${axis}-${index}`} transform={transform}
                    className={`warp-marker ${highlightSeam === seamKey({ axis, index }) ? 'paired' : ''}`}
                    d="M.02,0 V1" />;
            }))}
        </svg>
        {editingWalls && Array.from({ length: height }, (_, y) =>
            Array.from({ length: width }, (_, x) => (['right', 'down'] as const).map(side => {
                if (side === 'right' ? x === width - 1 : y === height - 1) return null;
                return <span key={`${x},${y},${side}`} className="wall-target" aria-hidden="true" style={side === 'right'
                    ? { left: `${(x + .78) / width * 100}%`, top: `${y / height * 100}%`, width: `${.44 / width * 100}%`, height: `${100 / height}%` }
                    : { left: `${x / width * 100}%`, top: `${(y + .78) / height * 100}%`, width: `${100 / width}%`, height: `${.44 / height * 100}%` }} />;
            }))) }
        <svg className="wall-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
            {visibleWalls.map(wall => <line key={wallKey(wall)} data-wall={wallKey(wall)} className="puzzle-wall"
                x1={wall.x + (wall.side === 'right' ? 1 : 0)} y1={wall.y + (wall.side === 'down' ? 1 : 0)}
                x2={wall.x + 1} y2={wall.y + 1} />)}
            {editingWalls && preview && <line className="wall-preview"
                x1={preview.x + (preview.side === 'right' ? 1 : 0)} y1={preview.y + (preview.side === 'down' ? 1 : 0)}
                x2={preview.x + 1} y2={preview.y + 1} />}
        </svg>
        <span aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</span>
    </article>
    </div>
);
};

export default PuzzleGrid;
