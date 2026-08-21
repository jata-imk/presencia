import type { ReactNode } from "react";

// Borde animado de card en borrador — portado de arquetipos.jsx
// (Claude Design "Presencia - Chat"). El degradado usa la paleta pastel de
// marca (capa 1 de tokens: decorativo, no semántico — mismo criterio que
// design-tokens.md permite para casos de marca). El keyframe "glowPulse"
// del mockup (pulse=true por default en PArq.GlowFrame: rotate+pulse juntos)
// se corrige acá — un comentario anterior decía que no estaba definido en
// ningún archivo del proyecto; sí lo está (Chat Conversation.html, Chat
// Cards Arquetipos.html), solo no se había leído ese archivo todavía
// (F6 PR5). Portado a app.css como glow-pulse.
export function GlowFrame({
  children,
  radius = 16,
  thickness = 2,
  pulse = true,
}: {
  children: ReactNode;
  radius?: number;
  thickness?: number;
  pulse?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        borderRadius: radius + thickness,
        padding: thickness,
        background:
          "linear-gradient(120deg, var(--color-pink-orchid) 0%, var(--color-blush-pop) 33%, var(--color-icy-blue) 66%, var(--color-pink-orchid) 100%)",
        backgroundSize: "300% 300%",
        animation: pulse
          ? "glow-rotate 5s linear infinite, glow-pulse 4s ease-in-out infinite"
          : "glow-rotate 5s linear infinite",
        // --glow-shadow (tokens.css) en vez de rgba() a mano (code review
        // 2026-08-20) — mismo color-mix() que ya resuelve variantes
        // translúcidas de otros tokens en el proyecto.
        boxShadow: pulse ? undefined : "var(--glow-shadow)",
      }}
    >
      <div className="overflow-hidden bg-card" style={{ borderRadius: radius }}>
        {children}
      </div>
    </div>
  );
}
