// El motor del autoguardado de Configuración (F9.7). Sin React a propósito:
// lo que puede salir mal acá —dos requests cruzados, un cambio que se pierde
// entre el envío y la respuesta, un error pegado al campo equivocado— es
// lógica de tiempo, y se prueba con timers falsos, no montando una pantalla.
//
// El modelo:
//
//  - Cada cambio llega con el CAMPO que lo produjo y un PARCHE. Los parches
//    pendientes se combinan (`combinar`): Voz de marca los fusiona en un solo
//    PATCH; Tendencias se queda con el último, porque su PUT reemplaza todo.
//  - Espera `retrasoMs` sin cambios nuevos antes de mandar (debounce). Un
//    cambio discreto —un switch, un chip— pide `inmediato` y no espera.
//  - Nunca hay dos envíos en vuelo. Lo que llega mientras uno viaja se junta
//    y sale apenas vuelve. Así la respuesta vieja nunca pisa a la nueva en el
//    servidor.
//  - El estado es por campo: "guardando", "guardado" (que se apaga solo) o
//    "error" con su mensaje, que se queda hasta que el campo vuelve a cambiar.
//  - Un envío que falla NO se tira: su parche vuelve a la cola y sale con el
//    siguiente cambio (de ese campo o de cualquier otro), o al salir de la
//    página. No se reintenta solo, para no martillar un servidor caído ni
//    repetir en bucle un rechazo; lo que no puede pasar es que un corte de red
//    borre en silencio lo que el usuario escribió.

export type EstadoDeCampo =
  { tipo: "guardando" } | { tipo: "guardado" } | { tipo: "error"; mensaje: string };

export interface OpcionesDeAutoguardado<P> {
  enviar: (parche: P) => Promise<void>;
  combinar: (anterior: P, nuevo: P) => P;
  /** Se llama con el mapa completo cada vez que cambia algún estado. */
  alCambiar: (estados: ReadonlyMap<string, EstadoDeCampo>) => void;
  /** Traduce un error de `enviar` a lo que se le dice al usuario. */
  mensajeDeError: (error: unknown) => string;
  retrasoMs?: number;
  /** Cuánto dura visible la marca de "guardado". */
  guardadoVisibleMs?: number;
}

export const RETRASO_POR_DEFECTO_MS = 800;
export const GUARDADO_VISIBLE_MS = 2000;

export class Autoguardado<P> {
  private pendiente: P | null = null;
  private camposPendientes = new Set<string>();
  private enVuelo = false;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private readonly apagados = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly estados = new Map<string, EstadoDeCampo>();

  constructor(private readonly opciones: OpcionesDeAutoguardado<P>) {}

  /** Anota un cambio. `inmediato` salta la espera (switches, chips, selects). */
  programar(campo: string, parche: P, { inmediato = false } = {}): void {
    this.pendiente =
      this.pendiente === null ? parche : this.opciones.combinar(this.pendiente, parche);
    this.camposPendientes.add(campo);
    // Volver a tocar un campo con error es la forma de reintentar: el error
    // viejo ya no describe lo que hay escrito.
    if (this.estados.get(campo)?.tipo === "error") this.quitarEstado(campo);

    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    if (inmediato) {
      void this.vaciar();
      return;
    }
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.vaciar();
    }, this.opciones.retrasoMs ?? RETRASO_POR_DEFECTO_MS);
  }

  /**
   * ¿Hay un cambio de este campo que todavía no SALIÓ? Lo que está en vuelo no
   * cuenta: quien procesa la respuesta de un envío pregunta esto para saber si
   * puede aplicarla, y la respuesta de un envío siempre describe sus propios
   * campos. Lo que no describe es lo que se escribió después.
   */
  tienePendiente(campo: string): boolean {
    return this.camposPendientes.has(campo);
  }

  /**
   * Manda ya lo que haya pendiente, sin esperar el debounce. Al salir de la
   * página: un cambio escrito hace menos de `retrasoMs` no puede perderse
   * solo porque el usuario navegó rápido.
   */
  vaciarYa(): Promise<void> {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    return this.vaciar();
  }

  private async vaciar(): Promise<void> {
    if (this.enVuelo || this.pendiente === null) return;
    const parche = this.pendiente;
    const campos = [...this.camposPendientes];
    this.pendiente = null;
    this.camposPendientes.clear();

    this.enVuelo = true;
    for (const campo of campos) this.fijar(campo, { tipo: "guardando" });
    try {
      await this.opciones.enviar(parche);
      for (const campo of campos) this.marcarGuardado(campo);
    } catch (error) {
      const mensaje = this.opciones.mensajeDeError(error);
      for (const campo of campos) {
        // Si el campo volvió a cambiar mientras viajaba, su error ya no
        // aplica: el envío siguiente lleva su valor nuevo.
        if (!this.camposPendientes.has(campo)) this.fijar(campo, { tipo: "error", mensaje });
      }
      // De vuelta a la cola, DEBAJO de lo que llegó mientras viajaba: lo nuevo
      // manda sobre lo viejo al combinar. Si no llegó nada nuevo, se queda
      // esperando al próximo cambio en vez de reintentarse solo.
      const nuevo = this.pendiente;
      this.pendiente = nuevo === null ? parche : this.opciones.combinar(parche, nuevo);
      for (const campo of campos) this.camposPendientes.add(campo);
      if (nuevo === null) return;
    } finally {
      this.enVuelo = false;
    }
    // Lo que se juntó mientras este viajaba sale ahora, salvo que esté
    // esperando su debounce: ese timer ya lo va a mandar.
    if (this.pendiente !== null && this.temporizador === null) await this.vaciar();
  }

  private marcarGuardado(campo: string): void {
    // Un campo que cambió de nuevo mientras viajaba no está "guardado": lo
    // que se ve en pantalla es otra cosa todavía.
    if (this.camposPendientes.has(campo)) {
      this.quitarEstado(campo);
      return;
    }
    this.fijar(campo, { tipo: "guardado" });
    const apagar = setTimeout(() => {
      this.apagados.delete(campo);
      if (this.estados.get(campo)?.tipo === "guardado") this.quitarEstado(campo);
    }, this.opciones.guardadoVisibleMs ?? GUARDADO_VISIBLE_MS);
    this.apagados.set(campo, apagar);
  }

  private fijar(campo: string, estado: EstadoDeCampo): void {
    const previo = this.apagados.get(campo);
    if (previo) {
      clearTimeout(previo);
      this.apagados.delete(campo);
    }
    this.estados.set(campo, estado);
    this.notificar();
  }

  private quitarEstado(campo: string): void {
    if (this.estados.delete(campo)) this.notificar();
  }

  private notificar(): void {
    this.opciones.alCambiar(new Map(this.estados));
  }
}
