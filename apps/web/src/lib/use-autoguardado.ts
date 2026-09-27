import { useEffect, useRef, useState } from "react";
import { ApiError } from "./api.js";
import { Autoguardado, type EstadoDeCampo } from "./autoguardado.js";

const ERROR_POR_DEFECTO = "No pudimos guardar. Vuelve a intentarlo.";

interface Opciones<P> {
  enviar: (parche: P) => Promise<void>;
  combinar: (anterior: P, nuevo: P) => P;
}

/**
 * El autoguardado de una pantalla de Configuración (ver lib/autoguardado.ts).
 *
 * `enviar` puede cambiar en cada render (cierra sobre el estado de la
 * pantalla): se guarda en una ref para que el motor, que vive lo que vive la
 * pantalla, siempre llame a la versión vigente. Al desmontar se manda lo que
 * haya pendiente: salir de la página no puede tirar lo último que se escribió.
 */
export function useAutoguardado<P>({ enviar, combinar }: Opciones<P>) {
  const [estados, setEstados] = useState<ReadonlyMap<string, EstadoDeCampo>>(new Map());
  const enviarRef = useRef(enviar);
  enviarRef.current = enviar;
  const combinarRef = useRef(combinar);
  combinarRef.current = combinar;

  const [motor] = useState(
    () =>
      new Autoguardado<P>({
        enviar: (parche) => enviarRef.current(parche),
        combinar: (a, b) => combinarRef.current(a, b),
        alCambiar: setEstados,
        mensajeDeError: (error) => (error instanceof ApiError ? error.message : ERROR_POR_DEFECTO),
      }),
  );

  // Vaciar y NO cerrar: en StrictMode React desmonta y vuelve a montar el
  // efecto con el MISMO estado, así que un motor cerrado acá quedaba muerto
  // para el resto de la vida de la pantalla y nada se guardaba. Vaciar es
  // idempotente y a un componente desmontado de verdad no le hace daño que
  // la marca de "guardado" se apague sola después.
  useEffect(() => {
    return () => {
      void motor.vaciarYa();
    };
  }, [motor]);

  return {
    programar: motor.programar.bind(motor),
    tienePendiente: motor.tienePendiente.bind(motor),
    estado: (campo: string): EstadoDeCampo | undefined => estados.get(campo),
  };
}
