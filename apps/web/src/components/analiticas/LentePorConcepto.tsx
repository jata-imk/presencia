import { Info, Link2 } from "lucide-react";
import {
  NETWORK_LABELS,
  type AnaliticasConceptoDto,
  type AnaliticasHermanaDto,
  type AnaliticasPublicacionDto,
  type MuestraDeRed,
  type SocialNetwork,
} from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import {
  copyDeEstado,
  fechaCorta,
  motivoSinLift,
  textoLift,
} from "../../lib/analiticas/formato.js";

// La lente "Por concepto" (lore doc §3): la misma idea publicada en varias
// redes, lado a lado. Cada red dice cuánto rindió SOBRE TU PROMEDIO EN ESA
// RED, y "Mejor en X" sale de ahí, nunca del número crudo. Los conceptos, sus
// hermanas, el orden y "Mejor en" los decide el motor (`conceptosDe`, regla
// 13 del addendum F12 de ADR-022).
//
// La barra es divergente: el eje al 35 %, positivos a la derecha y negativos
// a la izquierda, con UNA escala para toda la lente (la mayor |lift|), así
// dos barras iguales en dos conceptos son el mismo número. En móvil la barra
// baja bajo la red y el número.
//
// Tocar una red abre el detalle de esa publicación.

const VACIO = "Todavía no adaptas una idea a más de una red en este periodo.";
const AVISO =
  "Solo incluye contenido creado en Presencia · rendimiento sobre tu promedio en cada red";

/** Dónde cae el eje, en % de la pista: lo positivo tiene el resto. */
const EJE = 35;

