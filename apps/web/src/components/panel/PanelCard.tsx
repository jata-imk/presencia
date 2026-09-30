import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CalendarClock,
  Check,
  ExternalLink,
  Eye,
  ImageIcon,
  Link2,
  Lock,
  Monitor,
  Pencil,
  RefreshCw,
  Repeat2,
  Smartphone,
  Sparkles,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import {
  NETWORK_TEXT_LIMITS,
  buildPostText,
  trimToLimitInstruction,
  type CardStatus,
  type CardVersionDto,
  type ChannelAccountDto,
  type PublicationCardDto,
} from "@presencia/shared";
import { missingImageNote } from "../../lib/cards/card-image.js";
import { useCardController, type CardController } from "../../lib/cards/use-card-controller.js";
import { ApiError } from "../../lib/api.js";
import {
  cancelRewrite,
  fetchCardVersions,
  restoreCardVersion,
  rewriteCard,
} from "../../lib/cards-api.js";
import { cuotaAgotadaDe } from "../../lib/cuota-agotada.js";
import { NETWORK_LABELS } from "../../lib/network-labels.js";
import { useCardsByIds, useCardsStore } from "../../stores/cards-store.js";
import { useToastStore } from "../../stores/toast-store.js";
import { usePublicationPanelStore, type PanelMode } from "../../stores/publication-panel-store.js";
import { PublishedBanner, ScheduledBanner } from "../cards/Banner.js";
import { EmptyImageState, JobNotice, SelectedImage } from "../cards/CardMedia.js";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { NetworkPreview } from "../preview/NetworkPreview.js";
import type { PreviewAccount } from "../preview/PreviewParts.js";
import { QuotaExhaustedModal } from "../QuotaExhaustedModal.js";
import { AskBar } from "./AskBar.js";
import { ContentEditor, type SaveState } from "./ContentEditor.js";
import { Notice, Segmented, Section } from "./PanelParts.js";
import {
  CompareView,
  VersionsButton,
  VersionsMenu,
  ViewingBanner,
  versionAsContent,
} from "./Versions.js";

// El contenido del panel de publicación (F10.5, rd-panel.jsx → Panel): las
// pestañas de las cards abiertas, el conmutador Vista previa / Editar, el
// cuerpo y las acciones según el estado. Lee la card viva de cards-store, así
// que lo que cambie en otra parte (el worker termina la imagen, otra pestaña
// la programa) se ve aquí sin hacer nada.

const EDITABLE: CardStatus[] = ["draft", "failed"];

