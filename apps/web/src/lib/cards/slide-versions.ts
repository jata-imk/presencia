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
 *
 * F10.6.2: una imagen y sus recortes de proporción (`croppedFrom`) son UNA
 * versión: cambiar 4:5 ↔ 1:1 no es una imagen nueva, y antes cada cambio
 * sumaba una versión por slide. De cada grupo queda la que el slide tiene
 * ahora o, si no, la más reciente (la del último encuadre), en el lugar de
 * la original para no reordenar la tira.
 */
export function versionsOfSlide(
  versions: CardImageVersionDto[],
  slide: CarouselSlide,
): CardImageVersionDto[] {
  const mine = versions.filter(
    (v) =>
      (v.slideId ?? FIRST_SLIDE_ID) === slide.id ||
      (slide.assetId !== undefined && v.assetId === slide.assetId),
  );
  return groupCrops(mine, slide.assetId);
}

/** Una por imagen original: la elegida si está en el grupo, si no la más nueva. */
export function groupCrops(
  versions: CardImageVersionDto[],
  currentAssetId: string | undefined,
): CardImageVersionDto[] {
  const rootOf = (v: CardImageVersionDto) => v.croppedFrom ?? v.assetId;
  const pick = new Map<string, CardImageVersionDto>();
  for (const v of versions) {
    const root = rootOf(v);
    const held = pick.get(root);
    if (held?.assetId === currentAssetId) continue;
    // `versions` viene de la más vieja a la más nueva: la última gana.
    pick.set(root, v);
  }
  const seen = new Set<string>();
  const out: CardImageVersionDto[] = [];
  for (const v of versions) {
    const root = rootOf(v);
    if (seen.has(root)) continue;
    seen.add(root);
    out.push(pick.get(root)!);
  }
  return out;
}
