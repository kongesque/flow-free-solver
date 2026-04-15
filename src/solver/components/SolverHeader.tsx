import GitHubIcon from './GitHubIcon';

const SolverHeader = () => (
    <>
        <a
            href="https://github.com/Kongesque/flow-free-solver"
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-4 right-4 sm:top-6 sm:right-6 text-stoic-secondary hover:text-stoic-primary transition-colors z-50 p-2"
            aria-label="View source on GitHub"
        >
            <GitHubIcon className="size-6 sm:size-8" />
        </a>

        <header className='text-center flex flex-col items-center gap-1 selectable-text shrink-0 mb-2'>
            <h1
                className='text-stoic-primary text-xl sm:text-2xl md:text-3xl lg:text-4xl uppercase tracking-[0.1em]'
                style={{ fontFamily: 'Geist Pixel Circle' }}
            >
                Flow Free Solver
            </h1>
            <p className="text-stoic-secondary text-xs mt-1 mx-4">
                <strong className="text-stoic-primary">Tips:</strong> Click to place endpoints, click again to remove.
            </p>
        </header>
    </>
);

export default SolverHeader;
