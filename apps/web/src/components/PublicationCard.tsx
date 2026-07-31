import type { CardToolPart } from "../lib/chat-types.js";

const ARCHETYPE_LABEL: Record<string, string> = {
  "tool-crear_borrador_visual": "Post visual",
  "tool-crear_borrador_video": "Guion de video",
  "tool-crear_borrador_texto": "Post de texto",
};

export function PublicationCard({ part }: { part: CardToolPart }) {
  const label = ARCHETYPE_LABEL[part.type] ?? "Borrador";

  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="rounded-lg border border-line-subtle bg-card p-3 text-sm text-fg-muted">
        Generando {label.toLowerCase()}…
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="rounded-lg border border-line-subtle bg-error-bg p-3 text-sm text-error">
        No se pudo crear el borrador: {part.errorText}
      </div>
    );
  }

  if (part.state !== "output-available") return null;

  const { content, network } = part.output;

  // Mensajes persistidos antes de que la tool devolviera `content` (previo
  // a F3 PR3) traen output sin ese campo — sin este guard, truena al leer
  // content.archetype en vez de mostrar algo legible.
  if (!content) {
    return (
      <div className="rounded-lg border border-line-subtle bg-card p-3 text-sm text-fg-muted">
        Borrador creado con una versión anterior — ábrelo en tu Biblioteca para verlo.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-secondary uppercase">{label}</span>
        <span className="rounded-sm bg-tint-plum px-2 py-0.5 text-xs text-fg-secondary">
          {network}
        </span>
      </div>
      {content.archetype === "visual_first" && (
        <>
          <p className="whitespace-pre-wrap text-fg">{content.caption}</p>
          {content.imagePrompt && (
            <p className="mt-2 text-xs text-fg-muted">Prompt de imagen: {content.imagePrompt}</p>
          )}
          <Hashtags tags={content.hashtags} />
        </>
      )}
      {content.archetype === "video_script" && (
        <>
          <p className="font-semibold text-fg">{content.hook}</p>
          <p className="mt-1 whitespace-pre-wrap text-fg">{content.script}</p>
          <p className="mt-2 text-sm text-fg-secondary">{content.caption}</p>
          {content.recordingNotes && (
            <p className="mt-2 text-xs text-fg-muted">
              Notas de grabación: {content.recordingNotes}
            </p>
          )}
          <Hashtags tags={content.hashtags} />
        </>
      )}
      {content.archetype === "text_first" && (
        <>
          <p className="whitespace-pre-wrap text-fg">{content.body}</p>
          <Hashtags tags={content.hashtags} />
        </>
      )}
    </div>
  );
}

function Hashtags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return <p className="mt-2 text-xs text-brand">{tags.map((t) => `#${t}`).join(" ")}</p>;
}
