import { useEffect, useState } from "react";

/**
 * Una cuenta regresiva en segundos (F10.8.4): el 429 de Better Auth con su
 * X-Retry-After en el login y en recuperar, y la espera para reenviar el
 * código. Devuelve los segundos que faltan (0 = ya se puede) y cómo empezarla.
 */
export function useEspera(): [number, (segundos: number) => void] {
  const [hasta, setHasta] = useState<number | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    if (hasta === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setAhora(t);
      if (t >= hasta) setHasta(null);
    }, 250);
    return () => clearInterval(id);
  }, [hasta]);
  const faltan = hasta === null ? 0 : Math.max(0, Math.ceil((hasta - ahora) / 1000));
  return [
    faltan,
    (segundos) => {
      setAhora(Date.now());
      setHasta(Date.now() + segundos * 1000);
    },
  ];
}

/** "1:00", "0:09". */
export function minutosYSegundos(segundos: number): string {
  return `${String(Math.floor(segundos / 60))}:${String(segundos % 60).padStart(2, "0")}`;
}

/** Los segundos del X-Retry-After de un 429, o null si no es un 429. */
export function esperaDe429(response: Response, porDefecto: number): number | null {
  if (response.status !== 429) return null;
  return Number(response.headers.get("X-Retry-After")) || porDefecto;
}
