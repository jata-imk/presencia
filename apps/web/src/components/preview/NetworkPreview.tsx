import {
  Bookmark,
  Globe,
  Heart,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Repeat,
  Repeat2,
  Send,
  Share,
  Share2,
  ThumbsUp,
  Video,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  NETWORK_TEXT_LIMITS,
  buildPostText,
  type CardContent,
  type CardImageJob,
  type SocialNetwork,
} from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { mediaAspect, mediaItems, PreviewMedia } from "./PreviewMedia.js";
import {
  MissingImage,
  PostText,
  PreviewAvatar,
  Truncated,
  accountName,
  type PreviewAccount,
} from "./PreviewParts.js";

// Vista previa fiel por red (F10.5, rd-preview.jsx): así se verá el post al
// publicarse. Fiel en estructura —dónde corta el texto, dónde va la imagen,
// qué botones hay— pero con los colores de la app (tokens), no los de cada
// red: reproducir cada paleta a mano es mantener siete temas que nadie pidió.
// Los botones de la red son decoración (no hacen nada) y no hay métricas.

export interface NetworkPreviewProps {
  network: SocialNetwork;
  content: CardContent;
  account: PreviewAccount | null;
  imageJob: CardImageJob | null;
  /** Solo LinkedIn cambia de ancho entre móvil y escritorio. */
  device?: "mobile" | "desktop";
}

export function NetworkPreview(props: NetworkPreviewProps) {
  if (props.content.archetype === "video_script") {
    return <ScriptPreview network={props.network} content={props.content} />;
  }
  switch (props.network) {
    case "instagram":
      return <InstagramPreview {...props} />;
    case "facebook":
      return <FacebookPreview {...props} />;
    case "linkedin":
      return <LinkedInPreview {...props} />;
    case "x":
      return <XPreview {...props} />;
    default:
      return <ThreadsPreview {...props} />;
  }
}

const TAG = "text-info";
const MORE = "text-fg-muted hover:underline";

function Frame({ children, radius = "rounded-xl" }: { children: ReactNode; radius?: string }) {
  return (
    <article className={`overflow-hidden border border-line bg-card text-fg ${radius}`}>
      {children}
    </article>
  );
}

function Header({
  account,
  size,
  sub,
  ring,
}: {
  account: PreviewAccount | null;
  size: number;
  sub?: ReactNode;
  ring?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <PreviewAvatar account={account} size={size} ring={ring} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[13.5px] font-bold">{accountName(account)}</p>
        {sub && <p className="text-xs text-fg-muted">{sub}</p>}
      </div>
      <MoreHorizontal size={18} className="text-fg-muted" aria-hidden="true" />
    </div>
  );
}

function InstagramPreview({ content, account, imageJob }: NetworkPreviewProps) {
  const text = buildPostText(content);
  const items = mediaItems(content);
  return (
    <Frame>
      <div className="px-3 py-2.5">
        <Header account={account} size={30} ring />
      </div>
      {items.length > 0 || imageJob?.status === "generating" ? (
        <PreviewMedia
          items={items}
          job={imageJob}
          layout="carousel"
          aspect={mediaAspect(content)}
        />
      ) : (
        <MissingImage />
      )}
      <div className="flex items-center gap-3.5 px-3 pt-2.5 pb-1.5" aria-hidden="true">
        <Heart size={22} />
        <MessageCircle size={22} />
        <Send size={21} />
        <span className="flex-1" />
        <Bookmark size={21} />
      </div>
      <p className="px-3 pb-3 text-[13px] leading-[1.45] whitespace-pre-line">
        <b>{accountName(account)}</b>{" "}
        <Truncated
          text={text}
          limit={125}
          more="más"
          moreClassName={MORE}
          render={(t) => <PostText text={t} tagClassName={TAG} />}
        />
      </p>
    </Frame>
  );
}

