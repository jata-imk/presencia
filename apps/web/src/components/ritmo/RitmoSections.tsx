import type { ReactNode } from "react";
import { CalendarCheck, ExternalLink, Minus, Plus } from "lucide-react";
import {
  TREND_FORMAT_LABELS,
  TREND_SIGNAL_LABELS,
  type RitmoObjetivoDto,
  type SocialNetwork,
  type TrendItem,
} from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { RachaTile } from "./CadenciaHeatmap.js";

export function Bloque({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-line bg-card p-6">{children}</section>;
}

export function TituloBloque({
  kicker,
  titulo,
  sub,
  derecha,
}: {
  kicker: string;
  titulo: string;
  sub?: string;
  derecha?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-bold tracking-wider text-fg-muted uppercase">{kicker}</p>
        <h2 className="font-display text-lg font-bold text-fg">{titulo}</h2>
        {sub && <p className="mt-1 text-[13px] text-fg-secondary">{sub}</p>}
      </div>
      {derecha}
    </div>
  );
}

/**
 * La cabecera: saludo y avance de la semana.
 *
 * El texto sale de plantilla y no de un modelo. Los números los calcula SQL,
 * así que redactarlos con IA costaría créditos para decir lo mismo — y con
 * poca data no habría nada que narrar. La narración sí existe, pero vive
 * aparte y bajo demanda (components/ritmo/Narracion.tsx): esta cabecera se
 * pinta sola en cada carga y por eso no puede costar nada.
 *
 * La racha SÍ está acá, y es un cambio respecto de cómo nació. Vivía junto al
 * heatmap con el argumento de que es una lectura de él; el argumento sigue en
 * pie pero pesa menos que el hecho de que ahí abajo no se ve, y la racha es el
 * gancho emocional del módulo. "Mejor racha" se queda junto al mapa.
 *
 * La composición sale de la variante A de `StrategyHeader` del mock de Claude
 * Design. Lo que falta respecto de ese mock es el chip de "Modo: Crecer", que
 * todavía no existe como dato — tiene su propio PR.
 */
export function CabeceraRitmo({
  nombre,
  objetivos,
  racha,
}: {
  nombre: string;
  objetivos: RitmoObjetivoDto[];
  /** Días consecutivos publicando. `0` cambia el tile por el de 'aún no empieza'. */
  racha: number;
}) {
  const hechas = objetivos.reduce((suma, o) => suma + o.hechas, 0);
  const meta = objetivos.reduce((suma, o) => suma + o.meta, 0);
  return (
    // Variante A del mock: texto a la izquierda, tile de racha a la derecha.
    <header className="flex flex-wrap items-center justify-between gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-[1.02] font-bold tracking-[-0.02em] text-brand">
          Hola, {nombre}
        </h1>
        <p className="mt-2 max-w-[440px] text-[15px] text-fg-secondary">
          Esta es tu estrategia: cuándo publicar y sobre qué.
        </p>
        {meta > 0 && (
          <span className="mt-4 flex items-center gap-2 text-sm text-fg-secondary">
            <CalendarCheck size={16} className="text-accent" />
            Vas {hechas}/{meta} publicaciones esta semana
          </span>
        )}
      </div>
      <RachaTile dias={racha} />
    </header>
  );
}

/** Una fila de meta semanal, con sus puntitos y su ajuste. */
export function FilaObjetivo({
  objetivo,
  onCambiar,
  guardando,
}: {
  objetivo: RitmoObjetivoDto;
  onCambiar: (meta: number) => void;
  guardando: boolean;
}) {
  const meta = NETWORK_META[objetivo.network];
  const atrasado = objetivo.hechas < objetivo.meta;
  // El tope de puntitos es de render, no de producto: con metas grandes la
  // fila se volvería una tira de puntos ilegible.
  const puntos = Math.min(objetivo.meta, 12);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-subtle py-3 last:border-b-0">
      <div className="flex w-[150px] shrink-0 items-center gap-2.5">
        <meta.Logo size={20} />
        <span className="text-sm font-semibold text-fg">{meta.label}</span>
      </div>

      <div className="flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: puntos }).map((_, indice) => (
          <span
            key={indice}
            className={`h-2.5 w-2.5 rounded-full ${
              indice < objetivo.hechas
                ? atrasado
                  ? "bg-warning"
                  : "bg-success"
                : "border border-line bg-card"
            }`}
          />
        ))}
      </div>

      <span className={`text-[13px] font-semibold ${atrasado ? "text-warning" : "text-success"}`}>
        {objetivo.hechas}/{objetivo.meta} esta semana
      </span>

      <div className="ml-auto flex items-center gap-2">
        {objetivo.sugerido && <span className="text-[11px] text-fg-muted italic">Sugerido</span>}
        <div className="flex items-center gap-1 rounded-full bg-secondary p-1">
          <button
            type="button"
            aria-label={`Bajar la meta de ${meta.label}`}
            disabled={guardando || objetivo.meta <= 0}
            onClick={() => onCambiar(objetivo.meta - 1)}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-card text-fg transition-colors hover:bg-secondary-hover disabled:opacity-40"
          >
            <Minus size={13} />
          </button>
          <span className="w-6 text-center text-[13px] font-bold text-fg">{objetivo.meta}</span>
          <button
            type="button"
            aria-label={`Subir la meta de ${meta.label}`}
            disabled={guardando || objetivo.meta >= 50}
            onClick={() => onCambiar(objetivo.meta + 1)}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-card text-fg transition-colors hover:bg-secondary-hover disabled:opacity-40"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// `rising` usa el par accent-cta/accent-cta-fg y no un `bg` suelto: ese fondo
// es color de marca y no se invierte entre temas, así que su texto tampoco
// puede salir de la familia --fg-* (design-tokens.md).
const CLASE_SENAL: Record<TrendItem["signal"], string> = {
  rising: "bg-accent-cta text-accent-cta-fg",
  stable: "bg-info-bg text-info",
  new: "bg-ai-bg text-ai",
};

/**
 * Una tendencia.
 *
 * Sin porcentaje y con fuente, siempre: el contrato no tiene un campo
 * numérico donde meter un "+24%" y `sourceUrl` es obligatorio, así que una
 * tarjeta sin procedencia no se puede construir.
 */
export function TarjetaTendencia({ item }: { item: TrendItem }) {
  const red = NETWORK_META[item.network];
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-line bg-card p-4">
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${CLASE_SENAL[item.signal]}`}
        >
          {TREND_SIGNAL_LABELS[item.signal]}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-fg-muted">
          <red.Logo size={14} />
          {TREND_FORMAT_LABELS[item.format]}
        </span>
      </div>
      <h3 className="font-display text-[15px] leading-snug font-semibold text-fg">{item.topic}</h3>
      <p className="text-[13px] leading-relaxed text-fg-secondary">{item.blurb}</p>
      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-auto flex items-center gap-1.5 border-t border-line-subtle pt-3 text-[11px] text-fg-muted hover:text-fg"
      >
        <ExternalLink size={12} />
        Visto en {item.sourceTitle}
      </a>
    </article>
  );
}

export function nombreDeRed(network: SocialNetwork): string {
  return NETWORK_META[network].label;
}
