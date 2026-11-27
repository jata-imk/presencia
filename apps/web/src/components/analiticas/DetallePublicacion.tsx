import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  AlignLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Film,
  Info,
  Layers,
  MessageSquare,
  Repeat2,
  SearchX,
  X,
} from "lucide-react";
import {
  NETWORK_LABELS,
  assetContentUrl,
  type AnaliticasHermanaDto,
  type AnaliticasPublicacionDetalleDto,
} from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import {
  METRICAS_DETALLE,
  copyDeEstado,
  fechaYHora,
  motivoSinLift,
  notaDeMetricasFaltantes,
  numero,
  textoLift,
} from "../../lib/analiticas/formato.js";
import { haceCuanto } from "../../lib/relative-time.js";

// El detalle de una publicación (lore doc §3, diseño 2c de "Presencia
// Analytics Overview"). Desde @lg es un panel de 470 px encima de la pantalla,
// con velo; debajo, ocupa todo y cierra con "Volver".
//
// No calcula nada: todo viene de `/api/analiticas/publicaciones/:cardId`. Su
// "sobre tu promedio" sí va aquí aunque el diseño no lo traía: es el número
// central de toda la pantalla, y la fila que abre el panel ya lo enseña.
//
// Una publicación sin números no muestra cinco "No disponible": la caja de su
// estado ocupa el lugar de las métricas y dice por qué (son estados distintos
// del mundo, lore doc §4).

const HEADER_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-secondary hover:text-fg @lg:size-9";

const ACCION =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] font-display text-[13px] font-semibold transition-colors @lg:h-10";
const ACCION_SECUNDARIA = `${ACCION} border border-line bg-card text-fg hover:bg-surface`;

export interface DetalleAcciones {
  onCerrar: () => void;
  onReintentar: () => void;
  /** Abre otra publicación (una hermana del concepto) en el mismo panel. */
  onAbrir: (cardId: string) => void;
  onAbrirChat: (detalle: AnaliticasPublicacionDetalleDto) => void;
  onAdaptar: (detalle: AnaliticasPublicacionDetalleDto) => void;
}

export function DetallePublicacion({
  cardId,
  detalle,
  error,
  noExiste,
  ahora,
  timeZone,
  ...acciones
}: {
  cardId: string;
  /** Null mientras llega (o si falló). */
  detalle: AnaliticasPublicacionDetalleDto | null;
  error: string | null;
  noExiste: boolean;
  ahora: Date;
  timeZone: string;
} & DetalleAcciones) {
  const panel = useRef<HTMLElement>(null);
  // Al abrir (y al saltar a una hermana) el foco va al panel: con teclado se
  // sigue leyendo ahí, y Esc lo cierra.
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, [cardId]);

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      // Diálogo sin `aria-modal`: no atrapa el Tab (como el detalle de
      // Biblioteca), así que no puede decir que lo de atrás es inerte.
      role="dialog"
      aria-labelledby="detalle-publicacion-titulo"
      className="absolute inset-0 z-30 flex flex-col bg-card outline-none @lg:left-auto @lg:w-[470px] @lg:max-w-[calc(100%-3rem)] @lg:border-l @lg:border-line @lg:shadow-xl"
    >
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2 @lg:h-16 @lg:px-4">
        <button
          type="button"
          onClick={acciones.onCerrar}
          aria-label="Volver"
          className={`${HEADER_BUTTON} @lg:hidden`}
        >
          <ChevronLeft size={20} aria-hidden />
        </button>
        <h2
          id="detalle-publicacion-titulo"
          className="min-w-0 flex-1 truncate px-1 font-display text-base font-semibold text-brand @lg:px-2"
        >
          Detalle de publicación
        </h2>
        <button
          type="button"
          onClick={acciones.onCerrar}
          aria-label="Cerrar"
          className={`${HEADER_BUTTON} hidden @lg:flex`}
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      {noExiste ? (
        <Aviso
          Icono={SearchX}
          titulo="No encontramos esa publicación"
          detalle="Puede que se haya eliminado o que todavía no esté publicada."
          accion={
            <button
              type="button"
              onClick={acciones.onCerrar}
              className={`${ACCION_SECUNDARIA} px-4`}
            >
              Cerrar
            </button>
          }
        />
      ) : error ? (
        <Aviso
          Icono={AlertCircle}
          titulo="No pudimos cargar esta publicación"
          detalle="Tus datos siguen ahí. Inténtalo de nuevo."
          accion={
            <button
              type="button"
              onClick={acciones.onReintentar}
              className={`${ACCION_SECUNDARIA} px-4`}
            >
              Reintentar
            </button>
          }
        />
      ) : !detalle ? (
        <DetalleSkeleton />
      ) : (
        <Contenido detalle={detalle} ahora={ahora} timeZone={timeZone} {...acciones} />
      )}
    </aside>
  );
}

