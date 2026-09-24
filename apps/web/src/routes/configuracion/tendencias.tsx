import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  MAX_TREND_SOURCES,
  MAX_TREND_TEXT,
  normalizeTrendSource,
  TREND_LANG_LABELS,
  TREND_LANGS,
  type TrendLang,
  type TrendSettingsDto,
} from "@presencia/shared";
import { Button } from "../../components/ui/Button.js";
import { Field } from "../../components/ui/Field.js";
import { TagInput } from "../../components/ui/TagInput.js";
import { Textarea } from "../../components/ui/Textarea.js";
import { Toggle } from "../../components/ui/Toggle.js";
import { ApiError } from "../../lib/api.js";
import { fetchAjustesDeTendencias, saveAjustesDeTendencias } from "../../lib/ritmo-api.js";

// Configuración › Tendencias (F9.6): la personalización de la búsqueda de
// tendencias de Ritmo — fuentes propias, qué buscar, qué no, en qué idiomas.
//
// TODO es opcional, y la página lo dice arriba con lo que se busca si nadie
// toca nada. Ese texto sale de la API (`base`), armado con la misma función
// que escribe el prompt: una explicación del default redactada acá podría
// decir un nicho y buscar en otro. Ver ADR-024.

const DEFAULT_ERROR = "Algo salió mal. Inténtalo de nuevo.";

