import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  // Copies kept for fast opening must not carry from one test into the next.
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
