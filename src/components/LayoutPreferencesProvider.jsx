import { createContext, useEffect, useState } from 'react';

export const LayoutPreferencesContext = createContext(null);

export default function LayoutPreferencesProvider({ children }) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    function updateViewport() {
      root.style.setProperty(
        '--app-viewport-height',
        `${viewport?.height ?? window.innerHeight}px`,
      );
      root.style.setProperty('--app-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    }
    updateViewport();
    window.addEventListener('resize', updateViewport);
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      root.style.removeProperty('--app-viewport-height');
      root.style.removeProperty('--app-viewport-top');
    };
  }, []);

  return (
    <LayoutPreferencesContext.Provider value={{ isSidebarCollapsed, setIsSidebarCollapsed }}>
      {children}
    </LayoutPreferencesContext.Provider>
  );
}
