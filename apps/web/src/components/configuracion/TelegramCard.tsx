import {
  ExternalLink,
  Info,
  Link2,
  LoaderCircle,
  QrCode,
  RefreshCw,
  Send,
  Timer,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatDayMonthYear } from "../../lib/format-date.js";
import { formatMinSec } from "../../lib/format-duration.js";
import type { TelegramCardView } from "../../lib/telegram-card-view.js";
import { Button, buttonClass } from "../ui/Button.js";
import { Aviso } from "./primitivas.js";
import { TelegramQr } from "./TelegramQr.js";

// Telegram en Configuración → Canales conectados (F11 PR7a, ADR-030; Claude
// Design "Chat Telegram" §1): conectar con un enlace de un solo uso (o su QR,
// desde la compu), esperar a que el creator toque Iniciar, y desconectar.
// Solo pinta: el estado y las acciones llegan por props (la página los toma
// del store), así Storybook recorre cada estado sin API.

export const TELEGRAM_DESCRIPTION =
  "Habla con Presencia desde Telegram: mándale audios, fotos y links. Cada tema del bot es un chat aquí.";

type Visible = Exclude<TelegramCardView, { kind: "hidden" }>;

interface TelegramCardProps {
  view: Visible;
  /** Generando un enlace (o desconectando): los botones no responden. */
  busy?: boolean;
  /** Lo que falló al generar el enlace. */
  error?: string | null;
  /** Generar el enlace: el primero, uno nuevo o volver a intentar. */
  onConnect: () => void;
  onDisconnect: () => void;
}

