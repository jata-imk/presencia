import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type {
  BrandVoiceExampleDto,
  QuotaStatusDto,
  SocialNetwork,
  VozDestiladaDto,
} from "@presencia/shared";
import { AuthShell } from "../components/auth/AuthShell.js";
import { PasoEscribes } from "../components/onboarding/PasoEscribes.js";
import { PasoHablas } from "../components/onboarding/PasoHablas.js";
import { PasoMetas } from "../components/onboarding/PasoMetas.js";
import { PasoRedes } from "../components/onboarding/PasoRedes.js";
import { PasoSuenas, type FaseSuenas } from "../components/onboarding/PasoSuenas.js";
import { Stepper } from "../components/onboarding/Piezas.js";
import { QuotaExhaustedModal } from "../components/QuotaExhaustedModal.js";
import { IsotipoGlyph } from "../components/ui/BrandMark.js";
import { ApiError, apiFetch } from "../lib/api.js";
import { authClient } from "../lib/auth-client.js";
import { cuotaAgotadaDe } from "../lib/cuota-agotada.js";
import {
  DATOS_INICIALES,
  METAS,
  muestrasUtiles,
  nichosAGuardar,
  paisAGuardar,
  propuestaDePrimerPost,
  rasgoNunca,
  regionAGuardar,
  type DatosOnboarding,
} from "../lib/onboarding.js";
import { useChannels } from "../lib/use-channels.js";
import { useConectarRed } from "../lib/use-conectar-red.js";

// Onboarding como captura de voz (F12.5, Claude Design "Onboarding v2").
//
// Cinco pasos: ¿Cómo hablas? → ¿Cómo escribes? → ¿Dónde publicas? → ¿Qué
// buscas? → Así suenas. Los pasos son presentacionales; aquí vive lo que
// habla con la API:
//
// - Cada paso guarda al salir (la voz en el 1, las metas en el 4), como antes:
//   si abandona a la mitad, lo contestado no se pierde.
// - La destilación arranca al salir del paso 2 y se espera en el 5: mientras
//   conecta su red y elige metas, el modelo ya está leyendo sus publicaciones.
// - El cierre guarda la voz destilada (la voz es del creator: la ve y la puede
//   corregir ahí mismo) y escribe un post en su voz. Termina en el chat con
//   ese borrador escrito en el composer, sin mandarlo.

const ERROR_GENERICO = "Algo salió mal. Inténtalo de nuevo.";

