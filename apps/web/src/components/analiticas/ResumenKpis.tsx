import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import {
  NETWORK_LABELS,
  type AnaliticasEngagementDto,
  type AnaliticasResumenDto,
} from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { Tooltip } from "../ui/Tooltip.js";
import {
  cambioDeEngagement,
  listaDeRedes,
  motivoNoReporta,
  motivoSinAlcance,
  numero,
  textoCambio,
  textoEngagement,
  type Cambio,
} from "../../lib/analiticas/formato.js";

// El resumen del periodo: cuatro números con su cambio (lore doc §3).
//
// El engagement con "Todas las redes" es una lista por red y nunca un número
// único (addendum F12 de ADR-022): mezclar tasas con conteos daría un número
// que parece dato y no tiene unidad.

/** Hasta cuántas redes caben en la celda; las demás van a "Por red". */
const MAX_REDES_EN_CELDA = 4;

const POR_QUE_24H =
  "Comparamos cada publicación en sus primeras 24 horas, para que las más viejas no ganen solo por haber tenido más tiempo.";

const SIN_PERIODO = "Sin periodo anterior para comparar";

const TONO: Record<Cambio["direccion"], string> = {
  sube: "bg-success-bg text-success-fg",
  baja: "bg-warning-bg text-warning-fg",
  igual: "bg-secondary text-fg-secondary",
};

const ICONO: Record<Cambio["direccion"], typeof Minus> = {
  sube: ArrowUpRight,
  baja: ArrowDownRight,
  igual: Minus,
};

