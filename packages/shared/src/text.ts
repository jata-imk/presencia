// Normalización de texto compartida.
//
// Vive en su propio módulo, y no dentro de brand-voice.ts como nació, porque
// verticals.ts la necesita y brand-voice.ts necesita a verticals.ts: dejarla
// donde estaba creaba un ciclo de imports entre los dos.

// Quita acentos vía descomposición Unicode: "café" y "cafe" cuentan como el
// mismo modismo. La usan dos consumidores sin relación de dependencia: el
// servicio de voz de marca (prohibido gana sobre permitido) y
// scripts/cultural-suite/prohibited-word.ts (cuenta ocurrencias del modismo
// prohibido en las generaciones de prueba) — este último no puede importar de
// apps/api/src sin arrastrar Nest.
const COMBINING_DIACRITICS = /[\u0300-\u036f]/g;

export function normalizeExpression(term: string): string {
  return term.trim().toLowerCase().normalize("NFD").replace(COMBINING_DIACRITICS, "");
}
