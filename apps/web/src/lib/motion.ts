import type { Transition, Variants } from "motion/react";

// Espejo en JS de las duraciones/easing de tokens.css (--duration-*,
// --ease-out/--ease-in-out) — ver ADR-014. motion no puede leer var() de
// CSS, así que estos números viven acá, pero son el mismo valor: si
// tokens.css cambia, esto cambia con él. Ningún componente hardcodea su
// propia duración/easing (misma regla que "tokens, no hex", AGENTS.md #2).
export const DURATION = {
  fast: 0.15,
  normal: 0.25,
  slow: 0.35,
} as const;

/** cubic-bezier(0, 0, 0.2, 1) — --ease-out en tokens.css. */
export const EASE_OUT: Transition["ease"] = [0, 0, 0.2, 1];
/** cubic-bezier(0.4, 0, 0.2, 1) — --ease-in-out en tokens.css. */
export const EASE_IN_OUT: Transition["ease"] = [0.4, 0, 0.2, 1];

export const TRANSITION_NORMAL: Transition = { duration: DURATION.normal, ease: EASE_OUT };
export const TRANSITION_FAST: Transition = { duration: DURATION.fast, ease: EASE_OUT };

/** Mensaje/card entrando a la lista — espejo de @keyframes fadeUp del mockup. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: TRANSITION_NORMAL },
};

/** Ancho del drawer desktop — empuja el contenido, nunca lo tapa (ver protected.tsx). */
export const drawerPush: Variants = {
  closed: { width: 0, transition: TRANSITION_NORMAL },
  open: { width: 520, transition: TRANSITION_NORMAL },
};

/** Bottom sheet mobile del drawer — sí es modal, entra desde abajo con backdrop. */
export const sheetUp: Variants = {
  hidden: { y: "100%" },
  visible: { y: 0, transition: TRANSITION_NORMAL },
  exit: { y: "100%", transition: TRANSITION_FAST },
};

export const backdropFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: TRANSITION_FAST },
  exit: { opacity: 0, transition: TRANSITION_FAST },
};

/** Toast entrando/saliendo por abajo. */
export const toastIn: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: TRANSITION_NORMAL },
  exit: { opacity: 0, scale: 0.96, transition: TRANSITION_FAST },
};
