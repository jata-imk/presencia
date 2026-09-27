import { Globe, Languages, Search } from "lucide-react";
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
import {
  Campo,
  EncabezadoDePagina,
  MarcaDeGuardado,
  NotaInfo,
  Seccion,
  SkeletonDePagina,
} from "../../components/configuracion/primitivas.js";
import { TagInput } from "../../components/ui/TagInput.js";
import { Textarea } from "../../components/ui/Textarea.js";
import { Toggle } from "../../components/ui/Toggle.js";
import { ApiError } from "../../lib/api.js";
import { fetchAjustesDeTendencias, saveAjustesDeTendencias } from "../../lib/ritmo-api.js";
import { useAutoguardado } from "../../lib/use-autoguardado.js";

// Configuración › Tendencias (F9.6): la personalización de la búsqueda de
// tendencias de Ritmo — fuentes propias, qué buscar, qué no, en qué idiomas.
//
// TODO es opcional, y la página lo dice arriba con lo que se busca si nadie
// toca nada. Ese texto sale de la API (`base`), armado con la misma función
// que escribe el prompt: una explicación del default redactada acá podría
// decir un nicho y buscar en otro. Ver ADR-024.
//
// Se guarda sola (F9.7). El endpoint es un PUT que reemplaza la configuración
// ENTERA, así que cada cambio manda todo y, si se juntan varios, sale solo el
// último: es el más nuevo en todos los campos a la vez.

type Ajustes = Pick<TrendSettingsDto, "fuentes" | "prompt" | "excluye" | "langs">;

