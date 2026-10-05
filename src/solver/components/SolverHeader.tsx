import GitHubIcon from './GitHubIcon';

const SolverHeader = () => (
    <header className="solver-header selectable-text">
        <div>
            <h1>Flow Free Solver</h1>
            <p>Tap two cells for each color.</p>
        </div>
        <a href="https://github.com/Kongesque/flow-free-solver" target="_blank" rel="noopener noreferrer"
            className="source-link" aria-label="View source on GitHub">
            <GitHubIcon className="size-5" />
        </a>
    </header>
);

export default SolverHeader;
