import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Flow Free Solver title', () => {
  render(<App />);
  const titleElement = screen.getByText(/Flow Free Solver/i);
  expect(titleElement).toBeInTheDocument();
});
