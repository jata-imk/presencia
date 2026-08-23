import { useState } from "react";

// Círculo plum con el isotipo invertido a blanco (Chat Conversation.html).
// El PNG todavía no existe en el repo — Jose lo baja de Claude Design a
// public/assets/ (ver docs/reference/design-tokens.md §Pendientes). Hasta
// entonces onError apaga el <img> y queda el círculo liso: nunca un ícono
// de imagen rota.
export function PresenciaAvatar({ size = 28 }: { size?: number }) {
  const [broken, setBroken] = useState(false);

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-brand shadow-xs"
      style={{ width: size, height: size }}
    >
      {!broken && (
        <img
          src="/assets/isotipo.png"
          alt=""
          onError={() => setBroken(true)}
          className="object-contain brightness-0 invert"
          style={{ width: size * 0.55, height: size * 0.55 }}
        />
      )}
    </div>
  );
}
