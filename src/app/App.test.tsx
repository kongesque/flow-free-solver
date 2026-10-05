import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Flow Free Solver title', () => {
  render(<App />);
  const titleElement = screen.getByRole('heading', { name: 'Flow Free Solver' });
  expect(titleElement).toBeInTheDocument();
});
