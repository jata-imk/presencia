// Validación de los formularios de acceso (F10.8.4). Solo da forma a lo que
// se ve: la regla de verdad la aplica Better Auth en el servidor (8
// caracteres mínimo, correo válido).

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function errorDeCorreo(correo: string): string | null {
  if (!correo.trim()) return "Escribe tu correo para continuar.";
  if (!CORREO.test(correo.trim())) return "Revisa tu correo, parece que le falta algo.";
  return null;
}

export const MINIMO_CONTRASENA = 8;

export interface FuerzaDeContrasena {
  criterios: { largo: boolean; mayuscula: boolean; numero: boolean; simbolo: boolean };
  /** 0 a 4: cuántos criterios cumple. */
  puntos: number;
}

export function fuerzaDeContrasena(contrasena: string): FuerzaDeContrasena {
  const criterios = {
    largo: contrasena.length >= MINIMO_CONTRASENA,
    mayuscula: /[A-ZÁÉÍÓÚÑ]/.test(contrasena),
    numero: /[0-9]/.test(contrasena),
    simbolo: /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/.test(contrasena),
  };
  return { criterios, puntos: Object.values(criterios).filter(Boolean).length };
}

/** El nombre de cada nivel, del 1 al 4 (0 no se pinta). */
export const NIVELES = ["", "Débil", "Aceptable", "Buena", "Excelente"] as const;
