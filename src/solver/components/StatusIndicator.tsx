import { Loader2, X, Check } from 'lucide-react';
import { COLORS } from './constants';

interface StatusIndicatorProps {
    isSolving: boolean;
    error: string | null;
    solvedBoard: number[][] | null;
    solveTime: number | null;
    activeColor: number;
    isPlacingSecond: boolean;
}

const StatusIndicator = ({
    isSolving,
    error,
    solvedBoard,
    solveTime,
    activeColor,
    isPlacingSecond,
}: StatusIndicatorProps) => (
    <div role="status" className='flex items-center gap-3 min-h-[28px] selectable-text'>
        {isSolving ? (
            <span className='text-stoic-accent text-sm uppercase tracking-widest font-semibold flex items-center gap-2'>
                <Loader2 className="animate-spin h-4 w-4" aria-hidden="true" />
                Solving…
            </span>
        ) : error ? (
            <span
                className='text-sm uppercase tracking-widest font-semibold animate-pulse flex items-center gap-2'
                style={{ color: '#FF3B30' }}
            >
                <X className="h-4 w-4" /> {error}
            </span>
        ) : solvedBoard ? (
            <span className='text-stoic-accent text-sm uppercase tracking-widest font-semibold flex items-center gap-2'>
                <Check className="h-4 w-4" /> Solved
                {solveTime !== null && (
                    <span className="text-stoic-secondary text-xs opacity-75">
                        ({solveTime < 1000 ? `${Math.round(solveTime)}ms` : `${(solveTime / 1000).toFixed(2)}s`})
                    </span>
                )}
            </span>
        ) : (
            <div className='flex items-center gap-3'>
                <span className='text-stoic-primary text-sm uppercase tracking-wider font-medium'>Place</span>
                <div className="flex items-center gap-3">
                    <span
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: COLORS[activeColor] || '#888' }}
                    />
                    <span className='text-stoic-primary text-sm uppercase tracking-wider font-medium'>
                        {isPlacingSecond ? 'End' : 'Start'}
                    </span>
                </div>
            </div>
        )}
    </div>
);

export default StatusIndicator;
