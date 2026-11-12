import { LoaderCircle, PenLine, ScanSearch, Sparkles } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  REVISAR_EDICIONES_MINIMO,
  STYLE_NOTES_MAX,
  type PropuestaDeVozDto,
  type QuotaStatusDto,
  type RevisionDeEdicionesDto,
  type PropuestasDeVozDto,
} from "@presencia/shared";
import { ApiError, apiFetch } from "../../lib/api.js";
import { cuotaAgotadaDe } from "../../lib/cuota-agotada.js";
import { useVozVivaStore } from "../../stores/voz-viva-store.js";
import { QuotaExhaustedModal } from "../QuotaExhaustedModal.js";
import { Toggle } from "../ui/Toggle.js";
import { Aviso, Seccion } from "./primitivas.js";

// «Aprender de mis ediciones» (F12.5, voz viva; Claude Design "Voz de marca
// v3"). Cuando el creator edita un borrador antes de programarlo, las reglas
// de packages/shared/src/voz-viva.ts notan patrones y proponen un rasgo para
// «Así escribes». Nada cambia sin que diga que sí.
//
// - "Agregar" suma el rasgo por el mismo camino que «Así escribes» (`onAgregar`
//   → autoguardado de la página): un solo escritor de `style_notes`.
// - «Revisar mis ediciones» llama al modelo y se cobra; sin precio en el botón
//   (addendum ADR-012). El diseño traía "≈3 créditos" y no va.

/** Cómo terminó sumar un rasgo a «Así escribes». */
export type ResultadoDeAgregar = "ok" | "lleno" | "error";

interface AprenderDeEdicionesProps {
  /** Suma el rasgo a «Así escribes» y espera a que se guarde. */
  onAgregar: (rasgo: string) => Promise<ResultadoDeAgregar>;
}

