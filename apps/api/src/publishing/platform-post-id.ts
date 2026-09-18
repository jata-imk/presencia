/**
 * Estrecha un valor al id nativo de un post en la red (`<pageId>_<postId>` en
 * Facebook, `urn:li:share:…` en LinkedIn, el id del tweet en X).
 *
 * Los dos adapters reales lo sacan de una respuesta tipada con `request<T>()`,
 * que es un cast y no validación, así que sin esto un número o un objeto
 * llegaría hasta el UPDATE de la reconciliación y tumbaría el batch entero.
 *
 * El string vacío se degrada a `null` a propósito, y no es cosmético: la
 * ingesta de métricas selecciona las cards publicadas con id nativo, y un `""`
 * no es ninguna de las dos cosas — pasaría el filtro y después le pediría
 * métricas al proveedor por un post que no existe. `null` significa "este
 * proveedor no me dijo dónde quedó", que es un caso legítimo y esperado.
 */
export function parsePlatformPostId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
