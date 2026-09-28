import { useId, useRef, useState, type ComponentType } from "react";
import {
  Copy,
  ImageOff,
  ImagePlus,
  Loader2,
  RefreshCw,
  Shuffle,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  ASSET_UPLOAD_MIME_TYPES,
  assetContentUrl,
  type CardImageJob,
  type ImageAspectRatio,
  type ImageProviderSlot,
} from "@presencia/shared";
import { useToastStore } from "../../stores/toast-store.js";

// La imagen de una card y lo que se puede hacer con ella (F10). Presentación
// pura: quién sube, quién genera y qué pasa después lo decide quien pasa
// `media`. Sin `media`, la card es de solo lectura (el modal "Ver" del
// Calendario, o una card ya programada) y estas piezas no ofrecen acciones.

export interface GenerateInput {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  provider: ImageProviderSlot;
}

export interface CardImageGeneration {
  generate: (input: GenerateInput) => void;
  /** Resuelve cuando la API respondió (bien o mal): la tira muestra la elección mientras tanto. */
  select: (assetId: string) => Promise<void>;
  /** El POST va en camino (el trabajo todavía no aparece en la card). */
  requesting: boolean;
  job: CardImageJob | null;
  /** Lo que cuesta un click, en % del mes. Nunca unidades (addendum ADR-012). */
  percent: number;
  alternateAvailable: boolean;
  /** Las proporciones de esta red; la primera es la default. */
  aspectOptions: readonly ImageAspectRatio[];
}

export interface CardMediaActions {
  upload: (file: File) => void;
  uploading: boolean;
  /** Ausente mientras no llega el precio: sin precio no se ofrece generar. */
  generation?: CardImageGeneration;
}

const ASPECT_CLASS: Record<ImageAspectRatio, string> = {
  "1:1": "aspect-square max-w-[420px]",
  "4:5": "aspect-[4/5] max-w-[380px]",
  "16:9": "aspect-video max-w-full",
};

function isBusy(generation: CardImageGeneration | undefined): boolean {
  return Boolean(generation && (generation.requesting || generation.job?.status === "generating"));
}

function priceLabel(percent: number): string {
  return `${percent.toLocaleString("es-MX", { maximumFractionDigits: 1 })}% de tu mes`;
}

/**
 * La imagen elegida, en su proporción real: una foto subida no tiene por qué
 * ser 4:5. Si no carga (la URL firmada venció a media sesión, el asset ya no
 * está), un aviso en vez del ícono roto del navegador. Quien la usa le pone
 * `key={assetId}`: una imagen nueva vuelve a intentar, no hereda el fallo.
 */
export function CardImage({ assetId, alt }: { assetId: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-line bg-app px-3.5 py-3 text-xs text-fg-secondary">
        <ImageOff size={16} strokeWidth={1.5} />
        No pudimos cargar la imagen. Recarga la página para intentarlo de nuevo.
      </div>
    );
  }
  return (
    <img
      src={assetContentUrl(assetId)}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="mx-auto block h-auto max-h-[80vh] w-auto max-w-full rounded-lg"
    />
  );
}

/** El hueco de la imagen mientras el generador trabaja (mock A4, "Generando imagen…"). */
export function GeneratingImage({ aspectRatio }: { aspectRatio: ImageAspectRatio }) {
  return (
    <div
      role="status"
      className={`mx-auto flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-ai-border bg-ai-bg px-4 text-center ${ASPECT_CLASS[aspectRatio]}`}
    >
      <Loader2 className="animate-spin text-accent" size={24} strokeWidth={1.75} />
      <p className="text-sm font-semibold text-fg">Generando imagen…</p>
      <p className="text-xs text-fg-secondary">
        Tarda entre 10 y 60 segundos. Puedes seguir en el chat.
      </p>
    </div>
  );
}

/** Cómo terminó el último intento, cuando no salió ninguna imagen. Nunca se cobra. */
export function JobNotice({ job }: { job: CardImageJob | null }) {
  if (job?.status === "blocked") {
    return (
      <p className="rounded-lg border border-warning-border bg-warning-bg px-3.5 py-2.5 text-left text-xs text-warning-fg">
        No pude crear esta imagen: el generador no permite personas reales, logos ni marcas. Prueba
        describirla de otra forma. No se cobró.
      </p>
    );
  }
  if (job?.status === "failed") {
    return (
      <p className="rounded-lg border border-error-border bg-error-bg px-3.5 py-2.5 text-left text-xs text-error">
        No se pudo generar la imagen. No se cobró; inténtalo de nuevo.
      </p>
    );
  }
  return null;
}

/** El prompt sugerido, con "Copiar" para generarla afuera (modo 2 del dual de F10). */
export function ImagePromptBox({ prompt, copyable }: { prompt: string; copyable: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-tint-plum px-3.5 py-3 text-left">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-fg">Prompt de imagen</p>
        {copyable && <CopyPromptButton prompt={prompt} />}
      </div>
      <p className="text-xs text-fg-secondary">{prompt}</p>
    </div>
  );
}

