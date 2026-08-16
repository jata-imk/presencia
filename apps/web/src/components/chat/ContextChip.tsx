import { Sparkles } from "lucide-react";

// "Recordando tu voz de marca y tu audiencia" es cierto de verdad, no
// decoración: buildSystemPrompt() (apps/api/src/chat/system-prompt.ts)
// inyecta niche/register/audience de Voz de marca en cada turno. El
// mockup también dice "posts recientes" — se omite porque lo que sí se
// inyecta (referenceExamples) son ejemplos de referencia que el usuario
// cargó, no "tus posts recientes" en el sentido literal.
export function ContextChip() {
  return (
    <div className="mt-4 flex justify-center">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-line-subtle px-3.5 py-1">
        <Sparkles size={11} strokeWidth={1.75} className="text-pink-orchid" />
        <span className="text-[11px] text-fg-muted">Recordando tu voz de marca y tu audiencia</span>
      </div>
    </div>
  );
}
