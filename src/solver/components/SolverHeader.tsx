import type { EditTool } from '../logic/walls';
import { COLORS } from './constants';

const SolverHeader = ({ editTool }: { editTool: EditTool }) => (
    <header className="solver-header selectable-text">
        <div>
            <h1 aria-label="Flow Free Solver">
                <span aria-hidden="true">
                    <span className="title-name">Flow Free</span>{' '}
                    {Array.from('Solver').map((letter, index) => (
                        <span key={index} className="title-letter"
                            style={{ color: `color-mix(in srgb, ${COLORS[index + 1]} 65%, white)` }}>
                            {letter}
                        </span>
                    ))}
                </span>
            </h1>
            <p>{editTool === 'dots' ? 'Select a cell to place or remove a dot.' : editTool === 'walls' ? 'Draw boundaries between cells.' : editTool === 'bridges' ? 'Add crossings inside the board.' : 'Connect opposite board edges.'}</p>
        </div>
    </header>
);

export default SolverHeader;