export function PanelCard({
  channels,
  onAdapt,
  mobile = false,
}: {
  /** Las cuentas conectadas; null mientras cargan. */
  channels: ChannelAccountDto[] | null;
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

  const applyCards = useCardsStore((s) => s.apply);
  const toast = useToastStore((s) => s.show);

  const editable = card ? EDITABLE.includes(card.status) : false;

  // Versiones del texto (F10.5 PR3). La lista se pide al abrir la card y al
  // abrir el menú; entre medio, lo que devuelve cada guardado basta para
  // saber en qué versión se va.
  const [versions, setVersions] = useState<CardVersionDto[] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [comparing, setComparing] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  // Restaurar remonta el editor: lo que se escriba después es otra sesión,
  // y el borrador arranca del texto restaurado.
  const [editorKey, setEditorKey] = useState(0);
  const flushEditor = useRef<(() => Promise<boolean>) | null>(null);
  const cardId = card?.id;

  const refreshVersions = useCallback(() => {
    if (!cardId) return;
    fetchCardVersions(cardId)
      .then(setVersions)
      .catch(() => {
        // Sin historial el panel sigue sirviendo; el menú dirá "Cargando…".
      });
  }, [cardId]);
  useEffect(() => refreshVersions(), [refreshVersions]);

  const onSaved = useCallback((version: CardVersionDto) => {
    setVersions((list) => {
      if (!list) return [version];
      const rest = list.filter((v) => v.n !== version.n);
      return [...rest, version].sort((a, b) => a.n - b.n);
    });
  }, []);

  const latest = versions?.at(-1)?.n ?? null;
  const viewed = viewing !== null ? versions?.find((v) => v.n === viewing) : undefined;
  const compared = comparing !== null ? versions?.find((v) => v.n === comparing) : undefined;
  const lookingBack = Boolean(viewed) || Boolean(compared);

  // Pedir un cambio a la IA (F10.5 PR4). Mientras reescribe, Editar se
  // apaga: lo que se escribiera a mano en ese rato lo pisaría el resultado.
  const [rewriting, setRewriting] = useState(false);
  const rewriteAbort = useRef<AbortController | null>(null);
  // El DELETE de "Detener" en vuelo: el siguiente pedido lo espera, o podría
  // llegar al servidor antes y chocar con el candado de la detenida.
  const cancelling = useRef<Promise<void> | null>(null);
  const effectiveMode: PanelMode = editable && !lookingBack && !rewriting ? mode : "preview";

  async function askAI(instruction: string) {
    if (!card || rewriting) return;
    // Lo que el editor tenga pendiente se guarda antes: la IA parte del texto
    // guardado, no del que el usuario acaba de escribir.
    if (flushEditor.current && !(await flushEditor.current())) {
      toast({
        title: "No se pudo pedir el cambio",
        description: "Tu último cambio no se guardó. Revísalo y vuelve a intentarlo.",
      });
      return;
    }
    await cancelling.current;
    const before = latest;
    const abort = new AbortController();
    rewriteAbort.current = abort;
    setRewriting(true);
    setViewing(null);
    setComparing(null);
    try {
      const result = await rewriteCard(card.id, instruction, abort.signal);
      applyCards(result.card);
      onSaved(result.version);
      setEditorKey((k) => k + 1);
      if (before !== null && result.version.n !== before) {
        // El resultado se ve como diff contra lo que había: así se nota qué
        // cambió sin tener que leerlo todo otra vez.
        setComparing(before);
        toast({
          title: `Ajustada por IA · Versión ${String(result.version.n)}`,
          tone: "success",
          onUndo: () => void restore(before),
        });
      } else {
        toast({
          title: "La IA dejó el borrador igual",
          description: "Prueba pedirlo de otra forma.",
        });
      }
    } catch (err) {
      const agotada = cuotaAgotadaDe(err);
      if (agotada) controller.showCuota(agotada);
      else if (abort.signal.aborted) {
        toast({ title: "Se detuvo la reescritura", description: "No se cobró nada." });
      } else {
        toast({
          title: "No se pudo pedir el cambio",
          description: err instanceof ApiError ? err.message : "Inténtalo de nuevo.",
        });
      }
    } finally {
      rewriteAbort.current = null;
      setRewriting(false);
    }
  }
  // Cambiar de pestaña o cerrar el panel NO la detiene: el resultado llega
  // igual a cards-store y queda como versión. Solo "Detener" la cancela.

  async function restore(n: number) {
    if (!card) return;
    setMenuOpen(false);
    // Lo que el editor tenga pendiente se guarda ANTES: si saliera después
    // (al remontarse el editor) pisaría la versión restaurada.
    if (flushEditor.current && !(await flushEditor.current())) {
      toast({
        title: "No se pudo restaurar esa versión",
        description: "Tu último cambio no se guardó. Revísalo y vuelve a intentarlo.",
      });
      return;
    }
    try {
      const result = await restoreCardVersion(card.id, n);
      applyCards(result.card);
      onSaved(result.version);
      setViewing(null);
      setComparing(null);
      setEditorKey((k) => k + 1);
      toast({
        title: `Restauraste la Versión ${String(n)}`,
        description: `Ahora es la Versión ${String(result.version.n)}. No se borró ninguna.`,
        tone: "success",
      });
    } catch (err) {
      toast({
        title: "No se pudo restaurar esa versión",
        description: err instanceof ApiError ? err.message : "Inténtalo de nuevo.",
      });
    }
  }

  // ⌘E / Ctrl+E alterna vista previa y edición (rd-main.jsx, tip del panel).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "e") return;
      if (!editable || lookingBack) return;
      e.preventDefault();
      setMode(effectiveMode === "edit" ? "preview" : "edit");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, lookingBack, effectiveMode, setMode]);

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

      <div className="relative flex h-[46px] shrink-0 items-center gap-2.5 border-b border-line px-3">
        <Segmented
          label="Modo del panel"
          value={effectiveMode}
          onChange={(m) => {
            setViewing(null);
            setComparing(null);
            setMode(m);
          }}
          options={[
            { value: "preview", label: "Vista previa", Icon: Eye },
            {
              value: "edit",
              label: "Editar",
              Icon: editable ? Pencil : Lock,
              disabled: !editable || rewriting,
              title: editable ? "Editar (Ctrl+E)" : "Solo se editan borradores",
            },
          ]}
        />
        {!mobile && <SaveIndicator state={saveState} latest={latest} />}
        <span className="flex-1" />
        {card && (
          <VersionsButton
            latest={latest}
            viewing={viewing}
            open={menuOpen}
            onToggle={() => {
              if (!menuOpen) refreshVersions();
              setMenuOpen(!menuOpen);
            }}
          />
        )}
        {menuOpen && card && (
          <VersionsMenu
            versions={versions}
            viewing={viewing}
            editable={editable}
            mobile={mobile}
            onView={(n) => {
              setComparing(null);
              setViewing(n === latest ? null : n);
              setMenuOpen(false);
            }}
            onCompare={(n) => {
              setViewing(null);
              setComparing(n);
              setMenuOpen(false);
            }}
            onRestore={(n) => void restore(n)}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!card ? (
          <p className="p-6 text-sm text-fg-muted">Cargando borrador…</p>
        ) : compared && latest !== null ? (
          <CompareView
            version={compared}
            latest={latest}
            current={card.content}
            network={card.network}
            editable={editable}
            onRestore={() => void restore(compared.n)}
            onClose={() => setComparing(null)}
          />
        ) : (
          <>
            <StatusBanner card={card} />
            {editable && !lookingBack && <FirstTimeTip />}
            {viewed && (
              <ViewingBanner
                version={viewed}
                editable={editable}
                onCompare={() => {
                  setComparing(viewed.n);
                  setViewing(null);
                }}
                onRestore={() => void restore(viewed.n)}
                onBack={() => setViewing(null)}
              />
            )}
            {effectiveMode === "preview" ? (
              <PreviewBody
                card={viewed ? { ...card, content: versionAsContent(viewed, card.content) } : card}
                controller={controller}
                account={account}
                // Mientras las cuentas cargan no se sabe si hay una: decir
                // "Conecta tu cuenta" ahí sería afirmar algo falso.
                missingAccount={channels !== null && account === null}
                onEditImage={() => setMode("edit")}
                rewriting={rewriting}
                onTrim={
                  editable && !viewed
                    ? () => void askAI(trimToLimitInstruction(NETWORK_TEXT_LIMITS[card.network]))
                    : undefined
                }
              />
            ) : (
              <EditBody
                card={card}
                controller={controller}
                editorKey={editorKey}
                onSaved={onSaved}
                onSaveState={setSaveState}
                flushRef={flushEditor}
              />
            )}
          </>
        )}
      </div>

      {card && editable && (
        <AskBar
          busy={rewriting}
          // Mirando una versión vieja no: el cambio se aplicaría a la actual,
          // no a la que se ve. Comparando sí, porque la actual está a la vista.
          disabled={Boolean(viewed)}
          mobile={mobile}
          onSubmit={(instruction) => void askAI(instruction)}
          onStop={() => {
            rewriteAbort.current?.abort();
            cancelling.current = cancelRewrite(card.id)
              .catch(() => {
                // Si no llega, el candado del servidor se suelta al terminar.
              })
              .finally(() => {
                cancelling.current = null;
              });
          }}
        />
      )}
      {card && <Footer card={card} controller={controller} onAdapt={onAdapt} />}
    </section>
  );
}

