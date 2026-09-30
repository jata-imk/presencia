import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import {
  Copy,
  ImageOff,
  ImagePlus,
  Loader2,
  Pencil,
  RefreshCw,
  Shuffle,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import {
  ASSET_UPLOAD_MIME_TYPES,
  assetContentUrl,
  IMAGE_EDIT_SUGGESTIONS,
  type CardImageJob,
  type CardImageVersionDto,
  type ImageAspectRatio,
  type ImageProviderSlot,
  type ImageStyle,
} from "@presencia/shared";
import { useToastStore } from "../../stores/toast-store.js";
import { StyleChip } from "./StyleChip.js";

// La imagen de una card y lo que se puede hacer con ella (F10). Presentación
// pura: quién sube, quién genera y qué pasa después lo decide quien pasa
// `media`. Sin `media`, la card es de solo lectura (el modal "Ver" del
// Calendario, o una card ya programada) y estas piezas no ofrecen acciones.

export interface GenerateInput {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  provider: ImageProviderSlot;
  /** F10.6: siempre explícito, el del chip; así el trabajo guarda el que se vio. */
  style: ImageStyle;
}

export interface CardImageGeneration {
  /** Resuelve `true` si la API aceptó el pedido (la card quedó generando). */
  generate: (input: GenerateInput) => Promise<boolean>;
  /** Resuelve cuando la API respondió (bien o mal): la tira muestra la elección mientras tanto. */
  select: (assetId: string) => Promise<void>;
  /** El POST va en camino (el trabajo todavía no aparece en la card). */
  requesting: boolean;
  job: CardImageJob | null;
  /** Lo que cuesta un click, en % del mes. Nunca unidades (addendum ADR-012). */
  percent: number;
  alternateAvailable: boolean;
  /** F10.6: el estilo de la Voz de marca; el chip arranca en él si la card no tiene trabajo. */
  defaultStyle: ImageStyle;
  /** Las proporciones de esta red; la primera es la default. */
  aspectOptions: readonly ImageAspectRatio[];
  /** "Más cálida", "sin gente": edita la imagen elegida (una imagen). */
  edit: (instruction: string, provider: ImageProviderSlot) => void;
  /** Lo que cuesta una edición, en % del mes. */
  editPercent: number;
  /** Todas las imágenes que tuvo la card, de la más vieja a la más nueva. */
  versions: CardImageVersionDto[];
  updateAlt: (assetId: string, alt: string) => Promise<void>;
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

/**
 * Con qué estilo arranca el chip: el del último trabajo de la card (así
 * "Regenerar" repite el de la imagen aunque el default cambie) o el de la voz.
 * Una edición no guarda estilo y cae al de la voz.
 */
function initialStyle(generation: CardImageGeneration): ImageStyle {
  return generation.job?.style ?? generation.defaultStyle;
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
        El generador se negó a crear esta imagen (suele pasar con personas reales o contenido
        sensible). Prueba describirla de otra forma. No se cobró.
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

/** Cómo se llama una versión en la tira: lo que se pidió, o de dónde salió. */
function versionLabel(version: CardImageVersionDto, index: number): string {
  if (version.source === "uploaded") return "Subida por ti";
  if (version.kind === "edit" && version.instruction) return version.instruction;
  return `Generada ${String(index + 1)}`;
}

/**
 * Todas las imágenes que tuvo la card (mock A8: las miniaturas bajo la
 * imagen), de la más vieja a la más nueva: las dos variantes de cada
 * "Generar", las ediciones y las subidas. Tocar una la vuelve la elegida. Es
 * una fila de botones con scroll horizontal: con teclado se recorre con Tab,
 * y el que recibe el foco se trae a la vista.
 */
export function VersionStrip({
  versions,
  selectedId,
  onPick,
  disabled,
}: {
  versions: CardImageVersionDto[];
  selectedId: string | undefined;
  onPick: (assetId: string) => void;
  disabled: boolean;
}) {
  // La elegida suele ser la más nueva, al final de la fila: en móvil quedaba
  // fuera de la vista. Se trae con el scroll de la fila y no con
  // scrollIntoView, que también movería la página.
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = row.current;
    const button = container?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!container || !button) return;
    const left = button.offsetLeft - container.offsetLeft;
    if (
      left < container.scrollLeft ||
      left + button.offsetWidth > container.scrollLeft + container.clientWidth
    ) {
      container.scrollLeft = left + button.offsetWidth - container.clientWidth;
    }
  }, [selectedId, versions.length]);
  if (versions.length < 2) return null;
  return (
    <div className="mt-2.5">
      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
        Versiones · {versions.length}
      </p>
      <div ref={row} className="flex gap-2 overflow-x-auto pb-1">
        {versions.map((version, index) => {
          const selected = version.assetId === selectedId;
          const label = versionLabel(version, index);
          return (
            <button
              key={version.assetId}
              type="button"
              title={label}
              aria-pressed={selected}
              aria-label={`${label}${selected ? " (elegida)" : ""}`}
              disabled={disabled}
              onFocus={(event) =>
                event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })
              }
              onClick={() => {
                if (!selected) onPick(version.assetId);
              }}
              className={`size-14 shrink-0 overflow-hidden rounded-md border-2 disabled:opacity-60 ${
                selected ? "border-primary" : "border-line"
              }`}
            >
              <img
                src={assetContentUrl(version.assetId)}
                alt=""
                className="size-full object-cover"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Ajustar la imagen elegida sin empezar de cero (plan F10, decisión 3):
 * atajos para lo más común y texto libre para lo demás, con el precio a la
 * vista. Cada ajuste es una imagen nueva que queda en el historial.
 */
function AdjustBar({
  generation,
  assetId,
  selecting,
}: {
  generation: CardImageGeneration;
  /** La imagen elegida: sobre la que se aplica el ajuste. Se muestra para que no haya duda. */
  assetId: string;
  /**
   * Hay una elección de versión guardándose: la miniatura ya muestra la nueva,
   * pero el servidor todavía tiene la anterior, y un ajuste ahora editaría la
   * que NO se ve. Se apaga hasta que la elección se confirma.
   */
  selecting: boolean;
}) {
  const [instruction, setInstruction] = useState("");
  const busy = isBusy(generation) || selecting;
  const inputId = useId();
  function apply(text: string) {
    if (text.trim().length < 3) return;
    generation.edit(text.trim(), "primary");
    setInstruction("");
  }
  return (
    <div className="mt-2.5 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <img
          src={assetContentUrl(assetId)}
          alt=""
          className="size-8 shrink-0 rounded border border-line object-cover"
        />
        <span className="text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
          Ajustar esta imagen
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {IMAGE_EDIT_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.label}
            type="button"
            disabled={busy}
            onClick={() => apply(suggestion.instruction)}
            className="rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-fg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {suggestion.label}
          </button>
        ))}
      </div>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          apply(instruction);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Pide un cambio a la imagen
        </label>
        <input
          id={inputId}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          maxLength={500}
          placeholder="Pide un cambio: otro fondo, más luz, sin la taza…"
          className="min-w-0 flex-1 rounded-md border border-line bg-card px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || instruction.trim().length < 3}
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-fg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Wand2 size={13} strokeWidth={1.75} />
          Aplicar
        </button>
      </form>
      <p className="text-[11px] text-fg-muted">
        Cada ajuste: {priceLabel(generation.editPercent)}. La imagen de antes se queda en tus
        versiones.
      </p>
    </div>
  );
}

/**
 * El texto alternativo de la imagen elegida: lo que lee un lector de
 * pantalla. Las generadas nacen con la descripción que se pidió; las subidas,
 * vacías hasta que el usuario lo escriba.
 */
function AltTextEditor({
  assetId,
  initial,
  generation,
}: {
  assetId: string;
  initial: string;
  generation: CardImageGeneration;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const inputId = useId();
  const dirty = value.trim() !== initial.trim();
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-fg-muted">Texto alternativo</summary>
      <form
        className="mt-1.5 flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!dirty) return;
          setSaving(true);
          void generation.updateAlt(assetId, value.trim()).finally(() => setSaving(false));
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Texto alternativo de la imagen
        </label>
        <input
          id={inputId}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={500}
          placeholder="Describe la imagen para quien no la ve"
          className="min-w-0 flex-1 rounded-md border border-line bg-card px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={!dirty || saving}
          className="shrink-0 rounded-md border border-line bg-card px-2.5 py-1.5 font-medium text-fg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </form>
    </details>
  );
}

/** La franja "IMAGEN" del mock (arquetipos.jsx): las acciones sobre una imagen que ya está. */
export function ImageActionStrip({
  media,
  prompt,
  aspectRatio,
  style,
  onStyleChange,
  onChangePrompt,
}: {
  media: CardMediaActions;
  style: ImageStyle | undefined;
  onStyleChange: (style: ImageStyle) => void;
  /** El prompt con que se regenera: el de la card. Sin él, no se ofrece regenerar. */
  prompt: string | undefined;
  aspectRatio: ImageAspectRatio | undefined;
  /** Abre el composer para generar desde cero con otro prompt (QA de F10). */
  onChangePrompt?: () => void;
}) {
  const { generation } = media;
  const busy = isBusy(generation);
  const canRegenerate = generation && prompt && aspectRatio;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
        Imagen
      </span>
      {canRegenerate && style && (
        <StyleChip value={style} onChange={onStyleChange} disabled={busy} />
      )}
      {canRegenerate && (
        <ActionButton
          Icon={RefreshCw}
          label="Regenerar"
          disabled={busy}
          onClick={() =>
            void generation.generate({
              prompt,
              aspectRatio,
              provider: "primary",
              style: style ?? generation.defaultStyle,
            })
          }
        />
      )}
      {canRegenerate && generation.alternateAvailable && (
        <ActionButton
          Icon={Shuffle}
          label="Probar con otro generador"
          disabled={busy}
          onClick={() =>
            void generation.generate({
              prompt,
              aspectRatio,
              provider: "alternate",
              style: style ?? generation.defaultStyle,
            })
          }
        />
      )}
      {generation && onChangePrompt && (
        <ActionButton
          Icon={Pencil}
          label="Cambiar prompt"
          disabled={busy}
          onClick={onChangePrompt}
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
  style,
  onStyleChange,
  onCancel,
  onGenerate,
}: {
  media: CardMediaActions;
  generation: CardImageGeneration;
  initialPrompt: string;
  style: ImageStyle;
  onStyleChange: (style: ImageStyle) => void;
  /** Solo al cambiar el prompt de una card que ya tiene imagen: volver sin generar. */
  onCancel?: () => void;
  onGenerate?: () => void;
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
          placeholder="Describe la imagen que quieres: qué se ve y dónde. El estilo se elige abajo."
          className="w-full resize-y rounded-md border border-line bg-card px-2.5 py-2 text-xs text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StyleChip value={style} onChange={onStyleChange} disabled={busy} />
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
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ActionButton
          Icon={generation.requesting ? Loader2 : Sparkles}
          spinning={generation.requesting}
          label={`Generar imagen · ${priceLabel(generation.percent)}`}
          primary
          disabled={busy || !ready}
          onClick={() => {
            // Se cierra solo si la API aceptó: con un 402 o un error de red, el
            // prompt que el usuario reescribió se queda en el campo.
            void generation
              .generate({ prompt: prompt.trim(), aspectRatio, provider: "primary", style })
              .then((ok) => {
                if (ok) onGenerate?.();
              });
          }}
        />
        {generation.alternateAvailable && (
          <ActionButton
            Icon={Shuffle}
            label="Con otro generador"
            disabled={busy || !ready}
            onClick={() => {
              void generation
                .generate({ prompt: prompt.trim(), aspectRatio, provider: "alternate", style })
                .then((ok) => {
                  if (ok) onGenerate?.();
                });
            }}
          />
        )}
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="px-1 text-xs font-medium text-fg-secondary underline-offset-2 hover:underline"
          >
            Cancelar
          </button>
        ) : (
          <UploadImageButton media={media} label="Subir la mía" />
        )}
      </div>
      <p className="text-[11px] text-fg-muted">
        {onCancel
          ? "Genera dos opciones nuevas desde cero con este prompt. Las imágenes que ya tienes se quedan en tus versiones."
          : "Genera dos opciones para que elijas. Si prefieres hacerla afuera, copia el prompt y sube el resultado: eso no tiene costo."}
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
  const [style, setStyle] = useState<ImageStyle | null>(null);
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
          <ImageComposer
            media={media}
            generation={generation}
            initialPrompt={prompt ?? ""}
            style={style ?? initialStyle(generation)}
            onStyleChange={setStyle}
          />
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
  // "Cambiar prompt": el mismo composer de una card vacía, debajo de la
  // imagen actual, que sigue ahí hasta que lleguen las nuevas.
  const [composing, setComposing] = useState(false);
  // El estilo que eligió en el chip; null = el de arranque (initialStyle), que
  // se sigue leyendo en vivo para que llegue el del trabajo cuando termina.
  const [style, setStyle] = useState<ImageStyle | null>(null);
  const shownStyle = style ?? (generation ? initialStyle(generation) : undefined);
  const shown = picked ?? assetId;
  // La versión elegida dentro del historial, que llega aparte y después
  // (useCardController lo pide cuando cambia la card). Mientras no llega no se
  // sabe su texto alternativo, y el editor no se monta: montado con "" y un
  // "Guardar" borraría el que el servidor sí tiene.
  const shownVersion = generation?.versions.find((v) => v.assetId === shown);
  const versionAlt = shownVersion?.alt ?? null;
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
        <CardImage key={shown} assetId={shown} alt={versionAlt ?? alt} />
      )}
      {(job?.status === "failed" || job?.status === "blocked") && (
        <div className="mt-2">
          <JobNotice job={job} />
        </div>
      )}
      {generation && (
        <VersionStrip
          versions={generation.versions}
          selectedId={shown}
          onPick={pick}
          disabled={isBusy(generation)}
        />
      )}
      {media && generation && composing ? (
        <div className="mt-2.5">
          <ImageComposer
            media={media}
            generation={generation}
            initialPrompt={prompt ?? ""}
            style={shownStyle ?? generation.defaultStyle}
            onStyleChange={setStyle}
            onCancel={() => setComposing(false)}
            onGenerate={() => setComposing(false)}
          />
        </div>
      ) : (
        <>
          {media && (
            <ImageActionStrip
              media={media}
              prompt={prompt}
              aspectRatio={job?.aspectRatio ?? generation?.aspectOptions[0]}
              style={shownStyle}
              onStyleChange={setStyle}
              onChangePrompt={() => setComposing(true)}
            />
          )}
          {generation && (
            <AdjustBar generation={generation} assetId={shown} selecting={picked !== null} />
          )}
        </>
      )}
      {generation && shownVersion && (
        <AltTextEditor
          key={`alt-${shown}-${versionAlt ?? ""}`}
          assetId={shown}
          initial={versionAlt ?? ""}
          generation={generation}
        />
      )}
    </>
  );
}
