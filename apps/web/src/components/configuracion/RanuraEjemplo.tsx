import { ClipboardPaste, Library, X } from "lucide-react";
import { useState } from "react";
import { Tooltip } from "../ui/Tooltip.js";

// Una de las dos ranuras de "Ejemplos de referencia" (doc §2 bloque D, mock
// de Claude Design). Tres estados: vacía (invita a elegir o pegar), pegando
// (textarea con Cancelar/Guardar) y llena (tarjeta con el texto y quitar).
//
// Pegar tiene su propio "Guardar" aunque el resto de la página se guarde
// solo: un post pegado a medias no es un ejemplo, y mandarlo por debounce
// mientras se pega guardaría basura que después alimenta cada generación.
//
// "Elegir de Biblioteca" se ve pero no responde: el módulo Biblioteca todavía
// no existe (decidido con Jose, 2026-09-27). Por eso "Pegar texto" es el
// botón primario mientras tanto.

const MAX_EJEMPLO = 1200;

interface RanuraEjemploProps {
  numero: 1 | 2;
  texto: string;
  onGuardar: (texto: string) => void;
  onQuitar: () => void;
}

export function RanuraEjemplo({ numero, texto, onGuardar, onQuitar }: RanuraEjemploProps) {
  const [pegando, setPegando] = useState(false);
  const [borrador, setBorrador] = useState("");

  if (pegando) {
    const guardar = () => {
      const limpio = borrador.trim();
      if (limpio) onGuardar(limpio);
      setPegando(false);
      setBorrador("");
    };
    return (
      <div className="flex min-h-42.5 flex-col rounded-lg border-[1.5px] border-line-focus bg-card p-3">
        <textarea
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          autoFocus
          // El tope del schema (brandVoiceReferenceExampleSchema). Sin él, un
          // caption largo se veía guardado y el PATCH volvía con 400.
          maxLength={MAX_EJEMPLO}
          aria-label={`Texto del ejemplo ${String(numero)}`}
          placeholder="Pega aquí el texto de tu post…"
          className="min-h-24 w-full flex-1 resize-none bg-transparent text-sm leading-relaxed text-fg outline-none placeholder:text-fg-muted"
        />
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setPegando(false);
              setBorrador("");
            }}
            className="rounded-md border-[1.5px] border-line bg-card px-3 py-1.75 font-display text-[12.5px] font-semibold text-fg-secondary hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={!borrador.trim()}
            className="rounded-md bg-primary px-3.5 py-1.75 font-display text-[12.5px] font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </div>
    );
  }

  if (texto) {
    return (
      <div className="relative min-h-42.5 rounded-lg border border-line bg-surface p-4">
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar ejemplo ${String(numero)}`}
          title="Quitar"
          className="absolute top-2.5 right-2.5 flex size-6.5 items-center justify-center rounded-md bg-card text-fg-muted shadow-xs hover:text-fg"
        >
          <X size={14} strokeWidth={2} aria-hidden />
        </button>
        <span className="mb-2.5 inline-flex rounded-full bg-secondary px-2.25 py-0.75 text-[10px] font-semibold text-accent">
          Ejemplo {numero}
        </span>
        <p className="line-clamp-8 pr-6 text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg-secondary">
          {texto}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-42.5 flex-col items-center justify-center rounded-lg border-[1.5px] border-dashed border-line-focus bg-surface px-4.5 py-5.5 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-secondary">
        <Library size={19} strokeWidth={1.7} className="text-ai" aria-hidden />
      </div>
      <p className="mb-3.5 max-w-50 text-sm leading-normal text-fg-secondary">
        Elige un post de tu Biblioteca o pega uno tuyo.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => setPegando(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.25 py-2 font-display text-[12.5px] font-semibold text-primary-fg hover:bg-primary-hover"
        >
          <ClipboardPaste size={14} strokeWidth={1.8} aria-hidden />
          Pegar texto
        </button>
        <Tooltip label="Próximamente: cuando llegue la Biblioteca">
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 rounded-md border-[1.5px] border-line bg-card px-3.25 py-2 font-display text-[12.5px] font-semibold text-fg-muted disabled:cursor-not-allowed"
          >
            <Library size={14} strokeWidth={1.8} aria-hidden />
            Elegir de Biblioteca
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