/** Lo que identifica una destilación: si cambia, hay que volver a pedirla. */
function llaveDe(datos: DatosOnboarding): string {
  return JSON.stringify({ m: muestrasUtiles(datos.muestras), n: datos.nunca.trim() });
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const { refetch } = authClient.useSession();
  const [paso, setPaso] = useState(0);
  const [datos, setDatos] = useState<DatosOnboarding>(DATOS_INICIALES);
  const [sinMuestras, setSinMuestras] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cambiar = (cambio: Partial<DatosOnboarding>) => setDatos((d) => ({ ...d, ...cambio }));
  // Un error es del paso donde pasó: al moverse, se va.
  useEffect(() => setError(null), [paso]);

  // La zona horaria, una sola vez y en silencio (F4): si falla, queda la del
  // servidor y se ajusta en Mi perfil. El ref aguanta el doble efecto de
  // StrictMode.
  const zonaCapturada = useRef(false);
  useEffect(() => {
    if (zonaCapturada.current) return;
    zonaCapturada.current = true;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    apiFetch("/api/me", { method: "PATCH", body: { timezone } }).catch(() => undefined);
  }, []);

  // ── Paso 1 ──────────────────────────────────────────────────────────────
  async function guardarVoz() {
    setError(null);
    setGuardando(true);
    try {
      await apiFetch("/api/brand-voice", {
        method: "PUT",
        body: {
          marketCountry: paisAGuardar(datos.pais),
          marketRegion: regionAGuardar(datos.ciudad, datos.pais === "México" ? datos.zona : null),
          niche: nichosAGuardar(datos),
          register: datos.registro,
        },
      });
      setPaso(1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : ERROR_GENERICO);
    } finally {
      setGuardando(false);
    }
  }

  // ── Paso 2: la destilación arranca aquí ─────────────────────────────────
  const destilado = useRef<{ llave: string; promesa: Promise<VozDestiladaDto> } | null>(null);

  function destilar(): Promise<VozDestiladaDto> {
    const llave = llaveDe(datos);
    if (destilado.current?.llave !== llave) {
      const promesa = apiFetch<VozDestiladaDto>("/api/brand-voice/destilar", {
        method: "POST",
        body: {
          samples: muestrasUtiles(datos.muestras),
          ...(datos.nunca.trim() ? { avoid: datos.nunca.trim() } : {}),
        },
      });
      // Se espera hasta el paso 5: sin esto, un fallo temprano sería un
      // "unhandled rejection" mientras tanto. El error se lee al esperarla.
      promesa.catch(() => undefined);
      destilado.current = { llave, promesa };
    }
    return destilado.current.promesa;
  }

  // ── Paso 3 ──────────────────────────────────────────────────────────────
  const canales = useChannels();
  const conexion = useConectarRed(canales);
  const [esperando, setEsperando] = useState<SocialNetwork | null>(null);
  const conectadas = useMemo(
    () =>
      new Set((canales.channels ?? []).filter((c) => c.status === "active").map((c) => c.network)),
    [canales.channels],
  );
  const primeraRed = [...conectadas][0] ?? null;

  async function conectar(red: SocialNetwork) {
    if (await conexion.iniciar()) setEsperando(red);
  }
  async function confirmarConexion() {
    const reclamadas = await conexion.confirmar();
    if (reclamadas.length > 0) {
      setEsperando(null);
      canales.refresh();
    }
  }
  function salirDeRedes(siguiente: number) {
    conexion.cancelar();
    setEsperando(null);
    setPaso(siguiente);
  }

  // ── Paso 5: Así suenas ──────────────────────────────────────────────────
  const [fase, setFase] = useState<FaseSuenas>("cargando");
  const [rasgos, setRasgos] = useState<string[]>([]);
  // Los rasgos con los que se escribió el post: si cambian, "Ajustar".
  const [rasgosDelPost, setRasgosDelPost] = useState<string[]>([]);
  const [post, setPost] = useState("");
  const [regenerando, setRegenerando] = useState(false);
  const [terminando, setTerminando] = useState(false);
  const [cuota, setCuota] = useState<QuotaStatusDto | null>(null);
  // Cada cierre lleva su turno: si empieza otro (cambió algo y volvió), la
  // respuesta del anterior se descarta (mismo patrón que UltimoEjemplo).
  const turno = useRef(0);
  // El cierre que ya arrancó (en curso o listo), por su llave: volver al paso
  // 5 sin cambiar nada no vuelve a pedir (ni a cobrar) nada. Volver ATRÁS no lo
  // cancela: lo que está en vuelo ya se está pagando, y al regresar se usa.
  const cierreIniciado = useRef<string | null>(null);
  // La voz que ya se guardó con éxito, por la misma llave: un reintento
  // después de un fallo del post no vuelve a destilar ni a guardar.
  const vozGuardada = useRef<string | null>(null);

  /** Todo lo que cambia la voz o el post: si algo de esto cambia, el cierre se rehace. */
  function llaveDelCierre(sinLasMuestras: boolean): string {
    return JSON.stringify({
      paso1: [datos.pais, datos.zona, datos.ciudad, nichosAGuardar(datos), datos.registro],
      evidencia: sinLasMuestras ? ["sin-muestras", datos.nunca.trim()] : llaveDe(datos),
    });
  }

  const limpios = (lista: string[]) => lista.map((r) => r.trim()).filter(Boolean);
  const rasgosCambiados = JSON.stringify(limpios(rasgos)) !== JSON.stringify(rasgosDelPost);

  /** Si fue la cuota, abre su modal. Devuelve si lo era. */
  function siEsCuota(e: unknown): boolean {
    const agotada = cuotaAgotadaDe(e);
    if (agotada) setCuota(agotada);
    return agotada !== null;
  }

  async function escribirPost(mio: number, conRasgos: string[]) {
    try {
      const ejemplo = await apiFetch<BrandVoiceExampleDto>("/api/brand-voice/ejemplo", {
        method: "POST",
      });
      if (mio !== turno.current) return;
      setPost(ejemplo.text);
      setRasgosDelPost(conRasgos);
      setFase("listo");
    } catch (e) {
      if (mio !== turno.current) return;
      siEsCuota(e);
      setFase("error-post");
    }
  }

  /** Guarda la voz de la evidencia. Devuelve los rasgos, o `null` si falló (ya avisó). */
  async function guardarVozDelCierre(
    mio: number,
    sinLasMuestras: boolean,
  ): Promise<string[] | null> {
    if (sinLasMuestras) {
      // Sin publicaciones no hay qué destilar, pero lo que dijo que nunca
      // diría sigue siendo suyo: entra como rasgo.
      const nunca = rasgoNunca(datos.nunca);
      const notas = nunca ? [nunca] : [];
      try {
        await apiFetch("/api/brand-voice", { method: "PATCH", body: { styleNotes: notas } });
        return notas;
      } catch (e) {
        if (mio === turno.current) {
          siEsCuota(e);
          setFase("error-post");
        }
        return null;
      }
    }

    let voz: VozDestiladaDto;
    try {
      voz = await destilar();
    } catch (e) {
      // Solo si falló destilar se tira la promesa: la próxima vez se pide.
      destilado.current = null;
      if (mio === turno.current) {
        siEsCuota(e);
        setFase("error-lectura");
      }
      return null;
    }
    try {
      // El registro NO se toca: lo eligió explícito en el paso 1. Lo que sale
      // de la evidencia son los rasgos, los modismos y sus ejemplos.
      await apiFetch("/api/brand-voice", {
        method: "PATCH",
        body: {
          styleNotes: voz.styleNotes,
          referenceExamples: muestrasUtiles(datos.muestras)
            .slice(0, 2)
            .map((text) => ({ text })),
          allowedExpressions: voz.allowedExpressions,
          bannedExpressions: voz.bannedExpressions,
          useAnglicisms: voz.useAnglicisms,
          preferredCtas: voz.preferredCtas,
          keyTopics: voz.keyTopics,
        },
      });
      return voz.styleNotes;
    } catch (e) {
      // Destilar sí salió (y se pagó): la promesa se queda, y el reintento
      // solo vuelve a guardar.
      if (mio === turno.current) {
        siEsCuota(e);
        setFase("error-lectura");
      }
      return null;
    }
  }

  async function cerrar(sinLasMuestras: boolean) {
    const mio = ++turno.current;
    const llave = llaveDelCierre(sinLasMuestras);
    cierreIniciado.current = llave;
    setFase("cargando");

    let notas: string[];
    if (vozGuardada.current === llave) {
      notas = limpios(rasgos);
    } else {
      const guardadas = await guardarVozDelCierre(mio, sinLasMuestras);
      if (guardadas === null) {
        if (mio === turno.current) cierreIniciado.current = null;
        return;
      }
      vozGuardada.current = llave;
      if (mio !== turno.current) return;
      notas = guardadas;
      setRasgos(notas);
    }
    await escribirPost(mio, notas);
  }

  function entrarAlCierre() {
    setPaso(4);
    const iniciado = cierreIniciado.current === llaveDelCierre(sinMuestras);
    if (iniciado && (fase === "listo" || fase === "cargando")) return;
    void cerrar(sinMuestras);
  }

  // ── Paso 4 ──────────────────────────────────────────────────────────────
  async function guardarMetas() {
    // En `extras.goals`, con sus palabras: de ahí se deriva el Modo.
    const metas = METAS.filter((m) => datos.metas.includes(m.id)).map((m) => m.label);
    setError(null);
    setGuardando(true);
    try {
      await apiFetch("/api/brand-voice", { method: "PATCH", body: { extras: { goals: metas } } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : ERROR_GENERICO);
      return;
    } finally {
      setGuardando(false);
    }
    entrarAlCierre();
  }

  async function ajustar() {
    const mio = ++turno.current;
    const nuevos = limpios(rasgos);
    setError(null);
    setRegenerando(true);
    try {
      await apiFetch("/api/brand-voice", { method: "PATCH", body: { styleNotes: nuevos } });
      setRasgos(nuevos);
      await escribirPost(mio, nuevos);
    } catch (e) {
      if (!siEsCuota(e)) setError("No pudimos guardar tus rasgos. Inténtalo de nuevo.");
    } finally {
      if (mio === turno.current) setRegenerando(false);
    }
  }

  async function terminar(conPost: boolean) {
    setTerminando(true);
    try {
      // Rasgos editados sin "Ajustar" (o con un "Ajustar" cuyo post falló):
      // igual son su voz, se guardan.
      if (!sinMuestras && vozGuardada.current !== null && rasgosCambiados) {
        await apiFetch("/api/brand-voice", {
          method: "PATCH",
          body: { styleNotes: limpios(rasgos) },
        });
      }
      await apiFetch("/api/me/complete-onboarding", { method: "POST" });
      // Sin esto, protected.tsx sigue viendo onboardingCompletedAt: null en
      // el cache de la sesión y rebota de vuelta a /onboarding.
      await refetch();
      void navigate("/chats", {
        replace: true,
        state: { propuesta: propuestaDePrimerPost(conPost ? post : null, primeraRed) },
      });
    } catch (e) {
      setTerminando(false);
      setError(e instanceof ApiError ? e.message : ERROR_GENERICO);
    }
  }

  function seguirSinEsto() {
    if (fase === "error-lectura") {
      setSinMuestras(true);
      void cerrar(true);
    } else {
      void terminar(false);
    }
  }

  // Rehace solo lo que falta: si la voz ya se guardó, solo el post (la llave
  // de `vozGuardada` lo decide dentro de `cerrar`).
  function reintentar() {
    void cerrar(sinMuestras);
  }

  function volverDelCierre() {
    // Lo que esté en vuelo NO se cancela: ya se está pagando, y si vuelve
    // sin cambiar nada, entrarAlCierre lo usa en vez de pedir otro.
    setPaso(3);
  }

  return (
    <AuthShell tarjeta="max-w-[480px] min-[521px]:min-h-[640px]">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-fg">
          <IsotipoGlyph className="size-4" />
        </span>
        <span className="font-display text-base font-bold text-brand">Presencia</span>
      </div>
      <Stepper paso={paso} />

      <div key={paso} className="flex flex-1 animate-[aparecer_200ms_ease-out] flex-col gap-5">
        {paso === 0 && (
          <PasoHablas
            datos={datos}
            onCambiar={cambiar}
            onSiguiente={() => void guardarVoz()}
            guardando={guardando}
            error={error}
          />
        )}
        {paso === 1 && (
          <PasoEscribes
            datos={datos}
            onCambiar={cambiar}
            onAtras={() => setPaso(0)}
            onSiguiente={() => {
              setSinMuestras(false);
              void destilar();
              setPaso(2);
            }}
            onSinMuestras={() => {
              setSinMuestras(true);
              setPaso(2);
            }}
          />
        )}
        {paso === 2 && (
          <PasoRedes
            conectadas={conectadas}
            esperando={esperando}
            mensaje={conexion.mensaje}
            ocupado={conexion.ocupado}
            onConectar={(red) => void conectar(red)}
            onConfirmar={() => void confirmarConexion()}
            onCancelar={() => {
              conexion.cancelar();
              setEsperando(null);
            }}
            onSiguiente={() => salirDeRedes(3)}
            onAtras={() => salirDeRedes(1)}
          />
        )}
        {paso === 3 && (
          <PasoMetas
            datos={datos}
            onCambiar={cambiar}
            onAtras={() => setPaso(2)}
            onSiguiente={() => void guardarMetas()}
            onSaltar={entrarAlCierre}
            guardando={guardando}
            error={error}
          />
        )}
        {paso === 4 && (
          <>
            <PasoSuenas
              fase={fase}
              sinMuestras={sinMuestras}
              rasgos={rasgos}
              rasgosCambiados={rasgosCambiados}
              post={post}
              red={primeraRed}
              regenerando={regenerando}
              terminando={terminando}
              onCambiarRasgos={setRasgos}
              onAjustar={() => void ajustar()}
              onReintentar={reintentar}
              onSeguirSin={seguirSinEsto}
              onTerminar={() => void terminar(fase === "listo")}
              onAtras={volverDelCierre}
            />
            {error && (
              <p role="alert" className="text-center text-sm text-error-fg">
                {error}
              </p>
            )}
          </>
        )}
      </div>

      {cuota && <QuotaExhaustedModal quota={cuota} onDismiss={() => setCuota(null)} />}
    </AuthShell>
  );
}
