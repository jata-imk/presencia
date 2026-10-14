import { ArrowLeft, CheckCircle2, Lock, Mail, RefreshCw } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  AUTH_LINK,
  AuthBanner,
  AuthFooter,
  AuthHeading,
  AuthShell,
  AuthSubmit,
} from "../components/auth/AuthShell.js";
import { AuthField } from "../components/auth/AuthField.js";
import { CodeInput, LARGO_DEL_CODIGO } from "../components/auth/CodeInput.js";
import { PasswordStrength } from "../components/auth/PasswordStrength.js";
import { authClient } from "../lib/auth-client.js";
import { esperaDe429, minutosYSegundos, useEspera } from "../lib/auth/use-espera.js";
import { errorDeCorreo, fuerzaDeContrasena } from "../lib/auth/validar.js";

// Recuperar la contraseña con un código (F10.8.4, Auth Flow.html): correo →
// código → contraseña nueva → listo. El código se valida al cambiar la
// contraseña, no en su propio paso: el endpoint que lo revisaba solo
// ("check-verification-otp") dice "usuario no encontrado" para un correo sin
// cuenta, y dejaría averiguar quién está registrado (apps/api/src/auth/auth.ts).
// Si el código estaba mal, se regresa a su paso con lo que queda de intentos
// y la contraseña ya escrita: al corregirlo, se cambia sin volver a escribirla.

type Paso = "correo" | "codigo" | "contrasena" | "listo";
type EstadoDelCodigo = null | "incorrecto" | "expirado" | "bloqueado";

const INTENTOS = 3;
const MAXIMO_CONTRASENA = 128;
const ESPERA_PARA_REENVIAR = 60;
const PASOS: Paso[] = ["correo", "codigo", "contrasena"];

/** "a***@dominio.com": que se reconozca sin mostrarlo entero. */
export function enmascararCorreo(correo: string): string {
  const [usuario = "", dominio = ""] = correo.split("@");
  return `${usuario.slice(0, 1)}***@${dominio}`;
}

/** Los puntos de arriba: en qué paso va, sin contar "listo". */
function Pasos({ paso }: { paso: Paso }) {
  const actual = PASOS.indexOf(paso);
  if (actual < 0) return null;
  return (
    <div className="flex items-center gap-1.5" aria-label={`Paso ${String(actual + 1)} de 3`}>
      {PASOS.map((p, i) => (
        <span
          key={p}
          className={`h-1.75 rounded-full transition-all duration-300 ${
            i === actual
              ? "w-5 bg-primary"
              : i < actual
                ? "w-1.75 bg-fg-secondary"
                : "w-1.75 bg-line"
          }`}
        />
      ))}
    </div>
  );
}

function Volver({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 self-start font-display text-[13px] font-medium text-fg-secondary hover:text-brand"
    >
      <ArrowLeft size={15} aria-hidden />
      {children}
    </button>
  );
}

function Icono({ tono, children }: { tono: "plum" | "info" | "ok"; children: ReactNode }) {
  const clase = {
    plum: "size-13 rounded-[14px] bg-tint-plum text-fg-secondary",
    info: "size-13 rounded-[14px] bg-info-bg text-info-fg",
    ok: "size-18 rounded-full border-2 border-success-border bg-success-bg text-success-fg",
  }[tono];
  return <span className={`flex shrink-0 items-center justify-center ${clase}`}>{children}</span>;
}

