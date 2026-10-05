
import FlowSolver from '@/solver/components/FlowSolver';
import GitHubIcon from '@/solver/components/GitHubIcon';


function App() {
  return (
    <div className="relative text-center">
      <a className="source-link" href="https://github.com/Kongesque/flow-free-solver" target="_blank" rel="noreferrer"
        aria-label="View source on GitHub (opens in a new tab)">
        <GitHubIcon />
      </a>
      <FlowSolver />
    </div>
  );
}

export default App;
