import { useEffect } from 'react';

/** Sets the browser tab / screen-reader page title ("Dashboard · FormFit"). */
export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · FormFit`;
  }, [title]);
}
