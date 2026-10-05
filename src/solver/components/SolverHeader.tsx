import { COLORS } from './constants';

const SolverHeader = () => (
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
            <p>Click to place. Click again to remove.</p>
        </div>
    </header>
);

export default SolverHeader;
