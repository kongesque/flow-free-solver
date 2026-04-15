const SolverFooter = () => (
    <footer className="px-6 max-w-lg text-center text-stoic-secondary text-xs leading-relaxed selectable-text shrink-0">
        <p>
            Solve any Flow Free or Numberlink puzzle instantly.
            <br className="hidden sm:block" />
            Powered by C++ Heuristic BFS, SAT (Z3) &amp; A* search.{' '}
            <a
                href="https://www.kongesque.com/blog/flow-free-solver"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-stoic-primary underline transition-colors"
            >
                Read more
            </a>
        </p>
    </footer>
);

export default SolverFooter;
