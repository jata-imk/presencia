import { useEffect, useState } from "react";

// Mientras llegan los mensajes de una conversación (F10.6.2): antes,
// "Cargando…" en texto. Un spinner sencillo y lento al centro, que aparece
// solo si la carga tarda (300 ms): casi siempre los mensajes llegan antes y
// no hay nada que parpadee. Se probó un esqueleto con la forma del chat y a
// Jose no le gustó el destello; para el chat, el spinner.
const DELAY_MS = 300;

export function ChatLoading() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main
      aria-busy="true"
      aria-label="Cargando la conversación"
      className="flex h-full items-center justify-center"
    >
      {visible && (
        <span
          aria-hidden
          className="size-7 rounded-full border-[2.5px] border-line border-t-accent motion-safe:animate-[spin_1.1s_linear_infinite]"
        />
      )}
    </main>
  );
}
