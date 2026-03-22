// Mock for virtual:pwa-register/react — used in Storybook so UpdatePrompt
// stories don't crash when the virtual Vite PWA module isn't available.
import { useState } from 'react';

export function useRegisterSW() {
  const [needRefresh, setNeedRefresh] = useState(false);
  return {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker: () => {},
  };
}