function FacebookPreview({ content, account, imageJob }: NetworkPreviewProps) {
  const text = buildPostText(content);
  return (
    <Frame>
      <div className="px-3.5 pt-3 pb-2">
        <Header
          account={account}
          size={40}
          sub={
            <span className="inline-flex items-center gap-1">
              Ahora · <Globe size={11} aria-hidden="true" />
            </span>
          }
        />
      </div>
      <p className="px-3.5 pb-3 text-[14.5px] leading-[1.45] whitespace-pre-line">
        <Truncated
          text={text}
          limit={260}
          more="Ver más"
          moreClassName="font-semibold text-fg-muted hover:underline"
          render={(t) => <PostText text={t} tagClassName={TAG} />}
        />
      </p>
      <PreviewMedia items={mediaItems(content)} job={imageJob} layout="grid" />
      <ActionRow
        items={[
          [ThumbsUp, "Me gusta"],
          [MessageCircle, "Comentar"],
          [Share2, "Compartir"],
        ]}
      />
    </Frame>
  );
}

function LinkedInPreview({ content, account, imageJob, device = "mobile" }: NetworkPreviewProps) {
  const text = buildPostText(content);
  const desktop = device === "desktop";
  return (
    <div className={`mx-auto ${desktop ? "max-w-[555px]" : "max-w-[380px]"}`}>
      <Frame radius="rounded-lg">
        <div className="px-3.5 pt-3 pb-2">
          <Header
            account={account}
            size={desktop ? 48 : 40}
            sub={
              <span className="inline-flex items-center gap-1">
                Ahora · <Globe size={10} aria-hidden="true" />
              </span>
            }
          />
        </div>
        <p
          className={`px-3.5 pb-2.5 leading-[1.45] whitespace-pre-line ${desktop ? "text-sm" : "text-[13.5px]"}`}
        >
          <Truncated
            text={text}
            limit={desktop ? 210 : 140}
            more="ver más"
            moreClassName={MORE}
            render={(t) => <PostText text={t} tagClassName={TAG} />}
          />
        </p>
        <PreviewMedia items={mediaItems(content)} job={imageJob} layout="grid" />
        <ActionRow
          items={[
            [ThumbsUp, "Recomendar"],
            [MessageSquare, "Comentar"],
            [Repeat, "Compartir"],
            [Send, "Enviar"],
          ]}
          hideLabels={!desktop}
        />
      </Frame>
    </div>
  );
}

