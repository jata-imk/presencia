import { Bookmark, LayoutGrid, SlidersHorizontal, Target } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  macroRegionLabel,
  MODO_ESTRATEGIA_META,
  MODOS_ESTRATEGIA,
  normalizeExpression,
  resolveMacroRegion,
  verticalDeNicho,
  verticalLabel,
  VERTICALS,
  type BrandVoiceDto,
  type ModoEstrategia,
  type UpdateBrandVoiceBody,
  type VerticalId,
} from "@presencia/shared";
import {
  Aviso,
  Campo,
  EncabezadoDePagina,
  Invitacion,
  MarcaDeGuardado,
  NotaInfo,
  Pill,
  Seccion,
  SkeletonDePagina,
} from "../../components/configuracion/primitivas.js";
import { EjemploDeVoz } from "../../components/configuracion/EjemploDeVoz.js";
import { RanuraEjemplo } from "../../components/configuracion/RanuraEjemplo.js";
import { FormalitySlider } from "../../components/ui/FormalitySlider.js";
import { Select } from "../../components/ui/Select.js";
import { TagInput } from "../../components/ui/TagInput.js";
import { Textarea } from "../../components/ui/Textarea.js";
import { TextInput } from "../../components/ui/TextInput.js";
import { Toggle } from "../../components/ui/Toggle.js";
import type { EstadoDeCampo } from "../../lib/autoguardado.js";
import { ApiError, apiFetch } from "../../lib/api.js";
import { useAutoguardado } from "../../lib/use-autoguardado.js";

// Configuración › Voz de marca (doc presencia-configuracion-voz-de-marca.md,
// diseño del mock de Claude Design, F9.7).
//
// Se guarda sola, campo por campo: cada cambio viaja como un PATCH parcial
// con solo lo que cambió (el schema lo permite: `undefined` = no tocar). Los
// textos esperan a que se deje de escribir; los chips, switches y selects
// salen al momento. Ver lib/autoguardado.ts.

const INVITACION = "Agrega esto para que tu contenido suene aún más a ti.";

type CampoDeVoz = keyof UpdateBrandVoiceBody;

