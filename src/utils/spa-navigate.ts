import { useEffect, useState } from 'react';

type NavigationListener = (pathname: string) => void;

function createSPANavigate() {
  const listeners = new Set<NavigationListener>();

  function dispatch() {
    for (const fn of listeners) {
      try {
        fn(location.pathname);
      } catch (e) {
        console.error('[SPANavigate]', e);
      }
    }
  }

  const originalPush = history.pushState.bind(history);
  const originalReplace = history.replaceState.bind(history);

  history.pushState = (...args: Parameters<typeof history.pushState>) => {
    originalPush(...args);
    dispatch();
  };

  history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
    originalReplace(...args);
    dispatch();
  };

  window.addEventListener('popstate', dispatch);

  return {
    on: (fn: NavigationListener) => listeners.add(fn),
    off: (fn: NavigationListener) => listeners.delete(fn),
  };
}

const SPANavigate = createSPANavigate();

export function usePathname(): string {
  const [pathname, setPathname] = useState(() => location.pathname);

  useEffect(() => {
    SPANavigate.on(setPathname);
    return () => SPANavigate.off(setPathname);
  }, []);

  return pathname;
}
