import { useEffect, useState } from "react";
import type { ImagesConfigDto } from "@presencia/shared";
import { apiFetch } from "./api.js";

// El precio de "Generar imagen" y si hay otro generador (F10). Una sola
// petición por sesión aunque haya diez cards en pantalla: la promesa se
// comparte. El precio solo cambia si cambia el plan, y eso recarga la app.
let pending: Promise<ImagesConfigDto | null> | null = null;

function load(): Promise<ImagesConfigDto | null> {
  pending ??= apiFetch<ImagesConfigDto>("/api/images/config").catch(() => {
    // Sin precio no se ofrece generar (la card sigue sirviendo para subir),
    // y el siguiente intento vuelve a pedirlo en vez de quedarse con el fallo.
    pending = null;
    return null;
  });
  return pending;
}

/**
 * F10.6: el config trae el estilo por defecto, que SÍ cambia sin recargar
 * (Configuración › Estilo visual). Quien lo cambia llama esto para que la
 * siguiente pantalla que lo pida no se quede con el viejo.
 */
export function forgetImagesConfig(): void {
  pending = null;
}

export function useImagesConfig(): ImagesConfigDto | null {
  const [config, setConfig] = useState<ImagesConfigDto | null>(null);
  useEffect(() => {
    let alive = true;
    void load().then((value) => {
      if (alive) setConfig(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return config;
}