export function VozDeMarcaPage() {
  const [voice, setVoice] = useState<BrandVoiceDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Bloque A
  const [marketCountry, setMarketCountry] = useState("");
  const [marketRegion, setMarketRegion] = useState("");
  const [niche, setNiche] = useState<string[]>([]);
  // "" en el <select> representa el NULL de la DB: "derívala de mi nicho".
  const [vertical, setVertical] = useState<VerticalId | "">("");
  // `""` = "no lo he elegido", que el servidor deriva de mis metas. Mismo
  // criterio que la categoría de arriba.
  const [modo, setModo] = useState<ModoEstrategia | "">("");
  const [modoDerivado, setModoDerivado] = useState<ModoEstrategia>("mantener");
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
  const [examples, setExamples] = useState<[string, string]>(["", ""]);

  // Errores que se ven antes de mandar nada: un país de una letra o un nicho
  // vacío los rechazaría el servidor, y guardar a medias no tiene sentido.
  const [errorPais, setErrorPais] = useState<string | null>(null);
  // El último país que confirmó el servidor. Si lo escrito deja de ser
  // válido con un cambio anterior todavía en cola ("Pe" → "P"), ese cambio
  // se reemplaza por este: si no, se guardaba "Pe" mientras la pantalla
  // mostraba "P" con un error.
  const paisGuardado = useRef("");
  const [errorNicho, setErrorNicho] = useState<string | null>(null);
  // Modismos que el servidor sacó de "permitidos" por estar también en
  // "prohibidos". Con autoguardado eso pasa en un segundo, y sin este aviso
  // el chip simplemente desaparecía.
  const [quitadosPorConflicto, setQuitadosPorConflicto] = useState<string[]>([]);

  const auto = useAutoguardado<UpdateBrandVoiceBody>({
    combinar: (anterior, nuevo) => ({ ...anterior, ...nuevo }),
    enviar: async (parche) => {
      const updated = await apiFetch<BrandVoiceDto>("/api/brand-voice", {
        method: "PATCH",
        body: parche,
      });
      // Solo lo que el SERVIDOR decide, y solo si no se volvió a escribir
      // mientras viajaba: pisar un campo recién editado con la respuesta del
      // envío anterior borraría lo último que el usuario tecleó.
      setModoDerivado(updated.modoDerivado);
      paisGuardado.current = updated.marketCountry;
      // "Prohibido gana" (brand-voice.service.ts::resolveConflicts): guardar
      // una lista puede cambiar la otra.
      if (!auto.tienePendiente("allowedExpressions") && !auto.tienePendiente("bannedExpressions")) {
        // Contra lo que se MANDÓ, no contra el estado: un cambio inmediato
        // sale dentro del mismo onChange, antes del render que lo pinta, así
        // que el estado que ve este closure todavía es el de antes.
        const enviados = parche.allowedExpressions ?? allowedExpressions;
        const quitados = enviados.filter((term) => !updated.allowedExpressions.includes(term));
        if (quitados.length > 0) {
          setQuitadosPorConflicto(quitados);
        }
        setAllowedExpressions(updated.allowedExpressions);
        setBannedExpressions(updated.bannedExpressions);
      }
    },
  });

  function guardar<K extends CampoDeVoz>(
    campo: K,
    valor: UpdateBrandVoiceBody[K],
    inmediato = false,
  ) {
    auto.programar(campo, { [campo]: valor }, { inmediato });
  }

  useEffect(() => {
    apiFetch<BrandVoiceDto>("/api/brand-voice")
      .then((data) => {
        setVoice(data);
        setMarketCountry(data.marketCountry);
        paisGuardado.current = data.marketCountry;
        setMarketRegion(data.marketRegion ?? "");
        setNiche(data.niche);
        setVertical(data.vertical ?? "");
        setModo(data.modo ?? "");
        setModoDerivado(data.modoDerivado);
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
  // normalizeExpression (shared) es la misma función que usa el servidor
  // (brand-voice.service.ts::resolveConflicts) para aplicar "prohibido
  // gana" de verdad al persistir — con acentos incluidos ("café"/"cafe"
  // cuentan como el mismo modismo). El warning inline solo avisa lo que el
  // servidor sí va a resolver.
  const prohibidosNormalizados = useMemo(
    () => new Set(bannedExpressions.map(normalizeExpression)),
    [bannedExpressions],
  );
  const conflictingTerm = allowedExpressions.find((term) =>
    prohibidosNormalizados.has(normalizeExpression(term)),
  );

  // Lo que el servidor va a usar si el select queda en automático. Se calcula
  // con las MISMAS funciones que usa la API (shared/verticals.ts): si la
  // pantalla derivara por su cuenta, podría decirle al usuario que buscamos
  // en una vertical y buscar en otra.
  const verticalDerivada = useMemo(() => verticalDeNicho(niche), [niche]);
  const regionEfectiva = useMemo(
    () => resolveMacroRegion(marketCountry, marketRegion.trim() || null),
    [marketCountry, marketRegion],
  );

  function cambiarEjemplo(slot: 0 | 1, texto: string) {
    const siguientes: [string, string] = [...examples];
    siguientes[slot] = texto;
    setExamples(siguientes);
    guardar(
      "referenceExamples",
      siguientes.filter((t) => t.trim().length > 0).map((t) => ({ text: t.trim() })),
      true,
    );
  }

  if (loadError) return <p className="text-sm text-error-fg">{loadError}</p>;
  if (!voice) return <SkeletonDePagina />;

  return (
    <div>
      <EncabezadoDePagina
        titulo="Voz de marca"
        subtitulo="Define cómo suena todo tu contenido — de forma persistente y en tu registro real."
      />
      {/* Nota fija (doc §1) — nunca un tooltip escondido. */}
      <NotaInfo>
        Esta es tu voz base y persistente — define cómo suena <b>todo</b> tu contenido. Para ajustar
        el tono de un mensaje puntual, usa <b>«Estilo de respuesta»</b> dentro del Chat.
      </NotaInfo>

      <Seccion
        icono={Target}
        titulo="Identidad y audiencia"
        subtitulo="A quién le hablas y desde dónde."
      >
        <Campo
          label="Mercado"
          htmlFor="market-country"
          extra={<Pill>Heredado del onboarding</Pill>}
          estado={combinar(auto.estado("marketCountry"), auto.estado("marketRegion"))}
          error={errorPais}
        >
          <div className="grid gap-2.5 md:grid-cols-2">
            <TextInput
              id="market-country"
              aria-label="País"
              maxLength={56}
              value={marketCountry}
              placeholder="País"
              onChange={(e) => {
                const valor = e.target.value;
                setMarketCountry(valor);
                if (valor.trim().length < 2) {
                  setErrorPais("Escribe el país: al menos dos letras.");
                  if (auto.tienePendiente("marketCountry")) {
                    guardar("marketCountry", paisGuardado.current);
                  }
                  return;
                }
                setErrorPais(null);
                guardar("marketCountry", valor.trim());
              }}
            />
            <TextInput
              aria-label="Región"
              maxLength={80}
              value={marketRegion}
              placeholder="Región (ej. Yucatán)"
              onChange={(e) => {
                setMarketRegion(e.target.value);
                // "" -> null (borra el campo guardado), no undefined (que el
                // PATCH interpretaría como "no tocar" y dejaría el valor viejo).
                guardar("marketRegion", e.target.value.trim() || null);
              }}
            />
          </div>
        </Campo>

        <Campo
          label="Nicho / audiencia"
          htmlFor="niche"
          estado={combinar(auto.estado("niche"), auto.estado("audience"))}
          error={errorNicho}
        >
          <TagInput
            id="niche"
            value={niche}
            onChange={(next) => {
              setNiche(next);
              if (next.length === 0) {
                setErrorNicho("Necesitas al menos un nicho: con él buscamos tus tendencias.");
                return;
              }
              setErrorNicho(null);
              guardar("niche", next, true);
            }}
            maxItems={20}
            maxLength={40}
            placeholder="Escribe y presiona Enter…"
          />
          <Textarea
            id="audience"
            aria-label="Detalle de tu audiencia"
            maxLength={500}
            value={audience}
            onChange={(e) => {
              setAudience(e.target.value);
              guardar("audience", e.target.value.trim() || null);
            }}
            rows={2}
            className="mt-2.5"
            placeholder="Detalle adicional: edad, intereses, pain points…"
          />
          {!audience.trim() && <Invitacion>{INVITACION}</Invitacion>}
        </Campo>

        <Campo
          label="Categoría"
          htmlFor="vertical"
          estado={auto.estado("vertical")}
          hint={
            vertical === ""
              ? verticalDerivada
                ? `Por tu nicho buscamos tendencias de ${verticalLabel(verticalDerivada)}, en ${macroRegionLabel(regionEfectiva)}. Cámbiala si no es lo tuyo.`
                : `Tu nicho no cayó en ninguna categoría, así que buscamos tendencias generales de ${macroRegionLabel(regionEfectiva)}. Elige una para afinarlas.`
              : `Buscamos tendencias de esta categoría en ${macroRegionLabel(regionEfectiva)}.`
          }
        >
          <Select
            id="vertical"
            value={vertical}
            onChange={(e) => {
              const valor = e.target.value as VerticalId | "";
              setVertical(valor);
              // "" -> null: vuelve a la derivación automática por nicho.
              guardar("vertical", valor || null, true);
            }}
          >
            <option value="">Detectar por mi nicho</option>
            {VERTICALS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
        </Campo>

        {/* El chip de Ritmo enlaza acá: es donde promete que se cambia. */}
        <Campo
          label="Objetivo (Modo)"
          htmlFor="modo"
          estado={auto.estado("modo")}
          hint={
            modo === ""
              ? `Por tus metas asumimos "${MODO_ESTRATEGIA_META[modoDerivado].label}". Con esto ajustamos cuántas publicaciones por semana te proponemos.`
              : MODO_ESTRATEGIA_META[modo].ayuda
          }
        >
          <Select
            id="modo"
            value={modo}
            onChange={(e) => {
              const valor = e.target.value as ModoEstrategia | "";
              setModo(valor);
              guardar("modo", valor || null, true);
            }}
          >
            <option value="">Deducirlo de mis metas</option>
            {MODOS_ESTRATEGIA.map((valor) => (
              <option key={valor} value={valor}>
                {MODO_ESTRATEGIA_META[valor].emoji} {MODO_ESTRATEGIA_META[valor].label}
              </option>
            ))}
          </Select>
        </Campo>
      </Seccion>

      <Seccion
        icono={SlidersHorizontal}
        titulo="Registro y tono"
        subtitulo="Qué tan formal suenas y qué palabras usas."
      >
        <Campo label="Formalidad" htmlFor="formality" estado={auto.estado("formality")}>
          <FormalitySlider
            id="formality"
            value={formality}
            onChange={(valor) => {
              setFormality(valor);
              // register no se manda: el servidor lo recalcula desde formality
              // (brand-voice.service.ts::reconcileFormality, doc §4).
              guardar("formality", valor);
            }}
          />
        </Campo>

        <div className="grid gap-4 md:grid-cols-2">
          <Campo
            label="Modismos permitidos"
            htmlFor="allowed-expressions"
            tono="permitido"
            estado={auto.estado("allowedExpressions")}
            hint="Aparecen cuando encajan de forma natural — nunca forzados."
          >
            <TagInput
              id="allowed-expressions"
              value={allowedExpressions}
              onChange={(next) => {
                setAllowedExpressions(next);
                setQuitadosPorConflicto([]);
                guardar("allowedExpressions", next, true);
              }}
              tono="permitido"
              enConflicto={(tag) => prohibidosNormalizados.has(normalizeExpression(tag))}
              maxItems={20}
              maxLength={40}
              placeholder="Agregar…"
            />
          </Campo>
          <Campo
            label="Modismos prohibidos"
            htmlFor="banned-expressions"
            tono="prohibido"
            estado={auto.estado("bannedExpressions")}
            hint="Nunca aparecen, ni siquiera citados."
          >
            <TagInput
              id="banned-expressions"
              value={bannedExpressions}
              onChange={(next) => {
                setBannedExpressions(next);
                setQuitadosPorConflicto([]);
                guardar("bannedExpressions", next, true);
              }}
              tono="prohibido"
              maxItems={20}
              maxLength={40}
              placeholder="Agregar…"
            />
          </Campo>
        </div>
        {quitadosPorConflicto.length > 0 && !conflictingTerm && (
          <Aviso>
            {quitadosPorConflicto.map((term) => `«${term}»`).join(", ")}{" "}
            {quitadosPorConflicto.length === 1
              ? "estaba en las dos listas — lo dejamos"
              : "estaban en las dos listas — los dejamos"}{" "}
            solo en <b>prohibidos</b>, por seguridad.
          </Aviso>
        )}
        {conflictingTerm && (
          <Aviso>
            <b>«{conflictingTerm}»</b> está en las dos listas — lo tratamos como <b>prohibido</b>{" "}
            por seguridad.
          </Aviso>
        )}

        <div>
          <div className="flex items-center justify-between gap-4 rounded-md border border-line bg-surface px-4 py-3.5">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-display text-base font-semibold text-fg">Permitir anglicismos</p>
                <MarcaDeGuardado estado={auto.estado("useAnglicisms")} />
              </div>
              <p className="mt-0.5 text-xs text-fg-secondary">
                Palabras en inglés como «engagement», «reels» o «tips».
              </p>
            </div>
            <Toggle
              checked={useAnglicisms}
              onChange={(next) => {
                setUseAnglicisms(next);
                guardar("useAnglicisms", next, true);
              }}
              label="Permitir anglicismos"
            />
          </div>
          {/* El switch no vive en un Campo: su error se dice acá, no solo con
            el ícono de la marca. */}
          <ErrorDeGuardado estado={auto.estado("useAnglicisms")} />
        </div>
      </Seccion>

      <Seccion icono={LayoutGrid} titulo="Contenido" subtitulo="De qué hablas y cómo cierras.">
        <Campo
          label="Temas clave / pilares de contenido"
          htmlFor="key-topics"
          estado={auto.estado("keyTopics")}
        >
          <TagInput
            id="key-topics"
            value={keyTopics}
            onChange={(next) => {
              setKeyTopics(next);
              guardar("keyTopics", next, true);
            }}
            maxItems={20}
            maxLength={40}
            placeholder="Escribe y presiona Enter…"
          />
          {keyTopics.length === 0 && <Invitacion>{INVITACION}</Invitacion>}
        </Campo>
        <Campo
          label="CTAs preferidos"
          htmlFor="preferred-ctas"
          estado={auto.estado("preferredCtas")}
        >
          <TagInput
            id="preferred-ctas"
            value={preferredCtas}
            onChange={(next) => {
              setPreferredCtas(next);
              guardar("preferredCtas", next, true);
            }}
            maxItems={20}
            maxLength={80}
            placeholder="Escribe y presiona Enter…"
          />
          {preferredCtas.length === 0 && <Invitacion>{INVITACION}</Invitacion>}
        </Campo>
      </Seccion>

      <Seccion
        icono={Bookmark}
        titulo="Ejemplos de referencia"
        subtitulo="Hasta 2 posts que representen tu voz. De todo lo de esta página, es lo que más influye: imitamos su ritmo y su vocabulario."
      >
        <div className="flex flex-col gap-2">
          <div className="grid gap-4 md:grid-cols-2">
            {([0, 1] as const).map((slot) => (
              <RanuraEjemplo
                key={slot}
                numero={slot === 0 ? 1 : 2}
                texto={examples[slot]}
                onGuardar={(texto) => cambiarEjemplo(slot, texto)}
                onQuitar={() => cambiarEjemplo(slot, "")}
              />
            ))}
          </div>
          <EstadoDeEjemplos estado={auto.estado("referenceExamples")} />
        </div>
      </Seccion>

      {/* Preview manual (doc §5): un botón, nunca en cada cambio. */}
      {/* Un campo que la pantalla ya sabe inválido tampoco está guardado: el
          ejemplo saldría con el valor anterior, y se cobraría igual. */}
      <EjemploDeVoz antesDePedir={async () => (await auto.vaciar()) && !errorPais && !errorNicho} />
    </div>
  );
}

/** La marca de los ejemplos va debajo de las ranuras: no tienen un label propio. */
function EstadoDeEjemplos({ estado }: { estado: EstadoDeCampo | undefined }) {
  if (!estado) return null;
  if (estado.tipo === "error") return <ErrorDeGuardado estado={estado} />;
  return (
    <div className="flex justify-end">
      <MarcaDeGuardado estado={estado} />
    </div>
  );
}

/** El mensaje de un guardado que falló, para lo que no está dentro de un Campo. */
function ErrorDeGuardado({ estado }: { estado: EstadoDeCampo | undefined }) {
  if (estado?.tipo !== "error") return null;
  return (
    <p role="alert" className="mt-1.5 text-xs text-error-fg">
      {estado.mensaje}
    </p>
  );
}

/**
 * El estado de un campo que guarda dos cosas (país y región, nicho y detalle):
 * un error manda sobre todo, después "guardando", después "guardado".
 */
function combinar(...estados: Array<EstadoDeCampo | undefined>): EstadoDeCampo | undefined {
  return (
    estados.find((e) => e?.tipo === "error") ??
    estados.find((e) => e?.tipo === "guardando") ??
    estados.find((e) => e?.tipo === "guardado")
  );
}
