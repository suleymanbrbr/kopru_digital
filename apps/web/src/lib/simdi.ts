import { useEffect, useState } from 'react';

/** Render sirasinda `Date.now()` cagirmamak icin: "simdi" durumda tutulur ve dakikada bir tazelenir. */
export function useSimdi(aralikMs = 60_000): number {
  const [simdi, setSimdi] = useState(() => Date.now());
  useEffect(() => {
    const z = setInterval(() => {
      setSimdi(Date.now());
    }, aralikMs);
    return () => {
      clearInterval(z);
    };
  }, [aralikMs]);
  return simdi;
}
