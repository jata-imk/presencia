import { z } from "zod";
import { IMAGE_ASPECT_OPTIONS, imageAspectRatioSchema, type ImageAspectRatio } from "./images.js";
import type { CardContent, CarouselSlide, SocialNetwork } from "./publication.js";

// El carrusel (F10.6): varias imágenes en una publicación, en orden, la
// primera es la portada.
//
// Vive en `content.slides` y NO reemplaza a `assetIds`: `assetIds` se deriva
// de los slides al escribir (las imágenes de los slides, en orden, sin
// huecos). Así la publicación y las vistas previas siguen leyendo una sola
// lista, y una card sin `slides` es la de imagen suelta de siempre.
//
// Un slide puede existir sin imagen todavía (solo su prompt): ocupa su lugar
// en el orden y no cuenta en `assetIds`.

/**
 * Cuántas imágenes acepta cada red en una publicación. De partida, lo que
 * dicen las redes; el PR de publicar (F10.6 PR6) los confirma contra los
 * openapi de PostFast y Upload-Post y los baja si un proveedor no llega.
 * 0 = la red no lleva imagen (video).
 */
export const NETWORK_MAX_IMAGES: Record<SocialNetwork, number> = {
  instagram: 10,
  facebook: 10,
  x: 4,
  threads: 10,
  linkedin: 9,
  tiktok: 0,
  youtube: 0,
};

/** Las imágenes de los slides, en orden y sin los que no tienen. */
export function assetIdsOfSlides(slides: readonly CarouselSlide[]): string[] {
  return slides.flatMap((slide) => (slide.assetId ? [slide.assetId] : []));
}

/** La card con estos slides; con uno solo deja de ser carrusel. */
export function withSlides<C extends CardContent>(content: C, slides: CarouselSlide[]): C {
  if (content.archetype === "video_script") return content;
  if (slides.length <= 1) {
    // Un carrusel de uno es una imagen suelta: vuelve a la forma de siempre,
    // con el prompt y la imagen del slide que quedó.
    // El prompt es el del slide que quedó, o ninguno: el de la portada que se
    // quitó describiría una imagen que ya no está.
    const rest: Record<string, unknown> = { ...content };
    delete rest.slides;
    delete rest.slidesAspect;
    delete rest.imagePrompt;
    const only = slides[0];
    return {
      ...rest,
      ...(only?.imagePrompt !== undefined ? { imagePrompt: only.imagePrompt } : {}),
      assetIds: only?.assetId ? [only.assetId] : [],
    } as C;
  }
  return { ...content, slides, assetIds: assetIdsOfSlides(slides) };
}

/** Si `slideId` es un slide de la card (en una imagen suelta, solo FIRST_SLIDE_ID). */
export function hasSlide(content: CardContent, slideId: string): boolean {
  return slidesOf(content).some((s) => s.id === slideId);
}

/**
 * Los slides de la card. Una imagen suelta se ve como un carrusel de uno
 * (su prompt y su imagen): con eso "agregar slide" a una card que no era
 * carrusel conserva lo que ya tenía como portada.
 */
export function slidesOf(content: CardContent): CarouselSlide[] {
  if (content.archetype === "video_script") return [];
  if (content.slides) return content.slides;
  return [
    {
      id: FIRST_SLIDE_ID,
      ...(content.imagePrompt !== undefined ? { imagePrompt: content.imagePrompt } : {}),
      ...(content.assetIds[0] ? { assetId: content.assetIds[0] } : {}),
    },
  ];
}

/**
 * El id del slide implícito de una card que no es carrusel. Fijo y no
 * aleatorio: un trabajo que empezó sobre la imagen suelta lo registra (en sus
 * filas y en `job.slideIds`) y así encuentra "su" slide aunque la card se
 * vuelva carrusel o se reordene mientras genera.
 */
export const FIRST_SLIDE_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Pone una imagen en su lugar: en el slide `slideId` si la card es carrusel,
 * o como LA imagen si no. Sin `slideId` en un carrusel, va a la portada.
 * Un slide que ya no existe (se borró mientras generaba) no recibe nada:
 * la imagen igual queda en las versiones de la card.
 */
export function placeImage<C extends CardContent>(
  content: C,
  assetId: string,
  slideId?: string | null,
): C {
  if (content.archetype === "video_script") return content;
  if (!content.slides) {
    if (slideId && slideId !== FIRST_SLIDE_ID) return content;
    return { ...content, assetIds: [assetId] };
  }
  const target = slideId ?? content.slides[0]!.id;
  if (!content.slides.some((s) => s.id === target)) return content;
  return withSlides(
    content,
    content.slides.map((s) => (s.id === target ? { ...s, assetId } : s)),
  );
}

/**
 * Lo que es imagen en la card: `assetIds` y, si es carrusel, `slides`. Lo que
 * el texto no toca: editar, restaurar una versión o reescribir con IA lo
 * copian tal cual de la card viva.
 */
export function mediaOf(content: CardContent): Pick<CardContent, "assetIds"> & {
  slides?: CarouselSlide[];
  slidesAspect?: ImageAspectRatio;
} {
  if (content.archetype !== "video_script" && content.slides) {
    return {
      assetIds: content.assetIds,
      slides: content.slides,
      ...(content.slidesAspect ? { slidesAspect: content.slidesAspect } : {}),
    };
  }
  return { assetIds: content.assetIds };
}

/** La proporción del carrusel: la elegida, o la primera que usa la red. */
export function carouselAspect(content: CardContent, network: SocialNetwork): ImageAspectRatio {
  const options = IMAGE_ASPECT_OPTIONS[network];
  const chosen = content.archetype !== "video_script" ? content.slidesAspect : undefined;
  return chosen && options.includes(chosen) ? chosen : options[0]!;
}

/** Agregar un slide: con el prompt que se quiera, o vacío para llenarlo después. */
export const addSlideBodySchema = z.object({
  imagePrompt: z.string().trim().max(2000).optional(),
});
export type AddSlideBody = z.infer<typeof addSlideBodySchema>;

/** Cambiar el prompt de un slide (el de la imagen que TODAVÍA no se genera). */
export const updateSlideBodySchema = z.object({
  imagePrompt: z.string().trim().max(2000),
});
export type UpdateSlideBody = z.infer<typeof updateSlideBodySchema>;

/** El orden nuevo: los mismos ids, todos, una vez cada uno. La primera es la portada. */
export const reorderSlidesBodySchema = z.object({
  slideIds: z.array(z.uuid()).min(2).max(10),
});
export type ReorderSlidesBody = z.infer<typeof reorderSlidesBodySchema>;

/** "Recorte: 4:5 / 1:1": la proporción de todo el carrusel. */
export const setSlidesAspectBodySchema = z.object({ aspectRatio: imageAspectRatioSchema });
export type SetSlidesAspectBody = z.infer<typeof setSlidesAspectBodySchema>;

export const slideParamSchema = z.object({ id: z.uuid(), slideId: z.uuid() });
