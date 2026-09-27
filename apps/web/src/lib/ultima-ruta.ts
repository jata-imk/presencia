// A dónde vuelve la flecha de Configuración (F9.7).
//
// Configuración tiene su propio shell y se navega entre sub-páginas, así que
// `history.back()` regresaría a la sub-página anterior y no a la app. Se
// recuerda la última ruta de la app fuera de Configuración; sin ninguna (se
// entró directo por URL), Chats.
//
// En memoria y no en storage: es navegación de esta pestaña, y al recargar
// dentro de Configuración volver a Chats es un default razonable.

const PREFIJO_CONFIGURACION = "/configuracion";
const POR_DEFECTO = "/chats";

let ultima: string | null = null;

export function recordarRutaDeLaApp(pathname: string, search = ""): void {
  if (pathname === PREFIJO_CONFIGURACION || pathname.startsWith(`${PREFIJO_CONFIGURACION}/`)) {
    return;
  }
  ultima = `${pathname}${search}`;
}

export function ultimaRutaDeLaApp(): string {
  return ultima ?? POR_DEFECTO;
}
