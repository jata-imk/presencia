import { authClient } from "../auth-client.js";

// F10.8.4: distinguir "tu sesión cerró" de "nunca entraste" o "cerraste
// sesión tú". ProtectedLayout manda a /login en los tres casos; solo el
// primero lleva el aviso de sesión expirada (Auth Flow.html, "Sesión
// expirada"). Vive en módulo y no en estado de React: lo leen dos rutas
// distintas (el layout que redirige y el login que avisa) y solo importa
// dentro de esta pestaña.

let huboSesion = false;
let salidaVoluntaria = false;

/**
 * El layout vio una sesión válida en esta pestaña. No toca
 * `salidaVoluntaria`: el layout se vuelve a pintar con la sesión todavía
 * puesta justo después de "Cerrar sesión", y borrarla aquí haría que esa
 * salida se leyera como sesión expirada. La limpia el login (olvidarSesion).
 */
export function registrarSesion(): void {
  huboSesion = true;
}

/** ¿La sesión que había se perdió sin que el usuario cerrara sesión? */
export function sesionExpiro(): boolean {
  return huboSesion && !salidaVoluntaria;
}

/** El login ya mostró (o descartó) el aviso: no se repite. */
export function olvidarSesion(): void {
  huboSesion = false;
  salidaVoluntaria = false;
}

/** "Cerrar sesión" del menú: una salida a propósito no es una sesión expirada. */
export async function cerrarSesion(): Promise<void> {
  salidaVoluntaria = true;
  await authClient.signOut();
}

/**
 * La ruta a la que se vuelve después de entrar. Solo rutas propias: un
 * `from` que no empieza con una sola "/" (una URL de afuera, "//otro.com")
 * se ignora.
 */
export function rutaDeRegreso(from: unknown): string {
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return "/chats";
  if (from === "/login" || from === "/signup") return "/chats";
  return from;
}
