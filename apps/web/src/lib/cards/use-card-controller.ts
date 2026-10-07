import { useEffect, useMemo, useState } from "react";
import {
  carouselAspect,
  FIRST_SLIDE_ID,
  IMAGE_ASPECT_OPTIONS,
  IMAGE_JOB_STALE_MS,
  NETWORK_MAX_IMAGES,
  type CardImageJob,
  type CardImageVersionDto,
  type CarouselSlide,
  type GenerateCardImageBody,
  type ImageAspectRatio,
  type ImageStyle,
  type PublicationCardDto,
  type QuotaStatusDto,
} from "@presencia/shared";
import type { CardMediaActions, GenerateInput } from "../../components/cards/CardMedia.js";
import { ApiError } from "../api.js";
import {
  addCardSlide,
  cancelCardSchedule,
  deleteCardSlide,
  editCardImage,
  fetchCardImageVersions,
  generateCardImage,
  reorderCardSlides,
  rescheduleCard,
  selectCardImage,
  setCardSlidesAspect,
  updateAssetAlt,
  updateCardSlide,
  uploadCardImage,
} from "../cards-api.js";
import { cuotaAgotadaDe } from "../cuota-agotada.js";
import { useImagesConfig } from "../use-images-config.js";
import { effectiveImageJob, imageFileProblem } from "./card-image.js";
import { useCard, useCardsStore, useChatCards } from "../../stores/cards-store.js";
import { useScheduleDrawerStore } from "../../stores/schedule-drawer-store.js";
import { useToastStore } from "../../stores/toast-store.js";
import { versionsOfSlide } from "./slide-versions.js";

/**
 * Todo lo que se puede HACER con una card viva: imagen (generar, editar,
 * subir, elegir, alt), programar y cancelar. Vivía dentro de
 * PublicationCard, pegado a la card grande del chat; en F10.5 la card del
 * chat es compacta y las acciones se hacen en el panel de publicación, así
 * que la lógica pasa a un hook que cualquier superficie puede usar.
 */
/**
 * F10.6: el carrusel de la card. Las acciones de imagen de un slide son las
 * mismas piezas de siempre (composer, versiones, ajustar), apuntadas a ESE
 * slide con `mediaFor`.
 */
export interface CarouselActions {
  slides: CarouselSlide[];
  /** Cuántas imágenes acepta la red. */
  max: number;
  aspect: ImageAspectRatio;
  aspectOptions: readonly ImageAspectRatio[];
  /** Los slides que está llenando el trabajo que corre ahora. */
  generatingIds: string[];
  /** Un cambio de estructura (agregar, quitar, ordenar, recortar) en camino. */
  changing: boolean;
  /** Un pedido de generar en camino (todavía sin trabajo en la card). */
  requesting: boolean;
  /**
   * F10.6.1: UN estilo para todo el carrusel (que se vea como una pieza). Lo
   * comparten el chip de la barra, el de cada slide y "Generar las que faltan".
   */
  style: ImageStyle;
  setStyle: (style: ImageStyle) => void;
  mediaFor: (slide: CarouselSlide, index: number) => CardMediaActions | undefined;
  add: () => Promise<boolean>;
  remove: (slideId: string) => void;
  reorder: (slideIds: string[]) => void;
  setAspect: (aspect: ImageAspectRatio) => void;
  /** Genera en un solo trabajo los slides que tienen prompt y no imagen. */
  generateMissing: () => void;
  /** Lo que costaría `generateMissing`, en % del mes; null si no hay nada que generar. */
  missingPercent: number | null;
  missingCount: number;
}

export interface CardController {
  card: PublicationCardDto | undefined;
  /** El trabajo de imagen como hay que mostrarlo ahora (ver effectiveImageJob). */
  imageJob: CardImageJob | null;
  /** Solo cuando la card se puede editar y no es de video. */
  media: CardMediaActions | undefined;
  /** F10.6: solo en una card editable que ya es carrusel. */
  carousel: CarouselActions | undefined;
  /** F10.6: convierte la imagen suelta en carrusel (agrega el segundo slide). */
  startCarousel: (() => Promise<boolean>) | undefined;
  busy: boolean;
  openSchedule: () => void;
  cancel: () => void;
  /** Cuota agotada al pedir algo que cobra: quien lo usa monta el modal. */
  cuota: QuotaStatusDto | null;
  dismissCuota: () => void;
  /** Para lo que cobra fuera de este hook (el cambio por IA del panel). */
  showCuota: (cuota: QuotaStatusDto) => void;
}

