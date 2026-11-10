import { AlertCircle, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { STYLE_NOTE_MAX_LENGTH, STYLE_NOTES_MAX, type SocialNetwork } from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { BotonAtras, BotonSecundario, Etiqueta, Pie, Titulo } from "./Piezas.js";

// Paso 5 · Así suenas (Onboarding v2, ScreenSuenas). El cierre: lo que
// notamos en sus publicaciones («Así escribes», editable) y un post en su voz.
// Es el momento de mayor intención, así que termina en el chat con ese
// borrador, no en un "listo".
//
// Presentacional: la ruta llama a la API y le pasa la fase. Así cada estado
// se puede ver en Storybook sin backend.

export type FaseSuenas = "cargando" | "listo" | "error-lectura" | "error-post";

export interface PasoSuenasProps {
  fase: FaseSuenas;
  sinMuestras: boolean;
  rasgos: string[];
  /** Los rasgos cambiaron desde que se escribió el post: "Ajustar" lo reescribe. */
  rasgosCambiados: boolean;
  post: string;
  red: SocialNetwork | null;
  regenerando: boolean;
  terminando: boolean;
  onCambiarRasgos: (rasgos: string[]) => void;
  onAjustar: () => void;
  onReintentar: () => void;
  onSeguirSin: () => void;
  onTerminar: () => void;
  onAtras: () => void;
}

const MENSAJES_CON_MUESTRAS = [
  "Leyendo cómo escribes…",
  "Fijándonos cómo abres y cómo cierras…",
  "Buscando tus palabras de siempre…",
  "Escribiendo un post en tu voz…",
];
const MENSAJES_SIN_MUESTRAS = ["Revisando tu perfil…", "Escribiendo un post en tu voz…"];

export function PasoSuenas(props: PasoSuenasProps) {
  const { fase, sinMuestras, post, red, regenerando, terminando, rasgosCambiados } = props;
  const error = fase === "error-lectura" || fase === "error-post";

  return (
    <>
      {fase === "cargando" && <Cargando sinMuestras={sinMuestras} />}

      {error && (
        <>
          <Titulo>Así suenas</Titulo>
          <div
            role="alert"
            className="flex gap-3 rounded-xl border border-error-border bg-error-bg p-4"
          >
            <AlertCircle
              size={20}
              strokeWidth={1.6}
              className="shrink-0 text-error-fg"
              aria-hidden
            />
            <div className="flex-1">
              <p className="mb-1 font-display text-[14.5px] font-semibold text-fg">
                {fase === "error-lectura"
                  ? "No pudimos leer tus publicaciones."
                  : "No pudimos escribir tu post."}
              </p>
              <p className="mb-3 text-[13px] leading-normal text-fg-secondary">
                Tus publicaciones siguen aquí. Puedes intentarlo otra vez o seguir sin esto.
              </p>
              <div className="flex flex-wrap gap-2">
                <BotonSecundario
                  onClick={props.onReintentar}
                  className="px-3.25! py-2! text-[13px]! text-fg!"
                >
                  Reintentar
                </BotonSecundario>
                <BotonSecundario
                  onClick={props.onSeguirSin}
                  className="border-transparent! bg-transparent! px-3.25! py-2! text-[13px]!"
                >
                  Seguir sin esto
                </BotonSecundario>
              </div>
            </div>
          </div>
        </>
      )}

      {fase === "listo" && (
        <>
          <Titulo
            sub={
              sinMuestras
                ? "Aún no tenemos publicaciones tuyas, así que partimos de tu perfil. Presencia aprende de cada post que edites."
                : "Esto es lo que notamos en tus publicaciones. Edita o quita lo que no te represente."
            }
          >
            Así suenas
          </Titulo>
          {!sinMuestras && <AsiEscribes {...props} />}
          <section>
            <Etiqueta>Un post en tu voz</Etiqueta>
            <article className="rounded-xl border border-line-subtle bg-card p-4.5 shadow-xs">
              <div className="mb-3 flex items-center gap-2 text-fg-secondary">
                {red &&
                  (() => {
                    const Logo = NETWORK_META[red].Logo;
                    return <Logo size={18} />;
                  })()}
                <span className="font-display text-xs font-semibold">
                  Borrador{red ? ` para ${NETWORK_META[red].label}` : ""}
                </span>
              </div>
              {regenerando ? (
                <Esqueleto
                  renglones={["w-full", "w-[92%]", "w-[70%] mb-4", "w-[86%]", "w-[54%]"]}
                />
              ) : (
                <p className="text-[15px] leading-relaxed text-pretty whitespace-pre-wrap text-fg">
                  {post}
                </p>
              )}
            </article>
            {rasgosCambiados && !regenerando && (
              <p className="mt-2.5 text-[12.5px] text-brand">
                Cambiaste tus rasgos. Toca «Ajustar» para reescribir el post.
              </p>
            )}
          </section>
        </>
      )}

      {fase !== "cargando" && (
        <>
          <Pie>
            <BotonAtras onClick={props.onAtras} soloIcono />
            {fase === "listo" && (
              <BotonSecundario
                onClick={props.onAjustar}
                disabled={regenerando || terminando}
                className={`inline-flex items-center gap-1.5 ${
                  rasgosCambiados ? "border-line-focus! bg-tint-plum! text-brand!" : ""
                }`}
              >
                <RefreshCw size={15} strokeWidth={1.8} aria-hidden />
                Ajustar
              </BotonSecundario>
            )}
            <button
              type="button"
              onClick={props.onTerminar}
              disabled={regenerando || terminando}
              // En móvil va primero y a todo lo ancho: junto a ← y "Ajustar" se
              // partía en tres renglones a 375px.
              className="flex-1 rounded-[10px] bg-accent-cta px-4 py-2.75 font-display text-sm font-semibold tracking-tight text-accent-cta-fg transition-[transform,background-color] hover:bg-accent-cta-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 max-[520px]:order-first max-[520px]:basis-full"
            >
              {terminando
                ? "Un momento…"
                : fase === "listo"
                  ? "Se oye como yo → Crear mi primer post"
                  : "Crear mi primer post →"}
            </button>
          </Pie>
          <p className="mt-3 text-center text-xs text-fg-muted">
            Todo esto lo puedes cambiar después en Configuración › Voz de marca.
          </p>
        </>
      )}
    </>
  );
}

function Cargando({ sinMuestras }: { sinMuestras: boolean }) {
  const mensajes = sinMuestras ? MENSAJES_SIN_MUESTRAS : MENSAJES_CON_MUESTRAS;
  const [indice, setIndice] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIndice((i) => Math.min(i + 1, mensajes.length - 1)), 1600);
    return () => clearInterval(t);
  }, [mensajes.length]);

  return (
    <div aria-live="polite" aria-busy="true">
      <p className="mb-2 flex items-center gap-2 font-display text-[13px] font-semibold text-accent">
        <Sparkles size={15} strokeWidth={1.6} className="motion-safe:animate-pulse" aria-hidden />
        {mensajes[indice]}
      </p>
      <Titulo>Así suenas</Titulo>
      <div className="mt-4.5">
        {!sinMuestras && (
          <div className="mb-5.5">
            <Etiqueta>Así escribes</Etiqueta>
            {["w-[72%]", "w-[58%]", "w-[80%]", "w-[46%]"].map((ancho) => (
              <div key={ancho} className="flex items-center gap-2.5 px-2.5 py-2">
                <span className="skeleton size-1.5 rounded-full" />
                <span className={`skeleton h-3 rounded-md ${ancho}`} />
              </div>
            ))}
          </div>
        )}
        <Etiqueta>Un post en tu voz</Etiqueta>
        <div className="rounded-xl border border-line-subtle p-4.5">
          <Esqueleto
            renglones={[
              "w-[40%] h-2.5! mb-4",
              "w-full",
              "w-[92%]",
              "w-[70%] mb-4",
              "w-[86%]",
              "w-[54%]",
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function Esqueleto({ renglones }: { renglones: string[] }) {
  return (
    <div aria-hidden>
      {renglones.map((clase) => (
        <div key={clase} className={`skeleton mb-2 h-3 rounded-md ${clase}`} />
      ))}
    </div>
  );
}

/** «Así escribes»: cada rasgo se edita en su lugar, como en el mock. */
function AsiEscribes({ rasgos, onCambiarRasgos }: PasoSuenasProps) {
  const [editando, setEditando] = useState<number | null>(null);

  function confirmar(i: number, texto: string) {
    const limpio = texto.trim();
    // Vaciar un rasgo es quitarlo.
    onCambiarRasgos(
      limpio ? rasgos.map((r, j) => (j === i ? limpio : r)) : rasgos.filter((_, j) => j !== i),
    );
    setEditando(null);
  }

  return (
    <section>
      <Etiqueta>Así escribes</Etiqueta>
      <ul className="-mx-2.5 -mr-2">
        {rasgos.map((rasgo, i) => (
          <li
            // El rasgo puede repetirse a medias mientras se edita; el índice
            // es la identidad de la fila.
            key={i}
            className="group flex items-center gap-2.5 rounded-[10px] py-1.75 pr-2 pl-2.5 hover:bg-secondary"
          >
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-line-focus" />
            {editando === i ? (
              <input
                autoFocus
                defaultValue={rasgo}
                maxLength={STYLE_NOTE_MAX_LENGTH}
                aria-label="Rasgo"
                placeholder="Describe un rasgo…"
                onBlur={(e) => confirmar(i, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmar(i, e.currentTarget.value);
                  if (e.key === "Escape") confirmar(i, rasgo);
                }}
                className="min-w-0 flex-1 border-b-[1.5px] border-line-focus bg-transparent py-0.5 text-sm text-fg outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditando(i)}
                title="Editar"
                className="min-w-0 flex-1 cursor-text py-0.5 text-left text-sm leading-snug text-fg"
              >
                {rasgo}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                onCambiarRasgos(rasgos.filter((_, j) => j !== i));
                setEditando(null);
              }}
              aria-label={`Quitar «${rasgo}»`}
              className="flex rounded-md p-1 text-fg-muted opacity-60 group-hover:opacity-100 hover:bg-secondary-hover focus-visible:opacity-100 pointer-coarse:opacity-100"
            >
              <X size={14} strokeWidth={1.8} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {rasgos.length < STYLE_NOTES_MAX && (
        <button
          type="button"
          onClick={() => {
            onCambiarRasgos([...rasgos, ""]);
            setEditando(rasgos.length);
          }}
          className="mt-1 flex items-center gap-1.5 py-1 font-display text-[13px] font-medium text-brand"
        >
          <Plus size={15} strokeWidth={1.8} aria-hidden />
          Agregar rasgo
        </button>
      )}
    </section>
  );
}
