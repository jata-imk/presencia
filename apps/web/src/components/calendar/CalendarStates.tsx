import { CalendarPlus, CloudOff, Filter, PlugZap, Sparkles } from "lucide-react";
import { Link } from "react-router";
import type { SocialNetwork } from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";

// Estados especiales del Calendario (presencia-calendario.md §5).
//
// Los tres que aparecen SOBRE la grilla comparten forma: un aviso flotante
// que no bloquea. El calendario vacío sin contexto confunde al usuario nuevo,
// pero un overlay que tape la grilla impide explorarla — el balance que pide
// la spec es "informativo no bloqueante".

function Floating({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center p-8">
      <div className="pointer-events-auto max-w-[360px] rounded-2xl border border-line bg-card px-6 py-5 text-center shadow-lg">
        {children}
      </div>
    </div>
  );
}

/** Primera vez: la cuenta no tiene ni una publicación, en ningún estado. */
export function FirstTimeState() {
  return (
    <Floating>
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-secondary">
        <CalendarPlus size={24} strokeWidth={1.5} className="text-ai" />
      </div>
      <h2 className="font-display text-base font-semibold text-fg">
        Aquí va a vivir tu pipeline editorial
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-secondary">
        El Calendario no crea contenido: muestra lo que creas en Chat, ya con fecha. Empieza por tu
        primer post.
      </p>
      <Link
        to="/chats"
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-display text-[13px] font-semibold text-primary-fg shadow-sm transition-colors hover:bg-primary-hover"
      >
        <Sparkles size={15} strokeWidth={2} />
        Crear mi primer post
      </Link>
    </Floating>
  );
}

/** Hay publicaciones en la cuenta, pero ninguna en el periodo que se está mirando. */
export function EmptyPeriodState({ period }: { period: string }) {
  return (
    <Floating>
      <p className="text-[13px] leading-relaxed text-fg-secondary">
        Sin publicaciones {period}. Lo que programes desde Chat va a aparecer aquí.
      </p>
    </Floating>
  );
}

/** El periodo está vacío por culpa de los filtros, no porque no haya nada. */
export function EmptyByFiltersState({ onClear }: { onClear: () => void }) {
  return (
    <Floating>
      <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-secondary">
        <Filter size={20} strokeWidth={1.5} className="text-fg-muted" />
      </div>
      <h2 className="font-display text-[15px] font-semibold text-fg">
        Nada coincide con los filtros
      </h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-secondary">
        Hay publicaciones en este periodo, pero ninguna pasa los filtros activos.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="mt-3.5 rounded-lg border-[1.5px] border-line px-3.5 py-2 font-display text-[12.5px] font-semibold text-brand transition-colors hover:bg-secondary"
      >
        Quitar los filtros
      </button>
    </Floating>
  );
}

/**
 * Sin conexión. Va como banda y no como overlay: lo que ya se cargó sigue
 * siendo útil para mirar, y taparlo no ayudaría. Lo que sí importa es avisar
 * ANTES de que alguien intente arrastrar algo, porque eso sí va a fallar.
 */
export function OfflineBanner() {
  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-center gap-2 bg-warning-bg px-4 py-1.5 text-[12px] font-medium text-warning"
    >
      <CloudOff size={13} strokeWidth={2} />
      Sin conexión. Los cambios que hagas ahora no se van a guardar.
    </div>
  );
}

/**
 * Una red con la cuenta desconectada. No es un error del calendario: lo que
 * ya está programado sigue bien guardado, pero cuando le llegue la hora el
 * worker no va a tener a dónde publicarlo. Se avisa antes, no después.
 *
 * Va como banda ámbar y no como diálogo: no bloquea nada y el usuario puede
 * seguir programando —reconectar la cuenta después arregla todo lo que ya
 * está en la grilla.
 */
export function DisconnectedChannelsBanner({ networks }: { networks: SocialNetwork[] }) {
  const nombres = networks.map((network) => NETWORK_META[network].label);
  const lista =
    nombres.length === 1
      ? nombres[0]
      : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-warning-bg px-4 py-1.5 text-[12px] font-medium text-warning"
    >
      <PlugZap size={13} strokeWidth={2} className="shrink-0" />
      {nombres.length === 1
        ? `${lista} está desconectado: lo que programes para esa red no se va a publicar.`
        : `${lista} están desconectados: lo que programes para esas redes no se va a publicar.`}
      <Link
        to="/configuracion/canales/desconectadas"
        className="font-semibold underline underline-offset-2"
      >
        Reconectar
      </Link>
    </div>
  );
}

/**
 * Esqueleto de carga. Solo en la primera carga del módulo: al cambiar de mes
 * la grilla conserva el contenido anterior (calendar-store no lo limpia), que
 * es mejor que parpadear a vacío y volver.
 *
 * Reserva el ancho de la bandeja de borradores. Sin eso el esqueleto ocupaba
 * la pantalla entera y, al resolver la carga, la columna de 300px (o el rail
 * de 56px) aparecía de golpe y encogía el calendario: un salto que se lee
 * como un error aunque no lo sea.
 */
export function CalendarSkeleton({
  withDrafts,
  draftsCollapsed,
}: {
  withDrafts: boolean;
  draftsCollapsed: boolean;
}) {
  return (
    <div aria-hidden className="flex min-h-0 flex-1">
      {withDrafts && (
        <div
          className={`shrink-0 border-r border-line bg-card ${draftsCollapsed ? "w-14" : "w-[300px]"}`}
        >
          <div className="mx-4 mt-4 h-4 w-24 rounded bg-secondary" />
          {!draftsCollapsed && (
            <div className="mt-4 flex flex-col gap-2 px-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="h-16 rounded-xl bg-secondary" />
              ))}
            </div>
          )}
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-5 border-t border-line">
        {Array.from({ length: 35 }, (_, index) => (
          <div key={index} className="border-r border-b border-line bg-card p-1.5">
            <div className="h-[22px] w-6 rounded bg-secondary" />
            {index % 3 === 0 && <div className="mt-1.5 h-4 rounded-md bg-secondary" />}
            {index % 5 === 0 && <div className="mt-1 h-4 rounded-md bg-secondary" />}
          </div>
        ))}
      </div>
    </div>
  );
}
