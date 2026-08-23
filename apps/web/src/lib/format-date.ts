// Compartido entre QuotaExhaustedModal, QuotaBanner y /configuracion/plan —
// evita que la fecha de renovación se muestre distinta en cada uno.
export function formatShortDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("es-MX", { day: "numeric", month: "long" });
}

// formatShortDateTime vivía acá (F6, banners de la card programada). Se fue
// en F7: formateaba en la zona del NAVEGADOR y en 12 h, así que la misma
// card decía "18:00" en el calendario y "06:00 p.m." en su banner. Su
// reemplazo es formatScheduleDateTime (lib/calendar/tz.ts), que recibe la
// zona del usuario explícita. Las fechas de renovación de cuota siguen acá:
// son un día, sin hora, y no dependen de la zona.