/** La pastilla de un cambio, con el porqué de las 24 h al pasar el mouse. */
export function PastillaCambio({ cambio }: { cambio: Cambio }) {
  const Icono = ICONO[cambio.direccion];
  return (
    <Tooltip label={POR_QUE_24H}>
      <span
        // Enfocable para que el porqué también llegue con teclado.
        tabIndex={0}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-xs font-semibold ${TONO[cambio.direccion]}`}
      >
        <Icono size={12} strokeWidth={2.25} aria-hidden />
        {cambio.texto}
      </span>
    </Tooltip>
  );
}

function LineaCambio({ cambio }: { cambio: Cambio | null }) {
  if (!cambio) return <p className="mt-2.5 text-xs text-fg-muted">{SIN_PERIODO}</p>;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <PastillaCambio cambio={cambio} />
      <span className="text-xs text-fg-muted">vs periodo anterior</span>
    </div>
  );
}

function Tile({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-card p-4 @4xl:p-5">
      <p className="font-display text-[11px] font-medium tracking-[0.08em] text-fg-muted uppercase">
        {etiqueta}
      </p>
      {children}
    </div>
  );
}

function Grande({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 font-display text-[28px] leading-tight font-semibold tracking-[-0.02em] text-brand @4xl:text-4xl">
      {children}
    </p>
  );
}

function NoDisponible({ motivo }: { motivo: string | null }) {
  return (
    <>
      <p className="mt-2 font-display text-base font-medium text-fg-muted @4xl:mt-3">
        No disponible
      </p>
      {motivo && <p className="mt-1 text-xs text-fg-muted">{motivo}</p>}
    </>
  );
}

function sujeto(n: number, red: AnaliticasResumenDto["red"]): string {
  const cuantas = `${String(n)} ${n === 1 ? "publicación" : "publicaciones"}`;
  return red ? `${cuantas} de ${NETWORK_LABELS[red]}` : cuantas;
}

export function ResumenKpis({
  resumen,
  onVerPorRed,
}: {
  resumen: AnaliticasResumenDto;
  /** "y N redes más": cambia a la lente Por red. */
  onVerPorRed: () => void;
}) {
  const { publicaciones, alcance, interacciones, engagement, red } = resumen;
  const sola = red ? engagement[0] : undefined;

  return (
    <section className="flex flex-col gap-3.5" aria-label="Resumen del periodo">
      <p className="text-[13px] text-fg-secondary">
        Rendimiento de {sujeto(publicaciones.total, red)} · últimos {resumen.periodoDias} días
      </p>
      <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-4 @4xl:gap-4">
        <Tile etiqueta="Publicaciones">
          <Grande>{numero(publicaciones.total)}</Grande>
          <LineaCambio
            cambio={
              publicaciones.cambio === null ? null : textoCambio("unidades", publicaciones.cambio)
            }
          />
        </Tile>

        <Tile etiqueta="Alcance">
          {alcance.total === null ? (
            <NoDisponible motivo={red ? motivoDeAlcance(sola, red) : null} />
          ) : (
            <>
              <Grande>{numero(alcance.total)}</Grande>
              {/* Con todas las redes, la suma solo incluye las que reportan
                  alcance, y se dice cuáles. */}
              {!red && alcance.redes.length > 0 && (
                <p className="mt-0.5 text-xs text-fg-muted">{listaDeRedes(alcance.redes)}</p>
              )}
              <LineaCambio
                cambio={alcance.cambioPct === null ? null : textoCambio("pct", alcance.cambioPct)}
              />
            </>
          )}
        </Tile>

        <Tile etiqueta="Interacciones">
          {interacciones.total === null ? (
            <NoDisponible
              motivo={red && sola?.muestra === "no_reporta" ? motivoNoReporta(red) : null}
            />
          ) : (
            <>
              <Grande>{numero(interacciones.total)}</Grande>
              <LineaCambio
                cambio={
                  interacciones.cambioPct === null
                    ? null
                    : textoCambio("pct", interacciones.cambioPct)
                }
              />
            </>
          )}
        </Tile>

        {red ? (
          <Tile etiqueta="Engagement">
            <EngagementSolo entrada={sola} />
          </Tile>
        ) : (
          <Tile etiqueta="Engagement por red">
            <EngagementPorRed engagement={engagement} onVerPorRed={onVerPorRed} />
          </Tile>
        )}
      </div>
    </section>
  );
}

function motivoDeAlcance(
  entrada: AnaliticasEngagementDto | undefined,
  red: NonNullable<AnaliticasResumenDto["red"]>,
): string | null {
  if (!entrada) return null;
  if (entrada.muestra === "no_reporta") return motivoNoReporta(red);
  // La base dice si la red da alcance: el motor calcula en interacciones
  // justo cuando no lo da (TikTok). Con base `tasa` la red sí lo da, y un
  // total vacío es un periodo sin números todavía: ahí no hay porqué que
  // decir. La `muestra` no sirve para esto: mira la ventana de referencia,
  // no el periodo.
  return entrada.base === "interacciones" ? motivoSinAlcance(red) : null;
}

/** Con una red elegida: vuelve a ser un solo número (diseño 5b). */
function EngagementSolo({ entrada }: { entrada: AnaliticasEngagementDto | undefined }) {
  if (!entrada) {
    return <p className="mt-3 text-[13px] text-fg-muted">Sin publicaciones en el periodo</p>;
  }
  if (entrada.valor === null) {
    return (
      <NoDisponible
        motivo={entrada.muestra === "no_reporta" ? motivoNoReporta(entrada.network) : null}
      />
    );
  }
  const texto = textoEngagement(entrada.base, entrada.valor);
  return (
    <>
      <Grande>{texto.numero}</Grande>
      {texto.unidad && <p className="mt-0.5 text-xs text-fg-muted">interacciones {texto.unidad}</p>}
      <LineaCambio
        cambio={entrada.cambio === null ? null : cambioDeEngagement(entrada.base, entrada.cambio)}
      />
    </>
  );
}

/**
 * Con "Todas las redes": una fila por red con su número y su cambio, en el
 * orden que manda el motor (más publicaciones primero, las que no reportan
 * al final). Tope de 4; las demás se ven en "Por red".
 */
function EngagementPorRed({
  engagement,
  onVerPorRed,
}: {
  engagement: AnaliticasEngagementDto[];
  onVerPorRed: () => void;
}) {
  if (engagement.length === 0) {
    return <p className="mt-3 text-[13px] text-fg-muted">Sin publicaciones en el periodo</p>;
  }
  const visibles = engagement.slice(0, MAX_REDES_EN_CELDA);
  const resto = engagement.length - visibles.length;
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {visibles.map((entrada) => (
        <FilaEngagement key={entrada.network} entrada={entrada} />
      ))}
      {resto > 0 && (
        <li>
          <button
            type="button"
            onClick={onVerPorRed}
            className="text-xs font-semibold text-accent underline-offset-2 hover:underline"
          >
            y {resto} {resto === 1 ? "red más" : "redes más"}
          </button>
        </li>
      )}
    </ul>
  );
}

function FilaEngagement({ entrada }: { entrada: AnaliticasEngagementDto }) {
  const meta = NETWORK_META[entrada.network];
  const texto = entrada.valor === null ? null : textoEngagement(entrada.base, entrada.valor);
  const cambio = entrada.cambio === null ? null : cambioDeEngagement(entrada.base, entrada.cambio);
  return (
    <li className="flex min-w-0 items-start gap-2">
      <span className={`mt-0.5 shrink-0 ${texto ? "" : "opacity-50"}`} aria-hidden>
        <meta.Logo size={16} />
      </span>
      <span className="sr-only">{meta.label}:</span>
      {texto ? (
        // La unidad baja de renglón si no cabe (dos columnas a 390 px), en
        // vez de cortarse: "86 por p…" no dice nada.
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <span className="font-display text-base leading-snug font-semibold text-brand">
            {texto.numero}
          </span>
          {texto.unidad && <span className="text-[11px] text-fg-muted">{texto.unidad}</span>}
        </span>
      ) : (
        <span className="text-[13px] leading-snug font-medium text-fg-muted">No disponible</span>
      )}
      {cambio && (
        <Tooltip label={POR_QUE_24H}>
          <span
            tabIndex={0}
            className={`mt-1 ml-auto shrink-0 font-display text-[11px] font-semibold ${
              cambio.direccion === "sube"
                ? "text-success-fg"
                : cambio.direccion === "baja"
                  ? "text-warning-fg"
                  : "text-fg-muted"
            }`}
          >
            {cambio.texto}
          </span>
        </Tooltip>
      )}
    </li>
  );
}