/**
 * `withMedia: false` es para quien solo programa o cancela (la card compacta
 * del chat): no pide el historial de imágenes, que sería una petición por
 * card del chat sin nadie que lo muestre.
 */
export function useCardController(
  cardId: string | undefined,
  { withMedia = true }: { withMedia?: boolean } = {},
): CardController {
  const toast = useToastStore((s) => s.show);
  const openDrawer = useScheduleDrawerStore((s) => s.open);
  const applyCards = useCardsStore((s) => s.apply);
  const card = useCard(cardId);
  const chatCards = useChatCards(card?.chatId ?? undefined);
  const imagesConfig = useImagesConfig();
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [requestingImage, setRequestingImage] = useState(false);
  const [changingSlides, setChangingSlides] = useState(false);
  // El estilo que eligió para el carrusel; null = el de arranque (el del
  // último trabajo, o el de su voz). Antes cada slide tenía el suyo y
  // "Generar las que faltan" no veía ninguno (bug del recorrido de F10.6).
  const [carouselStyle, setCarouselStyle] = useState<ImageStyle | null>(null);
  const [cuota, setCuota] = useState<QuotaStatusDto | null>(null);

  // Un trabajo "generando" que no termina (el worker murió a la mitad) no
  // manda ningún evento: se da por fallido solo al cumplirse el corte de
  // IMAGE_JOB_STALE_MS, con un timer que lo vuelve a pintar a esa hora.
  const rawJob = card?.imageJob ?? null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (rawJob?.status !== "generating") return;
    const due = Date.parse(rawJob.startedAt) + IMAGE_JOB_STALE_MS - Date.now();
    const timer = setTimeout(() => setNow(Date.now()), Math.max(due, 0) + 500);
    return () => clearTimeout(timer);
  }, [rawJob?.id, rawJob?.status, rawJob?.startedAt]);
  const imageJob = effectiveImageJob(rawJob, Math.max(now, Date.now()));

  // El historial de imágenes (F10 PR4). Se vuelve a pedir cuando cambia algo
  // que lo cambia: termina un trabajo o se elige/sube otra imagen. Solo en
  // cards editables, que son las únicas que muestran la tira.
  const [versions, setVersions] = useState<CardImageVersionDto[]>([]);
  const editable = card?.status === "draft" || card?.status === "failed";
  // Todas las elegidas, no solo la primera: en un carrusel cada slide cambia la suya.
  const selectedImage = card?.content.assetIds.join(",") || null;
  const versionsKey =
    withMedia && card && editable && (selectedImage || rawJob)
      ? `${card.id}|${rawJob?.id ?? ""}|${rawJob?.status ?? ""}|${selectedImage ?? ""}`
      : null;
  useEffect(() => {
    if (!versionsKey || !card) return;
    let alive = true;
    fetchCardImageVersions(card.id)
      .then((list) => {
        if (alive) setVersions(list);
      })
      .catch(() => {
        // Sin historial la card sigue sirviendo: solo no muestra la tira.
      });
    return () => {
      alive = false;
    };
    // card.id va dentro de la llave: pedirlo con cada cambio de la card
    // (hashtags, hora) sería una petición por evento del stream.
  }, [versionsKey]);

  const siblingCards = useMemo(
    () =>
      card?.groupId ? chatCards.filter((c) => c.groupId === card.groupId && c.id !== card.id) : [],
    [chatCards, card],
  );

  function failToast(title: string, err: unknown) {
    toast({ title, description: err instanceof ApiError ? err.message : "Inténtalo de nuevo." });
  }

  // La respuesta trae la card ya "generando"; el resultado llega después por
  // el stream de cards, cuando el worker termina. Un 402 no es un error de
  // red: abre la pantalla de cuota agotada, igual que en el chat.
  async function handleGenerate(id: string, input: GenerateCardImageBody): Promise<boolean> {
    setRequestingImage(true);
    try {
      applyCards(await generateCardImage(id, input));
      return true;
    } catch (err) {
      const agotada = cuotaAgotadaDe(err);
      if (agotada) setCuota(agotada);
      else failToast("No se pudo generar la imagen", err);
      return false;
    } finally {
      setRequestingImage(false);
    }
  }

  async function handleEdit(id: string, instruction: string, generator: number, slideId?: string) {
    setRequestingImage(true);
    try {
      applyCards(
        await editCardImage(
          id,
          slideId ? { instruction, generator, slideId } : { instruction, generator },
        ),
      );
    } catch (err) {
      const agotada = cuotaAgotadaDe(err);
      if (agotada) setCuota(agotada);
      else failToast("No se pudo ajustar la imagen", err);
    } finally {
      setRequestingImage(false);
    }
  }

  async function handleUpdateAlt(assetId: string, alt: string) {
    try {
      await updateAssetAlt(assetId, alt);
      setVersions((list) => list.map((v) => (v.assetId === assetId ? { ...v, alt } : v)));
      toast({ title: "Texto alternativo guardado" });
      return true;
    } catch (err) {
      failToast("No se pudo guardar el texto alternativo", err);
      return false;
    }
  }

  async function handleSelect(id: string, assetId: string, slideId?: string) {
    try {
      applyCards(await selectCardImage(id, assetId, slideId));
    } catch (err) {
      failToast("No se pudo elegir esa imagen", err);
    }
  }

  async function handleUpload(id: string, file: File, slideId?: string) {
    const problem = imageFileProblem(file);
    if (problem) {
      toast({ title: "No se pudo subir la imagen", description: problem });
      return;
    }
    setUploading(true);
    try {
      applyCards(await uploadCardImage(id, file, slideId));
    } catch (err) {
      failToast("No se pudo subir la imagen", err);
    } finally {
      setUploading(false);
    }
  }

  /** Un cambio de estructura del carrusel: uno a la vez, y la card nueva al store. */
  async function changeSlides(
    title: string,
    run: () => Promise<PublicationCardDto>,
  ): Promise<boolean> {
    setChangingSlides(true);
    try {
      applyCards(await run());
      return true;
    } catch (err) {
      failToast(title, err);
      return false;
    } finally {
      setChangingSlides(false);
    }
  }

  // Las acciones de imagen solo existen mientras la card se puede editar: una
  // card programada ya viajó al proveedor con su imagen (la API lo impide
  // igual, esto es para no ofrecer lo que va a fallar).
  const media: CardMediaActions | undefined =
    card && editable && card.content.archetype !== "video_script"
      ? {
          upload: (file) => void handleUpload(card.id, file),
          uploading,
          generation: imagesConfig
            ? {
                generate: (input: GenerateInput) => handleGenerate(card.id, input),
                select: (assetId) => handleSelect(card.id, assetId),
                requesting: requestingImage,
                job: imageJob,
                percent: imagesConfig.generatePercent,
                generatorCount: imagesConfig.generatorCount,
                // Una pestaña con el config de antes del deploy no lo trae.
                generatorStrengths: imagesConfig.generatorStrengths ?? [],
                defaultStyle: imagesConfig.defaultStyle,
                aspectOptions: IMAGE_ASPECT_OPTIONS[card.network],
                edit: (instruction, generator) => void handleEdit(card.id, instruction, generator),
                editPercent: imagesConfig.editPercent,
                versions,
                updateAlt: (assetId, alt) => handleUpdateAlt(assetId, alt),
              }
            : undefined,
        }
      : undefined;

  // ── F10.6: carrusel ──
  const content = card?.content;
  const slides =
    content && content.archetype !== "video_script" && content.slides ? content.slides : null;
  const canImage = Boolean(card && editable && content && content.archetype !== "video_script");
  const max = card ? NETWORK_MAX_IMAGES[card.network] : 0;
  const lastStyle = carouselStyle ?? imageJob?.style ?? imagesConfig?.defaultStyle;
  const running = imageJob?.status === "generating" ? imageJob : null;
  const generatingIds = running ? (running.slideIds ?? [FIRST_SLIDE_ID]) : [];

  function slideMedia(slide: CarouselSlide): CardMediaActions | undefined {
    if (!card || !media || !content) return undefined;
    const aspect = carouselAspect(content, card.network);
    const here = generatingIds.includes(slide.id) || imageJob?.slideIds?.includes(slide.id);
    const base = media.generation;
    return {
      upload: (file) => void handleUpload(card.id, file, slide.id),
      uploading,
      generation:
        base && imagesConfig
          ? {
              ...base,
              // El trabajo de la card solo es "de este slide" si lo está llenando.
              job: here ? imageJob : null,
              // F10.6.1: el historial de ESTE slide, no el de toda la card.
              versions: versionsOfSlide(base.versions, slide, aspect),
              versionsLabel: "Versiones de este slide",
              busyElsewhere: Boolean(running) && !generatingIds.includes(slide.id),
              aspectOptions: [aspect],
              generate: async (input) => {
                // El prompt de un slide vive en la card: se guarda antes de generar.
                if (input.prompt.trim() !== (slide.imagePrompt ?? "").trim()) {
                  const saved = await changeSlides("No se pudo guardar el prompt", () =>
                    updateCardSlide(card.id, slide.id, input.prompt.trim()),
                  );
                  if (!saved) return false;
                }
                return handleGenerate(card.id, {
                  generator: input.generator,
                  aspectRatio: aspect,
                  style: input.style,
                  slideIds: [slide.id],
                });
              },
              select: (assetId) => handleSelect(card.id, assetId, slide.id),
              edit: (instruction, generator) =>
                void handleEdit(card.id, instruction, generator, slide.id),
              ...(lastStyle
                ? { styleControl: { value: lastStyle, onChange: setCarouselStyle } }
                : {}),
              commitPrompt: (prompt) =>
                void changeSlides("No se pudo guardar el prompt", () =>
                  updateCardSlide(card.id, slide.id, prompt),
                ),
            }
          : undefined,
    };
  }

  const missing = slides
    ? slides.filter((slide) => !slide.assetId && (slide.imagePrompt?.trim().length ?? 0) >= 3)
    : [];
  // F10.7: una imagen por slide, también la portada. El precio del lote lo
  // calcula el servidor redondeando una vez (n × 2.3 daría 6.9% por 7.0%);
  // una pestaña con el config de antes del deploy cae a multiplicar.
  const missingPercent =
    imagesConfig && missing.length > 0
      ? (imagesConfig.batchPercents?.[missing.length - 1] ??
        Math.round(missing.length * imagesConfig.generatePercent * 10) / 10)
      : null;

  const carousel: CarouselActions | undefined =
    card && canImage && slides && content
      ? {
          slides,
          max,
          aspect: carouselAspect(content, card.network),
          aspectOptions: IMAGE_ASPECT_OPTIONS[card.network],
          generatingIds,
          changing: changingSlides,
          requesting: requestingImage,
          style: lastStyle ?? imagesConfig?.defaultStyle ?? "foto",
          setStyle: setCarouselStyle,
          mediaFor: slideMedia,
          add: () => changeSlides("No se pudo agregar el slide", () => addCardSlide(card.id)),
          remove: (slideId) =>
            void changeSlides("No se pudo quitar el slide", () =>
              deleteCardSlide(card.id, slideId),
            ),
          reorder: (slideIds) =>
            void changeSlides("No se pudo reordenar", () => reorderCardSlides(card.id, slideIds)),
          setAspect: (aspect) =>
            void changeSlides("No se pudo recortar el carrusel", () =>
              setCardSlidesAspect(card.id, aspect),
            ),
          generateMissing: () => {
            if (missing.length === 0) return;
            void handleGenerate(card.id, {
              generator: 1,
              aspectRatio: carouselAspect(content, card.network),
              ...(lastStyle ? { style: lastStyle } : {}),
              slideIds: missing.map((slide) => slide.id),
            });
          },
          missingPercent,
          missingCount: missing.length,
        }
      : undefined;

  const startCarousel =
    card && canImage && !slides && max > 1
      ? () => changeSlides("No se pudo agregar el slide", () => addCardSlide(card.id))
      : undefined;

  function openSchedule() {
    if (!card) return;
    // Batch solo al programar por primera vez (draft) con hermanas también
    // en draft — reprogramar/reintentar una card ya tocada es siempre
    // individual (cada red sigue su propio horario desde ahí en adelante).
    const draftSiblings = siblingCards.filter((c) => c.status === "draft");
    openDrawer(
      card.status === "draft" && draftSiblings.length > 0 ? [card, ...draftSiblings] : [card],
    );
  }

  async function handleCancel() {
    if (!card || card.status !== "scheduled") return;
    const previous = { socialAccountId: card.socialAccountId, scheduledAt: card.scheduledAt };
    setBusy(true);
    try {
      applyCards(await cancelCardSchedule(card.id));
      toast({
        title: "Programación cancelada",
        description: "Vuelve a borrador.",
        onUndo:
          previous.socialAccountId && previous.scheduledAt
            ? () => {
                rescheduleCard(card.id, {
                  socialAccountId: previous.socialAccountId!,
                  scheduledAt: previous.scheduledAt!,
                })
                  .then(applyCards)
                  .catch((err: unknown) => {
                    toast({
                      title:
                        err instanceof ApiError
                          ? err.message
                          : "No se pudo deshacer — ese horario ya no es válido.",
                    });
                  });
              }
            : undefined,
      });
    } catch (err) {
      failToast("No se pudo cancelar la programación", err);
    } finally {
      setBusy(false);
    }
  }

  return {
    card,
    imageJob,
    media,
    carousel,
    startCarousel,
    busy,
    openSchedule,
    cancel: () => void handleCancel(),
    cuota,
    dismissCuota: () => setCuota(null),
    showCuota: setCuota,
  };
}