const TIP_KEY = "presencia.panel.tip";

/**
 * La primera vez que se abre el panel (nota de decisiones del diseño): un
 * solo tip descartable que presenta los dos flujos del panel. Se recuerda en
 * este navegador; si se pierde, lo peor es volver a verlo.
 */
function FirstTimeTip() {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(TIP_KEY) === "1";
    } catch {
      return true;
    }
  });
  if (seen) return null;
  return (
    <div className="flex items-start gap-2.5 border-b border-line bg-tint-plum px-4 py-2.5 text-[13px] leading-normal text-fg">
      <Sparkles size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
      <p className="flex-1">
        <b>Edita aquí o pídele un cambio a la IA:</b> todo queda en versiones. Ctrl+E alterna vista
        previa y edición.
      </p>
      <button
        type="button"
        onClick={() => {
          setSeen(true);
          try {
            localStorage.setItem(TIP_KEY, "1");
          } catch {
            // Sin almacenamiento, el tip solo vuelve a aparecer.
          }
        }}
        className="shrink-0 font-display text-xs font-semibold text-accent"
      >
        Entendido
      </button>
    </div>
  );
}

/** "Guardando…" / "Guardado · v4" / el error del último guardado. */
function SaveIndicator({ state, latest }: { state: SaveState; latest: number | null }) {
  if (state.kind === "idle") return null;
  if (state.kind === "error") {
    return (
      <span role="alert" className="truncate text-[11.5px] text-error" title={state.message}>
        {state.message}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] whitespace-nowrap text-fg-muted">
      {state.kind === "saving" ? (
        <>
          <span className="inline-block size-2.5 animate-spin rounded-full border-[1.5px] border-line border-t-fg-muted" />
          Guardando…
        </>
      ) : (
        <>
          <Check size={12} aria-hidden="true" />
          Guardado{latest !== null ? ` · v${String(latest)}` : ""}
        </>
      )}
    </span>
  );
}

