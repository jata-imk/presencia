import { Check, LayoutTemplate, Maximize2, Stamp, SwatchBook, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  IMAGE_STYLES,
  imageStyleDef,
  type BrandVoiceDto,
  type ImageStyle,
  type ImageStyleDef,
} from "@presencia/shared";
import { BottomSheet } from "../../components/calendar/BottomSheet.js";
import {
  EncabezadoDePagina,
  NotaInfo,
  SkeletonDePagina,
} from "../../components/configuracion/primitivas.js";
import { Modal } from "../../components/ui/Modal.js";
import { ApiError, apiFetch } from "../../lib/api.js";
import { useMediaQuery } from "../../lib/use-media-query.js";
import { showToast } from "../../stores/toast-store.js";

// Configuración › Estilo visual (F10.6, diseño "Configuracion v2" de Claude
// Design): con qué estilo se generan las imágenes cuando el chat no pide otro.
//
// Vive en la Voz de marca (`brand_voices.image_style`, null = nunca eligió):
// el catálogo, los nombres y el texto que se le pide al generador son UNO
// solo en shared (IMAGE_STYLES), así que lo que dice esta página es lo que la
// API compone. Ver el addendum de ADR-025.
//
// Los ejemplos son imágenes fijas (public/assets/estilos), generadas con el
// prompt real por scripts/image-bakeoff/estilos.ts: misma escena en cada
// estilo para que la galería compare estilos y no escenas.
//
// Se guarda al elegir, sin botón: un solo valor, y el toast dice en qué se
// van a generar las imágenes a partir de ahora.

const EJEMPLOS = [
  { escena: "comida", label: "Comida" },
  { escena: "persona", label: "Persona" },
  { escena: "producto", label: "Producto" },
] as const;

function srcDe(id: ImageStyle, escena: string): string {
  return `/assets/estilos/${id}-${escena}.webp`;
}

