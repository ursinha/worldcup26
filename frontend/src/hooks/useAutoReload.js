import { useEffect, useRef } from 'react';
import { usePolling } from './usePolling';

export function useAutoReload() {
  const { data } = usePolling('/api/status', 15_000);
  const initial = useRef(null);

  useEffect(() => {
    if (!data?.commit) return;
    if (initial.current === null) {
      initial.current = data.commit;
      return;
    }
    if (data.commit !== initial.current) {
      window.location.reload();
    }
  }, [data?.commit]);
}
