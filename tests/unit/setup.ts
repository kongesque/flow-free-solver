import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// jsdom has no layout observer; real viewport sizing is covered in Playwright.
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});
