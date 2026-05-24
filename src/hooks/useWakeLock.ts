import { useEffect, useState } from 'react';

export function useWakeLock() {
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    setIsSupported('wakeLock' in navigator);
  }, []);

  const requestWakeLock = async () => {
    if (!isSupported || isActive || hasFailed) return;

    try {
      const sentinel = await (navigator as any).wakeLock.request('screen');
      setIsActive(true);
      
      sentinel.addEventListener('release', () => {
        setIsActive(false);
      });

      return sentinel;
    } catch (err) {
      setHasFailed(true);
      // Only log if it's not a permission policy issue, or log once
      if (err instanceof Error && err.name === 'NotAllowedError') {
        console.warn('Wake Lock is blocked by permissions policy or user preference.');
      } else {
        console.error('Wake Lock request failed:', err);
      }
    }
  };

  return { isSupported, isActive, requestWakeLock };
}
