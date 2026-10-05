import { useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { COLORS, COLOR_NAMES } from './constants';

interface EndpointPickerProps {
    board: number[][];
    activeColor: number;
    disabled: boolean;
    onSelect: (color: number) => void;
}

const EndpointPicker = ({ board, activeColor, disabled, onSelect }: EndpointPickerProps) => {
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [expanded, setExpanded] = useState(false);
    const counts = new Map<number, number>();
    for (const color of board.flat()) if (color) counts.set(color, (counts.get(color) ?? 0) + 1);
    return (
        <div className="endpoint-picker" onKeyDown={event => {
            if (event.key === 'Escape') { setExpanded(false); triggerRef.current?.focus(); }
        }}>
            <button ref={triggerRef} className="color-picker-trigger" disabled={disabled} aria-expanded={expanded}
                aria-controls="endpoint-colors" onClick={() => setExpanded(!expanded)} aria-label="Choose endpoint color">
                <span className="color-dot" style={{ backgroundColor: COLORS[activeColor] ?? '#8A8E8C' }} />
                <span className="color-picker-label">
                    <span className="section-label">Endpoint color</span>
                    <span>{COLOR_NAMES[activeColor] ?? 'All colors placed'}{activeColor <= 16 && ` · ${counts.get(activeColor) ?? 0}/2 dots`}</span>
                </span>
                <ChevronDown className={expanded ? 'rotate-180' : ''} aria-hidden="true" />
            </button>
            {expanded && (
                <div id="endpoint-colors" className="color-options" role="group" aria-label="Endpoint colors">
                    {Object.entries(COLORS).map(([value, color]) => {
                        const number = Number(value);
                        const count = counts.get(number) ?? 0;
                        return (
                            <button key={number} className="color-option" disabled={disabled || count === 2}
                                aria-label={`${COLOR_NAMES[number]}, ${count} of 2 endpoints`}
                                aria-pressed={activeColor === number} title={`${COLOR_NAMES[number]} · ${count}/2 dots`}
                                onClick={() => { onSelect(number); setExpanded(false); triggerRef.current?.focus(); }}>
                                <span className="color-dot" style={{ backgroundColor: color }} />
                                <span>{count === 2 ? <Check aria-hidden="true" /> : `${count}/2`}</span>
                            </button>
                        );
                    })}
                    <p className="control-hint">Two dots per color. Remove a dot on the board to change a completed pair.</p>
                </div>
            )}
        </div>
    );
};

export default EndpointPicker;
