import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { COLORS, COLOR_INK, COLOR_NAMES } from './constants';
import { wallBetween, wallKey, type Wall, type EditTool } from '../logic/walls';

type Cell = [number, number];
interface PuzzleGridProps {
    width: number;
    height: number;
    currentBoard: number[][];
    endpoints: number[][];
    solvedBoard: number[][] | null;
    isSolving: boolean;
    activeColor: number;
    isResetting: boolean;
    onCellClick: (x: number, y: number) => void;
    walls: Wall[];
    editTool: EditTool;
    zoomed: boolean;
    onWallsChange: (walls: Wall[]) => void;
    wallStart: Cell | null;
    onWallStartChange: (cell: Cell | null) => void;
}

const PuzzleGrid = ({ width, height, currentBoard, endpoints, solvedBoard, isSolving,
    activeColor, isResetting, onCellClick, walls, editTool, zoomed, onWallsChange,
    wallStart, onWallStartChange }: PuzzleGridProps) => {
    const gridRef = useRef<HTMLElement>(null);
    const [focusedCell, setFocusedCell] = useState(0);
    const [preview, setPreview] = useState<Wall | null>(null);
    const [announcement, setAnnouncement] = useState('');
    const pan = useRef<{ pointerId: number; x: number; y: number; left: number; top: number; viewport: HTMLElement; moved: boolean } | null>(null);
    const suppressClick = useRef(false);
    const editingWalls = editTool === 'walls' && !isSolving && !solvedBoard;

    useEffect(() => {
        pan.current = null;
        suppressClick.current = false;
        setPreview(null);
    }, [walls, width, height, editTool, isSolving, solvedBoard, zoomed]);

    const toggleWall = (wall: Wall) => {
        const adding = !walls.some(value => wallKey(value) === wallKey(wall));
        onWallsChange(adding ? [...walls, wall] : walls.filter(value => wallKey(value) !== wallKey(wall)));
        onWallStartChange(null);
        setPreview(null);
        setAnnouncement(`Wall ${adding ? 'added' : 'removed'} between column ${wall.x + 1}, row ${wall.y + 1} and column ${wall.x + (wall.side === 'right' ? 2 : 1)}, row ${wall.y + (wall.side === 'down' ? 2 : 1)}.`);
    };
    const editCell = (x: number, y: number) => {
        if (isSolving || solvedBoard) return;
        if (editTool === 'dots') {
            onCellClick(x, y);
            return;
        }
        if (wallStart) {
            if (wallStart[0] === x && wallStart[1] === y) {
                onWallStartChange(null);
                setPreview(null);
                return;
            }
            const wall = wallBetween(wallStart, [x, y]);
            if (wall) {
                toggleWall(wall);
                return;
            }
        }
        onWallStartChange([x, y]);
        setPreview(null);
    };
    const startPan = (event: PointerEvent<HTMLElement>) => {
        if (isSolving || solvedBoard || event.button !== 0 || !event.isPrimary) return;
        suppressClick.current = false;
        if (!zoomed && !editingWalls) return;
        const viewport = event.currentTarget.parentElement!;
        pan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
            left: viewport.scrollLeft, top: viewport.scrollTop, viewport, moved: false };
        if (zoomed && event.pointerType !== 'touch') event.currentTarget.setPointerCapture(event.pointerId);
    };
    const movePan = (event: PointerEvent<HTMLElement>) => {
        const active = pan.current;
        if (active?.pointerId !== event.pointerId) return;
        const dx = event.clientX - active.x, dy = event.clientY - active.y;
        if (active.moved || Math.hypot(dx, dy) > 6) {
            active.moved = true;
            suppressClick.current = true;
            if (zoomed && event.pointerType !== 'touch') {
                event.preventDefault();
                active.viewport.scrollLeft = active.left - dx;
                active.viewport.scrollTop = active.top - dy;
            }
        }
    };
    const finishPan = (event: PointerEvent<HTMLElement>, cancel = false) => {
        const active = pan.current;
        if (active?.pointerId !== event.pointerId) return;
        suppressClick.current = active.moved || cancel;
        pan.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };
    // Grid-line taps and captured clicks still map to a full-sized cell target.
    const handleGridClick = (event: MouseEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget || isSolving || solvedBoard) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = Math.min(width - 1, Math.floor((event.clientX - bounds.left) / bounds.width * width));
        const y = Math.min(height - 1, Math.floor((event.clientY - bounds.top) / bounds.height * height));
        editCell(Math.max(0, x), Math.max(0, y));
    };
    const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, x: number, y: number) => {
        if (editingWalls && event.key === 'Escape') {
            event.preventDefault();
            onWallStartChange(null);
            setPreview(null);
            return;
        }
        let nextX = x, nextY = y;
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
        if (editingWalls && event.shiftKey && event.key.startsWith('Arrow')) {
            const wall = wallBetween([x, y], [nextX, nextY]);
            if (wall) toggleWall(wall);
            return;
        }
        const index = nextY * width + nextX;
        setFocusedCell(index);
        gridRef.current?.querySelectorAll('button')[index]?.focus();
    };
    return (
        <article ref={gridRef} aria-label="Puzzle Grid Board" aria-describedby="board-instructions board-keyboard-help"
            className={`puzzle-grid ${editingWalls ? 'editing-walls' : ''}`}
            onClick={handleGridClick}
            onClickCapture={event => {
                if (event.detail > 0 && suppressClick.current) {
                    event.preventDefault();
                    event.stopPropagation();
                    suppressClick.current = false;
                }
            }}
            onPointerDown={startPan} onPointerMove={movePan} onPointerUp={event => finishPan(event)}
            onPointerCancel={event => finishPan(event, true)} onLostPointerCapture={event => finishPan(event, true)}
            onPointerLeave={() => setPreview(null)}
            style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${height}, minmax(0, 1fr))`,
                '--grid-width': `${100 * width / Math.max(width, height)}%`, '--pair-label-size': `${45 / width}cqw`,
                aspectRatio: `${width} / ${height}`, ...(zoomed ? { width: width * 48, minWidth: '100%' } : {}),
            } as CSSProperties}>
            {Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
                const cellValue = currentBoard[x]?.[y] ?? 0;
                const hasColor = cellValue !== 0;
                const origin = editingWalls && wallStart?.[0] === x && wallStart[1] === y;
                const neighbor = editingWalls && wallStart && Math.abs(wallStart[0] - x) + Math.abs(wallStart[1] - y) === 1;
                return (
                    <button key={`${x}-${y}`} type="button" disabled={isSolving || solvedBoard !== null}
                        tabIndex={y * width + x === Math.min(focusedCell, width * height - 1) ? 0 : -1}
                        onFocus={() => { setFocusedCell(y * width + x); setPreview(editingWalls && wallStart ? wallBetween(wallStart, [x, y]) : null); }}
                        onPointerEnter={() => setPreview(editingWalls && wallStart ? wallBetween(wallStart, [x, y]) : null)}
                        onKeyDown={event => moveFocus(event, x, y)} onClick={() => editCell(x, y)}
                        className={`group w-full h-full min-w-0 min-h-0 bg-stoic-block-bg p-0 m-0 appearance-none cursor-pointer
                            flex items-center justify-center touch-manipulation select-none ${origin ? 'wall-origin' : neighbor ? 'wall-choice' : ''}`}
                        aria-label={`Cell ${x},${y} ${hasColor ? `Color ${cellValue}` : 'Empty'}`}
                        aria-pressed={editingWalls ? Boolean(origin) : undefined}
                        aria-describedby={hasColor ? `pair-name-${cellValue}` : undefined}>
                        {hasColor ? <span className="endpoint-dot rounded-full w-[70%] h-[70%]" aria-hidden="true"
                            style={{ backgroundColor: COLORS[cellValue] || '#888', color: COLOR_INK[cellValue] }}>
                            {(!solvedBoard || endpoints[x]?.[y] === cellValue) && cellValue}
                        </span> : editTool === 'dots' && !solvedBoard && !isResetting &&
                            <span className="endpoint-preview rounded-full w-[70%] h-[70%]" style={{ backgroundColor: COLORS[activeColor] || '#888' }} />}
                    </button>
                );
            }))}
            <svg className="wall-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
                {walls.map(wall => <line key={wallKey(wall)} data-wall={wallKey(wall)} className="puzzle-wall"
                    x1={wall.x + (wall.side === 'right' ? 1 : 0)} y1={wall.y + (wall.side === 'down' ? 1 : 0)}
                    x2={wall.x + 1} y2={wall.y + 1} vectorEffect="non-scaling-stroke" />)}
                {editingWalls && preview && <line className="wall-preview"
                    x1={preview.x + (preview.side === 'right' ? 1 : 0)} y1={preview.y + (preview.side === 'down' ? 1 : 0)}
                    x2={preview.x + 1} y2={preview.y + 1} vectorEffect="non-scaling-stroke" />}
            </svg>
            <span aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</span>
            {Object.entries(COLOR_NAMES).map(([color, name]) => <span key={color} id={`pair-name-${color}`} className="sr-only">{name}, pair {color}.</span>)}
        </article>
    );
};
export default PuzzleGrid;