export function RecuperarPage() {
  const navigate = useNavigate();
  const desdeLogin = (useLocation().state as { email?: string } | null)?.email ?? "";
  const { refetch: refrescarSesion } = authClient.useSession();

  const [paso, setPaso] = useState<Paso>("correo");
  const [email, setEmail] = useState(desdeLogin);
  const [errorCorreo, setErrorCorreo] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [estadoCodigo, setEstadoCodigo] = useState<EstadoDelCodigo>(null);
  const [fallos, setFallos] = useState(0);
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [reenviarEn, esperarReenvio] = useEspera();
  // El 429 de Better Auth (3 códigos por minuto, 3 intentos cada 10 s): el
  // aviso lleva la cuenta regresiva y los botones esperan con él.
  const [limite, esperarLimite] = useEspera();

  async function pedirCodigo(correo: string): Promise<boolean> {
    setError(null);
    setOcupado(true);
    let espera: number | null = null;
    const { error } = await authClient.emailOtp.requestPasswordReset(
      { email: correo },
      { onError: ({ response }) => void (espera = esperaDe429(response, ESPERA_PARA_REENVIAR)) },
    );
    setOcupado(false);
    if (espera !== null) {
      esperarLimite(espera);
      return false;
    }
    if (error) {
      setError("No pudimos mandar el código. Inténtalo de nuevo en un momento.");
      return false;
    }
    setCodigo("");
    setFallos(0);
    setEstadoCodigo(null);
    esperarReenvio(ESPERA_PARA_REENVIAR);
    return true;
  }

  function enviarCorreo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const correo = email.trim();
    const problema = errorDeCorreo(correo);
    setErrorCorreo(problema);
    if (problema) return;
    void pedirCodigo(correo).then((ok) => ok && setPaso("codigo"));
  }

  function codigoCompleto(code: string) {
    setEstadoCodigo(null);
    // Si ya había contraseña (el código anterior estaba mal), se cambia ya.
    if (contrasenaLista(password, confirmacion)) void cambiar(code);
    else setPaso("contrasena");
  }

  async function cambiar(code = codigo) {
    setError(null);
    setOcupado(true);
    let espera: number | null = null;
    const { error } = await authClient.emailOtp.resetPassword(
      { email: email.trim(), otp: code, password },
      { onError: ({ response }) => void (espera = esperaDe429(response, 10)) },
    );
    if (espera !== null || error) {
      setOcupado(false);
      const codigoDeError = (error as { code?: string } | null)?.code;
      if (codigoDeError === "INVALID_OTP" && espera === null) {
        const nuevos = fallos + 1;
        setFallos(nuevos);
        setEstadoCodigo(nuevos >= INTENTOS ? "bloqueado" : "incorrecto");
        setCodigo("");
        setPaso("codigo");
        return;
      }
      if (codigoDeError === "TOO_MANY_ATTEMPTS" || codigoDeError === "OTP_EXPIRED") {
        setEstadoCodigo(codigoDeError === "OTP_EXPIRED" ? "expirado" : "bloqueado");
        setCodigo("");
        setPaso("codigo");
        return;
      }
      // Lo demás se corrige o se reintenta desde la contraseña, también si
      // venía del cambio automático al corregir el código: en el paso del
      // código no habría forma de volver a mandarlo.
      if (espera !== null) esperarLimite(espera);
      else setError("No pudimos cambiar la contraseña. Inténtalo de nuevo en un momento.");
      setPaso("contrasena");
      return;
    }
    // Contraseña cambiada (y las otras sesiones cerradas): se entra con la
    // nueva y se espera la sesión, como en el login. Si entrar falla (el
    // límite de intentos, la red), el login dice que la contraseña sí cambió.
    const entrada = await authClient.signIn.email({ email: email.trim(), password });
    if (entrada.error) {
      void navigate("/login", {
        replace: true,
        state: { email: email.trim(), contrasenaCambiada: true },
      });
      return;
    }
    await refrescarSesion();
    setOcupado(false);
    setPaso("listo");
  }

  const avisoDeLimite = limite > 0 && (
    <AuthBanner tone="warning" title="Demasiados intentos">
      Por seguridad, espera <strong className="tabular-nums">{minutosYSegundos(limite)}</strong>{" "}
      antes de volver a intentarlo.
    </AuthBanner>
  );

  return (
    <AuthShell above={<Pasos paso={paso} />}>
      {paso === "correo" && (
        <>
          <Volver onClick={() => void navigate("/login")}>Volver a iniciar sesión</Volver>
          <div className="flex flex-col gap-4">
            <Icono tono="plum">
              <Lock size={24} strokeWidth={1.6} aria-hidden />
            </Icono>
            <AuthHeading
              align="start"
              title="Recuperar contraseña"
              subtitle="Te mandamos un código a tu correo para que vuelvas a entrar."
            />
          </div>
          <form onSubmit={enviarCorreo} noValidate className="flex flex-col gap-4">
            {avisoDeLimite || (error && <AuthBanner tone="error">{error}</AuthBanner>)}
            <AuthField
              label="Correo"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="tu@correo.com"
              autoFocus
              value={email}
              error={errorCorreo}
              onChange={(e) => {
                setEmail(e.currentTarget.value);
                if (errorCorreo) setErrorCorreo(null);
              }}
            />
            <AuthSubmit loading={ocupado} disabled={limite > 0}>
              {ocupado ? "Enviando…" : "Enviar código"}
            </AuthSubmit>
          </form>
          <AuthFooter>
            ¿Ya la recordaste?{" "}
            <Link to="/login" className={AUTH_LINK}>
              Inicia sesión
            </Link>
          </AuthFooter>
        </>
      )}

      {paso === "codigo" && (
        <>
          <Volver onClick={() => setPaso("correo")}>Cambiar correo</Volver>
          <div className="flex flex-col gap-4">
            <Icono tono="info">
              <Mail size={24} strokeWidth={1.6} aria-hidden />
            </Icono>
            <AuthHeading
              align="start"
              title="Revisa tu correo"
              subtitle={
                <>
                  Si existe una cuenta con{" "}
                  <strong className="text-brand">{enmascararCorreo(email.trim())}</strong>, te
                  mandamos un código de 6 dígitos. Expira en 10 minutos.
                </>
              }
            />
          </div>
          <div className="flex flex-col gap-4">
            <CodeInput
              value={codigo}
              onChange={(code) => {
                setCodigo(code);
                if (estadoCodigo === "incorrecto") setEstadoCodigo(null);
              }}
              onComplete={codigoCompleto}
              disabled={ocupado || estadoCodigo === "bloqueado" || estadoCodigo === "expirado"}
              tono={estadoCodigo === "incorrecto" ? "error" : "neutro"}
              autoFocus
            />
            {ocupado && (
              <p className="flex items-center justify-center gap-2 text-[13px] text-fg-secondary">
                <span
                  aria-hidden
                  className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
                Revisando el código…
              </p>
            )}
            {avisoDeLimite || (error && <AuthBanner tone="error">{error}</AuthBanner>)}
            {estadoCodigo === "incorrecto" && (
              <AuthBanner tone="error">
                Código incorrecto. Te{" "}
                {INTENTOS - fallos === 1
                  ? "queda 1 intento"
                  : `quedan ${String(INTENTOS - fallos)} intentos`}
                .
              </AuthBanner>
            )}
            {estadoCodigo === "expirado" && (
              <AuthBanner tone="warning">
                El código expiró. Pide uno nuevo para continuar.
              </AuthBanner>
            )}
            {estadoCodigo === "bloqueado" && (
              <AuthBanner tone="error">
                Demasiados intentos con este código. Pide uno nuevo para continuar.
              </AuthBanner>
            )}
            <div className="flex flex-col items-center gap-1.5 pt-1">
              {estadoCodigo === "bloqueado" || estadoCodigo === "expirado" ? (
                <button
                  type="button"
                  disabled={ocupado || reenviarEn > 0 || limite > 0}
                  onClick={() => void pedirCodigo(email.trim())}
                  className="rounded-[10px] bg-primary px-6 py-2.5 font-display text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {reenviarEn > 0
                    ? `Pide uno nuevo en ${minutosYSegundos(reenviarEn)}`
                    : "Pedir un código nuevo"}
                </button>
              ) : (
                <>
                  <span className="text-[13px] text-fg-muted">¿No te llegó?</span>
                  <button
                    type="button"
                    disabled={ocupado || reenviarEn > 0 || limite > 0}
                    onClick={() => void pedirCodigo(email.trim())}
                    className="flex items-center gap-1.5 px-2 py-1 font-display text-[13px] font-semibold text-brand disabled:cursor-not-allowed disabled:text-fg-muted"
                  >
                    <RefreshCw size={13} aria-hidden />
                    {reenviarEn > 0
                      ? `Reenviar en ${minutosYSegundos(reenviarEn)}`
                      : "Reenviar código"}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {paso === "contrasena" && (
        <>
          <Volver onClick={() => setPaso("codigo")}>Volver</Volver>
          <div className="flex flex-col gap-4">
            <Icono tono="plum">
              <Lock size={24} strokeWidth={1.6} aria-hidden />
            </Icono>
            <AuthHeading
              align="start"
              title="Crea tu nueva contraseña"
              subtitle="Que sea fácil de recordar para ti y difícil de adivinar para los demás."
            />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (contrasenaLista(password, confirmacion) && codigo.length === LARGO_DEL_CODIGO) {
                void cambiar();
              }
            }}
            noValidate
            className="flex flex-col gap-4"
          >
            {avisoDeLimite || (error && <AuthBanner tone="error">{error}</AuthBanner>)}
            <div className="flex flex-col gap-2">
              <AuthField
                label="Nueva contraseña"
                type="password"
                name="new-password"
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                error={
                  password.length > MAXIMO_CONTRASENA
                    ? "Es demasiado larga: usa máximo 128 caracteres."
                    : null
                }
              />
              <PasswordStrength password={password} />
            </div>
            <AuthField
              label="Confirma la contraseña"
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              placeholder="Escríbela otra vez"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.currentTarget.value)}
              error={
                confirmacion && confirmacion !== password ? "Las contraseñas no coinciden." : null
              }
              trailing={
                confirmacion && confirmacion === password ? (
                  <CheckCircle2 size={17} aria-hidden className="text-success-fg" />
                ) : null
              }
            />
            <p className="flex items-start gap-2 rounded-[10px] border border-line-subtle bg-secondary px-3 py-2.5 text-xs leading-snug text-fg-secondary">
              <Lock size={14} aria-hidden className="mt-px shrink-0" />
              No la uses en otras cuentas: es lo que protege tu marca si alguna otra se filtra.
            </p>
            <AuthSubmit
              loading={ocupado}
              disabled={limite > 0 || !contrasenaLista(password, confirmacion)}
            >
              {ocupado ? "Cambiando tu contraseña…" : "Cambiar contraseña"}
            </AuthSubmit>
          </form>
        </>
      )}

      {paso === "listo" && <Listo onIr={() => void navigate("/chats", { replace: true })} />}
    </AuthShell>
  );
}

