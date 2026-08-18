// Tres puntos "escribiendo" — @keyframes dotPulse del mockup, portado a
// dot-pulse en app.css. Solo mientras status==="submitted" (el turno se
// envió, ningún token llegó todavía) — un estado real del AI SDK, no un
// paso de progreso inventado (ver MessageAI.tsx para por qué no hay
// "ToolSteps" con texto tipo "Analizando tendencias…"). Orchid literal
// (capa 1, no un token semántico) — el mockup usa el mismo valor en claro
// y oscuro, es decoración, no UI que cambie de significado con el tema.
export function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="size-1.5 rounded-full bg-pink-orchid"
          style={{ animation: `dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  );
}
