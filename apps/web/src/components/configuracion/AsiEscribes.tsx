import { Plus, X } from "lucide-react";
import { useState } from "react";
import { STYLE_NOTE_MAX_LENGTH, STYLE_NOTES_MAX } from "@presencia/shared";
import type { EstadoDeCampo } from "../../lib/autoguardado.js";
import { MarcaDeGuardado } from "./primitivas.js";

// «Así escribes» (F12.5, Claude Design "Voz de marca v3"): la tarjeta
// protagonista de Voz de marca. Los rasgos son lo más específico de la voz y
// lo que el creator entiende de un vistazo, por eso van arriba de todo lo
// técnico. Cada rasgo se edita en su lugar; vaciar uno es quitarlo.

interface AsiEscribesProps {
  rasgos: string[];
  onCambiar: (rasgos: string[]) => void;
  estado: EstadoDeCampo | undefined;
}

export function AsiEscribes({ rasgos, onCambiar, estado }: AsiEscribesProps) {
  // El índice que se edita; `rasgos.length` = uno nuevo que todavía no existe.
  const [editando, setEditando] = useState<number | null>(null);

  function confirmar(i: number, texto: string) {
    const limpio = texto.trim();
    setEditando(null);
    if (i === rasgos.length) {
      if (limpio) onCambiar([...rasgos, limpio]);
      return;
    }
    if (limpio === rasgos[i]) return;
    onCambiar(
      limpio ? rasgos.map((r, j) => (j === i ? limpio : r)) : rasgos.filter((_, j) => j !== i),
    );
  }

  const filas = editando === rasgos.length ? [...rasgos, ""] : rasgos;

  return (
    <section className="mb-5 rounded-xl border-[1.5px] border-line-focus bg-card p-5 shadow-sm md:p-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-bold text-fg">Así escribes</h2>
            <MarcaDeGuardado estado={estado} />
          </div>
          <p className="mt-1 text-sm text-fg-secondary">
            Es lo que más pesa cuando escribimos por ti.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 font-display text-[11.5px] font-semibold text-fg-secondary">
          {rasgos.length} de {STYLE_NOTES_MAX}
        </span>
      </div>

      {filas.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-line-focus bg-surface px-4 py-3.5 text-sm leading-normal text-fg-secondary">
          Todavía no hay rasgos. Escribe cómo suenas («Frases cortas», «Sin emojis», «Nunca: ¡Hola,
          familia!») o pega una publicación tuya en «Tus ejemplos».
        </p>
      ) : (
        <ul className="mt-4 border-t border-line-subtle">
          {filas.map((rasgo, i) => (
            <li
              // El índice es la identidad de la fila: los rasgos se editan en
              // su lugar y pueden repetirse a medias mientras se escriben.
              key={i}
              className="group flex items-center gap-3 border-b border-line-subtle py-3"
            >
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-line-focus" />
              {editando === i ? (
                <input
                  autoFocus
                  defaultValue={rasgo}
                  maxLength={STYLE_NOTE_MAX_LENGTH}
                  aria-label="Rasgo"
                  placeholder="Describe un rasgo…"
                  onBlur={(e) => confirmar(i, e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmar(i, e.currentTarget.value);
                    if (e.key === "Escape") {
                      setEditando(null);
                    }
                  }}
                  className="min-w-0 flex-1 border-b-[1.5px] border-line-focus bg-transparent py-0.5 text-[15px] text-fg outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditando(i)}
                  title="Editar"
                  className="min-w-0 flex-1 cursor-text text-left text-[15px] leading-snug text-fg"
                >
                  {rasgo}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setEditando(null);
                  if (i < rasgos.length) onCambiar(rasgos.filter((_, j) => j !== i));
                }}
                aria-label={`Quitar «${rasgo}»`}
                className="flex rounded-md p-1 text-fg-muted opacity-70 group-hover:opacity-100 hover:bg-secondary focus-visible:opacity-100"
              >
                <X size={15} strokeWidth={1.8} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {rasgos.length < STYLE_NOTES_MAX && editando !== rasgos.length && (
        <button
          type="button"
          onClick={() => setEditando(rasgos.length)}
          className="mt-3 flex w-full items-center gap-2 rounded-lg border-[1.5px] border-dashed border-line px-4 py-3 font-display text-sm font-semibold text-fg-secondary hover:bg-secondary"
        >
          <Plus size={15} strokeWidth={1.8} aria-hidden />
          Agregar rasgo
        </button>
      )}
    </section>
  );
}
