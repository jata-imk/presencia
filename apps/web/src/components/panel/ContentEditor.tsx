import { Film, Hash, NotebookPen, Type } from "lucide-react";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  CARD_EDIT_SESSION_IDLE_MS,
  NETWORK_TEXT_LIMITS,
  buildPostText,
  type CardContent,
  type CardTextFields,
  type CardVersionDto,
  type PublicationCardDto,
} from "@presencia/shared";
import { editCardContent } from "../../lib/cards-api.js";
import { NETWORK_LABELS } from "../../lib/network-labels.js";
import { useAutoguardado } from "../../lib/use-autoguardado.js";
import { useCardsStore } from "../../stores/cards-store.js";
import { TagInput } from "../ui/TagInput.js";
import { Textarea } from "../ui/Textarea.js";
import { Counter, Section } from "./PanelParts.js";

// Editar a mano el texto de una card (F10.5 PR3). Autoguardado, como
// Configuración: cada pausa al escribir manda lo que cambió, y la API decide
// si es una versión nueva o la misma sesión de edición (decisión de F10.5:
// una versión por sesión, no una por tecla).
//
// La sesión es de este editor: nace al montarlo (abrir el panel, entrar a
// Editar, cambiar de pestaña) y se renueva si pasan 10 minutos sin guardar.
// Quien restaura una versión o recibe un cambio de la IA lo remonta con otra
// llave: lo que se escriba después ya es otra versión.

