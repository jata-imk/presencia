import { FIRST_SLIDE_ID, type CardImageVersionDto, type CarouselSlide } from "@presencia/shared";

/**
 * Las versiones de UN slide del carrusel (F10.6.1): antes la tira de cada
 * slide mostraba todas las imágenes de la card ("Versiones · 18" en cada uno).
 *
 * - Las anotadas con su slide (`slideId`), que no cambia al reordenar.
 * - Las que no tienen (null; la migración 0044 ya no deja ninguna con card)
 *   cuentan como de `FIRST_SLIDE_ID`, la imagen suelta de antes de F10.6:
 *   por ID y no por posición, para que reordenar no le pase ese historial a
 *   otro slide.
 * - La imagen que el slide tiene AHORA, siempre: aunque viniera de otro lado,
 *   la tira tiene que poder mostrarla como la elegida.
 */
export function versionsOfSlide(
  versions: CardImageVersionDto[],
  slide: CarouselSlide,
): CardImageVersionDto[] {
  return versions.filter(
    (v) =>
      (v.slideId ?? FIRST_SLIDE_ID) === slide.id ||
      (slide.assetId !== undefined && v.assetId === slide.assetId),
  );
}
