import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CalendarClock,
  ChevronRight,
  ExternalLink,
  Eye,
  Film,
  Hash,
  ImageIcon,
  Link2,
  Lock,
  Monitor,
  Pencil,
  RefreshCw,
  Repeat2,
  Smartphone,
  Type,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  NETWORK_TEXT_LIMITS,
  buildPostText,
  type CardStatus,
  type PublicationCardDto,
} from "@presencia/shared";
import { missingImageNote } from "../../lib/cards/card-image.js";
import { useCardController, type CardController } from "../../lib/cards/use-card-controller.js";
import { useChannels } from "../../lib/use-channels.js";
import { NETWORK_LABELS } from "../../lib/network-labels.js";
import { useCardsByIds } from "../../stores/cards-store.js";
import { usePublicationPanelStore, type PanelMode } from "../../stores/publication-panel-store.js";
import { PublishedBanner, ScheduledBanner } from "../cards/Banner.js";
import { EmptyImageState, JobNotice, SelectedImage } from "../cards/CardMedia.js";
import { Hashtags } from "../cards/Hashtags.js";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { NetworkPreview } from "../preview/NetworkPreview.js";
import type { PreviewAccount } from "../preview/PreviewParts.js";
import { QuotaExhaustedModal } from "../QuotaExhaustedModal.js";

// El contenido del panel de publicación (F10.5, rd-panel.jsx → Panel): las
// pestañas de las cards abiertas, el conmutador Vista previa / Editar, el
// cuerpo y las acciones según el estado. Lee la card viva de cards-store, así
// que lo que cambie en otra parte (el worker termina la imagen, otra pestaña
// la programa) se ve aquí sin hacer nada.

const EDITABLE: CardStatus[] = ["draft", "failed"];

export function PanelCard({
  onAdapt,
  mobile = false,
}: {
  onAdapt: (text: string) => void;
  mobile?: boolean;
}) {
  const cardIds = usePublicationPanelStore((s) => s.cardIds);
  const activeId = usePublicationPanelStore((s) => s.activeId);
  const mode = usePublicationPanelStore((s) => s.mode);
  const setMode = usePublicationPanelStore((s) => s.setMode);
  const close = usePublicationPanelStore((s) => s.close);
  const cards = useCardsByIds(cardIds);
  const controller = useCardController(activeId ?? undefined);
  const { card } = controller;
  const { channels } = useChannels();

  const editable = card ? EDITABLE.includes(card.status) : false;
  const effectiveMode: PanelMode = editable ? mode : "preview";

  // ⌘E / Ctrl+E alterna vista previa y edición (rd-main.jsx, tip del panel).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "e") return;
      if (!editable) return;
      e.preventDefault();
      setMode(effectiveMode === "edit" ? "preview" : "edit");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, effectiveMode, setMode]);

  const account = accountFor(card, channels);

  return (
    <section
      aria-label="Panel de publicación"
      className="relative flex h-full min-h-0 flex-col border-l border-line bg-card"
    >
      {controller.cuota && (
        <QuotaExhaustedModal quota={controller.cuota} onDismiss={controller.dismissCuota} />
      )}

      {mobile && (
        <div className="flex h-12 shrink-0 items-center border-b border-line px-2">
          <button
            type="button"
            onClick={close}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 font-display text-[13px] font-semibold text-fg-secondary hover:bg-surface"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Chat
          </button>
        </div>
      )}

      <Tabs cards={cards} activeId={activeId} mobile={mobile} onClose={close} />

      <div className="flex h-[46px] shrink-0 items-center gap-2.5 border-b border-line px-3">
        <Segmented
          label="Modo del panel"
          value={effectiveMode}
          onChange={setMode}
          options={[
            { value: "preview", label: "Vista previa", Icon: Eye },
            {
              value: "edit",
              label: "Editar",
              Icon: editable ? Pencil : Lock,
              disabled: !editable,
              title: editable ? "Editar (Ctrl+E)" : "Solo se editan borradores",
            },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!card ? (
          <p className="p-6 text-sm text-fg-muted">Cargando borrador…</p>
        ) : (
          <>
            <StatusBanner card={card} />
            {effectiveMode === "preview" ? (
              <PreviewBody
                card={card}
                controller={controller}
                account={account}
                // Mientras las cuentas cargan no se sabe si hay una: decir
                // "Conecta tu cuenta" ahí sería afirmar algo falso.
                missingAccount={channels !== null && account === null}
                onEditImage={() => setMode("edit")}
              />
            ) : (
              <EditBody card={card} controller={controller} />
            )}
          </>
        )}
      </div>

      {card && <Footer card={card} controller={controller} onAdapt={onAdapt} />}
    </section>
  );
}

