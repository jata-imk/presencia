import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { AnaliticasPublicacionDto } from "@presencia/shared";
import { Thumb } from "../cards/CompactCard.js";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { Tooltip } from "../ui/Tooltip.js";
import { copyDeEstado, fechaCorta, numero, textoLift } from "../../lib/analiticas/formato.js";
import { haceCuanto } from "../../lib/relative-time.js";

// La lente "Por publicación" (lore doc §3): una tabla que se ordena por
// cualquier columna. La última dice cuánto rindió cada una SOBRE TU PROMEDIO
// EN SU RED, nunca una tasa cruda: así un TikTok y un post de Instagram sí se
// pueden ordenar entre sí (addendum F12 de ADR-022).
//
// En escritorio es una tabla; debajo de @4xl cada fila se apila en una
// tarjeta, con las métricas en una línea.

export type ColumnaOrden = "rendimiento" | "fecha" | "alcance" | "interacciones";
type Direccion = "asc" | "desc";

const DIA_MS = 24 * 60 * 60 * 1000;

const SIN_COMPARAR =
  "Todavía no hay con qué compararla: se compara a las 24 horas de publicada y cuando la red ya tiene 10 publicaciones medidas.";

/** Las de 24 h o menos dicen "hace 2 horas"; las demás, su fecha. */
function cuando(iso: string, ahora: Date, timeZone: string): string {
  return ahora.getTime() - new Date(iso).getTime() < DIA_MS
    ? haceCuanto(iso, ahora)
    : fechaCorta(new Date(iso), timeZone);
}

function valorDe(publicacion: AnaliticasPublicacionDto, columna: ColumnaOrden): number | null {
  switch (columna) {
    case "rendimiento":
      return publicacion.lift;
    case "fecha":
      return new Date(publicacion.publishedAt).getTime();
    case "alcance":
      return publicacion.alcance;
    case "interacciones":
      return publicacion.interacciones;
  }
}

/**
 * Ordena sin calcular nada: los números ya vienen del motor. Lo que no tiene
 * número va siempre al final, sin importar la dirección (un "No disponible"
 * no es el más chico). El orden por defecto es el de la API.
 */
export function ordenar(
  publicaciones: readonly AnaliticasPublicacionDto[],
  columna: ColumnaOrden,
  direccion: Direccion,
): AnaliticasPublicacionDto[] {
  if (columna === "rendimiento" && direccion === "desc") return [...publicaciones];
  return [...publicaciones].sort((a, b) => {
    const va = valorDe(a, columna);
    const vb = valorDe(b, columna);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return direccion === "asc" ? va - vb : vb - va;
  });
}

const COLUMNAS_TABLA =
  "@4xl:grid-cols-[48px_minmax(0,1.6fr)_88px_minmax(0,1fr)_minmax(0,1fr)_150px]";

export function LentePorPublicacion({
  publicaciones,
  ahora,
  timeZone,
}: {
  publicaciones: AnaliticasPublicacionDto[];
  ahora: Date;
  timeZone: string;
}) {
  const [orden, setOrden] = useState<{ columna: ColumnaOrden; direccion: Direccion }>({
    columna: "rendimiento",
    direccion: "desc",
  });
  const filas = useMemo(
    () => ordenar(publicaciones, orden.columna, orden.direccion),
    [publicaciones, orden],
  );

  if (publicaciones.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-[13px] text-fg-secondary">
        No hay publicaciones en el periodo.
      </p>
    );
  }

  function ordenarPor(columna: ColumnaOrden) {
    setOrden((actual) =>
      actual.columna === columna
        ? { columna, direccion: actual.direccion === "desc" ? "asc" : "desc" }
        : { columna, direccion: "desc" },
    );
  }

  const encabezado = (columna: ColumnaOrden, texto: string, alinear = "") => {
    const activa = orden.columna === columna;
    const Flecha = orden.direccion === "desc" ? ArrowDown : ArrowUp;
    return (
      <div
        role="columnheader"
        aria-sort={activa ? (orden.direccion === "desc" ? "descending" : "ascending") : "none"}
        className={alinear}
      >
        <button
          type="button"
          onClick={() => ordenarPor(columna)}
          className={`inline-flex items-center gap-1 font-display text-[11px] font-semibold tracking-[0.06em] uppercase transition-colors ${
            activa ? "text-brand" : "text-fg-muted hover:text-fg"
          }`}
        >
          {texto}
          {activa && <Flecha size={11} strokeWidth={2.25} aria-hidden />}
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-fg-muted">
        {publicaciones.length} {publicaciones.length === 1 ? "publicación" : "publicaciones"} ·
        rendimiento sobre tu promedio en cada red
      </p>
      <div role="table" aria-label="Publicaciones del periodo" className="flex flex-col gap-2">
        <div
          role="row"
          className={`hidden items-center gap-4 px-5 pb-0.5 @4xl:grid ${COLUMNAS_TABLA}`}
        >
          {/* El texto va adentro: un `sr-only` es absoluto y saldría de la
              rejilla, corriendo los demás encabezados una columna. */}
          <span role="columnheader">
            <span className="sr-only">Miniatura</span>
          </span>
          <span
            role="columnheader"
            className="font-display text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase"
          >
            Red
          </span>
          {encabezado("fecha", "Fecha")}
          {encabezado("alcance", "Alcance")}
          {encabezado("interacciones", "Interacciones")}
          {encabezado("rendimiento", "Sobre tu promedio", "text-right")}
        </div>
        {filas.map((publicacion) => (
          <Fila
            key={publicacion.cardId}
            publicacion={publicacion}
            ahora={ahora}
            timeZone={timeZone}
          />
        ))}
      </div>
    </div>
  );
}