export function EstiloVisualPage() {
  const [guardado, setGuardado] = useState<ImageStyle | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<ImageStyle | null>(null);
  // El PATCH más reciente: si se eligen dos seguidos y el primero falla
  // después, su rollback no debe pisar al segundo.
  const ultimo = useRef(0);

  useEffect(() => {
    const abort = new AbortController();
    apiFetch<BrandVoiceDto>("/api/brand-voice", { signal: abort.signal })
      .then((voz) => setGuardado(voz.imageStyle))
      .catch((e: unknown) => {
        if (abort.signal.aborted) return;
        setLoadError(e instanceof ApiError ? e.message : "No se pudo cargar tu estilo.");
      });
    return () => abort.abort();
  }, []);

  if (loadError) return <p className="text-sm text-error-fg">{loadError}</p>;
  if (guardado === undefined) return <SkeletonDePagina />;

  // null = nunca eligió: se genera en Fotográfico natural, y la página lo dice.
  const actual = imageStyleDef(guardado).id;

  async function elegir(estilo: ImageStyleDef) {
    const id = estilo.id;
    if (id === actual && guardado !== null) return;
    const anterior = guardado;
    const turno = ++ultimo.current;
    setGuardado(id);
    try {
      await apiFetch<BrandVoiceDto>("/api/brand-voice", {
        method: "PATCH",
        body: { imageStyle: id },
      });
      if (turno === ultimo.current) {
        showToast({
          title: `Guardado. Generaremos tus imágenes en ${estilo.name}.`,
          tone: "success",
          durationMs: 2600,
        });
      }
    } catch (e) {
      if (turno !== ultimo.current) return;
      setGuardado(anterior);
      showToast({
        title: "No se guardó tu estilo",
        description: e instanceof ApiError ? e.message : "Revisa tu conexión e inténtalo de nuevo.",
      });
    }
  }

  const abierto = detalle ? imageStyleDef(detalle) : null;

  return (
    <div className="max-w-260">
      <EncabezadoDePagina
        titulo="Estilo visual"
        subtitulo="Con qué estilo generamos tus imágenes cuando no pides otro. Puedes cambiarlo en cada imagen desde el chat."
      />
      {guardado === null && (
        <div className="max-w-155">
          <NotaInfo>
            Empezamos con <b>Fotográfico natural</b>. Elige otro cuando quieras; se guarda solo.
          </NotaInfo>
        </div>
      )}

      <div
        role="radiogroup"
        aria-label="Tu estilo"
        className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4 lg:gap-5"
      >
        {IMAGE_STYLES.map((estilo) => (
          <TarjetaDeEstilo
            key={estilo.id}
            estilo={estilo}
            elegido={estilo.id === actual}
            onElegir={() => void elegir(estilo)}
            onAbrir={() => setDetalle(estilo.id)}
          />
        ))}
      </div>

      <IdentidadVisual />

      {abierto && (
        <DetalleDeEstilo
          estilo={abierto}
          elegido={abierto.id === actual}
          onUsar={() => {
            void elegir(abierto);
            setDetalle(null);
          }}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  );
}

function TarjetaDeEstilo({
  estilo,
  elegido,
  onElegir,
  onAbrir,
}: {
  estilo: ImageStyleDef;
  elegido: boolean;
  onElegir: () => void;
  onAbrir: () => void;
}) {
  const id = estilo.id;
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border border-line bg-card transition-shadow duration-150 hover:shadow-md ${
        elegido ? "ring-2 ring-line-focus dark:ring-accent-cta" : ""
      }`}
    >
      <div className="relative aspect-4/5 w-full bg-tint-plum">
        <img
          src={srcDe(id, "base")}
          alt={`Ejemplo en estilo ${estilo.name}`}
          loading="lazy"
          className="size-full object-cover"
        />
        {elegido && <InsigniaTuEstilo className="absolute top-2.5 left-2.5" />}
        <button
          type="button"
          role="radio"
          aria-checked={elegido}
          aria-label={estilo.name}
          title="Elegir como tu estilo"
          onClick={onElegir}
          className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-card/90 shadow-sm"
        >
          <span
            aria-hidden
            className={`size-4.5 rounded-full bg-card transition-[border] duration-150 ${
              elegido ? "border-5 border-primary" : "border-2 border-fg-muted"
            }`}
          />
        </button>
        <button
          type="button"
          aria-label={`Ver ejemplos de ${estilo.name}`}
          title="Ver ejemplos"
          onClick={onAbrir}
          className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-md bg-card/90 text-brand shadow-sm"
        >
          <Maximize2 size={15} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      {/* El texto también abre el detalle, como en el diseño; el botón de
          arriba es el camino con teclado, así que este no entra al tab. */}
      <div
        onClick={onAbrir}
        className="flex flex-1 cursor-pointer flex-col gap-1 px-3.5 pt-3 pb-3.5"
      >
        <p className="font-display text-base font-semibold text-fg">{estilo.name}</p>
        <p className="text-xs leading-normal text-pretty text-fg-secondary">{estilo.desc}</p>
        <p className="mt-1 text-xs leading-normal text-pretty text-fg-muted">
          <span className="font-semibold text-fg-secondary">Funciona bien para</span>{" "}
          {estilo.goodFor}
        </p>
      </div>
    </div>
  );
}

function InsigniaTuEstilo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`pointer-events-none inline-flex items-center gap-1 rounded-full bg-primary py-1 pr-2.5 pl-2 font-display text-[11px] font-semibold whitespace-nowrap text-primary-fg ${className}`}
    >
      <Check size={12} strokeWidth={2.4} aria-hidden />
      Tu estilo
    </span>
  );
}

function DetalleDeEstilo({
  estilo,
  elegido,
  onUsar,
  onClose,
}: {
  estilo: ImageStyleDef;
  elegido: boolean;
  onUsar: () => void;
  onClose: () => void;
}) {
  const esMovil = !useMediaQuery("(min-width: 768px)");
  const id = estilo.id;
  const tituloId = "estilo-detalle-titulo";

  const contenido = (
    <>
      <div className="flex items-start gap-3 border-b border-line px-5 pt-4.5 pb-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={tituloId} className="font-display text-lg font-bold text-fg">
              {estilo.name}
            </h2>
            {elegido && <InsigniaTuEstilo />}
          </div>
          <p className="mt-1 text-sm leading-normal text-fg-secondary">{estilo.desc}</p>
        </div>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-secondary"
        >
          <X size={16} strokeWidth={2} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {/* Móvil: tira con scroll horizontal y snap; escritorio: tres columnas. */}
        <div className="-mx-5 flex snap-x snap-mandatory [scrollbar-width:none] gap-3 overflow-x-auto px-5 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0">
          {EJEMPLOS.map((ejemplo) => (
            <figure key={ejemplo.escena} className="w-[72%] shrink-0 snap-start md:w-auto">
              <div className="aspect-4/5 w-full overflow-hidden rounded-md bg-tint-plum">
                <img
                  src={srcDe(id, ejemplo.escena)}
                  alt={`${ejemplo.label} en estilo ${estilo.name}`}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </div>
              <figcaption className="mt-2 font-display text-sm font-medium text-fg-secondary">
                {ejemplo.label}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-4 text-sm leading-normal text-fg-secondary">
          <span className="font-semibold text-fg">Funciona bien para</span> {estilo.goodFor}
        </p>
      </div>

      <div className="flex items-center justify-end gap-2.5 border-t border-line bg-surface px-5 py-3.5">
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-md border-[1.5px] border-line bg-card px-4 font-display text-sm font-semibold text-fg-secondary hover:bg-secondary"
        >
          Cerrar
        </button>
        <button
          type="button"
          onClick={onUsar}
          disabled={elegido}
          className="h-10 rounded-md bg-primary px-4.5 font-display text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:cursor-default disabled:opacity-50"
        >
          {elegido ? "Ya es tu estilo" : "Usar este estilo"}
        </button>
      </div>
    </>
  );

  if (esMovil) {
    return (
      <BottomSheet label={estilo.name} onClose={onClose}>
        <div className="flex min-h-0 flex-1 flex-col">{contenido}</div>
      </BottomSheet>
    );
  }
  return (
    <Modal
      onClose={onClose}
      labelledBy={tituloId}
      maxWidth="max-w-220"
      panelClassName="flex max-h-[90vh] flex-col overflow-hidden p-0"
    >
      {contenido}
    </Modal>
  );
}

/** Lo que viene después del estilo: se anuncia, no se puede tocar todavía. */
function IdentidadVisual() {
  const piezas = [
    { icono: Stamp, label: "Logo" },
    { icono: SwatchBook, label: "Colores de marca" },
    { icono: LayoutTemplate, label: "Plantillas visuales" },
  ];
  return (
    <section className="mt-10 rounded-lg border-[1.5px] border-dashed border-line-focus bg-surface px-6 py-5.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="font-display text-md font-semibold text-fg">Identidad visual</h2>
        <span className="rounded-full border border-line bg-tint-plum px-2.5 py-0.75 font-display text-[11px] font-semibold text-fg-secondary">
          Próximamente
        </span>
      </div>
      <p className="mt-1.5 mb-4 text-sm leading-normal text-pretty text-fg-secondary">
        Tu logo, tus colores y tus plantillas, aplicados a cada imagen que generemos.
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {piezas.map(({ icono: Icono, label }) => (
          <div
            key={label}
            className="flex items-center gap-2.5 rounded-md border border-line bg-card p-3.5 opacity-75"
          >
            <Icono size={17} strokeWidth={1.5} className="text-fg-muted" aria-hidden />
            <span className="text-sm text-fg-secondary">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
