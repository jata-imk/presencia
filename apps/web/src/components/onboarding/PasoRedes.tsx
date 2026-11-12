import { Check } from "lucide-react";
import type { SocialNetwork } from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { BotonAtras, BotonPrimario, BotonSecundario, Pie, Titulo } from "./Piezas.js";

// Paso 3 · ¿Dónde publicas? (Onboarding v2, ScreenRedes). Antes decía "Muy
// pronto": la publicación existe desde F6/F7.5 y nadie volvió a este paso
// (hallazgo en prod, 2026-09-16). Omitible: no todos conectan en el minuto uno.
//
// El intent de conexión NO es de una red (use-conectar-red.ts): cualquier
// "Conectar" abre la misma página del proveedor, donde conecta la que quiera.
// La fila que tocó solo dice dónde se ve el "Esperando…"; al confirmar se
// marcan las redes que de verdad llegaron.

const RECOMENDADAS: SocialNetwork[] = ["facebook", "instagram", "tiktok"];
const OTRAS: SocialNetwork[] = ["linkedin", "x", "youtube", "threads"];

export interface PasoRedesProps {
  conectadas: ReadonlySet<SocialNetwork>;
  /** La fila que abrió la conexión en curso, o `null`. */
  esperando: SocialNetwork | null;
  mensaje: string | null;
  ocupado: boolean;
  onConectar: (red: SocialNetwork) => void;
  onConfirmar: () => void;
  onCancelar: () => void;
  onSiguiente: () => void;
  onAtras: () => void;
}

export function PasoRedes(props: PasoRedesProps) {
  const { conectadas, onSiguiente, onAtras, mensaje } = props;
  return (
    <>
      <Titulo sub="Conecta una red y abrimos su ventana para que inicies sesión. Puedes hacerlo después.">
        ¿Dónde publicas?
      </Titulo>

      <div>
        <Grupo fuerte>Recomendadas</Grupo>
        <ul className="mb-3.5 flex flex-col gap-1.75">
          {RECOMENDADAS.map((red) => (
            <FilaRed key={red} red={red} grande {...props} />
          ))}
        </ul>
        <Grupo>También disponibles</Grupo>
        <ul className="flex flex-col gap-1.75">
          {OTRAS.map((red) => (
            <FilaRed key={red} red={red} {...props} />
          ))}
        </ul>
      </div>

      {mensaje && (
        <p role="status" className="mt-4 text-[13px] leading-snug text-warning-fg">
          {mensaje}
        </p>
      )}
      <Pie>
        <BotonAtras onClick={onAtras} />
        <BotonSecundario onClick={onSiguiente}>Conectar después</BotonSecundario>
        <BotonPrimario onClick={onSiguiente} disabled={conectadas.size === 0}>
          Continuar →
        </BotonPrimario>
      </Pie>
    </>
  );
}

function Grupo({ children, fuerte = false }: { children: string; fuerte?: boolean }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span
        className={`font-display text-[11px] font-semibold tracking-wider whitespace-nowrap uppercase ${
          fuerte ? "text-brand" : "text-fg-muted"
        }`}
      >
        {children}
      </span>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}

function FilaRed({
  red,
  grande = false,
  conectadas,
  esperando,
  ocupado,
  onConectar,
  onConfirmar,
  onCancelar,
}: PasoRedesProps & { red: SocialNetwork; grande?: boolean }) {
  const meta = NETWORK_META[red];
  const conectada = conectadas.has(red);
  const enEspera = esperando === red;
  // Mientras hay una conexión en curso, las demás filas esperan: es el mismo
  // intent, abrir otro dejaría el primero huérfano.
  const bloqueada = esperando !== null && !enEspera;
  return (
    <li
      className={`overflow-hidden rounded-[10px] border-[1.5px] transition-colors ${
        conectada
          ? "border-success-border bg-success-bg"
          : enEspera
            ? "border-line-focus bg-card"
            : "border-line bg-card"
      }`}
    >
      <button
        type="button"
        onClick={() => onConectar(red)}
        disabled={conectada || esperando !== null}
        className={`flex w-full items-center gap-3.25 text-left disabled:cursor-default ${
          grande ? "px-3.25 py-2.5" : "px-3 py-2"
        } ${bloqueada ? "opacity-50" : ""}`}
      >
        <span
          className={`flex shrink-0 items-center justify-center rounded-lg bg-secondary ${
            grande ? "size-8.5" : "size-7"
          }`}
        >
          <meta.Logo size={grande ? 18 : 16} />
        </span>
        <span className="flex flex-1 flex-col gap-px">
          <span
            className={`font-display font-semibold text-fg ${grande ? "text-[13.5px]" : "text-[13px]"}`}
          >
            {meta.label}
          </span>
          {enEspera && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-fg-secondary">
              <span
                aria-hidden
                className="size-3 animate-spin rounded-full border-2 border-line border-t-brand"
              />
              Esperando a que conectes…
            </span>
          )}
          {conectada && (
            <span className="inline-flex items-center gap-1.25 text-xs font-semibold text-success-fg">
              <Check size={13} strokeWidth={2} aria-hidden />
              Conectada
            </span>
          )}
        </span>
        {!conectada && !enEspera && (
          <span className="font-display text-[12.5px] font-semibold text-brand">Conectar</span>
        )}
      </button>
      {enEspera && (
        <div className={`flex flex-wrap gap-2 pr-3.5 pb-3 ${grande ? "pl-15" : "pl-13.25"}`}>
          <BotonSecundario
            onClick={onConfirmar}
            disabled={ocupado}
            className="border-line-focus px-3! py-1.75! text-[12.5px]! font-semibold! text-brand!"
          >
            {ocupado ? "Revisando…" : "Ya conecté mi cuenta"}
          </BotonSecundario>
          <BotonSecundario
            onClick={onCancelar}
            disabled={ocupado}
            className="border-transparent! bg-transparent! px-3! py-1.75! text-[12.5px]!"
          >
            Cancelar
          </BotonSecundario>
        </div>
      )}
    </li>
  );
}