function XPreview({ content, account, imageJob }: NetworkPreviewProps) {
  const text = buildPostText(content);
  const limit = NETWORK_TEXT_LIMITS.x;
  const over = text.length - limit;
  return (
    <Frame radius="rounded-2xl">
      <div className="flex gap-2.5 px-3.5 py-3">
        <PreviewAvatar account={account} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px]">
            <b>{accountName(account)}</b> <span className="text-fg-muted">· ahora</span>
          </p>
          <p className="mt-0.5 text-[14.5px] leading-[1.45] whitespace-pre-line">
            <PostText text={text.slice(0, limit)} tagClassName={TAG} />
            {over > 0 && (
              // Lo que X no publicaría, resaltado: se ve exactamente qué sobra.
              <mark className="rounded-sm bg-error-bg text-error">{text.slice(limit)}</mark>
            )}
          </p>
          {(content.assetIds[0] || imageJob?.status === "generating") &&
            (content.assetIds.length > 1 ? (
              // Varias: el mosaico trae su propio marco.
              <div className="mt-2.5">
                <PreviewMedia items={mediaItems(content)} job={imageJob} layout="mosaic" />
              </div>
            ) : (
              <div className="mt-2.5 overflow-hidden rounded-2xl border border-line">
                <PreviewMedia items={mediaItems(content)} job={imageJob} layout="mosaic" />
              </div>
            ))}
          <div className="mt-2.5 flex items-center justify-between text-fg-muted">
            <span className="contents" aria-hidden="true">
              <MessageCircle size={17} />
              <Repeat2 size={17} />
              <Heart size={17} />
              <Bookmark size={17} />
              <Share size={17} />
            </span>
            <CharRing used={text.length} limit={limit} />
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** El anillo de caracteres del compositor de X, con lo que sobra en rojo. */
function CharRing({ used, limit }: { used: number; limit: number }) {
  const left = limit - used;
  const pct = Math.min(used / limit, 1);
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${left < 0 ? "text-error" : "text-fg-muted"}`}
      aria-label={
        left < 0 ? `${String(-left)} caracteres de más` : `${String(left)} caracteres disponibles`
      }
    >
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="-rotate-90">
        <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2" className="stroke-line" />
        <circle
          cx="10"
          cy="10"
          r={r}
          fill="none"
          strokeWidth="2"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={left < 0 ? "stroke-error" : left <= 20 ? "stroke-warning" : "stroke-info"}
        />
      </svg>
      {left <= 20 && String(left)}
    </span>
  );
}

function ThreadsPreview({ content, account, imageJob }: NetworkPreviewProps) {
  const text = buildPostText(content);
  const hasImage = content.assetIds[0] || imageJob?.status === "generating";
  return (
    <Frame radius="rounded-2xl">
      <div className="flex gap-2.5 px-3.5 py-3">
        <PreviewAvatar account={account} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <b>{accountName(account)}</b> <span className="text-fg-muted">ahora</span>
          </p>
          <p className="mt-0.5 text-[14.5px] leading-[1.45] whitespace-pre-line">
            <PostText text={text} tagClassName={TAG} />
          </p>
          {hasImage &&
            (content.assetIds.length > 1 ? (
              // Varias: la tira ocupa el ancho y se desliza.
              <div className="mt-2.5">
                <PreviewMedia items={mediaItems(content)} job={imageJob} layout="strip" />
              </div>
            ) : (
              <div className="mt-2.5 w-[62%] overflow-hidden rounded-xl">
                <PreviewMedia items={mediaItems(content)} job={imageJob} layout="strip" />
              </div>
            ))}
          <div className="mt-2.5 flex gap-4.5" aria-hidden="true">
            <Heart size={19} />
            <MessageCircle size={19} />
            <Repeat size={19} />
            <Send size={19} />
          </div>
        </div>
      </div>
    </Frame>
  );
}

type VideoContent = Extract<CardContent, { archetype: "video_script" }>;

/**
 * Un guion no tiene vista previa de red: el video todavía no existe. Se ve
 * como lo que es, el guion listo para grabar.
 */
function ScriptPreview({ network, content }: { network: SocialNetwork; content: VideoContent }) {
  const { Logo, label } = NETWORK_META[network];
  return (
    <Frame>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
        <span className="inline-flex size-10 items-center justify-center rounded-lg bg-surface">
          <Logo size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-bold">Guion listo · esperando tu video</p>
          <p className="text-xs text-fg-muted">{label} · vertical 9:16</p>
        </div>
      </div>
      <div className="flex flex-col gap-3.5 px-4 py-3.5">
        <div>
          <p className="mb-1.5 font-display text-[10.5px] font-bold tracking-[0.08em] text-fg-muted">
            HOOK · PRIMEROS 3 SEGUNDOS
          </p>
          <p className="font-display text-[17px] leading-snug font-semibold">“{content.hook}”</p>
        </div>
        <div>
          <p className="mb-1.5 font-display text-[10.5px] font-bold tracking-[0.08em] text-fg-muted">
            GUION
          </p>
          <p className="text-[13.5px] leading-relaxed whitespace-pre-line">{content.script}</p>
        </div>
        {content.recordingNotes && (
          <div className="flex gap-2 rounded-lg bg-surface px-3 py-2.5 text-[13px] text-fg-secondary">
            <Video size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>{content.recordingNotes}</p>
          </div>
        )}
        <div>
          <p className="mb-1.5 font-display text-[10.5px] font-bold tracking-[0.08em] text-fg-muted">
            DESCRIPCIÓN
          </p>
          <p className="text-[13.5px] leading-relaxed whitespace-pre-line">
            <PostText
              text={
                content.hashtags.length > 0
                  ? `${content.caption}\n\n${content.hashtags.map((t) => `#${t}`).join(" ")}`
                  : content.caption
              }
              tagClassName={TAG}
            />
          </p>
        </div>
      </div>
    </Frame>
  );
}

function ActionRow({
  items,
  hideLabels = false,
}: {
  items: [typeof ThumbsUp, string][];
  hideLabels?: boolean;
}) {
  return (
    <div
      className="mx-2.5 flex border-t border-line py-1 text-[13.5px] font-semibold text-fg-muted"
      aria-hidden="true"
    >
      {items.map(([Icon, label]) => (
        <span key={label} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5">
          <Icon size={17} />
          {!hideLabels && label}
        </span>
      ))}
    </div>
  );
}
