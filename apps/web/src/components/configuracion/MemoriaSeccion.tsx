import { BrainCircuit, MessageSquareX, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { ProfileDto } from "@presencia/shared";
import { ApiError, apiFetch } from "../../lib/api.js";
import { Button } from "../ui/Button.js";
import { Modal } from "../ui/Modal.js";
import { Toggle } from "../ui/Toggle.js";
import { Aviso, Seccion } from "./primitivas.js";

// Memoria entre chats (F12.5, Claude Design "Voz de marca v3"). Antes no
// había ni pantalla ni interruptor (presencia-chat.md, F10.8: "si un creator
// lo pide, se agrega"); Jose lo pidió al revisar la personalización de
// ChatGPT y Claude.
//
// - «Recordar entre chats» vive en el usuario (PATCH /api/me): apagada, el
//   chat no busca en sus otros chats y no se guarda nada nuevo para recordar.
// - «Borrar todo lo que recuerdo» (DELETE /api/memoria) borra los recuerdos,
//   no los chats. Pide confirmación: no se deshace.

export function MemoriaSeccion() {
  const [prendida, setPrendida] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const titulo = useId();

  useEffect(() => {
    apiFetch<ProfileDto>("/api/me")
      .then((me) => setPrendida(me.memoryEnabled))
      .catch(() => setError("No pudimos cargar tu memoria."));
  }, []);

  async function cambiar(siguiente: boolean) {
    const antes = prendida;
    setPrendida(siguiente);
    setError(null);
    setAviso(null);
    try {
      await apiFetch("/api/me", { method: "PATCH", body: { memoryEnabled: siguiente } });
    } catch (e) {
      setPrendida(antes);
      setError(e instanceof ApiError ? e.message : "No pudimos guardar el cambio.");
    }
  }

  async function borrarTodo() {
    setBorrando(true);
    setError(null);
    try {
      const { borrados } = await apiFetch<{ borrados: number }>("/api/memoria", {
        method: "DELETE",
      });
      setConfirmando(false);
      setAviso(
        borrados === 0
          ? "No había nada que olvidar."
          : "Listo: Presencia olvidó lo que recordaba de tus chats anteriores.",
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No pudimos borrar tu memoria.");
    } finally {
      setBorrando(false);
    }
  }

  return (
    <Seccion icono={BrainCircuit} titulo="Memoria">
      <div className="flex items-center justify-between gap-4 rounded-md border border-line bg-surface px-4 py-3.5">
        <div>
          <p className="font-display text-base font-semibold text-fg">Recordar entre chats</p>
          <p className="mt-0.5 text-xs leading-normal text-fg-secondary">
            Cuando mencionas algo de otra conversación, Presencia lo busca en tus chats anteriores.
          </p>
          {prendida === false && (
            <p className="mt-1.5 text-xs text-warning-fg">
              Apagada: no busca en tus otros chats, y mientras esté así no guarda nada nuevo para
              recordar.
            </p>
          )}
        </div>
        <Toggle
          checked={prendida ?? true}
          disabled={prendida === null}
          onChange={(siguiente) => void cambiar(siguiente)}
          label="Recordar entre chats"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs text-fg-muted">
          <MessageSquareX size={15} strokeWidth={1.6} aria-hidden />
          Borrar un chat borra lo que se recordaba de él.
        </p>
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="inline-flex items-center gap-2 rounded-lg border-[1.5px] border-error-border bg-card px-3.5 py-2 font-display text-[13px] font-semibold text-error-fg hover:bg-error-bg"
        >
          <Trash2 size={15} strokeWidth={1.8} aria-hidden />
          Borrar todo lo que recuerdo
        </button>
      </div>

      {aviso && (
        <p role="status" className="text-xs text-success-fg">
          {aviso}
        </p>
      )}
      {error && <Aviso tono="error">{error}</Aviso>}

      {confirmando && (
        <Modal onClose={() => !borrando && setConfirmando(false)} labelledBy={titulo}>
          <h2 id={titulo} className="mb-2 font-display text-md font-bold text-fg">
            ¿Borrar todo lo que recuerdo?
          </h2>
          <p className="mb-5 text-sm leading-normal text-fg-secondary">
            Presencia va a olvidar lo que sabe de tus chats anteriores. Tus chats no se borran.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmando(false)} disabled={borrando}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void borrarTodo()} disabled={borrando}>
              {borrando ? "Borrando…" : "Borrar memoria"}
            </Button>
          </div>
        </Modal>
      )}
    </Seccion>
  );
}