/** La cuenta con la que se publicaría: la elegida al programar, o la conectada de esa red. */
function accountFor(
  card: PublicationCardDto | undefined,
  channels: { id: string; network: string; displayName: string | null; status: string }[] | null,
): PreviewAccount | null {
  if (!card || !channels) return null;
  const chosen =
    channels.find((c) => c.id === card.socialAccountId) ??
    channels.find((c) => c.network === card.network && c.status === "active");
  if (!chosen) return null;
  return { name: chosen.displayName ?? `Tu cuenta de ${NETWORK_LABELS[card.network]}` };
}

const STATUS_DOT: Record<CardStatus, string> = {
  draft: "bg-accent",
  scheduled: "bg-info",
  published: "bg-success",
  failed: "bg-error",
  canceled: "bg-fg-muted",
};

function Tabs({
  cards,
  activeId,
  mobile,
  onClose,
}: {
  cards: PublicationCardDto[];
  activeId: string | null;
  mobile: boolean;
  onClose: () => void;
}) {
  const setActive = usePublicationPanelStore((s) => s.setActive);
  // Dos cards de la misma red en las pestañas (el usuario pidió otra versión
  // en el chat): se numeran, si no serían dos pestañas idénticas.
  const counts = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const c of cards) counts.set(c.network, (counts.get(c.network) ?? 0) + 1);

  return (
    <div className="flex h-[45px] shrink-0 items-end gap-0.5 border-b border-line px-2">
      <div
        role="tablist"
        aria-label="Borradores abiertos"
        className="flex min-w-0 flex-1 overflow-x-auto"
      >
        {cards.map((c) => {
          const { Logo, label } = NETWORK_META[c.network];
          const n = (seen.get(c.network) ?? 0) + 1;
          seen.set(c.network, n);
          const active = c.id === activeId;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActive(c.id)}
              className={`inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 font-display text-[13px] font-semibold whitespace-nowrap transition-colors ${
                active
                  ? "border-fg text-fg"
                  : "border-transparent text-fg-muted hover:text-fg-secondary"
              }`}
            >
              <Logo size={14} />
              {label}
              {(counts.get(c.network) ?? 0) > 1 && ` ${String(n)}`}
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${STATUS_DOT[c.status]}`}
              />
            </button>
          );
        })}
      </div>
      {!mobile && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel (Esc)"
          title="Cerrar (Esc)"
          className="mb-2 inline-flex size-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface hover:text-fg"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function StatusBanner({ card }: { card: PublicationCardDto }) {
  if (card.status === "scheduled" && card.scheduledAt) {
    return <ScheduledBanner scheduledAt={card.scheduledAt} cardId={card.id} />;
  }
  if (card.status === "published" && card.publishedAt) {
    return <PublishedBanner publishedAt={card.publishedAt} />;
  }
  if (card.status === "failed") {
    return (
      <div className="flex items-start gap-2.5 border-b border-error-border bg-error-bg px-4 py-2.5">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
        <div>
          <p className="text-xs font-semibold text-error">No se pudo publicar</p>
          {card.errorMessage && <p className="text-xs text-fg-secondary">{card.errorMessage}</p>}
        </div>
      </div>
    );
  }
  return null;
}

function PreviewBody({
  card,
  controller,
  account,
  missingAccount,
  onEditImage,
}: {
  card: PublicationCardDto;
  controller: CardController;
  account: PreviewAccount | null;
  missingAccount: boolean;
  onEditImage: () => void;
}) {
  const [device, setDevice] = useState<"mobile" | "desktop">("desktop");
  const { content, network } = card;
  const editable = EDITABLE.includes(card.status);
  const text = buildPostText(content);
  const limit = NETWORK_TEXT_LIMITS[network];
  const over = text.length - limit;
  const job = controller.imageJob;
  const hasImage = content.assetIds.length > 0 || job?.status === "generating";
  const needsImageNote =
    editable &&
    content.archetype === "visual_first" &&
    !hasImage &&
    (network === "instagram" || network === "facebook");

  // LinkedIn en escritorio es más ancho que el resto; los avisos se alinean
  // con la vista previa que acompañan.
  const widthClass =
    network === "linkedin" && device === "desktop" ? "max-w-[555px]" : "max-w-[420px]";

  return (
    <div className="flex min-h-full flex-col gap-3 bg-surface px-5 py-4.5">
      <div className={`mx-auto flex w-full flex-col gap-2 ${widthClass}`}>
        {network === "linkedin" && content.archetype !== "video_script" && (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-xs text-fg-muted">Así se verá al publicarse</span>
            <Segmented
              label="Dispositivo"
              small
              value={device}
              onChange={setDevice}
              options={[
                { value: "mobile", label: "Móvil", Icon: Smartphone },
                { value: "desktop", label: "Escritorio", Icon: Monitor },
              ]}
            />
          </div>
        )}
        {needsImageNote && (
          <Notice
            kind="info"
            Icon={ImageIcon}
            action={{ label: "Agregar imagen", onClick: onEditImage }}
          >
            {network === "facebook"
              ? "Sin imagen: se publicará solo el texto."
              : missingImageNote(network)}
          </Notice>
        )}
        {editable && (job?.status === "failed" || job?.status === "blocked") && (
          <JobNotice job={job} />
        )}
        {over > 0 && (
          <Notice kind="error" Icon={AlertCircle}>
            Te pasas por {over.toLocaleString("es-MX")} caracteres del límite de{" "}
            {NETWORK_LABELS[network]} ({limit.toLocaleString("es-MX")}).
            {network === "x" && " Lo que sobra está resaltado."}
          </Notice>
        )}
        {missingAccount && content.archetype !== "video_script" && (
          <Notice kind="info" Icon={Link2}>
            Conecta tu cuenta de {NETWORK_LABELS[network]} para verla con tu nombre.{" "}
            <Link to="/configuracion/canales" className="font-semibold underline">
              Conectar
            </Link>
          </Notice>
        )}
      </div>
      <div className={`mx-auto w-full ${widthClass}`}>
        <NetworkPreview
          network={network}
          content={content}
          account={account}
          imageJob={job}
          device={device}
        />
      </div>
    </div>
  );
}

function EditBody({ card, controller }: { card: PublicationCardDto; controller: CardController }) {
  const { content, network } = card;
  const text = buildPostText(content);
  const limit = NETWORK_TEXT_LIMITS[network];
  const assetId = content.assetIds[0];
  const prompt = "imagePrompt" in content ? content.imagePrompt : undefined;

  return (
    <div>
      {content.archetype === "video_script" ? (
        <Section title="Guion" Icon={Film}>
          <ReadOnlyText text={`${content.hook}\n\n${content.script}`} />
        </Section>
      ) : (
        <Section title="Imagen" Icon={ImageIcon}>
          {assetId ? (
            <SelectedImage
              key={assetId}
              assetId={assetId}
              alt={prompt ?? "Imagen de la publicación"}
              prompt={prompt}
              media={controller.media}
            />
          ) : (
            <EmptyImageState
              note={missingImageNote(network)}
              prompt={prompt}
              media={controller.media}
            />
          )}
        </Section>
      )}
      <Section
        title={content.archetype === "video_script" ? "Descripción" : "Texto"}
        Icon={Type}
        meta={`${text.length.toLocaleString("es-MX")} / ${limit.toLocaleString("es-MX")}`}
      >
        <ReadOnlyText
          text={
            content.archetype === "visual_first"
              ? content.caption
              : content.archetype === "video_script"
                ? content.caption
                : content.body
          }
        />
        <Counter used={text.length} limit={limit} network={NETWORK_LABELS[network]} />
      </Section>
      {content.hashtags.length > 0 && (
        <Section title="Hashtags" Icon={Hash} meta={String(content.hashtags.length)}>
          <div className="-mt-3">
            <Hashtags tags={content.hashtags} />
          </div>
        </Section>
      )}
    </div>
  );
}

function ReadOnlyText({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-line bg-card px-3.5 py-3 text-sm leading-relaxed whitespace-pre-wrap text-fg">
      {text}
    </p>
  );
}

function Counter({ used, limit, network }: { used: number; limit: number; network: string }) {
  const ratio = used / limit;
  const color = ratio > 1 ? "bg-error" : ratio > 0.85 ? "bg-warning" : "bg-success";
  const textColor = ratio > 1 ? "text-error" : ratio > 0.85 ? "text-warning" : "text-fg-muted";
  return (
    <div className="mt-2 flex items-center gap-2.5 text-[11.5px] text-fg-muted">
      <span className="whitespace-nowrap">Límite de {network}</span>
      <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full ${color}`}
          style={{ width: `${String(Math.min(ratio, 1) * 100)}%` }}
        />
      </div>
      <span className={`font-display font-semibold ${textColor}`}>
        {used.toLocaleString("es-MX")} / {limit.toLocaleString("es-MX")}
      </span>
    </div>
  );
}

