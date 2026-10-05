import type { CardImageVersionDto, CarouselSlide } from "@presencia/shared";

/**
 * Las versiones de UN slide del carrusel (F10.6.1): antes la tira de cada
 * slide mostraba todas las imágenes de la card ("Versiones · 18" en cada uno).
 *
 * - Las anotadas con su slide (`slideId`), que no cambia al reordenar.
 * - Las de antes de anotarlo (null) cuentan como de la portada: en una
 *   imagen suelta son su historial completo, y nada se pierde.
 * - La imagen que el slide tiene AHORA, siempre: aunque viniera de otro lado,
 *   la tira tiene que poder mostrarla como la elegida.
 */
export function versionsOfSlide(
  versions: CardImageVersionDto[],
  slide: CarouselSlide,
  index: number,
): CardImageVersionDto[] {
  return versions.filter(
    (v) =>
      v.slideId === slide.id ||
      (v.slideId === null && index === 0) ||
      (slide.assetId !== undefined && v.assetId === slide.assetId),
  );
}
