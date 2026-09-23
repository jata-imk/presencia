import { TREND_SIGNAL_LABELS, type TrendSignal } from "@presencia/shared";

// Tarjeta de sugerencia (Chat Module.html, ChatEmptyState).
//
// El mockup traía dos tarjetas de "Tendencia" con métrica ("+24%", "+18%") y
// F6 no las pintó porque no había datos. F9 trae las tendencias de verdad,
// pero SIN el porcentaje: `presencia-ritmo.md` §8 lo prohíbe explícitamente
// para tendencias —no hay fuente real de la que saque el número— y deja en su
// lugar la señal cualitativa. El doc del Chat, que es anterior, pedía ese
// "+24%"; se corrigió en este mismo PR.
//
// Lo que sí llevan es la fuente citada, que es la otra mitad de la regla.
//
// **Todas miden lo mismo, y eso es estructural.** La rejilla del estado vacío
// tiene siempre cuatro: dos fijas y dos que pueden ser una tendencia, su
// esqueleto o una sugerencia de reserva. Con alto natural, cada uno de esos
// tres estados daba una altura distinta y la pantalla saltaba al cambiar entre
// ellos. Este es el alto de la más alta —una tendencia— medido en el navegador;
// el recorte del texto es lo que garantiza que ninguna lo exceda.
//
// El número importa más de lo que parece: el estado vacío entero tiene que
// caber sin scroll en una pantalla de portátil, y la rejilla es lo que más pesa
// de la columna. Por eso la insignia y la fuente comparten fila — en dos
// renglones separados la tarjeta medía 128px y el chip de contexto se salía del
// pliegue en pantallas de 600px de alto.
const ALTO_TARJETA = "h-[100px]";
export function SuggestionCard({
  emoji,
  title,
  description,
  senal,
  fuente,
  onClick,
}: {
  emoji: string;
  title: string;
  description: string;
  /** Presente solo en las tarjetas de tendencia. */
  senal?: TrendSignal;
  /** El medio donde se vio. Obligatorio si hay señal: sin fuente no se pinta. */
  fuente?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Las de tendencia arrancan arriba, porque su contenido llena la tarjeta.
      // Las fijas se centran: con dos líneas de texto pegadas al borde superior,
      // el hueco de abajo se lee como si faltara algo.
      className={`flex ${ALTO_TARJETA} flex-col ${senal ? "justify-start" : "justify-center"} rounded-xl border border-line bg-card px-4 py-3.5 text-left shadow-xs transition-all hover:-translate-y-px hover:border-line-focus hover:shadow-md`}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0 text-lg">{emoji}</span>
        <div className="min-w-0">
          {/* La insignia y la fuente comparten fila, y eso es lo que baja la
              tarjeta de 128px a 100px. No se pierde nada: la fuente sigue
              estando, que es el requisito —una tendencia sin fuente no se
              pinta—, solo deja de ocupar un renglón propio. */}
          {senal && (
            <span className="mb-1 flex items-center gap-1.5">
              <span className="shrink-0 rounded-full bg-accent-cta px-2 py-0.5 text-[10px] font-bold text-accent-cta-fg">
                Tendencia · {TREND_SIGNAL_LABELS[senal]}
              </span>
              {/* `min-w-0` junto al `truncate`: un hijo de flex arranca con
                  `min-width: auto`, así que sin esto un dominio largo empuja la
                  fila en vez de recortarse. */}
              {fuente && (
                <span className="min-w-0 truncate text-[10px] text-fg-muted">· {fuente}</span>
              )}
            </span>
          )}
          {/* Recortadas a un alto fijo, y no por estética: el `blurb` de una
              tendencia lo escribe el modelo y llegó a ocupar cuatro líneas, con
              lo que la tarjeta pasaba de 119px a 211px. Un alto que depende del
              texto no se puede reservar mientras carga, así que el esqueleto no
              podría calzar nunca y la rejilla saltaría igual.

              El texto completo no se pierde: viaja entero al prompt, y la
              tarjeta de Ritmo —que es el lugar de leer tendencias— lo muestra
              sin recortar. */}
          <p className="line-clamp-1 text-[13px] leading-tight font-semibold text-fg">{title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-fg-secondary">
            {description}
          </p>
        </div>
      </div>
    </button>
  );
}

/**
 * El hueco de una tarjeta de tendencia mientras llega su petición.
 *
 * Con la altura de una tarjeta CON señal y fuente, que es la más alta de la
 * rejilla: si reservara el alto de una fija, la fila crecería al llegar los
 * datos y la pantalla daría el salto que este componente existe para evitar.
 */
export function SuggestionCardSkeleton() {
  return (
    <div
      aria-hidden
      className={`${ALTO_TARJETA} animate-pulse rounded-xl border border-line bg-card px-4 py-3.5 shadow-xs`}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 size-[18px] shrink-0 rounded bg-secondary" />
        <div className="flex h-full min-w-0 flex-1 flex-col">
          <span className="mb-1 flex items-center gap-1.5">
            <span className="h-[17px] w-[118px] shrink-0 rounded-full bg-secondary" />
            <span className="h-[10px] w-[64px] rounded bg-secondary" />
          </span>
          <span className="h-4 w-3/5 rounded bg-secondary" />
          <span className="mt-1 h-3.5 w-full rounded bg-secondary" />
          <span className="mt-1 h-3.5 w-4/5 rounded bg-secondary" />
        </div>
      </div>
    </div>
  );
}