/** La cuenta con la que se publicaría: la elegida al programar, o la conectada de esa red. */
function accountFor(
  card: PublicationCardDto | undefined,
  channels: ChannelAccountDto[] | null,
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
  rewriting,
  onTrim,
}: {
  card: PublicationCardDto;
  controller: CardController;
  account: PreviewAccount | null;
  missingAccount: boolean;
  onEditImage: () => void;
  /** La IA está reescribiendo: la vista previa late mientras tanto. */
  rewriting: boolean;
  /** "Recortar con IA" en el aviso de texto excedido; solo si se puede editar. */
  onTrim?: () => void;
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
          <Notice
            kind="error"
            Icon={AlertCircle}
            action={
              onTrim && !rewriting ? { label: "Recortar con IA", onClick: onTrim } : undefined
            }
          >
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
      <div
        className={`mx-auto w-full ${widthClass} ${rewriting ? "animate-pulse" : ""}`}
        aria-busy={rewriting}
      >
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

function EditBody({
  card,
  controller,
  editorKey,
  onSaved,
  onSaveState,
  flushRef,
}: {
  card: PublicationCardDto;
  controller: CardController;
  editorKey: number;
  onSaved: (version: CardVersionDto) => void;
  onSaveState: (state: SaveState) => void;
  flushRef: MutableRefObject<(() => Promise<boolean>) | null>;
}) {
  const { content, network } = card;
  const assetId = content.assetIds[0];
  const prompt = "imagePrompt" in content ? content.imagePrompt : undefined;

  return (
    <div>
      {content.archetype !== "video_script" && (
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
      <ContentEditor
        key={editorKey}
        card={card}
        onSaved={onSaved}
        onSaveState={onSaveState}
        flushRef={flushRef}
      />
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