export function TelegramCard({
  view,
  busy = false,
  error,
  onConnect,
  onDisconnect,
}: TelegramCardProps) {
  const connected = view.kind === "on";
  // Los cortes van por el ancho de la tarjeta, no de la ventana: en
  // Configuración la columna es angosta aun en una tablet (768 px con la
  // navegación al lado), y la fila de escritorio no cabía.
  return (
    <div className="@container">
      <div className="rounded-lg border border-line bg-surface p-4 @xl:p-5">
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-telegram text-on-telegram @xl:size-10"
          >
            <Send size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-base font-bold text-fg">Telegram</span>
              <EstadoPill view={view} />
            </div>
            <p className="mt-0.5 text-sm leading-normal text-fg-secondary">
              {view.kind === "on" ? <ConectadoComo view={view} /> : TELEGRAM_DESCRIPTION}
            </p>
          </div>
          {view.kind === "off" && (
            <Button
              onClick={onConnect}
              disabled={busy}
              className="hidden items-center gap-1.5 @xl:inline-flex"
            >
              <Link2 size={14} strokeWidth={2} aria-hidden />
              Conectar Telegram
            </Button>
          )}
          {view.kind === "on" && (
            <div className="hidden shrink-0 gap-2 @xl:flex">
              <AccionesConectado view={view} busy={busy} onDisconnect={onDisconnect} />
            </div>
          )}
        </div>

        {view.kind === "off" && (
          <Button
            onClick={onConnect}
            disabled={busy}
            className="mt-3.5 inline-flex w-full items-center justify-center gap-1.5 @xl:hidden"
          >
            <Link2 size={14} strokeWidth={2} aria-hidden />
            Conectar Telegram
          </Button>
        )}

        {connected && (
          <>
            <p className="mt-3.5 flex gap-2 border-t border-line pt-3.5 text-[13px] leading-normal text-fg-muted">
              <Info size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden />
              Cada tema del bot es un chat en Recientes. Los audios se transcriben y verás el ícono
              de Telegram junto a esos chats.
            </p>
            {/* Sin espacio para los dos, cada uno baja a su fila completa. */}
            <div className="mt-3.5 flex flex-wrap gap-2 @xl:hidden">
              <AccionesConectado view={view} busy={busy} onDisconnect={onDisconnect} grow />
            </div>
          </>
        )}

        {(view.kind === "wait" || view.kind === "exp") && (
          <Esperando view={view} busy={busy} onConnect={onConnect} />
        )}

        {view.kind === "err" && (
          <div className="mt-4 flex flex-col items-start gap-3 border-t border-line pt-4">
            <Aviso tono="error">
              Esta cuenta de Telegram ya está conectada a otro perfil de Presencia. Desconéctala
              allá o usa otra cuenta.
            </Aviso>
            {/* El mismo enlace sigue sirviendo: si esta pestaña lo tiene, se
                reabre (generar otro tiraría uno bueno). Si no, uno nuevo. */}
            {view.url ? (
              <a
                href={view.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${buttonClass("primary")} inline-flex items-center gap-1.5`}
              >
                <RefreshCw size={14} strokeWidth={2} aria-hidden />
                Intentar de nuevo
              </a>
            ) : (
              <Button
                onClick={onConnect}
                disabled={busy}
                className="inline-flex items-center gap-1.5"
              >
                <RefreshCw size={14} strokeWidth={2} aria-hidden />
                Intentar de nuevo
              </Button>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-error-fg">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function ConectadoComo({ view }: { view: Extract<Visible, { kind: "on" }> }) {
  const desde = view.linkedAt ? formatDayMonthYear(view.linkedAt) : null;
  if (!view.username) return <>{desde ? `Conectado desde el ${desde}` : "Conectado"}</>;
  return (
    <>
      <b className="font-semibold text-fg">@{view.username}</b>
      {desde && ` · conectado desde el ${desde}`}
    </>
  );
}

function AccionesConectado({
  view,
  busy,
  onDisconnect,
  grow = false,
}: {
  view: Extract<Visible, { kind: "on" }>;
  busy: boolean;
  onDisconnect: () => void;
  grow?: boolean;
}) {
  return (
    <>
      {/* Sin el @ del bot (todavía arrancando) no hay a dónde abrir. */}
      {view.botUsername && (
        <a
          href={`https://t.me/${view.botUsername}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${buttonClass("secondary")} inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${grow ? "flex-1" : ""}`}
        >
          <ExternalLink size={14} strokeWidth={2} aria-hidden />
          Abrir Telegram
        </a>
      )}
      <Button
        variant="danger"
        onClick={onDisconnect}
        disabled={busy}
        className={`whitespace-nowrap ${grow ? "flex-1" : ""}`}
      >
        Desconectar
      </Button>
    </>
  );
}

/** Esperando a que confirme en Telegram, o el enlace ya venció. */
function Esperando({
  view,
  busy,
  onConnect,
}: {
  view: Extract<Visible, { kind: "wait" | "exp" }>;
  busy: boolean;
  onConnect: () => void;
}) {
  const [showQr, setShowQr] = useState(false);
  const expired = view.kind === "exp";
  const generarOtro = (
    <button
      type="button"
      onClick={onConnect}
      disabled={busy}
      className="font-semibold text-accent underline underline-offset-3 hover:text-fg disabled:opacity-50"
    >
      Generar otro
    </button>
  );

  return (
    <div className="mt-4 grid gap-4 border-t border-line pt-4 @xl:grid-cols-[1fr_auto] @xl:items-center @xl:gap-6">
      <div className="flex min-w-0 flex-col gap-3">
        {expired ? (
          <Aviso>El enlace venció a los 15 minutos. Genera otro para conectar.</Aviso>
        ) : view.url ? (
          <Pasos>
            <li>
              Abre Telegram y toca <b className="font-semibold text-fg">Iniciar</b> en el bot de
              Presencia.
            </li>
            <li>Esta página se actualiza sola cuando confirmes.</li>
          </Pasos>
        ) : (
          // Recargaste: el enlace no se guarda en el navegador, y el servidor
          // solo tiene su huella. Si ya lo abriste en el cel, sigue sirviendo.
          <Pasos>
            <li>
              Si ya abriste el enlace, toca <b className="font-semibold text-fg">Iniciar</b> en
              Telegram.
            </li>
            <li>Si no, genera otro.</li>
          </Pasos>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {expired || !view.url ? (
            <Button
              onClick={onConnect}
              disabled={busy}
              className="inline-flex items-center gap-1.5"
            >
              <RefreshCw size={14} strokeWidth={2} aria-hidden />
              Generar otro
            </Button>
          ) : (
            <a
              href={view.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${buttonClass("primary")} inline-flex w-full items-center justify-center gap-1.5 @xl:w-auto`}
            >
              <ExternalLink size={14} strokeWidth={2} aria-hidden />
              Abrir Telegram
            </a>
          )}
          {view.kind === "wait" && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-fg-muted">
              <Timer size={13} strokeWidth={1.75} aria-hidden />
              <span>
                Vence en {formatMinSec(view.remainingMs / 1000)}
                {view.url && <> · {generarOtro}</>}
              </span>
            </span>
          )}
        </div>

        {view.kind === "wait" && (
          <p className="flex items-center gap-2 text-[12.5px] text-fg-muted">
            <LoaderCircle size={12} className="text-accent motion-safe:animate-spin" aria-hidden />
            Esperando a que confirmes en Telegram…
          </p>
        )}
      </div>

      {/* En la compu, el QR a la derecha; en el cel, solo si lo pide (Telegram
          suele estar en ese mismo cel, y el botón ya lo abre). */}
      <div className="hidden flex-col items-center gap-2 @xl:flex">
        <TelegramQr url={view.url} expired={expired} />
        <span className="text-xs text-fg-muted">
          {expired
            ? "Genera otro para ver un código nuevo"
            : view.url
              ? "Escanéalo desde tu cel"
              : "Genera otro para ver el código"}
        </span>
      </div>
      {view.kind === "wait" && view.url && (
        <div className="border-t border-line pt-3 @xl:hidden">
          {showQr ? (
            <div className="flex flex-col items-center gap-2">
              <TelegramQr url={view.url} expired={false} />
              <span className="text-xs text-fg-muted">Escanéalo desde el otro dispositivo</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowQr(true)}
              className="flex items-start gap-2 text-left font-display text-[12.5px] font-semibold text-accent"
            >
              <QrCode size={14} strokeWidth={1.75} aria-hidden />
              ¿Telegram está en otro dispositivo? Mostrar QR
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Pasos({ children }: { children: ReactNode }) {
  return (
    <ol className="m-0 list-decimal pl-4.5 text-[13.5px] leading-relaxed text-fg-secondary">
      {children}
    </ol>
  );
}

const PILLS = {
  ok: "bg-success-bg text-success-fg",
  wait: "bg-secondary text-accent",
  warn: "bg-warning-bg text-warning-fg",
  err: "bg-error-bg text-error-fg",
} as const;

/** Sin conectar no lleva pill: la descripción y el botón ya lo dicen. */
const PILL_DE: Partial<Record<Visible["kind"], [keyof typeof PILLS, string]>> = {
  on: ["ok", "Conectado"],
  wait: ["wait", "Esperando"],
  exp: ["warn", "Vencido"],
  err: ["err", "No se conectó"],
};

function EstadoPill({ view }: { view: Visible }) {
  const pill = PILL_DE[view.kind];
  if (!pill) return null;
  const [tono, texto] = pill;
  return (
    <span
      className={`inline-flex h-5.5 items-center gap-1.5 rounded-full px-2.25 font-display text-[11.5px] font-semibold whitespace-nowrap ${PILLS[tono]}`}
    >
      {tono === "wait" ? (
        <LoaderCircle
          size={10}
          strokeWidth={2.5}
          className="motion-safe:animate-spin"
          aria-hidden
        />
      ) : (
        <span className="size-1.5 rounded-full bg-current" aria-hidden />
      )}
      {texto}
    </span>
  );
}
