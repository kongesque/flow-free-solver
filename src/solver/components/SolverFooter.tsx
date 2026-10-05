const SolverFooter = () => (
    <footer className="solver-footer selectable-text">
        <p>
            Made for Flow Free &amp; Numberlink.
            <br className="hidden sm:block" />
            Solved locally in your browser.{' '}
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
