// Compartido entre QuotaExhaustedModal, QuotaBanner y /configuracion/plan —
// evita que la fecha de renovación se muestre distinta en cada uno.
export function formatShortDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("es-MX", { day: "numeric", month: "long" });
}

// F6: banners de la card programada/publicada — misma fecha corta + hora.
export function formatShortDateTime(date: string | Date): string {
  const d = new Date(date);
  const day = formatShortDate(d);
  const time = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}