export function TendenciasPage() {
  const [ajustes, setAjustes] = useState<TrendSettingsDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [fuentes, setFuentes] = useState<string[]>([]);
  const [fuenteInvalida, setFuenteInvalida] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [excluye, setExcluye] = useState("");
  const [langs, setLangs] = useState<TrendLang[]>(["es"]);

  function aplicar(datos: TrendSettingsDto) {
    setAjustes(datos);
    setFuentes(datos.fuentes);
    setPrompt(datos.prompt ?? "");
    setExcluye(datos.excluye ?? "");
    setLangs(datos.langs);
  }

  useEffect(() => {
    const abort = new AbortController();
    fetchAjustesDeTendencias(abort.signal)
      .then(aplicar)
      .catch((e: unknown) => {
        if (abort.signal.aborted) return;
        setLoadError(e instanceof ApiError ? e.message : "No se pudieron cargar tus ajustes.");
      });
    return () => abort.abort();
  }, []);

  function cambiarIdioma(lang: TrendLang, activo: boolean) {
    // En el orden del catálogo y no en el de los clics: "español o inglés"
    // se lee igual siempre, en la pantalla y en el prompt.
    setLangs((actuales) => TREND_LANGS.filter((l) => (l === lang ? activo : actuales.includes(l))));
  }

  async function handleSave() {
    setSaveError(null);
    setSaved(false);
    // Una fuente que no se pudo agregar sigue escrita en el input. Guardar
    // "todo menos eso" y decir "Guardado." junto al error sería contar dos
    // historias a la vez: mejor no guardar hasta que se corrija o se borre.
    if (fuenteInvalida) {
      setSaveError("Corrige o borra la fuente marcada antes de guardar.");
      return;
    }
    setSubmitting(true);
    try {
      aplicar(
        await saveAjustesDeTendencias({
          fuentes,
          // "" -> null: "no personalicé esto", que el prompt omite entero.
          prompt: prompt.trim() || null,
          excluye: excluye.trim() || null,
          langs,
        }),
      );
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : DEFAULT_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <p className="text-sm text-error">{loadError}</p>;
  if (!ajustes) return <p className="text-sm text-fg-muted">Cargando…</p>;

  const { base } = ajustes;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-fg">Tendencias</h1>
        {/* El default a la vista: qué pasa si no se toca nada. */}
        <p className="mt-1 rounded-md bg-tint-plum p-3 text-sm text-fg-secondary">
          Si no tocas nada, buscamos qué se está moviendo en{" "}
          <strong className="font-semibold text-fg">{base.nicho}</strong>, para{" "}
          <strong className="font-semibold text-fg">{base.region}</strong>, en español y pensando en
          tu objetivo (<strong className="font-semibold text-fg">{base.objetivo}</strong>). Todo lo
          de abajo es opcional: sirve para afinar esa búsqueda, no para reemplazarla.
        </p>
        <p className="mt-2 text-xs text-fg-muted">
          El nicho, la región y el objetivo se cambian en{" "}
          <Link to="/configuracion/voz-de-marca" className="underline underline-offset-2">
            Voz de marca
          </Link>
          .
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-fg-secondary uppercase">Tus fuentes</h2>
        <Field
          label="Medios o sitios que sigues"
          htmlFor="fuentes"
          error={
            fuenteInvalida ? `"${fuenteInvalida}" no parece la dirección de un sitio.` : undefined
          }
          hint={`Pega la dirección o el nombre del sitio; guardamos solo el dominio. Las revisamos primero y completamos con otras si no alcanzan. ${String(fuentes.length)} de ${String(MAX_TREND_SOURCES)}.`}
        >
          <TagInput
            id="fuentes"
            value={fuentes}
            onChange={(next) => {
              setFuenteInvalida(null);
              setFuentes(next);
            }}
            normalize={normalizeTrendSource}
            onInvalid={setFuenteInvalida}
            maxItems={MAX_TREND_SOURCES}
            placeholder="Ej. xataka.com.mx"
          />
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-fg-secondary uppercase">Qué buscar</h2>
        <Field
          label="Qué quieres que busquemos"
          htmlFor="trend-prompt"
          hint="En tus palabras: temas, enfoques o formatos que te interesan. Sin esto, buscamos lo general de tu nicho."
        >
          <Textarea
            id="trend-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={MAX_TREND_TEXT}
            rows={3}
            placeholder="Ej. herramientas de IA que le sirvan a freelancers, más que noticias de empresas grandes"
          />
        </Field>
        <Field
          label="Qué no quieres ver"
          htmlFor="trend-exclude"
          hint="Temas que prefieres que dejemos fuera aunque se estén moviendo."
        >
          <Textarea
            id="trend-exclude"
            value={excluye}
            onChange={(e) => setExcluye(e.target.value)}
            maxLength={MAX_TREND_TEXT}
            rows={2}
            placeholder="Ej. criptomonedas, chismes de celebridades"
          />
        </Field>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg-secondary uppercase">Idiomas</h2>
          <p className="mt-1 text-xs text-fg-secondary">
            En qué idiomas buscamos. Aunque la fuente esté en inglés, las tendencias te llegan
            escritas en español.
          </p>
        </div>
        {TREND_LANGS.map((lang) => {
          const activo = langs.includes(lang);
          // El último encendido no se puede apagar: una búsqueda sin idioma no
          // existe, y el servidor la rechazaría al guardar.
          const ultimo = activo && langs.length === 1;
          return (
            <div key={lang} className="flex items-center gap-3">
              <Toggle
                checked={activo}
                onChange={(next) => cambiarIdioma(lang, next)}
                label={TREND_LANG_LABELS[lang]}
                disabled={ultimo}
              />
              <span className="text-sm text-fg-secondary">{TREND_LANG_LABELS[lang]}</span>
              {ultimo && <span className="text-xs text-fg-muted">Necesitas al menos uno.</span>}
            </div>
          );
        })}
      </section>

      <p className="text-xs text-fg-muted">
        Los cambios se aplican la próxima vez que se actualicen tus tendencias: solas cada semana, o
        antes desde{" "}
        <Link to="/ritmo" className="underline underline-offset-2">
          Ritmo
        </Link>
        .
      </p>

      {saveError && <p className="text-sm text-error">{saveError}</p>}
      {saved && <p className="text-sm text-success">Guardado.</p>}
      <Button onClick={() => void handleSave()} disabled={submitting} className="w-fit">
        {submitting ? "Guardando…" : "Guardar"}
      </Button>
    </div>
  );
}