/** Mínimo "Buena" (Auth Flow.html): 8 caracteres y dos criterios más, y que coincida. */
function contrasenaLista(password: string, confirmacion: string): boolean {
  const { criterios, puntos } = fuerzaDeContrasena(password);
  // Máximo 128 como el servidor: allá el código se gasta ANTES de revisar el
  // largo, y una contraseña rechazada dejaría el código bueno inservible.
  return (
    criterios.largo &&
    puntos >= 3 &&
    password.length <= MAXIMO_CONTRASENA &&
    password === confirmacion
  );
}

const ESPERA_LISTO_MS = 3000;

function Listo({ onIr }: { onIr: () => void }) {
  const [lleno, setLleno] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setLleno(true));
    const id = setTimeout(onIr, ESPERA_LISTO_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(id);
    };
  }, []);
  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <Icono tono="ok">
        <CheckCircle2 size={36} strokeWidth={1.6} aria-hidden />
      </Icono>
      <AuthHeading
        title="¡Listo, cambiaste tu contraseña!"
        subtitle="Ya entraste. Te llevamos a tus chats…"
      />
      <div className="h-1 w-full overflow-hidden rounded-full bg-line" aria-hidden>
        <div
          className="h-full rounded-full bg-primary ease-linear"
          style={{
            width: lleno ? "100%" : "0%",
            transition: `width ${String(ESPERA_LISTO_MS)}ms linear`,
          }}
        />
      </div>
      <button
        type="button"
        onClick={onIr}
        className="h-12 w-full rounded-[10px] bg-primary font-display text-[15px] font-semibold text-primary-fg hover:bg-primary-hover"
      >
        Ir a mis chats ahora
      </button>
    </div>
  );
}