function Celda({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div role="cell" className={className}>
      {children}
    </div>
  );
}

function Lift({ lift }: { lift: number | null }) {
  if (lift === null) {
    return (
      <Tooltip label={SIN_COMPARAR}>
        <span tabIndex={0} className="text-[13px] text-fg-muted">
          Sin comparar
        </span>
      </Tooltip>
    );
  }
  const texto = textoLift(lift);
  return (
    <span
      className={`font-display text-[19px] font-semibold tracking-[-0.01em] ${
        texto.direccion === "baja" ? "text-fg-secondary" : "text-brand"
      }`}
    >
      {texto.texto}
    </span>
  );
}

function Fila({
  publicacion,
  ahora,
  timeZone,
}: {
  publicacion: AnaliticasPublicacionDto;
  ahora: Date;
  timeZone: string;
}) {
  const meta = NETWORK_META[publicacion.network];
  const copy = copyDeEstado(publicacion.estado, publicacion.network);
  const alcance = publicacion.alcance === null ? "No disponible" : numero(publicacion.alcance);
  const interacciones =
    publicacion.interacciones === null ? "No disponible" : numero(publicacion.interacciones);
  const fecha = cuando(publicacion.publishedAt, ahora, timeZone);

  return (
    <div
      role="row"
      className={`grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-card px-4 py-3 @4xl:gap-4 @4xl:px-5 @4xl:py-3.5 ${COLUMNAS_TABLA}`}
    >
      <Celda className="row-span-2 self-start @4xl:row-span-1 @4xl:self-center">
        <Thumb
          kind={publicacion.archetype}
          assetId={publicacion.miniatura.assetId ?? undefined}
          images={publicacion.miniatura.imagenes}
          generating={false}
          size={44}
        />
      </Celda>

      <Celda className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs text-fg-muted">
          <meta.Logo size={13} />
          {meta.label}
          <span className="@4xl:hidden">· {fecha}</span>
        </p>
        <p className="truncate font-display text-sm font-medium text-fg">{publicacion.titulo}</p>
      </Celda>

      <Celda className="hidden text-[13px] text-fg-secondary @4xl:block">{fecha}</Celda>

      {copy ? (
        // Sin números: el estado ocupa el lugar de las métricas y lo dice.
        <Celda className="col-start-2 col-end-4 min-w-0 @4xl:col-start-4 @4xl:col-end-7">
          <EstadoSinNumeros
            titulo={copy.titulo}
            detalle={copy.detalle}
            enCamino={publicacion.estado === "en_camino"}
          />
        </Celda>
      ) : (
        <>
          <Celda className="hidden min-w-0 @4xl:block">
            <Numero valor={alcance} />
          </Celda>
          <Celda className="hidden min-w-0 @4xl:block">
            <Numero valor={interacciones} />
          </Celda>
          <Celda className="row-span-2 self-center text-right @4xl:row-span-1">
            <Lift lift={publicacion.lift} />
          </Celda>
          {/* Móvil: las dos métricas en una línea bajo el título. */}
          <Celda className="col-start-2 text-xs text-fg-secondary @4xl:hidden">
            {publicacion.alcance === null ? "Alcance no disponible" : `${alcance} alcance`} ·{" "}
            {publicacion.interacciones === null
              ? "interacciones no disponibles"
              : `${interacciones} interacciones`}
          </Celda>
        </>
      )}
    </div>
  );
}

function Numero({ valor }: { valor: string }) {
  return valor === "No disponible" ? (
    <span className="text-[13px] text-fg-muted">{valor}</span>
  ) : (
    <span className="font-display text-[15px] font-medium text-fg">{valor}</span>
  );
}

function EstadoSinNumeros({
  titulo,
  detalle,
  enCamino,
}: {
  titulo: string;
  detalle: string;
  enCamino: boolean;
}) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      <span
        className={`rounded-full px-2 py-0.5 font-display font-semibold ${
          enCamino ? "bg-info-bg text-info-fg" : "bg-secondary text-fg-secondary"
        }`}
      >
        {titulo}
      </span>
      <span className="text-fg-muted">{detalle}</span>
    </p>
  );
}
