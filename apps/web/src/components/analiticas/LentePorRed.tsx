import { Link } from "react-router";
import { Info, KeyRound } from "lucide-react";
import type { AnaliticasRedDto, PeriodoAnaliticas } from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { motivoNoReporta, numero, textoEngagement } from "../../lib/analiticas/formato.js";
import { Tendencia } from "./Tendencia.js";

// La lente "Por red" (lore doc §3): una tarjeta por red con su engagement, sus
// publicaciones, alcance, interacciones y la evolución del periodo.
//
// Una red que no reporta lo dice ahí mismo, con cuántas publicaciones tuvo:
// no es un error ni algo que el creator pueda arreglar. Una cuenta caída sí lo
// es, y por eso lleva "Reconectar".

/**
 * Las columnas de la tarjeta: las del diseño desde @6xl, y un paso más
 * apretado en @4xl (1280 con el sidebar abierto), donde con las del diseño los
 * tres datos se apilaban. El esqueleto usa las mismas.
 */
export const COLUMNAS_RED =
  "@4xl:grid-cols-[170px_110px_minmax(0,1fr)_180px] @4xl:items-center @4xl:gap-5 @4xl:px-6 @4xl:py-5 @6xl:grid-cols-[200px_140px_minmax(0,1fr)_260px] @6xl:gap-6";

export function LentePorRed({
  redes,
  periodo,
  ahora,
  timeZone,
}: {
  redes: AnaliticasRedDto[];
  periodo: PeriodoAnaliticas;
  ahora: Date;
  timeZone: string;
}) {
  if (redes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-[13px] text-fg-secondary">
        No publicaste en esta red en el periodo.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {redes.map((red) => (
        <TarjetaRed
          key={red.network}
          red={red}
          periodo={periodo}
          ahora={ahora}
          timeZone={timeZone}
        />
      ))}
    </div>
  );
}

function Cabecera({ red, apagada = false }: { red: AnaliticasRedDto; apagada?: boolean }) {
  const meta = NETWORK_META[red.network];
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-secondary ${
          apagada ? "opacity-50" : ""
        }`}
      >
        <meta.Logo size={18} />
      </span>
      <div className="min-w-0">
        <p
          className={`truncate font-display text-[15px] font-semibold ${
            apagada ? "text-fg-secondary" : "text-fg"
          }`}
        >
          {meta.label}
        </p>
        {red.cuenta?.nombre && (
          <p className="truncate text-xs text-fg-muted">{red.cuenta.nombre}</p>
        )}
      </div>
    </div>
  );
}

function Dato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="min-w-0">
      <p
        className={`font-display font-semibold ${
          valor === "No disponible" ? "text-[13px] text-fg-muted" : "text-base text-fg"
        }`}
      >
        {valor}
      </p>
      <p className="text-xs text-fg-muted">{etiqueta}</p>
    </div>
  );
}

function publicacionesEnElPeriodo(n: number): string {
  return `${String(n)} ${n === 1 ? "publicación" : "publicaciones"} en el periodo`;
}

export function TarjetaRed({
  red,
  periodo,
  ahora,
  timeZone,
}: {
  red: AnaliticasRedDto;
  periodo: PeriodoAnaliticas;
  ahora: Date;
  timeZone: string;
}) {
  const meta = NETWORK_META[red.network];

  // La red no da números: tarjeta degradada, sin barras ni ceros.
  if (red.engagement.muestra === "no_reporta") {
    return (
      <article className="grid gap-3 rounded-xl border border-dashed border-ana-degradada-border bg-ana-degradada px-5 py-4 @4xl:grid-cols-[170px_1fr_180px] @4xl:items-center @4xl:gap-5 @4xl:px-6 @4xl:py-5 @6xl:grid-cols-[200px_1fr_260px] @6xl:gap-6">
        <Cabecera red={red} apagada />
        <p className="flex items-start gap-2 text-[13px] text-fg-secondary">
          <Info size={16} className="mt-px shrink-0" aria-hidden />
          {motivoNoReporta(red.network)}
        </p>
        <div className="@4xl:text-right">
          <p className="font-display text-[15px] font-medium text-fg-muted">No disponible</p>
          <p className="mt-0.5 text-xs text-fg-muted">
            {publicacionesEnElPeriodo(red.publicaciones)}
          </p>
        </div>
      </article>
    );
  }

  // La red sí reporta, pero la conexión se cayó: eso sí tiene arreglo.
  if (red.cuenta?.reconectar) {
    return (
      <article className="grid gap-3 rounded-xl border border-warning-border bg-card px-5 py-4 @4xl:grid-cols-[170px_1fr_auto] @4xl:items-center @4xl:gap-5 @4xl:px-6 @4xl:py-5 @6xl:grid-cols-[200px_1fr_auto] @6xl:gap-6">
        <Cabecera red={red} />
        <p className="flex items-start gap-2 text-[13px] text-fg">
          <KeyRound size={16} className="mt-px shrink-0 text-warning-fg" aria-hidden />
          Necesitamos permiso para ver tus estadísticas de {meta.label}
        </p>
        <Link
          to="/configuracion/canales"
          className="inline-flex h-9 items-center justify-center justify-self-start rounded-full bg-primary px-4 font-display text-[13px] font-semibold text-primary-fg transition-colors hover:bg-primary-hover @4xl:self-center"
        >
          Reconectar
        </Link>
      </article>
    );
  }

  const engagement =
    red.engagement.valor === null
      ? null
      : textoEngagement(red.engagement.base, red.engagement.valor);

  return (
    <article
      className={`grid gap-4 rounded-xl border border-line bg-card px-5 py-4 ${COLUMNAS_RED}`}
    >
      <Cabecera red={red} />
      <div>
        {engagement ? (
          <p className="font-display text-[30px] leading-none font-semibold tracking-[-0.02em] text-brand @4xl:text-[26px] @6xl:text-[30px]">
            {engagement.numero}
          </p>
        ) : (
          // Tiene publicaciones pero ninguna trae número todavía.
          <p className="font-display text-[15px] font-medium text-fg-muted">Métricas en camino</p>
        )}
        <p className="mt-1 text-[11px] tracking-[0.04em] text-fg-muted uppercase">
          {red.engagement.base === "tasa" ? "Engagement" : "Int. por publicación"}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 @4xl:gap-x-5 @6xl:gap-x-8">
        <Dato
          valor={numero(red.publicaciones)}
          etiqueta={red.publicaciones === 1 ? "publicación" : "publicaciones"}
        />
        {engagement ? (
          <>
            <Dato
              valor={red.alcance === null ? "No disponible" : numero(red.alcance)}
              etiqueta="alcance"
            />
            <Dato
              valor={red.interacciones === null ? "No disponible" : numero(red.interacciones)}
              etiqueta="interacciones"
            />
          </>
        ) : (
          // Sin ningún número todavía, "No disponible" mentiría: llegan.
          <p className="self-center text-xs text-fg-muted">
            {meta.label} suele tardar unas horas en reportar
          </p>
        )}
      </div>
      {/* Una tendencia sin un solo tramo medido sería una fila de muñones
          que no dice nada; el aviso de arriba ya lo explica. */}
      {red.tendencia.some((valor) => valor !== null) && (
        <Tendencia
          valores={red.tendencia}
          base={red.engagement.base}
          periodo={periodo}
          ahora={ahora}
          timeZone={timeZone}
        />
      )}
    </article>
  );
}
