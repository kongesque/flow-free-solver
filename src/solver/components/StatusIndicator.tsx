import { Loader2, X, Check } from 'lucide-react';
import { COLORS, COLOR_INK, COLOR_NAMES } from './constants';

interface StatusIndicatorProps {
    isSolving: boolean;
    isGenerating: boolean;
    generatedPairCount: number | null;
    error: string | null;
    solvedBoard: number[][] | null;
    activeColor: number;
    isPlacingSecond: boolean;
    editingWalls: boolean;
    choosingNeighbor: boolean;
    hasDots: boolean;
    onPlaceDots: () => void;
}

const StatusIndicator = ({
    isSolving,
    isGenerating,
    generatedPairCount,
    error,
    solvedBoard,
    activeColor,
    isPlacingSecond,
    editingWalls,
    choosingNeighbor,
    hasDots,
    onPlaceDots,
}: StatusIndicatorProps) => (
    <div role="status" className="solver-status selectable-text" aria-live="polite" aria-atomic="true">
        {isSolving || isGenerating ? (
            <span className='text-stoic-accent text-sm font-semibold flex items-center gap-2'>
                <Loader2 className="animate-spin h-4 w-4" aria-hidden="true" />
                {isGenerating ? 'Generating…' : 'Solving…'}
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
            </span>
        ) : editingWalls ? (
            <div className="placement-guidance">
                <span>{choosingNeighbor ? 'Pick a neighbor' : 'Pick a cell'}</span>
                <span className="placement-guidance-helper">Tap cells to add/remove.</span>
            </div>
        ) : generatedPairCount !== null ? (
            <span className="text-stoic-accent text-xs">
                Generated · {generatedPairCount} pairs
            </span>
        ) : (
            <div className='flex items-center gap-2'>
                {activeColor <= 16 && <><span className="status-color" aria-hidden="true"
                    style={{ backgroundColor: COLORS[activeColor], color: COLOR_INK[activeColor] }}>{activeColor}</span>
                    <span className="sr-only">{COLOR_NAMES[activeColor]}, pair {activeColor}. </span></>}
                <div className="placement-guidance">
                    <span>{activeColor > 16 ? 'All pairs placed' : isPlacingSecond ? 'Place matching dot' : hasDots ? 'Place next pair' : 'Place first dot'}</span>
                    <span className="placement-guidance-helper">Tap a cell. Tap again to remove.</span>
                </div>
            </div>
        )}
        {editingWalls && !isSolving && !isGenerating && !solvedBoard && <button type="button" className="status-action" aria-label="Place dots" onClick={onPlaceDots}><span className="full-tool-label">Place dots</span><span className="compact-tool-label" aria-hidden="true">Dots</span></button>}
    </div>
);

export default StatusIndicator;
