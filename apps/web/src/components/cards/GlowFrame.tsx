import type { ReactNode } from "react";

// Borde animado de card en borrador — portado de arquetipos.jsx
// (Claude Design "Presencia - Chat"). El degradado usa la paleta pastel de
// marca (capa 1 de tokens: decorativo, no semántico — mismo criterio que
// design-tokens.md permite para casos de marca). El keyframe "glowPulse"
// que el mockup referenciaba para el modo `pulse` no está definido en
// ningún archivo del proyecto que haya podido leer — se omite en vez de
// inventar valores; la rotación del degradado (glow-rotate, app.css) ya
// transmite "esto está vivo/en progreso".
export function GlowFrame({
  children,
  radius = 16,
  thickness = 2,
}: {
  children: ReactNode;
  radius?: number;
  thickness?: number;
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
        animation: "glow-rotate 5s linear infinite",
      }}
    >
      <div className="overflow-hidden bg-card" style={{ borderRadius: radius }}>
        {children}
      </div>
    </div>
  );
}
