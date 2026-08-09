import { useEffect, useMemo, useState } from "react";
import type { BrandVoiceDto } from "@presencia/shared";
import { FormalitySlider } from "../../components/ui/FormalitySlider.js";
import { Textarea } from "../../components/ui/Textarea.js";
import { TagInput } from "../../components/ui/TagInput.js";
import { TextInput } from "../../components/ui/TextInput.js";
import { Toggle } from "../../components/ui/Toggle.js";
import { Field } from "../../components/ui/Field.js";
import { Button } from "../../components/ui/Button.js";
import { ApiError, apiFetch } from "../../lib/api.js";

const DEFAULT_ERROR = "Algo salió mal. Inténtalo de nuevo.";
const MAX_EXAMPLES = 2;

// Heurística de UI, no autoritativa: el servidor (brand-voice.service.ts,
// resolveConflicts) ya aplica "prohibido gana" de verdad al persistir, con
// normalización de acentos incluida. Esta versión es solo lowercase+trim —
// buena para el warning inline, no reemplaza la resolución del servidor.
function normalizeForConflictCheck(term: string): string {
  return term.trim().toLowerCase();
}

export function VozDeMarcaPage() {
  const [voice, setVoice] = useState<BrandVoiceDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Bloque A
  const [marketCountry, setMarketCountry] = useState("");
  const [marketRegion, setMarketRegion] = useState("");
  const [niche, setNiche] = useState<string[]>([]);
  const [audience, setAudience] = useState("");

  // Bloque B
  const [formality, setFormality] = useState(50);
  const [allowedExpressions, setAllowedExpressions] = useState<string[]>([]);
  const [bannedExpressions, setBannedExpressions] = useState<string[]>([]);
  const [useAnglicisms, setUseAnglicisms] = useState(true);

  // Bloque C
  const [keyTopics, setKeyTopics] = useState<string[]>([]);
  const [preferredCtas, setPreferredCtas] = useState<string[]>([]);

  // Bloque D — hasta 2 slots, por posición.
  const [examples, setExamples] = useState<string[]>(["", ""]);

  useEffect(() => {
    apiFetch<BrandVoiceDto>("/api/brand-voice")
      .then((data) => {
        setVoice(data);
        setMarketCountry(data.marketCountry);
        setMarketRegion(data.marketRegion ?? "");
        setNiche(data.niche);
        setAudience(data.audience ?? "");
        setFormality(data.formality);
        setAllowedExpressions(data.allowedExpressions);
        setBannedExpressions(data.bannedExpressions);
        setUseAnglicisms(data.useAnglicisms);
        setKeyTopics(data.keyTopics);
        setPreferredCtas(data.preferredCtas);
        setExamples([data.referenceExamples[0]?.text ?? "", data.referenceExamples[1]?.text ?? ""]);
      })
      .catch((e: unknown) =>
        setLoadError(e instanceof ApiError ? e.message : "No se pudo cargar tu voz de marca."),
      );
  }, []);

  // Doc §6 "Modismos en conflicto": mismo modismo en las dos listas.
  const conflictingTerm = useMemo(() => {
    const bannedSet = new Set(bannedExpressions.map(normalizeForConflictCheck));
    return allowedExpressions.find((term) => bannedSet.has(normalizeForConflictCheck(term)));
  }, [allowedExpressions, bannedExpressions]);

  function updateExample(slot: number, value: string) {
    setExamples((prev) => {
      const next = [...prev];
      next[slot] = value;
      return next;
    });
  }

  async function handleSave() {
    setSaveError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const updated = await apiFetch<BrandVoiceDto>("/api/brand-voice", {
        method: "PATCH",
        body: {
          marketCountry,
          marketRegion: marketRegion.trim() || undefined,
          niche,
          audience: audience.trim() || undefined,
          // register no se manda: el servidor lo recalcula desde formality
          // (brand-voice.service.ts::reconcileFormality, doc §4).
          formality,
          allowedExpressions,
          bannedExpressions,
          useAnglicisms,
          keyTopics,
          preferredCtas,
          referenceExamples: examples
            .filter((text) => text.trim().length > 0)
            .slice(0, MAX_EXAMPLES)
            .map((text) => ({ text: text.trim() })),
        },
      });
      setVoice(updated);
      setAllowedExpressions(updated.allowedExpressions);
      setBannedExpressions(updated.bannedExpressions);
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : DEFAULT_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <p className="text-sm text-error">{loadError}</p>;
  if (!voice) return <p className="text-sm text-fg-muted">Cargando…</p>;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-fg">Voz de marca</h1>
        {/* Nota fija (doc §1) — nunca un tooltip escondido. */}
        <p className="mt-1 rounded-md bg-tint-plum p-3 text-sm text-fg-secondary">
          Esta es tu voz base y persistente — define cómo suena TODO tu contenido. Para ajustar el
          tono de un mensaje puntual, usa &quot;Estilo de respuesta&quot; dentro del Chat.
        </p>
      </div>

      {/* Bloque A — Identidad y audiencia */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-fg-secondary uppercase">Identidad y audiencia</h2>
        <Field label="País" htmlFor="market-country">
          <TextInput
            id="market-country"
            value={marketCountry}
            onChange={(e) => setMarketCountry(e.target.value)}
          />
        </Field>
        <Field label="Región" htmlFor="market-region">
          <TextInput
            id="market-region"
            value={marketRegion}
            onChange={(e) => setMarketRegion(e.target.value)}
            placeholder="Ej. Yucatán"
          />
        </Field>
        <Field label="Nicho" htmlFor="niche">
          <TagInput id="niche" value={niche} onChange={setNiche} maxItems={20} />
        </Field>
        <Field
          label="Audiencia"
          htmlFor="audience"
          hint="Edad, intereses, pain points — lo que el onboarding no pedía por tiempo."
        >
          <Textarea
            id="audience"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            rows={3}
            placeholder="Agrega esto para que tu contenido suene aún más a ti."
          />
        </Field>
      </section>

      {/* Bloque B — Registro y tono */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-fg-secondary uppercase">Registro y tono</h2>
        <Field label="Formalidad" htmlFor="formality">
          <FormalitySlider id="formality" value={formality} onChange={setFormality} />
        </Field>
        <Field
          label="Modismos permitidos"
          htmlFor="allowed-expressions"
          hint="Palabras o frases que quieres que aparezcan cuando encajen de forma natural — nunca forzadas."
        >
          <TagInput
            id="allowed-expressions"
            value={allowedExpressions}
            onChange={setAllowedExpressions}
            maxItems={20}
          />
        </Field>
        <Field
          label="Modismos prohibidos"
          htmlFor="banned-expressions"
          hint="Palabras que nunca deben aparecer en tu contenido, ni siquiera citándolas."
        >
          <TagInput
            id="banned-expressions"
            value={bannedExpressions}
            onChange={setBannedExpressions}
            maxItems={20}
          />
        </Field>
        {conflictingTerm && (
          <p className="rounded-md bg-warning-bg p-2 text-xs text-warning">
            &quot;{conflictingTerm}&quot; está en las dos listas — lo vamos a tratar como prohibido
            por seguridad.
          </p>
        )}
        <div className="flex items-center gap-3">
          <Toggle checked={useAnglicisms} onChange={setUseAnglicisms} label="Usar anglicismos" />
          <span className="text-sm text-fg-secondary">Permitir anglicismos</span>
        </div>
      </section>

      {/* Bloque C — Contenido */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-fg-secondary uppercase">Contenido</h2>
        <Field label="Temas clave" htmlFor="key-topics">
          <TagInput id="key-topics" value={keyTopics} onChange={setKeyTopics} maxItems={20} />
        </Field>
        <Field label="CTAs preferidos" htmlFor="preferred-ctas">
          <TagInput
            id="preferred-ctas"
            value={preferredCtas}
            onChange={setPreferredCtas}
            maxItems={20}
          />
        </Field>
      </section>

      {/* Bloque D — Ejemplos de referencia */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg-secondary uppercase">
            Ejemplos de referencia
          </h2>
          <p className="mt-1 text-xs text-fg-secondary">
            De todos los campos, este es el que más influye en que el contenido suene a ti — la IA
            imita el ritmo y el vocabulario de lo que pegues aquí.
          </p>
        </div>
        {[0, 1].map((slot) => {
          const text = examples[slot] ?? "";
          return (
            <div key={slot} className="flex flex-col gap-1">
              <Textarea
                value={text}
                onChange={(e) => updateExample(slot, e.target.value)}
                rows={3}
                placeholder="Elige un post de tu Biblioteca o pega uno tuyo"
              />
              {text && (
                <button
                  type="button"
                  onClick={() => updateExample(slot, "")}
                  className="w-fit text-xs text-fg-muted hover:text-error"
                >
                  Quitar
                </button>
              )}
            </div>
          );
        })}
      </section>

      {saveError && <p className="text-sm text-error">{saveError}</p>}
      {saved && <p className="text-sm text-success">Guardado.</p>}
      <Button onClick={() => void handleSave()} disabled={submitting} className="w-fit">
        {submitting ? "Guardando…" : "Guardar"}
      </Button>
    </div>
  );
}