function Section({
  title,
  Icon,
  meta,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  meta?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-11 w-full items-center gap-2 px-4 text-left"
      >
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={`text-fg-muted transition-transform ${open ? "rotate-90" : ""}`}
        />
        <Icon size={15} aria-hidden="true" className="text-fg-secondary" />
        <span className="font-display text-[13.5px] font-semibold text-fg">{title}</span>
        {meta && <span className="text-xs text-fg-muted">{meta}</span>}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function Notice({
  kind,
  Icon,
  children,
  action,
}: {
  kind: "info" | "error";
  Icon: LucideIcon;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[12.5px] leading-normal text-fg ${
        kind === "error" ? "bg-error-bg" : "bg-info-bg"
      }`}
    >
      <Icon
        size={15}
        aria-hidden="true"
        className={`mt-px shrink-0 ${kind === "error" ? "text-error" : "text-info"}`}
      />
      <div className="flex-1">
        {children}
        {action && (
          <div className="mt-2">
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex h-7 items-center rounded-md bg-card px-2.5 font-display text-xs font-semibold text-fg shadow-xs hover:bg-surface"
            >
              {action.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface SegmentOption<T extends string> {
  value: T;
  label: string;
  Icon: LucideIcon;
  disabled?: boolean;
  title?: string;
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  small = false,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  small?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-lg border border-line bg-surface p-0.5"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={o.disabled}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-md font-display font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
              small ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-[12.5px]"
            } ${selected ? "bg-card text-fg shadow-xs" : "text-fg-muted hover:text-fg-secondary"}`}
          >
            <o.Icon size={small ? 13 : 14} aria-hidden="true" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Footer({
  card,
  controller,
  onAdapt,
}: {
  card: PublicationCardDto;
  controller: CardController;
  onAdapt: (text: string) => void;
}) {
  const adapt = () => onAdapt(`Adapta el borrador de ${NETWORK_LABELS[card.network]} a `);
  const buttons: ReactNode = (() => {
    switch (card.status) {
      case "draft":
        return (
          <>
            <FooterButton primary Icon={Calendar} onClick={controller.openSchedule}>
              Programar
            </FooterButton>
            <FooterButton Icon={Repeat2} onClick={adapt}>
              Adaptar a otra red
            </FooterButton>
          </>
        );
      case "scheduled":
        return (
          <>
            <FooterButton Icon={CalendarClock} onClick={controller.openSchedule}>
              Reprogramar
            </FooterButton>
            <FooterButton
              danger
              Icon={XCircle}
              onClick={controller.cancel}
              disabled={controller.busy}
            >
              Cancelar programación
            </FooterButton>
          </>
        );
      case "failed":
        return (
          <FooterButton primary Icon={RefreshCw} onClick={controller.openSchedule}>
            Reintentar
          </FooterButton>
        );
      case "published":
        return (
          <>
            {card.postUrl && (
              <a
                href={card.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-3.5 font-display text-[13px] font-semibold text-primary-fg"
              >
                <ExternalLink size={15} aria-hidden="true" />
                Ver en la red
              </a>
            )}
            <FooterButton Icon={Repeat2} onClick={adapt}>
              Adaptar a otra red
            </FooterButton>
          </>
        );
      case "canceled":
        return null;
    }
  })();
  if (!buttons) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-3 pt-2.5 pb-3">
      {buttons}
    </div>
  );
}

function FooterButton({
  children,
  Icon,
  onClick,
  primary = false,
  danger = false,
  disabled = false,
}: {
  children: ReactNode;
  Icon: LucideIcon;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3.5 font-display text-[13px] font-semibold whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "bg-primary text-primary-fg"
          : danger
            ? "border border-line text-error hover:bg-error-bg"
            : "border border-line bg-card text-fg hover:bg-surface"
      }`}
    >
      <Icon size={15} aria-hidden="true" />
      {children}
    </button>
  );
}