export type SaveState =
  { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

type Draft = CardContent;

const FIELD = "contenido";

export function ContentEditor({
  card,
  onSaved,
  onSaveState,
  flushRef,
}: {
  card: PublicationCardDto;
  onSaved: (version: CardVersionDto) => void;
  onSaveState: (state: SaveState) => void;
  /**
   * Quien va a reemplazar el texto (restaurar una versión) primero manda lo
   * pendiente y espera: si no, el autoguardado que sale al desmontar el
   * editor caería DESPUÉS del restore y lo pisaría. `false` si no se guardó.
   */
  flushRef: MutableRefObject<(() => Promise<boolean>) | null>;
}) {
  const applyCards = useCardsStore((s) => s.apply);
  const [draft, setDraft] = useState<Draft>(card.content);
  const session = useRef({ id: crypto.randomUUID(), last: Date.now() });
  // Hay algo escrito que el servidor todavía no confirmó. Propio y no del
  // motor: al desmontar, el cleanup de useAutoguardado corre primero y ya
  // vació la cola, así que preguntarle al motor diría "nada pendiente".
  const unsaved = useRef(false);

  const autoguardado = useAutoguardado<CardTextFields>({
    enviar: async (fields) => {
      if (Date.now() - session.current.last > CARD_EDIT_SESSION_IDLE_MS) {
        session.current.id = crypto.randomUUID();
      }
      session.current.last = Date.now();
      const result = await editCardContent(card.id, {
        fields,
        editSessionId: session.current.id,
      });
      applyCards(result.card);
      onSaved(result.version);
      if (!autoguardado.tienePendiente(FIELD)) unsaved.current = false;
    },
    combinar: (a, b) => ({ ...a, ...b }),
  });

  const estado = autoguardado.estado(FIELD);

  useEffect(() => {
    flushRef.current = () => autoguardado.vaciar();
    return () => {
      flushRef.current = null;
    };
  });

  // Al desmontar (pasar a Vista previa, ver una versión) lo pendiente se
  // manda igual (useAutoguardado), pero su resultado ya no llegaría a nadie:
  // el indicador del panel se quedaba en "Guardando…" y un error se perdía.
  // Se reporta aquí, al panel, que sigue montado.
  useEffect(
    () => () => {
      if (!unsaved.current) return;
      onSaveState({ kind: "saving" });
      void autoguardado.vaciar().then((ok) =>
        onSaveState(
          ok
            ? { kind: "saved" }
            : {
                kind: "error",
                message: "No se guardó tu último cambio. Vuelve a Editar para reintentarlo.",
              },
        ),
      );
    },
    // Solo al desmontar: el motor vive lo que vive el editor.
    [],
  );

  useEffect(() => {
    onSaveState(
      !estado
        ? { kind: "idle" }
        : estado.tipo === "error"
          ? { kind: "error", message: estado.mensaje }
          : { kind: estado.tipo === "guardando" ? "saving" : "saved" },
    );
  }, [estado, onSaveState]);

  // Si la card cambia desde otro lado (otra pestaña, el stream) mientras aquí
  // no hay nada pendiente, el borrador se pone al día. Con algo pendiente
  // manda lo que el usuario está escribiendo: pisarlo le borraría texto.
  const remoteKey = JSON.stringify(card.content);
  useEffect(() => {
    if (!autoguardado.tienePendiente(FIELD) && estado?.tipo !== "guardando") setDraft(card.content);
    // Solo cuando cambia la card; `estado` no debe disparar un reset.
  }, [remoteKey]);

  function change(fields: CardTextFields) {
    unsaved.current = true;
    setDraft((d) => ({ ...d, ...fields }));
    autoguardado.programar(FIELD, fields);
  }

  const limit = NETWORK_TEXT_LIMITS[card.network];
  const used = buildPostText(draft).length;
  const counter = <Counter used={used} limit={limit} network={NETWORK_LABELS[card.network]} />;
  const tags = (
    <Section title="Hashtags" Icon={Hash} meta={String(draft.hashtags.length)}>
      <TagInput
        value={draft.hashtags}
        onChange={(hashtags) => change({ hashtags })}
        placeholder="Agrega un hashtag y presiona Enter"
        maxItems={30}
        maxLength={100}
        // Se guardan sin "#": el texto publicado se lo pone (buildPostText).
        normalize={(raw) => {
          const tag = raw.trim().replace(/^#+/, "").replace(/\s+/g, "");
          return tag.length > 0 ? tag : null;
        }}
      />
    </Section>
  );

  if (draft.archetype === "video_script") {
    return (
      <>
        <Section title="Guion" Icon={Film}>
          <label className="mb-1.5 block font-display text-[10.5px] font-bold tracking-[0.08em] text-fg-muted">
            HOOK · PRIMEROS 3 SEGUNDOS
          </label>
          <Textarea
            aria-label="Hook"
            value={draft.hook}
            rows={2}
            onChange={(e) => change({ hook: e.target.value })}
          />
          <label className="mt-3 mb-1.5 block font-display text-[10.5px] font-bold tracking-[0.08em] text-fg-muted">
            GUION
          </label>
          <Textarea
            aria-label="Guion"
            value={draft.script}
            rows={10}
            onChange={(e) => change({ script: e.target.value })}
          />
        </Section>
        <Section title="Notas de grabación" Icon={NotebookPen} defaultOpen={false}>
          <Textarea
            aria-label="Notas de grabación"
            value={draft.recordingNotes ?? ""}
            rows={3}
            onChange={(e) => change({ recordingNotes: e.target.value })}
          />
        </Section>
        <Section title="Descripción" Icon={Type}>
          <Textarea
            aria-label="Descripción"
            value={draft.caption}
            rows={4}
            onChange={(e) => change({ caption: e.target.value })}
          />
          {counter}
        </Section>
        {tags}
      </>
    );
  }

  const isVisual = draft.archetype === "visual_first";
  const text = isVisual ? draft.caption : draft.body;
  return (
    <>
      <Section title="Texto" Icon={Type}>
        <Textarea
          aria-label="Texto de la publicación"
          value={text}
          rows={10}
          onChange={(e) =>
            change(isVisual ? { caption: e.target.value } : { body: e.target.value })
          }
        />
        {counter}
      </Section>
      {tags}
    </>
  );
}