function CopyPromptButton({ prompt }: { prompt: string }) {
  const toast = useToastStore((s) => s.show);
  return (
    <button
      type="button"
      disabled={prompt.trim().length === 0}
      onClick={() => {
        void navigator.clipboard.writeText(prompt).then(() => {
          toast({
            title: "Prompt copiado",
            description: "Úsalo en tu generador y sube el resultado.",
          });
        });
      }}
      className="flex items-center gap-1 text-xs font-medium text-accent disabled:opacity-50"
    >
      <Copy size={12} strokeWidth={1.75} />
      Copiar
    </button>
  );
}

function ActionButton({
  Icon,
  label,
  onClick,
  disabled,
  primary,
  spinning,
}: {
  Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  spinning?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 ${
        primary
          ? "bg-primary font-semibold text-primary-fg"
          : "border border-line bg-card font-medium text-fg-secondary"
      }`}
    >
      <Icon size={13} strokeWidth={primary ? 2 : 1.75} className={spinning ? "animate-spin" : ""} />
      {label}
    </button>
  );
}

/**
 * El botón de subir, con su input de archivo escondido. El `accept` es una
 * ayuda del selector, no un control: la validación real la hace quien recibe
 * el archivo, y la API después.
 */
export function UploadImageButton({
  media,
  label,
  primary,
}: {
  media: CardMediaActions;
  label: string;
  primary?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ASSET_UPLOAD_MIME_TYPES.join(",")}
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Se limpia para que elegir el MISMO archivo otra vez vuelva a disparar.
          event.target.value = "";
          if (file) media.upload(file);
        }}
      />
      <ActionButton
        Icon={media.uploading ? Loader2 : Upload}
        label={media.uploading ? "Subiendo…" : label}
        onClick={() => input.current?.click()}
        disabled={media.uploading || isBusy(media.generation)}
        spinning={media.uploading}
        primary={primary}
      />
    </>
  );
}

/**
 * Las dos variantes del último "Generar", para elegir (mock A8). Solo cuando
 * salió más de una: con una sola no hay nada que elegir.
 */
export function VariantStrip({
  generation,
  selectedId,
  onPick,
}: {
  generation: CardImageGeneration;
  selectedId: string | undefined;
  onPick: (assetId: string) => void;
}) {
  const { job } = generation;
  if (job?.status !== "done" || job.assetIds.length < 2) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
        Elige una
      </span>
      {job.assetIds.map((id, index) => {
        const selected = id === selectedId;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            aria-label={`Variante ${String(index + 1)}${selected ? " (elegida)" : ""}`}
            onClick={() => {
              if (!selected) onPick(id);
            }}
            className={`size-14 overflow-hidden rounded-md border-2 ${
              selected ? "border-primary" : "border-line"
            }`}
          >
            <img src={assetContentUrl(id)} alt="" className="size-full object-cover" />
          </button>
        );
      })}
    </div>
  );
}

/** La franja "IMAGEN" del mock (arquetipos.jsx): las acciones sobre una imagen que ya está. */
export function ImageActionStrip({
  media,
  prompt,
  aspectRatio,
}: {
  media: CardMediaActions;
  /** El prompt con que se regenera: el de la card. Sin él, no se ofrece regenerar. */
  prompt: string | undefined;
  aspectRatio: ImageAspectRatio | undefined;
}) {
  const { generation } = media;
  const busy = isBusy(generation);
  const canRegenerate = generation && prompt && aspectRatio;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
        Imagen
      </span>
      {canRegenerate && (
        <ActionButton
          Icon={RefreshCw}
          label="Regenerar"
          disabled={busy}
          onClick={() => generation.generate({ prompt, aspectRatio, provider: "primary" })}
        />
      )}
      {canRegenerate && generation.alternateAvailable && (
        <ActionButton
          Icon={Shuffle}
          label="Probar con otro generador"
          disabled={busy}
          onClick={() => generation.generate({ prompt, aspectRatio, provider: "alternate" })}
        />
      )}
      <UploadImageButton media={media} label="Subir otra" />
      {canRegenerate && (
        <span className="text-[11px] text-fg-muted">
          Regenerar: {priceLabel(generation.percent)}
        </span>
      )}
    </div>
  );
}

/**
 * Sin imagen: el prompt (editable si se puede generar), la proporción y los
 * dos caminos — generarla aquí, con su precio a la vista antes del click, o
 * traerla de afuera sin costo. Nunca se genera sola (consumo intencional).
 */
function ImageComposer({
  media,
  generation,
  initialPrompt,
}: {
  media: CardMediaActions;
  generation: CardImageGeneration;
  initialPrompt: string;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>(
    generation.job?.aspectRatio && generation.aspectOptions.includes(generation.job.aspectRatio)
      ? generation.job.aspectRatio
      : generation.aspectOptions[0]!,
  );
  const busy = isBusy(generation);
  const ready = prompt.trim().length >= 3;
  const promptId = useId();

  return (
    <div className="flex w-full flex-col gap-2.5 text-left">
      <div className="rounded-lg border border-line bg-tint-plum px-3.5 py-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label htmlFor={promptId} className="text-xs font-semibold text-fg">
            Prompt de imagen
          </label>
          <CopyPromptButton prompt={prompt} />
        </div>
        <textarea
          id={promptId}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Describe la imagen que quieres: qué se ve, dónde, con qué luz."
          className="w-full resize-y rounded-md border border-line bg-card px-2.5 py-2 text-xs text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
      </div>
      {generation.aspectOptions.length > 1 && (
        <div role="radiogroup" aria-label="Proporción" className="flex items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
            Formato
          </span>
          {generation.aspectOptions.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === aspectRatio}
              onClick={() => setAspectRatio(option)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                option === aspectRatio
                  ? "border-primary bg-primary text-primary-fg"
                  : "border-line bg-card text-fg-secondary"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <ActionButton
          Icon={generation.requesting ? Loader2 : Sparkles}
          spinning={generation.requesting}
          label={`Generar imagen · ${priceLabel(generation.percent)}`}
          primary
          disabled={busy || !ready}
          onClick={() =>
            generation.generate({ prompt: prompt.trim(), aspectRatio, provider: "primary" })
          }
        />
        {generation.alternateAvailable && (
          <ActionButton
            Icon={Shuffle}
            label="Con otro generador"
            disabled={busy || !ready}
            onClick={() =>
              generation.generate({ prompt: prompt.trim(), aspectRatio, provider: "alternate" })
            }
          />
        )}
        <UploadImageButton media={media} label="Subir la mía" />
      </div>
      <p className="text-[11px] text-fg-muted">
        Genera dos opciones para que elijas. Si prefieres hacerla afuera, copia el prompt y sube el
        resultado: eso no tiene costo.
      </p>
    </div>
  );
}

/** Sin imagen todavía: qué pasa si no se agrega una, y cómo agregarla. */
export function EmptyImageState({
  note,
  prompt,
  media,
}: {
  note: string;
  prompt?: string;
  media?: CardMediaActions;
}) {
  const generation = media?.generation;
  if (generation?.job?.status === "generating") {
    return <GeneratingImage aspectRatio={generation.job.aspectRatio} />;
  }
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-ai-border bg-ai-bg px-4 py-6 text-center">
      <ImagePlus className="text-accent" size={26} strokeWidth={1.5} />
      <p className="text-sm font-semibold text-fg">Esperando imagen</p>
      <p className="text-xs text-fg-secondary">{note}</p>
      {generation && <JobNotice job={generation.job} />}
      {media && generation ? (
        <div className="mt-1 w-full">
          <ImageComposer media={media} generation={generation} initialPrompt={prompt ?? ""} />
        </div>
      ) : (
        <>
          {prompt && (
            <div className="mt-1 w-full">
              <ImagePromptBox prompt={prompt} copyable={Boolean(media)} />
            </div>
          )}
          {media && (
            <div className="mt-1">
              <UploadImageButton media={media} label="Subir imagen" primary />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * La imagen elegida con todo lo de alrededor: el hueco de "generando" encima
 * cuando se está regenerando, el aviso si el último intento no salió, las
 * variantes y la franja de acciones. Compartido por el cuerpo visual y el de
 * texto, que solo difieren en dónde la ponen.
 */
export function SelectedImage({
  assetId,
  alt,
  prompt,
  media,
}: {
  assetId: string;
  alt: string;
  prompt: string | undefined;
  media?: CardMediaActions;
}) {
  const generation = media?.generation;
  const job = generation?.job ?? null;
  // Elegir una variante se ve al instante, sin esperar a la API (en dev, con
  // la base del otro lado de un túnel, la respuesta tarda segundos y el clic
  // parecía no hacer nada). Si la API la rechaza, vuelve a la que había.
  const [picked, setPicked] = useState<string | null>(null);
  const shown = picked ?? assetId;
  function pick(id: string) {
    if (!generation) return;
    setPicked(id);
    void generation.select(id).finally(() => setPicked(null));
  }
  return (
    <>
      {job?.status === "generating" ? (
        <GeneratingImage aspectRatio={job.aspectRatio} />
      ) : (
        <CardImage key={shown} assetId={shown} alt={alt} />
      )}
      {(job?.status === "failed" || job?.status === "blocked") && (
        <div className="mt-2">
          <JobNotice job={job} />
        </div>
      )}
      {generation && <VariantStrip generation={generation} selectedId={shown} onPick={pick} />}
      {media && (
        <ImageActionStrip
          media={media}
          prompt={prompt}
          aspectRatio={job?.aspectRatio ?? generation?.aspectOptions[0]}
        />
      )}
    </>
  );
}
