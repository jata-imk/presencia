import { useRef, useState, type ComponentType } from "react";
import { Copy, ImageOff, ImagePlus, Loader2, Upload } from "lucide-react";
import { ASSET_UPLOAD_MIME_TYPES, assetContentUrl } from "@presencia/shared";
import { useToastStore } from "../../stores/toast-store.js";

// La imagen de una card y lo que se puede hacer con ella (F10). Presentación
// pura: quién sube y qué pasa después lo decide quien pasa `media`. Sin
// `media`, la card es de solo lectura (el modal "Ver" del Calendario, o una
// card ya programada) y estas piezas no ofrecen ninguna acción.

export interface CardMediaActions {
  upload: (file: File) => void;
  uploading: boolean;
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

/** El prompt sugerido, con "Copiar" para generarla afuera (modo 2 del dual de F10). */
export function ImagePromptBox({ prompt, copyable }: { prompt: string; copyable: boolean }) {
  const toast = useToastStore((s) => s.show);

  function copy() {
    void navigator.clipboard.writeText(prompt).then(() => {
      toast({ title: "Prompt copiado", description: "Úsalo en tu generador y sube el resultado." });
    });
  }

  return (
    <div className="rounded-lg border border-line bg-tint-plum px-3.5 py-3 text-left">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-fg">Prompt de imagen</p>
        {copyable && (
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1 text-xs font-medium text-accent"
          >
            <Copy size={12} strokeWidth={1.75} />
            Copiar
          </button>
        )}
      </div>
      <p className="text-xs text-fg-secondary">{prompt}</p>
    </div>
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
        disabled={media.uploading}
        spinning={media.uploading}
        primary={primary}
      />
    </>
  );
}

/** La franja "IMAGEN" del mock (arquetipos.jsx): las acciones sobre una imagen que ya está. */
export function ImageActionStrip({ media }: { media: CardMediaActions }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] font-semibold tracking-wide text-fg-muted uppercase">
        Imagen
      </span>
      <UploadImageButton media={media} label="Subir otra" />
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
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-ai-border bg-ai-bg px-4 py-6 text-center">
      <ImagePlus className="text-accent" size={26} strokeWidth={1.5} />
      <p className="text-sm font-semibold text-fg">Esperando imagen</p>
      <p className="text-xs text-fg-secondary">{note}</p>
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
    </div>
  );
}
