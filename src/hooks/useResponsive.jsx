import { useState, useEffect } from 'react';

/**
 * Returns { isMobile } — true when viewport width < 640px.
 * Reactively updates on resize.
 */
export function useResponsive() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return { isMobile };
}
