import { useState } from "react";
import type { ChannelAccountDto } from "@presencia/shared";
import { ApiError } from "./api.js";
import type { useChannels } from "./use-channels.js";

// Conectar una red (F6, ADR-009 addendum), compartido por Configuración ›
// Canales y el paso "¿Dónde publicas?" del onboarding (F12.5). Las dos
// pantallas se ven distinto, pero el baile es el mismo y no debe divergir:
//
// 1. Se pide un intent y se abre la página del proveedor en otra pestaña. Ahí
//    el creator conecta la red (o las redes) que quiera: el intent NO es de una
//    red en particular.
// 2. Al volver confirma, y el backend reclama por diff las cuentas nuevas. No
//    hay webhook que nos avise solo.

type Canales = Pick<ReturnType<typeof useChannels>, "createConnectIntent" | "claimConnectIntent">;

export interface ConexionEnCurso {
  intentId: string;
  connectUrl: string;
}

export function useConectarRed({ createConnectIntent, claimConnectIntent }: Canales) {
  const [enCurso, setEnCurso] = useState<ConexionEnCurso | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function iniciar(): Promise<boolean> {
    setMensaje(null);
    // La pestaña se abre YA, dentro del click, y se lleva a la página del
    // proveedor cuando llega el intent. Abrirla después del `await` la dejaba
    // fuera del gesto del usuario, y Safari (iPhone incluido) y Firefox la
    // bloqueaban sin error: la fila decía "Esperando…" y nada se abría
    // (revisión del PR4 de F12.5).
    const pestana = window.open("about:blank", "_blank");
    try {
      const intent = await createConnectIntent();
      if (!pestana) {
        setMensaje(
          "Tu navegador bloqueó la pestaña para conectar. Permite ventanas emergentes para Presencia e inténtalo de nuevo.",
        );
        return false;
      }
      // Lo que hacía "noopener": la página del proveedor no alcanza la nuestra.
      pestana.opener = null;
      pestana.location.href = intent.connectUrl;
      setEnCurso({ intentId: intent.id, connectUrl: intent.connectUrl });
      return true;
    } catch {
      pestana?.close();
      setMensaje("No pudimos iniciar la conexión. Inténtalo de nuevo.");
      return false;
    }
  }

  /** Las cuentas que llegaron; vacío si todavía no había ninguna nueva. */
  async function confirmar(): Promise<ChannelAccountDto[]> {
    if (!enCurso) return [];
    setOcupado(true);
    try {
      const reclamadas = await claimConnectIntent(enCurso.intentId);
      if (reclamadas.length === 0) {
        setMensaje(
          "No detectamos ninguna cuenta nueva todavía. Termina de conectar tu red en la otra pestaña y vuelve a intentar.",
        );
      } else {
        setMensaje(null);
        setEnCurso(null);
      }
      return reclamadas;
    } catch (err) {
      setMensaje(err instanceof ApiError ? err.message : "Algo salió mal confirmando la conexión.");
      return [];
    } finally {
      setOcupado(false);
    }
  }

  function cancelar() {
    setEnCurso(null);
    setMensaje(null);
  }

  return { enCurso, mensaje, ocupado, iniciar, confirmar, cancelar };
}