function Contenido({
  detalle,
  ahora,
  timeZone,
  onAbrir,
  onAbrirChat,
  onAdaptar,
}: {
  detalle: AnaliticasPublicacionDetalleDto;
  ahora: Date;
  timeZone: string;
} & DetalleAcciones) {
  const meta = NETWORK_META[detalle.network];
  const red = NETWORK_LABELS[detalle.network];
  const copy = copyDeEstado(detalle.estado, detalle.network);
  const nota = copy ? null : notaDeMetricasFaltantes(detalle.network, detalle.metricas);
  const conChat = detalle.chatId !== null;
  // Sin portada, el tile ya lleva el título (la primera línea): el texto
  // sigue desde ahí en vez de repetirlo.
  const texto =
    !detalle.miniatura.assetId && detalle.titulo && detalle.texto.startsWith(detalle.titulo)
      ? detalle.texto.slice(detalle.titulo.length).trim()
      : detalle.texto;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto px-4 py-5 @lg:px-6 @lg:py-[22px]">
        <div className="flex gap-4 @lg:gap-[18px]">
          <VistaPrevia detalle={detalle} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2.5 pb-1.5">
              <meta.Logo size={24} />
              <span className="font-display text-[15px] font-semibold text-fg">{meta.label}</span>
            </p>
            <dl className="text-[13px]">
              <Dato titulo="Publicado">{fechaYHora(detalle.publishedAt, timeZone)}</Dato>
              <Dato titulo="Carpeta">
                {detalle.carpeta ? (
                  <>
                    {detalle.carpeta.icono && <span aria-hidden>{detalle.carpeta.icono} </span>}
                    {detalle.carpeta.nombre}
                  </>
                ) : (
                  <span className="text-fg-muted">Sin carpeta</span>
                )}
              </Dato>
            </dl>
          </div>
        </div>

        {texto && <Texto texto={texto} />}

        <LiftPropio detalle={detalle} ahora={ahora} />

        <section className="flex flex-col gap-3" aria-labelledby="detalle-metricas">
          <h3
            id="detalle-metricas"
            className="font-display text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase"
          >
            Métricas
          </h3>
          {copy ? (
            <div
              className={`rounded-xl px-4 py-3.5 ${
                detalle.estado === "en_camino"
                  ? "bg-info-bg text-info-fg"
                  : "border border-dashed border-line bg-surface text-fg-secondary"
              }`}
            >
              <p className="font-display text-sm font-semibold">{copy.titulo}</p>
              <p className="mt-0.5 text-[13px] opacity-90">{copy.detalle}</p>
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-2 @lg:grid-cols-3">
                {METRICAS_DETALLE.map(({ clave, texto }) => {
                  const valor = detalle.metricas[clave];
                  return (
                    <li
                      key={clave}
                      className={`rounded-lg border border-line px-[15px] py-[13px] ${
                        valor === null ? "bg-surface" : "bg-card"
                      }`}
                    >
                      <p className="font-display text-[10px] font-semibold tracking-[0.06em] text-fg-muted uppercase">
                        {texto}
                      </p>
                      {valor === null ? (
                        <p className="mt-1.5 text-sm text-fg-muted">No disponible</p>
                      ) : (
                        <p className="mt-0.5 font-display text-[22px] font-semibold tracking-[-0.01em] text-fg">
                          {numero(valor)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
              {nota && (
                <p className="flex items-start gap-2 rounded-lg bg-info-bg px-[13px] py-[11px] text-xs text-info-fg">
                  <Info size={14} className="mt-px shrink-0" aria-hidden />
                  {nota}
                </p>
              )}
            </>
          )}
          {detalle.medidoEn && (
            <p className="flex items-center gap-1.5 text-xs text-fg-muted">
              <Clock size={13} aria-hidden />
              Medido {haceCuanto(detalle.medidoEn, ahora)}
            </p>
          )}
        </section>

        {detalle.enOtrasRedes.length > 0 && (
          <section className="flex flex-col gap-2.5" aria-labelledby="detalle-otras-redes">
            <h3
              id="detalle-otras-redes"
              className="flex items-center gap-1.5 font-display text-[11px] font-semibold tracking-[0.06em] text-fg-muted uppercase"
            >
              <Layers size={13} aria-hidden />
              En otras redes · sobre tu promedio
            </h3>
            <ul className="flex flex-col gap-2">
              {detalle.enOtrasRedes.map((hermana) => (
                <li key={hermana.cardId}>
                  <Hermana hermana={hermana} onAbrir={onAbrir} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {(detalle.postUrl || conChat) && (
        // Flex y no rejilla de mitades: a 390 "Abrir chat de origen" no cabía
        // en su mitad. Cada secundario toma lo que pide su texto y reparten
        // el resto; "Adaptar" va abajo, a todo lo ancho.
        <footer className="flex shrink-0 flex-wrap gap-2 border-t border-line px-4 py-4 @lg:px-6">
          {detalle.postUrl && (
            <a
              href={detalle.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${ACCION_SECUNDARIA} flex-auto px-3`}
            >
              <ExternalLink size={15} aria-hidden />
              Ver en {red}
            </a>
          )}
          {conChat && (
            <>
              <button
                type="button"
                onClick={() => onAbrirChat(detalle)}
                className={`${ACCION_SECUNDARIA} flex-auto px-3`}
              >
                <MessageSquare size={15} aria-hidden />
                Abrir chat de origen
              </button>
              <button
                type="button"
                onClick={() => onAdaptar(detalle)}
                className={`${ACCION} basis-full bg-primary px-4 text-primary-fg hover:bg-primary-hover`}
              >
                <Repeat2 size={15} aria-hidden />
                Adaptar a otra red
              </button>
            </>
          )}
        </footer>
      )}
    </>
  );
}

function Dato({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2.5">
      <dt className="text-fg-muted">{titulo}</dt>
      <dd className="min-w-0 text-right font-medium text-fg">{children}</dd>
    </div>
  );
}

/**
 * La portada de lo que se publicó, con su forma: vertical para un guion de
 * video, cuadrada para lo demás. Sin imagen (o si ya no carga), el título
 * sobre el tinte, como el diseño.
 */
function VistaPrevia({ detalle }: { detalle: AnaliticasPublicacionDetalleDto }) {
  const { assetId, imagenes } = detalle.miniatura;
  const [rota, setRota] = useState<string | null>(null);
  const vertical = detalle.archetype === "video_script";
  const forma = vertical
    ? "w-[128px] h-[226px] @lg:w-[168px] @lg:h-[296px]"
    : "size-[128px] @lg:size-[190px]";
  const Icono = vertical ? Film : AlignLeft;

  if (assetId && rota !== assetId) {
    return (
      <div className={`relative shrink-0 overflow-hidden rounded-xl bg-lib-tile ${forma}`}>
        <img
          src={assetContentUrl(assetId)}
          alt=""
          onError={() => setRota(assetId)}
          className="size-full object-cover"
        />
        {imagenes > 1 && (
          <span
            role="img"
            aria-label={`Carrusel de ${String(imagenes)} imágenes`}
            className="absolute right-1.5 bottom-1.5 rounded-sm bg-fg/70 px-1.5 text-[11px] leading-snug font-bold text-fg-inverse"
          >
            1/{imagenes}
          </span>
        )}
      </div>
    );
  }
  return (
    <div
      className={`relative flex shrink-0 items-end overflow-hidden rounded-xl bg-tint-plum p-3 @lg:p-3.5 ${forma}`}
    >
      <Icono size={36} className="absolute inset-0 m-auto text-brand opacity-30" aria-hidden />
      <p className="relative line-clamp-5 font-display text-sm leading-snug font-semibold text-fg @lg:text-[15px]">
        {detalle.titulo || "Publicación sin texto"}
      </p>
    </div>
  );
}

/** El texto completo, recortado a 4 líneas con "Ver más". */
function Texto({ texto }: { texto: string }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLParagraphElement>(null);
  const [recortado, setRecortado] = useState(false);
  useEffect(() => {
    const el = caja.current;
    if (el && !abierto) setRecortado(el.scrollHeight > el.clientHeight + 1);
  }, [texto, abierto]);

  return (
    <div className="flex flex-col items-start gap-1">
      <p
        ref={caja}
        className={`text-[13px] leading-relaxed whitespace-pre-line text-fg-secondary ${
          abierto ? "" : "line-clamp-4"
        }`}
      >
        {texto}
      </p>
      {(recortado || abierto) && (
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          className="font-display text-xs font-semibold text-accent hover:underline"
        >
          {abierto ? "Ver menos" : "Ver más"}
        </button>
      )}
    </div>
  );
}

/** "Sobre tu promedio en TikTok +62%", o por qué todavía no se puede decir. */
function LiftPropio({ detalle, ahora }: { detalle: AnaliticasPublicacionDetalleDto; ahora: Date }) {
  const red = NETWORK_LABELS[detalle.network];
  if (detalle.lift !== null) {
    const lift = textoLift(detalle.lift);
    return (
      <div className="flex items-baseline justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
        <p className="text-[13px] text-fg-secondary">Sobre tu promedio en {red}</p>
        <p
          className={`font-display text-2xl font-semibold tracking-[-0.01em] ${
            lift.direccion === "baja" ? "text-fg-secondary" : "text-brand"
          }`}
        >
          {lift.texto}
        </p>
      </div>
    );
  }
  // Sin números el estado ya explica todo; repetirlo aquí sería ruido.
  if (detalle.estado !== "medida") return null;
  const motivo = motivoSinLift(detalle.muestraDeRed, detalle.network, detalle.publishedAt, ahora);
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-[13px] text-fg-secondary">
        Sobre tu promedio en {red}: <span className="font-medium text-fg">sin comparar</span>
      </p>
      {motivo && <p className="mt-0.5 text-xs text-fg-muted">{motivo}</p>}
    </div>
  );
}

function Hermana({
  hermana,
  onAbrir,
}: {
  hermana: AnaliticasHermanaDto;
  onAbrir: (cardId: string) => void;
}) {
  const meta = NETWORK_META[hermana.network];
  const copy = copyDeEstado(hermana.estado, hermana.network);
  const lift = hermana.lift === null ? null : textoLift(hermana.lift);
  return (
    <button
      type="button"
      onClick={() => onAbrir(hermana.cardId)}
      className="flex w-full items-center gap-3 rounded-lg border border-line bg-card px-3.5 py-[11px] text-left transition-colors hover:bg-surface"
    >
      <meta.Logo size={22} />
      <span className="min-w-0 flex-1 truncate font-display text-sm font-medium text-fg">
        {meta.label}
      </span>
      {lift ? (
        <span
          className={`font-display text-[17px] font-semibold ${
            lift.direccion === "baja" ? "text-fg-secondary" : "text-brand"
          }`}
        >
          {lift.texto}
        </span>
      ) : (
        <span className="text-xs text-fg-muted">{copy?.titulo ?? "Sin comparar"}</span>
      )}
      <ChevronRight size={16} className="shrink-0 text-fg-muted" aria-hidden />
    </button>
  );
}

function Aviso({
  Icono,
  titulo,
  detalle,
  accion,
}: {
  Icono: typeof AlertCircle;
  titulo: string;
  detalle: string;
  accion: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-secondary">
        <Icono size={22} className="text-fg-muted" aria-hidden />
      </div>
      <p className="font-display text-[15px] font-semibold text-fg">{titulo}</p>
      <p className="text-[13px] text-fg-secondary">{detalle}</p>
      {accion}
    </div>
  );
}

function Hueso({ className }: { className: string }) {
  return <div className={`rounded-md bg-secondary ${className}`} />;
}

/** La forma real del panel mientras llega: vista previa, datos y métricas. */
function DetalleSkeleton() {
  return (
    <div
      className="flex animate-pulse flex-col gap-[22px] px-4 py-5 @lg:px-6 @lg:py-[22px]"
      aria-label="Cargando la publicación"
      role="status"
    >
      <div className="flex gap-4 @lg:gap-[18px]">
        <Hueso className="size-[128px] shrink-0 rounded-xl @lg:size-[190px]" />
        <div className="flex flex-1 flex-col gap-3 pt-1">
          <Hueso className="h-6 w-28" />
          <Hueso className="h-4 w-full" />
          <Hueso className="h-4 w-4/5" />
        </div>
      </div>
      <Hueso className="h-14 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-2 @lg:grid-cols-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Hueso key={i} className="h-[74px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}
