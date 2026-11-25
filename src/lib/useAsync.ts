import { useEffect, useState } from 'react';

interface Settled<T> {
  key: unknown;
  value?: T;
  error?: Error;
}

/**
 * Runs `load` whenever `key` changes and ignores answers that arrive for an older key.
 * `value` keeps the previous result while the next one loads, so views do not flicker.
 * Pass `key = null` to skip loading.
 */
export function useAsync<T>(key: unknown, load: () => Promise<T>): { value?: T; error?: Error; loading: boolean } {
  const [settled, setSettled] = useState<Settled<T>>({ key: null });

  useEffect(() => {
    if (key === null) return;
    let stale = false;
    load().then(
      (value) => !stale && setSettled({ key, value }),
      (error: Error) => !stale && setSettled({ key, error }),
    );
    return () => {
      stale = true;
    };
    // `load` is intentionally not a dependency: `key` describes everything it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { value: settled.value, error: settled.error, loading: key !== null && settled.key !== key };
}
