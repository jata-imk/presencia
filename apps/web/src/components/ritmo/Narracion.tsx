import { Sparkles } from "lucide-react";
import type { RitmoNarracionDto } from "@presencia/shared";
import { formatScheduleDateTime } from "../../lib/calendar/tz.js";
import { Button } from "../ui/Button.js";

// "Explícame mi ritmo": el resumen redactado, bajo demanda.
//
// Bajo demanda y no automático porque cuesta. El botón es lo que dice que a
// esta persona le interesa; generarlo al abrir la pantalla sería cobrarle a
// todo el mundo por un texto que casi nadie lee.
//
// La fecha va SIEMPRE junto al texto, y no es decoración: la narración es una
// foto de un momento, y si el usuario publica después de pedirla, lo que dice
// deja de cuadrar con los números que tiene alrededor. Fechada es una foto;
// sin fecha, sería el producto afirmando algo que ya no es cierto.

export function Narracion({
  narracion,
  generando,
  error,
  timezone,
  onPedir,
}: {
  narracion: RitmoNarracionDto | null;
  generando: boolean;
  error: string | null;
  timezone: string;
  onPedir: () => void;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-wider text-fg-muted uppercase">
            Tus números, en palabras
          </p>
          <h2 className="font-display text-lg font-bold text-fg">Explícame mi ritmo</h2>
        </div>
        <Button variant="secondary" onClick={onPedir} disabled={generando}>
          <span className="flex items-center gap-2">
            <Sparkles size={15} className="text-accent" aria-hidden />
            {/* `generando` se pregunta PRIMERO: con la narración ya en
                pantalla, el segundo click deshabilitaba el botón sin cambiar
                nada más, así que en una petición lenta el usuario veía un
                botón muerto.

                "Volver a leerlo" y no "Generar de nuevo": el servidor devuelve
                la misma narración del día sin cobrar, y ofrecer regenerar
                prometería algo que no pasa. */}
            {generando ? "Leyendo tus números…" : narracion ? "Volver a leerlo" : "Explícamelo"}
          </span>
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[13px] text-error">
          {error}
        </p>
      )}

      {generando && !narracion ? (
        <div className="mt-4 flex flex-col gap-2" aria-hidden>
          <span className="h-3.5 w-full animate-pulse rounded bg-secondary" />
          <span className="h-3.5 w-11/12 animate-pulse rounded bg-secondary" />
          <span className="h-3.5 w-3/5 animate-pulse rounded bg-secondary" />
        </div>
      ) : narracion ? (
        <div className="mt-4">
          <p className="text-[15px] leading-relaxed text-fg">{narracion.body}</p>
          <p className="mt-3 text-xs text-fg-muted">
            Escrito con IA a partir de tus números del{" "}
            {formatScheduleDateTime(narracion.generatedAt, timezone)}. Se genera uno por día.
          </p>
        </div>
      ) : (
        <p className="mt-3 max-w-[560px] text-[13px] text-fg-secondary">
          Te leemos tu cadencia, tus metas y tus mejores horarios, y te decimos en pocas frases cómo
          vas y qué mover esta semana.
        </p>
      )}
    </section>
  );
}
