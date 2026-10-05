import { Loader2, X, Check } from 'lucide-react';
import { COLORS, COLOR_NAMES } from './constants';

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
}: StatusIndicatorProps) => (
    <div role="status" className="solver-status selectable-text" aria-live="polite" aria-atomic="true">
        {unavailableMode ? (
            <span className="text-stoic-secondary text-xs">
                {unavailableMode} is coming soon. Switch to Standard to edit or solve.
            </span>
        ) : isSolving || isGenerating ? (
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
                {solveTime !== null && (
                    <span className="text-stoic-secondary text-xs opacity-75">
                        ({solveTime < 1000 ? `${Math.round(solveTime)}ms` : `${(solveTime / 1000).toFixed(2)}s`})
                    </span>
                )}
            </span>
        ) : generatedPairCount !== null ? (
            <span className="text-stoic-accent text-xs sm:text-sm">
                Generated solvable puzzle · {generatedPairCount} pairs
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
                        {activeColor > 16 ? 'All pairs placed' : `${COLOR_NAMES[activeColor]} · ${isPlacingSecond ? 'End' : 'Start'}`}
                    </span>
                </div>
            </div>
        )}
    </div>
);

export default StatusIndicator;
