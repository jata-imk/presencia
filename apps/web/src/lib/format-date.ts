// Compartido entre QuotaExhaustedModal, QuotaBanner y /configuracion/plan —
// evita que la fecha de renovación se muestre distinta en cada uno.
export function formatShortDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("es-MX", { day: "numeric", month: "long" });
}
