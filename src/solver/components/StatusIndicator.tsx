import { Loader2, X, Check } from 'lucide-react';
import type { EditTool } from '../logic/walls';
import { COLORS } from './constants';

interface StatusIndicatorProps {
    isSolving: boolean;
    isGenerating: boolean;
    generatedPairCount: number | null;
    unavailableMode: string | null;
    error: string | null;
    solvedBoard: number[][] | null;
    solveTime: number | null;
    activeColor: number;
    isPlacingSecond: boolean;
    editingWalls: boolean;
    wallCount: number;
    blockCount: number;
    editTool: EditTool; bridgeCount: number; warpCount: number;
}

const StatusIndicator = ({
    isSolving,
    isGenerating,
    generatedPairCount,
    unavailableMode,
    error,
    solvedBoard,
    solveTime,
    activeColor,
    isPlacingSecond,
    editingWalls,
    wallCount, editTool, bridgeCount, warpCount, blockCount,
}: StatusIndicatorProps) => (
    <div role="status" className="solver-status selectable-text" aria-live="polite" aria-atomic="true">
        {unavailableMode ? (
            <span className="text-stoic-secondary text-xs">
                {unavailableMode} is coming soon. Switch to Classic to edit or solve.
            </span>
        ) : isSolving || isGenerating ? (
            <span className='text-stoic-accent text-sm font-semibold flex items-center gap-2'>
                <Loader2 className="animate-spin h-4 w-4" aria-hidden="true" />
                <span className="working-label">
                    {isGenerating ? 'Generating' : 'Solving'}
                    <span className="working-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
                    <span className="sr-only">…</span>
                </span>
            </span>
        ) : error ? (
            <span
                className='text-sm font-semibold flex items-center gap-2'
                style={{ color: '#FF3B30' }}
            >
                <X className="h-4 w-4 shrink-0" aria-hidden="true" /> {error}
            </span>
        ) : solvedBoard ? (
            <span className='text-stoic-accent text-sm font-semibold flex items-center gap-2'>
                <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> Solved
                {solveTime !== null && (
                    <span className="text-stoic-secondary text-xs opacity-75">
                        ({solveTime < 1000 ? `${Math.round(solveTime)}ms` : `${(solveTime / 1000).toFixed(2)}s`})
                    </span>
                )}
            </span>
        ) : editTool === 'blocks' ? (
            <span className="text-stoic-primary text-xs">Blocks · {blockCount}</span>
        ) : editTool === 'bridges' ? (
            <span className="text-stoic-primary text-xs">Bridges · {bridgeCount}</span>
        ) : editTool === 'warps' ? (
            <span className="text-stoic-primary text-xs">Warps · {warpCount}</span>
        ) : editingWalls ? (
            <span className="text-stoic-primary text-xs">Walls · {wallCount}</span>
        ) : generatedPairCount !== null ? (
            <span className="text-stoic-accent text-xs">
                Generated · {generatedPairCount} pairs
            </span>
        ) : (
            <div className='flex items-center gap-3'>
                {activeColor <= 16 && <span className='text-stoic-primary text-xs'>Place</span>}
                <div className="flex items-center gap-3">
                    {activeColor <= 16 && <span
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: COLORS[activeColor] || '#888' }}
                    />}
                    <span className='text-stoic-primary text-xs'>
                        {activeColor > 16 ? 'All pairs placed' : isPlacingSecond ? 'End' : 'Start'}
                    </span>
                </div>
            </div>
        )}
    </div>
);

export default StatusIndicator;