export function AprenderDeEdiciones({ onAgregar }: AprenderDeEdicionesProps) {
  const { datos, error: errorDeCarga, cargar, poner, quitar, ponerRevision } = useVozVivaStore();
  const [cambiando, setCambiando] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [sinPatron, setSinPatron] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cuota, setCuota] = useState<QuotaStatusDto | null>(null);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function cambiar(aprender: boolean) {
    setCambiando(true);
    setError(null);
    setSinPatron(false);
    try {
      poner(
        await apiFetch<PropuestasDeVozDto>("/api/brand-voice/aprender", {
          method: "PUT",
          body: { aprender },
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No pudimos guardar el cambio.");
    } finally {
      setCambiando(false);
    }
  }

  async function revisar() {
    setRevisando(true);
    setError(null);
    setSinPatron(false);
    try {
      const { propuestas } = await apiFetch<RevisionDeEdicionesDto>(
        "/api/brand-voice/revisar-ediciones",
        { method: "POST" },
      );
      ponerRevision(propuestas);
      setSinPatron(propuestas.length === 0);
    } catch (e) {
      const agotada = cuotaAgotadaDe(e);
      if (agotada) setCuota(agotada);
      else setError(e instanceof ApiError ? e.message : "No pudimos revisar tus ediciones.");
    } finally {
      setRevisando(false);
    }
  }

  const aprender = datos?.aprender ?? true;
  const propuestas = datos?.propuestas ?? [];
  const puedeRevisar = (datos?.edicionesParaRevisar ?? 0) >= REVISAR_EDICIONES_MINIMO;

  return (
    <Seccion
      icono={PenLine}
      titulo="Aprender de mis ediciones"
      subtitulo="Cuando editas un borrador antes de programarlo, notamos patrones y te proponemos ajustes. Nada cambia sin que digas que sí."
      accion={
        <Toggle
          checked={aprender}
          disabled={datos === null || cambiando}
          onChange={(siguiente) => void cambiar(siguiente)}
          label="Aprender de mis ediciones"
        />
      }
    >
      {errorDeCarga && datos === null ? (
        <Aviso tono="error">No pudimos cargar tus propuestas.</Aviso>
      ) : !aprender ? (
        <p className="text-[12.5px] text-fg-muted">
          Apagado: no revisamos tus ediciones ni te proponemos ajustes.
        </p>
      ) : (
        <>
          <div aria-live="polite" className="flex flex-col gap-2.5">
            {revisando ? (
              <Revisando />
            ) : (
              propuestas.map((propuesta) => (
                <Propuesta
                  key={propuesta.id}
                  propuesta={propuesta}
                  onAgregar={onAgregar}
                  onListo={() => quitar(propuesta.id)}
                />
              ))
            )}
            {!revisando && propuestas.length === 0 && datos !== null && (
              <p className="text-[12.5px] text-fg-muted">
                {sinPatron
                  ? "No encontramos un patrón claro en tus últimas ediciones."
                  : "Todavía no vemos un patrón. Cuando edites tus borradores antes de programarlos, aquí te propondremos ajustes."}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <button
              type="button"
              onClick={() => void revisar()}
              disabled={revisando || !puedeRevisar}
              className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-line-focus bg-secondary px-3 py-1.5 font-display text-[12.5px] font-semibold text-brand transition-colors hover:bg-secondary-hover disabled:opacity-60"
            >
              {revisando ? (
                <LoaderCircle
                  size={14}
                  strokeWidth={1.8}
                  className="motion-safe:animate-spin"
                  aria-hidden
                />
              ) : (
                <ScanSearch size={14} strokeWidth={1.8} aria-hidden />
              )}
              {revisando ? "Revisando…" : "Revisar mis ediciones"}
            </button>
            <p className="text-[11.5px] text-fg-muted">
              {puedeRevisar || datos === null
                ? "Revisa con IA tus últimas ediciones y te muestra la evidencia."
                : `Necesitas al menos ${String(REVISAR_EDICIONES_MINIMO)} publicaciones editadas para revisarlas.`}
            </p>
          </div>
        </>
      )}
      {error && <Aviso tono="error">{error}</Aviso>}
      {cuota && <QuotaExhaustedModal quota={cuota} onDismiss={() => setCuota(null)} />}
    </Seccion>
  );
}

function Revisando() {
  return (
    <div aria-busy="true" className="rounded-lg border border-line-subtle bg-surface p-4">
      {["w-[82%]", "w-[60%] mb-4", "w-[74%]", "w-[48%]"].map((ancho) => (
        <div key={ancho} className={`skeleton mb-2.5 h-3 rounded-md ${ancho}`} />
      ))}
      <p className="mt-3 flex items-center gap-1.5 font-display text-xs font-medium text-fg-secondary">
        <LoaderCircle
          size={13}
          strokeWidth={1.8}
          className="motion-safe:animate-spin"
          aria-hidden
        />
        Revisando tus últimas ediciones…
      </p>
    </div>
  );
}

interface PropuestaProps {
  propuesta: PropuestaDeVozDto;
  onAgregar: (rasgo: string) => Promise<ResultadoDeAgregar>;
  /** Ya decidió: sale de la lista. */
  onListo: () => void;
}

function Propuesta({ propuesta, onAgregar, onListo }: PropuestaProps) {
  const [abierta, setAbierta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idEvidencia = useId();

  // Las de las reglas anotan la decisión: un "No" no se vuelve a preguntar
  // con la misma evidencia. Las de la IA son efímeras y no anotan nada.
  async function decidir(decision: "aceptada" | "descartada") {
    if (propuesta.origen === "ia") return;
    await apiFetch(`/api/brand-voice/propuestas/${propuesta.id}/decision`, {
      method: "POST",
      body: { decision },
    });
  }

  async function agregar() {
    setEnviando(true);
    setError(null);
    const resultado = await onAgregar(propuesta.rasgo);
    if (resultado !== "ok") {
      setError(
        resultado === "lleno"
          ? `Ya tienes ${String(STYLE_NOTES_MAX)} rasgos. Quita uno en «Así escribes» para agregar este.`
          : "No pudimos guardar el rasgo. Revisa «Así escribes» y vuelve a intentarlo.",
      );
      setEnviando(false);
      return;
    }
    onListo();
    // El rasgo ya está guardado; si anotar la decisión falla, la regla tampoco
    // vuelve a proponerlo: ya hay un rasgo que lo dice.
    await decidir("aceptada").catch(() => undefined);
  }

  async function descartar() {
    setEnviando(true);
    setError(null);
    try {
      await decidir("descartada");
      onListo();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No pudimos guardar tu respuesta.");
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-lg border border-info-border bg-info-bg px-3.5 py-3">
      <p className="flex gap-2 text-sm text-fg">
        <Sparkles size={15} strokeWidth={1.6} className="mt-0.5 shrink-0 text-info" aria-hidden />
        <span>
          {propuesta.mensaje} ¿Lo agregamos a tu voz?
          {/* Sin comillas alrededor: un rasgo como Dice «padre» ya trae las suyas. */}
          <span className="mt-0.5 block text-[12.5px] text-fg-secondary">
            Se suma a «Así escribes»: <span className="font-medium text-fg">{propuesta.rasgo}</span>
          </span>
        </span>
      </p>

      {abierta && (
        <ul id={idEvidencia} className="mt-2.5 flex flex-col gap-2 md:pl-6">
          {propuesta.evidencia.map((par) => (
            <li
              key={`${par.antes}→${par.despues}`}
              className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-line-subtle bg-card px-3 py-2 text-[12.5px]"
            >
              <span className="font-display text-[10px] font-bold tracking-wider text-fg-muted uppercase">
                Borrador
              </span>
              <span className="min-w-0 break-words text-fg-muted line-through">{par.antes}</span>
              <span className="font-display text-[10px] font-bold tracking-wider text-fg-muted uppercase">
                Tu edición
              </span>
              <span className="min-w-0 break-words text-fg">{par.despues}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2 md:pl-6">
        <button
          type="button"
          onClick={() => void agregar()}
          disabled={enviando}
          className="rounded-md bg-primary px-3 py-1.5 font-display text-[12.5px] font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60"
        >
          Agregar
        </button>
        <button
          type="button"
          onClick={() => void descartar()}
          disabled={enviando}
          className="rounded-md border border-line bg-card px-3 py-1.5 font-display text-[12.5px] font-semibold text-fg-secondary hover:bg-secondary disabled:opacity-60"
        >
          No
        </button>
        {propuesta.evidencia.length > 0 && (
          <button
            type="button"
            aria-expanded={abierta}
            aria-controls={abierta ? idEvidencia : undefined}
            onClick={() => setAbierta(!abierta)}
            className="ml-1 text-[12.5px] text-fg-secondary underline underline-offset-2 hover:text-fg"
          >
            {abierta ? "Ocultar evidencia" : "Ver evidencia"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-error-fg md:pl-6">
          {error}
        </p>
      )}
    </div>
  );
}
