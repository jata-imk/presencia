import { useEffect, useState } from "react";

// Sin librería de breakpoints en el repo — un hook chico basta. Se usa para
// decidir entre el drawer desktop (empuja, hermano flex) y el bottom sheet
// mobile (modal con backdrop) — ver ScheduleDrawer.tsx y ADR-014.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, [query]);

  return matches;
}