export function TendenciasPage() {
  const [base, setBase] = useState<TrendSettingsDto["base"] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fuentes, setFuentes] = useState<string[]>([]);
  const [fuenteInvalida, setFuenteInvalida] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [excluye, setExcluye] = useState("");
  const [langs, setLangs] = useState<TrendLang[]>(["es"]);

  // La respuesta del PUT no se aplica a los campos: lo que devuelve es lo
  // que se mandó (las fuentes ya viajan normalizadas), y aplicarla pisaría
  // lo que se haya escrito mientras viajaba.
  const auto = useAutoguardado<Ajustes>({
    combinar: (_anterior, nuevo) => nuevo,
    enviar: async (ajustes) => {
      await saveAjustesDeTendencias(ajustes);
    },
  });

  function guardar(campo: keyof Ajustes, cambios: Partial<Ajustes>, inmediato = false) {
    const siguiente = { fuentes, prompt, excluye, langs, ...cambios };
    auto.programar(
      campo,
      {
        fuentes: siguiente.fuentes,
        // "" -> null: "no personalicé esto", que el prompt omite entero.
        prompt: siguiente.prompt?.trim() || null,
        excluye: siguiente.excluye?.trim() || null,
        langs: siguiente.langs,
      },
      { inmediato },
    );
  }

  useEffect(() => {
    const abort = new AbortController();
    fetchAjustesDeTendencias(abort.signal)
      .then((datos) => {
        setBase(datos.base);
        setFuentes(datos.fuentes);
        setPrompt(datos.prompt ?? "");
        setExcluye(datos.excluye ?? "");
        setLangs(datos.langs);
      })
      .catch((e: unknown) => {
        if (abort.signal.aborted) return;
        setLoadError(e instanceof ApiError ? e.message : "No se pudieron cargar tus ajustes.");
      });
    return () => abort.abort();
  }, []);

  function cambiarIdioma(lang: TrendLang, activo: boolean) {
    // En el orden del catálogo y no en el de los clics: "español o inglés"
    // se lee igual siempre, en la pantalla y en el prompt.
    const siguientes = TREND_LANGS.filter((l) => (l === lang ? activo : langs.includes(l)));
    setLangs(siguientes);
    guardar("langs", { langs: siguientes }, true);
  }

  if (loadError) return <p className="text-sm text-error-fg">{loadError}</p>;
  if (!base) return <SkeletonDePagina />;

  const estadoIdiomas = auto.estado("langs");

  return (
    <div>
      <EncabezadoDePagina
        titulo="Tendencias"
        subtitulo="Afina qué buscamos para ti en Ritmo. Todo es opcional."
      />
      {/* El default a la vista: qué pasa si no se toca nada. */}
      <NotaInfo>
        Si no tocas nada, buscamos qué se está moviendo en <b>{base.nicho}</b>, para{" "}
        <b>{base.region}</b>, en español y pensando en tu objetivo (<b>{base.objetivo}</b>). Lo de
        abajo afina esa búsqueda, no la reemplaza. El nicho, la región y el objetivo se cambian en{" "}
        <Link
          to="/configuracion/voz-de-marca"
          className="font-semibold underline underline-offset-2"
        >
          Voz de marca
        </Link>
        .
      </NotaInfo>

      <Seccion
        icono={Globe}
        titulo="Tus fuentes"
        subtitulo="Medios o sitios que sigues. Los revisamos primero y completamos con otros si no alcanzan."
      >
        <Campo
          label="Medios o sitios"
          htmlFor="fuentes"
          estado={auto.estado("fuentes")}
          // Lo escrito que no es un sitio se queda en el input para corregirlo,
          // y no se guarda: la lista guardada es solo lo que sí pasó.
          error={fuenteInvalida ? `"${fuenteInvalida}" no parece la dirección de un sitio.` : null}
          hint={`Pega la dirección o el nombre del sitio; guardamos solo el dominio. ${String(fuentes.length)} de ${String(MAX_TREND_SOURCES)}.`}
        >
          <TagInput
            id="fuentes"
            value={fuentes}
            onChange={(next) => {
              setFuenteInvalida(null);
              setFuentes(next);
              guardar("fuentes", { fuentes: next }, true);
            }}
            normalize={normalizeTrendSource}
            onInvalid={setFuenteInvalida}
            maxItems={MAX_TREND_SOURCES}
            placeholder="Ej. xataka.com.mx"
          />
        </Campo>
      </Seccion>

      <Seccion icono={Search} titulo="Qué buscar" subtitulo="En tus palabras, sin fórmulas.">
        <Campo
          label="Qué quieres que busquemos"
          htmlFor="trend-prompt"
          estado={auto.estado("prompt")}
          hint="Temas, enfoques o formatos que te interesan. Sin esto, buscamos lo general de tu nicho."
        >
          <Textarea
            id="trend-prompt"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              guardar("prompt", { prompt: e.target.value });
            }}
            maxLength={MAX_TREND_TEXT}
            rows={3}
            placeholder="Ej. herramientas de IA que le sirvan a freelancers, más que noticias de empresas grandes"
          />
        </Campo>
        <Campo
          label="Qué no quieres ver"
          htmlFor="trend-exclude"
          estado={auto.estado("excluye")}
          hint="Temas que prefieres que dejemos fuera aunque se estén moviendo."
        >
          <Textarea
            id="trend-exclude"
            value={excluye}
            onChange={(e) => {
              setExcluye(e.target.value);
              guardar("excluye", { excluye: e.target.value });
            }}
            maxLength={MAX_TREND_TEXT}
            rows={2}
            placeholder="Ej. criptomonedas, chismes de celebridades"
          />
        </Campo>
      </Seccion>

      <Seccion
        icono={Languages}
        titulo="Idiomas"
        subtitulo="En qué idiomas buscamos. Aunque la fuente esté en inglés, las tendencias te llegan en español."
      >
        <div className="flex flex-col gap-2">
          {TREND_LANGS.map((lang) => {
            const activo = langs.includes(lang);
            // El último encendido no se puede apagar: una búsqueda sin idioma
            // no existe, y el servidor la rechazaría al guardar.
            const ultimo = activo && langs.length === 1;
            return (
              <div
                key={lang}
                className="flex items-center justify-between gap-4 rounded-md border border-line bg-surface px-4 py-3"
              >
                <div>
                  <p className="font-display text-base font-semibold text-fg">
                    {TREND_LANG_LABELS[lang]}
                  </p>
                  {ultimo && <p className="text-xs text-fg-muted">Necesitas al menos uno.</p>}
                </div>
                <Toggle
                  checked={activo}
                  onChange={(next) => cambiarIdioma(lang, next)}
                  label={TREND_LANG_LABELS[lang]}
                  disabled={ultimo}
                />
              </div>
            );
          })}
          <div className="flex min-h-5 justify-end">
            <MarcaDeGuardado estado={estadoIdiomas} />
          </div>
          {estadoIdiomas?.tipo === "error" && (
            <p role="alert" className="text-xs text-error-fg">
              {estadoIdiomas.mensaje}
            </p>
          )}
        </div>
      </Seccion>

      <p className="text-xs text-fg-muted">
        Guardar no dispara una búsqueda ni cobra nada: los cambios se aplican la próxima vez que se
        actualicen tus tendencias, solas cada semana o antes desde{" "}
        <Link to="/ritmo" className="underline underline-offset-2">
          Ritmo
        </Link>
        .
      </p>
    </div>
  );
}