export function LentePorConcepto({
  conceptos,
  publicaciones,
  muestraPorRed,
  ahora,
  timeZone,
  activa,
  onAbrir,
}: {
  conceptos: AnaliticasConceptoDto[];
  /** Para la fecha de cada hermana, si está en la lista (sin filtro de red). */
  publicaciones: AnaliticasPublicacionDto[];
  /** La muestra de cada red, para decir por qué una hermana no tiene número. */
  muestraPorRed: ReadonlyMap<SocialNetwork, MuestraDeRed>;
  ahora: Date;
  timeZone: string;
  /** La publicación cuyo detalle está abierto. */
  activa: string | null;
  onAbrir: (cardId: string, origen: HTMLElement) => void;
}) {
  if (conceptos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-[13px] text-fg-secondary">
        {VACIO}
      </p>
    );
  }

  const escala = Math.max(
    1,
    ...conceptos.flatMap((c) => c.hermanas.map((h) => Math.abs(h.lift ?? 0))),
  );
  const fechaPorCard = new Map(publicaciones.map((p) => [p.cardId, p.publishedAt]));

  return (
    <div className="flex flex-col gap-3.5">
      <p className="flex items-start gap-2 text-[13px] text-fg-secondary">
        <Info
          size={14}
          strokeWidth={1.75}
          className="mt-[3px] shrink-0 text-fg-muted"
          aria-hidden
        />
        {AVISO}
      </p>
      <ul className="flex flex-col gap-3">
        {conceptos.map((concepto) => (
          <li key={concepto.groupId}>
            <Concepto
              concepto={concepto}
              escala={escala}
              motivo={(h) =>
                motivoDe(
                  h,
                  muestraPorRed.get(h.network),
                  fechaPorCard.get(h.cardId) ?? concepto.publishedAt,
                  ahora,
                )
              }
              timeZone={timeZone}
              activa={activa}
              onAbrir={onAbrir}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Lo que ocupa el lugar del número: un título corto (cabe en la columna del
 * lift, que es fija para que el eje de las barras se alinee entre filas) y su
 * porqué. Las mismas razones que la tabla y el detalle (`copyDeEstado`).
 */
const TITULO_SIN_NUMERO: Record<AnaliticasHermanaDto["estado"], string> = {
  en_camino: "En camino",
  no_reporta: "No disponible",
  sin_medicion: "Sin medición",
  medida: "Sin comparar",
};

/**
 * Por qué una hermana no tiene número. Primero su estado (en camino, no
 * reporta, sin medición); medida, su edad o la muestra de su red.
 */
function motivoDe(
  hermana: AnaliticasHermanaDto,
  muestra: MuestraDeRed | undefined,
  publishedAt: string,
  ahora: Date,
): { titulo: string; detalle: string } {
  const titulo = TITULO_SIN_NUMERO[hermana.estado];
  const copy = copyDeEstado(hermana.estado, hermana.network);
  if (copy) return { titulo, detalle: copy.detalle };
  const detalle = muestra ? motivoSinLift(muestra, hermana.network, publishedAt, ahora) : null;
  return { titulo, detalle: detalle ?? "Todavía no hay con qué compararla" };
}

function Concepto({
  concepto,
  escala,
  motivo,
  timeZone,
  activa,
  onAbrir,
}: {
  concepto: AnaliticasConceptoDto;
  escala: number;
  motivo: (hermana: AnaliticasHermanaDto) => { titulo: string; detalle: string };
  timeZone: string;
  activa: string | null;
  onAbrir: (cardId: string, origen: HTMLElement) => void;
}) {
  const redes = concepto.hermanas.length;
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-line bg-card px-4 py-4 @lg:gap-[18px] @lg:px-6 @lg:py-[22px]">
      <header className="flex flex-wrap items-start gap-x-[13px] gap-y-2">
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full border border-line bg-tint-plum">
          <Link2 size={17} strokeWidth={2} className="text-fg-secondary" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold text-pretty text-brand @lg:text-lg">
            {concepto.titulo || "Publicación sin texto"}
          </h3>
          <p className="mt-[3px] text-xs text-fg-muted">
            {redes} {redes === 1 ? "red" : "redes"} ·{" "}
            {fechaCorta(new Date(concepto.publishedAt), timeZone)}
          </p>
        </div>
        {concepto.mejorEn && (
          <span className="rounded-full bg-tint-pink px-[11px] py-1 font-display text-xs font-semibold whitespace-nowrap text-ana-chip-mejor-fg">
            Mejor en {NETWORK_LABELS[concepto.mejorEn]}
          </span>
        )}
      </header>
      <ul className="flex flex-col gap-1">
        {concepto.hermanas.map((hermana) => (
          <li key={hermana.cardId}>
            <FilaRed
              hermana={hermana}
              ganadora={hermana.network === concepto.mejorEn}
              escala={escala}
              motivo={hermana.lift === null ? motivo(hermana) : null}
              activa={hermana.cardId === activa}
              onAbrir={onAbrir}
            />
          </li>
        ))}
      </ul>
    </article>
  );
}

function FilaRed({
  hermana,
  ganadora,
  escala,
  motivo,
  activa,
  onAbrir,
}: {
  hermana: AnaliticasHermanaDto;
  ganadora: boolean;
  escala: number;
  motivo: { titulo: string; detalle: string } | null;
  activa: boolean;
  onAbrir: (cardId: string, origen: HTMLElement) => void;
}) {
  const meta = NETWORK_META[hermana.network];
  const lift = hermana.lift === null ? null : textoLift(hermana.lift);
  return (
    <button
      type="button"
      data-card-id={hermana.cardId}
      aria-current={activa ? "true" : undefined}
      onClick={(e) => onAbrir(hermana.cardId, e.currentTarget)}
      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-lg px-2 py-[7px] text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-line-focus @lg:grid-cols-[150px_74px_minmax(0,1fr)] @lg:gap-x-[18px] ${
        activa
          ? "bg-ana-fila-activa ring-1 ring-ana-fila-activa-border ring-inset"
          : "hover:bg-surface"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] border border-line bg-card">
          <meta.Logo size={15} />
        </span>
        <span
          className={`truncate font-display text-sm ${
            ganadora ? "font-semibold text-fg" : "font-medium text-fg-secondary"
          }`}
        >
          {meta.label}
        </span>
      </span>

      {lift ? (
        <>
          <span
            className={`text-right font-display font-semibold tracking-[-0.01em] @lg:text-left ${
              ganadora
                ? "text-[22px] text-brand"
                : lift.direccion === "baja"
                  ? "text-lg text-fg-muted"
                  : "text-lg text-fg-secondary"
            }`}
          >
            {lift.texto}
          </span>
          <Barra lift={hermana.lift ?? 0} escala={escala} ganadora={ganadora} />
        </>
      ) : (
        <>
          {/* Desde @lg, el título y su porqué van en una línea que ocupa el
              lugar del número y de la barra; en móvil, el porqué baja. */}
          <span className="text-right text-[13px] whitespace-nowrap text-fg-muted @lg:col-span-2 @lg:text-left @lg:whitespace-normal">
            <span className="font-medium text-fg-secondary">{motivo?.titulo}</span>
            <span className="hidden text-xs @lg:inline"> · {motivo?.detalle}</span>
          </span>
          <span className="col-span-2 text-xs text-fg-muted @lg:hidden">{motivo?.detalle}</span>
        </>
      )}
    </button>
  );
}

function Barra({ lift, escala, ganadora }: { lift: number; escala: number; ganadora: boolean }) {
  const ancho =
    lift >= 0
      ? (lift / escala) * (100 - EJE)
      : Math.min(EJE, (Math.abs(lift) / escala) * (100 - EJE));
  return (
    <span
      aria-hidden
      className={`relative col-span-2 block rounded-full bg-ana-concepto-pista @lg:col-span-1 ${
        ganadora ? "h-3" : "h-2.5"
      }`}
    >
      <span
        className="absolute -top-1 -bottom-1 w-px bg-ana-concepto-eje"
        style={{ left: `${String(EJE)}%` }}
      />
      {lift !== 0 && (
        <span
          className={`absolute inset-y-0 ${
            lift > 0
              ? `rounded-r-full ${ganadora ? "bg-ana-concepto-pos" : "bg-ana-concepto-pos-otra"}`
              : "rounded-l-full bg-ana-concepto-neg"
          }`}
          style={
            lift > 0
              ? { left: `${String(EJE)}%`, width: `${String(ancho)}%` }
              : { right: `${String(100 - EJE)}%`, width: `${String(ancho)}%` }
          }
        />
      )}
    </span>
  );
}
