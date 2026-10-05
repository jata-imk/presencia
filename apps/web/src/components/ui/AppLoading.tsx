import { useEffect, useState } from "react";
import { BrandMark } from "./BrandMark.js";

// Lo que se ve mientras se resuelve la sesión al abrir o recargar cualquier
// pantalla (F10.6.2). Antes era "Cargando…" en texto arriba a la izquierda.
// Ahora: nada los primeros 400 ms (casi siempre la sesión llega antes y no
// hay parpadeo), y si tarda, el isotipo al centro con un pulso suave, como
// Claude o ChatGPT al arrancar.
const DELAY_MS = 400;

export function AppLoading() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main
      aria-busy="true"
      aria-label="Cargando Presencia"
      className="flex h-dvh items-center justify-center bg-app"
    >
      {visible && (
        <span className="scale-150 motion-safe:animate-pulse">
          <BrandMark withWordmark={false} />
        </span>
      )}
    </main>
  );
}
