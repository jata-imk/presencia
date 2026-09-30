import { useEffect, useMemo, useState } from "react";
import {
  IMAGE_ASPECT_OPTIONS,
  IMAGE_JOB_STALE_MS,
  type CardImageJob,
  type CardImageVersionDto,
  type ImageProviderSlot,
  type PublicationCardDto,
  type QuotaStatusDto,
} from "@presencia/shared";
import type { CardMediaActions, GenerateInput } from "../../components/cards/CardMedia.js";
import { ApiError } from "../api.js";
import {
  cancelCardSchedule,
  editCardImage,
  fetchCardImageVersions,
  generateCardImage,
  rescheduleCard,
  selectCardImage,
  updateAssetAlt,
  uploadCardImage,
} from "../cards-api.js";
import { cuotaAgotadaDe } from "../cuota-agotada.js";
import { useImagesConfig } from "../use-images-config.js";
import { effectiveImageJob, imageFileProblem } from "./card-image.js";
import { useCard, useCardsStore, useChatCards } from "../../stores/cards-store.js";
import { useScheduleDrawerStore } from "../../stores/schedule-drawer-store.js";
import { useToastStore } from "../../stores/toast-store.js";

/**
 * Todo lo que se puede HACER con una card viva: imagen (generar, editar,
 * subir, elegir, alt), programar y cancelar. Vivía dentro de
 * PublicationCard, pegado a la card grande del chat; en F10.5 la card del
 * chat es compacta y las acciones se hacen en el panel de publicación, así
 * que la lógica pasa a un hook que cualquier superficie puede usar.
 */
export interface CardController {
  card: PublicationCardDto | undefined;
  /** El trabajo de imagen como hay que mostrarlo ahora (ver effectiveImageJob). */
  imageJob: CardImageJob | null;
  /** Solo cuando la card se puede editar y no es de video. */
  media: CardMediaActions | undefined;
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
  const selectedImage = card?.content.assetIds[0] ?? null;
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
  async function handleGenerate(id: string, input: GenerateInput): Promise<boolean> {
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

  async function handleEdit(id: string, instruction: string, provider: ImageProviderSlot) {
    setRequestingImage(true);
    try {
      applyCards(await editCardImage(id, { instruction, provider }));
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
    } catch (err) {
      failToast("No se pudo guardar el texto alternativo", err);
    }
  }

  async function handleSelect(id: string, assetId: string) {
    try {
      applyCards(await selectCardImage(id, assetId));
    } catch (err) {
      failToast("No se pudo elegir esa imagen", err);
    }
  }

  async function handleUpload(id: string, file: File) {
    const problem = imageFileProblem(file);
    if (problem) {
      toast({ title: "No se pudo subir la imagen", description: problem });
      return;
    }
    setUploading(true);
    try {
      applyCards(await uploadCardImage(id, file));
    } catch (err) {
      failToast("No se pudo subir la imagen", err);
    } finally {
      setUploading(false);
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
                generate: (input) => handleGenerate(card.id, input),
                select: (assetId) => handleSelect(card.id, assetId),
                requesting: requestingImage,
                job: imageJob,
                percent: imagesConfig.generatePercent,
                alternateAvailable: imagesConfig.alternateAvailable,
                defaultStyle: imagesConfig.defaultStyle,
                aspectOptions: IMAGE_ASPECT_OPTIONS[card.network],
                edit: (instruction, provider) => void handleEdit(card.id, instruction, provider),
                editPercent: imagesConfig.editPercent,
                versions,
                updateAlt: (assetId, alt) => handleUpdateAlt(assetId, alt),
              }
            : undefined,
        }
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
    busy,
    openSchedule,
    cancel: () => void handleCancel(),
    cuota,
    dismissCuota: () => setCuota(null),
    showCuota: setCuota,
  };
}
