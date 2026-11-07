import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// input-otp, jsdom'da bulunmayan elementFromPoint'i cagirir.
document.elementFromPoint = () => null;
